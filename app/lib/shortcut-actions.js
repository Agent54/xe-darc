export function getShortcutTab(data, tabId = data.spaceMeta.activeTabId) {
    let tab = data.docs[tabId]
    const visited = new Set()
    while (tab && !visited.has(tab.id)) {
        visited.add(tab.id)
        const child = data.docs[data.previews[tab.id]?.lightbox]
        if (!child || child.archive) break
        tab = child
    }
    return tab
}

export function createShortcutActions(data, ui) {
    function closeLightbox(tab) {
        if (!tab?.lightbox || tab.archive) return false
        const opener = data.docs[tab.opener]
        if (data.previews[tab.opener]?.lightbox === tab.id) data.previews[tab.opener].lightbox = null
        data.closeTab(tab.spaceId, tab.id)
        ui.focusTab?.(opener?.id)
        return true
    }

    return function runShortcut(id, event, sourceTabId) {
        const tab = getShortcutTab(data, sourceTabId || data.spaceMeta.activeTabId)
        if (id.startsWith('space-')) {
            const spaceId = data.spaceMeta.spaceOrder[Number(id.slice(6)) - 1]
            const space = data.spaces[spaceId]
            if (!space) return true
            ui.dismissHovercards()
            data.activateSpace(spaceId)
            const candidates = space.tabs.filter(tab => tab.type === 'tab' && !tab.pinned && !tab.archive && !tab.preview && !tab.lightbox)
            const recent = (space.activeTabsOrder || []).map(entry => typeof entry === 'string' ? entry : entry.id)
                .map(id => candidates.find(tab => tab.id === id)).find(Boolean)
            if (recent || candidates[0]) ui.activateTab(recent || candidates[0])
            return true
        }
        switch (id) {
            case 'new-tab': ui.openNewTab(); break
            case 'new-tab-group': ui.openNewTabGroup(); break
            case 'show-shortcuts': ui.showShortcuts(true); break
            case 'hide-shortcuts': ui.showShortcuts(false); break
            case 'close-tab':
                if (!closeLightbox(tab) && tab) ui.closeTab(tab, event)
                break
            case 'restore-tab': {
                const closed = data.spaceMeta.closedTabs.find(tab => !tab.deleted && data.spaces[tab.spaceId])
                if (closed) data.restoreClosedTab(closed.id)
                break
            }
            case 'reload-tab': if (tab) data.reloadTab(tab.id); break
            case 'reset-zoom':
                if (tab) data.frames[tab.id]?.frame?.setZoom?.(1)?.catch(error => console.warn('Could not reset tab zoom', error))
                break
            case 'open-location': if (tab) ui.openLocation(tab); break
            case 'previous-active-tab':
                ui.dismissHovercards()
                if (ui.previousActiveTab) ui.previousActiveTab()
                else data.previous()
                break
            case 'finish-tab-switch': ui.finishTabSwitch?.(); break
            case 'previous-tab':
            case 'next-tab': {
                const tabs = ui.getTabs()
                if (!tabs.length) break
                const current = tabs.findIndex(tab => tab.id === data.spaceMeta.activeTabId)
                const offset = id === 'next-tab' ? 1 : -1
                const index = current < 0 ? (offset > 0 ? 0 : tabs.length - 1) : (current + offset + tabs.length) % tabs.length
                ui.dismissHovercards()
                ui.activateTab(tabs[index])
                break
            }
            case 'pin-left':
            case 'pin-right':
                if (tab && !tab.lightbox && !tab.preview) data.pin({ tabId: tab.id, pinned: id === 'pin-left' ? 'left' : 'right' })
                break
            case 'escape':
                if (ui.escape(event)) break
                return closeLightbox(tab)
            case 'overview': ui.showOverview(); break
            default: return false
        }
        return true
    }
}

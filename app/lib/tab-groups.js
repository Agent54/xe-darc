export function isOpenTab (tab) {
    return tab.type === 'tab' && !tab.archive && !tab.preview && !tab.lightbox && !tab.pinned
}

export function tabGroupKey (tab) {
    return tab.tabGroupId ? `group:${tab.tabGroupId}` : `tab:${tab.id}`
}

export function tabGroupMetadataId (tabGroupId) {
    return `darc:tabgroup_${tabGroupId}`
}

export function getTabGroupPreviewTabs (tabs, activeTabId) {
    const activeIndex = Math.max(0, tabs.findIndex(tab => tab.id === activeTabId))
    const start = Math.max(0, Math.min(activeIndex - 1, tabs.length - 3))
    return tabs.slice(start, start + 3)
}

export function getTabGroups (items = [], activeTabIds = [], docs = {}) {
    const groups = new Map()
    for (const tab of items.filter(isOpenTab)) {
        const key = tabGroupKey(tab)
        if (!groups.has(key)) {
            groups.set(key, { id: key, tabGroupId: tab.tabGroupId || null, order: tab.order ?? 0, tabs: [] })
        }
        const group = groups.get(key)
        group.order = Math.min(group.order, tab.order ?? 0)
        group.tabs.push(tab)
    }
    return [...groups.values()].map(group => {
        group.tabs.sort((a, b) => (a.tabGroupOrder ?? a.order ?? 0) - (b.tabGroupOrder ?? b.order ?? 0) || a.id.localeCompare(b.id))
        if (group.tabs.length === 1) {
            group.id = `tab:${group.tabs[0].id}`
            group.tabGroupId = null
        }
        const activeTabId = activeTabIds.find(id => group.tabs.some(tab => tab.id === id))
        group.previewTabs = getTabGroupPreviewTabs(group.tabs, activeTabId)
        const metadata = group.tabGroupId ? docs[tabGroupMetadataId(group.tabGroupId)] : null
        group.metadata = metadata && !metadata.archive && !metadata._deleted ? metadata : null
        group.name = group.metadata?.name?.trim() || null
        group.title = group.name || group.previewTabs.map(tab => tab.title || tab.url || 'New tab').join(' · ')
        return group
    }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

export function getSidebarItems (items = [], activeTabIds = [], docs = {}) {
    return [...getTabGroups(items, activeTabIds, docs), ...items.filter(item => item.type === 'divider')]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function getTabGroup (items, tabId, activeTabIds = [], docs = {}) {
    return getTabGroups(items, activeTabIds, docs).find(group => group.tabs.some(tab => tab.id === tabId)) || null
}

export function orderBetween (before, after, field = 'order') {
    const first = before?.[field] ?? before?.order
    const second = after?.[field] ?? after?.order
    if (first != null && second != null) {
        return (first + second) / 2
    }
    if (first != null) {
        return first + 1
    }
    if (second != null) {
        return second - 1
    }
    return 0
}

export function groupCanvasPosition (members, spaceId) {
    const positioned = members.map(tab => tab.canvas?.[spaceId]).filter(canvas => Number.isFinite(canvas?.x) && Number.isFinite(canvas?.y))
    if (!positioned.length) {
        return null
    }
    return {
        x: Math.max(...positioned.map(canvas => canvas.x + (canvas.width || 1000))) + 80,
        y: positioned[0].y, width: 1000, height: 700
    }
}

export function addTabGroupFrames (elements, groups) {
    const byId = new Map(elements.map(element => [element.id, { ...element }]))
    const frames = []
    for (const group of groups.filter(group => group.tabGroupId)) {
        const members = group.tabs.map(tab => byId.get(tab.id)).filter(Boolean)
        if (!members.length) continue
        const id = `tab-group-frame:${group.tabGroupId}`
        const x = Math.min(...members.map(element => element.x)) - 32
        const y = Math.min(...members.map(element => element.y)) - 48
        for (const member of members) {
            member.frameId = id
        }
        frames.push({
            id, type: 'frame', name: group.title, x, y,
            width: Math.max(...members.map(element => element.x + element.width)) - x + 32,
            height: Math.max(...members.map(element => element.y + element.height)) - y + 32,
            angle: 0, strokeColor: '#737373', backgroundColor: 'transparent', fillStyle: 'solid',
            strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100, groupIds: [], frameId: null,
            roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null,
            updated: 1, link: null, locked: false, customData: { virtualTabGroup: true }
        })
    }
    return [...frames, ...byId.values()]
}

// Both sidebar and top-bar drops describe neighbors in sidebar order.
export function planTabMove (sourceItems, targetItems, tabId, { targetSpaceId, targetGroupTabId, beforeTabId, afterTabId, scope = 'tab' }, createGroupId) {
    const tab = sourceItems.find(item => item.id === tabId)
    if (!tab || tab.type !== 'tab') {
        return []
    }
    const sourceGroup = getTabGroup(sourceItems, tabId)
    const moving = scope === 'group' && sourceGroup ? sourceGroup.tabs : [tab]
    const movingIds = new Set(moving.map(item => item.id))
    const targetGroup = getTabGroup(targetItems, targetGroupTabId)
    const updates = []
    if (targetGroup) {
        const remaining = targetGroup.tabs.filter(item => !movingIds.has(item.id))
        if (!remaining.length) {
            return []
        }
        const groupId = targetGroup.tabs[0].tabGroupId || createGroupId()
        const beforeIndex = remaining.findIndex(item => item.id === beforeTabId)
        const afterIndex = remaining.findIndex(item => item.id === afterTabId)
        const insertIndex = afterIndex !== -1 ? afterIndex : beforeIndex !== -1 ? beforeIndex + 1 : remaining.length
        const members = [...remaining.slice(0, insertIndex), ...moving, ...remaining.slice(insertIndex)]
        const targetGroups = getTabGroups(targetItems.filter(item => !movingIds.has(item.id)))
        const targetIndex = targetGroups.findIndex(group => group.tabs.some(tab => tab.id === targetGroupTabId))
        const placement = sourceGroup?.id !== targetGroup.id || tab.spaceId !== targetSpaceId ? groupCanvasPosition(remaining, targetSpaceId) || {
            x: 200 + remaining.length * 1080, y: 200 + Math.max(0, targetIndex) * 860, width: 1000, height: 700
        } : null
        members.forEach((member, index) => updates.push({
            id: member.id, tabGroupId: groupId, order: targetGroup.order, tabGroupOrder: index,
            ...(movingIds.has(member.id) ? { spaceId: targetSpaceId, pinned: null } : {}),
            ...(placement && movingIds.has(member.id) ? { canvas: { ...member.canvas, [targetSpaceId]: { ...placement, x: placement.x + moving.findIndex(tab => tab.id === member.id) * 1080 } } } : {})
        }))
    } else {
        const entries = getSidebarItems(targetItems).filter(item => !item.tabs?.every(member => movingIds.has(member.id)))
        const neighbor = id => entries.find(item => item.tabs?.some(member => member.id === id) || item.id === id)
        const order = orderBetween(neighbor(beforeTabId), neighbor(afterTabId))
        moving.forEach(member => updates.push({
            id: member.id, spaceId: targetSpaceId, pinned: null, order,
            tabGroupId: scope === 'group' ? member.tabGroupId || null : null,
            tabGroupOrder: scope === 'group' ? member.tabGroupOrder ?? member.order : null
        }))
    }
    return updates
}

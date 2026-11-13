// Preserve visits, including repeated visits to the same tab, in activation order.
export function getTabActivationHistory(data, spaceId = data.spaceMeta.activeSpace) {
    const space = data.spaces[spaceId]
    return (space?.activeTabsOrder || []).flatMap((entry, index) => {
        const id = typeof entry === 'string' ? entry : entry?.id
        const tab = data.docs[id]
        if (!tab || tab.pinned || tab.archive || tab.preview || tab.lightbox ||
            !space.tabs?.some(member => member.id === id)) return []
        return [{ id, tab, index, activatedAt: entry?.activatedAt || entry?.lastActiveAt || 0, spaceId }]
    })
}

export function createTabHistorySwitcher(data, onChange, { schedule = setTimeout, cancel = clearTimeout } = {}) {
    let session = null
    let timer = null

    function finish() {
        cancel(timer)
        timer = null
        session = null
        onChange(null)
    }

    function previous() {
        if (session && session.spaceId !== data.spaceMeta.activeSpace) finish()
        if (!session) {
            const entries = getTabActivationHistory(data)
            const currentId = data.spaceMeta.activeTabId
            // Keep the first switch identical to the existing active-tab action.
            if (data.previous() === false) return
            const index = entries.findIndex(entry => entry.id !== currentId && entry.id === data.spaceMeta.activeTabId)
            if (index < 0) return
            session = { entries, index, spaceId: data.spaceMeta.activeSpace, visible: false }
            onChange({ ...session })
            timer = schedule(() => {
                timer = null
                if (!session) return
                session.visible = true
                onChange({ ...session })
            }, 500)
            return
        }

        for (let index = session.index + 1; index < session.entries.length; index++) {
            const entry = session.entries[index]
            const tab = data.docs[entry.id]
            if (entry.id === data.spaceMeta.activeTabId || !tab || tab.archive || tab.pinned ||
                tab.preview || tab.lightbox || !data.spaces[session.spaceId]?.tabs.some(member => member.id === entry.id)) continue
            session.index = index
            data.activate(entry.id)
            onChange({ ...session })
            return
        }
    }

    return { previous, finish }
}

const PREVIEW_DELAY = 700
const RESET_DELAY = 2000

export function getDefaultGroupTabIndex (tabs, preferredTabIds = []) {
    for (const id of preferredTabIds) {
        if (!id) continue
        const index = tabs.findIndex(tab => tab.id === id)
        if (index !== -1) return index
    }
    return 0
}

export function getFaviconWindow (tabCount, progress = 0, maxVisible = 3) {
    const visible = Math.min(maxVisible, tabCount)
    const position = Math.max(0, Math.min(1, progress)) * Math.max(0, tabCount - visible)
    const start = Math.floor(position)
    return { start, end: Math.min(tabCount, start + visible + (position > start ? 1 : 0)), offset: position - start, visible }
}

export function createTabGroupPreview () {
    const state = $state({ groupId: null, tabIndex: 0, progress: 0 })
    let warm = false
    let hoveredGroup = null
    let pending = null
    let previewTimer = null
    let resetTimer = null

    function leaveStrip (groupId) {
        if (pending?.groupId !== groupId) return
        clearTimeout(previewTimer)
        previewTimer = null
        pending = null
    }

    function enter (groupId) {
        clearTimeout(resetTimer)
        resetTimer = null
        if (hoveredGroup !== groupId) {
            leaveStrip(pending?.groupId)
            state.groupId = null
        }
        hoveredGroup = groupId
    }

    function show () {
        if (!pending || hoveredGroup !== pending.groupId) return
        warm = true
        state.groupId = pending.groupId
        state.progress = pending.progress
        state.tabIndex = Math.min(pending.tabCount - 1, Math.floor(pending.progress * pending.tabCount))
    }

    function move (groupId, progress, tabCount) {
        enter(groupId)
        if (!tabCount) return
        pending = { groupId, progress: Math.max(0, Math.min(1, progress)), tabCount }
        if (warm) show()
        else if (previewTimer === null) {
            previewTimer = setTimeout(() => { previewTimer = null; show() }, PREVIEW_DELAY)
        }
    }

    function leave (groupId) {
        if (hoveredGroup !== groupId) return
        leaveStrip(groupId)
        hoveredGroup = null
        state.groupId = null
        clearTimeout(resetTimer)
        resetTimer = setTimeout(() => { warm = false; resetTimer = null }, RESET_DELAY)
    }

    function destroy () {
        clearTimeout(previewTimer)
        clearTimeout(resetTimer)
    }

    return { state, enter, move, leaveStrip, leave, destroy }
}

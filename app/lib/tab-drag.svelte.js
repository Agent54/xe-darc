// Shared tab drag-and-drop state
// Used by both App.svelte (top bar) and TabSidebar.svelte (sidebar)

const DRAG_THRESHOLD = 5

const state = $state({
    active: false,
    tabId: null,
    tabEl: null,
    sourceZone: null, // 'topbar' or 'sidebar'
    sourceSpaceId: null,
    startX: 0,
    startY: 0,
    indicator: {
        visible: false,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    }
})

let pending = null

function startPending(tabId, tabEl, sourceZone, sourceSpaceId, e) {
    if (e.button !== 0) return
    pending = { tabId, tabEl, sourceZone, sourceSpaceId, startX: e.clientX, startY: e.clientY }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
}

function handleMouseMove(e) {
    if (pending && !state.active) {
        const dx = e.clientX - pending.startX
        const dy = e.clientY - pending.startY
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
            state.active = true
            state.tabId = pending.tabId
            state.tabEl = pending.tabEl
            state.sourceZone = pending.sourceZone
            state.sourceSpaceId = pending.sourceSpaceId
            state.startX = pending.startX
            state.startY = pending.startY
            document.body.classList.add('tab-dragging-active')
            document.body.style.cursor = 'grabbing'
            document.body.style.userSelect = 'none'
        }
    }

    if (!state.active) return

    const mx = e.clientX
    const my = e.clientY

    // Try top bar tabs first (horizontal)
    const topbarList = document.querySelector('.tab-list.tabs')
    if (topbarList) {
        const listRect = topbarList.getBoundingClientRect()
        // Extend hit area vertically by a few px for easier targeting
        if (mx >= listRect.left && mx <= listRect.right && my >= listRect.top - 4 && my <= listRect.bottom + 4) {
            const tabs = topbarList.querySelectorAll(':scope > .tab-container:not(.pinned-tab-container)')
            const hit = findClosestHorizontal(tabs, mx)
            if (hit) {
                showIndicatorVerticalLine(hit.rect, hit.after)
                return
            }
        }
    }

    // Try sidebar tabs (vertical)
    const sidebarLists = document.querySelectorAll('.tabs-list')
    for (const list of sidebarLists) {
        const listRect = list.getBoundingClientRect()
        if (mx >= listRect.left && mx <= listRect.right && my >= listRect.top && my <= listRect.bottom) {
            const tabs = list.querySelectorAll(':scope > .tab-item-container')
            const hit = findClosestVertical(tabs, my)
            if (hit) {
                showIndicatorHorizontalLine(hit.rect, hit.after)
                return
            }
        }
    }

    hideIndicator()
}

// Find which tab the mouse is closest to horizontally
// Each tab "owns" from its left edge minus half the gap to its right edge plus half the gap
function findClosestHorizontal(tabs, mx) {
    if (!tabs.length) return null
    for (const tab of tabs) {
        const rect = tab.getBoundingClientRect()
        // Each tab owns the space from midpoint of left gap to midpoint of right gap
        const left = rect.left - 3.5  // half of 7px gap
        const right = rect.right + 3.5
        if (mx >= left && mx <= right) {
            const mid = rect.left + rect.width / 2
            return { rect, after: mx > mid }
        }
    }
    // If past all tabs, snap to last one
    const last = tabs[tabs.length - 1]
    const lastRect = last.getBoundingClientRect()
    if (mx > lastRect.right) return { rect: lastRect, after: true }
    // If before all tabs, snap to first
    const first = tabs[0]
    const firstRect = first.getBoundingClientRect()
    if (mx < firstRect.left) return { rect: firstRect, after: false }
    return null
}

function findClosestVertical(tabs, my) {
    if (!tabs.length) return null
    for (const tab of tabs) {
        const rect = tab.getBoundingClientRect()
        const top = rect.top - 4  // half of 8px gap
        const bottom = rect.bottom + 4
        if (my >= top && my <= bottom) {
            const mid = rect.top + rect.height / 2
            return { rect, after: my > mid }
        }
    }
    const last = tabs[tabs.length - 1]
    const lastRect = last.getBoundingClientRect()
    if (my > lastRect.bottom) return { rect: lastRect, after: true }
    const first = tabs[0]
    const firstRect = first.getBoundingClientRect()
    if (my < firstRect.top) return { rect: firstRect, after: false }
    return null
}

// Vertical line between horizontal tabs (top bar)
function showIndicatorVerticalLine(tabRect, after) {
    const x = after ? tabRect.right + 2.5 : tabRect.left - 4.5
    state.indicator.visible = true
    state.indicator.x = x
    state.indicator.y = tabRect.top
    state.indicator.width = 2
    state.indicator.height = tabRect.height
}

// Horizontal line between vertical tabs (sidebar)
function showIndicatorHorizontalLine(tabRect, after) {
    const y = after ? tabRect.bottom + 3 : tabRect.top - 5
    state.indicator.visible = true
    state.indicator.x = tabRect.left
    state.indicator.y = y
    state.indicator.width = tabRect.width
    state.indicator.height = 2
}

function hideIndicator() {
    state.indicator.visible = false
}

function handleMouseUp() {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    document.body.classList.remove('tab-dragging-active')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    
    // TODO: implement actual tab reorder/move here
    
    state.active = false
    state.tabId = null
    state.tabEl = null
    state.sourceZone = null
    state.sourceSpaceId = null
    state.indicator.visible = false
    pending = null
}

function cancelDrag() {
    handleMouseUp()
}

export { state as tabDrag, startPending as startTabDrag, cancelDrag }

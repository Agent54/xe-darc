// Shared tab drag-and-drop state
// Used by both App.svelte (top bar) and TabSidebar.svelte (sidebar)

const DRAG_THRESHOLD = 5

const state = $state({
    active: false,
    tabId: null,
    tabEl: null,
    sourceZone: null, // 'topbar' or 'sidebar'
    sourceSpaceId: null,
    wasAlreadyActive: false,
    startX: 0,
    startY: 0,
    mouseX: 0,
    mouseY: 0,
    // Offset from mouse to tab element origin at drag start
    grabOffsetX: 0,
    grabOffsetY: 0,
    previewWidth: 0,
    previewHeight: 0,
    indicator: {
        visible: false,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    }
})

let pending = null
let activateRafId = null
let didDrag = false

function startPending(tabId, tabEl, sourceZone, sourceSpaceId, e, wasAlreadyActive) {
    if (e.button !== 0) return
    pending = { tabId, tabEl, sourceZone, sourceSpaceId, startX: e.clientX, startY: e.clientY }
    state.wasAlreadyActive = wasAlreadyActive
    didDrag = false
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown)
}

function setActivateRafId(id) {
    activateRafId = id
}

function handleMouseMove(e) {
    if (pending && !state.active) {
        const dx = e.clientX - pending.startX
        const dy = e.clientY - pending.startY
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
            // Cancel pending tab activation so dragging doesn't switch tabs
            if (activateRafId !== null) {
                cancelAnimationFrame(activateRafId)
                activateRafId = null
            }
            const tabRect = pending.tabEl.getBoundingClientRect()
            didDrag = true
            state.active = true
            state.tabId = pending.tabId
            state.tabEl = pending.tabEl
            state.sourceZone = pending.sourceZone
            state.sourceSpaceId = pending.sourceSpaceId
            state.startX = pending.startX
            state.startY = pending.startY
            state.grabOffsetX = pending.startX - tabRect.left
            state.grabOffsetY = pending.startY - tabRect.top
            state.previewWidth = tabRect.width
            state.previewHeight = tabRect.height
            document.body.classList.add('tab-dragging-active')
            // Dismiss any open hovercards
            window.dispatchEvent(new CustomEvent('darc-dismiss-hovercards'))
        }
    }

    if (!state.active) return

    const mx = e.clientX
    const my = e.clientY
    state.mouseX = mx
    state.mouseY = my

    // Try top bar tabs first (horizontal)
    const topbarList = document.querySelector('.tab-list.tabs')
    if (topbarList) {
        const listRect = topbarList.getBoundingClientRect()
        if (mx >= listRect.left && mx <= listRect.right && my >= listRect.top - 4 && my <= listRect.bottom + 4) {
            const tabs = topbarList.querySelectorAll(':scope > .tab-container:not(.pinned-tab-container)')
            const hit = findClosestTab(tabs, mx, 'x')
            if (hit) {
                if (isNoopDrop(tabs, hit)) { hideIndicator(); return }
                showIndicator(tabs, hit.index, hit.after, 'x')
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
            const hit = findClosestTab(tabs, my, 'y')
            if (hit) {
                if (isNoopDrop(tabs, hit)) { hideIndicator(); return }
                showIndicator(tabs, hit.index, hit.after, 'y')
                return
            }
        }
    }

    hideIndicator()
}

function isNoopDrop(tabs, hit) {
    const dragEl = state.tabEl
    const i = hit.index
    if (hit.el === dragEl) return true
    if (hit.after && i + 1 < tabs.length && tabs[i + 1] === dragEl) return true
    if (!hit.after && i - 1 >= 0 && tabs[i - 1] === dragEl) return true
    return false
}

// Find which tab the mouse is closest to, returns { el, index, after }
function findClosestTab(tabs, pos, axis) {
    if (!tabs.length) return null
    const rects = Array.from(tabs).map(t => t.getBoundingClientRect())
    
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i]
        const start = axis === 'x' ? r.left : r.top
        const end = axis === 'x' ? r.right : r.bottom
        const prevEnd = i > 0 ? (axis === 'x' ? rects[i-1].right : rects[i-1].bottom) : start
        const nextStart = i < rects.length - 1 ? (axis === 'x' ? rects[i+1].left : rects[i+1].top) : end
        
        // This tab owns from midpoint of gap-before to midpoint of gap-after
        const ownStart = (prevEnd + start) / 2
        const ownEnd = (end + nextStart) / 2
        
        if (pos >= ownStart && pos <= ownEnd) {
            const mid = (start + end) / 2
            return { el: tabs[i], index: i, after: pos > mid }
        }
    }
    // Past all tabs
    if (pos > rects[rects.length - 1][axis === 'x' ? 'right' : 'bottom']) {
        return { el: tabs[tabs.length - 1], index: rects.length - 1, after: true }
    }
    return { el: tabs[0], index: 0, after: false }
}

// Position indicator centered between two adjacent tab edges
function showIndicator(tabs, index, after, axis) {
    const rects = Array.from(tabs).map(t => t.getBoundingClientRect())
    const r = rects[index]
    
    if (axis === 'x') {
        let x
        if (after && index < rects.length - 1) {
            x = (r.right + rects[index + 1].left) / 2
        } else if (!after && index > 0) {
            x = (rects[index - 1].right + r.left) / 2
        } else {
            x = after ? r.right + 3.5 : r.left - 3.5
        }
        state.indicator.visible = true
        state.indicator.x = x
        state.indicator.y = r.top + r.height / 2
        state.indicator.width = 2
        state.indicator.height = r.height
    } else {
        let y
        if (after && index < rects.length - 1) {
            y = (r.bottom + rects[index + 1].top) / 2
        } else if (!after && index > 0) {
            y = (rects[index - 1].bottom + r.top) / 2
        } else {
            y = after ? r.bottom + 4 : r.top - 4
        }
        state.indicator.visible = true
        state.indicator.x = r.left + r.width / 2
        state.indicator.y = y
        state.indicator.width = r.width
        state.indicator.height = 2
    }
}

function hideIndicator() {
    state.indicator.visible = false
}

function handleKeyDown(e) {
    if (e.key === 'Escape') {
        e.preventDefault()
        didDrag = true
        handleMouseUp()
    }
}

function handleMouseUp() {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    window.removeEventListener('keydown', handleKeyDown)
    document.body.classList.remove('tab-dragging-active')
    
    // TODO: implement actual tab reorder/move here
    
    state.active = false
    state.tabId = null
    state.tabEl = null
    state.sourceZone = null
    state.sourceSpaceId = null
    state.indicator.visible = false
    pending = null
    activateRafId = null
}

function cancelDrag() {
    handleMouseUp()
}

function didDragOccurred() {
    return didDrag
}

export { state as tabDrag, startPending as startTabDrag, cancelDrag, setActivateRafId, didDragOccurred }

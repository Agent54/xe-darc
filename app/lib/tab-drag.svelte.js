// Shared tab drag-and-drop state
// Used by both App.svelte (top bar) and TabSidebar.svelte (sidebar)

const DRAG_THRESHOLD = 5
const AUTO_SCROLL_EDGE = 60 // px from edge to start scrolling
const AUTO_SCROLL_SPEED = 12 // px per frame

let autoScrollRafId = null

function autoScrollContainer(container, axis) {
    const rect = container.getBoundingClientRect()
    const pos = axis === 'x' ? state.mouseX : state.mouseY
    const start = axis === 'x' ? rect.left : rect.top
    const end = axis === 'x' ? rect.right : rect.bottom
    const scrollPos = axis === 'x' ? container.scrollLeft : container.scrollTop
    const scrollMax = axis === 'x' ? container.scrollWidth - container.clientWidth : container.scrollHeight - container.clientHeight

    if (pos < start + AUTO_SCROLL_EDGE && scrollPos > 0) {
        const intensity = 1 - (pos - start) / AUTO_SCROLL_EDGE
        const delta = -AUTO_SCROLL_SPEED * Math.max(0, Math.min(1, intensity))
        if (axis === 'x') container.scrollLeft += delta; else container.scrollTop += delta
        return true
    } else if (pos > end - AUTO_SCROLL_EDGE && scrollPos < scrollMax) {
        const intensity = 1 - (end - pos) / AUTO_SCROLL_EDGE
        const delta = AUTO_SCROLL_SPEED * Math.max(0, Math.min(1, intensity))
        if (axis === 'x') container.scrollLeft += delta; else container.scrollTop += delta
        return true
    }
    return false
}

function startAutoScroll() {
    if (autoScrollRafId) return
    function tick() {
        if (!state.active) { autoScrollRafId = null; return }
        const mx = state.mouseX
        const my = state.mouseY
        let scrolled = false

        // Horizontal: multi-space sidebar container
        const multiSpace = document.querySelector('.tab-content-container.multi-space')
        if (multiSpace) scrolled = autoScrollContainer(multiSpace, 'x') || scrolled

        // Horizontal: title bar tab list
        const topbar = document.querySelector('.tab-list.tabs')
        if (topbar && topbar.scrollWidth > topbar.clientWidth) {
            const r = topbar.getBoundingClientRect()
            if (my >= r.top - 4 && my <= r.bottom + 4) {
                scrolled = autoScrollContainer(topbar, 'x') || scrolled
            }
        }

        // Vertical: sidebar tabs-list the mouse is over
        const sidebarLists = document.querySelectorAll('.tabs-list')
        for (const list of sidebarLists) {
            if (list.scrollHeight <= list.clientHeight) continue
            const r = list.getBoundingClientRect()
            if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) {
                scrolled = autoScrollContainer(list, 'y') || scrolled
                break
            }
        }

        if (scrolled) {
            handleMouseMove({ clientX: mx, clientY: my })
        }
        autoScrollRafId = requestAnimationFrame(tick)
    }
    autoScrollRafId = requestAnimationFrame(tick)
}

function stopAutoScroll() {
    if (autoScrollRafId) {
        cancelAnimationFrame(autoScrollRafId)
        autoScrollRafId = null
    }
}

const state = $state({
    active: false,
    pending: false,
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
    },
    sidepinZone: null, // null, 'left', or 'right'
})

let pending = null
let activateRafId = null
let didDrag = false
let dropCallback = null

function startPending(tabId, tabEl, sourceZone, sourceSpaceId, e, wasAlreadyActive, pinnedSide) {
    if (e.button !== 0) return
    pending = { tabId, tabEl, sourceZone, sourceSpaceId, startX: e.clientX, startY: e.clientY, pinnedSide: pinnedSide || null }
    state.pending = true
    state.wasAlreadyActive = wasAlreadyActive
    didDrag = false
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown, true)
}

function setActivateRafId(id) {
    if (activateRafId !== null) clearTimeout(activateRafId)
    activateRafId = id
}

function handleMouseMove(e) {
    if (pending && !state.active) {
        const dx = e.clientX - pending.startX
        const dy = e.clientY - pending.startY
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
            // Cancel pending tab activation so dragging doesn't switch tabs
            if (activateRafId !== null) {
                clearTimeout(activateRafId)
                activateRafId = null
            }
            const tabRect = pending.tabEl.getBoundingClientRect()
            didDrag = true
            state.active = true
            state.pending = false
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
            // Blur any focused iframe/controlledframe so keyboard events reach the window
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur()
                document.body.focus()
            }
            // Dismiss any open hovercards
            window.dispatchEvent(new CustomEvent('darc-dismiss-hovercards'))
            startAutoScroll()
        }
    }

    if (!state.active) return

    const mx = e.clientX
    const my = e.clientY
    state.mouseX = mx
    state.mouseY = my

    // Try pinned tab containers first (left fixed, right fixed, and right inline in topbar)
    const pinnedContainers = []
    const pinnedLeftContainer = document.querySelector('.fixed-pinned-tabs-left')
    if (pinnedLeftContainer) pinnedContainers.push([pinnedLeftContainer, 'left'])
    const pinnedRightContainer = document.querySelector('.fixed-pinned-tabs-right')
    if (pinnedRightContainer) pinnedContainers.push([pinnedRightContainer, 'right'])
    // Right pinned tabs may also be inline inside the topbar list
    const topbarListForPinned = document.querySelector('.tab-list.tabs')
    if (topbarListForPinned && !pinnedRightContainer) {
        const inlineRightPinned = topbarListForPinned.querySelectorAll(':scope > .pinned-tab-container')
        if (inlineRightPinned.length) pinnedContainers.push([topbarListForPinned, 'right', inlineRightPinned])
    }
    for (const [container, side, tabsOverride] of pinnedContainers) {
        const tabs = tabsOverride || container.querySelectorAll(':scope > .pinned-tab-container')
        if (!tabs.length) continue
        const firstRect = tabs[0].getBoundingClientRect()
        const lastRect = tabs[tabs.length - 1].getBoundingClientRect()
        if (mx >= firstRect.left - 8 && mx <= lastRect.right + 8 && my >= firstRect.top - 4 && my <= lastRect.bottom + 4) {
            const hit = findClosestTab(tabs, mx, 'x')
            if (hit) {
                if (isNoopDrop(tabs, hit)) { hideIndicator(); state.sidepinZone = null; return }
                showIndicator(tabs, hit.index, hit.after, 'x')
                state.sidepinZone = side
                return
            }
        }
    }

    // Try top bar tabs first (horizontal)
    const topbarList = document.querySelector('.tab-list.tabs')
    if (topbarList) {
        const listRect = topbarList.getBoundingClientRect()
        if (mx >= listRect.left && mx <= listRect.right && my >= listRect.top - 4 && my <= listRect.bottom + 4) {
            const tabs = topbarList.querySelectorAll(':scope > .tab-container:not(.pinned-tab-container)')
            const hit = findClosestTab(tabs, mx, 'x')
            if (hit) {
                if (isNoopDrop(tabs, hit)) { hideIndicator(); state.sidepinZone = null; return }
                showIndicator(tabs, hit.index, hit.after, 'x')
                state.sidepinZone = null
                return
            }
        }
    }

    // Try sidebar tabs (vertical)
    const sidebarLists = document.querySelectorAll('.tabs-list')
    for (const list of sidebarLists) {
        const listRect = list.getBoundingClientRect()
        // Skip lists clipped by a scroll container (e.g. off-screen spaces)
        const scrollParent = list.closest('.tab-content-container')
        if (scrollParent) {
            const sp = scrollParent.getBoundingClientRect()
            if (listRect.right <= sp.left || listRect.left >= sp.right) continue
        }
        if (mx >= listRect.left && mx <= listRect.right && my >= listRect.top && my <= listRect.bottom) {
            const tabs = list.querySelectorAll(':scope > .tab-item-container')
            const hit = findClosestTab(tabs, my, 'y')
            if (hit) {
                if (isNoopDrop(tabs, hit)) { hideIndicator(); state.sidepinZone = null; return }
                showIndicator(tabs, hit.index, hit.after, 'y')
                state.sidepinZone = null
                return
            }
            // Empty list or mouse past all tabs — show indicator at list top/after last tab
            showIndicatorInList(list, tabs)
            state.sidepinZone = null
            return
        }
    }

    // Check for sidepin drop zones (left/right 20% of window, excluding tab sidebar and right sidebar)
    // Disable sidepin when sidebar is in multi-space (full width) mode
    if (document.querySelector('.sidebar-box.multi-space-mode')) { hideIndicator(); state.sidepinZone = null; return }
    const tabSidebar = document.querySelector('.sidebar-box.visible')
    const rightSidebarPanels = document.querySelectorAll('.sidebar-panel')
    const areaLeft = tabSidebar ? tabSidebar.getBoundingClientRect().right : 0
    let areaRight = window.innerWidth
    for (const panel of rightSidebarPanels) {
        const panelLeft = panel.getBoundingClientRect().left
        if (panelLeft < areaRight) areaRight = panelLeft
    }
    const areaWidth = areaRight - areaLeft
    const topBarEl = document.querySelector('.tab-list.tabs')
    const areaTop = topBarEl ? topBarEl.getBoundingClientRect().bottom : 50

    if (mx >= areaLeft && mx <= areaRight && my >= areaTop) {
        const zoneWidth = areaWidth * 0.2
        if (mx <= areaLeft + zoneWidth && pending?.pinnedSide !== 'left') {
            state.sidepinZone = 'left'
            hideIndicator()
            return
        } else if (mx >= areaRight - zoneWidth && pending?.pinnedSide !== 'right') {
            state.sidepinZone = 'right'
            hideIndicator()
            return
        }
    }
    state.sidepinZone = null

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

// Show indicator in a sidebar list when there are no tabs or mouse is past all of them
function showIndicatorInList(list, tabs) {
    const listRect = list.getBoundingClientRect()
    if (tabs.length) {
        // After last tab
        const lastRect = tabs[tabs.length - 1].getBoundingClientRect()
        state.indicator.visible = true
        state.indicator.x = lastRect.left + lastRect.width / 2
        state.indicator.y = lastRect.bottom + 4
        state.indicator.width = lastRect.width
        state.indicator.height = 2
    } else {
        // Empty list — show at top
        state.indicator.visible = true
        state.indicator.x = listRect.left + listRect.width / 2
        state.indicator.y = listRect.top + 8
        state.indicator.width = listRect.width - 16
        state.indicator.height = 2
    }
}

function hideIndicator() {
    state.indicator.visible = false
}

function handleKeyDown(e) {
    if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        didDrag = true
        handleMouseUp()
    }
}

function handleMouseUp() {
    stopAutoScroll()
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    window.removeEventListener('keydown', handleKeyDown, true)
    document.body.classList.remove('tab-dragging-active')
    
    if (state.active && dropCallback) {
        if (state.sidepinZone && state.indicator.visible) {
            // Positional sidepin drop (between existing pinned tabs)
            const drop = resolvePinnedDropTarget(state.mouseX, state.sidepinZone, state.tabId)
            dropCallback({ type: 'sidepin', tabId: state.tabId, side: state.sidepinZone, ...(drop || {}) })
        } else if (state.sidepinZone) {
            dropCallback({ type: 'sidepin', tabId: state.tabId, side: state.sidepinZone })
        } else if (state.indicator.visible) {
            // Determine drop target from indicator position
            const drop = resolveDropTarget(state.mouseX, state.mouseY, state.tabId)
            if (drop) {
                dropCallback({ type: 'reorder', tabId: state.tabId, sourceSpaceId: state.sourceSpaceId, ...drop })
            }
        }
    }
    
    state.active = false
    state.pending = false
    state.tabId = null
    state.tabEl = null
    state.sourceZone = null
    state.sourceSpaceId = null
    state.indicator.visible = false
    state.sidepinZone = null
    pending = null
    activateRafId = null
}

// Resolve the drop target: which space, and the tab IDs of neighbors for order calculation
function resolveDropTarget(mx, my, dragTabId) {
    // Check topbar
    const topbarList = document.querySelector('.tab-list.tabs')
    if (topbarList) {
        const listRect = topbarList.getBoundingClientRect()
        if (mx >= listRect.left && mx <= listRect.right && my >= listRect.top - 4 && my <= listRect.bottom + 4) {
            const tabs = topbarList.querySelectorAll(':scope > .tab-container:not(.pinned-tab-container)')
            const hit = findClosestTab(tabs, mx, 'x')
            if (hit && !isNoopDrop(tabs, hit)) {
                return buildDropInfo(tabs, hit, dragTabId, null) // null = same space (topbar is always active space)
            }
        }
    }

    // Check sidebar lists
    const sidebarLists = document.querySelectorAll('.tabs-list')
    for (const list of sidebarLists) {
        const listRect = list.getBoundingClientRect()
        const scrollParent = list.closest('.tab-content-container')
        if (scrollParent) {
            const sp = scrollParent.getBoundingClientRect()
            if (listRect.right <= sp.left || listRect.left >= sp.right) continue
        }
        if (mx >= listRect.left && mx <= listRect.right && my >= listRect.top && my <= listRect.bottom) {
            const tabs = list.querySelectorAll(':scope > .tab-item-container')
            const hit = findClosestTab(tabs, my, 'y')
            if (hit && !isNoopDrop(tabs, hit)) {
                const spaceContent = list.closest('.space-content')
                const targetSpaceId = spaceContent?.getAttribute('data-space-id') || null
                return buildDropInfo(tabs, hit, dragTabId, targetSpaceId)
            }
            // Empty list or past all tabs — drop at end (or beginning if empty)
            const spaceContent = list.closest('.space-content')
            const targetSpaceId = spaceContent?.getAttribute('data-space-id') || null
            const tabEls = Array.from(tabs)
            const lastId = tabEls.length ? getTabId(tabEls[tabEls.length - 1]) : null
            const beforeTabId = lastId === dragTabId ? null : lastId
            return { beforeTabId, afterTabId: null, targetSpaceId }
        }
    }

    return null
}

function resolvePinnedDropTarget(mx, side, dragTabId) {
    let tabs
    if (side === 'left') {
        const container = document.querySelector('.fixed-pinned-tabs-left')
        if (container) tabs = container.querySelectorAll(':scope > .pinned-tab-container')
    } else {
        const container = document.querySelector('.fixed-pinned-tabs-right')
        if (container) {
            tabs = container.querySelectorAll(':scope > .pinned-tab-container')
        } else {
            const topbar = document.querySelector('.tab-list.tabs')
            if (topbar) tabs = topbar.querySelectorAll(':scope > .pinned-tab-container')
        }
    }
    if (!tabs?.length) return null
    const hit = findClosestTab(tabs, mx, 'x')
    if (hit && !isNoopDrop(tabs, hit)) {
        return buildDropInfo(tabs, hit, dragTabId, null)
    }
    return null
}

function buildDropInfo(tabs, hit, dragTabId, targetSpaceId) {
    const tabEls = Array.from(tabs)
    // The insert position: if after, insert after hit.index; if before, insert before hit.index
    // Get the IDs of the neighbors the dragged tab will land between
    let beforeTabId = null // tab that will be before the dragged tab
    let afterTabId = null  // tab that will be after the dragged tab

    if (hit.after) {
        beforeTabId = getTabId(tabEls[hit.index])
        afterTabId = hit.index + 1 < tabEls.length ? getTabId(tabEls[hit.index + 1]) : null
    } else {
        beforeTabId = hit.index > 0 ? getTabId(tabEls[hit.index - 1]) : null
        afterTabId = getTabId(tabEls[hit.index])
    }

    // Skip the dragged tab if it appears as a neighbor (shouldn't happen due to isNoopDrop, but safety)
    if (beforeTabId === dragTabId) beforeTabId = null
    if (afterTabId === dragTabId) afterTabId = null

    return { beforeTabId, afterTabId, targetSpaceId }
}

function getTabId(el) {
    if (!el) return null
    return el.getAttribute('data-tab-id') || el.id?.replace('tab_', '') || null
}

function cancelDrag() {
    didDrag = true
    handleMouseUp()
}

function didDragOccurred() {
    return didDrag
}

function onDrop(cb) {
    dropCallback = cb
}

export { state as tabDrag, startPending as startTabDrag, cancelDrag, setActivateRafId, didDragOccurred, onDrop }

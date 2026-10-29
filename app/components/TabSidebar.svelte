<script module>
    // Shared by every sidebar instance for this session; never persisted with tab data.
    const defaultTabGroupMaxHeight = 5 * 36 + 4 * 4 + 2 * 5
    let tabGroupMaxHeight = $state(defaultTabGroupMaxHeight)
</script>

<script>
    import { cdpFetch } from '../lib/cdp.js'
    // Tab sidebar component with Firefox-like hover behavior
    let { 
        isDragEnabled = true,
        onShowApps = () => {},
        customTabSidebarWidth = null,
        tabSidebarVisible = false,
        isResizingTabSidebar = false,
        onStartResizeTabSidebar = null,
        devModeEnabled = false,
        onGoBack = null,
        onGoForward = null,
        onNavigateHistory = null,
        onReload = null,
        onCloseTab = null,
        showUrl = true
    } = $props()
    import data from '../data.svelte.js'
    import Favicon from './Favicon.svelte'
    import Tooltip from './Tooltip.svelte'
    import UrlRenderer from './UrlRenderer.svelte'
    import UrlBar from './UrlBar.svelte'
    import TabHoverCard from './TabHoverCard.svelte'
    import TabGroupPreview from './TabGroupPreview.svelte'
    import TabContextMenu from './TabContextMenu.svelte'
    import { observeScrollEdges } from '../lib/scroll-edges.js'
    import { canFitSidebarHovercardHistory, fitSidebarHovercard, getSidebarHovercardPosition } from '../lib/hovercard-layout.js'
    import { createTabGroupPreview } from '../lib/tab-group-preview.svelte.js'
    import { tabDrag, startTabDrag, setActivateRafId, didDragOccurred, onGroupExpand } from '../lib/tab-drag.svelte.js'
    import { colors as spaceColors } from '../lib/utils.js'
    import { untrack, onMount } from 'svelte'
    
    let isHovered = $state(false)
    let tabListRef = $state(null)
    let spacesListRef = $state(null)
    let openMenuId = $state(null)
    let newSpaceMenuOpen = $state(false)
    let closedTabsHovered = $state(false)
    let closedTabsHeaderHovered = $state(false)
    let closedTabsHideTimeout = null
    let spaceContextMenuId = $state(null)
    let contextMenuJustOpened = false
    let contextMenuPosition = $state({ x: 0, y: 0 })
    let urlBarExpanded = $state(false)
    let urlInput = $state(null)
    let urlInputValue = $state('')
    let copyUrlSuccess = $state(false)
    let renamingSpaceId = $state(null)
    let renameInputValue = $state('')
    let renameInputRef = $state(null)
    let colorPickerSpaceId = $state(null)
    let colorPickerFromMenu = $state(false)
    
    // Multi-space expansion state
    let multiSpaceMode = $state(false)
    let isClosingMultiSpace = $state(false)
    let rubberBandOffset = $state(0)
    let isRubberBanding = $state(false)
    let baseWidth = 263 // Default sidebar width
    let spaceWidth = $state(null) // Width of each space lane in multi-space mode
    let isResizingLanes = false
    let resizeStartX = 0
    let resizeStartWidth = 0
    
    // Tab context menu state
    let tabContextMenu = $state({ visible: false, x: 0, y: 0, tab: null, index: null })

    // svelte-ignore non_reactive_update
    let tabContextMenuOpenTime = 0
    
    // Hover card state
    let hoveredTab = $state(null)
    let hoveredGroupTarget = $state(null)
    let hovercardAnchor = $state(null)
    let hovercardHistoryBeside = $state(false)
    const hoveredGroup = $derived(hoveredGroupTarget ? data.getTabGroup(hoveredGroupTarget.tabId, hoveredGroupTarget.spaceId) : null)
    const hovercardActivationTabId = $derived(hoveredGroup ? data.getGroupActiveTab(hoveredGroup, hoveredGroupTarget.spaceId)?.id : null)
    const hovercardTabs = $derived(hoveredGroupTarget ? hoveredGroup?.tabs || [] : hoveredTab ? [hoveredTab] : [])
    let hoverTimeout = null
    let hovercardPosition = $state({ x: 0, y: 0 })
    let hovercardShowTime = null
    let hovercardResetTimer = null
    let hovercardCheckInterval = null
    let closeButtonHovered = $state(false)
    let closeButtonHoveredDelayed = $state(false)
    let closeButtonHoverTimer = null
    let instantHovercardsMode = $state(false)
    let instantModeResetTimer = null
    let hovercardUrlBarExpanded = $state(false)
    let expandedHovercardTabs = $state({})
    let expandedHovercardHistoryTabId = $state(null)
    let menuCloseTimeout = null
    
    // Resize handle visibility - only enable after sidebar is fully shown
    let sidebarFullyShown = $state(false)
    let sidebarShowTimeout = null
    
    // Tab group expansion state
    let tabGroupExpansion = $state({})
    let groupResize = $state(null)
    const groupPreview = createTabGroupPreview()
    onMount(() => () => groupPreview.destroy())
    let tabSearchQuery = $state('')
    let isSearchModeActive = $state(false)
    let searchInputRef = $state(null)
    
    function tabMatchesSearch(tab) {
        if (!tabSearchQuery) return true;
        const query = tabSearchQuery.toLowerCase();
        const title = (data.docs[tab.id]?.title || tab.title || '').toLowerCase();
        const url = (data.docs[tab.id]?.url || tab.url || '').toLowerCase();
        return title.includes(query) || url.includes(query);
    }
    
    function spaceHasMatchingTabs(spaceId) {
        if (!tabSearchQuery) return true;
        const space = data.spaces[spaceId];
        if (!space) return false;
        
        if (data.getSpacePins(spaceId).some(tab => tabMatchesSearch(tab))) return true;
        if (space.tabs?.some(tab => tab.type === 'tab' && tabMatchesSearch(tab))) return true;
        
        return false;
    }
    
    const hasAnySearchResults = $derived.by(() => {
        if (!tabSearchQuery) return true;
        return data.spaceMeta.spaceOrder.some(spaceId => spaceHasMatchingTabs(spaceId)) ||
               data.spaceMeta.closedTabs.some(tab => tabMatchesSearch(tab));
    });
    
    function handleTabGroupToggle(id, expanded) {
        tabGroupExpansion[id] = !expanded
    }

    onMount(() => onGroupExpand(({ spaceId, tabGroupId }) => {
        handleTabGroupToggle(`${spaceId}:group:${tabGroupId}`, false)
    }))
    
    // Centralized function to close hovercard - prevents closing when URL bar is expanded
    function closeHovercard() {
        if (hovercardUrlBarExpanded) return
        hoveredTab = null
        hoveredGroupTarget = null
        hovercardAnchor = null
        hovercardShowTime = null
        expandedHovercardHistoryTabId = null
    }
    
    onMount(() => {
        const dismissHovercards = () => {
            hoveredTab = null
            hoveredGroupTarget = null
            hovercardAnchor = null
            hovercardShowTime = null
            expandedHovercardHistoryTabId = null
            if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null }
        }
        window.addEventListener('darc-dismiss-hovercards', dismissHovercards)
        return () => window.removeEventListener('darc-dismiss-hovercards', dismissHovercards)
    })

    // Focus the URL input when it becomes visible
    $effect(() => {
        if (urlBarExpanded && urlInput) {
            urlInputValue = data.docs[data.spaceMeta.activeTabId]?.url || ''
            setTimeout(() => {
                urlInput.focus()
                urlInput.select()
            }, 1)
        }
    })
    


    let isManualScroll = false
    let previousSpaceIndex = -1
    // let scrollActiveSpaceTimeout = null
    
    // Spaces list horizontal scroll fade state
    let spacesScrolledLeft = $state(false)
    let spacesScrolledRight = $state(false)

    // TODO: active tab on tab title and track active tabs per space, show active tab in each space

    const globallyPinnedTabs = $derived(data.spaceMeta.globalPins)
    
    // Track if mouse left during a drag so we can close sidebar when drag ends
    let mouseLeftDuringDrag = false
    // Track if sidebar was open when drag started (to prevent drag from OPENING sidebar)
    let sidebarOpenedBeforeDrag = false
    $effect(() => {
        if ((tabDrag.active || tabDrag.pending) && !sidebarOpenedBeforeDrag) {
            sidebarOpenedBeforeDrag = isHovered
        }
        if (!tabDrag.active && !tabDrag.pending) {
            if (mouseLeftDuringDrag) {
                mouseLeftDuringDrag = false
                if (multiSpaceMode) exitMultiSpaceMode()
                isHovered = false
                if (sidebarShowTimeout) clearTimeout(sidebarShowTimeout)
                sidebarFullyShown = false
            }
            sidebarOpenedBeforeDrag = false
        }
    })
    
    function handleMouseEnter() {
        isHovered = true
        mouseLeftDuringDrag = false
        // Cancel pending menu close if re-entering
        if (menuCloseTimeout) {
            clearTimeout(menuCloseTimeout)
            menuCloseTimeout = null
        }
        // Schedule resize handle activation after sidebar fully slides in
        // Transition: 190ms duration + 0ms delay when hovered (but sidebar starts hidden with 340ms delay)
        // Use 250ms to ensure sidebar is fully visible
        if (sidebarShowTimeout) clearTimeout(sidebarShowTimeout)
        sidebarShowTimeout = setTimeout(() => {
            sidebarFullyShown = true
        }, 250)
    }
    
    function handleMouseLeave() {
        // Don't hide sidebar when URL bar is expanded, in multi-space mode, or dragging/pending drag
        if (!urlBarExpanded && !multiSpaceMode && !tabDrag.active && !tabDrag.pending && !groupResize) {
            // Always set isHovered to false for resize handle logic
            isHovered = false
            // Immediately disable resize handle when leaving
            if (sidebarShowTimeout) clearTimeout(sidebarShowTimeout)
            sidebarFullyShown = false
        } else if (tabDrag.active || tabDrag.pending) {
            mouseLeftDuringDrag = true
        }
        
        // Close context menu when leaving sidebar
        if (spaceContextMenuId !== null) {
            spaceContextMenuId = null
        }
        if (colorPickerSpaceId !== null) {
            colorPickerSpaceId = null
        }
        if (renamingSpaceId !== null) {
            commitRename()
        }
        // Close dropdown menus when sidebar actually hides (after 340ms delay)
        if (newSpaceMenuOpen || openMenuId !== null) {
            if (menuCloseTimeout) clearTimeout(menuCloseTimeout)
            menuCloseTimeout = setTimeout(() => {
                newSpaceMenuOpen = false
                openMenuId = null
            }, 340)
        }
    }
    
    function scrollToCurrentSpace(behavior = 'smooth') {
        if (tabListRef && data.spaceMeta.activeSpace) {
            const targetElement = tabListRef.querySelector(`[data-space-id="${data.spaceMeta.activeSpace}"]`)
            if (targetElement) {
                targetElement.scrollIntoView({ behavior, inline: 'start' })
            }
        }
    }

    function scrollActiveSpaceIntoView() {
        if (spacesListRef && data.spaceMeta.activeSpace) {
            const targetButton = spacesListRef.querySelector(`[data-space-id="${data.spaceMeta.activeSpace}"]`)
            if (targetButton) {
                targetButton.scrollIntoView({ behavior: 'smooth', inline: 'nearest' })
            }
        }
    }

    function updateSpacesScrollFade() {
        if (!spacesListRef) return
        const el = spacesListRef
        const scrollLeft = el.scrollLeft
        const scrollWidth = el.scrollWidth
        const clientWidth = el.clientWidth
        
        spacesScrolledLeft = scrollLeft > 2
        spacesScrolledRight = scrollLeft + clientWidth < scrollWidth - 2
    }
    
    function handleSpacesScroll() {
        updateSpacesScrollFade()
    }
    
    // Rubber band scroll handling for tab content
    let rubberBandAnimationFrame = null
    let lastScrollLeft = 0
    let scrollVelocity = 0
    let accumulatedDeltaX = 0
    let accumulatedCloseDeltaX = 0
    let closeRubberBandOffset = $state(0)
    let isCloseRubberBanding = $state(false)
    let isVerticalScrolling = false
    let verticalScrollTimeout = null
    let isHorizontalScrolling = $state(false)
    let horizontalScrollTimeout = null
    
    function handleTabContentWheel(event) {
        if (!tabListRef || tabSearchQuery) return
        
        const scrollLeft = tabListRef.scrollLeft
        const maxScroll = tabListRef.scrollWidth - tabListRef.clientWidth
        
        // Very stiff spring (0.08 resistance) 
        const resistance = 0.08
        const threshold = 47 // Rubber band distance after activation (increased from 35 to prevent accidental triggers)
        const maxStretch = 50
        const activationThreshold = 180 // Minimum accumulated deltaX before spring activates (increased from 120)
        
        // Detect vertical scrolling and disable spring
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX) * 2) {
            isVerticalScrolling = true
            accumulatedDeltaX = 0
            if (verticalScrollTimeout) clearTimeout(verticalScrollTimeout)
            verticalScrollTimeout = setTimeout(() => {
                isVerticalScrolling = false
            }, 150)
            return
        }
        
        // If currently vertical scrolling, ignore horizontal component
        if (isVerticalScrolling) return
        
        // Mark as horizontal scrolling to disable vertical scrolling in tabs list
        isHorizontalScrolling = true
        if (horizontalScrollTimeout) clearTimeout(horizontalScrollTimeout)
        horizontalScrollTimeout = setTimeout(() => {
            isHorizontalScrolling = false
        }, 150)
        
        // Block all scroll during closing animation
        if (isClosingMultiSpace) {
            event.preventDefault()
            return
        }
        
        // In multi-space mode, add rubber band effect for closing at right edge
        if (multiSpaceMode) {
            const multiScrollLeft = tabListRef.scrollLeft
            const multiMaxScroll = tabListRef.scrollWidth - tabListRef.clientWidth
            // Only activate at right edge if there's scrollable content and we're at the very end
            const hasScrollableContent = multiMaxScroll > 5
            const atRightEdge = hasScrollableContent 
                ? multiScrollLeft >= multiMaxScroll - 2
                : true // If no scrollable content, we're always at the edge
            
            // Scrolling right at right edge - rubber band for closing
            if (atRightEdge && event.deltaX > 0) {
                // Accumulate before activating
                accumulatedCloseDeltaX += Math.abs(event.deltaX)
                if (accumulatedCloseDeltaX < activationThreshold) {
                    return
                }
                
                event.preventDefault()
                
                // Accumulate close rubber band offset with same resistance
                closeRubberBandOffset = Math.min(closeRubberBandOffset + event.deltaX * resistance, maxStretch)
                isCloseRubberBanding = true
                
                // If pulled far enough, close multi-space mode (higher threshold than opening)
                if (closeRubberBandOffset > 48) {
                    exitMultiSpaceMode()
                }
                
                // Schedule snap back
                scheduleCloseSnapBack()
            } else if (atRightEdge && event.deltaX < 0 && closeRubberBandOffset > 0) {
                // Scrolling back left while rubber banding - reduce offset
                closeRubberBandOffset = Math.max(0, closeRubberBandOffset + event.deltaX * 0.3)
                if (closeRubberBandOffset <= 0) {
                    closeRubberBandOffset = 0
                    isCloseRubberBanding = false
                    accumulatedCloseDeltaX = 0
                }
            } else {
                // Reset when not at edge
                accumulatedCloseDeltaX = 0
            }
            return
        }
        
        // Check if scrolling past the left edge (toward revealing more spaces)
        if (scrollLeft <= 0 && event.deltaX < 0) {
            // Accumulate horizontal scroll before activating spring
            accumulatedDeltaX += Math.abs(event.deltaX)
            
            // Only activate spring after threshold is met
            if (accumulatedDeltaX < activationThreshold) {
                return
            }
            
            event.preventDefault()
            
            // Accumulate rubber band offset with resistance
            rubberBandOffset = Math.min(rubberBandOffset - event.deltaX * resistance, maxStretch)
            isRubberBanding = true
            
            // If pulled far enough, trigger multi-space mode (full screen)
            if (rubberBandOffset > threshold && !multiSpaceMode) {
                multiSpaceMode = true
                rubberBandOffset = 0
                isRubberBanding = false
                accumulatedDeltaX = 0
                // Initialize spaceWidth to match current sidebar width
                if (spaceWidth === null) {
                    spaceWidth = customTabSidebarWidth || baseWidth
                }
                return
            }
        } else if (scrollLeft <= 0 && event.deltaX > 0 && rubberBandOffset > 0) {
            // Scrolling back right while rubber banding - reduce offset
            rubberBandOffset = Math.max(0, rubberBandOffset - event.deltaX * 0.3)
            if (rubberBandOffset <= 0) {
                rubberBandOffset = 0
                isRubberBanding = false
                accumulatedDeltaX = 0
            }
        } else {
            // Reset accumulation when not at edge
            accumulatedDeltaX = 0
        }
        
        // Schedule snap back in case scrollend doesn't fire
        if (isRubberBanding) {
            scheduleSnapBack()
        }
    }
    
    function handleTabContentTouchStart(event) {
        lastScrollLeft = tabListRef?.scrollLeft || 0
    }
    
    function handleTabContentTouchMove(event) {
        if (!tabListRef) return
        
        const touch = event.touches[0]
        const scrollLeft = tabListRef.scrollLeft
        
        // Similar rubber band logic for touch
        if (scrollLeft <= 0 && isRubberBanding) {
            event.preventDefault()
        }
    }
    
    function snapBackRubberBand() {
        if (rubberBandOffset === 0) {
            isRubberBanding = false
            accumulatedDeltaX = 0
            return
        }
        
        // Very fast snap-back (0.4 decay = very stiff spring)
        rubberBandOffset = rubberBandOffset * 0.4
        if (Math.abs(rubberBandOffset) < 0.3) {
            rubberBandOffset = 0
            isRubberBanding = false
            accumulatedDeltaX = 0
        } else {
            rubberBandAnimationFrame = requestAnimationFrame(snapBackRubberBand)
        }
    }
    
    let rubberBandSnapTimeout = null
    let expansionSnapTimeout = null
    
    function scheduleSnapBack() {
        if (rubberBandSnapTimeout) clearTimeout(rubberBandSnapTimeout)
        rubberBandSnapTimeout = setTimeout(() => {
            if (isRubberBanding && rubberBandOffset !== 0) {
                snapBackRubberBand()
            }
        }, 80)
    }
    
    let closeRubberBandSnapTimeout = null
    
    function scheduleCloseSnapBack() {
        if (closeRubberBandSnapTimeout) clearTimeout(closeRubberBandSnapTimeout)
        closeRubberBandSnapTimeout = setTimeout(() => {
            if (isCloseRubberBanding && closeRubberBandOffset !== 0) {
                snapBackCloseRubberBand()
            }
        }, 80)
    }
    
    function snapBackCloseRubberBand() {
        if (closeRubberBandOffset === 0) {
            isCloseRubberBanding = false
            accumulatedCloseDeltaX = 0
            return
        }
        
        // Very fast snap-back (0.4 decay = very stiff spring)
        closeRubberBandOffset = closeRubberBandOffset * 0.4
        if (Math.abs(closeRubberBandOffset) < 0.3) {
            closeRubberBandOffset = 0
            isCloseRubberBanding = false
            accumulatedCloseDeltaX = 0
        } else {
            requestAnimationFrame(snapBackCloseRubberBand)
        }
    }
    
    function handleTabContentScrollEnd() {
        if (isRubberBanding && rubberBandOffset !== 0) {
            snapBackRubberBand()
        }
        if (isCloseRubberBanding && closeRubberBandOffset !== 0) {
            snapBackCloseRubberBand()
        }
    }
    

    
    function exitMultiSpaceMode() {
        // Store active space before any changes
        const activeSpace = data.spaceMeta.activeSpace
        
        // Start closing animation
        isClosingMultiSpace = true
        closeRubberBandOffset = 0
        accumulatedCloseDeltaX = 0
        isCloseRubberBanding = false
        
        // After transition completes, fully reset state and scroll to active space
        setTimeout(() => {
            multiSpaceMode = false
            isClosingMultiSpace = false
            rubberBandOffset = 0
            accumulatedDeltaX = 0
            // Reset hover state so sidebar collapses properly
            isHovered = false
            
            // Wait for DOM to update, then scroll to active space
            setTimeout(() => {
                if (tabListRef && activeSpace) {
                    const targetElement = tabListRef.querySelector(`[data-space-id="${activeSpace}"]`)
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'instant', inline: 'start' })
                    }
                }
            }, 50)
        }, 300) // Match the transition duration
    }
    
    // Lane divider resize handling
    function handleLaneDividerMouseDown(event) {
        event.preventDefault()
        event.stopPropagation()
        isResizingLanes = true
        resizeStartX = event.clientX
        resizeStartWidth = spaceWidth || customTabSidebarWidth || baseWidth
        
        document.addEventListener('mousemove', handleLaneDividerMouseMove)
        document.addEventListener('mouseup', handleLaneDividerMouseUp)
    }
    
    function handleLaneDividerMouseMove(event) {
        if (!isResizingLanes) return
        
        const deltaX = event.clientX - resizeStartX
        const newWidth = Math.max(200, Math.min(500, resizeStartWidth + deltaX))
        spaceWidth = newWidth
    }
    
    function handleLaneDividerMouseUp() {
        isResizingLanes = false
        document.removeEventListener('mousemove', handleLaneDividerMouseMove)
        document.removeEventListener('mouseup', handleLaneDividerMouseUp)
    }

    function setTabGroupMaxHeight(height) {
        tabGroupMaxHeight = Math.max(86, Math.min(window.innerHeight - 120, height))
    }

    function startGroupResize(event, groupId) {
        if (event.button !== 0 || tabDrag.active || tabDrag.pending) return
        event.preventDefault()
        event.stopPropagation()
        closeHovercard()
        if (hoverTimeout) { clearTimeout(hoverTimeout); hoverTimeout = null }
        const content = event.currentTarget.parentElement.querySelector('.tab-group-content')
        const style = getComputedStyle(content)
        const padding = style.boxSizing === 'border-box' ? 0 : parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        groupResize = { groupId, pointerId: event.pointerId, startY: event.clientY, startHeight: content.clientHeight - padding }
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    function moveGroupResize(event) {
        if (event.pointerId !== groupResize?.pointerId) return
        setTabGroupMaxHeight(groupResize.startHeight + event.clientY - groupResize.startY)
    }

    function endGroupResize(event) {
        if (event.pointerId !== groupResize?.pointerId) return
        groupResize = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (!event.currentTarget.closest('.sidebar-box')?.matches(':hover')) handleMouseLeave()
    }

    function handleGroupResizeKey(event) {
        if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        setTabGroupMaxHeight(event.key === 'Home' ? defaultTabGroupMaxHeight : tabGroupMaxHeight + (event.key === 'ArrowDown' ? 20 : -20))
    }
    
    function addTabsListSpacer(spaceId = data.spaceMeta.activeSpace) {
        if (!spaceId || tabSearchQuery || data.spaces[spaceId]?.tabs?.[0]?.type === 'divider') return

        const tabsList = tabListRef?.querySelector(`[data-space-id="${spaceId}"] .tabs-list`)
        if (tabsList) {
            tabsList.scrollTop = 0
        }

        data.addDivider(spaceId)
    }

    // Initialize spaces scroll fade state when spacesListRef is available or spaces change
    $effect(() => {
        if (spacesListRef) {
            data.spaceMeta.spaceOrder // dependency to re-check when spaces change
            setTimeout(updateSpacesScrollFade, 0)
        }
    })

    let isSwitchingSpaces = false

    function handleSpaceClick(event, spaceId) {
        // Right-click (button 2) - show context menu
        if (event.button === 2) {
            event.preventDefault()
            event.stopPropagation()
            
            // Calculate menu position based on mouse coordinates with offset
            contextMenuPosition = {
                x: event.clientX - 10,
                y: event.clientY - 30
            }
            
            spaceContextMenuId = spaceContextMenuId === spaceId ? null : spaceId
            contextMenuJustOpened = true
            // Reset flag after a longer delay to prevent mouseup from closing menu immediately
            setTimeout(() => { contextMenuJustOpened = false }, 500)
            return
        }
        
        // Left-click (button 0) - switch space
        if (event.button === 0) {
            // If clicking the currently active space, switch to previous active space
            if (data.spaceMeta.activeSpace === spaceId) {
                // Only switch to previous space if the current space is already scrolled into view
                if (currentScrolledSpace === spaceId || currentScrolledSpace === null) {
                    const previousSpace = data.getPreviousActiveSpace()
                    if (previousSpace && data.spaces[previousSpace]) {
                        spaceId = previousSpace
                    } else {
                        return
                    }
                } else {
                    // If not scrolled into view, just scroll it into view without switching spaces
                    isManualScroll = true
                    scrollToCurrentSpace('smooth')
                    setTimeout(() => { isManualScroll = false }, 500)
                    return
                }
            }
            
            // Set flag to prevent scroll-triggered tab activation during space switch
            isSwitchingSpaces = true
            
            // Close multi-space mode when switching spaces
            if (multiSpaceMode) {
                exitMultiSpaceMode()
            }
            
            data.activateSpace(spaceId)
            
            // Restore the active tab for this space from its activeTabsOrder
            const targetSpace = data.spaces[spaceId]
            if (targetSpace?.activeTabsOrder?.length > 0) {
                // Find the first valid (non-closed, non-pinned) tab from the order
                for (const historyEntry of targetSpace.activeTabsOrder) {
                    const tabId = typeof historyEntry === 'string' ? historyEntry : historyEntry?.id
                    if (!tabId) {
                        continue
                    }

                    const tab = data.docs[tabId]
                    if (tab && !tab.archive && !tab.pinned) {
                        data.activate(tabId)
                        break
                    }
                }
            } else if (targetSpace?.tabs?.length > 0) {
                // Fallback: activate the first tab in the space
                const firstNonPinned = targetSpace.tabs.find(t => t.type === 'tab' && !t.pinned)
                if (firstNonPinned) {
                    data.activate(firstNonPinned.id)
                }
            }
            
            previousSpaceIndex = data.spaceMeta.spaceOrder.indexOf(spaceId)
            isManualScroll = true
            scrollToCurrentSpace('smooth')
            setTimeout(() => { 
                isManualScroll = false 
                isSwitchingSpaces = false
            }, 500)
        }
    }

    function activateTab(tabId, spaceId) {
        // Close multi-space mode when switching tabs, but not during drag
        if (multiSpaceMode && !tabDrag.active && !tabDrag.pending) {
            exitMultiSpaceMode()
        }
        
        // If clicking on the currently active tab, switch to previous tab
        data.activateSpace(spaceId)
        const tab = data.docs[tabId]
        
        // For unpinned tabs, use the original behavior
        if (tabId === data.spaceMeta.activeTabId) {
            // For pinned tabs, don't activate them in the sidebar (they should only toggle visibility from main tabs)
            // For now, just do nothing for pinned tabs in sidebar
            if (tab?.pinned) {
                return
            }
            data.previous()
        } else {
            data.activate(tabId)
        }   
    }

    let currentScrolledSpace = $state(null)
    let hoveredSpaceInMultiMode = $state(null)

    function handleTabScroll(event) {
        if (!tabListRef) return
        
        // console.log('[DEBUG:SCROLL] Tab list scroll event', {
        //     scrollLeft: tabListRef.scrollLeft,
        //     scrollTop: event.target.scrollTop,
        //     clientWidth: tabListRef.clientWidth,
        //     isHorizontalScroll: event.target === tabListRef,
        //     target: event.target.className,
        //     pointerEvents: window.getComputedStyle(event.target).pointerEvents,
        //     zIndex: window.getComputedStyle(event.target).zIndex
        // })
        
        const scrollLeft = tabListRef.scrollLeft
        const containerWidth = tabListRef.clientWidth
        const spaceWidth = containerWidth + 20
        const newIndex = Math.floor((scrollLeft + spaceWidth / 2) / spaceWidth)
        
        if ( newIndex >= 0 && newIndex < data.spaceMeta.spaceOrder.length) {
            currentScrolledSpace = data.spaceMeta.spaceOrder[newIndex]

            // Skip space activation during programmatic scrolling, but keep its highlight in sync
            if (isSwitchingSpaces) return
    //         if (scrollActiveSpaceTimeout) {
    //             clearTimeout(scrollActiveSpaceTimeout)
    //         }
            
    //         scrollActiveSpaceTimeout = setTimeout(() => {
    //             // Double-check that we're still on the same space after the delay
    //             const currentScrollLeft = tabListRef.scrollLeft
    //             const currentContainerWidth = tabListRef.clientWidth
    //             const currentSpaceWidth = currentContainerWidth + 20
    //             const currentIndex = Math.floor((currentScrollLeft + currentSpaceWidth / 2) / currentSpaceWidth)
                
    //             if (currentIndex === newIndex && currentIndex >= 0 && currentIndex < data.spaceMeta.spaceOrder.length) {
    //                 isManualScroll = true
    //                 data.spaceMeta.activeSpace = data.spaceMeta.spaceOrder[currentIndex]
    //                 setTimeout(() => { isManualScroll = false }, 1500)
    //             }
                
    //             scrollActiveSpaceTimeout = null
    //         }, 340)
        } else {
            // currentScrolledSpace = null
        }
    }
    
    function handleMenuToggle(spaceId) {
        openMenuId = openMenuId === spaceId ? null : spaceId
    }
    
    function handleMenuItemClick(action, spaceId) {
        console.log(`Action: ${action} for space: ${data.spaces[spaceId].name}`)
        
        setTimeout(() => {
            if (action === 'rename') {
                startRename(spaceId)
            } else if (action === 'change-color') {
                colorPickerFromMenu = true
                colorPickerSpaceId = spaceId
            } else if (action === 'change-icon') {
                console.log('Change icon for space:', spaceId)
            } else if (action === 'container') {
                console.log('Container for space:', spaceId)
            } else if (action === 'delete') {
                console.log('Delete space:', spaceId)
            }
            
            openMenuId = null
        }, 10)
    }

    function startRename(spaceId) {
        renamingSpaceId = spaceId
        renameInputValue = data.spaces[spaceId].name
        requestAnimationFrame(() => {
            renameInputRef?.focus()
            renameInputRef?.select()
        })
    }

    function commitRename() {
        if (renamingSpaceId && renameInputValue.trim()) {
            data.updateSpace(renamingSpaceId, { name: renameInputValue.trim() })
        }
        renamingSpaceId = null
    }

    function handleRenameKeydown(e) {
        if (e.key === 'Enter') {
            commitRename()
        } else if (e.key === 'Escape') {
            renamingSpaceId = null
        }
    }

    function pickColor(spaceId, color) {
        data.updateSpace(spaceId, { color })
        colorPickerSpaceId = null
    }
    
    function handleClickOutside(event) {
        if (openMenuId !== null && !event.target.closest('.space-menu')) {
            openMenuId = null
        }
        if (newSpaceMenuOpen && !event.target.closest('.new-space-menu')) {
            newSpaceMenuOpen = false
        }
        if (spaceContextMenuId !== null && !event.target.closest('.space-context-menu-dropdown') && !event.target.closest('.space-item') && !contextMenuJustOpened) {
            spaceContextMenuId = null
        }
        if (colorPickerSpaceId !== null && !event.target.closest('.color-picker-dropdown') && !event.target.closest('.space-menu-item') && !event.target.closest('.space-context-menu-item')) {
            colorPickerSpaceId = null
        }
        if (renamingSpaceId !== null && !event.target.closest('.space-title-rename') && !event.target.closest('.space-menu-item') && !event.target.closest('.space-context-menu-item')) {
            commitRename()
        }
        if (urlBarExpanded && !event.target.closest('.url-bar-container')) {
            urlBarExpanded = false
            // Reset hover state since URL bar is no longer expanded
            if (!event.target.closest('.sidebar-box')) {
                isHovered = false
            }
        }
    }
    
    function handleMouseUpOutside(event) {
        if (spaceContextMenuId !== null && !event.target.closest('.space-context-menu-dropdown') && !contextMenuJustOpened) {
            spaceContextMenuId = null
        }
    }

    function handleNewSpaceMenuToggle() {
        newSpaceMenuOpen = !newSpaceMenuOpen
    }

    function handleNewSpaceMenuAction(action) {
        newSpaceMenuOpen = false

        if (action === 'new-space') {
            console.log('Creating new space...')
            data.newSpace()
        } else if (action === 'new-divider') {
            addTabsListSpacer()
        } else if (action === 'new-folder') {
            data.newFolder()
        }
    }
    
    function handleClosedTabsMouseEnter() {
        if (closedTabsHideTimeout) {
            clearTimeout(closedTabsHideTimeout)
            closedTabsHideTimeout = null
        }
        closedTabsHovered = true
    }
    
    function handleClosedTabsMouseLeave() {
        if (closedTabsHideTimeout) {
            clearTimeout(closedTabsHideTimeout)
            closedTabsHideTimeout = null
        }
        closedTabsHideTimeout = setTimeout(() => {
            // Don't close if hovercard is open for a closed tab
            if (hoveredTab && data.spaceMeta.closedTabs.some(t => t.id === hoveredTab.id)) {
                return
            }
            closedTabsHovered = false
        }, 200)
    }
    
    let lastScrolledTabId = $state(null)
    let scrollHoverTimeout = null
    let tabsListScrolled = $state({})
    let tabsListScrolledBottom = $state({})
    
    function handleTabsListScroll(event) {
        const tabsList = event.target
        const spaceId = tabsList.closest('[data-space-id]')?.getAttribute('data-space-id')
        if (spaceId) {
            tabsListScrolled[spaceId] = tabsList.scrollTop > 0
            // Check if not scrolled to bottom (can still scroll down)
            const isAtBottom = tabsList.scrollHeight - tabsList.scrollTop <= tabsList.clientHeight + 1
            tabsListScrolledBottom[spaceId] = !isAtBottom
        }

        
        // Manually trigger hover when scrolling moves tabs under cursor
        if (scrollHoverTimeout) {
            clearTimeout(scrollHoverTimeout)
        }
        
        scrollHoverTimeout = setTimeout(() => {
            const mouseX = window.mouseX || 0
            const mouseY = window.mouseY || 0
            const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
            const tabContainer = elementUnderCursor?.closest('.tab-item-container')
            
            if (tabContainer && instantHovercardsMode) {
                const tabId = tabContainer.getAttribute('data-tab-id')
                if (tabId && tabId !== lastScrolledTabId && tabId !== hoveredTab?.id) {
                    // console.log('[DEBUG:SCROLL] Triggering hover for tab under cursor after scroll', tabId)
                    const tab = data.docs[tabId]
                    if (tab) {
                        // Create a synthetic event for handleTabMouseEnter
                        const syntheticEvent = {
                            target: tabContainer,
                            clientX: mouseX,
                            clientY: mouseY
                        }
                        handleTabMouseEnter(tab, syntheticEvent)
                        lastScrolledTabId = tabId
                    }
                }
            }
        }, 150) // Small delay after scroll stops
    }
    
    // onMount(() => {
    //     scrollToCurrentSpace('instant')
    //     previousSpaceIndex = data.spaceMeta.spaceOrder.indexOf(data.spaceMeta.activeSpace)
    // })

    // Watch for changes in space order that might affect current space position
    $effect(() => {
        const currentIndex = data.spaceMeta.spaceOrder.indexOf(untrack(() => data.spaceMeta.activeSpace))
        if (currentIndex !== -1 && currentIndex !== previousSpaceIndex && tabListRef && !isManualScroll) {
            scrollToCurrentSpace('instant')
        }
        if (currentIndex !== -1) {
            previousSpaceIndex = currentIndex
        }
    })

    // Watch for active space changes and scroll space button into view
    $effect(() => {
        if (data.spaceMeta.activeSpace && spacesListRef) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                scrollActiveSpaceIntoView()
            }, 50)
        }
    })

    // Watch for active tab changes and scroll to it in sidebar
    $effect(() => {
        if (!data.spaceMeta.activeTabId) {
            return
        }
        
        // Find the active tab element in the sidebar
        setTimeout(() => {
            let activeTabElement = document.querySelector(`.sidebar .tab-item-container[data-tab-id="${data.spaceMeta.activeTabId}"]`)
            if (!activeTabElement || activeTabElement.closest('.tab-group-scroll[hidden]')) {
                activeTabElement = document.querySelector(`.sidebar [data-tab-group-id="${data.docs[data.spaceMeta.activeTabId]?.tabGroupId}"]`)
            }
            if (activeTabElement) {
                const tabsList = activeTabElement.closest('.tabs-list')
                if (tabsList) {
                    console.log('%c[TAB-DEBUG] TabSidebar scrolling active tab into view: ' + data.spaceMeta.activeTabId, 'color: #d946ef; font-weight: bold; font-size: 13px')
                    // Scroll the tab into view within its tabs list
                    activeTabElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest'
                    })
                }
            }
        }, 50) // Small delay to ensure DOM is updated
    })

    // Initialize bottom scroll fade state when tabs lists render or change
    $effect(() => {
        data.spaceMeta.spaceOrder // dependency on spaces
        setTimeout(() => {
            const tabsLists = document.querySelectorAll('.tabs-list')
            tabsLists.forEach(tabsList => {
                const spaceId = tabsList.closest('[data-space-id]')?.getAttribute('data-space-id')
                if (spaceId) {
                    const isAtBottom = tabsList.scrollHeight - tabsList.scrollTop <= tabsList.clientHeight + 1
                    tabsListScrolledBottom[spaceId] = !isAtBottom
                }
            })
        }, 100)
    })
    
    // Track global mouse position and log pointer event state
    $effect(() => {
        const handleMouseMove = (e) => {
            window.mouseX = e.clientX
            window.mouseY = e.clientY
        }
        
        const handlePointerEvent = (e) => {
            const target = e.target
            if (target.closest('.tabs-list') || target.closest('.tab-item-container')) {
                console.log('[DEBUG:POINTER] Pointer event on tab area', {
                    type: e.type,
                    target: target.className,
                    pointerEvents: window.getComputedStyle(target).pointerEvents,
                    zIndex: window.getComputedStyle(target).zIndex,
                    mouseX: e.clientX,
                    mouseY: e.clientY
                })
            }
        }
        
        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('pointerenter', handlePointerEvent, true)
        window.addEventListener('pointerleave', handlePointerEvent, true)
        
        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('pointerenter', handlePointerEvent, true)
            window.removeEventListener('pointerleave', handlePointerEvent, true)
        }
    })

    // Watch for new closed tabs and auto-show menu, might be a bit much?
    // $effect(() => {
    //     const currentLength = data.spaceMeta.closedTabs.length
    //     if (currentLength > previousClosedTabsLength) {
    //         // New tab was closed, show menu
    //         if (closedTabsHideTimeout) {
    //             clearTimeout(closedTabsHideTimeout)
    //         }
    //         closedTabsHovered = true
    //         closedTabsHideTimeout = setTimeout(() => {
    //             closedTabsHovered = false
    //             closedTabsHideTimeout = null
    //         }, 1000)
    //     }
    //     previousClosedTabsLength = currentLength
    // })
    
    // Cleanup timeouts on component destroy
    $effect(() => {
        return () => {
            if (closedTabsHideTimeout) {
                clearTimeout(closedTabsHideTimeout)
            }
            if (hoverTimeout) {
                clearTimeout(hoverTimeout)
            }
            if (hovercardResetTimer) {
                clearTimeout(hovercardResetTimer)
            }
            stopHovercardPositionCheck()
        }
    })
    
    function revealGroupActivationTab(element) {
        if (tabDrag.active || tabDrag.pending || groupResize) return
        const wrapper = element.closest('.tab-group-wrapper.expanded')
        const content = wrapper?.querySelector('.tab-group-content')
        const target = content?.querySelector('.group-activation-target')
        if (!target) return
        const bounds = content.getBoundingClientRect()
        const row = target.getBoundingClientRect()
        // Keep the target clear of the group's overflow fades without scrolling the sidebar.
        const top = bounds.top + 16
        const bottom = bounds.bottom - 16
        if (row.top < top) content.scrollTop += row.top - top
        else if (row.bottom > bottom) content.scrollTop += row.bottom - bottom
    }

    function handleGroupPointerOver(event) {
        const wrapper = event.currentTarget
        const content = wrapper.querySelector('.tab-group-scroll')
        if (content?.contains(event.target)) return
        if (wrapper.contains(event.relatedTarget) && !content?.contains(event.relatedTarget)) return
        revealGroupActivationTab(wrapper)
    }

    function getSidebarHoverTarget(element, fallbackTab = null) {
        const row = element?.closest('.tab-item-container, .closed-tab-item, .pinned-tab, .app-tab')
        const header = element?.closest('.tab-group-wrapper > .tab-group')
        if (!row && header) {
            const wrapper = header.closest('.tab-group-wrapper')
            const spaceId = header.closest('.space-content')?.dataset.spaceId
            const group = data.getTabGroup(wrapper.dataset.tabId, spaceId)
            if (!group) return null
            return { element: header, tab: data.getGroupActiveTab(group, spaceId), group: { tabId: group.tabs[0].id, spaceId, id: group.id }, tabs: group.tabs }
        }
        if (!row) return null
        const tabId = row.getAttribute('data-tab-id')
        const tab = fallbackTab || data.docs[tabId] || data.spaceMeta.closedTabs.find(tab => tab.id === tabId)
        return tab ? { element: row, tab, group: null, tabs: [tab] } : null
    }

    function isCurrentHoverTarget(target) {
        return target?.group
            ? hoveredGroupTarget?.id === target.group.id && hoveredGroupTarget?.spaceId === target.group.spaceId
            : !hoveredGroupTarget && target?.tab.id === hoveredTab?.id
    }

    function updateHovercardPosition(position) {
        if (position.x !== hovercardPosition.x || position.y !== hovercardPosition.y) hovercardPosition = position
    }

    function showSidebarHovercard(target) {
        if (tabDrag.active || !target.element.isConnected) return
        hovercardAnchor = target.group ? target.element.closest('.tab-group-wrapper') : target.element
        hovercardHistoryBeside = canFitSidebarHovercardHistory(hovercardAnchor.getBoundingClientRect(), window.innerWidth)
        hovercardPosition = getSidebarHovercardPosition(
            hovercardAnchor.getBoundingClientRect(), target.group ? 336 : 328,
            target.tabs.reduce((height, tab) => height + (tab.screenshot ? 260 : 80) + 8, 0), window.innerWidth, window.innerHeight
        )
        hoveredGroupTarget = target.group
        hoveredTab = target.tab
        expandedHovercardTabs = {}
        expandedHovercardHistoryTabId = null
        hovercardUrlBarExpanded = false
        hovercardShowTime = Date.now()
        instantHovercardsMode = true
    }

    function activateHovercardTab(tab) {
        if (data.spaceMeta.activeSpace !== tab.spaceId) data.activateSpace(tab.spaceId)
        if (data.spaceMeta.activeTabId !== tab.id) data.activate(tab.id)
    }

    function closeHovercardTab(tab) {
        const remaining = hovercardTabs.filter(member => member.id !== tab.id)
        data.closeTab(tab.spaceId, tab.id)
        if (expandedHovercardHistoryTabId === tab.id) expandedHovercardHistoryTabId = null
        delete expandedHovercardTabs[tab.id]
        hovercardUrlBarExpanded = Object.values(expandedHovercardTabs).some(Boolean)
        if (hoveredGroupTarget && remaining.length) {
            hoveredGroupTarget = { ...hoveredGroupTarget, tabId: remaining[0].id }
            hoveredTab = remaining[0]
        } else {
            closeHovercard()
        }
    }

    function startHovercardPositionCheck() {
        stopHovercardPositionCheck()
        
        hovercardCheckInterval = setInterval(() => {
            if (!hoveredTab) {
                stopHovercardPositionCheck()
                return
            }
            
            const mouseX = window.mouseX || 0
            const mouseY = window.mouseY || 0
            const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
            
            if (!elementUnderCursor) {
                closeHovercard()
                stopHovercardPositionCheck()
                return
            }
            
            // Check if cursor is still over the triggering element or the hovercard
            let isStillHovering = false
            
            // Check if hovering over the hovercard (including history list and screenshot)
            if (elementUnderCursor.closest('.tab-hovercard-sidebar')) {
                isStillHovering = true
            } else {
                const target = getSidebarHoverTarget(elementUnderCursor)
                if (target) {
                    if (!isCurrentHoverTarget(target) && instantHovercardsMode) showSidebarHovercard(target)
                    isStillHovering = true
                }
            }
            
            if (!isStillHovering) {
                closeHovercard()
                if (!hovercardUrlBarExpanded) {
                    stopHovercardPositionCheck()
                    
                    instantModeResetTimer = setTimeout(() => {
                        instantHovercardsMode = false
                        instantModeResetTimer = null
                    }, 1000)
                }
            }
        }, 50)
    }
    
    function stopHovercardPositionCheck() {
        if (hovercardCheckInterval) {
            clearInterval(hovercardCheckInterval)
            hovercardCheckInterval = null
        }
    }
    
    function handleTabMouseEnter(tab, event) {
        if (tabDrag.active) return
        const target = getSidebarHoverTarget(event.target, tab)
        if (!target) return
        // console.log('[DEBUG:HOVER] Tab mouse enter', {
        //     tabId: tab.id,
        //     tabTitle: tab.title,
        //     targetElement: event.target.className,
        //     pointerEvents: window.getComputedStyle(event.target).pointerEvents,
        //     zIndex: window.getComputedStyle(event.target).zIndex,
        //     mouseX: event.clientX,
        //     mouseY: event.clientY,
        //     instantMode: instantHovercardsMode
        // })
        
        // Reset close button hover state when entering a new tab
        closeButtonHovered = false
        closeButtonHoveredDelayed = false
        if (closeButtonHoverTimer) {
            clearTimeout(closeButtonHoverTimer)
            closeButtonHoverTimer = null
        }
        
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
        }
        
        const delay = instantHovercardsMode ? 0 : 800
        
        hoverTimeout = setTimeout(() => {
            if (instantModeResetTimer) {
                clearTimeout(instantModeResetTimer)
            }
            showSidebarHovercard(target)
            
            if (hovercardResetTimer) {
                clearTimeout(hovercardResetTimer)
            }
            
            // Start checking cursor position
            startHovercardPositionCheck()
        }, delay)
    }

    function handleTabMouseLeave(event) {
        // console.log('[DEBUG:HOVER] Tab mouse leave', {
        //     targetElement: event?.target?.className,
        //     currentHoveredTab: hoveredTab?.id,
        //     mouseX: window.mouseX,
        //     mouseY: window.mouseY
        // })
        
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
        }
        
        setTimeout(() => {
            if (hovercardShowTime && Date.now() - hovercardShowTime < 300) {
                return
            }
            
            const mouseX = window.mouseX || 0
            const mouseY = window.mouseY || 0
            const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
            
            // console.log('[DEBUG:HOVER] Checking if still hovering', {
            //     elementUnderCursor: elementUnderCursor?.className,
            //     isOverInfo: !!elementUnderCursor?.closest('.hovercard-info'),
            //     isOverHovercard: !!elementUnderCursor?.closest('.tab-hovercard-sidebar')
            // })
            
            // Check if still over info or hovercard
            const isOverInfo = elementUnderCursor?.closest('.hovercard-info')
            const isOverHovercard = elementUnderCursor?.closest('.tab-hovercard-sidebar')
            
            if (!isOverInfo && !isOverHovercard && !getSidebarHoverTarget(elementUnderCursor)) {
                // console.log('[DEBUG:HOVER] Clearing hovered tab')
                closeHovercard()
                if (!hovercardUrlBarExpanded) {
                    stopHovercardPositionCheck()
                }
            }
        }, 250)
    }
    
    function handleSpaceContextMenuAction(action, spaceId) {
        if (action === 'rename') {
            startRename(spaceId)
        } else if (action === 'change-color') {
            colorPickerFromMenu = false
            colorPickerSpaceId = spaceId
        } else if (action === 'change-icon') {
            console.log('Change icon for space:', spaceId)
        } else if (action === 'container') {
            console.log('Container for space:', spaceId)
        } else if (action === 'delete') {
            console.log('Delete space:', spaceId)
        }
        
        spaceContextMenuId = null
    }

    function handleAppsToggle() {
        onShowApps()
    }
    
    const partitions = [
        'persist:1',
        'persist:2',
        'persist:3',
        'ephemeral:1',
        'ephemeral:2',
        'ephemeral:3'
    ]

    async function handleNewFromClipboard(spaceId) {
        try {
            const text = (await navigator.clipboard.readText())?.trim()
            if (!text) {
                const tab = await data.newTab(spaceId, { shouldFocus: true })
                if (tab) {
                    data.activateSpace(spaceId)
                    data.activate(tab.id)
                }
                return
                }

            let url = text
            try {
                // If scheme missing, try with https
                if (!/^https?:\/\//i.test(url)) {
                    new URL('https://' + url)
                    url = 'https://' + url
                } else {
                    new URL(url)
                }
            } catch (e) {
                // Fallback to about:newtab if invalid
                url = 'about:newtab'
            }

            const tab = await data.newTab(spaceId, { url, shouldFocus: true })
            if (tab) {
                data.activateSpace(spaceId)
                data.activate(tab.id)
            }
        } catch (err) {
            const tab = await data.newTab(spaceId, { shouldFocus: true })
            if (tab) {
                data.activateSpace(spaceId)
                data.activate(tab.id)
            }
        }
    }

    async function handleNewTabInPartition(spaceId, partition) {
        const tab = await data.newTab(spaceId, { shouldFocus: true })
        if (tab) {
            // In-memory assignment mirrors App.svelte partition handling
            data.docs[tab.id].partition = partition
            const space = data.spaces[spaceId]
            const idx = space.tabs.findIndex(t => t.id === tab.id)
            if (idx !== -1) {
                space.tabs[idx].partition = partition
            }
            data.activateSpace(spaceId)
            data.activate(tab.id)
        }
    }

    // function handleUrlSubmit() {
    //     if (!urlInputValue.trim() || !data.spaceMeta.activeTabId) {
    //         urlBarExpanded = false
    //         return
    //     }
        
    //     try {
    //         let url = new URL(urlInputValue)
    //         data.navigate(data.spaceMeta.activeTabId, url.href)
    //     } catch {
    //         // Not a valid URL, treat as search
    //         const defaultSearchEngine = localStorage.getItem('defaultSearchEngine') || 'google'
    //         let searchUrl
            
    //         switch (defaultSearchEngine) {
    //             case 'kagi':
    //                 searchUrl = new URL('https://kagi.com/search')
    //                 break
    //             case 'custom':
    //                 const customUrl = localStorage.getItem('customSearchUrl')
    //                 if (customUrl) {
    //                     try {
    //                         searchUrl = new URL(customUrl + encodeURIComponent(urlInputValue))
    //                         data.navigate(data.spaceMeta.activeTabId, searchUrl.href)
    //                         urlBarExpanded = false
    //                         return
    //                     } catch {
    //                         // Fallback to Google if custom URL is invalid
    //                         searchUrl = new URL('https://www.google.com/search')
    //                     }
    //                 } else {
    //                     searchUrl = new URL('https://www.google.com/search')
    //                 }
    //                 break
    //             default: // google
    //                 searchUrl = new URL('https://www.google.com/search')
    //                 break
    //         }
            
    //         searchUrl.searchParams.set('q', urlInputValue)
    //         data.navigate(data.spaceMeta.activeTabId, searchUrl.href)
    //     }
        
    //     urlBarExpanded = false
    // }

    // Navigation button handlers
    function handleBackClick() {
        if (onGoBack) {
            onGoBack()
        }
    }

    function handleForwardClick() {
        if (onGoForward) {
            onGoForward()
        }
    }

    function handleReloadClick() {
        if (onReload) {
            onReload()
        }
    }

    function handleCloseTabClick() {
        if (onCloseTab) {
            onCloseTab()
        }
    }

    function handleTabContextMenu(event, tab, index) {
        event.preventDefault()
        event.stopPropagation()
        
        console.log('[DEBUG:TabContextMenu] Right-click on tab', tab.id, tab.title)
        
        if (tabContextMenu.visible) {
            hideTabContextMenu()
            return
        }
        
        tabContextMenu = {
            visible: true,
            x: event.clientX,
            y: event.clientY,
            tab: tab,
            index: index
        }
        tabContextMenuOpenTime = Date.now()
        console.log('[DEBUG:TabContextMenu] Menu opened at', event.clientX, event.clientY)
    }
    
    function hideTabContextMenu() {
        tabContextMenu = { visible: false, x: 0, y: 0, tab: null, index: null }
    }

    async function handleCopyUrlClick() {
        const activeTab = data.docs[data.spaceMeta.activeTabId]
        if (activeTab?.url) {
            try {
                await navigator.clipboard.writeText(activeTab.url)
                copyUrlSuccess = true
                setTimeout(() => {
                    copyUrlSuccess = false
                }, 1500) // Show checkmark for 1.5 seconds
            } catch (err) {
                console.error('Failed to copy URL:', err)
            }
        }
    }

    async function handleDevToolsClick() {
        try {
            // Get dev tools list to find the correct context ID
            const response = await cdpFetch('/json/list')
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            const devToolsData = await response.json()
            
            const activeTab = data.docs[data.spaceMeta.activeTabId]
            if (!activeTab?.url) return
            
            // Find matching dev tools entry for current tab URL
            let matchingItem = devToolsData.find(item => {
                return item.url === activeTab.url || item.title === activeTab.title
            })
            
            // If multiple URLs exist for the same site, use hash trick to find correct ID
            if (!matchingItem && devToolsData.length > 1) {
                const originalUrl = activeTab.url
                const randomHash = Math.random().toString(36).substring(2, 15)
                
                try {
                    // Change URL hash to identify this specific tab
                    const urlWithHash = originalUrl.includes('#') 
                        ? originalUrl.replace(/#.*$/, `#${randomHash}`)
                        : `${originalUrl}#${randomHash}`
                    
                    // Navigate to the URL with hash
                    data.navigate(data.spaceMeta.activeTabId, urlWithHash)
                    
                    // Wait a moment for the change to register
                    await new Promise(resolve => setTimeout(resolve, 1))
                    
                    // Fetch updated dev tools list
                    const updatedResponse = await cdpFetch('/json/list')
                    if (updatedResponse.ok) {
                        const updatedData = await updatedResponse.json()
                        matchingItem = updatedData.find(item => item.url?.includes(randomHash))
                    }
                    
                    // Restore original URL
                    data.navigate(data.spaceMeta.activeTabId, originalUrl)
                } catch (err) {
                    console.warn('Hash trick failed:', err)
                }
            }
            
            // Default to first item if still no match
            if (!matchingItem && devToolsData.length > 0) {
                matchingItem = devToolsData[0]
            }
            
            if (matchingItem?.devtoolsFrontendUrl) {
                // The API supplies the matching frontend and the launcher's debugger URL.
                const localDevToolsUrl = matchingItem.devtoolsFrontendUrl
                
                await data.newTab(data.spaceMeta.activeSpace, { 
                    url: localDevToolsUrl, 
                    title: `DevTools - ${activeTab.title || 'Untitled'}`,
                    shouldFocus: true,
                    pinned: 'right'
                })
                
                // if (devToolsTab) {
                //     // Pin the dev tools tab to the right after a small delay to ensure DB persistence
                //     setTimeout(() => {
                //         data.pin({ tabId: devToolsTab.id, pinned: 'right' })
                //     }, 1)
                //     data.activate(devToolsTab.id)
                // }
            }
        } catch (err) {
            console.error('Failed to open dev tools:', err)
        }
    }

    function handleBackgroundDoubleClick() {
        if (data.spaceMeta.activeSpace) {
            const newTab = data.newTab(data.spaceMeta.activeSpace)
            if (newTab) {
                data.activate(newTab.id)
            }
        }
    }

</script>

<svelte:window onclick={(e) => { if (!tabContextMenu.visible) handleClickOutside(e); }} onmouseup={handleMouseUpOutside} onkeydown={(e) => { if (e.key === 'Escape') { if (tabContextMenu.visible) { hideTabContextMenu(); return; } handleClickOutside(e); if (newSpaceMenuOpen) newSpaceMenuOpen = false; if (spaceContextMenuId !== null) spaceContextMenuId = null; } }} />

{#if tabSidebarVisible}
    <div class="sidebar-window-drag" class:drag-enabled={isDragEnabled && !tabDrag.active && !tabDrag.pending && !isResizingTabSidebar && !tabContextMenu.visible}
         style:width="{customTabSidebarWidth || 263}px" aria-hidden="true"></div>
{/if}

<div class="sidebar-box" 
     class:hovered={isHovered || hoveredTab || urlBarExpanded || tabContextMenu.visible || ((tabDrag.active || tabDrag.pending) && sidebarOpenedBeforeDrag)}
     class:visible={tabSidebarVisible}
     class:resizing={isResizingTabSidebar}
     class:multi-space-mode={multiSpaceMode}
     onmouseenter={handleMouseEnter} 
     onmouseleave={handleMouseLeave}
     style="width: {multiSpaceMode ? (isClosingMultiSpace ? (customTabSidebarWidth || 263) + 'px' : `calc(100vw - ${closeRubberBandOffset}px)`) : ((customTabSidebarWidth || 263) + rubberBandOffset + (tabSidebarVisible ? 0 : 9)) + 'px'};"
     role="complementary"
     aria-label="Tab Sidebar">
    <div class="sidebar">
        {#if spaceContextMenuId}
    <div class="space-context-menu-overlay">
        <div class="space-context-menu-dropdown" 
            class:open={spaceContextMenuId !== null}
            style="top: {contextMenuPosition.y}px; left: {contextMenuPosition.x}px;">
            <button class="space-context-menu-item" 
                    onmouseup={() => handleSpaceContextMenuAction('rename', spaceContextMenuId)}
                    role="menuitem">Rename</button>
            <button class="space-context-menu-item"
                    onmouseup={() => handleSpaceContextMenuAction('change-color', spaceContextMenuId)}
                    role="menuitem">Change Color</button>
            <button class="space-context-menu-item"
                    onmouseup={() => handleSpaceContextMenuAction('change-icon', spaceContextMenuId)}
                    role="menuitem">Change Icon</button>
            <button class="space-context-menu-item"
                    onmouseup={() => handleSpaceContextMenuAction('container', spaceContextMenuId)}
                    role="menuitem">Container</button>
            <button class="space-context-menu-item delete"
                    onmouseup={() => handleSpaceContextMenuAction('delete', spaceContextMenuId)}
                    role="menuitem">Delete</button>
        </div>
    </div>
{/if}
        <div class="sidebar-content" class:no-url={!showUrl}>
            {#if multiSpaceMode}
                <button class="close-multi-space-button" 
                        onmousedown={exitMultiSpaceMode}
                        aria-label="Close expanded view">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                    </svg>
                </button>
            {/if}
            {#if showUrl}
                <UrlBar
                    url={data.docs[data.spaceMeta.activeTabId]?.url || ''}
                    tabId={data.spaceMeta.activeTabId}
                    expanded={urlBarExpanded}
                    showDevTools={devModeEnabled}
                    showSettingsButton={true}
                    onGoBack={handleBackClick}
                    onGoForward={handleForwardClick}
                    onReload={handleReloadClick}
                    onCloseTab={handleCloseTabClick}
                    onDevTools={handleDevToolsClick}
                    onExpandedChange={(v) => urlBarExpanded = v}
                />
            {/if}
            
            {#if isSearchModeActive}
                <div class="section search-section" class:multi-space={multiSpaceMode}>
                    <div class="tab-search-container">
                        <svg class="tab-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                        </svg>
                        <input type="text" class="tab-search-input" aria-label="Search tabs" placeholder="Search tabs..." bind:value={tabSearchQuery} bind:this={searchInputRef} onblur={() => { if (!tabSearchQuery) isSearchModeActive = false }} onkeydown={(e) => { if (e.key === 'Escape') { tabSearchQuery = ''; isSearchModeActive = false; searchInputRef?.blur(); } }} />
                        <button class="tab-search-clear" onmousedown={() => { tabSearchQuery = ''; isSearchModeActive = false; }} aria-label="Close search">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            {:else}
                <div class="section global-pins-section">
                    <div class="pinned-tabs-grid">
                        <button class="pinned-tab search-toggle-tab"
                                title="Search Tabs"
                                onmousedown={(e) => { e.stopPropagation(); isSearchModeActive = true; setTimeout(() => searchInputRef?.focus(), 50); }}
                                aria-label="Search tabs">
                            <svg class="search-toggle-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
                            </svg>
                        </button>
                        <button class="pinned-tab all-apps-tab"
                                title="All Apps"
                                onmousedown={(e) => { e.stopPropagation(); handleAppsToggle(); }}
                                aria-label="Show all apps">

                                <!-- <svg class="all-apps-icon" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
                                </svg> -->
                            <svg class="all-apps-icon" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                            </svg>
                        </button>
                        <!-- NOTE: Tabs are also rendered in App.svelte (top bar) - keep hibernated class in sync there too -->
                        {#each globallyPinnedTabs as tab (tab.id)}
                            <button class="pinned-tab" data-tab-id={tab.id} class:hibernated={data.isTabHibernated(tab.id)}
                                    onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                                    onmouseleave={handleTabMouseLeave}>
                                <Favicon {tab} showButton={false} />
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            {#if !tabSearchQuery}
                <div class="section">
                    <div class="spaces-container">
                        <div class="spaces-list-wrapper">
                        <div class="spaces-list-fade-left" class:visible={spacesScrolledLeft}></div>
                        <div class="spaces-list" bind:this={spacesListRef} onscroll={handleSpacesScroll}>
                            {#each data.spaceMeta.spaceOrder as spaceId}
                                <Tooltip text={data.spaces[spaceId].name} position="top" delay={300}>
                                    <button class="space-item" 
                                            class:active={data.spaceMeta.activeSpace === spaceId}
                                            class:scrolled={multiSpaceMode ? hoveredSpaceInMultiMode === spaceId : currentScrolledSpace === spaceId}
                                            data-space-id={spaceId}
                                            onmousedown={(e) => handleSpaceClick(e, spaceId)}
                                            oncontextmenu={(e) => e.preventDefault()}
                                            aria-label={`Switch to ${data.spaces[spaceId].name} space`}>
                                    {#if data.spaces[spaceId]?.glyph}
                                        <span class="space-glyph" style="color: {data.spaces[spaceId]?.color || 'rgba(255, 255, 255, 0.7)'}">{@html data.spaces[spaceId].glyph}</span>
                                    {:else}
                                        <span class="space-glyph-default" style="background-color: {data.spaces[spaceId]?.color || 'rgba(255, 255, 255, 0.7)'}"></span>
                                    {/if}
                                        </button>
                                </Tooltip>
                            {/each}
                        </div>
                        <div class="spaces-list-fade-right" class:visible={spacesScrolledRight}></div>
                    </div>
                    <div class="new-space-menu">
                        <button class="new-space-button"
                                onmousedown={(e) => { e.stopPropagation(); handleNewSpaceMenuToggle(); }}
                                aria-label="Create new space">
                            <svg class="plus-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/>
                            </svg>
                        </button>
                        {#if newSpaceMenuOpen}
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div class="menu-scrim" onmousedown={() => newSpaceMenuOpen = false}></div>
                        {/if}
                        <div class="new-space-menu-dropdown" class:open={newSpaceMenuOpen}>
                            <button class="new-space-menu-item"
                                    onmouseup={() => handleNewSpaceMenuAction('new-space')}
                                    role="menuitem">New Space</button>
                            <button class="new-space-menu-item"
                                    onmouseup={() => handleNewSpaceMenuAction('new-divider')}
                                    role="menuitem">New Divider</button>
                            <button class="new-space-menu-item"
                                    onmouseup={() => handleNewSpaceMenuAction('new-folder')}
                                    role="menuitem">New Folder</button>
                        </div>
                    </div>
                    </div>
                </div>
            {/if}

            <div class="section flex-1">
                <div class="tab-content-container"
                     class:multi-space={multiSpaceMode}
                     class:rubber-banding={isRubberBanding}
                     class:closing={isClosingMultiSpace}
                     class:horizontal-scrolling={isHorizontalScrolling}
                     class:searching={tabSearchQuery.length > 0}
                     bind:this={tabListRef}
                     onscroll={handleTabScroll}
                     onwheel={handleTabContentWheel}
                     onscrollend={handleTabContentScrollEnd}
                     onmousedown={(e) => {
                         if (multiSpaceMode && (e.target === tabListRef || e.target.closest('.tab-content-track') === e.target || e.target.closest('.tab-content-container') === e.target)) {
                             exitMultiSpaceMode()
                         }
                     }}
                     ondblclick={(e) => {
                         if (!multiSpaceMode) {
                             handleBackgroundDoubleClick()
                         }
                     }}
                     role="region"
                     aria-label="Tab content area - double-click to create new tab"
                     style=""
                    >
                    {#if tabSearchQuery && !hasAnySearchResults}
                        <div class="no-search-results">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <p>No tabs found for "{tabSearchQuery}"</p>
                        </div>
                    {/if}
                    <div class="tab-content-track" class:multi-space={multiSpaceMode}>
                        {#each data.spaceMeta.spaceOrder as spaceId, index (spaceId)}
                            {@const spacePins = data.getSpacePins(spaceId)}
                            {#if spaceHasMatchingTabs(spaceId)}
                                {#if multiSpaceMode && index > 0}
                                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                    <div class="lane-divider"
                                         onmousedown={handleLaneDividerMouseDown}
                                         role="separator"></div>
                                {/if}
                                <div class="space-content"
                                     class:multi-space={multiSpaceMode}
                                     data-space-id={spaceId}
                                     style={multiSpaceMode ? `width: ${spaceWidth || customTabSidebarWidth || baseWidth}px; min-width: ${spaceWidth || customTabSidebarWidth || baseWidth}px; flex-shrink: 0;` : ''}
                                     onmouseenter={() => { if (multiSpaceMode) hoveredSpaceInMultiMode = spaceId }}
                                     onmouseleave={() => { if (multiSpaceMode) hoveredSpaceInMultiMode = null }}
                                     role="group"
                                     aria-label="Space tabs">
                                <div class="space-title-container">
                                    {#if renamingSpaceId === spaceId}
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <input class="space-title-rename"
                                               bind:this={renameInputRef}
                                               bind:value={renameInputValue}
                                               onblur={commitRename}
                                               onkeydown={handleRenameKeydown} />
                                    {:else}
                                        <button class="space-title" 
                                                class:active={data.spaceMeta.activeSpace === spaceId}
                                                onmousedown={(e) => handleSpaceClick(e, spaceId)}
                                                oncontextmenu={(e) => e.preventDefault()}>
                                            {#if data.spaces[spaceId]?.glyph}
                                                <span class="space-title-glyph" style="color: {data.spaces[spaceId]?.color || 'rgba(255, 255, 255, 0.7)'}">{@html data.spaces[spaceId].glyph}</span>
                                            {:else}
                                                <span class="space-title-dot" style="background-color: {data.spaces[spaceId]?.color || 'rgba(255, 255, 255, 0.7)'}"></span>
                                            {/if}
                                            {data.spaces[spaceId].name}
                                        </button>
                                    {/if}
                                    {#if colorPickerSpaceId === spaceId}
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <div class="menu-scrim" onmousedown={() => colorPickerSpaceId = null}></div>
                                        <div class="color-picker-dropdown" class:from-menu={colorPickerFromMenu}>
                                            {#each spaceColors as c}
                                                <button class="color-swatch" 
                                                        class:active={data.spaces[spaceId]?.color === c.color}
                                                        style="background-color: {c.color}"
                                                        onmousedown={() => pickColor(spaceId, c.color)}
                                                        aria-label={c.name}></button>
                                            {/each}
                                        </div>
                                    {/if}
                                    <div class="space-menu">
                                        <button class="space-menu-button" 
                                                onmousedown={(e) => { e.stopPropagation(); handleMenuToggle(spaceId); }}
                                                aria-label="Space options">⋯</button>
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        {#if openMenuId === spaceId}
                                            <div class="menu-scrim" onmousedown={() => openMenuId = null}></div>
                                        {/if}
                                        <div class="space-menu-dropdown" class:open={openMenuId === spaceId}>
                                            <button class="space-menu-item" 
                                                    onmousedown={(e) => e.preventDefault()}
                                                    onmouseup={() => handleMenuItemClick('rename', spaceId)}
                                                    role="menuitem">Rename</button>
                                            <button class="space-menu-item"
                                                    onmousedown={(e) => e.preventDefault()}
                                                    onmouseup={() => handleMenuItemClick('change-color', spaceId)}
                                                    role="menuitem">Change Color</button>
                                            <button class="space-menu-item"
                                                    onmousedown={(e) => e.preventDefault()}
                                                    onmouseup={() => handleMenuItemClick('change-icon', spaceId)}
                                                    role="menuitem">Change Icon</button>
                                            <button class="space-menu-item"
                                                    onmousedown={(e) => e.preventDefault()}
                                                    onmouseup={() => handleMenuItemClick('container', spaceId)}
                                                    role="menuitem">Container</button>
                                            <button class="space-menu-item delete"
                                                    onmousedown={(e) => e.preventDefault()}
                                                    onmouseup={() => handleMenuItemClick('delete', spaceId)}
                                                    role="menuitem">Delete</button>
                                        </div>
                                    </div>
                                </div>
                                
                                {#if spacePins.length > 0}
                                    <div class="pinned-tabs-grid">
                                        {#each spacePins as tab (tab.id)}
                                            {#if tabMatchesSearch(tab)}
                                                <button class="app-tab" data-tab-id={tab.id} class:active={tab.id === data.spaceMeta.activeTabId} class:hibernated={data.isTabHibernated(tab.id)} title={tab.title || tab.url} aria-label={tab.title || tab.url} onmousedown={(e) => { if (e.button === 0) activateTab(tab.id, spaceId) }} oncontextmenu={(e) => handleTabContextMenu(e, tab, 0)}>
                                                    <Favicon {tab} showButton={false} />
                                                </button>
                                            {/if}
                                        {/each}
                                    </div>
                                {/if}
                                
                                <div class="new-tab-row">
                                    <div class="new-tab-button" 
                                            onmousedown={async () => {
                                                const newTab = await data.newTab(spaceId)
                                                if (newTab) {
                                                    data.activateSpace(spaceId)
                                                    data.activate(newTab.id)
                                                }
                                            }}
                                            role="button"
                                            tabindex="0"
                                            aria-label="Create new tab">
                                        <svg class="new-tab-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"/>
                                        </svg>
                                        <span class="new-tab-text">New Tab</span>

                                        <span class="new-tab-more-button" aria-label="New tab options">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="down-icon"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clip-rule="evenodd"/></svg>
                                            <div class="new-tab-hover-menu" role="menu" aria-label="New tab options">
                                          <span class="new-tab-hover-item" onmouseup={() => handleNewFromClipboard(spaceId)} role="menuitem" tabindex="0">
                                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="item-icon"><path d="M15.75 3a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-7.5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h7.5Zm0 1.5h-7.5A1.5 1.5 0 0 0 6.75 6v9A1.5 1.5 0 0 0 8.25 16.5h7.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5Z"/><path d="M8.25 6A2.25 2.25 0 0 1 10.5 3.75h3a.75.75 0 0 1 0 1.5h-3A.75.75 0 0 0 9.75 6v.75H8.25V6Z"/></svg>
                                              <span>New from clipboard</span>
                                          </span>
                                         <div class="new-tab-hover-item has-submenu" role="menuitem" aria-haspopup="true" aria-expanded="false" tabindex="0">
                                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="item-icon"><path d="M6.75 3A1.75 1.75 0 0 0 5 4.75v4.5C5 10.44 5.56 11 6.25 11h4.5c.69 0 1.25-.56 1.25-1.25v-4.5C12 4.56 11.44 4 10.75 4h-4Zm7 0A1.75 1.75 0 0 0 12 4.75v4.5c0 .69.56 1.25 1.25 1.25h4.5C18.44 10.5 19 9.94 19 9.25v-4.5C19 4.06 18.44 3.5 17.75 3.5h-4Zm-7 10.5c-.69 0-1.25.56-1.25 1.25v4.5C5.5 20.44 6.06 21 6.75 21h4.5c.69 0 1.25-.56 1.25-1.25v-4.5c0-.69-.56-1.25-1.25-1.25h-4.5Zm7 0c-.69 0-1.25.56-1.25 1.25v4.5c0 .69.56 1.25 1.25 1.25h4.5c.69 0 1.25-.56 1.25-1.25v-4.5c0-.69-.56-1.25-1.25-1.25h-4.5Z"/></svg>
                                             <span>New tab in container…</span>
                                             <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1-.02-1.06L10.94 10 7.19 6.29a.75.75 0 1 1 1.06-1.06l4.5 4.25a.75.75 0 0 1 0 1.06l-4.5 4.25a.75.75 0 0 1-1.06 0Z" clip-rule="evenodd"/></svg>
                                             <div class="new-tab-submenu" role="menu">
                                                 {#each partitions as partition}
                                                     <span class="new-tab-submenu-item" onmouseup={() => handleNewTabInPartition(spaceId, partition)} role="menuitem" tabindex="0">
                                                         <span class="partition-dot" data-variant={partition.startsWith('persist') ? 'persist' : 'ephemeral'}></span>
                                                         <span>{partition}</span>
                                                     </span>
                                                 {/each}
                                             </div>
                                         </div>
                                            </div>
                                        </span>
                                    </div>
                                </div>
                                
                                <div class="tabs-list-container">
                                    {#if !tabSearchQuery && data.spaces[spaceId]?.tabs?.[0]?.type !== 'divider' && !tabsListScrolled[spaceId]}
                                        <div class="add-spacer-insertion">
                                            <Tooltip text="Add spacer" position="top" delay={300}>
                                                <button class="add-spacer-preview"
                                                        onmousedown={(e) => { if (e.button === 0) { e.stopPropagation(); addTabsListSpacer(spaceId) } }}
                                                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addTabsListSpacer(spaceId); } }}
                                                        aria-label="Add spacer">
                                                    <span class="add-spacer-preview-line"></span>
                                                </button>
                                            </Tooltip>
                                        </div>
                                    {/if}
                                    <div class="tabs-list-fade-top" class:visible={tabsListScrolled[spaceId]}></div>
                                    <div class="tabs-list" onscroll={handleTabsListScroll}>

                                   {#snippet sidebarTab(tab, i, groupActivationTarget = false)}
                                        {#if tab.type === 'divider'}
                                            {#if !tabSearchQuery}
                                                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                                <div class="tab-divider-item" class:tab-dragging={tabDrag.active && tabDrag.tabId === tab.id} data-tab-id={tab.id}
                                                     role="listitem"
                                                     onmousedown={(e) => { if (e.button === 0) startTabDrag(tab.id, e.currentTarget, 'sidebar', spaceId, e, false, null, 'divider') }}
                                                     oncontextmenu={(e) => handleTabContextMenu(e, tab, i)}>
                                                    <div class="tab-divider">
                                                        {#if tab.title}
                                                            <span class="tab-divider-title">{tab.title}</span>
                                                            <div class="tab-divider-line"></div>
                                                        {:else}
                                                            <div class="tab-divider-line-only"></div>
                                                        {/if}
                                                        <button class="tab-divider-remove"
                                                                onmousedown={(e) => { if (e.button === 0) { e.stopPropagation(); data.removeDivider(tab.id); } }}
                                                                aria-label="Remove divider"
                                                                title="Remove divider">
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            {/if}
                                        {:else if tab.type === 'tab'}
                                            {#if tabMatchesSearch(tab)}
                                                <div class="tab-item-container" class:group-activation-target={groupActivationTarget} class:active={tab.id === data.spaceMeta.activeTabId} class:hibernated={data.isTabHibernated(tab.id)} class:space-active-tab={(typeof data.spaces[spaceId]?.activeTabsOrder?.[0] === 'string' ? data.spaces[spaceId]?.activeTabsOrder?.[0] : data.spaces[spaceId]?.activeTabsOrder?.[0]?.id) === tab.id && spaceId !== data.spaceMeta.activeSpace} class:tab-dragging={tabDrag.active && tabDrag.dragType === 'tab' && tabDrag.tabId === tab.id} data-tab-id={tab.id}
                                                     role="listitem"
                                                     onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                                                     onmouseleave={handleTabMouseLeave}
                                                     oncontextmenu={(e) => handleTabContextMenu(e, tab, i)}>
                                                    <button class="tab-item-main" onmousedown={(e) => { if (e.button === 0) { const wasActive = tab.id === data.spaceMeta.activeTabId; startTabDrag(tab.id, e.currentTarget.parentElement, 'sidebar', spaceId, e, wasActive); if (!wasActive && !multiSpaceMode) { setActivateRafId(setTimeout(() => activateTab(tab.id, spaceId), 150)) } } }}
                                                        onclick={(e) => { if (e.button === 0 && !didDragOccurred()) { if (multiSpaceMode) { activateTab(tab.id, spaceId) } else if (tabDrag.wasAlreadyActive) { activateTab(tab.id, spaceId) } } }}>
                                                        <Favicon {tab} showButton={false} />
                                                        <span class="tab-title">{data.docs[tab.id]?.title || tab.title}</span>
                                                    </button>
                                                    
                                                    <button class="tab-close" aria-label="Close tab"
                                                            onmousedown={(e) => { e.stopPropagation(); data.closeTab(spaceId, tab.id); }}
                                                            onmouseenter={() => {
                                                                closeButtonHovered = true
                                                                if (closeButtonHoverTimer) clearTimeout(closeButtonHoverTimer)
                                                                if (instantHovercardsMode) {
                                                                    closeButtonHoverTimer = setTimeout(() => {
                                                                        closeButtonHoveredDelayed = true
                                                                    }, 300)
                                                                } else {
                                                                    closeButtonHoveredDelayed = true
                                                                }
                                                            }}
                                                            onmouseleave={() => {
                                                                closeButtonHovered = false
                                                                closeButtonHoveredDelayed = false
                                                                if (closeButtonHoverTimer) {
                                                                    clearTimeout(closeButtonHoverTimer)
                                                                    closeButtonHoverTimer = null
                                                                }
                                                            }}>
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                                                            </svg>
                                                        </button>
                                                </div>
                                            {/if}
                                        {/if}
                                    {/snippet}
                                    {#each data.getSidebarItems(spaceId) as item, i (item.id)}
                                        {#if item.type === 'divider'}
                                            {@render sidebarTab(item, i)}
                                        {:else if item.tabs.some(tabMatchesSearch)}
                                            {#if !item.tabGroupId}
                                                {@render sidebarTab(item.tabs[0], i)}
                                            {:else}
                                                {@const expansionId = `${spaceId}:${item.id}`}
                                                {@const expanded = tabGroupExpansion[expansionId] ?? false}
                                                {@const active = item.tabs.some(tab => tab.id === data.spaceMeta.activeTabId)}
                                                {@const activationTab = data.getGroupActiveTab(item, spaceId)}
                                                {@const recentEntry = data.spaces[spaceId]?.activeTabsOrder?.[0]}
                                                {@const spaceActive = spaceId !== data.spaceMeta.activeSpace && item.tabs.some(tab => tab.id === (typeof recentEntry === 'string' ? recentEntry : recentEntry?.id))}
                                                <div class="tab-group-wrapper" class:expanded class:active class:group-resizing={groupResize?.groupId === expansionId} style:--tab-group-max-height="{tabGroupMaxHeight}px" class:tab-dragging={tabDrag.active && tabDrag.dragType === 'group' && tabDrag.tabId === item.tabs[0].id} data-tab-id={item.tabs[0].id} data-other-tab-id={item.tabs[1]?.id} data-tab-group-id={item.tabGroupId}
                                                     role="group" aria-label={item.title} onmouseenter={() => groupPreview.enter(expansionId)} onmouseleave={() => groupPreview.leave(expansionId)} onpointerover={handleGroupPointerOver}>
                                                    <div class="tab-group" class:expanded class:active class:space-active-tab={spaceActive}
                                                        onmouseenter={(e) => handleTabMouseEnter(null, e)} onmouseleave={handleTabMouseLeave}
                                                        onfocusin={(e) => revealGroupActivationTab(e.currentTarget)}
                                                        oncontextmenu={(e) => handleTabContextMenu(e, { ...item, type: 'tabgroup', spaceId }, i)} role="group" aria-label={item.title}>
                                                        <button class="tab-group-main"
                                                            aria-label={item.title}
                                                            onmousedown={(e) => { if (e.button === 0) { startTabDrag(item.tabs[0].id, e.currentTarget.closest('.tab-group-wrapper'), 'sidebar', spaceId, e, false, null, 'group') } }}
                                                            onclick={(e) => { if (e.detail === 0 || (e.detail === 1 && e.button === 0 && !didDragOccurred())) { activateTab(activationTab.id, spaceId) } }}
                                                            ondblclick={(e) => { if (e.button === 0 && !didDragOccurred()) { e.stopPropagation(); data.activateSpace(spaceId); data.activate(activationTab.id); handleTabGroupToggle(expansionId, expanded) } }}>
                                                            <TabGroupPreview group={item} groupId={expansionId} preview={groupPreview} active={active || spaceActive} disabled={tabDrag.active || tabDrag.pending} />
                                                        </button>
                                                        <span class="tab-group-count">{item.tabs.length}</span>
                                                        <button class="tab-group-toggle" aria-label="{expanded ? 'Collapse' : 'Expand'} {item.title}" aria-expanded={expanded}
                                                            onclick={(e) => { if (e.detail === 0) { handleTabGroupToggle(expansionId, expanded) } }}
                                                            onmousedown={(e) => { if (e.button === 0) { e.stopPropagation(); handleTabGroupToggle(expansionId, expanded) } }}>
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6" /></svg>
                                                        </button>
                                                    </div>
                                                    {#if tabGroupExpansion[expansionId] !== undefined}
                                                        <div class="tab-group-scroll" hidden={!expanded}>
                                                            <div class="tab-group-content" data-group-tab-id={item.tabs[0].id} use:observeScrollEdges={item.tabs.length}>
                                                                {#each item.tabs as tab (tab.id)}
                                                                    {@render sidebarTab(tab, i, tab.id === activationTab.id)}
                                                                {/each}
                                                            </div>
                                                            <button class="tab-group-resize" type="button" aria-label="Resize expanded tab groups" title="Drag to resize tab groups"
                                                                onpointerdown={(event) => startGroupResize(event, expansionId)} onpointermove={moveGroupResize}
                                                                onpointerup={endGroupResize} onpointercancel={endGroupResize} onlostpointercapture={endGroupResize}
                                                                onkeydown={handleGroupResizeKey}>
                                                                <svg viewBox="0 0 12 4" fill="none" stroke="currentColor"><path d="m4 3 3-3m1 3 2-2" /></svg>
                                                            </button>
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/if}
                                        {/if}
                                    {/each}

                                    {#if !tabSearchQuery}
                                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                                        <!-- Bottom spacer for scrolling and double-click to create new tab -->
                                        <div class="tabs-list-bottom-spacer"
                                             onmousedown={(e) => {
                                                 if (multiSpaceMode) {
                                                     exitMultiSpaceMode()
                                                 }
                                             }}
                                             ondblclick={async (e) => {
                                                e.stopPropagation()
                                                const newTab = await data.newTab(spaceId)
                                                if (newTab) {
                                                    data.activateSpace(spaceId)
                                                    data.activate(newTab.id)
                                                }
                                        }}></div>
                                    {/if}
                                </div>
                                        <div class="tabs-list-fade-bottom" class:visible={tabsListScrolledBottom[spaceId]}></div>
                                    </div>
                                </div>
                            {/if}
                        {/each}
                    </div>
                </div>
            </div>
        </div>
        
        
        {#if data.spaceMeta.closedTabs.length > 0}
            <div class="closed-tabs-section"
                 onmouseenter={handleClosedTabsMouseEnter}
                 onmouseleave={handleClosedTabsMouseLeave}
                 role="region"
                 aria-label="Recently closed tabs">
                <button class="closed-tabs-header"
                        onmouseenter={() => { closedTabsHeaderHovered = true }}
                        onmouseleave={() => { closedTabsHeaderHovered = false }}
                        onclick={() => { data.clearClosedTabs(); handleClosedTabsMouseLeave() }}
                        aria-label="Clear all recently closed tabs">
                    <span class="closed-tabs-title">{closedTabsHeaderHovered ? 'Clear All' : 'Recently Closed'}</span>
                    <span class="closed-tabs-count">{data.spaceMeta.closedTabs.length}</span>
                </button>
                <div class="closed-tabs-content" class:expanded={closedTabsHovered}>
                    <div class="closed-tabs-list">
                        {#each data.spaceMeta.closedTabs as tab (tab.id)}
                            {#if tabMatchesSearch(tab)}
                                <button class="closed-tab-item" data-tab-id={tab.id}
                                        onmousedown={() => data.restoreClosedTab(tab.id)}
                                        onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                                        onmouseleave={handleTabMouseLeave}>
                                    <Favicon {tab} showButton={false} />
                                    <div class="tab-text">
                                        <span class="tab-title">{data.docs[tab.id]?.title || tab.title}</span>
                                        <span class="tab-space">{data.spaces[tab.spaceId]?.name || 'Unknown Space'}</span>
                                    </div>
                                    <div class="closed-tab-remove" onmousedown={(e) => { e.stopPropagation(); data.removeClosedTab(tab.id) }}>
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/>
                                        </svg>
                                    </div>
                                </button>
                            {/if}
                        {/each}
                    </div>
                </div>
            </div>
        {/if}
        
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="resize-handle resize-handle-right" 
                class:active={isResizingTabSidebar}
                class:disabled={!sidebarFullyShown && !tabSidebarVisible}
                role="slider"
                aria-orientation="vertical"
                aria-label="Resize tab sidebar"
                aria-valuemin={150}
                aria-valuemax={600}
                aria-valuenow={customTabSidebarWidth || 263}
                tabindex="0"
                onmousedown={(sidebarFullyShown || tabSidebarVisible) ? onStartResizeTabSidebar : null}
                title="Drag to resize tab sidebar"></div>
    </div>
</div>

{#if hoveredTab && hovercardTabs.length && !tabDrag.active}
    {#key hoveredGroupTarget ? `${hoveredGroupTarget.spaceId}:${hoveredGroupTarget.id}` : hoveredTab.id}
        <div class="tab-hovercard-sidebar" class:group-hovercards={!!hoveredGroupTarget}
             role={hoveredGroupTarget ? 'region' : undefined} aria-label={hoveredGroup?.title}
             style="left: {hovercardPosition.x}px; top: {hovercardPosition.y}px;">
            <div class="tab-hovercard-stack"
                 use:fitSidebarHovercard={{ anchor: hovercardAnchor, onPosition: updateHovercardPosition, onHistoryBesideChange: (beside) => { hovercardHistoryBeside = beside } }}>
            {#each hovercardTabs as previewTab (previewTab.id)}
            <TabHoverCard tab={previewTab} stacked={!!hoveredGroupTarget}
                        historyBeside={hovercardHistoryBeside}
                        active={hoveredGroupTarget ? previewTab.id === hovercardActivationTabId : undefined}
                        onActivate={(tab) => activateTab(tab.id, tab.spaceId)}
                        bind:showHistory={
                            () => expandedHovercardHistoryTabId === previewTab.id,
                            (visible) => {
                                if (visible) expandedHovercardHistoryTabId = previewTab.id
                                else if (expandedHovercardHistoryTabId === previewTab.id) expandedHovercardHistoryTabId = null
                            }
                        }
                        isClosedTab={data.spaceMeta.closedTabs.some(t => t.id === previewTab.id)}
                        showHistoryImmediately={!hoveredGroupTarget && closeButtonHoveredDelayed}
                        instantMode={instantHovercardsMode}
                        showDevTools={devModeEnabled}
                        availableHeight={window.innerHeight - hovercardPosition.y - 20}
                        onDevTools={() => { activateHovercardTab(previewTab); handleDevToolsClick() }}
                        onGoBack={() => {
                            activateHovercardTab(previewTab)
                            setTimeout(() => {
                                onNavigateHistory?.(previewTab.id, 'back')
                            }, 50)
                        }}
                        onGoForward={() => {
                            activateHovercardTab(previewTab)
                            setTimeout(() => {
                                onNavigateHistory?.(previewTab.id, 'forward')
                            }, 50)
                        }}
                        onReload={() => {
                            activateHovercardTab(previewTab)
                            setTimeout(() => {
                                data.reloadTab(previewTab.id)
                            }, 50)
                        }}
                        onCloseTab={() => closeHovercardTab(previewTab)}
                        onUrlBarExpandedChange={(expanded) => {
                            expandedHovercardTabs[previewTab.id] = expanded
                            hovercardUrlBarExpanded = Object.values(expandedHovercardTabs).some(Boolean)
                        }}
                        onMouseLeave={handleTabMouseLeave} />
            {/each}
            </div>
        </div>
    {/key}
{/if}

<TabContextMenu 
    menu={tabContextMenu} 
    onHide={hideTabContextMenu} 
    onReload={(tab) => {
        if (!tab?.id) return
        data.reloadTab(tab.id)
    }}
    {partitions}
    contextMenuOpenTime={tabContextMenuOpenTime} />

<style>
    .sidebar-window-drag {
        position: fixed;
        top: 0;
        left: 0;
        height: max(35px, env(titlebar-area-height, 35px));
        z-index: 2201;
        -webkit-app-region: no-drag;
    }

    .sidebar-window-drag.drag-enabled {
        -webkit-app-region: drag;
    }

    .sidebar-box {
        background: transparent;
        position: fixed;
        z-index: 2200;
        bottom: 9px;
        top: 9px;
        left: 0px;
        transition: transform 190ms 340ms cubic-bezier(.78,-0.01,.34,1.04);

        backface-visibility: hidden;
        padding-right: 9px;
        padding-left: 9px;

        pointer-events: auto;
        overflow: visible;
        transform: translateX(calc(-100% + 8px)) translateZ(0);
        will-change: transform;
        contain: layout style;
    }

    .sidebar-box.visible {
        top: max(35px, env(titlebar-area-height, 35px));
        padding-right: 0;
        padding-left: 3px;
    }
    
    /* Constrain URL bar width to prevent stretching in fullscreen mode */
    .sidebar-box :global(.url-bar-section) {
        max-width: min(600px, 90vw);
    }

    .sidebar-box:hover, .sidebar-box.hovered, .sidebar-box.resizing, .sidebar-box.visible {
        transition: transform 190ms 0ms cubic-bezier(.78,-0.01,.34,1.04);
        transform: translateX(0px) translateZ(0);
    }
    
    .sidebar-box.resizing {
        transition: none; /* Disable transition during resize for smooth dragging */
    }
    
    .sidebar-box.visible {
        transition: transform 190ms 0ms cubic-bezier(.78,-0.01,.34,1.04);
        background: black;
    }

    .sidebar {
        flex: 1;
        height: 100%;
        backdrop-filter: blur(21px);
        background: rgb(0 0 0 / 96%);
        user-select: none;
        overflow: visible;
        border-radius: 18px;
        transform: translateZ(0);
        backface-visibility: hidden;
    }

    .sidebar::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        /* Extend past the 18px corners and the existing 16px shadow. */
        height: 34px;
        border-radius: inherit;
        box-shadow: 0 -3px 6px 1px rgb(0 0 0 / 85%);
        z-index: -1;
        pointer-events: none;
    }
    
    .sidebar-box.visible .sidebar {
        background: black;
        backdrop-filter: none;
    }
    
    .sidebar-box.visible .sidebar::before {
        content: '';
        position: absolute;
        top: 0;
        right: 1px;
        width: 1px;
        height: 100%;
        background: linear-gradient(to bottom, transparent 0%, #ffffff17 12%, #ffffff17 95%, transparent 100%), rgba(0, 0, 0, 0.802);
        background-size: 1px 100%, 100% 100%;
        background-position: right center, center;
        background-repeat: no-repeat, no-repeat;
        opacity: 1;
        z-index: 10;
        transition: opacity 150ms ease 200ms;
    }
    
    .sidebar-content {
        height: 100%;
        overflow-y: visible;
        overflow-x: visible;
        background: transparent;
        padding: 10px 4px 0 4px;
        display: flex;
        flex-direction: column;
        position: relative;
        border-radius: 18px;
        box-shadow: 0 0 16px 0 #000, -18px 0px 2px 1px #000;
        border: 1px solid hsl(0 0% 12% / 1);
        transition: border-radius 190ms ease, box-shadow 190ms ease, border 190ms ease;
    }

    .sidebar-content.no-url {
        padding-top: 4px;
    }

    .sidebar-box.visible .sidebar-content {
        border-radius: 0;
        box-shadow: 0px 0px 9px 4px #00000040;
        border: none;
        background: transparent;
        transition: border-radius 190ms ease, box-shadow 190ms ease 100ms, border 190ms ease;
    }
    
    .section {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
    }
    
    .search-section {
        padding: 4px;
        margin-bottom: 10px;
        flex-shrink: 0;
        height: 44px; /* Match pinned-tabs-grid height (36px tab + 8px padding) */
        box-sizing: border-box;
    }
    
    .search-section.multi-space {
        width: 20vw;
        min-width: 263px;
        max-width: 600px;
    }
    
    .no-search-results {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: rgba(255, 255, 255, 0.4);
        text-align: center;
        gap: 12px;
        height: 100%;
        width: 100%;
    }
    
    .no-search-results svg {
        width: 32px;
        height: 32px;
        opacity: 0.5;
    }
    
    .no-search-results p {
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        margin: 0;
        word-break: break-word;
    }
    
    .tab-search-container {
        position: relative;
        display: flex;
        align-items: center;
        width: 100%;
    }
    
    .tab-search-icon {
        position: absolute;
        left: 11px;
        width: 14px;
        height: 14px;
        color: rgba(255, 255, 255, 0.46);
        pointer-events: none;
        transition: color 150ms ease;
    }
    
    .tab-search-input {
        width: 100%;
        height: 36px; /* Match pinned-tab height */
        background: rgba(255, 255, 255, 0.06);
        border: 0;
        border-radius: 11px;
        padding: 0 32px;
        color: rgba(255, 255, 255, 0.84);
        caret-color: rgba(255, 255, 255, 0.84);
        font-size: 13.5px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        appearance: none;
        outline: none;
        box-shadow: none;
        transition: background-color 150ms ease;
        box-sizing: border-box;
    }
    
    .tab-search-clear {
        position: absolute;
        right: 7px;
        width: 22px;
        height: 22px;
        border-radius: 7px;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.44);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 150ms ease, color 150ms ease;
        padding: 0;
    }
    
    .tab-search-clear:hover {
        color: rgba(255, 255, 255, 0.75);
    }

    .tab-search-clear:focus-visible {
        outline: none;
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.84);
    }
    
    .tab-search-clear svg {
        width: 13px;
        height: 13px;
    }
    
    .tab-search-input:hover {
        background: rgba(255, 255, 255, 0.08);
    }
    
    .tab-search-input:focus {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .tab-search-container:focus-within .tab-search-icon {
        color: rgba(255, 255, 255, 0.66);
    }
    
    .tab-search-input::placeholder {
        color: rgba(255, 255, 255, 0.5);
        font-weight: 450;
    }

    @media (prefers-reduced-motion: reduce) {
        .tab-search-icon,
        .tab-search-input,
        .tab-search-clear {
            transition: none;
        }
    }

    .global-pins-section {
        margin-bottom: 10px;
        flex-shrink: 0;
    }
    
    .flex-1 {
        flex: 1;
        min-height: 0; /* Ensures proper flex behavior */
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
    }
    
    /* Pinned Tabs Grid (shared for global and app tabs) */
    .pinned-tabs-grid {
        display: grid;
        grid-template-columns: repeat(4, 41px);
        gap: 3px;
        padding: 4px;
        flex-shrink: 0;
    }
    
    .pinned-tab {
        width: 36px;
        height: 36px;
        border-radius: 12px;
        /* background: rgb(255 255 255 / 7%); */
        background: rgb(255 255 255 / 6.5%);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid hsl(0deg 0% 100% / 2%);
        color: rgba(255, 255, 255, 0.3);
        padding: 0;
        margin: 0;
    }
    
    .pinned-tab:hover {
        background-color: rgb(255 255 255 / 9%);
        border: 1px solid hsl(0deg 0% 100% / 3%);
    }
    
    .spaces-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px;
        flex-shrink: 0;
    }
    
    .spaces-list-wrapper {
        position: relative;
        flex: 1;
        min-width: 0;
    }
    
    .spaces-list-fade-left {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 12px;
        background: linear-gradient(to right, #000 0%, transparent 100%);
        pointer-events: none;
        z-index: 10;
        opacity: 0;
        transition: opacity 150ms ease;
    }
    
    .spaces-list-fade-left.visible {
        opacity: 1;
    }
    
    .spaces-list-fade-right {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 12px;
        background: linear-gradient(to left, #000 0%, transparent 100%);
        pointer-events: none;
        z-index: 10;
        opacity: 0;
        transition: opacity 150ms ease;
    }
    
    .spaces-list-fade-right.visible {
        opacity: 1;
    }
    
    .spaces-list {
        display: flex;
        flex-direction: row;
        gap: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-x: contain; /* Prevent horizontal scroll chaining to background views */
        scrollbar-width: none;
        flex: 1;
        min-width: 0;
        padding-right: 12px;
    }
    
    .spaces-list::-webkit-scrollbar {
        display: none;
    }
    
    .space-item {
        width: 22px;
        height: 22px;
        border-radius: 100%;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        opacity: 0.27;
        padding: 0;
        margin: 0;
    }
    
    .space-item:hover {
        background: rgba(255, 255, 255, 0.1);
        opacity: 0.8;
    }
    
    .space-item.active {
        background: transparent;
        opacity: 1;
    }
    
    .space-glyph {
        font-size: 13px;
        line-height: 1;
        width: 13px;
        height: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.3);
    }
    
    :global(.space-glyph svg) {
        width: 100%;
        height: 100%;
    }
    
    .space-glyph-default {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .new-space-menu {
        position: relative;
    }
    
    .new-space-button {
        width: 24px;
        height: 24px;
        border-radius: 12px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        opacity: 0;
        visibility: hidden;
        padding: 0;
        margin: 0;
    }
    
    .spaces-container:hover .new-space-button {
        opacity: 1;
        visibility: visible;
    }
    
    .new-space-button:hover {
        background: rgba(255, 255, 255, 0.1);
        opacity: 1;
    }
    
    .new-space-button:hover .plus-icon {
        color: rgba(255, 255, 255, 0.9);
    }
    
    .plus-icon {
        font-size: 16px;
        line-height: 1;
        width: 16px;
        height: 16px;
        color: rgba(255, 255, 255, 0.6);
    }
    
    .new-space-menu-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 4px 0;
        min-width: 120px;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        transition: all 150ms ease;
        backdrop-filter: blur(12px);
        overflow: hidden;
    }

    .new-space-menu-dropdown.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }

    .new-space-menu-item {
        padding: 6px 12px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        cursor: pointer;
        transition: background 150ms ease;
        background: transparent;
        border: none;
        width: 100%;
        text-align: left;
    }

    .new-space-menu-item:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.95);
    }

    .new-space-menu-item:active {
        background: rgba(255, 255, 255, 0.15);
    }

    .space-title-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 4px 0px 6px;
        margin-bottom: -4px;
        flex-shrink: 0;
        position: relative;
    }
    
    .space-title {
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        text-align: left;
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    
    .space-title-glyph {
        font-size: 11px;
        line-height: 1;
        width: 11px;
        height: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }
    
    :global(.space-title-glyph svg) {
        width: 100%;
        height: 100%;
    }
    
    .space-title-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    
    .space-title:hover {
        color: rgba(255, 255, 255, 0.85);
    }
    
    .space-title.active {
        color: hsl(0 0% 87% / 1);
        font-weight: 700;
    }

    .space-title-rename {
        color: white;
        font-size: 11px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        padding: 1px 4px;
        margin: 0;
        outline: none;
        min-width: 0;
        width: 100%;
    }

    .color-picker-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 8px;
        z-index: 10001;
        backdrop-filter: blur(12px);
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 4px;
        width: 140px;
    }

    .color-picker-dropdown.from-menu {
        left: auto;
        right: 0;
    }

    .color-swatch {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
        padding: 0;
        transition: transform 150ms ease;
    }

    .color-swatch:hover {
        transform: scale(1.2);
    }

    .color-swatch.active {
        border-color: white;
    }
    
    .space-menu {
        position: relative;
        opacity: 1;
    }
    
    .space-menu-button {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        font-size: 14px;
        line-height: 14px;
        padding: 4px;
            border-radius: 12px;
        transition: all 150ms ease;
        opacity: 0;
    }
    
    .space-title-container:hover .space-menu-button {
        opacity: 1;
    }
    
    .space-menu-button:hover {
        color: rgba(255, 255, 255, 0.8);
        background: rgba(255, 255, 255, 0.1);
    }
    
    .space-menu-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 4px 0;
        min-width: 180px;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        transition: all 150ms ease;
        backdrop-filter: blur(12px);
        overflow: visible;
    }
    
    .space-menu-dropdown.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }
    
    .space-menu-item {
        padding: 8px 14px;
        color: #fff;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.008em;
        line-height: 1;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: antialiased;
        cursor: pointer;
        transition: background 150ms ease;
        background: transparent;
        border: none;
        width: 100%;
        text-align: left;
    }
    
    .space-menu-item:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.95);
    }
    
    .space-menu-item:active {
        background: rgba(255, 255, 255, 0.15);
    }

    .space-menu-item.delete {
        color: #ff6b6b;
    }

    .space-menu-item.delete:hover {
        color: #ff4444;
        background: rgba(255, 107, 107, 0.1);
    }

    .space-menu-item.delete:active {
        background: rgba(255, 107, 107, 0.2);
    }

    .space-item.scrolled {
        background: rgba(255, 255, 255, 0.3);
    }

    .space-item.active.scrolled {
        background: rgba(255, 255, 255, 0.14);
    }

    /* Horizontal Tab Content */
    .tab-content-container {
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-x: none;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        -ms-overflow-style: none;
        flex: 1;
        min-height: 0;
        border-radius: 12px;
        width: calc(100% + 2px);
        transition: transform 0.1s ease-out;
        transform: translateZ(0);
        backface-visibility: hidden;
        contain: layout style;
    }
    
    .tab-content-container.searching:not(.multi-space) {
        overflow-x: hidden;
        overflow-y: auto;
        scroll-snap-type: none;
    }
    
    .tab-content-container.rubber-banding {
        transition: none;
    }
    
    .tab-content-container.multi-space {
        scroll-snap-type: none;
        overflow-x: auto;
    }
    
    .tab-content-container.multi-space.closing {
        scroll-snap-type: x mandatory;
    }
    
    .tab-content-container.closing {
        pointer-events: none;
        overflow: hidden;
    }
    
    .tab-content-container::-webkit-scrollbar {
        display: none;
    }
    
    .tab-content-track {
        display: flex;
        height: 100%;
        gap: 20px;
    }
    
    .tab-content-container.searching:not(.multi-space) .tab-content-track {
        flex-direction: column;
        height: auto;
        gap: 12px;
        padding-bottom: 20px;
    }
    
    .space-content {
        width: 100%;
        flex-shrink: 0;
        scroll-snap-align: start;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        overflow-y: hidden;
        padding-top: 0;
        padding-right: 8px;
        position: relative;
    }
    
    .tab-content-container.searching:not(.multi-space) .space-content {
        height: auto;
        max-height: calc(36px * 5 + 8px * 4 + 40px); /* 5 tabs + gaps + header */
    }
    
    .tab-content-track.multi-space {
        gap: 12px;
    }
    
    /* Multi-space mode for sidebar-box */
    .sidebar-box.multi-space-mode {
        transition: width 300ms cubic-bezier(.78,-0.01,.34,1.04);
        z-index: 1001;
    }
    
    .sidebar-box.multi-space-mode .sidebar-content {
        overflow-x: auto;
    }
    
    .sidebar-box.multi-space-mode .closed-tabs-section {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        width: auto;
        max-width: 320px;
    }
    
    .sidebar-box.multi-space-mode .spaces-container {
        justify-content: flex-start;
    }
    
    .sidebar-box.multi-space-mode .spaces-list-wrapper {
        flex: none;
    }
    
    /* Close button for multi-space mode */
    .close-multi-space-button {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.35);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 150ms ease;
        z-index: 100;
    }
    
    .close-multi-space-button:hover {
        color: rgba(255, 255, 255, 0.6);
    }
    
    .close-multi-space-button:active {
        color: rgba(255, 255, 255, 0.85);
    }
    
    .close-multi-space-button svg {
        width: 18px;
        height: 18px;
    }
    
    /* Space content in multi-space mode - fixed width */
    .space-content.multi-space {
        flex: none;
        position: relative;
    }
    
    /* Gradient divider between lanes - draggable for resizing */
    .lane-divider {
        width: 12px;
        flex-shrink: 0;
        margin-top: 60px;
        margin-bottom: 60px;
        cursor: ew-resize;
        position: relative;
        background: transparent;
    }
    
    .lane-divider::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 1px;
        transform: translateX(-50%);
        background: linear-gradient(to bottom, 
            transparent 0%, 
            rgba(255, 255, 255, 0.15) 8%,
            rgba(255, 255, 255, 0.3) 20%, 
            rgba(255, 255, 255, 0.3) 80%, 
            rgba(255, 255, 255, 0.15) 92%,
            transparent 100%
        );
        opacity: 0.4;
        transition: opacity 200ms ease 400ms;
    }
    
    .lane-divider:hover::before {
        width: 1px;
        opacity: 1;
    }
    
    .lane-divider:not(:hover)::before {
        transition-delay: 0ms;
    }

    .app-tab {
        width: 36px;
        height: 36px;
        border-radius: 12px;
        background: rgb(255 255 255 / 7%);
         background: #ffffff0f;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid hsl(0deg 0% 100% / 2%);
        color: rgba(255, 255, 255, 0.3);
        padding: 0;
        margin: 0;
    }
    
    .app-tab:hover {
        background-color: var(--tab-hover-background);
        border: 1px solid var(--tab-hover-border);
    }
    
    .app-tab.active {
        background: var(--tab-active-background);
        border: 1px solid var(--tab-active-border);
    }
    
    .app-tab.active:hover {
        background: var(--tab-active-hover-background);
        border: 1px solid var(--tab-active-hover-border);
    }
    
    .pinned-tab :global(.favicon-wrapper) {
        opacity: 0.6;
    }
    
    .pinned-tab:hover :global(.favicon-wrapper) {
        opacity: 1;
    }

    .all-apps-tab {
        position: relative;
    }

    .all-apps-icon {
        width: 16px;
        height: 16px;
        color: rgba(255, 255, 255, 0.3);
    }

    .all-apps-tab:hover .all-apps-icon {
        color: rgba(255, 255, 255, 0.7);
    }
    
    .search-toggle-tab {
        position: relative;
    }
    
    .search-toggle-icon {
        width: 16px;
        height: 16px;
        color: rgba(255, 255, 255, 0.3);
    }
    
    .search-toggle-tab:hover .search-toggle-icon {
        color: rgba(255, 255, 255, 0.7);
    }
    
    .app-tab :global(.favicon-wrapper) {
        opacity: 0.6;
    }
    
    .app-tab.active :global(.favicon-wrapper) {
        opacity: 0.87;
    }
    
    .app-tab:hover :global(.favicon-wrapper) {
        opacity: 1;
    }
    
    /* Tabs list container with fade */
    .tabs-list-container {
        position: relative;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        transform: translateZ(0);
        contain: layout style;
    }

    .add-spacer-insertion {
        position: absolute;
        top: -8px;
        left: 0;
        right: 8px;
        height: 16px;
        z-index: 11;
    }

    .add-spacer-insertion :global(.tooltip-container) {
        width: 100%;
        height: 100%;
    }

    .add-spacer-preview {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        padding: 0 16px;
        border: 0;
        background: transparent;
        cursor: pointer;
    }

    .add-spacer-preview:focus-visible {
        outline: none;
    }

    .add-spacer-preview-line {
        width: 100%;
        height: 1px;
        background: rgba(255, 255, 255, 0.22);
        opacity: 0;
        transition: opacity 150ms ease;
    }

    .add-spacer-preview:hover .add-spacer-preview-line,
    .add-spacer-preview:focus-visible .add-spacer-preview-line {
        opacity: 1;
    }
    
    .tabs-list-fade-top {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 16px;
        background: linear-gradient(to bottom, #000 0%, transparent 100%);
        pointer-events: none;
        z-index: 10;
        opacity: 0;
        transition: opacity 150ms ease;
    }
    
    .tabs-list-fade-top.visible {
        opacity: 1;
    }
    
    .tabs-list-fade-bottom {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 16px;
        background: linear-gradient(to top, #000 0%, transparent 100%);
        pointer-events: none;
        z-index: 10;
        opacity: 0;
        transition: opacity 150ms ease;
    }
    
    .tabs-list-fade-bottom.visible {
        opacity: 1;
    }
    
    /* Regular Tabs */
    .tabs-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior-y: contain; /* Prevent vertical scroll chaining to background views */
        padding-top: 8px;
        padding-bottom: 0; /* Bottom spacer element handles scroll space */
        padding-right: 8px;
        margin-right: -8px; /* Offset scrollbar position */
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
    
    .tab-content-container.searching:not(.multi-space) .tabs-list {
        overscroll-behavior-y: auto;
        overflow-y: auto;
        padding-top: 0;
    }
    
    .tab-content-container.horizontal-scrolling .tabs-list {
        overflow-y: hidden;
    }
    
    .tabs-list::-webkit-scrollbar {
        width: 6px;
    }

    .tabs-list::-webkit-scrollbar-track {
        background: transparent;
    }

    .tabs-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .tabs-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
    
    .tabs-list-bottom-spacer {
        flex-shrink: 0;
        /* Height allows last tab to scroll to top of tabs-list area */
        height: calc(100vh - 300px);
        width: 100%;
        cursor: default;
    }
    
    .tab-item-container {
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 12px;
        /* background: rgb(255 255 255 / 7%); */
         /* background: #ffffff0f; */
        transition: all 150ms ease;
        border: 1px solid transparent;
        height: 36px;
        flex-shrink: 0;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        position: relative;
    }
    
    .tab-item-main {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 4px 8px;
        background: transparent;
        border: none;
        cursor: pointer;
        flex: 1;
        height: 36px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        text-align: left;
        border-radius: 12px;
        min-width: 0;
        overflow: hidden;
    }
    
    .tab-item-container:hover {
        background-color: var(--tab-hover-background);
        border: 1px solid var(--tab-hover-border);
    }
    
    .tab-item-container.active {
        background: var(--tab-active-background);
        border: 1px solid var(--tab-active-border);
        position: sticky;
        top: 0;
        bottom: 0;
        z-index: 15;
        box-shadow: 0 -8px 8px -2px black, 0 8px 8px -2px black;
    }
    
    .tab-item-container.active:hover {
        background: var(--tab-active-hover-background);
        border: 1px solid var(--tab-active-hover-border);
    }
    
    .tab-item-container.tab-dragging {
        opacity: 0.3;
    }
    
    :global(.favicon-wrapper) {
        opacity: 0.6;
    }
    
    :global(.favicon-wrapper svg) {
        width: 100%;
        height: 100%;
    }
    
    .tab-title {
        color: hsl(0 0% 61% / 1);
        font-size: 13px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        white-space: nowrap;
        overflow: hidden;
        flex: 1;
        line-height: 1.2;
        margin-top: 1px;
        mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
        -webkit-mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
        min-width: 0;
        max-width: 100%;
    }
    

    
    .tab-item-container.active .tab-title {
        color: #e5e5e5;
        /* text-shadow: 0 0 0.3px currentColor; */
    }
    
    .tab-item-container:hover .tab-title {
        color: hsl(0 0% 85% / 1);
    }
    
    .tab-item-container.active :global(.favicon-wrapper) {
        opacity: 0.87;
    }
    
    .tab-item-container:hover :global(.favicon-wrapper) {
        opacity: 1;
    }
    
    /* Active tab in inactive space - bold text + opaque favicon, subtle border */
    .tab-item-container.space-active-tab {
        border: 1px solid hsl(0deg 0% 100% / 5.5%);
            background: rgb(255 255 255 / 6%);
    }
    
    .tab-item-container.space-active-tab .tab-title {
        color: rgb(255 255 255 / 75%);
        /* text-shadow: 0 0 0.3px currentColor; */
    }
    
    .tab-item-container.space-active-tab :global(.favicon-wrapper) {
        opacity: 0.87;
    }
    
    .tab-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 0;
        height: 20px;
        border-radius: 4px;
        opacity: 0;
        margin-right: 8px;
        flex-shrink: 0;
        overflow: hidden;
        line-height: 1;
        max-width: 28px;
    }

    .tab-close:hover {
        color: rgba(255, 255, 255, 0.9);
    }
    
    .tab-item-container:hover .tab-close {
        opacity: 1;
        width: 25px;
        padding: 0 4px;
    }
    
    .tab-close:hover {
        color: rgba(255, 255, 255, 0.9);
    }
    
    .tab-divider-item {
        position: relative;
        flex-shrink: 0;
        width: 100%;
        cursor: grab;
    }

    .tab-divider-item.tab-dragging {
        opacity: 0.3;
    }

    .tabs-list > .tab-divider-item:first-child::before {
        content: '';
        display: block;
        height: 36px;
        width: 100%;
    }

    .tab-divider {
        position: relative;
        padding: 8px 8px 8px 8px;
        margin: 4px 0;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
    }
    
    .tab-divider-title {
        color: rgba(255, 255, 255, 0.4);
        font-size: 11px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        white-space: nowrap;
        flex-shrink: 0;
    }
    
    .tab-divider-line {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        flex: 1;
    }
    
    .tab-divider-line-only {
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
        width: 100%;
        margin: 0 8px;
    }

    .tab-divider-remove {
        position: absolute;
        top: 50%;
        right: 6px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.88);
        color: rgba(255, 255, 255, 0.45);
        cursor: pointer;
        opacity: 0;
        transform: translateY(-50%);
        transition: color 150ms ease, opacity 150ms ease, background-color 150ms ease;
    }

    .tab-divider-item:hover .tab-divider-remove,
    .tab-divider-remove:focus-visible {
        opacity: 1;
    }

    .tab-divider-remove:hover,
    .tab-divider-remove:focus-visible {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.85);
        outline: none;
    }

    .tab-divider-remove svg {
        width: 14px;
        height: 14px;
    }
    
    /* New Tab Button */
    :global(body.tab-dragging-active) :is(.new-tab-row, .add-spacer-insertion),
    :global(body.tab-dragging-active) :is(.new-tab-row, .add-spacer-insertion) :global(*) {
        pointer-events: none !important;
    }

    .new-tab-button {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 4px 8px;
        border-radius: 12px;
        background: transparent;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        height: 36px;
        flex-shrink: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        width: 100%;
        text-align: left;
    }
    
    .new-tab-more-button {
        background: transparent;
        border: 1px solid transparent;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        height: 36px;
        width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        transition: all 150ms ease;
        flex-shrink: 0;
        margin-left: 6px;
        opacity: 0;
        visibility: hidden;
    }

    .new-tab-row:hover .new-tab-more-button {
        opacity: 1;
        visibility: visible;
    }

    .down-icon {
        width: 16px;
        height: 16px;
    }

    .new-tab-button:hover {
        background-color: rgb(255 255 255 / 7%);
        border: 1px solid hsl(0deg 0% 100% / 3%);
    }
    
    .new-tab-icon {
        font-size: 18px;
        line-height: 1;
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.4);
        font-weight: 300;
    }
    
    .new-tab-text {
        color: hsl(0 0% 66% / 1);
        font-size: 13px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        line-height: 1.2;
        margin-top: 1px;
        /* max-width: 180px; */
    }
    
    .new-tab-button:hover .new-tab-icon {
        color: rgba(255, 255, 255, 0.7);
    }
    
    .new-tab-button:hover .new-tab-text {
        color: #fff;
    }
    
    .new-tab-row {
        position: relative;
        display: flex;
        align-items: center;
    }
    
    .new-tab-hover-menu {
        position: absolute;
        top: 10px;
        right: 0;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 0;
        min-width: 200px;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transition: opacity 150ms ease, visibility 150ms ease;
        backdrop-filter: blur(12px);
        pointer-events: none;
        box-sizing: border-box;
    }

    .new-tab-more-button:hover .new-tab-hover-menu {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
    }
    .new-tab-hover-menu:hover {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
    }
    
    .new-tab-hover-item {
        padding: 6px 12px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        cursor: pointer;
        background: transparent;
        border: none;
        width: 100%;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 8px;
        position: relative;
        white-space: nowrap;
        min-width: 0;
    }
    
    .new-tab-hover-item:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.95);
    }

    .new-tab-hover-item:first-child:hover {
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
    }

    .new-tab-hover-item:last-child:hover {
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
    }
    
    .new-tab-hover-item.has-submenu {
        padding-right: 26px;
    }
    
    .new-tab-hover-item .chevron {
        width: 14px;
        height: 14px;
        color: rgba(255, 255, 255, 0.5);
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
    }
    
    .new-tab-hover-item .item-icon {
        width: 14px;
        height: 14px;
        color: rgba(255, 255, 255, 0.5);
    }
    
    .new-tab-submenu {
        position: absolute;
        top: 95%;
        right: 5px;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 0;
        min-width: 170px;
        z-index: 1001;
        opacity: 0;
        visibility: hidden;
        transition: opacity 120ms ease, visibility 120ms ease;
        backdrop-filter: blur(12px);
        pointer-events: none;
        margin-top: -4px;
    }
    
    .new-tab-hover-item.has-submenu:hover .new-tab-submenu {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
    }
    
    .new-tab-submenu-item {
        padding: 6px 12px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        cursor: pointer;
        background: transparent;
        border: none;
        width: 100%;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .new-tab-submenu-item:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.95);
    }

    .new-tab-submenu-item:first-child:hover {
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
    }

    .new-tab-submenu-item:last-child:hover {
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
    }
    
    .partition-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
    }
    
    .partition-dot[data-variant="persist"] {
        background: #8b5cf6;
    }
    
    .partition-dot[data-variant="ephemeral"] {
        background: #22c55e;
    }

    /* Tab Group */
    .tab-group-wrapper {
        --tab-group-background: #0c0c0c;
        display: flex;
        flex-direction: column;
        width: 100%;
        min-width: 0;
        border-radius: 12px;
        background: transparent;
        border: 1px solid transparent;

        overflow: visible;
        flex-shrink: 0;
        margin: 0;
    }
    
    .tab-group-wrapper:hover {
        background: transparent;
        border: 1px solid transparent;
    }

    .tab-group-wrapper.tab-dragging {
        opacity: 0.3;
    }
    
    .tab-group-wrapper.expanded {
        background: var(--tab-group-background);
        border: 1px solid hsl(0deg 0% 100% / 6%);
        overflow: hidden;
    }

    .tab-group-wrapper.expanded.active {
        --tab-group-background: #111111;
    }

    .tab-group-wrapper.expanded:not(.active) {
        border-color: hsl(0deg 0% 100% / 4.5%);
    }

    .tab-group-wrapper.expanded:not(.active):hover {
        --tab-group-background: #101010;
        border-color: hsl(0deg 0% 100% / 6%);
    }
    
    .tab-group {
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 12px;
        /* background: #ffffff0f; */
        transition: background-color 150ms ease, opacity 150ms ease;
        border: 1px solid  transparent;
        /* hsl(0deg 0% 100% / 2%); */
        height: 36px;
        flex-shrink: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        position: relative;
    }
    
    .tab-group:hover {
        background-color: var(--tab-hover-background);
        border: 1px solid var(--tab-hover-border);
    }
    
    .tab-group.expanded {
        border-radius: 12px 12px 0 0;
        border: 1px solid transparent;
        background: transparent;
        margin: 0;
        opacity: 0.35;
    }

    .tab-group.expanded:hover,
    .tab-group.expanded:has(:focus-visible) {
        opacity: 0.7;
    }
    
    .tab-group.expanded:hover {
        border-color: transparent;
        background: transparent;
    }

    .tab-group.active {
        background: var(--tab-active-background);
        border-color: var(--tab-active-border);
    }

    .tab-group.active:hover {
        background: var(--tab-active-hover-background);
        border-color: var(--tab-active-hover-border);
    }

    .tab-group.space-active-tab {
        background: rgb(255 255 255 / 6%);
        border-color: hsl(0deg 0% 100% / 5.5%);
    }

    .tab-group.expanded.active,
    .tab-group.expanded.space-active-tab {
        background: transparent;
        border-color: transparent;
    }

    .tab-group-scroll {
        position: relative;
        min-height: 0;
    }

    .tab-group-scroll::before,
    .tab-group-scroll::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        height: 16px;
        z-index: 10;
        pointer-events: none;
        opacity: 0;
        transition: opacity 150ms ease;
    }

    .tab-group-scroll::before {
        top: 0;
        background: linear-gradient(to bottom, var(--tab-group-background), transparent);
    }

    .tab-group-scroll::after {
        bottom: 0;
        background: linear-gradient(to top, var(--tab-group-background), transparent);
    }

    .tab-group-scroll:global([data-scroll-top='true']),
    .tab-group-scroll:global([data-scroll-bottom='true']),
    .group-resizing .tab-group-scroll {
        padding-bottom: 4px;
    }

    .tab-group-scroll:global([data-scroll-bottom='true'])::after {
        bottom: 4px;
    }

    /* The action adds these attributes at runtime, outside Svelte's CSS analysis. */
    .tab-group-scroll:global([data-scroll-top='true'])::before,
    .tab-group-scroll:global([data-scroll-bottom='true'])::after {
        opacity: 1;
    }
    
    .tab-group-content {
        display: none;
        flex-direction: column;
        padding: 5px 4px;
        gap: 4px;
        flex: 1;
        max-height: var(--tab-group-max-height, 206px);
        overflow-y: auto;
        overscroll-behavior-y: contain;
        scrollbar-width: thin;
        scrollbar-color: #ffffff33 transparent;
    }

    .tab-group-content .tab-item-container:not(.active):hover {
        background-color: var(--tab-group-tab-hover-background);
    }

    .tab-group-wrapper.expanded:not(.active) .tab-item-container.group-activation-target,
    .tab-group-wrapper.expanded:not(.active):hover:not(:has(> .tab-group-scroll:hover)) .tab-item-container,
    .tab-group-wrapper.expanded:not(.active):has(> .tab-group :focus-visible) .tab-item-container {
        transition: none;
    }

    .tab-group-wrapper.expanded:not(.active):hover:not(:has(> .tab-group-scroll:hover)) .tab-item-container.group-activation-target,
    .tab-group-wrapper.expanded:not(.active):has(> .tab-group :focus-visible) .tab-item-container.group-activation-target {
        background-color: var(--tab-group-tab-hover-background);
        border-color: var(--tab-hover-border);
    }

    .tab-group-content .tab-item-container.active {
        box-shadow: 0 -8px 8px -2px var(--tab-group-background), 0 8px 8px -2px var(--tab-group-background);
    }
    
    .tab-group-wrapper.expanded .tab-group-content {
        display: flex;
    }

    .tab-group-resize {
        display: none;
        position: absolute;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 4px;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: rgb(255 255 255 / 45%);
        opacity: 0;
        cursor: ns-resize;
        user-select: none;
        touch-action: none;
        z-index: 11;
        -webkit-app-region: no-drag;
    }

    .tab-group-resize svg {
        position: absolute;
        right: 4px;
        bottom: 0;
        width: 12px;
        height: 4px;
        pointer-events: none;
    }

    .tab-group-scroll:global([data-scroll-top='true']) > .tab-group-resize,
    .tab-group-scroll:global([data-scroll-bottom='true']) > .tab-group-resize,
    .group-resizing .tab-group-resize {
        display: block;
    }

    .tab-group-resize:hover,
    .tab-group-resize:focus-visible,
    .group-resizing .tab-group-resize {
        opacity: 1;
    }
    
    .tab-group-empty-message {
        color: rgba(255, 255, 255, 0.3);
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        text-align: center;
        padding: 20px;
    }
    
    .tab-group-main {
        background: transparent;
        border: 0;
        text-align: left;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 4px 8px;
        cursor: pointer;
        flex: 1;
        height: 36px;
        border-radius: 12px;
        min-width: 0;
        overflow: hidden;
    }
    
    .tab-group-count {
        color: rgba(255, 255, 255, 0.4);
        font-size: 10px;
        font-weight: 400;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 8px;
        min-width: 16px;
        text-align: center;
        margin-right: 8px;
        margin-top: 1px;
        flex-shrink: 0;
        opacity: 1;
        transition: opacity 150ms ease;
    }
    
    .tab-group-toggle {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        opacity: 0;
        margin-right: 8px;
        flex-shrink: 0;
        overflow: hidden;
        position: absolute;
        right: 0;
        transition: opacity 150ms ease, transform 150ms ease;
    }

    .tab-group-toggle svg {
        width: 14px;
        height: 14px;
        transition: transform 150ms ease;
    }

    .tab-group-toggle:hover {
        color: rgba(255, 255, 255, 0.9);
    }

    .tab-group-main:focus-visible, .tab-group-toggle:focus-visible {
        outline: 2px solid #a3a3a3;
        outline-offset: -2px;
    }
    
    .tab-group-toggle svg {
        transform: rotate(-90deg);
    }
    
    .tab-group.expanded .tab-group-toggle svg {
        transform: rotate(0deg);
    }
    
    .tab-group:hover .tab-group-count,
    .tab-group:has(:focus-visible) .tab-group-count {
        opacity: 0;
    }
    
    .tab-group:hover .tab-group-toggle,
    .tab-group:has(:focus-visible) .tab-group-toggle {
        opacity: 1;
    }
    
    /* Recently Closed Tabs */
    .closed-tabs-section {
        position: absolute;
        bottom: 8px;
        left: 9px;
        right: 8px;
        z-index: 10;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        /* width: calc(100% - 17px); */
        flex-shrink: 0;
    }

    :global(.sidebar-box.visible .closed-tabs-section)   {
        /* bottom: 6px; */
        /* left: 17px; */
        width: calc(100% - 19px);
        bottom: 1px;
    }
    
    .closed-tabs-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 12px;
        transition: all 50ms ease;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(15px);
        border: none;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
        position: relative;
        z-index: 11;
        width: 100%;
        min-width: 0;
        border: 1px solid #232323;
    }
    
    .closed-tabs-header:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .closed-tabs-title {
        color: rgba(255, 255, 255, 0.6);
        font-size: 11px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        flex: 1;
        text-align: left;
        min-width: 0;
    }
    
    .closed-tabs-count {
        color: rgba(255, 255, 255, 0.4);
        font-size: 10px;
        font-weight: 400;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 8px;
        min-width: 16px;
        text-align: center;
    }
    
    .closed-tabs-content {
        position: absolute;
        bottom: 100%;
        left: 0;
        right: 0;
        background: rgba(0, 0, 0, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 13px 13px 0 0;
        border-bottom: none;
        backdrop-filter: blur(20px);
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
        opacity: 0;
        visibility: hidden;
        transform: translateY(10px);
        transition: opacity 200ms ease, visibility 200ms ease, transform 200ms ease;
        pointer-events: none;
        max-height: 400px;
        overflow: hidden;
        width: 100%;
        box-sizing: border-box;
        flex-shrink: 0;
    }
    
    .closed-tabs-content.expanded {
        opacity: 1;
        visibility: visible;
        transform: translateY(8px);
        pointer-events: auto;
        transition: opacity 200ms ease, visibility 200ms ease, transform 200ms ease;
    }
    
    .closed-tabs-list {
        padding: 8px 8px 16px 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 360px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        flex-shrink: 0;
    }
    
    .closed-tabs-list::-webkit-scrollbar {
        width: 6px;
    }

    .closed-tabs-list::-webkit-scrollbar-track {
        background: transparent;
    }

    .closed-tabs-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .closed-tabs-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
    
    .closed-tab-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 8px;
        border-radius: 12px;
        background: transparent;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        height: 44px;
        flex-shrink: 0;
        width: 100%;
        text-align: left;
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
    }
    
    .closed-tab-item:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .closed-tab-item :global(.favicon-wrapper) {
        opacity: 0.3;
    }
    
    .tab-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
        overflow: hidden;
    }
    
    .closed-tab-item .tab-title {
        color: #c6c6c6;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        line-height: 1.2;
        mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
        -webkit-mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
    }
    
    .closed-tab-item .tab-space {
        color: rgba(255, 255, 255, 0.4);
        font-size: 10px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        line-height: 1.2;
        mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
        -webkit-mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
    }
    
    .closed-tab-remove {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 0;
        height: 20px;
        border-radius: 4px;
        opacity: 0;
        margin-right: 8px;
        flex-shrink: 0;
        overflow: hidden;
        line-height: 1;
        max-width: 28px;
    }

    .closed-tab-item:hover .closed-tab-remove {
        opacity: 1;
        width: 25px;
        padding: 0 4px;
    }

    .closed-tab-remove:hover {
        color: rgba(255, 255, 255, 0.9);
    }

    .closed-tab-item:hover :global(.favicon-wrapper) {
        opacity: 0.6;
    }
    
    .closed-tab-item:hover .tab-title {
        color: rgba(255, 255, 255, 0.7);
    }
    
    .closed-tab-item:hover .tab-space {
        color: rgba(255, 255, 255, 0.6);
    }

    /* .sidebar-content::-webkit-scrollbar {
        width: 6px;
    }

    .sidebar-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .sidebar-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .sidebar-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    } */

    /* .space-item-container {
        position: relative;
    }

    .space-context-menu {
        position: relative;
    } */

    .menu-scrim {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 9999;
        pointer-events: auto;
    }

    .space-context-menu-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        /* background: rgba(0, 0, 0, 0.5); */
        z-index: 9999;
        pointer-events: none;
    }

    .space-context-menu-dropdown {
        position: fixed;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 4px 0;
        min-width: 180px;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        transition: all 150ms ease;
        backdrop-filter: blur(12px);
        overflow: visible;
        pointer-events: auto;
    }

    .space-context-menu-dropdown.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }

    .space-context-menu-item {
        padding: 8px 14px;
        color: #fff;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.008em;
        line-height: 1;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: antialiased;
        cursor: pointer;
        transition: background 150ms ease;
        background: transparent;
        border: none;
        width: 100%;
        text-align: left;
    }

    .space-context-menu-item:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.95);
    }

    .space-context-menu-item:active {
        background: rgba(255, 255, 255, 0.15);
    }

    .space-context-menu-item.delete {
        color: #ff6b6b;
    }

    .space-context-menu-item.delete:hover {
        color: #ff4444;
        background: rgba(255, 107, 107, 0.1);
    }

    .space-context-menu-item.delete:active {
        background: rgba(255, 107, 107, 0.2);
    }
    
    /* Tab sidebar resize handle - positioned next to the fading divider line */
    .sidebar .resize-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 6px;
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(0, 0, 0, 0.1);
        cursor: ew-resize;
        z-index: 1000;
        opacity: 0;
        transition: opacity 150ms ease;
        pointer-events: auto;
        border-radius: 3px;
        margin-top: 4px;
        margin-bottom: 4px;
        box-shadow: 0 0 1px rgba(0, 0, 0, 0.15);
    }
    
    .sidebar .resize-handle:hover, 
    .sidebar .resize-handle.active {
        opacity: 1;
        background: rgba(255, 255, 255, 0.3);
        border: 1px solid rgba(0, 0, 0, 0.2);
        box-shadow: 0 0 2px rgba(0, 0, 0, 0.2);
    }
    
    /* Disable resize handle until sidebar is fully shown */
    .sidebar .resize-handle.disabled {
        pointer-events: none;
        opacity: 0 !important;
        cursor: default;
    }
    
    /* Position naturally at the right edge next to the divider line */
    .sidebar .resize-handle.resize-handle-right {
        right: -5px;
    }

    /* When visible, position it just to the right of the divider line */
    .sidebar-box.visible .resize-handle.resize-handle-right {
        right: -5px;
    }
    
    .tab-hovercard-sidebar {
        position: fixed;
        z-index: 10006;
        pointer-events: all;
        opacity: 0;
        animation: hovercard-sidebar-fade-in 0.2s ease-out forwards;
        -webkit-app-region: no-drag;
        user-select: none;
        /* Transparent hit area spans the gap on either side without moving the cards. */
        padding: 0 10px;
        margin-left: -10px;
    }

    .tab-hovercard-stack {
        max-height: calc(100vh - 40px);
        display: flex;
        flex-direction: column;
    }

    .tab-hovercard-sidebar.group-hovercards > .tab-hovercard-stack {
        box-sizing: border-box;
        width: 336px;
        max-width: calc(100vw - 20px);
        padding: 8px;
        gap: 8px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: #ffffff33 transparent;
        filter: drop-shadow(0 20px 20px rgb(0 0 0 / 40%)) drop-shadow(0 8px 8px rgb(0 0 0 / 20%));
    }

    .tab-hovercard-sidebar.group-hovercards > .tab-hovercard-stack:has(:global(.history-beside)) {
        width: 656px;
    }
    
    @keyframes hovercard-sidebar-fade-in {
        from {
            opacity: 0;
            transform: translateX(-10px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateX(0) scale(1);
        }
    }
</style>

<!-- <div class="drag-handle-left" class:drag-enabled={isDragEnabled}></div> -->

<!-- 

.deck-previewed {
  visibility: visible;
  padding: 67px !important;
  z-index: 180 !important;
  background: #000000c4;
  display: block;
  position: relative;
  -moz-subtree-hidden-only-visually: 0;
}

.deck-previewed > .browserContainer {
    width: 100%;
    height: 100%;
    border-radius: 9px;
    overflow: hidden;
    box-shadow: 0px 0px 13px #00000087;
}

#appcontent {
    margin-left: 14px;
    border-radius: 9px;
    overflow: hidden;
    border-left: 1px solid #cecece1a !important;
    border-top: none;
}

#TabsToolbar {
     visibility: collapse;
}

#urlbar-container {
   min-width: 30vw !important;
}

#urlbar {
    top: 4px!important;
}

#nav-bar.browser-toolbar {
    position: absolute!important;
    z-index: 100000;
    border-bottom-right-radius: 10px;
/*     box-shadow: 0px 0px 20px 0px #000000e3 !important; */
    padding: 16px!important;
    background: rgb(8,8,8) !important;
    padding-left: 50px;
    border: none;
    padding-left: 26px!important;
}

#navigator-toolbox {
    position: absolute!important;
    z-index: 10000;
    transition: transform 90ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateY(-72px);
    width: 100%;
    height: 84px;
    border: none !important;
    background-image: none !important;
    background: transparent !important;
}

#navigator-toolbox:hover {
    transition: transform 90ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateY(0px);
}


#navigator-toolbox:not(:hover) #downloads-indicator-progress-inner {
    position: fixed;
    top: 84px;
    left: 4px;
    z-index: 10000;
    width: 7px!important;
    height: 7px!important;
    visibility: visible;
    display: block;
/*     box-shadow: 0px 0px 5px blue; */
}

.certErrorPage.notSecureText:before {
    display: block;
    content: '';
    position: fixed;
    height: 5px;
    width: 5px;
    background: red;
    top: 74px;
    left: 5px;
    border-radius: 100%;
    box-shadow: 0px 0px 5px #f00;
}

.notSecure:before { 
    display: block;
    content: '';
    position: fixed;
    height: 5px;
    width: 5px;
    background: orange;
    top: 74px;
    left: 5px;
    border-radius: 100%;
    box-shadow: 0px 0px 5px #f00;
}

/* #navigator-toolbox:hover .certErrorPage.notSecureText:before {
   top: 6px; 
}
     */
#sidebar-header {
    display: none;
}

#sidebar {
    -moz-box-flex: 1;
    border-radius: 9px;
    box-shadow: 0 0 2px 0 #000;
    border: 1px solid rgb(41, 41, 43);
    overflow: hidden;
    height: 100%;
    background: transparent;
  }

#sidebar-box {
    background: transparent !important;
    position: absolute;
    height: unset !important;
    z-index: 100000;
    border-radius: 9px;
    bottom: 0px !important;
    top: 0px !important;
    overflow: hidden !important;
    transition: transform 190ms 340ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    padding-right: 15px;
/*     cursor: grab; */
    transform: translateX(-248px);
    backface-visibility: hidden;
    padding-left: 12px;
    background:  transparent !important;
    width: 263px !important;
}

#sidebar-box:hover  {
    transition: transform 190ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateX(0px);
}



/* #sidebar-box:hover  {
 padding-right: 55px;
} */ -->

<script>
    // Tab sidebar component with Firefox-like hover behavior
    // let { isDragEnabled = true } = $props() 
    let { 
        onShowApps = () => {},
        customTabSidebarWidth = null,
        tabSidebarVisible = false,
        isResizingTabSidebar = false,
        onStartResizeTabSidebar = null,
        devModeEnabled = false,
        onGoBack = null,
        onGoForward = null,
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
    import TabContextMenu from './TabContextMenu.svelte'
    import { untrack } from 'svelte'
    
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
    let menuCloseTimeout = null
    
    // Resize handle visibility - only enable after sidebar is fully shown
    let sidebarFullyShown = $state(false)
    let sidebarShowTimeout = null
    
    // Tab group expansion state
    let tabGroupExpanded = $state(true)
    
    function handleTabGroupToggle() {
        tabGroupExpanded = !tabGroupExpanded
    }
    
    // Tabs list vertical rubberband scroll state (per space for visual state, global for accumulation)
    let tabsListVerticalRubberBand = $state({}) // { [spaceId]: offset }
    let tabsListVerticalAccumulated = 0 // global accumulated deltaY - resets on horizontal scroll
    let tabsListSpacerVisible = $state({}) // { [spaceId]: boolean }
    let tabsListSpacerHeight = $state({}) // { [spaceId]: number } - current spacer height (0-250)
    let tabsListSeparatorAdded = $state({}) // { [spaceId]: boolean } - tracks if separator was added
    let tabsListScrollStartPosition = 0 // global scrollTop when gesture started
    let tabsListScrollGestureTimeout = null // global timeout id
    
    // Centralized function to close hovercard - prevents closing when URL bar is expanded
    function closeHovercard() {
        if (hovercardUrlBarExpanded) return
        hoveredTab = null
        hovercardShowTime = null
    }

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
    
    function handleMouseEnter() {
        isHovered = true
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
        // Don't hide sidebar when URL bar is expanded or in multi-space mode
        if (!urlBarExpanded && !multiSpaceMode) {
            // Always set isHovered to false for resize handle logic
            isHovered = false
            // Immediately disable resize handle when leaving
            if (sidebarShowTimeout) clearTimeout(sidebarShowTimeout)
            sidebarFullyShown = false
        }
        
        // Close context menu when leaving sidebar
        if (spaceContextMenuId !== null) {
            spaceContextMenuId = null
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
        if (!tabListRef) return
        
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
        
        // Reset vertical tabs list accumulation on horizontal scroll
        tabsListVerticalAccumulated = 0
        
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
    
    // Tabs list vertical rubberband scroll handling
    let tabsListSnapTimeouts = {}
    
    function handleTabsListWheel(event, spaceId) {
        const tabsList = event.currentTarget
        if (!tabsList) return
        

        
        const scrollTop = tabsList.scrollTop
        
        // Only handle vertical scroll down when at top
        if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
        
        const resistance = 0.05
        const threshold = 18
        const maxStretch = 25
        const activationThreshold = 400
        
        // DEBUG: completely disable rubberband to test
        // return
        const maxSpacerHeight = 250
        const maxStartPositionForActivation = 500
        
        // Track scroll gesture start position - only capture if not yet set and we're not already at top
        if (tabsListScrollStartPosition === 0 && scrollTop > 5) {
            tabsListScrollStartPosition = scrollTop
        }
        // Reset start position after gesture ends (no scroll events for 150ms)
        if (tabsListScrollGestureTimeout) clearTimeout(tabsListScrollGestureTimeout)
        tabsListScrollGestureTimeout = setTimeout(() => {
            tabsListScrollStartPosition = 0
            tabsListVerticalAccumulated = 0
        }, 150)
        
        // If spacer is visible and growing, continue growing it (no rubberband, just grow)
        if (tabsListSpacerVisible[spaceId]) {
            // Ensure rubberband is disabled during expansion
            if (tabsListVerticalRubberBand[spaceId]) {
                tabsListVerticalRubberBand = { ...tabsListVerticalRubberBand, [spaceId]: 0 }
            }
            
            const currentHeight = tabsListSpacerHeight[spaceId] || 0
            if (currentHeight < maxSpacerHeight && scrollTop <= 5 && event.deltaY < 0) {
                event.preventDefault()
                const growAmount = Math.abs(event.deltaY)
                tabsListSpacerHeight = {
                    ...tabsListSpacerHeight,
                    [spaceId]: Math.min(currentHeight + growAmount, maxSpacerHeight)
                }
            }
            return
        }
        
        // Only activate when nearly at top (within 20px)
        if (scrollTop > 20) {
            tabsListVerticalAccumulated = 0
            return
        }
        
        // console.log('tabsListScrollStartPosition', tabsListScrollStartPosition)
        // console.log('distanceScrolled', Math.abs(tabsListScrollStartPosition - scrollTop))
        // Don't activate rubberband if scroll started more than 500px from top
        if (tabsListScrollStartPosition > maxStartPositionForActivation) {
            return
        }
        
       
        // Don't activate if scrolled more than 400px during this gesture
        const distanceScrolled = Math.abs(tabsListScrollStartPosition - scrollTop)
        if (distanceScrolled > 400) {
            tabsListVerticalAccumulated = 0
            return
        }
        
        // Check if scrolling up while at top (deltaY < 0 = scroll up gesture = pulling content down)
        if (scrollTop <= 5 && event.deltaY < 0) {
            // Accumulate vertical scroll before activating spring
            tabsListVerticalAccumulated += Math.abs(event.deltaY)
            
            // console.log('[SPACER] accumulated:', tabsListVerticalAccumulated, 'threshold:', activationThreshold)
            
            // Only activate spring after threshold is met
            if (tabsListVerticalAccumulated < activationThreshold) {
                return
            }
            
            event.preventDefault()
            
            const currentOffset = tabsListVerticalRubberBand[spaceId] || 0
            tabsListVerticalRubberBand = {
                ...tabsListVerticalRubberBand,
                [spaceId]: Math.min(currentOffset - event.deltaY * resistance, maxStretch)
            }
            
            // If pulled far enough, break rubberband and start spacer
            if ((tabsListVerticalRubberBand[spaceId] || 0) > threshold && !tabsListSpacerVisible[spaceId]) {
                // Add separator at top if not already one
                ensureSeparatorAtTop(spaceId)
                
                // Reset rubberband immediately and start spacer with initial height
                tabsListVerticalRubberBand = { ...tabsListVerticalRubberBand, [spaceId]: 0 }
                tabsListVerticalAccumulated = 0
                tabsListSpacerVisible = { ...tabsListSpacerVisible, [spaceId]: true }
                tabsListSpacerHeight = { ...tabsListSpacerHeight, [spaceId]: 20 }
                return
            }
            
            scheduleTabsListSnapBack(spaceId)
        } else if (scrollTop <= 0 && event.deltaY > 0 && (tabsListVerticalRubberBand[spaceId] || 0) > 0) {
            // Scrolling down while rubber banding - reduce offset
            const currentOffset = tabsListVerticalRubberBand[spaceId] || 0
            tabsListVerticalRubberBand = {
                ...tabsListVerticalRubberBand,
                [spaceId]: Math.max(0, currentOffset - event.deltaY * 0.15)
            }
            if ((tabsListVerticalRubberBand[spaceId] || 0) <= 0) {
                tabsListVerticalRubberBand = { ...tabsListVerticalRubberBand, [spaceId]: 0 }
                tabsListVerticalAccumulated = 0
            }
        } else {
            // Reset when not at edge
            tabsListVerticalAccumulated = 0
        }
    }
    
    function ensureSeparatorAtTop(spaceId) {
        const space = data.spaces[spaceId]
        if (!space?.tabs?.length) return
        
        // Check if first tab is already a divider
        const firstTab = space.tabs[0]
        if (firstTab?.type === 'divider') {
            // Already has a separator at top, just mark that we've ensured it
            tabsListSeparatorAdded = { ...tabsListSeparatorAdded, [spaceId]: false }
            return
        }
        
        // Add in-memory separator at beginning (we don't persist this)
        tabsListSeparatorAdded = { ...tabsListSeparatorAdded, [spaceId]: true }
    }
    
    function scheduleTabsListSnapBack(spaceId) {
        if (tabsListSnapTimeouts[spaceId]) clearTimeout(tabsListSnapTimeouts[spaceId])
        tabsListSnapTimeouts[spaceId] = setTimeout(() => {
            snapBackTabsListRubberBand(spaceId)
        }, 30)
    }
    
    function snapBackTabsListRubberBand(spaceId) {
        const currentOffset = tabsListVerticalRubberBand[spaceId] || 0
        if (currentOffset === 0) {
            tabsListVerticalAccumulated = 0
            return
        }
        
        const newOffset = currentOffset * 0.85
        if (Math.abs(newOffset) < 0.5) {
            tabsListVerticalRubberBand = { ...tabsListVerticalRubberBand, [spaceId]: 0 }
            tabsListVerticalAccumulated = 0
        } else {
            tabsListVerticalRubberBand = { ...tabsListVerticalRubberBand, [spaceId]: newOffset }
            requestAnimationFrame(() => snapBackTabsListRubberBand(spaceId))
        }
    }
    
    function handleTabsListScrollForSpacer(event, spaceId) {
        const tabsList = event.currentTarget
        if (!tabsList) return
        
        if (!tabsListSpacerVisible[spaceId]) return
        
        const spacerHeight = tabsListSpacerHeight[spaceId] || 0
        const scrollTop = tabsList.scrollTop
        
        // Remove spacer once it's fully scrolled out of view
        if (scrollTop > spacerHeight + 30) {
            tabsListSpacerVisible = { ...tabsListSpacerVisible, [spaceId]: false }
            tabsListSeparatorAdded = { ...tabsListSeparatorAdded, [spaceId]: false }
        }
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
                const previousSpace = data.getPreviousActiveSpace()
                if (previousSpace && data.spaces[previousSpace]) {
                    spaceId = previousSpace
                } else {
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
                for (const tabId of targetSpace.activeTabsOrder) {
                    const tab = data.docs[tabId]
                    if (tab && !tab.archive && !tab.pinned) {
                        data.activate(tabId)
                        break
                    }
                }
            } else if (targetSpace?.tabs?.length > 0) {
                // Fallback: activate the first tab in the space
                const firstNonPinned = targetSpace.tabs.find(t => !t.pinned)
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
        // Close multi-space mode when switching tabs
        if (multiSpaceMode) {
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
        
        // Skip scroll handling during space switching to prevent unwanted tab activation
        if (isSwitchingSpaces) return
        
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
        // Handle the action (rename, change icon, set default container)
        console.log(`Action: ${action} for space: ${data.spaces[spaceId].name}`)
        
        if (action.startsWith('container-')) {
            const containerType = action.replace('container-', '')
            console.log(`Setting container to: ${containerType} for space: ${data.spaces[spaceId].name}`)
            // TODO: Implement container assignment logic
        }
        
        openMenuId = null
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
            data.newDivider()
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
            const activeTabElement = document.querySelector(`[data-tab-id="${data.spaceMeta.activeTabId}"]`)
            if (activeTabElement) {
                const tabsList = activeTabElement.closest('.tabs-list')
                if (tabsList) {
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
                // Check if still over a tab, closed tab, or pinned tab
                const hoveredTabElement = elementUnderCursor.closest('.tab-item-container') ||
                                         elementUnderCursor.closest('.closed-tab-item') ||
                                         elementUnderCursor.closest('.pinned-tab')
                if (hoveredTabElement) {
                    // Check if it's a DIFFERENT tab - if so, switch to it instantly
                    const tabId = hoveredTabElement.getAttribute('data-tab-id')
                    if (tabId && tabId !== hoveredTab.id && instantHovercardsMode) {
                        const newTab = data.docs[tabId] || data.spaceMeta.closedTabs.find(t => t.id === tabId)
                        if (newTab) {
                            // console.log('[DEBUG:HOVER] Switching to new tab during position check', tabId)
                            // Update to new tab immediately
                            const rect = hoveredTabElement.getBoundingClientRect()
                            const hovercardWidth = 320
                            
                            let x = rect.right
                            let y = rect.top - 26
                            
                            if (x + hovercardWidth > window.innerWidth - 10) {
                                x = rect.left - hovercardWidth - 10
                            }
                            if (x < 10) {
                                x = 10
                            }
                            
                            const hovercardHeight = newTab.screenshot ? 180 + 80 : 80
                            if (y + hovercardHeight > window.innerHeight - 20) {
                                y = window.innerHeight - hovercardHeight - 20
                            }
                            
                            hovercardPosition = { x, y }
                            hoveredTab = newTab
                            hovercardShowTime = Date.now()
                        }
                    }
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
        // Disable hovercards while spacer is visible (scrolling to add space)
        const anySpacerVisible = Object.values(tabsListSpacerVisible).some(v => v)
        if (anySpacerVisible) return
        
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
            // console.log('[DEBUG:HOVER] Showing hovercard for tab', tab.id)
            instantHovercardsMode = true
            
            if (instantModeResetTimer) {
                clearTimeout(instantModeResetTimer)
            }
            
            const tabElement = event.target.closest('.tab-item-container') || 
                              event.target.closest('.closed-tab-item') ||
                              event.target.closest('.pinned-tab')
            if (!tabElement) return
            
            const rect = tabElement.getBoundingClientRect()
            const hovercardWidth = 320
            
            let x = rect.right
            let y = rect.top - 26
            
            // Check if hovercard would go off right edge
            if (x + hovercardWidth > window.innerWidth - 10) {
                x = rect.left - hovercardWidth - 10
            }
            
            // Check if hovercard would go off left edge
            if (x < 10) {
                x = 10
            }
            
            // Check if hovercard would go off bottom (base card height only, history list scrolls if needed)
            const hovercardHeight = tab.screenshot ? 180 + 80 : 80
            if (y + hovercardHeight > window.innerHeight - 20) {
                y = window.innerHeight - hovercardHeight - 20
            }
            
            hovercardPosition = { x, y }
            hoveredTab = tab
            hovercardShowTime = Date.now()
            
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
            
            if (!isOverInfo && !isOverHovercard) {
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
            // TODO: Implement rename functionality
            console.log('Rename space:', spaceId)
        } else if (action === 'change-color') {
            // TODO: Implement color change functionality
            console.log('Change color for space:', spaceId)
        } else if (action === 'change-icon') {
            // TODO: Implement icon change functionality
            console.log('Change icon for space:', spaceId)
        } else if (action === 'delete') {
            // TODO: Implement delete functionality
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
            const response = await fetch('/devtools-api/json/list')
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
                    const updatedResponse = await fetch('/devtools-api/json/list')
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
                // Replace the remote DevTools frontend with local one while keeping WebSocket params
                const originalUrl = new URL(matchingItem.devtoolsFrontendUrl)
                const localDevToolsUrl = `https://localhost:5194/devtools-api/devtools/inspector.html?wss=localhost:5194/devtools-api/devtools/${originalUrl.search.split('/devtools/')[1]}`
                
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

<div class="sidebar-box" 
     class:hovered={isHovered || hoveredTab || urlBarExpanded || tabContextMenu.visible}
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
            
            <div class="section global-pins-section">
                <div class="pinned-tabs-grid">
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
                    {#each globallyPinnedTabs as tab}
                        <button class="pinned-tab" class:hibernated={!data.frames[tab.id]?.frame}
                                onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                                onmouseleave={handleTabMouseLeave}>
                            <Favicon {tab} showButton={false} />
                        </button>
                    {/each}
                </div>
            </div>

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

            <div class="section flex-1">
                <div class="tab-content-container" 
                     class:multi-space={multiSpaceMode}
                     class:rubber-banding={isRubberBanding}
                     class:closing={isClosingMultiSpace}
                     class:horizontal-scrolling={isHorizontalScrolling}
                     bind:this={tabListRef}
                     onscroll={handleTabScroll}
                     onwheel={handleTabContentWheel}
                     onscrollend={handleTabContentScrollEnd}
                     ondblclick={handleBackgroundDoubleClick}
                     role="region"
                     aria-label="Tab content area - double-click to create new tab"
                     style=""
                    >
                    <div class="tab-content-track" class:multi-space={multiSpaceMode}>
                        {#each data.spaceMeta.spaceOrder as spaceId, index (spaceId)}
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
                                    <button class="space-title" 
                                            class:active={data.spaceMeta.activeSpace === spaceId}
                                            onmousedown={(e) => handleSpaceClick(e, spaceId)}>
                                        {data.spaces[spaceId].name}
                                    </button>
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
                                                    onmouseup={() => handleMenuItemClick('rename', spaceId)}
                                                    role="menuitem">Rename</button>
                                            <button class="space-menu-item"
                                                    onmouseup={() => handleMenuItemClick('change-icon', spaceId)}
                                                    role="menuitem">Change icon</button>
                                            <button class="space-menu-item"
                                                    onmouseup={() => handleMenuItemClick('change-color', spaceId)}
                                                    role="menuitem">Change color</button>
                                            <button class="space-menu-item"
                                                    onmouseup={() => handleMenuItemClick('container', spaceId)}
                                                    role="menuitem">Container</button>
                                        </div>
                                    </div>
                                </div>
                                
                                {#if data.spaces[spaceId].pinnedTabs?.length > 0}
                                    <div class="pinned-tabs-grid">
                                        {#each data.spaces[spaceId].pinnedTabs as tab (tab.id)}
                                            <button class="app-tab" class:active={tab.id === data.spaceMeta.activeTabId} class:hibernated={!data.frames[tab.id]?.frame} onmousedown={() => activateTab(tab.id, spaceId)}>
                                                <Favicon {tab} showButton={false} />
                                            </button>
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
                                    <div class="tabs-list-fade-top" class:visible={tabsListScrolled[spaceId]}></div>
                                    <div class="tabs-list" 
                                         onscroll={(e) => { handleTabsListScroll(e); handleTabsListScrollForSpacer(e, spaceId); }}
                                         onwheel={(e) => handleTabsListWheel(e, spaceId)}
                                         style="transform: translateY({tabsListVerticalRubberBand[spaceId] || 0}px) translateZ(0)">
                                        
                                        {#if tabsListSpacerVisible[spaceId]}
                                            <div class="tabs-list-spacer" style="height: {tabsListSpacerHeight[spaceId] || 0}px"></div>
                                        {/if}
                                        
                                        {#if tabsListSeparatorAdded[spaceId]}
                                            <div class="tab-divider">
                                                <div class="tab-divider-line-only"></div>
                                            </div>
                                        {/if}
                                        
                                   {#each data.spaces[spaceId].tabs as tab, i (tab.id)}
                                        {#if tab.type === 'divider'}
                                            <div class="tab-divider">
                                                {#if tab.title}
                                                    <span class="tab-divider-title">{tab.title}</span>
                                                    <div class="tab-divider-line"></div>
                                                {:else}
                                                    <div class="tab-divider-line-only"></div>
                                                {/if}
                                            </div>
                                        {:else}
                                            <div class="tab-item-container" class:active={tab.id === data.spaceMeta.activeTabId} class:hibernated={!data.frames[tab.id]?.frame} class:space-active-tab={data.spaces[spaceId]?.activeTabsOrder?.[0] === tab.id && spaceId !== data.spaceMeta.activeSpace} data-tab-id={tab.id}
                                                 role="listitem"
                                                 onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                                                 onmouseleave={handleTabMouseLeave}
                                                 oncontextmenu={(e) => handleTabContextMenu(e, tab, i)}>
                                                <button class="tab-item-main" onmousedown={(e) => { if (e.button === 0) activateTab(tab.id, spaceId) }}>
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
                                    {/each}
                                    
                                    <!-- Tab Group -->
                                    <div class="tab-group-wrapper" class:expanded={tabGroupExpanded}>
                                        <div class="tab-group" class:expanded={tabGroupExpanded} title="April - 10 tabs">
                                            <div class="tab-group-main">
                                                <div class="tab-group-favicons">
                                                    <div class="tab-group-favicon">
                                                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>
                                                    </div>
                                                    <div class="tab-group-favicon">
                                                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                                                    </div>
                                                    <div class="tab-group-favicon fade">
                                                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.354-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117v-6.038H8.148zm7.704 0h-.002c-2.476 0-4.49 2.015-4.49 4.491s2.014 4.49 4.49 4.49c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491zm0 7.509c-1.665 0-3.019-1.355-3.019-3.019s1.354-3.019 3.019-3.019 3.019 1.355 3.019 3.019-1.354 3.019-3.019 3.019z"/></svg>
                                                    </div>
                                                </div>
                                                <span class="tab-group-title">April</span>
                                            </div>
                                            <span class="tab-group-count">10</span>
                                            <button class="tab-group-toggle" aria-label="Expand/collapse tab group" onclick={handleTabGroupToggle}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                            </button>
                                        </div>
                                        <div class="tab-group-content">
                                            <div class="tab-group-empty-message">No tabs in this group</div>
                                        </div>
                                    </div><!-- -->
                                    
                                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                                    <!-- Bottom spacer for scrolling and double-click to create new tab -->
                                    <div class="tabs-list-bottom-spacer" ondblclick={async () => {
                                        const newTab = await data.newTab(spaceId)
                                        if (newTab) {
                                            data.activateSpace(spaceId)
                                            data.activate(newTab.id)
                                        }
                                    }}></div>
                                </div>
                                    <div class="tabs-list-fade-bottom" class:visible={tabsListScrolledBottom[spaceId]}></div>
                                </div>
                            </div>
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
                        {#each data.spaceMeta.closedTabs as tab}
                            <button class="closed-tab-item" 
                                    onmousedown={() => data.restoreClosedTab(tab.id)}
                                    onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                                    onmouseleave={handleTabMouseLeave}>
                                <Favicon {tab} showButton={false} />
                                <div class="tab-text">
                                    <span class="tab-title">{data.docs[tab.id]?.title || tab.title}</span>
                                    <span class="tab-space">{data.spaces[tab.spaceId]?.name || 'Unknown Space'}</span>
                                </div>
                            </button>
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

{#if hoveredTab}
    {#key hoveredTab.id}
        <div class="tab-hovercard-sidebar" 
         style="left: {hovercardPosition.x}px; top: {hovercardPosition.y}px; --hovercard-top: {hovercardPosition.y}px;">
        
            <TabHoverCard tab={hoveredTab} 
                        isClosedTab={data.spaceMeta.closedTabs.some(t => t.id === hoveredTab.id)} 
                        showHistoryImmediately={closeButtonHoveredDelayed}
                        instantMode={instantHovercardsMode}
                        showDevTools={devModeEnabled}
                        availableHeight={window.innerHeight - hovercardPosition.y - 20}
                        onDevTools={handleDevToolsClick}
                        onGoBack={() => {
                            if (!hoveredTab?.id) return
                            // Activate tab first if not active
                            if (data.spaceMeta.activeTabId !== hoveredTab.id) {
                                data.activate(hoveredTab.id)
                            }
                            setTimeout(() => {
                                const frame = data.frames[hoveredTab?.id]?.frame
                                frame?.back?.()
                            }, 50)
                        }}
                        onGoForward={() => {
                            if (!hoveredTab?.id) return
                            if (data.spaceMeta.activeTabId !== hoveredTab.id) {
                                data.activate(hoveredTab.id)
                            }
                            setTimeout(() => {
                                const frame = data.frames[hoveredTab?.id]?.frame
                                frame?.forward?.()
                            }, 50)
                        }}
                        onReload={() => {
                            if (!hoveredTab?.id) return
                            if (data.spaceMeta.activeTabId !== hoveredTab.id) {
                                data.activate(hoveredTab.id)
                            }
                            setTimeout(() => {
                                data.reloadTab(hoveredTab?.id)
                            }, 50)
                        }}
                        onCloseTab={() => {
                            if (!hoveredTab?.id) return
                            data.closeTab(hoveredTab.id)
                            hovercardUrlBarExpanded = false
                            hoveredTab = null
                            hovercardShowTime = null
                        }}
                        onUrlBarExpandedChange={(expanded) => {
                            hovercardUrlBarExpanded = expanded
                        }}
                        onHistoryVisibilityChange={(visible) => {
                            if (visible) {
                                const historyHeight = 200
                                const neededBottom = hovercardPosition.y + (hoveredTab?.screenshot ? 180 + 80 : 80) + historyHeight
                                if (neededBottom > window.innerHeight - 20) {
                                    const adjustment = neededBottom - (window.innerHeight - 20)
                                    hovercardPosition = { ...hovercardPosition, y: Math.max(20, hovercardPosition.y - adjustment) }
                                }
                            }
                        }}
                        onMouseLeave={() => {
                setTimeout(() => {
                    const mouseX = window.mouseX || 0
                    const mouseY = window.mouseY || 0
                    const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
                    
                    const isOverHovercard = elementUnderCursor?.closest('.tab-hovercard-sidebar')
                    const isOverTab = elementUnderCursor?.closest('.tab-item-container') ||
                                    elementUnderCursor?.closest('.closed-tab-item') ||
                                    elementUnderCursor?.closest('.pinned-tab')
                    
                    if (!isOverHovercard && !isOverTab) {
                        closeHovercard()
                    }
                }, 100)
            }} />
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
    .sidebar-box {
        background: transparent;
        position: fixed;
        z-index: 2000;
        bottom: 9px;
        top: 43px;
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
        border-radius: 8px;
        transform: translateZ(0);
        backface-visibility: hidden;
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
        height: calc(100vh - 50px);
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
        border-radius: 9px;
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
        border-radius: 10px;
        /* background: rgb(255 255 255 / 7%); */
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
        width: 24px;
        height: 24px;
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
        width: 11px;
        height: 11px;
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
        width: 20px;
        height: 20px;
        border-radius: 10px;
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
        width: 14px;
        height: 14px;
        color: rgba(255, 255, 255, 0.3);
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
        z-index: 1000;
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
    }
    
    .space-title {
        color: rgba(255, 255, 255, 0.6);
        font-size: 11px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        text-align: left;
        background: transparent;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
    }
    
    .space-title:hover {
        color: rgba(255, 255, 255, 0.85);
    }
    
    .space-title.active {
        color: white;
        font-weight: 600;
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
        border-radius: 10px;
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
        z-index: 1000;
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
    
    .space-menu-item:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.95);
    }
    
    .space-menu-item:active {
        background: rgba(255, 255, 255, 0.15);
    }

    .space-item.scrolled:not(.active):after {
        border: 1px solid rgb(138 138 138);
        display: block;
        content: ' ';
        width: 48%;
        position: absolute;
        bottom: 1px;
    }

    /* Horizontal Tab Content */
    .tab-content-container {
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        -ms-overflow-style: none;
        flex: 1;
        min-height: 0;
        border-radius: 10px;
        width: calc(100% + 2px);
        transition: transform 0.1s ease-out;
        transform: translateZ(0);
        backface-visibility: hidden;
        contain: layout style;
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
        border-radius: 10px;
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
        background-color: rgb(255 255 255 / 9%);
        border: 1px solid hsl(0deg 0% 100% / 3%);
    }
    
    .app-tab.active {
        background: rgb(255 255 255 / 14%);
        border: 1px solid hsl(0deg 0% 100% / 4%);
    }
    
    .app-tab.active:hover {
        background: rgb(255 255 255 / 17%);
        border: 1px solid hsl(0deg 0% 100% / 5%);
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
        will-change: transform;
        backface-visibility: hidden;
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
    
    .tabs-list-spacer {
        flex-shrink: 0;
        width: 100%;
        pointer-events: none;
        will-change: height;
        contain: layout style;
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
        border-radius: 10px;
        /* background: rgb(255 255 255 / 7%); */
         background: #ffffff0f;
        transition: all 150ms ease;
        border: 1px solid hsl(0deg 0% 100% / 2%);
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
        border-radius: 10px;
        min-width: 0;
        overflow: hidden;
    }
    
    .tab-item-container:hover {
        background-color: rgb(255 255 255 / 9%);
        border: 1px solid hsl(0deg 0% 100% / 3%);
    }
    
    .tab-item-container.active {
        background: rgb(255 255 255 / 14%);
        border: 1px solid hsl(0deg 0% 100% / 4%);
    }
    
    .tab-item-container.active:hover {
        background: rgb(255 255 255 / 17%);
        border: 1px solid hsl(0deg 0% 100% / 5%);
    }
    
    :global(.favicon-wrapper) {
        opacity: 0.6;
    }
    
    :global(.favicon-wrapper svg) {
        width: 100%;
        height: 100%;
    }
    
    .tab-title {
        color: #c3c3c3;
        font-size: 13px;
        font-weight: 400;
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
        text-shadow: 0 0 0.3px currentColor;
    }
    
    .tab-item-container:hover .tab-title {
        color: #fff;
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
    }
    
    .tab-item-container.space-active-tab .tab-title {
        color: #e5e5e5;
        text-shadow: 0 0 0.3px currentColor;
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
    
    .tab-divider {
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
    
    /* New Tab Button */
    .new-tab-button {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 4px 8px;
        border-radius: 10px;
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
        border-radius: 10px;
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
        background-color: rgb(255 255 255 / 9%);
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
        color: #c6c6c6;
        font-size: 13px;
        font-weight: 400;
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
        display: flex;
        flex-direction: column;
        width: 100%;
        border-radius: 10px;
        background: transparent;
        border: 1px solid transparent;

        overflow: visible;
        flex-shrink: 0;
        margin: -1px;
        width: calc(100% + 2px);
    }
    
    .tab-group-wrapper:hover {
        background: transparent;
        border: 1px solid transparent;
    }
    
    .tab-group-wrapper.expanded {
        background: transparent;
        border: 1px solid hsl(0deg 0% 100% / 12%);
        min-height: 200px;
        overflow: hidden;
        margin-left: 0;
        margin-top: 0;
        margin-right: -2px;
        max-width: calc(100% + 0px);
    }
    
    .tab-group {
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 10px;
        background: #ffffff0f;
        transition: background-color 150ms ease;
        border: 1px solid hsl(0deg 0% 100% / 2%);
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
        background-color: rgb(255 255 255 / 9%);
        border: 1px solid hsl(0deg 0% 100% / 3%);
    }
    
    .tab-group.expanded {
        border-radius: 10px 10px 0 0;
        border: 1px solid transparent;
        background: #ffffff0f;
        margin-left: -1px;
        margin-top: -1px;
        width: calc(100% + 1px);
        max-width: unset;
    }
    
    .tab-group.expanded:hover {
        border: 1px solid transparent;
        background-color: rgb(255 255 255 / 9%);
    }
    
    .tab-group-content {
        display: none;
        flex-direction: column;
        padding: 8px;
        gap: 4px;
        flex: 1;
    }
    
    .tab-group-wrapper.expanded .tab-group-content {
        display: flex;
    }
    
    .tab-group-empty-message {
        color: rgba(255, 255, 255, 0.3);
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        text-align: center;
        padding: 20px;
    }
    
    .tab-group-main {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 4px 8px;
        cursor: pointer;
        flex: 1;
        height: 36px;
        border-radius: 10px;
        min-width: 0;
        overflow: hidden;
    }
    
    .tab-group-favicons {
        display: flex;
        align-items: center;
        margin-right: 6px;
    }
    
    .tab-group-favicon {
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.4);
        position: relative;
        margin-left: 4px;
    }
    
    .tab-group-favicon:first-child {
        margin-left: 0;
    }
    
    .tab-group-favicon.fade {
        position: relative;
        mask: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
        -webkit-mask: linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);
    }
    
    .tab-group-favicon svg {
        width: 100%;
        height: 100%;
    }
    
    .tab-group-title {
        color: #c3c3c3;
        font-size: 13px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        line-height: 1.2;
        margin-top: -2px;
        mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
        -webkit-mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
        min-width: 0;
        max-width: 100%;
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
    
    .tab-group-toggle svg {
        transform: rotate(-90deg);
    }
    
    .tab-group.expanded .tab-group-toggle svg {
        transform: rotate(0deg);
    }
    
    .tab-group-wrapper:hover .tab-group-count {
        opacity: 0;
    }
    
    .tab-group-wrapper:hover .tab-group-toggle {
        opacity: 1;
    }
    
    .tab-group-wrapper:hover .tab-group-title {
        color: #fff;
    }
    
    .tab-group-wrapper:hover .tab-group-favicon {
        color: rgba(255, 255, 255, 0.6);
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
        width: calc(100% - 20px);
        flex-shrink: 0;
    }

    :global(.sidebar-box.visible .closed-tabs-section)   {
        /* bottom: 6px; */
        /* left: 17px; */
        width: calc(100% - 19px);
    }
    
    .closed-tabs-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 10px;
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
        border-radius: 10px 10px 0 0;
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
        border-radius: 10px;
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
        max-width: 180px;
    }
    
    .closed-tab-item .tab-title {
        color: #c6c6c6;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
    }
    
    .closed-tab-item .tab-space {
        color: rgba(255, 255, 255, 0.4);
        font-size: 10px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
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
        width: 140px;
        z-index: 10000;
        opacity: 0;
        visibility: hidden;
        backdrop-filter: blur(12px);
        overflow: visible;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
        pointer-events: auto;
    }

    .space-context-menu-dropdown.open {
        opacity: 1;
        visibility: visible;
    }

    .space-context-menu-item {
        padding: 6px 12px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        cursor: pointer;
        transition: background 50ms ease;
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
        max-height: calc(100vh - var(--hovercard-top, 0px) - 20px);
        display: flex;
        flex-direction: column;
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
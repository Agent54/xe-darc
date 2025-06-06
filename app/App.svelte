<script>
    import PouchDB from 'pouchdb-browser'
    import NewTab from './NewTab.svelte'

    const db = new PouchDB('darc')

    db.allDocs({
        include_docs: true
    }).then(({rows}) => {
        console.log(rows)
    })

    function handleLoadCommit(event) {
        console.log('Page loaded:', event.url)
    }

    let tabs = $state([
        {
            id: 'tab-2',
            url: 'https://open.spotify.com/', 
            title: 'Spotify', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://open.spotify.com&size=64',
            audioPlaying: true,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        },
        { 
            id: 'tab-0',
            url: 'http://lanes.localhost/', 
            title: 'Lanes', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://lanes.pm&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        },
        { 
            id: 'tab-1',
            url: 'https://operaneon.com/', 
            title: 'Opera Neon', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://operaneon.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        },
        {
            id: 'tab-3',
            url: 'https://google.com', 
            title: 'Google', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        },
        {
            id: 'tab-4',
            url: 'about:newtab', 
            title: 'New Tab', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        },
        {
            id: 'tab-5',
            url: 'https://github.com/orgs/Agent54', 
            title: 'Agent54', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://github.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        },
        {
            id: 'tab-6',
            url: 'https://badssl.com/', 
            title: 'Bad SSL', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://badssl.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        }
    ])
    
    let closed = $state([])
    let activeTabIndex = $state(0)
    let visibilityTimers = new Map()
    let hoveredTab = $state(null)
    let hoverTimeout = null
    let hovercardPosition = $state({ x: 0, y: 0 })
    let isTrashItemHover = $state(false)
    let contextMenu = $state({ visible: false, x: 0, y: 0, tab: null })
    let hovercardCheckInterval = null
    let isDragEnabled = $state(true)
    let hovercardRecentlyActive = $state(false)
    let hovercardResetTimer = null
    let isWindowControlsOverlay = $state(false)
    let isScrolling = $state(false)
    let scrollTimeout = null
    let hovercardShowTime = null
    let isTabListOverflowing = $state(false)
    let isTabListAtEnd = $state(false)
    let isTabListAtStart = $state(true)

    let viewMode = $state('default')
    let lastUsedViewMode = $state('tile') // Default to tile as the alternative

    const mediaQueryList = window.matchMedia('(display-mode: window-controls-overlay)')
    isWindowControlsOverlay = mediaQueryList.matches
    mediaQueryList.addEventListener('change', e => setTimeout(() => { isWindowControlsOverlay = e.matches }, 0))
    
    function handleNewWindow(e) {
        console.log('New window:', e)
        tabs.push({ 
            id: crypto.randomUUID(),
            url: e.targetUrl, 
            title: e.title, 
            favicon: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${e.targetUrl}&size=64`,
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        })
        setTimeout(checkTabListOverflow, 50) // Check overflow after DOM update
    }

    function openNewTab() {
        const newTab = { 
            id: crypto.randomUUID(),
            url: 'about:newtab', 
            title: 'New Tab', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false,
            loading: false
        }
        tabs.push(newTab)
        activeTabIndex = tabs.length - 1 // Switch to the new tab
        setTimeout(checkTabListOverflow, 50) // Check overflow after DOM update
    }

    function handleKeyDown(event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 't') {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            event.cancelBubble = true
            openNewTab()
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
            event.preventDefault()
            if (tabs.length > 0) {
                const tabToClose = tabs[activeTabIndex]
                closeTab(tabToClose, event)
                if (activeTabIndex >= tabs.length) {
                    activeTabIndex = tabs.length - 1
                }
            }
        }
    }

    function openTab(tab, index) {
        console.log('Opening tab:', tab)
        activeTabIndex = index
        const frame = document.getElementById(`tab_${tab.id}`)
        if (frame) {
            frame.scrollIntoView({ behavior: 'smooth' })
        }
    }

    function closeTab(tab, event) {
        if (event) event.stopPropagation()
        if (tab.pinned) return // Don't close pinned tabs
        closed.push(tab)
        tabs = tabs.filter(t => t !== tab)
        setTimeout(checkTabListOverflow, 50) // Check overflow after DOM update
    }

    function restoreTab(tab) {
        tabs.push(tab)
        closed = closed.filter(t => t !== tab)
        setTimeout(checkTabListOverflow, 50) // Check overflow after DOM update
    }

    function clearAllClosedTabs() {
        closed = []
    }

    function handleTabContextMenu(event, tab, index) {
        event.preventDefault()
        event.stopPropagation()
        
        // Prevent opening a second context menu if one is already visible
        if (contextMenu.visible) {
            return
        }
        
        // Disable drag while context menu is open
        isDragEnabled = false
        
        contextMenu = {
            visible: true,
            x: event.clientX,
            y: event.clientY,
            tab: tab,
            index: index
        }
    }

    function hideContextMenu() {
        contextMenu = { visible: false, x: 0, y: 0, tab: null, index: null }
        // Re-enable drag when context menu closes
        isDragEnabled = true
    }

    // Handle right-clicks anywhere to close context menu
    function handleGlobalContextMenu(event) {
        if (contextMenu.visible) {
            event.preventDefault()
            hideContextMenu()
        }
    }

    function reloadTab(tab) {
        const frame = document.getElementById(`tab_${tab.id}`)
        if (frame && typeof frame.reload === 'function') {
            frame.reload()
        } else if (frame) {
            // Fallback: navigate to same URL
            frame.src = tab.url
        }
        hideContextMenu()
    }

    function togglePinTab(tab) {
        const tabIndex = tabs.findIndex(t => t.id === tab.id)
        if (tabIndex !== -1) {
            tabs[tabIndex].pinned = !tabs[tabIndex].pinned
        }
        hideContextMenu()
    }

    function toggleMuteTab(tab) {
        const tabIndex = tabs.findIndex(t => t.id === tab.id)
        if (tabIndex !== -1) {
            tabs[tabIndex].muted = !tabs[tabIndex].muted
            const frame = document.getElementById(`tab_${tab.id}`)
            if (frame && typeof frame.setAudioMuted === 'function') {
                frame.setAudioMuted(tabs[tabIndex].muted)
            }
        }
        hideContextMenu()
    }

    function closeTabFromMenu(tab) {
        const tabIndex = tabs.findIndex(t => t.id === tab.id)
        if (tabIndex !== -1) {
            closeTab(tab)
            if (activeTabIndex >= tabs.length) {
                activeTabIndex = tabs.length - 1
            }
        }
        hideContextMenu()
    }

    function setupIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const tabId = entry.target.id.replace('tab_', '')
                const tabIndex = tabs.findIndex(t => t.id === tabId)
                
                if (entry.isIntersecting) {
                    // Start timer when tab becomes visible
                    const timer = setTimeout(() => {
                        if (entry.isIntersecting) {
                            activeTabIndex = tabIndex
                        }
                    }, 250)
                    visibilityTimers.set(tabId, timer)
                } else {
                    // Clear timer when tab is no longer visible
                    const timer = visibilityTimers.get(tabId)
                    if (timer) {
                        clearTimeout(timer)
                        visibilityTimers.delete(tabId)
                    }
                }
            })
        }, {
            threshold: 0.5, // Tab must be 50% visible
            root: document.querySelector('.controlled-frame-container')
        })

        // Observe all frames (both controlledframes and NewTab components)
        tabs.forEach(tab => {
            const frame = document.getElementById(`tab_${tab.id}`)
            if (frame) observer.observe(frame)
        })

        return observer
    }

    let observer

    $effect(() => {
        if (tabs) {
            console.log('fix obeserver effect')
            if (observer) {
                observer.disconnect()
            }
            observer = setupIntersectionObserver()
        }
    })

    // Cleanup on component destroy
    $effect(() => {
        return () => {
            stopHovercardPositionCheck()
            if (observer) {
                observer.disconnect()
            }
            if (hovercardResetTimer) {
                clearTimeout(hovercardResetTimer)
            }
        }
    })

    function updateTabAudioState(frame) {
        if (frame && typeof frame.getAudioState === 'function') {
            frame.getAudioState().then(audible => {
                const tabId = frame.id.replace('tab_', '')
                const tabIndex = tabs.findIndex(t => t.id === tabId)
                if (tabIndex !== -1) {
                    tabs[tabIndex].audioPlaying = audible
                }
            }).catch(err => {
                console.log('Error getting audio state:', err)
            })
        }
    }

    function handleAudioStateChanged(event) {
        const tabId = event.target.id.replace('tab_', '')
        const tabIndex = tabs.findIndex(t => t.id === tabId)
        if (tabIndex !== -1) {
            tabs[tabIndex].audioPlaying = event.audible
        }
    }

    function handleLoadStart(tab) {
       tab.loading = true
    }

    function handleLoadStop(tab) {
        tab.loading = false
    }

    async function captureTabScreenshot(tab) {
        const frame = document.getElementById(`tab_${tab.id}`)
        if (!frame) {
            console.log('Frame not found for tab:', tab.id)
            return null
        }
        
        // Only capture screenshots for controlledframes, not NewTab components
        if (typeof frame.captureVisibleRegion !== 'function') {
            console.log('Frame does not support screenshot capture:', tab.id)
            return null
        }
        
        await new Promise(resolve => setTimeout(resolve, 500))

        try {
            let screenshot = null
            
            // Check if frame is ready and loaded
            const isFrameReady = () => {
                return frame.src && 
                       !frame.src.includes('about:blank') && 
                       frame.contentWindow !== null
            }
            
            // Wait for frame to be ready if needed
            if (!isFrameReady()) {
                console.log('Frame not ready for screenshot, waiting...')
                await new Promise(resolve => setTimeout(resolve, 1000))
                if (!isFrameReady()) {
                    console.log('Frame still not ready, skipping screenshot')
                    return null
                }
            }
            
            const imageDetails = {
                format: 'png',
                quality: 80
            }
            
            // Retry mechanism for flaky captures
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`Screenshot attempt ${attempt} for tab ${tab.id}`)
                    screenshot = await frame.captureVisibleRegion(imageDetails)
                    if (screenshot) {
                        console.log(`Screenshot successful on attempt ${attempt}`)
                        break
                    }
                } catch (captureError) {
                    console.log(`Capture attempt ${attempt} failed:`, captureError.message)
                    if (attempt < 3) {
                        // Wait before retry, increasing delay each time
                        await new Promise(resolve => setTimeout(resolve, attempt * 500))
                    }
                }
            }
            
            
            if (screenshot) {
                const tabIndex = tabs.findIndex(t => t.id === tab.id)
                if (tabIndex !== -1) {
                    tabs[tabIndex].screenshot = screenshot
                }
                return screenshot
            }
        } catch (err) {
            console.log('Error capturing screenshot:', err)
        }
        return null
    }

    function handleTabMouseEnter(tab, event) {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
        }
        
        // Use longer delay initially, shorter delay if recently active
        const delay = hovercardRecentlyActive ? 200 : 800
        
        hoverTimeout = setTimeout(() => {
            const tabElement = event.target.closest('.tab-container')
            const rect = tabElement.getBoundingClientRect()
            
            hovercardPosition = {
                x: rect.left + rect.width / 2,
                y: rect.bottom
            }
            
            isTrashItemHover = false
            hoveredTab = tab
            hovercardShowTime = Date.now()
            if (!tab.screenshot) {
                captureTabScreenshot(tab)
            }
            
            // Mark hovercards as recently active
            hovercardRecentlyActive = true
            
            // Reset the "recently active" state after 3 seconds of no hover activity
            if (hovercardResetTimer) {
                clearTimeout(hovercardResetTimer)
            }
            hovercardResetTimer = setTimeout(() => {
                hovercardRecentlyActive = false
            }, 3000)
            
            // Start checking cursor position
            startHovercardPositionCheck()
        }, delay)
    }

    function handleTabMouseLeave() {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
        }
        
        setTimeout(() => {
            // Don't hide if hovercard was just shown (prevent flicker during animation)
            if (hovercardShowTime && Date.now() - hovercardShowTime < 300) {
                return
            }
            
            // Only close if not hovering over hovercard
            const mouseX = window.mouseX || 0
            const mouseY = window.mouseY || 0
            const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
            
            if (!elementUnderCursor?.closest('.tab-hovercard')) {
                hoveredTab = null
                isTrashItemHover = false
                hovercardShowTime = null
                stopHovercardPositionCheck()
            }
        }, 250)
    }

    function handleTrashItemMouseEnter(tab, event) {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
        }
        
        // Use longer delay initially, shorter delay if recently active
        const delay = hovercardRecentlyActive ? 200 : 800
        
        hoverTimeout = setTimeout(() => {
            const trashItem = event.target.closest('.trash-menu-item')
            const rect = trashItem.getBoundingClientRect()
            
            // Calculate better positioning
            const hovercardWidth = 320 // hovercard width from CSS
            const hovercardHeight = 180 + 60 // screenshot height + info padding
            
            // Position to the left of the trash menu with some margin
            let x = rect.left - hovercardWidth - 20
            let y = rect.top + rect.height / 2
            
            // Ensure hovercard doesn't go off screen on the left
            if (x < 10) {
                x = rect.right + 20 // Position to the right if needed
            }
            
            // Ensure hovercard doesn't go off screen at the top
            if (y - hovercardHeight / 2 < 10) {
                y = hovercardHeight / 2 + 10
            }
            
            // Ensure hovercard doesn't go off screen at the bottom
            const maxY = window.innerHeight - hovercardHeight / 2 - 10
            if (y > maxY) {
                y = maxY
            }
            
            hovercardPosition = { x, y }
            
            isTrashItemHover = true
            hoveredTab = tab
            hovercardShowTime = Date.now()
            if (!tab.screenshot) {
                captureTabScreenshot(tab)
            }
            
            // Mark hovercards as recently active
            hovercardRecentlyActive = true
            
            // Reset the "recently active" state after 3 seconds of no hover activity
            if (hovercardResetTimer) {
                clearTimeout(hovercardResetTimer)
            }
            hovercardResetTimer = setTimeout(() => {
                hovercardRecentlyActive = false
            }, 3000)
            
            // Start checking cursor position
            startHovercardPositionCheck()
        }, delay)
    }

    function handleTrashItemMouseLeave() {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
        }
        
        setTimeout(() => {
            // Don't hide if hovercard was just shown (prevent flicker during animation)
            if (hovercardShowTime && Date.now() - hovercardShowTime < 300) {
                return
            }
            
            // Only close if not hovering over hovercard
            const mouseX = window.mouseX || 0
            const mouseY = window.mouseY || 0
            const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
            
            if (!elementUnderCursor?.closest('.tab-hovercard')) {
                hoveredTab = null
                isTrashItemHover = false
                hovercardShowTime = null
                stopHovercardPositionCheck()
            }
        }, 250)
    }

    function startHovercardPositionCheck() {
        stopHovercardPositionCheck() // Clear any existing interval
        
        hovercardCheckInterval = setInterval(() => {
            if (!hoveredTab) {
                stopHovercardPositionCheck()
                return
            }
            
            // Get current mouse position
            const mouseX = window.mouseX || 0
            const mouseY = window.mouseY || 0
            
            // Get element under cursor
            const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
            
            if (!elementUnderCursor) {
                // Cursor might be outside window
                hoveredTab = null
                isTrashItemHover = false
                stopHovercardPositionCheck()
                return
            }
            
            // Check if cursor is still over the triggering element or the hovercard
            let isStillHovering = false
            
            // Check if hovering over the entire hovercard (including padding)
            if (elementUnderCursor.closest('.tab-hovercard')) {
                isStillHovering = true
            } else if (isTrashItemHover) {
                // Check if still over trash menu or trash icon
                isStillHovering = elementUnderCursor.closest('.trash-menu-item') || 
                                elementUnderCursor.closest('.trash-menu') ||
                                elementUnderCursor.closest('.trash-icon')
            } else {
                // Check if still over the tab
                const hoveredTabElement = elementUnderCursor.closest('.tab-container')
                if (hoveredTabElement) {
                    // Make sure it's the same tab
                    const tabIndex = Array.from(hoveredTabElement.parentElement.children).indexOf(hoveredTabElement)
                    isStillHovering = tabs[tabIndex]?.id === hoveredTab.id
                }
            }
            
            if (!isStillHovering) {
                hoveredTab = null
                isTrashItemHover = false
                stopHovercardPositionCheck()
            }
        }, 50) // Reduced from 100ms to 50ms for more responsive checking
    }

    function stopHovercardPositionCheck() {
        if (hovercardCheckInterval) {
            clearInterval(hovercardCheckInterval)
            hovercardCheckInterval = null
        }
    }

    // Track mouse position globally
    function handleGlobalMouseMove(event) {
        window.mouseX = event.clientX
        window.mouseY = event.clientY
    }

    function handleScroll() {
        isScrolling = true
        
        if (scrollTimeout) {
            clearTimeout(scrollTimeout)
        }
        
        scrollTimeout = setTimeout(() => {
            isScrolling = false
        }, 150)
    }

    function selectViewMode(mode) {
        // Track the last non-default view mode
        if (viewMode !== 'default') {
            lastUsedViewMode = viewMode
        }
        viewMode = mode
    }
    
    function toggleViewMode() {
        if (viewMode === 'default') {
            viewMode = lastUsedViewMode
        } else {
            lastUsedViewMode = viewMode
            viewMode = 'default'
        }
    }
    
    function getViewModeIcon(mode) {
        switch (mode) {
            case 'default': return '🌐'
            case 'tile': return '🔲'
            case 'squat': return '📱'
            case 'canvas': return '🎨'
            default: return '📋'
        }
    }

    function checkTabListOverflow() {
        const tabList = document.querySelector('.tab-list')
        if (tabList) {
            isTabListOverflowing = tabList.scrollWidth > tabList.clientWidth
            checkTabListScrollPosition(tabList)
        }
    }

    function checkTabListScrollPosition(tabList = null) {
        if (!tabList) {
            tabList = document.querySelector('.tab-list')
        }
        if (tabList) {
            // Check if scrolled to the end (with 1px tolerance for rounding)
            isTabListAtEnd = tabList.scrollLeft + tabList.clientWidth >= tabList.scrollWidth - 1
            // Check if at the start (with 1px tolerance for rounding)
            isTabListAtStart = tabList.scrollLeft <= 1
        }
    }

    function handleTabListScroll(event) {
        checkTabListScrollPosition(event.target)
    }

    // Check overflow when tabs change
    $effect(() => {
        if (tabs) {
            // Use longer timeout to ensure DOM is fully updated
            setTimeout(checkTabListOverflow, 100)
        }
    })

    // Check overflow on window resize
    function handleResize() {
        checkTabListOverflow()
    }
</script>


<svelte:window onkeydowncapture={handleKeyDown} onclick={hideContextMenu} oncontextmenu={handleGlobalContextMenu} onmousemove={handleGlobalMouseMove} onresize={handleResize}/>

<header class:window-controls-overlay={isWindowControlsOverlay}>
    <div class="header-drag-handle" class:drag-enabled={isDragEnabled} style="{closed.length > 0 ? 'right: 115px;' : 'right: 80px;'}"></div>
     
    <div class="tab-wrapper" class:overflowing-right={isTabListOverflowing && !isTabListAtEnd} class:overflowing-left={isTabListOverflowing && !isTabListAtStart} style="top: 7px; left: 7px; width: {closed.length > 0 ? 'calc(100% - 180px)' : 'calc(100% - 142px)'};">
        <ul class="tab-list" style="padding: 0; margin: 0;" onscroll={handleTabListScroll}>
            {#each tabs as tab, i}
                <li class="tab-container" 
                    class:active={i===activeTabIndex} 
                    class:hovered={tab.id === hoveredTab?.id}
                    class:pinned={tab.pinned}
                    role="tab"
                    tabindex="0"
                    onclick={() => openTab(tab, i)}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTab(tab, i) } }}
                    oncontextmenu={(e) => handleTabContextMenu(e, tab, i)}
                    onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                    onmouseleave={handleTabMouseLeave}
                    >
                    <div class="tab">

                        <!-- -->
                        {#if tab.pinned}
                            📌
                        {/if}

                        {#if tab.loading}
                            <svg class="tab-loading-spinner" viewBox="0 0 16 16">
                                <path d="M8 2 A6 6 0 0 1 14 8" 
                                    fill="none" 
                                    stroke="rgba(255, 255, 255, 0.8)" 
                                    stroke-width="2" 
                                    stroke-linecap="round"/>
                            </svg>
                        {/if}
                        <img src={tab.favicon} alt="" class="favicon" />
                        <span> {#if tab.audioPlaying && !tab.muted}
                            🔊 &nbsp;
                        {:else if tab.muted}
                            🔇 &nbsp;
                        {/if}{tab.title || tab.url}</span>
                        {#if !tab.pinned}
                            <button class="close-btn" onclick={() => closeTab(tab, event)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeTab(tab, e) } }}>×</button>
                        {/if}
                    </div>
                </li>
            {/each}
            <li class="tab-spacer">
                <div class="spacer-drag-area"></div>
                <div class="spacer-scroll-area"></div>
            </li>
        </ul>
    </div>

    <div class="view-mode-icon" 
         role="button"
         tabindex="0"
         onclick={toggleViewMode}
         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleViewMode() } }}>
        {getViewModeIcon(viewMode)}
        <div class="view-mode-menu">
            <div class="view-mode-menu-header">View Mode</div>
            <div class="view-mode-menu-item" 
                 class:active={viewMode === 'default'}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); selectViewMode('default') }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('default') } }}>
                <span class="view-mode-icon-item">🌐</span>
                <span>Default</span>
                {#if viewMode === 'default'}<span class="checkmark">✓</span>{/if}
            </div>
            <div class="view-mode-menu-item" 
                 class:active={viewMode === 'tile'}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); selectViewMode('tile') }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('tile') } }}>
                <span class="view-mode-icon-item">🔲</span>
                <span>Tile View</span>
                {#if viewMode === 'tile'}<span class="checkmark">✓</span>{/if}
            </div>
            <div class="view-mode-menu-item" 
                 class:active={viewMode === 'squat'}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); selectViewMode('squat') }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('squat') } }}>
                <span class="view-mode-icon-item">📱</span>
                <span>Squat View</span>
                {#if viewMode === 'squat'}<span class="checkmark">✓</span>{/if}
            </div>
            <div class="view-mode-menu-item" 
                 class:active={viewMode === 'canvas'}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); selectViewMode('canvas') }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('canvas') } }}>
                <span class="view-mode-icon-item">🎨</span>
                <span>Canvas View</span>
                {#if viewMode === 'canvas'}<span class="checkmark">✓</span>{/if}
            </div>
        </div>
    </div>

    <div class="new-tab-button" 
         role="button"
         tabindex="0"
         onclick={openNewTab}
         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNewTab() } }}
         title="New Tab (⌘T)"
         style="{closed.length > 0 ? 'right: 163px;' : 'right: 125px;'}">
        <span class="new-tab-icon">+</span>
    </div>

    {#if closed.length > 0}
        <div class="trash-icon">
            🗑️ <span class="trash-count">{closed.length}</span>
            <div class="trash-menu">
                <div class="trash-menu-header">Recently Closed  </div>
                {#each closed.slice(-5) as closedTab}
                    <div class="trash-menu-item" 
                         role="button"
                         tabindex="0"
                         onmousedown={() => restoreTab(closedTab)}
                         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); restoreTab(closedTab) } }}
                         onmouseenter={(e) => handleTrashItemMouseEnter(closedTab, e)}
                         onmouseleave={handleTrashItemMouseLeave}>
                        <img src={closedTab.favicon} alt="" class="favicon" />
                        <span>{closedTab.title || closedTab.url}</span>
                    </div>
                {/each}
                {#if closed.length > 0}
                    <div class="trash-menu-separator"></div>
                    <div class="trash-menu-clear" 
                         onclick={() => clearAllClosedTabs()} 
                         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clearAllClosedTabs() } }}
                         tabindex="0" 
                         role="button">
                        <span>🗑️</span>
                        <span>Clear All ({closed.length})</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</header>

{#if contextMenu.visible && contextMenu.tab}
    <div class="context-menu-scrim" 
         role="button"
         tabindex="0"
         onmousedowncapture={hideContextMenu}
         oncontextmenu={(e) => { e.preventDefault(); hideContextMenu(); }}></div>
    
    <div class="context-menu" 
         role="menu"
         tabindex="0"
         style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
         onclick={(e) => e.stopPropagation()}
         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
         oncontextmenu={(e) => e.preventDefault()}>
        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => reloadTab(contextMenu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reloadTab(contextMenu.tab) } }}>
            <span class="context-menu-icon">🔄</span>
            <span>Reload</span>
        </div>
        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => togglePinTab(contextMenu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePinTab(contextMenu.tab) } }}>
            <span class="context-menu-icon">{contextMenu.tab.pinned ? '📌' : '📍'}</span>
            <span>{contextMenu.tab.pinned ? 'Unpin' : 'Pin'} Tab</span>
        </div>
        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => toggleMuteTab(contextMenu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMuteTab(contextMenu.tab) } }}>
            <span class="context-menu-icon">{contextMenu.tab.muted ? '🔊' : '🔇'}</span>
            <span>{contextMenu.tab.muted ? 'Unmute' : 'Mute'} Tab</span>
        </div>
        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => {}}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault() } }}>
            <span class="context-menu-icon">💤</span>
            <span>Hybernate</span>
        </div>

        <div class="context-menu-item"  
             role="menuitem"
             tabindex="0"
             onmouseup={() => {}}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault() } }}>
            <span class="context-menu-icon">🔄</span>
            <span>Move Tab</span>
        </div>

        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => {}}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault() } }}>
            <span class="context-menu-icon">🖼️</span>
            <span>Take Screenshot</span>
        </div>

        <div class="context-menu-separator"></div>

        <div class="context-menu-item danger" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => closeTabFromMenu(contextMenu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeTabFromMenu(contextMenu.tab) } }}>
            <span class="context-menu-icon">✕</span>
            <span>Close Tab</span>
        </div>
    </div>
{/if}

{#if hoveredTab}
    <div class="tab-hovercard" 
         class:trash-item={isTrashItemHover}
         style="left: {hovercardPosition.x}px; top: {hovercardPosition.y}px;">
        <div class="hovercard-content">
            <div class="hovercard-info"
                 role="region"
                 onmouseenter={() => {}}
                 onmouseleave={() => {
                     setTimeout(() => {
                        // return
                         // Only close if not hovering over the original trigger element
                         const mouseX = window.mouseX || 0
                         const mouseY = window.mouseY || 0
                         const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
                         
                         let shouldKeepOpen = false
                         
                         if (isTrashItemHover) {
                             shouldKeepOpen = elementUnderCursor?.closest('.trash-menu-item') || 
                                            elementUnderCursor?.closest('.trash-menu') ||
                                            elementUnderCursor?.closest('.trash-icon')
                         } else {
                             const hoveredTabElement = elementUnderCursor?.closest('.tab-container')
                             if (hoveredTabElement) {
                                 const tabIndex = Array.from(hoveredTabElement.parentElement.children).indexOf(hoveredTabElement)
                                 shouldKeepOpen = tabs[tabIndex]?.id === hoveredTab.id
                             }
                         }
                         
                         if (!shouldKeepOpen) {
                             hoveredTab = null
                             isTrashItemHover = false
                             stopHovercardPositionCheck()
                         }
                     }, 100)
                 }}>
                <div class="hovercard-title">{hoveredTab.title || 'Untitled'}</div>
                <div class="hovercard-url">{hoveredTab.url}</div>
            </div>
            {#if hoveredTab.screenshot}
                <div class="hovercard-screenshot">
                    <img src={hoveredTab.screenshot} alt="Page preview" />
                </div>
            {/if}
        </div>
    </div>
{/if}

<div class="controlled-frame-container browser-frame" class:window-controls-overlay={isWindowControlsOverlay} class:scrolling={isScrolling} onscroll={handleScroll} style="box-sizing: border-box;">
    {#each tabs as tab}
        {#if tab.url === 'about:newtab'}
            <NewTab class="frame" id="tab_{tab.id}" {tab} />
        {:else}
            <controlledframe 
                bind:this={tab.frame}
                class:window-controls-overlay={isWindowControlsOverlay}
                class:no-pointer-events={isScrolling}
                id="tab_{tab.id}"
                class="frame"
                src={tab.url}
                partition="persist:myapp"
                onloadcommit={handleLoadCommit}
                onnewwindow={(e) => { handleNewWindow(e)} }
                onaudiostatechanged={handleAudioStateChanged}
                allowscaling={true}
                autosize={true}
                allowtransparency={false}
                onloadstart={() => { handleLoadStart(tab) }}
                onloadstop={() => { handleLoadStop(tab) }}
            ></controlledframe>
        {/if}
    {/each}
</div>

<div class="drag-handle-left" class:drag-enabled={isDragEnabled}></div>
<div class="drag-handle-right" class:drag-enabled={isDragEnabled}></div>
<div class="drag-handle-bottom" class:drag-enabled={isDragEnabled}></div>

<style>
    header {
        position: fixed;
        left: env(titlebar-area-x, 80px);
        top: env(titlebar-area-y, 0);
        width: env(titlebar-area-width, 100%);
        height: env(titlebar-area-height, 33px);
        z-index: 1000;
        background-color: #000;
        color: #fff;
        display: none;
        align-items: center;
        color: #fff;
        font-size: 16px;
        font-weight: 600;
        padding: 0;
        z-index: 1000;
        gap: 8px;
        flex-direction: row;
        flex-wrap: nowrap;
        justify-content: flex-start;
        align-items: flex-start;
    }

    header.window-controls-overlay {
        display: flex;
    }

    .header-drag-handle {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 100%;
        pointer-events: auto;
        z-index: -1;
    }

    .drag-handle-left {
        position: fixed;
        top: 0;
        left: 0;
        width: 8px;
        height: 100vh;
        z-index: 999;
        pointer-events: auto;
    }

    .drag-handle-right {
        position: fixed;
        top: 0;
        right: 0;
        width: 8px;
        height: 100vh;
        z-index: 999;
        pointer-events: auto;
    }

    .drag-handle-bottom {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 8px;
        z-index: 999;
        pointer-events: auto;
    }

    .tab-wrapper {
        position: relative;
        -webkit-app-region: no-drag;
        z-index: 1;
    }

    .tab-wrapper.overflowing-right::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 20px;
        height: 100%;
        background: linear-gradient(to left, #000 0%, transparent 100%);
        pointer-events: none;
        z-index: 2;
    }

    .tab-wrapper.overflowing-left::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 20px;
        height: 100%;
        background: linear-gradient(to right, #000 0%, transparent 100%);
        pointer-events: none;
        z-index: 2;
    }

    .tab-list {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 7px;
        overflow-x: auto;
        overflow-y: hidden;
        -webkit-app-region: no-drag;
        position: relative;
        z-index: 1;
        scrollbar-width: none;
        -ms-overflow-style: none;
        width: 100%;
        height: 100%;
    }

    ul::-webkit-scrollbar {
        display: none;
    }
    .favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        opacity: 0.5;
        border-radius: 4px;
        /* FIXME: lanes favicon has white corners!!! */
    }
    .tab-container {
        user-select: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 400;
        font-family: 'Inter', sans-serif;
        padding: 4px;
        list-style: none;
        transition: border-color 0.3s ease;
        border-radius: 8px;
        background-color: hsl(0 0% 6% / 1);
        min-width: 130px;
        max-width: 200px;
        flex: 1 1 200px;
        -webkit-app-region: no-drag;
    }
    .tab-container:hover, .tab-container.hovered, .tab-container.active:hover, .tab-container.active.hovered {
        background-color: #2b2b2b;
    }
    .tab-container.active {
        background-color: hsl(0 0% 10% / 1);
    }
    .tab-container .tab {
        user-select: none;
        white-space: nowrap;
        text-overflow: ellipsis;
        text-decoration: none;
        color: hsl(0 0% 35% / 1);
        overflow: hidden;
        text-align: center;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 4px;
        position: relative;
    }
    .tab-container.active .tab {
        color: #999999;
    }
    .tab-container.active .favicon, .tab-container:hover .favicon, .tab-container.hovered .favicon {
        opacity: 1;
    }
    .tab-container:hover .tab, .tab-container.hovered .tab {
        color: #fff;
    }
    .tab-container .tab span {
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .tab-loading-spinner {
        position: absolute;
        top: 2px;
        left: 4px;
        width: 16px;
        height: 16px;
        animation: spin 1s linear infinite;
        z-index: 2;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .close-btn {
        background: none;
        border: none;
        color: #717171;
        cursor: pointer;
        font-size: 18px;
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        margin-left: auto;
        opacity: 0;
        transition: opacity 0.2s ease;
        margin-right: 4px;
    }

    .close-btn:hover {
        background-color: #2a2a2a;
        color: #fff;
    }

    .tab-container:hover .close-btn, .tab-container.hovered .close-btn {
        opacity: 1;
    }

    .trash-icon {
        position: fixed;
        top: 9px;
        right: 125px;
        width: 32px;
        height: 22px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.7;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
        z-index: 10000;
        user-select: none;
        -webkit-app-region: no-drag;
    }

    .trash-icon:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.9);
        transform: scale(1.05);
    }

    .trash-count {
        margin-left: 4px;
        margin-bottom: 1px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.8);
        font-weight: 500;
    }

    .trash-menu {
        z-index: 10010;
        font-family: 'Inter', sans-serif;
        position: absolute;
        top: 10px;
        right: 0;
        margin-top: 8px;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        min-width: 280px;
        max-width: 350px;
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px) scale(0.95);
        transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 10000;
        pointer-events: none;
        overflow: hidden;
        pointer-events: all;
    }

    .trash-icon:hover .trash-menu, .trash-menu:hover {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
        pointer-events: auto;
    }

    .trash-menu-header {
        padding: 12px 16px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.9);
        font-weight: 400;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .trash-menu-item {
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        position: relative;
        overflow: hidden;
    }

    .trash-menu-item:last-of-type {
        border-bottom: none;
        border-radius: 0 0 12px 12px;
    }

    .trash-menu-item:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08));
    }

    .trash-menu-item span {
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        font-weight: 400;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        line-height: 1.4;
    }

    .trash-menu-item .favicon {
        width: 16px;
        height: 16px;
        opacity: 0.9;
        flex-shrink: 0;
        border-radius: 3px;
    }

    .trash-menu-separator {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        margin: 8px 0;
    }

    .trash-menu-clear {
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
        border-radius: 0 0 12px 12px;
    }

    .trash-menu-clear:hover {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.15));
    }

    .trash-menu-clear:hover span:last-child {
        color: rgba(255, 255, 255, 1);
    }

    .trash-menu-clear span:first-child {
        font-size: 14px;
        opacity: 0.8;
    }

    .trash-menu-clear span:last-child {
        color: rgba(255, 255, 255, 0.8);
        font-size: 13px;
        font-weight: 500;
        flex: 1;
    }

    .view-mode-icon {
        position: fixed;
        top: 9px;
        right: 87px;
        width: 32px;
        height: 22px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.7;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
        z-index: 10000;
        user-select: none;
        -webkit-app-region: no-drag;
    }

    .view-mode-icon:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.9);
        transform: scale(1.05);
    }

    .view-mode-menu {
        z-index: 10010;
        font-family: 'Inter', sans-serif;
        position: absolute;
        top: 10px;
        right: 0;
        margin-top: 8px;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        min-width: 180px;
        max-width: 220px;
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-10px) scale(0.95);
        transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 10000;
        pointer-events: none;
        overflow: hidden;
    }

    .view-mode-icon:hover .view-mode-menu, .view-mode-menu:hover {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
        pointer-events: auto;
    }

    .view-mode-menu-header {
        padding: 12px 16px;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.9);
        font-weight: 400;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    


    .view-mode-menu-item {
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        position: relative;
        overflow: hidden;
    }

    .view-mode-menu-item:last-of-type {
        border-bottom: none;
        border-radius: 0 0 12px 12px;
    }

    .view-mode-menu-item:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08));
    }

    .view-mode-menu-item.active {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.15));
    }

    .view-mode-menu-item.active:hover {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(37, 99, 235, 0.2));
    }

    .view-mode-menu-item span {
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        font-weight: 400;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.4;
    }

    .view-mode-menu-item span:nth-child(2) {
        flex: 1;
    }

    .view-mode-icon-item {
        width: 16px;
        height: 16px;
        opacity: 0.9;
        flex-shrink: 0;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
    }

    .checkmark {
        margin-left: auto;
        color: rgba(34, 197, 94, 0.9);
        font-weight: 600;
        font-size: 12px;
    }

    .controlled-frame-container {
      height: 100vh;
      position: absolute;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 9px;
      margin: 0;
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      justify-content: flex-start;
      align-items: flex-start;
      width: 100%;
      gap: 9px;
      /* -webkit-app-region: drag;
      app-region: drag; */
      -webkit-app-region: no-drag;
      /* top: 38px; */
      bottom: 0;
      scrollbar-width: thin;
      scrollbar-color: #888 #f1f1f1;
      overscroll-behavior-x: none;
      -webkit-overflow-scrolling: touch;
      scroll-behavior: smooth;
      scroll-snap-type: x proximity;
      scroll-padding-left: 9px;
    }

    .controlled-frame-container.window-controls-overlay {
        height: calc(100vh - 38px);
    }
    
    .controlled-frame-container::-webkit-scrollbar {
      height: 8px;
    }
    
    .controlled-frame-container::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }
    
    .controlled-frame-container::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }
    
    .controlled-frame-container::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    .browser-frame {
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    
    :global(.frame) {
      width: calc(100vw - 18px);
      height: calc(100vh - 18px);
      border: none;
      display: block;
      border-radius: inherit;
      border-radius: 8px;
      overflow: hidden;
      flex: 0 0 auto;
      /* -webkit-app-region: no-drag; */
      -webkit-app-region: no-drag;
      user-select: none;
      scroll-snap-align: start;
      scroll-snap-stop: normal;
    }

    :global(.frame.window-controls-overlay) {
        height: calc(100vh - 56px);
    }

    :global(.frame.no-pointer-events) {
        pointer-events: none;
        user-select: none;
    }

    .controlled-frame-container.scrolling {
        scroll-behavior: auto;
    }

    .tab-hovercard {
        position: fixed;
        transform: translateX(-50%);
        z-index: 10006;
        pointer-events: all;
        opacity: 0;
        animation: hovercard-fade-in 0.2s ease-out forwards;
        -webkit-app-region: no-drag;
        padding-top: 12px;
        user-select: none;
    }

    .tab-hovercard.trash-item {
        transform: translateY(-50%);
        animation: hovercard-fade-in-trash 0.2s ease-out forwards;
    }

    @keyframes hovercard-fade-in {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(-10px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1);
        }
    }

    @keyframes hovercard-fade-in-trash {
        from {
            opacity: 0;
            transform: translateY(-50%) translateX(-10px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(-50%) translateX(0) scale(1);
        }
    }

    .hovercard-content {
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        width: 320px;
        max-width: 90vw;
    }

    .hovercard-info {
        padding: 16px;
        font-family: 'Inter', sans-serif;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .hovercard-info:last-child {
        border-bottom: none;
    }

    .hovercard-title {
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        margin-bottom: 6px;
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .hovercard-url {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .hovercard-screenshot {
        width: 100%;
        height: 180px;
        overflow: hidden;
        background: #1a1a1a;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    }

    .hovercard-screenshot img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .tab-container.pinned {
        background-color: hsl(210 100% 15% / 1);
        border: 1px solid hsl(210 100% 25% / 0.3);
    }

    .tab-container.pinned:hover {
        background-color: hsl(210 100% 20% / 1);
    }

    .tab-container.pinned .close-btn {
        display: none;
    }

    .tab-spacer {
        width: calc(100% - 80px);
        height: 22px;
        flex-shrink: 0;
        list-style: none;
        pointer-events: auto;
        position: relative;
        display: flex;
        flex-direction: column;
        -webkit-app-region: no-drag;
    }

    .spacer-drag-area {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 50%;
        -webkit-app-region: drag;
        cursor: move;
        pointer-events: auto;
        z-index: 2;
    }

    .spacer-scroll-area {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 50%;
        -webkit-app-region: no-drag;
        pointer-events: none;
        z-index: 1;
    }

    .new-tab-button {
        position: fixed;
        top: 9px;
        width: 25px;
        height: 22px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.7;
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
        z-index: 10000;
        user-select: none;
        -webkit-app-region: no-drag;
        border: 1px solid transparent;
        z-index: 10;
        padding-bottom: 2px;
    }

    .new-tab-button:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.9);
        transform: scale(1.05);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .new-tab-icon {
        color: rgba(255, 255, 255, 0.8);
        font-size: 14px;
        font-weight: 300;
        line-height: 1;
        transition: color 0.3s ease;
    }

    .new-tab-button:hover .new-tab-icon {
        color: rgba(255, 255, 255, 1);
    }

    .context-menu {
        position: fixed;
        z-index: 10002;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        min-width: 180px;
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        overflow: hidden;
        font-family: 'Inter', sans-serif;
        animation: context-menu-appear 0.15s ease-out;
        -webkit-app-region: no-drag;
    }

    @keyframes context-menu-appear {
        from {
            opacity: 0;
            transform: scale(0.95) translateY(-5px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }

    .context-menu-item {
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.9);
        user-select: none;
    }

    .context-menu-item:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.08));
    }

    .context-menu-item.danger:hover {
        background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.15));
        color: rgba(255, 255, 255, 1);
    }

    .context-menu-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 12px;
    }

    .context-menu-separator {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        margin: 4px 0;
    }

    .context-menu-scrim {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        z-index: 10001;
    }

    .drag-enabled {
        -webkit-app-region: drag;
    }
</style>

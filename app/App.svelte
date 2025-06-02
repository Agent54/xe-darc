<script>
    import PouchDB from 'pouchdb-browser'

    const db = new PouchDB('darc')

    db.allDocs({
        include_docs: true
    }).then(({rows}) => {
        console.log(rows)
    })

    function handleLoadCommit(event) {
        console.log('Page loaded:', event.url)
        updateTabAudioState(event.target)
    }
    
    function navigateToExample() {
      controlledFrame.navigate('https://example.com')
    }

    let tabs = $state([
        { 
            id: 'tab-1',
            url: 'https://operaneon.com/', 
            title: 'Opera Neon', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://operaneon.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false
        },
        {
            id: 'tab-2',
            url: 'https://open.spotify.com/', 
            title: 'Spotify', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://open.spotify.com&size=64',
            audioPlaying: true,
            screenshot: null,
            pinned: false,
            muted: false
        },
        {
            id: 'tab-3',
            url: 'https://google.com', 
            title: 'Google', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false
        },
        {
            id: 'tab-4',
            url: 'about:newtab', 
            title: 'New Tab', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false
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
            muted: false
        })
    }

    function openNewTab() {
        const newTab = { 
            id: crypto.randomUUID(),
            url: 'https://google.com', 
            title: 'Google', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64',
            audioPlaying: false,
            screenshot: null,
            pinned: false,
            muted: false
        }
        tabs.push(newTab)
        activeTabIndex = tabs.length - 1
    }

    function handleKeyDown(event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 't') {
            event.preventDefault()
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
        const controlledFrame = document.getElementById(`tab_${tab.id}`)
        if (controlledFrame) {
            controlledFrame.scrollIntoView({ behavior: 'smooth' })
        }
    }

    function closeTab(tab, event) {
        if (event) event.stopPropagation()
        if (tab.pinned) return // Don't close pinned tabs
        closed.push(tab)
        tabs = tabs.filter(t => t !== tab)
    }

    function restoreTab(tab) {
        tabs.push(tab)
        closed = closed.filter(t => t !== tab)
    }

    function clearAllClosedTabs() {
        closed = []
    }

    function handleTabContextMenu(event, tab, index) {
        event.preventDefault()
        event.stopPropagation()
        
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

        // Observe all controlled frames
        tabs.forEach(tab => {
            const frame = document.getElementById(`tab_${tab.id}`)
            if (frame) observer.observe(frame)
        })

        return observer
    }

    let observer

    $effect(() => {
        if (tabs) {
            if (observer) observer.disconnect()
            observer = setupIntersectionObserver()
        }
    })

    // Cleanup on component destroy
    $effect(() => {
        return () => {
            stopHovercardPositionCheck()
            if (observer) observer.disconnect()
        }
    })

    function updateTabAudioState(controlledFrame) {
        if (typeof controlledFrame.getAudioState === 'function') {
            controlledFrame.getAudioState().then(audible => {
                const tabId = controlledFrame.id.replace('tab_', '')
                const tabIndex = tabs.findIndex(t => t.id === tabId)
                if (tabIndex !== -1) {
                    tabs[tabIndex].audioPlaying = audible
                }
            }).catch(err => {
                console.log('Error getting audio state:', err)
            })
        }
    }

    async function captureTabScreenshot(tab) {
        const frame = document.getElementById(`tab_${tab.id}`)
        if (!frame) return null

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
            
            // Try the modern controlled frame API method with retries
            if (typeof frame.captureVisibleRegion === 'function') {
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
            }
            
            // Fallback to executeScript method if captureVisibleRegion fails
            if (!screenshot && typeof frame.executeScript === 'function') {
                try {
                    console.log('Trying executeScript fallback for screenshot')
                    screenshot = await frame.executeScript({
                        code: `
                            new Promise((resolve) => {
                                try {
                                    // Create a simple canvas representation
                                    const canvas = document.createElement('canvas');
                                    const ctx = canvas.getContext('2d');
                                    const width = Math.min(document.documentElement.scrollWidth || window.innerWidth, 1200);
                                    const height = Math.min(document.documentElement.scrollHeight || window.innerHeight, 800);
                                    
                                    canvas.width = width;
                                    canvas.height = height;
                                    
                                    // Get page background color
                                    const bgColor = window.getComputedStyle(document.body).backgroundColor || '#ffffff';
                                    ctx.fillStyle = bgColor !== 'rgba(0, 0, 0, 0)' ? bgColor : '#ffffff';
                                    ctx.fillRect(0, 0, width, height);
                                    
                                    // Add page title if available
                                    if (document.title) {
                                        ctx.fillStyle = '#333333';
                                        ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
                                        ctx.textAlign = 'center';
                                        ctx.fillText(document.title, width/2, height/2 - 20);
                                    }
                                    
                                    // Add URL
                                    ctx.fillStyle = '#666666';
                                    ctx.font = '14px system-ui, -apple-system, sans-serif';
                                    ctx.fillText(window.location.href, width/2, height/2 + 20);
                                    
                                    // Add page favicon if available
                                    const favicon = document.querySelector('link[rel*="icon"]');
                                    if (favicon && favicon.href) {
                                        const img = new Image();
                                        img.onload = () => {
                                            try {
                                                ctx.drawImage(img, width/2 - 16, height/2 - 60, 32, 32);
                                                resolve(canvas.toDataURL('image/png', 0.8));
                                            } catch (e) {
                                                resolve(canvas.toDataURL('image/png', 0.8));
                                            }
                                        };
                                        img.onerror = () => {
                                            resolve(canvas.toDataURL('image/png', 0.8));
                                        };
                                        img.src = favicon.href;
                                        
                                        // Timeout fallback
                                        setTimeout(() => {
                                            resolve(canvas.toDataURL('image/png', 0.8));
                                        }, 2000);
                                    } else {
                                        resolve(canvas.toDataURL('image/png', 0.8));
                                    }
                                } catch (error) {
                                    console.log('Canvas fallback error:', error);
                                    resolve(null);
                                }
                            })
                        `
                    })
                } catch (scriptError) {
                    console.log('ExecuteScript fallback failed:', scriptError)
                }
            }
            
            // Generate a themed placeholder if all else fails
            if (!screenshot) {
                console.log('Generating placeholder screenshot')
                screenshot = generatePlaceholderScreenshot(tab)
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

    function generatePlaceholderScreenshot(tab) {
        // Create a canvas-based placeholder that matches the site's theme
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = 1200
        canvas.height = 800
        
        // Dark theme gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
        gradient.addColorStop(0, '#1a1a1a')
        gradient.addColorStop(1, '#2a2a2a')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Add subtle grid pattern
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
        ctx.lineWidth = 1
        for (let i = 0; i < canvas.width; i += 50) {
            ctx.beginPath()
            ctx.moveTo(i, 0)
            ctx.lineTo(i, canvas.height)
            ctx.stroke()
        }
        for (let i = 0; i < canvas.height; i += 50) {
            ctx.beginPath()
            ctx.moveTo(0, i)
            ctx.lineTo(canvas.width, i)
            ctx.stroke()
        }
        
        // Add content
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.font = 'bold 48px system-ui, -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(tab.title || 'Loading...', canvas.width/2, canvas.height/2 - 40)
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.font = '24px system-ui, -apple-system, sans-serif'
        ctx.fillText(tab.url, canvas.width/2, canvas.height/2 + 20)
        
        // Add loading indicator
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
        ctx.font = '18px system-ui, -apple-system, sans-serif'
        ctx.fillText('Preview will update when page loads', canvas.width/2, canvas.height/2 + 80)
        
        return canvas.toDataURL('image/png', 0.8)
    }

    function handleTabMouseEnter(tab, event) {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
        }
        
        hoverTimeout = setTimeout(() => {
            const tabElement = event.target.closest('.tab')
            const rect = tabElement.getBoundingClientRect()
            
            hovercardPosition = {
                x: rect.left + rect.width / 2,
                y: rect.bottom + 8
            }
            
            isTrashItemHover = false
            hoveredTab = tab
            if (!tab.screenshot) {
                captureTabScreenshot(tab)
            }
            
            // Start checking cursor position
            startHovercardPositionCheck()
        }, 200)
    }

    function handleTabMouseLeave() {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
        }
        
        setTimeout(() => {
            hoveredTab = null
            isTrashItemHover = false
            stopHovercardPositionCheck()
        }, 50)
    }

    function handleTrashItemMouseEnter(tab, event) {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
        }
        
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
            if (!tab.screenshot) {
                captureTabScreenshot(tab)
            }
            
            // Start checking cursor position
            startHovercardPositionCheck()
        }, 200)
    }

    function handleTrashItemMouseLeave() {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
            hoverTimeout = null
        }
        
        setTimeout(() => {
            hoveredTab = null
            isTrashItemHover = false
            stopHovercardPositionCheck()
        }, 50)
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
            
            // Check if cursor is still over the triggering element
            let isStillHovering = false
            
            if (isTrashItemHover) {
                // Check if still over trash menu or trash icon
                isStillHovering = elementUnderCursor.closest('.trash-menu-item') || 
                                elementUnderCursor.closest('.trash-menu') ||
                                elementUnderCursor.closest('.trash-icon')
            } else {
                // Check if still over the tab
                const hoveredTabElement = elementUnderCursor.closest('.tab')
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
        }, 100) // Check every 100ms
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

    setInterval(() => {
        tabs.forEach(tab => {
            const frame = document.getElementById(`tab_${tab.id}`)
            if (frame) {
                updateTabAudioState(frame)
            }
        })
    }, 1500)
</script>

<svelte:window onkeydowncapture={handleKeyDown} onclick={hideContextMenu} onmousemove={handleGlobalMouseMove}/>

<header>
    <!-- Drag handle for header free space -->
    <div class="header-drag-handle"></div>
    
    <ul style="padding: 0; margin: 6px;">
        {#each tabs as tab, i}
            <li class="tab" class:active={i===activeTabIndex} class:pinned={tab.pinned}>
                <div 
                    onclick={() => openTab(tab, i)}
                    oncontextmenu={(e) => handleTabContextMenu(e, tab, i)}
                    onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                    onmouseleave={handleTabMouseLeave}
                >
                    {#if tab.pinned}
                        📌
                    {/if}
                    <img src={tab.favicon} alt="" class="favicon" />
                    <span> {#if tab.audioPlaying && !tab.muted}
                        🔊 &nbsp;
                    {:else if tab.muted}
                        🔇 &nbsp;
                    {/if}{tab.title || tab.url}</span>
                    {#if !tab.pinned}
                        <button class="close-btn" onclick={() => closeTab(tab, event)}>×</button>
                    {/if}
                </div>
            </li>
        {/each}
    </ul>

    {#if closed.length > 0}
        <div class="trash-icon">
            🗑️ <span class="trash-count">{closed.length}</span>
            <div class="trash-menu">
                <div class="trash-menu-header">Recently Closed  </div>
                {#each closed.slice(-5) as closedTab}
                    <div class="trash-menu-item" 
                         onclick={() => restoreTab(closedTab)}
                         onmouseenter={(e) => handleTrashItemMouseEnter(closedTab, e)}
                         onmouseleave={handleTrashItemMouseLeave}>
                        <img src={closedTab.favicon} alt="" class="favicon" />
                        <span>{closedTab.title || closedTab.url}</span>
                    </div>
                {/each}
                {#if closed.length > 0}
                    <div class="trash-menu-separator"></div>
                    <div class="trash-menu-clear" onclick={() => clearAllClosedTabs()}>
                        <span>🗑️</span>
                        <span>Clear All ({closed.length})</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</header>

<!-- Edge drag handles -->
<div class="drag-handle-left"></div>
<div class="drag-handle-right"></div>
<div class="drag-handle-bottom"></div>

{#if contextMenu.visible && contextMenu.tab}
    <!-- Transparent scrim to handle clicks outside context menu -->
    <div class="context-menu-scrim" onclick={hideContextMenu}></div>
    
    <div class="context-menu" 
         style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
         onclick={(e) => e.stopPropagation()}>
        <div class="context-menu-item" onclick={() => reloadTab(contextMenu.tab)}>
            <span class="context-menu-icon">🔄</span>
            <span>Reload</span>
        </div>
        <div class="context-menu-item" onclick={() => togglePinTab(contextMenu.tab)}>
            <span class="context-menu-icon">{contextMenu.tab.pinned ? '📌' : '📍'}</span>
            <span>{contextMenu.tab.pinned ? 'Unpin' : 'Pin'} Tab</span>
        </div>
        <div class="context-menu-item" onclick={() => toggleMuteTab(contextMenu.tab)}>
            <span class="context-menu-icon">{contextMenu.tab.muted ? '🔊' : '🔇'}</span>
            <span>{contextMenu.tab.muted ? 'Unmute' : 'Mute'} Tab</span>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item danger" onclick={() => closeTabFromMenu(contextMenu.tab)}>
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
            {#if hoveredTab.screenshot}
                <div class="hovercard-screenshot">
                    <img src={hoveredTab.screenshot} alt="Page preview" />
                </div>
            {:else}
                <div class="hovercard-screenshot placeholder">
                    <div class="loading-spinner"></div>
                </div>
            {/if}
            <div class="hovercard-info">
                <div class="hovercard-title">{hoveredTab.title || 'Untitled'}</div>
                <div class="hovercard-url">{hoveredTab.url}</div>
            </div>
        </div>
    </div>
{/if}

<div class="controlled-frame-container browser-frame w-full h-full"  style="width: 100%; height: 100%; box-sizing: border-box;">
    {#each tabs as tab}
        <controlledframe 
            id="tab_{tab.id}"
            src={tab.url}
            partition="persist:myapp"
            onloadcommit={handleLoadCommit}
            onnewwindow={(e) => { handleNewWindow(e)} }
        ></controlledframe>
    {/each}
</div>

<!-- <button on:click={navigateToExample}>Navigate to Example</button>
<button on:click={() => controlledFrame.back()}>Back</button>
<button on:click={() => controlledFrame.forward()}>Forward</button> -->

<style>
    header {
        /* -webkit-app-region: no-drag;
        app-region: no-drag; */
        position: fixed;
        top: 0;
        left: 80px;
        z-index: 1000;
        width: 100%;
        height: 38px;
        background-color: #000;
        color: #fff;
        display: flex;
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

    .header-drag-handle {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 100%;
        -webkit-app-region: drag;
        app-region: drag;
        pointer-events: auto;
        z-index: -1;
    }

    .drag-handle-left {
        position: fixed;
        top: 0;
        left: 0;
        width: 8px;
        height: 100vh;
        -webkit-app-region: drag;
        app-region: drag;
        z-index: 999;
        pointer-events: auto;
    }

    .drag-handle-right {
        position: fixed;
        top: 0;
        right: 0;
        width: 8px;
        height: 100vh;
        -webkit-app-region: drag;
        app-region: drag;
        z-index: 999;
        pointer-events: auto;
    }

    .drag-handle-bottom {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 8px;
        -webkit-app-region: drag;
        app-region: drag;
        z-index: 999;
        pointer-events: auto;
    }

    ul {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        justify-content: flex-start;
        align-items: flex-start;
        display: flex;
        gap: 7px;
        overflow: hidden;
        /* width: 100%; */
        /* max-width: 100px; */
        -webkit-app-region: no-drag;
        app-region: no-drag;
        position: relative;
        z-index: 1;
    }
    .favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        opacity: 0.5;
    }
    .tab {
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
        min-width: 60px;
        max-width: 150px;
        width: 200px;
        flex: 0 0 auto;
        -webkit-app-region: no-drag;
        app-region: no-drag;
    }
    .tab:hover, .tab.active:hover {
        background-color: #2b2b2b;
    }
    .tab.active {
        background-color: hsl(0 0% 10% / 1);
    }
    .tab div {
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
    .tab.active div {
        color: #999999;
    }
    .tab.active .favicon, .tab:hover .favicon {
        opacity: 1;
    }
    .tab:hover div{
        color: #fff;
    }
    .tab div span {
        overflow: hidden;
        text-overflow: ellipsis;
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

    .tab:hover .close-btn {
        opacity: 1;
    }

    .trash-icon {
        position: fixed;
        top: 8px;
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
        z-index: 1000;
        user-select: none;
        -webkit-app-region: no-drag;
        app-region: no-drag;
    }

    .trash-icon:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.9);
        transform: scale(1.05);
    }

    .trash-count {
        margin-left: 4px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.8);
        font-weight: 500;
    }

    .trash-menu {
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
    }

    .trash-icon:hover .trash-menu {
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

    .controlled-frame-container {
      position: fixed;
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
      height: 100%;
      gap: 9px;
      /* -webkit-app-region: drag;
      app-region: drag; */
      -webkit-app-region: no-drag;
      app-region: no-drag;
      top: 38px;
      scrollbar-width: thin;
      scrollbar-color: #888 #f1f1f1;
      overscroll-behavior-x: none;
      -webkit-overflow-scrolling: touch;
      scroll-behavior: smooth;
      scroll-snap-type: x mandatory;
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
    
    :global(controlledframe) {
      width: calc(100vw - 18px);
      height: calc(100vh - 56px);
      border: none;
      display: block;
      border-radius: inherit;
      border-radius: 8px;
      overflow: hidden;
      flex: 0 0 auto;
      /* -webkit-app-region: no-drag;
      app-region: no-drag; */
      -webkit-app-region: no-drag;
      app-region: no-drag;
      user-select: none;
    }

    .tab-hovercard {
        position: fixed;
        transform: translateX(-50%);
        z-index: 10001;
        pointer-events: none;
        opacity: 0;
        animation: hovercard-fade-in 0.2s ease-out forwards;
        -webkit-app-region: no-drag;
        app-region: no-drag;
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

    .hovercard-screenshot.placeholder {
        background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
    }

    .loading-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-top: 2px solid rgba(255, 255, 255, 0.4);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .hovercard-info {
        padding: 16px;
        font-family: 'Inter', sans-serif;
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

    .tab.pinned {
        background-color: hsl(210 100% 15% / 1);
        border: 1px solid hsl(210 100% 25% / 0.3);
    }

    .tab.pinned:hover {
        background-color: hsl(210 100% 20% / 1);
    }

    .tab.pinned .close-btn {
        display: none;
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
        app-region: no-drag;
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
</style>
  
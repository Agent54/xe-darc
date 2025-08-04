<script>
    // import { flip } from 'svelte/animate'

    import Frame from './components/Frame.svelte'
    import Resources from './components/ResourcesPanel.svelte'
    import Settings from './components/Settings.svelte'
    import UserMods from './components/UserMods.svelte'
    import Activity from './components/Activity.svelte'
    import AIAgent from './components/Agent.svelte'
    import Excalidraw from './components/Excalidraw.svelte'
    import TabSidebar from './components/TabSidebar.svelte'
    import CertificateMonitor from './components/CertificateMonitor.svelte'
    import Favicon from './components/Favicon.svelte'
    import UrlRenderer from './components/UrlRenderer.svelte'
    import { onMount, untrack } from 'svelte'
    import data from './data.svelte.js'
    import { origin } from './lib/utils.js'
    import { colors } from './lib/utils.js'
    window.darc = { data }

    // Proper detection of ControlledFrame API support
    function isControlledFrameSupported() {
        // Method 1: Check if the custom element is defined
        if (typeof window.HTMLControlledFrameElement !== 'undefined' || (typeof customElements !== 'undefined' && customElements.get('controlledframe'))) {
            // console.log('✅ ControlledFrame API detected via customElements.get()')
            return true
        }
        
        console.log('❌ ControlledFrame API not available - falling back to iframe')
        console.log('💡 To enable ControlledFrame API:')
        console.log('   1. Ensure you\'re running in an Isolated Web App (IWA)')
        console.log('   2. Add "controlled-frame" permission to your manifest.json')
        console.log('   3. Run Chrome with --enable-features=IsolatedWebApps,IsolatedWebAppControlledFrame')
        console.log('   4. Or enable chrome://flags/#isolated-web-app-controlled-frame')
        
        return false
    }

    let controlledFrameSupported = $state(isControlledFrameSupported())
    let fallbackColor = $state(null)
    let fallbackColorName = $state(null)

    const requestedResources = $state([])

   window.getScreenDetails().then(screen => {
       // console.log('screen control success', screen)
   }).catch(err => {
        console.log('screen control error. FIXME: needs to be triggered on user action for the first time, needs to be integrated into welcome screen/setup modal', err)
   })

    // handle permission change
    // navigator.permissions.query({name:'window-management'})
    // .then((status) => {
    //     // Do what you need with the permission state.
    //     console.log(status.state)
    // })

    chrome.runtime?.sendMessage(
        'fgeflhglmchkilcegppfkgmmabpppcia',
        {
            openUrlInEditor: 'url'
        },
        (...args) => {
            console.log(args)
        }
    )

    const partitions = [
        'persist:1',
        'persist:2',
        'persist:3',
        'ephemeral:1',
        'ephemeral:2',
        'ephemeral:3'
    ]

    // Get all tabs from the current active space
    let tabs = $derived(((data.spaceMeta.activeSpace && data.spaces[data.spaceMeta.activeSpace]?.tabs) || []))
    let visibilityTimers = new Map()
    let hoveredTab = $state(null)
    let hoverTimeout = null
    let hovercardPosition = $state({ x: 0, y: 0 })
    let isTrashItemHover = $state(false)
    let contextMenu = $state({ visible: false, x: 0, y: 0, tab: null, index: null })
    let contextMenuOpenTime = 0
    let hovercardCheckInterval = null
    let isDragEnabled = $state(true)
    let hovercardRecentlyActive = $state(false)
    let hovercardResetTimer = null
    let headerPartOfMain = $state(false)
    let isScrolling = $state(false)
    let scrollTimeout = null
    let hovercardShowTime = null
    let isTabListOverflowing = $state(false)
    let isTabListAtEnd = $state(false)
    let isTabListAtStart = $state(true)
    
    // Placeholder state for closed tabs
    let closedTabPlaceholderCount = $state(0)
    let tabBarHovered = $state(false)
    let collapsingPlaceholders = $state(false)

    let viewMode = $state('default')
    let lastUsedViewMode = $state('canvas')
    let showFixedNewTabButton = $state(false)
    let openSidebars = $state(new Set())
    let sidebarStateLoaded = $state(false)
    let focusModeEnabled = $state(false)
    let focusModeHovered = $state(false)
    let contentAreaScrimActive = $state(false)
    let hasLeftToggle = $state(false)
    let darkMode = $state(true)
    let dataSaver = $state(false)
    let batterySaver = $state(false)
    let secondScreenActive = $state(false)
    let statusLightsEnabled = $state(false)
    let certificateMonitorForTab = $state(null)
    let devModeEnabled = $state(false)
    let globalTabComplete = $state(true)
    let lightboxModeEnabled = $state(true)
    let tabsOpenRight = $state(true)
    
    // Window resize state for performance optimization
    let isWindowResizing = $state(false)
    let resizeTimeout = null

    // Track previous state to detect newly opened sidebars
    let prevOpenSidebars = $state(new Set())
    let isSwitchingSidebars = $state(false)

    let userMods = $state([])
    
    // URL editing state
    let isEditingUrl = $state(false)
    let editingUrlValue = $state('')
    let urlInput = $state(null)

    function getEnabledUserMods(tab) {
        if (!tab?.url) return { css: [], js: [] }
        
        const applicableMods = userMods.filter(mod => 
            mod.enabled
        )
        
        return {
            css: applicableMods.filter(mod => mod.type.includes('css')),
            js: applicableMods.filter(mod => mod.type.includes('js'))
        }
    }

    let userModsHash = $state(null)

    // Helper function to create SHA-256 hash using Web Crypto API
    async function createSHA256Hash(data) {
        const encoder = new TextEncoder()
        const dataBuffer = encoder.encode(data)
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }

    async function updateUserMods(newUserMods) {
        userMods = newUserMods
        const json = JSON.stringify(newUserMods)
        userModsHash = await createSHA256Hash(json)
        // Save to localStorage
        localStorage.setItem('userMods', json)
    }

    // Load user mods from localStorage
    async function loadPreferences() {
        try {
            const savedMods = localStorage.getItem('userMods')
            if (savedMods) {
                // dont slow done app start 
                userModsHash = 'initial' // await createSHA256Hash(savedMods)
                userMods = JSON.parse(savedMods)
            }
            
            // Load status lights setting
            const savedStatusLights = localStorage.getItem('statusLightsEnabled')
            if (savedStatusLights !== null) {
                statusLightsEnabled = savedStatusLights === 'true'
                data.settings.statusLightsEnabled = statusLightsEnabled
            }

            // Load dev mode setting
            const savedDevMode = localStorage.getItem('devModeEnabled')
            if (savedDevMode !== null) {
                devModeEnabled = savedDevMode === 'true'
                data.settings.devModeEnabled = devModeEnabled
                
                const savedShowLinkPreviews = localStorage.getItem('showLinkPreviews')
                if (savedShowLinkPreviews !== null) {
                    data.spaceMeta.config.showLinkPreviews = savedShowLinkPreviews === 'true'
                    data.settings.showLinkPreviews = data.spaceMeta.config.showLinkPreviews
                }
            }

            // Load global tab complete setting
            const savedGlobalTabComplete = localStorage.getItem('globalTabComplete')
            if (savedGlobalTabComplete !== null) {
                globalTabComplete = savedGlobalTabComplete === 'true'
                data.settings.globalTabComplete = globalTabComplete
            }

            // Load lightbox mode setting
            const savedLightboxMode = localStorage.getItem('lightboxModeEnabled')
            if (savedLightboxMode !== null) {
                lightboxModeEnabled = savedLightboxMode === 'true'
                data.settings.lightboxModeEnabled = lightboxModeEnabled
            }

            // Load tabs open right setting
            const savedTabsOpenRight = localStorage.getItem('tabsOpenRight')
            if (savedTabsOpenRight !== null) {
                tabsOpenRight = savedTabsOpenRight === 'true'
                data.settings.tabsOpenRight = tabsOpenRight
            }

            // Load view mode settings
            const savedViewMode = localStorage.getItem('viewMode')
            if (savedViewMode !== null) {
                viewMode = savedViewMode
                data.settings.viewMode = viewMode
            }

            const savedLastUsedViewMode = localStorage.getItem('lastUsedViewMode')
            if (savedLastUsedViewMode !== null) {
                lastUsedViewMode = savedLastUsedViewMode
                data.settings.lastUsedViewMode = lastUsedViewMode
            }

            // Load settings from Settings.svelte
            const savedSearchEngine = localStorage.getItem('defaultSearchEngine')
            if (savedSearchEngine) data.settings.defaultSearchEngine = savedSearchEngine

            const savedNewTabUrl = localStorage.getItem('defaultNewTabUrl')
            if (savedNewTabUrl) data.settings.defaultNewTabUrl = savedNewTabUrl

            const savedAiProvider = localStorage.getItem('selectedAiProvider')
            if (savedAiProvider) data.settings.selectedAiProvider = savedAiProvider

            const savedCustomSearchUrl = localStorage.getItem('customSearchUrl')
            if (savedCustomSearchUrl) data.settings.customSearchUrl = savedCustomSearchUrl

            const savedCustomNewTabUrl = localStorage.getItem('customNewTabUrl')
            if (savedCustomNewTabUrl) data.settings.customNewTabUrl = savedCustomNewTabUrl

            const savedSyncServerUrl = localStorage.getItem('syncServerUrl')
            if (savedSyncServerUrl) data.settings.syncServerUrl = savedSyncServerUrl

            const savedSyncServerToken = localStorage.getItem('syncServerToken')
            if (savedSyncServerToken) data.settings.syncServerToken = savedSyncServerToken

            // Load other App.svelte settings that don't use localStorage yet
            data.settings.darkMode = darkMode
            data.settings.dataSaver = dataSaver
            data.settings.batterySaver = batterySaver

            // Load open sidebars
            const savedOpenSidebars = localStorage.getItem('openSidebars')
            if (savedOpenSidebars !== null) {
                try {
                    const sidebarArray = JSON.parse(savedOpenSidebars)
                    openSidebars = new Set(sidebarArray)
                    console.log('Restored sidebar state:', sidebarArray)
                } catch (e) {
                    console.warn('Failed to parse saved sidebar state:', e)
                    openSidebars = new Set()
                }
            }
            
            // Mark sidebar state as loaded (whether we found saved state or not)
            sidebarStateLoaded = true
        } catch (error) {
            console.error('Error loading user mods:', error)
            userMods = []
        }
    }

    // Save open sidebars to localStorage whenever they change (but only after initial load)
    $effect(() => {
        if (!sidebarStateLoaded) return // Don't save during initial load
        
        try {
            const sidebarArray = Array.from(openSidebars)
            localStorage.setItem('openSidebars', JSON.stringify(sidebarArray))
            console.log('Saved sidebar state:', sidebarArray)
        } catch (error) {
            console.warn('Failed to save sidebar state:', error)
        }
    })

    // Determine if sidebars are newly opened (but not when switching)
    $effect(() => {
        // Don't update previous state during window resize to prevent false "new panel" detection
        if (isWindowResizing) {
            return
        }
        
        // Update previous state after a brief delay to allow animation
        setTimeout(() => {
            // Double-check that we're still not resizing when the timeout fires
            if (!isWindowResizing) {
                prevOpenSidebars = new Set(openSidebars)
                isSwitchingSidebars = false // Reset switching flag after state update
            }
        }, 200) // Slightly longer than animation duration
    })


    const borderlessQuery = window.matchMedia('(display-mode: borderless)')
    const controlsOverlayQuery = window.matchMedia('(display-mode: window-controls-overlay)')

    headerPartOfMain = controlsOverlayQuery.matches || borderlessQuery.matches
    let lastWindowHeight = window.innerHeight
    let lastWindowWidth = window.innerWidth
    function handleWindowResize() {
        const currentHeight = window.innerHeight
        const currentWidth = window.innerWidth
        
        // Detect any window size change (width or height)
        if (currentHeight !== lastWindowHeight || currentWidth !== lastWindowWidth) {
            lastWindowHeight = currentHeight
            lastWindowWidth = currentWidth
            headerPartOfMain = controlsOverlayQuery.matches || borderlessQuery.matches
            
            // Set resizing state immediately for fast response
            isWindowResizing = true
            
            // Clear previous timeout and set new one
            if (resizeTimeout) {
                clearTimeout(resizeTimeout)
            }
            
                    // Clear resizing state after resize stops (debounced)
        resizeTimeout = setTimeout(() => {
            isWindowResizing = false
            resizeTimeout = null
            // Immediately sync previous state to prevent false "new panel" detection
            prevOpenSidebars = new Set(openSidebars)
        }, 150) // Shorter delay to reduce flash time while still ensuring smooth transitions
        }
    }
    controlsOverlayQuery.addEventListener('change', e => {
        headerPartOfMain = e.matches
    })

    borderlessQuery.addEventListener('change', e => {
        headerPartOfMain = e.matches
    })

    // if running in iframe set headerPartOfMain to true to show tabs
    if (window.self !== window.top) {
        headerPartOfMain = true
    }

    window.addEventListener('resize', handleWindowResize)

    // Listen for the global Cmd+W/Ctrl+W custom event from main.js
    function handleGlobalTabClose(event) {
        console.log('Received global tab close event')
        handleTabClose(event.detail?.originalEvent || event)
    }

    // Listen for keyboard events from controlled frames
    function handleFrameTabClose(event) {
        const { tabId, sourceFrame } = event.detail
        console.log(`Received tab close request from controlled frame: ${tabId}`)
        
        // Find the tab with matching ID
        const tab = data.docs[tabId]
        if (tab) {
            console.log(`Closing tab: ${tab.title}`)
            closeTab(tab, event)
        } else {
            console.warn(`Tab with ID ${tabId} not found`)
        }
    }

    function handleFrameNewTab(event) {
        const { tabId, sourceFrame } = event.detail
        console.log(`Received new tab request from controlled frame: ${tabId}`)
        openNewTab()
    }

    function handleFrameMouseDown(event) {
        isMouseDown = true
    }

    function handleFrameMouseUp(event) {
        isMouseDown = false
    }

    window.addEventListener('darc-close-tab', handleGlobalTabClose)
    window.addEventListener('darc-close-tab-from-frame', handleFrameTabClose)
    window.addEventListener('darc-new-tab-from-frame', handleFrameNewTab)
    window.addEventListener('darc-controlled-frame-mousedown', handleFrameMouseDown)
    window.addEventListener('darc-controlled-frame-mouseup', handleFrameMouseUp)

    function openNewTab() {        
        const newTab = data.newTab(data.spaceMeta.activeSpace, { shouldFocus: true })
        if (newTab) {
            setTimeout(checkTabListOverflow, 50) // Check overflow after DOM update
        }
    }

    function handleKeyDown(event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 't') {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            event.cancelBubble = true
            // Clear flag on user-initiated actions
            if (tabChangeFromScroll) {
                tabChangeFromScroll = false
                if (tabChangeFromScrollTimer) {
                    clearTimeout(tabChangeFromScrollTimer)
                    tabChangeFromScrollTimer = null
                }
            }
            openNewTab()
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            // Clear flag on user-initiated actions
            if (tabChangeFromScroll) {
                tabChangeFromScroll = false
                if (tabChangeFromScrollTimer) {
                    clearTimeout(tabChangeFromScrollTimer)
                    tabChangeFromScrollTimer = null
                }
            }
            handleTabClose(event)
        }
        if ((event.metaKey || event.ctrlKey) && event.key === '0') {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            handleZoomReset()
        }
    }

    function handleZoomReset() {
        if (tabs.length > 0 && data.spaceMeta.activeTabId) {
            if (data.frames[data.spaceMeta.activeTabId]) {
                const frame = data.frames[data.spaceMeta.activeTabId]?.frame
                
                if (frame && frame.setZoom) {
                    frame.setZoom(1.0).then(() => {
                        console.log(`[Tab ${data.spaceMeta.activeTabId}] Zoom reset to 100%`)
                    }).catch((error) => {
                        console.error(`[Tab ${data.spaceMeta.activeTabId}] Failed to reset zoom:`, error)
                    })
                } else if (frame && !frame.setZoom) {
                    console.warn(`[Tab ${data.spaceMeta.activeTabId}] setZoom API not available on this frame`)
                } else {
                    console.warn('No active frame available for zoom reset')
                }
            } else {
                console.warn('Active tab not found')
            }
        } else {
            console.warn('No active tab available for zoom reset')
        }
    }

    function handleTabClose(event) {
        if (tabs.length > 0 && data.spaceMeta.activeTabId) {
            const activeTab = data.docs[data.spaceMeta.activeTabId]
            if (activeTab) {
                closeTab(activeTab, event)
            }
        } else {
            console.log('No tabs to close')
        }
    }

    function openTab(tab, index) {
        console.log('openTab called for tab:', tab.id, 'tabChangeFromScroll:', tabChangeFromScroll)
        // Clear the tabChangeFromScroll flag when user explicitly clicks a tab
        if (tabChangeFromScroll) {
            tabChangeFromScroll = false
            if (tabChangeFromScrollTimer) {
                clearTimeout(tabChangeFromScrollTimer)
                tabChangeFromScrollTimer = null
            }
        }
        
        // If clicking on the currently active tab, switch to previous tab
        if (tab.id === data.spaceMeta.activeTabId) {
            data.previous()
        } else {
            // Set this tab as active using the data store function
            console.log('calling data.activate for tab:', tab.id)
            data.activate(tab.id)
        }
        
        // // Immediate scroll for user interaction
        // tab frame?.scrollIntoView({ 
        //     behavior: isWindowResizing ? 'auto' : 'smooth' 
        // })
    }

    let tabButtons = $state({})


    // Effect to handle scrolling to active tab when it changes or when sidebars are toggled
    $effect(() => {
        // Watch for changes to active tab and sidebar state
        const sidebarCount = openSidebars.size // just for triggering effect
        const activeFrameWrapper = data.frames[data.spaceMeta.activeTabId]?.wrapper

        if (!activeFrameWrapper) {
            return
        }
        
        console.log('scroll effect triggered for tab:', data.spaceMeta.activeTabId, 'tabChangeFromScroll:', {tabChangeFromScroll})

        // Don't scroll if tab change was caused by scrolling
        // if (tabChangeFromScroll) {
        //     return
        // }
        
        // Set flag to prevent intersection observer from activating intermediate tabs during scroll
        // tabChangeFromScroll = true
        
        // Only scroll frame into view if tab change was NOT caused by scrolling
        if (!tabChangeFromScroll) {
            setTimeout(() => {
                if (activeFrameWrapper) {
                    console.log('calling scrollIntoView for tab:', data.spaceMeta.activeTabId)
                    activeFrameWrapper.scrollIntoView({ 
                        behavior:  'instant' // isWindowResizing ? 'auto' : 'smooth' 
                    })
                } else {
                    console.warn('Frame wrapper not available for tab:', data.spaceMeta.activeTabId)
                }
            }, 10)
        }
        
        setTimeout(() => {
            if (tabButtons[data.spaceMeta.activeTabId]) {
                tabButtons[data.spaceMeta.activeTabId].scrollIntoView({
                    behavior: isWindowResizing ? 'auto' : 'smooth',
                    inline: 'nearest',
                    block: 'nearest'
                })
            }
        }, 10)
        
        // Reset flag after scroll animation completes (longer delay for smooth scrolling)
        // setTimeout(() => {
        //     tabChangeFromScroll = false
        // }, isWindowResizing ? 100 : 800)
    })

    let pinsInit = false
    $effect(() => {
        const leftCount = leftPinnedTabs.length
        const rightCount = rightPinnedTabs.length

        console.log({leftCount, rightCount, tabChangeFromScroll})
        
        if (tabChangeFromScroll || !pinsInit) {
            pinsInit = true
            return
        }
    
        untrack(() => {
             // Find the active tab in unpinned tabs
            if (data.spaceMeta.activeTabId) {
                console.log('pins effect triggered for tab:', data.spaceMeta.activeTabId)
                const activeFrameWrapper = data.frames[data.spaceMeta.activeTabId]?.wrapper
                // Scroll the active unpinned tab into view after pinned tabs layout change
                setTimeout(() => {
                    if (activeFrameWrapper) {
                        activeFrameWrapper.scrollIntoView({ 
                            behavior: 'instant' // isWindowResizing ? 'auto' : 'smooth' 
                        })
                    } else {
                        // If no specific active tab, scroll to the beginning of unpinned section
                        const firstUnpinnedTab = unpinnedTabs[0]
                        const wrapper = data.frames[firstUnpinnedTab.id]?.wrapper
                        if (wrapper) {
                            wrapper.scrollIntoView({ 
                                behavior: 'instant' // isWindowResizing ? 'auto' : 'smooth' 
                            })
                        }
                    }
                }, 200)
            }
        })
       
    })

    function closeTab(tab, event, createPlaceholder = false) {
        if (event) event.stopPropagation()

        data.closeTab(data.spaceMeta.activeSpace, tab.id)

        // TODO: find better approahc If closing the last tab, open a new tab
        // if (result.wasLastTab) {
        //     openNewTab()
        // }
        
        // Create placeholder for closed tab to maintain spacing (only from tab bar close button)
        // Don't create placeholder when closing the last tab since we immediately create a new one
        if (createPlaceholder) {
            closedTabPlaceholderCount++
        }
        
        setTimeout(checkTabListOverflow, 100) // Check overflow after DOM update
    }

    // function restoreTab(tab) {
    //     // tabs.push(tab)
    //     // closed = closed.filter(t => t !== tab)
        
    //     // Remove corresponding placeholder if it exists
    //     if (closedTabPlaceholderCount > 0) {
    //         closedTabPlaceholderCount--
    //     }
        
    //     setTimeout(checkTabListOverflow, 50) // Check overflow after DOM update
    // }

    // function clearAllClosedTabs() {
    //     // closed = []
    //     collapseAndRemovePlaceholders()
    // }

    function collapseAndRemovePlaceholders() {
        if (closedTabPlaceholderCount === 0) return
        
        // Trigger CSS width transition to 0
        collapsingPlaceholders = true
        
        // Remove from DOM after transition completes
        setTimeout(() => {
            closedTabPlaceholderCount = 0
            collapsingPlaceholders = false
        }, 300) // Match CSS transition duration
    }

    function handleTabBarMouseEnter() {
        tabBarHovered = true
    }

    function handleTabBarMouseLeave() {
        tabBarHovered = false
        // Clear placeholders when leaving tab bar area
        setTimeout(() => {
            if (!tabBarHovered) {
                collapseAndRemovePlaceholders()
            }
        }, 100) // Small delay to prevent flicker
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
        contextMenuOpenTime = Date.now()
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

    function reloadTab (tab) {
        const frame = data.frames[tab.id]?.frame
        if (frame && typeof frame.reload === 'function') {
            frame.reload()
        } else if (frame) {
            // Fallback: navigate to same URL
            frame.src = tab.url
        }
        hideContextMenu()
    }

    function goBack() {
        // If mouse is down, navigate spaces instead of frame navigation
        if (isMouseDown) {
            data.previousSpace()
            return
        }

        if (data.spaceMeta.activeTabId) {

            const frame = data.frames[data.spaceMeta.activeTabId]?.frame
            frame.back?.()
            // if (frame && typeof frame.back === 'function') {
            //     // Check if the frame can go back
            //     // if (typeof frame.canGoBack === 'function' && !frame.canGoBack()) {
            //     //     // No back navigation available, set to start page
            //     //     activeTab.url = 'about:newtab'
            //     // } else {
            //     frame.back()
            //     // }
            // } else if (activeTab.url !== 'about:newtab') {
            //     // Frame doesn't support navigation or is not a controlled frame
            //     // Set to start page
            //     activeTab.url = 'about:newtab'
            // }
        }
    }

    function goForward() {
        // If mouse is down, navigate spaces instead of frame navigation
        if (isMouseDown) {
            data.nextSpace()
            return
        }

        if (data.spaceMeta.activeTabId) {
            const frame = data.frames[data.spaceMeta.activeTabId]?.frame
            if (frame && typeof frame.forward === 'function') {
                frame.forward()
            }
        }
    }

    function reloadActiveTab() {
        if (data.spaceMeta.activeTabId) {
            reloadTab(data.spaceMeta.activeTabId)
        }
    }

    function pinTabLeft(tab) {
        if (!data.spaceMeta.activeSpace || !tab) return

        data.pin({ tabId: tab.id, pinned: 'left' })
        hideContextMenu()
    }

    function pinTabRight(tab) {
        data.pin({ tabId: tab.id, pinned: 'right' })
        hideContextMenu()
    }

    function unpinTab(tab) {
        data.pin({ tabId: tab.id, pinned: null })
        hideContextMenu()
    }

    function toggleMuteTab(tab) {
        if (!data.spaceMeta.activeSpace || !tab) return
        
        // Find the tab in the current space and toggle its muted state
        const space = data.spaces[data.spaceMeta.activeSpace]
        if (space && space.tabs) {
            const tabIndex = space.tabs.findIndex(t => t.id === tab.id)
            if (tabIndex !== -1) {
                space.tabs[tabIndex].muted = !space.tabs[tabIndex].muted
                const frame = data.frames[tab.id]?.frame
                if (frame && typeof frame.setAudioMuted === 'function') {
                    frame.setAudioMuted(space.tabs[tabIndex].muted)
                }
            }
        }
        hideContextMenu()
    }

    function closeTabFromMenu(tab) {
        if (tab) {
            closeTab(tab)
        }
        hideContextMenu()
    }


    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const tabId = entry.target.id.replace('tab_', '')
            const tab = data.docs[tabId]
            
            if (entry.isIntersecting) {
                // Start timer when tab becomes visible
                const timer = setTimeout(() => {
                    if (tabChangeFromScroll) {
                        return
                    }
                    
                    if (entry.isIntersecting && tab) {
                        console.log('intersection observer activating tab:', tab.id)
                        // Set flag BEFORE changing active tab to prevent race condition
                        tabChangeFromScroll = true
                        // Clear any existing timer to prevent multiple timers
                        if (tabChangeFromScrollTimer) {
                            clearTimeout(tabChangeFromScrollTimer)
                        }
                        // Change active tab directly (without untrack since we're using the flag)
                        data.spaceMeta.activeTabId = tab.id
                        // Reset flag after a longer delay to prevent race conditions with the effect
                        tabChangeFromScrollTimer = setTimeout(() => {
                            tabChangeFromScroll = false
                            tabChangeFromScrollTimer = null
                        }, 400)
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

    let tabChangeFromScroll = false
    let tabChangeFromScrollTimer = null
    let tabChangeFromScrollFailsafe = null

    // Failsafe effect to reset tabChangeFromScroll if it gets stuck
    $effect(() => {
        if (tabChangeFromScroll) {
            console.log('tabChangeFromScroll failsafe triggered')
            // Clear any existing failsafe
            if (tabChangeFromScrollFailsafe) {
                clearTimeout(tabChangeFromScrollFailsafe)
            }
            // Set a failsafe to reset the flag after 2 seconds
            tabChangeFromScrollFailsafe = setTimeout(() => {
                console.log('tabChangeFromScroll failsafe reset')
                tabChangeFromScroll = false
                tabChangeFromScrollFailsafe = null
                if (tabChangeFromScrollTimer) {
                    clearTimeout(tabChangeFromScrollTimer)
                    tabChangeFromScrollTimer = null
                }
            }, 2000)
        } else {
            // Clear failsafe when flag is properly reset
            if (tabChangeFromScrollFailsafe) {
                clearTimeout(tabChangeFromScrollFailsafe)
                tabChangeFromScrollFailsafe = null
            }
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
            if (resizeTimeout) {
                clearTimeout(resizeTimeout)
            }
            if (tabChangeFromScrollTimer) {
                clearTimeout(tabChangeFromScrollTimer)
            }
            if (tabChangeFromScrollFailsafe) {
                clearTimeout(tabChangeFromScrollFailsafe)
            }

            window.removeEventListener('darc-close-tab', handleGlobalTabClose)
            window.removeEventListener('darc-close-tab-from-frame', handleFrameTabClose)
            window.removeEventListener('darc-new-tab-from-frame', handleFrameNewTab)
            window.removeEventListener('darc-controlled-frame-mousedown', handleFrameMouseDown)
            window.removeEventListener('darc-controlled-frame-mouseup', handleFrameMouseUp)
        }
    })

    function handleTabMouseEnter(tab, event) {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout)
        }
        
        // Use longer delay initially, shorter delay if recently active
        const delay = hovercardRecentlyActive ? 200 : 800
        
        hoverTimeout = setTimeout(() => {
            const tabElement = event.target.closest('.tab-container')
            const rect = tabElement.getBoundingClientRect()
            
            // Calculate hovercard dimensions
            const hovercardWidth = 320 // From CSS
            const halfWidth = hovercardWidth / 2
            
            // Start with tab-centered position
            let x = rect.left + rect.width / 2
            
            // Check left boundary (account for hovercard width)
            if (x - halfWidth < 10) {
                x = halfWidth + 10
            }
            
            // Check right boundary
            if (x + halfWidth > window.innerWidth - 10) {
                x = window.innerWidth - halfWidth - 10
            }
            
            hovercardPosition = {
                x: x,
                y: rect.bottom
            }
            
            isTrashItemHover = false
            hoveredTab = tab
            hovercardShowTime = Date.now()
            // if (!tab.screenshot) {
            //     captureTabScreenshot(tab)
            // }
            
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

    // function handleTrashItemMouseEnter(tab, event) {
    //     if (hoverTimeout) {
    //         clearTimeout(hoverTimeout)
    //         hoverTimeout = null
    //     }
        
    //     // Use longer delay initially, shorter delay if recently active
    //     const delay = hovercardRecentlyActive ? 200 : 800
        
    //     hoverTimeout = setTimeout(() => {
    //         const trashItem = event.target.closest('.trash-menu-item')
    //         const rect = trashItem.getBoundingClientRect()
            
    //         // Calculate better positioning
    //         const hovercardWidth = 320 // hovercard width from CSS
    //         const hovercardHeight = 180 + 60 // screenshot height + info padding
            
    //         // Position to the left of the trash menu with some margin
    //         let x = rect.left - hovercardWidth - 20
    //         let y = rect.top + rect.height / 2
            
    //         // Ensure hovercard doesn't go off screen on the left
    //         if (x < 10) {
    //             x = rect.right + 20 // Position to the right if needed
    //         }
            
    //         // Ensure hovercard doesn't go off screen at the top
    //         if (y - hovercardHeight / 2 < 10) {
    //             y = hovercardHeight / 2 + 10
    //         }
            
    //         // Ensure hovercard doesn't go off screen at the bottom
    //         const maxY = window.innerHeight - hovercardHeight / 2 - 10
    //         if (y > maxY) {
    //             y = maxY
    //         }
            
    //         hovercardPosition = { x, y }
            
    //         isTrashItemHover = true
    //         hoveredTab = tab
    //         hovercardShowTime = Date.now()
    //         if (!tab.screenshot) {
    //             captureTabScreenshot(tab)
    //         }
            
    //         // Mark hovercards as recently active
    //         hovercardRecentlyActive = true
            
    //         // Reset the "recently active" state after 3 seconds of no hover activity
    //         if (hovercardResetTimer) {
    //             clearTimeout(hovercardResetTimer)
    //         }
    //         hovercardResetTimer = setTimeout(() => {
    //             hovercardRecentlyActive = false
    //         }, 3000)
            
    //         // Start checking cursor position
    //         startHovercardPositionCheck()
    //     }, delay)
    // }

    // function handleTrashItemMouseLeave() {
    //     if (hoverTimeout) {
    //         clearTimeout(hoverTimeout)
    //         hoverTimeout = null
    //     }
        
    //     setTimeout(() => {
    //         // Don't hide if hovercard was just shown (prevent flicker during animation)
    //         if (hovercardShowTime && Date.now() - hovercardShowTime < 300) {
    //             return
    //         }
            
    //         // Only close if not hovering over hovercard
    //         const mouseX = window.mouseX || 0
    //         const mouseY = window.mouseY || 0
    //         const elementUnderCursor = document.elementFromPoint(mouseX, mouseY)
            
    //         if (!elementUnderCursor?.closest('.tab-hovercard')) {
    //             hoveredTab = null
    //             isTrashItemHover = false
    //             hovercardShowTime = null
    //             stopHovercardPositionCheck()
    //         }
    //     }, 250)
    // }

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
                    // Find the tab by checking all tab arrays (leftPinned, regular, rightPinned)
                    const allTabs = [...leftPinnedTabs, ...tabs.filter(tab => !tab.pinned), ...rightPinnedTabs]
                    const matchingTab = allTabs.find(tab => tabButtons[tab.id] === hoveredTabElement)
                    isStillHovering = matchingTab?.id === hoveredTab.id
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

    // Track mouse position and state globally
    let isMouseDown = false
    
    function handleGlobalMouseMove(event) {
        window.mouseX = event.clientX
        window.mouseY = event.clientY
    }

    function handleGlobalMouseDown(event) {
        isMouseDown = true
    }

    function handleGlobalMouseUp(event) {
        isMouseDown = false
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
        // if (lastUsedViewMode !== mode) {
        //     window.instances.forEach(instance => {
        //         const wrapper = document.getElementById('backgroundFrames')
        //         const anchorFrame = document.getElementById('anchorFrame')
        //         wrapper.moveBefore(instance, anchorFrame)
        //     })
        // }

        if (viewMode !== 'default') {
            lastUsedViewMode = viewMode
            localStorage.setItem('lastUsedViewMode', lastUsedViewMode)
            data.settings.lastUsedViewMode = lastUsedViewMode
        }
        viewMode = mode
        localStorage.setItem('viewMode', viewMode)
        data.settings.viewMode = viewMode
    }
    
    function toggleViewMode() {
        // window.instances.forEach(instance => {
        //         const wrapper = document.getElementById('backgroundFrames')
        //         const anchorFrame = document.getElementById('anchorFrame')
        //         wrapper.moveBefore(instance, anchorFrame)
        //     })
        if (viewMode === 'default') {
            viewMode = lastUsedViewMode
        } else {
            lastUsedViewMode = viewMode
            localStorage.setItem('lastUsedViewMode', lastUsedViewMode)
            data.settings.lastUsedViewMode = lastUsedViewMode
            viewMode = 'default'
        }
        localStorage.setItem('viewMode', viewMode)
        data.settings.viewMode = viewMode
    }
    
    function getViewModeIcon(mode) {
        switch (mode) {
            case 'default': return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" /></svg>`
            case 'stage': return `<svg  class="w-4 h-4"  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="1 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
            </svg>`
            case 'tile': return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>`
            case 'squat': return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>`
            case 'canvas': return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" /></svg>`
            case 'reading': return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>`
            default: return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>`
        }
    }

    function checkTabListOverflow() {
        console.log('checkTabListOverflow')
        const tabList = document.querySelector('.tab-list')
        if (tabList) {
            isTabListOverflowing = tabList.scrollWidth > tabList.clientWidth
            checkTabListScrollPosition(tabList)
            
            // Check if inline new tab button is visible
            const inlineNewTabButton = document.querySelector('.inline-new-tab-button')
            if (inlineNewTabButton) {
                const buttonRect = inlineNewTabButton.getBoundingClientRect()
                const tabListRect = tabList.getBoundingClientRect()
                const isInlineButtonVisible = buttonRect.right <= tabListRect.right && buttonRect.left >= tabListRect.left
                showFixedNewTabButton = !isInlineButtonVisible
            } else {
                showFixedNewTabButton = isTabListOverflowing
            }
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
            
            // Update fixed new tab button visibility
            const inlineNewTabButton = document.querySelector('.inline-new-tab-button')
            if (inlineNewTabButton) {
                const buttonRect = inlineNewTabButton.getBoundingClientRect()
                const tabListRect = tabList.getBoundingClientRect()
                const isInlineButtonVisible = buttonRect.right <= tabListRect.right && buttonRect.left >= tabListRect.left
                showFixedNewTabButton = !isInlineButtonVisible
            }
        }
    }

    function handleTabListScroll(event) {
        checkTabListScrollPosition(event.target)
    }

    // Check overflow when tabs change
    $effect(() => {
        // FIXME: fix all effects
        if (tabs) {
            // Use longer timeout to ensure DOM is fully updated
            setTimeout(checkTabListOverflow, 100)
        }
    })

    // Check overflow on window resize
    function handleResize() {
        checkTabListOverflow()
    }

  
    let isWindowBackground = $state(false)
    let controlledFrameHasFocus = $state(false)
    
    function updateWindowFocusState() {
        // Consider the window active if either the main window has focus 
        // or any controlled frame has focus
        const documentHasFocus = document.hasFocus()
        const shouldBeActive = documentHasFocus || controlledFrameHasFocus
        
        isWindowBackground = !shouldBeActive
    }
    
    function handleFrameFocus(focusedTabId) {
        controlledFrameHasFocus = true
        updateWindowFocusState()
        
        // Make the focused tab active
        if (focusedTabId) {
            // Set the active tab using the data store function
            if (focusedTabId !== data.spaceMeta.activeTabId) {
                data.activate(focusedTabId)
            }
        }
    }
    
    function handleFrameBlur() {
        controlledFrameHasFocus = false
        updateWindowFocusState()
    }

    function selectPartition(partition, tab) {
        // Update tab partition logic would go here
        console.log('Selected partition:', partition, 'for tab:', tab.id)
        tab.partition = partition
        hideContextMenu()
    }

    async function copyTabUrl(tab) {
        try {
            await navigator.clipboard.writeText(tab.url)
            console.log('URL copied to clipboard:', tab.url)
        } catch (error) {
            console.error('Failed to copy URL:', error)
            // Fallback for browsers that don't support clipboard API
            const textArea = document.createElement('textarea')
            textArea.value = tab.url
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
        }
        hideContextMenu()
    }

    function toggleResourcesSidebar() {
        if (openSidebars.has('resources')) {
            openSidebars.delete('resources')
        } else {
            openSidebars.add('resources')
        }
        openSidebars = new Set(openSidebars) // trigger reactivity
    }

    function closeResourcesSidebar() {
        openSidebars.delete('resources')
        openSidebars = new Set(openSidebars)
    }

    function toggleSettingsSidebar() {
        if (openSidebars.has('settings')) {
            openSidebars.delete('settings')
        } else {
            openSidebars.add('settings')
        }
        openSidebars = new Set(openSidebars) // trigger reactivity
    }

    function closeSettingsSidebar() {
        openSidebars.delete('settings')
        openSidebars = new Set(openSidebars)
    }

    function toggleUserModsSidebar() {
        if (openSidebars.has('userMods')) {
            openSidebars.delete('userMods')
        } else {
            openSidebars.add('userMods')
        }
        openSidebars = new Set(openSidebars) // trigger reactivity
    }

    function closeUserModsSidebar() {
        openSidebars.delete('userMods')
        openSidebars = new Set(openSidebars)
    }

    function toggleActivitySidebar() {
        if (openSidebars.has('activity')) {
            openSidebars.delete('activity')
        } else {
            openSidebars.add('activity')
        }
        openSidebars = new Set(openSidebars) // trigger reactivity
    }

    function closeActivitySidebar() {
        openSidebars.delete('activity')
        openSidebars = new Set(openSidebars)
    }

    function toggleAIAgentSidebar() {
        if (openSidebars.has('aiAgent')) {
            openSidebars.delete('aiAgent')
        } else {
            openSidebars.add('aiAgent')
        }
        openSidebars = new Set(openSidebars) // trigger reactivity
    }

    function closeAIAgentSidebar() {
        openSidebars.delete('aiAgent')
        openSidebars = new Set(openSidebars)
    }

    function switchToResources() {
        if (!openSidebars.has('resources')) {
            if (openSidebars.has('settings') || openSidebars.has('userMods') || openSidebars.has('activity') || openSidebars.has('aiAgent')) {
                isSwitchingSidebars = true
            }
            openSidebars.clear()
            openSidebars.add('resources')
            openSidebars = new Set(openSidebars)
        }
    }
    
    function switchToSettings() {
        if (!openSidebars.has('settings')) {
            if (openSidebars.has('resources') || openSidebars.has('userMods') || openSidebars.has('activity') || openSidebars.has('aiAgent')) {
                isSwitchingSidebars = true
            }
            openSidebars.clear()
            openSidebars.add('settings')
            openSidebars = new Set(openSidebars)
        }
    }

    function switchToUserMods() {
        if (!openSidebars.has('userMods')) {
            if (openSidebars.has('resources') || openSidebars.has('settings') || openSidebars.has('activity') || openSidebars.has('aiAgent')) {
                isSwitchingSidebars = true
            }
            openSidebars.clear()
            openSidebars.add('userMods')
            openSidebars = new Set(openSidebars)
        }
    }

    function switchToActivity() {
        if (!openSidebars.has('activity')) {
            if (openSidebars.has('resources') || openSidebars.has('settings') || openSidebars.has('userMods') || openSidebars.has('aiAgent')) {
                isSwitchingSidebars = true
            }
            openSidebars.clear()
            openSidebars.add('activity')
            openSidebars = new Set(openSidebars)
        }
    }

    function switchToAIAgent() {
        if (!openSidebars.has('aiAgent')) {
            if (openSidebars.has('resources') || openSidebars.has('settings') || openSidebars.has('userMods') || openSidebars.has('activity')) {
                isSwitchingSidebars = true
            }
            openSidebars.clear()
            openSidebars.add('aiAgent')
            openSidebars = new Set(openSidebars)
        }
    }

    function toggleFocusMode() {
        focusModeEnabled = !focusModeEnabled
        if (focusModeEnabled) {
            focusModeHovered = false
            contentAreaScrimActive = false
            hasLeftToggle = false
            // Enable hover reveal after a short delay to allow user to move mouse away
            setTimeout(() => {
                if (focusModeEnabled) hasLeftToggle = true
            }, 300)
        } else {
            focusModeHovered = false
            contentAreaScrimActive = false
            hasLeftToggle = false
        }
    }
    
    function hideContentAreaScrim() {
        focusModeHovered = false
        contentAreaScrimActive = false
        // Don't reset hasLeftToggle - keep it true so hover reveal can work again
    }
    
    function toggleDarkMode() {
        darkMode = !darkMode
        document.documentElement.classList.toggle('dark-mode', darkMode)
        data.settings.darkMode = darkMode
    }
    
    function toggleDataSaver() {
        dataSaver = !dataSaver
        data.settings.dataSaver = dataSaver
    }
    
    function toggleBatterySaver() {
        batterySaver = !batterySaver
        data.settings.batterySaver = batterySaver
    }
    
    function toggleSecondScreen() {
        // TODO: xr detection + presentation api 
        if (secondScreenActive) {
            // Close existing second screen
            const secondScreenWindow = window.secondScreenWindow
            if (secondScreenWindow && !secondScreenWindow.closed) {
                secondScreenWindow.close()
            }
            secondScreenActive = false
        } else {
            // Open second screen
            const width = 800
            const height = 600
            const left = screen.width - width - 50
            const top = 50
            
            const secondScreenWindow = window.open(
                window.location.href + '?companion=true',
                'secondScreen',
                `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes,status=no,toolbar=no,menubar=no,location=no`
            )
            
            if (secondScreenWindow) {
                window.secondScreenWindow = secondScreenWindow
                secondScreenActive = true
                
                // Listen for window close
                const checkClosed = setInterval(() => {
                    if (secondScreenWindow.closed) {
                        secondScreenActive = false
                        clearInterval(checkClosed)
                        delete window.secondScreenWindow
                    }
                }, 1000)
            }
        }
    }

    function toggleStatusLights() {
        statusLightsEnabled = !statusLightsEnabled
        localStorage.setItem('statusLightsEnabled', statusLightsEnabled.toString())
        data.settings.statusLightsEnabled = statusLightsEnabled
    }

    function toggleDevMode() {
        devModeEnabled = !devModeEnabled
        localStorage.setItem('devModeEnabled', devModeEnabled.toString())
        data.settings.devModeEnabled = devModeEnabled
    }

    function toggleLinkPreviews() {
        data.spaceMeta.config.showLinkPreviews = !data.spaceMeta.config.showLinkPreviews
        localStorage.setItem('showLinkPreviews', data.spaceMeta.config.showLinkPreviews.toString())
        data.settings.showLinkPreviews = data.spaceMeta.config.showLinkPreviews
    }

    function toggleLightboxMode() {
        lightboxModeEnabled = !lightboxModeEnabled
        localStorage.setItem('lightboxModeEnabled', lightboxModeEnabled.toString())
        data.settings.lightboxModeEnabled = lightboxModeEnabled
    }

    function toggleTabsOpenRight() {
        tabsOpenRight = !tabsOpenRight
        localStorage.setItem('tabsOpenRight', tabsOpenRight.toString())
        data.settings.tabsOpenRight = tabsOpenRight
    }

    function toggleGlobalTabComplete() {
        globalTabComplete = !globalTabComplete
        localStorage.setItem('globalTabComplete', globalTabComplete.toString())
        data.settings.globalTabComplete = globalTabComplete
    }

    async function openTestSuite() {
        try {
            console.log('🧪 Opening test suite...')
            const { testFramework } = await import('../tests/main.js')
            await testFramework.setupTestPanel()
            testFramework.showTestPanel()
            console.log('✅ Test suite panel opened')
        } catch (error) {
            console.error('❌ Error opening test suite:', error)
        }
    }

    function openVSCodeWorkspace() {
        const url = 'http://localhost:8080/?workspace=/workspace/.vscode/orchestrator.code-workspace'
        data.newTab(data.spaceMeta.activeSpace, { url, shouldFocus: true, shouldFocus: true })
    }

    // Check for encrypted sync token on app startup
    async function checkSyncTokenAuth() {
        const encryptedTokenData = localStorage.getItem('darc-encrypted-token')
        const storedCredentialId = localStorage.getItem('darc-credential-id')
        
        if (encryptedTokenData && storedCredentialId) {
            // Show biometric prompt for sync authentication
            try {
                console.log('🔐 Encrypted sync token found - requesting biometric authentication...')
                
                // Check WebAuthn support
                if (!('credentials' in navigator && 'get' in navigator.credentials)) {
                    console.warn('WebAuthn not supported - cannot decrypt sync token')
                    return
                }

                const credentialId = new Uint8Array(JSON.parse(storedCredentialId))
                
                // Generate random challenge
                const challenge = new Uint8Array(32)
                window.crypto.getRandomValues(challenge)

                const credential = await navigator.credentials.get({
                    publicKey: {
                        challenge: challenge,
                        allowCredentials: [{
                            type: "public-key",
                            id: credentialId
                        }],
                        userVerification: "required",
                        timeout: 60000
                    }
                })

                if (credential) {
                    console.log('✅ Biometric authentication successful - sync token available')
                    // Token is now available for sync operations
                } else {
                    console.log('❌ Biometric authentication failed')
                }
            } catch (error) {
                console.log('🔐 Biometric authentication cancelled or failed:', error.message)
                // Don't show error to user - they can authenticate later in settings
            }
        }
    }

    // Load settings when component mounts
    $effect(() => {
        loadPreferences().catch(error => {
            console.error('Failed to load user mods:', error)
        })
        
        // Setup fallback color for non-ControlledFrame environments
        setupFallbackColor()
        
        // Check for encrypted sync token authentication
        setTimeout(() => {
            checkSyncTokenAuth().catch(error => {
                console.error('Failed to check sync token auth:', error)
            })
        }, 1000) // Delay to allow app to fully load
    })

    // let sidebarRightHovered = $state(false)
    // function handleSidebarRightMouseEnter() {
    //     sidebarRightHovered = true
    // }
    // function handleSidebarRightMouseLeave() {
    //     sidebarRightHovered = false
    // }



    // Global drag and drop event listeners for debugging and logging
    function setupGlobalDragDropListeners() {
        // Log detailed information about drag and drop events
        function logDragDropEvent(eventType, event) {
            const eventData = {
                type: eventType,
                timestamp: new Date().toISOString(),
                target: {
                    tagName: event.target?.tagName,
                    id: event.target?.id,
                    className: event.target?.className,
                    textContent: event.target?.textContent?.slice(0, 50),
                },
                relatedTarget: {
                    tagName: event.relatedTarget?.tagName,
                    id: event.relatedTarget?.id,
                    className: event.relatedTarget?.className,
                },
                coordinates: {
                    clientX: event.clientX,
                    clientY: event.clientY,
                    screenX: event.screenX,
                    screenY: event.screenY,
                },
                dataTransfer: {
                    dropEffect: event.dataTransfer?.dropEffect,
                    effectAllowed: event.dataTransfer?.effectAllowed,
                    types: event.dataTransfer?.types ? Array.from(event.dataTransfer.types) : [],
                    files: event.dataTransfer?.files ? Array.from(event.dataTransfer.files).map(f => ({
                        name: f.name,
                        size: f.size,
                        type: f.type,
                        lastModified: f.lastModified
                    })) : [],
                },
                modifierKeys: {
                    altKey: event.altKey,
                    ctrlKey: event.ctrlKey,
                    metaKey: event.metaKey,
                    shiftKey: event.shiftKey,
                },
                bubbles: event.bubbles,
                cancelable: event.cancelable,
                defaultPrevented: event.defaultPrevented,
            }

            // Try to get additional data from dataTransfer
            if (event.dataTransfer) {
                eventData.dataTransfer.items = []
                try {
                    for (let i = 0; i < event.dataTransfer.items.length; i++) {
                        const item = event.dataTransfer.items[i]
                        eventData.dataTransfer.items.push({
                            kind: item.kind,
                            type: item.type,
                        })
                        
                        // Try to get string data for text items
                        if (item.kind === 'string' && eventType === 'drop') {
                            item.getAsString((data) => {
                                console.log(`📋 [${eventType}] String data for type "${item.type}":`, data.slice(0, 100))
                            })
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ [${eventType}] Error reading dataTransfer items:`, error)
                }
            }

            console.group(`🎯 [DRAG&DROP] ${eventType.toUpperCase()}`)
            console.log('📍 Event Details:', eventData)
            console.log('🎯 Target Element:', event.target)
            if (event.relatedTarget) {
                console.log('🔗 Related Target:', event.relatedTarget)
            }
            console.groupEnd()
        }

        // Dragenter - when dragged item enters a valid drop target
        window.addEventListener('dragenter', (event) => {
            logDragDropEvent('dragenter', event)
        }, { capture: true })

        // Dragover - when dragged item is over a valid drop target (fires repeatedly)
        window.addEventListener('dragover', (event) => {
            logDragDropEvent('dragover', event)
            
            // Prevent default to allow dropping on the app shell
            // Check if we're over the app shell (not inside a controlled frame)
            const isOverControlledFrame = event.target.closest('controlledframe, iframe')
            const isOverAppShell = !isOverControlledFrame
            
            if (isOverAppShell) {
                event.preventDefault() // This allows dropping
                event.dataTransfer.dropEffect = 'copy' // Show copy cursor
                console.log('🎯 [DRAGOVER] Prevented default for app shell - drop allowed')
            }
        }, { capture: true })

        // Dragleave - when dragged item leaves a valid drop target
        window.addEventListener('dragleave', (event) => {
            logDragDropEvent('dragleave', event)
        }, { capture: true })

        // Drop - when dragged item is dropped on a valid drop target
        window.addEventListener('drop', (event) => {
            logDragDropEvent('drop', event)
            
            // Handle drops on the app shell
            const isOverControlledFrame = event.target.closest('controlledframe, iframe')
            const isOverAppShell = !isOverControlledFrame
            
            if (isOverAppShell) {
                event.preventDefault() // Prevent browser default handling
                console.log('🎯 [DROP] Handling drop on app shell')
                
                // Process dropped files or content
                if (event.dataTransfer.files.length > 0) {
                    console.log('📁 [DROP] Files dropped on app shell:', Array.from(event.dataTransfer.files))
                    // Here you could handle file drops (e.g., open URLs, create new tabs, etc.)
                }
                
                // Process dropped text/URLs
                const text = event.dataTransfer.getData('text/plain')
                const url = event.dataTransfer.getData('text/uri-list')
                if (text || url) {
                    console.log('📝 [DROP] Text/URL dropped on app shell:', { text, url })
                    // Here you could handle text/URL drops (e.g., create new tab with URL)
                }
            }
        }, { capture: true })

        // Dragstart - when user starts dragging an element
        window.addEventListener('dragstart', (event) => {
            logDragDropEvent('dragstart', event)
        }, { capture: true })

        // Drag - during the drag operation (fires repeatedly)
        window.addEventListener('drag', (event) => {
            // Only log every 10th drag event to avoid spam
            if (!window.dragEventCounter) window.dragEventCounter = 0
            window.dragEventCounter++
            if (window.dragEventCounter % 10 === 0) {
                logDragDropEvent('drag', event)
            }
        }, { capture: true })

        // Dragend - when drag operation ends
        window.addEventListener('dragend', (event) => {
            logDragDropEvent('dragend', event)
            window.dragEventCounter = 0 // Reset counter
        }, { capture: true })
    }

    // Initialize drag and drop listeners
    setupGlobalDragDropListeners()


    $effect(() => {
        if (requestedResources.length > 0 && !openSidebars.has('resources')) {
            console.log('requestedResources changed...', requestedResources)
            untrack(() => {
                openSidebars.add('resources')
                openSidebars = new Set(openSidebars)
            })
        }
    })

    let block = true
    function handleShellNavigation (event) {
        if (block) {
            block = false
            return
        }
        
        block = true
        if (event.state.direction === 1) {
            history.forward()
            goBack()
        } else if (event.state.direction === 3) {
            history.back()
            goForward()
        } 
    }

    onMount(() => {
        // console.log('setting up app shell navigation')
        history.replaceState({ direction: 1 }, 'a', "#1")
        history.pushState({ direction: 2 }, 'b', "#2" )
        history.pushState({ direction: 3 }, 'c', "#3" )
        history.back()

        window.onpopstate = handleShellNavigation    
    })

    function toggleCertificateMonitor(tab) {
        if (!certificateMonitorForTab) {
            certificateMonitorForTab = tab
        } else {
            certificateMonitorForTab = null
        }
        hideContextMenu()
    }

    function getDisplayUrl(url) {
        if (!url) {
            return 'unknown'
        }
        if (url === 'about:blank#blocked') {
            return 'about:newtab'
        }
        return url
    }

    // URL editing functions
    function startEditingUrl() {
        if (!data.spaceMeta.activeTabId) return
        isEditingUrl = true
        const activeTab = data.docs[data.spaceMeta.activeTabId]
        editingUrlValue = activeTab.url || ''
        // Focus the input after it's rendered
        setTimeout(() => {
            if (urlInput) {
                urlInput.focus()
                urlInput.select()
            }
        }, 10)
    }

    function stopEditingUrl() {
        isEditingUrl = false
        editingUrlValue = ''
    }

    function handleUrlSubmit(event) {
        event.preventDefault()
        if (!editingUrlValue.trim() || !data.spaceMeta.activeTabId) {
            stopEditingUrl()
            return
        }
        
        try {
            let url = new URL(editingUrlValue)
            data.navigate(data.spaceMeta.activeTabId, url.href)
        } catch {
            // Not a valid URL, treat as search
            const defaultSearchEngine = localStorage.getItem('defaultSearchEngine') || 'google'
            let searchUrl
            
            switch (defaultSearchEngine) {
                case 'kagi':
                    searchUrl = new URL('https://kagi.com/search')
                    break
                case 'custom':
                    const customUrl = localStorage.getItem('customSearchUrl')
                    if (customUrl) {
                        try {
                            searchUrl = new URL(customUrl + encodeURIComponent(editingUrlValue))
                            data.navigate(data.spaceMeta.activeTabId, searchUrl.href)
                            stopEditingUrl()
                            return
                        } catch {
                            // Fallback to Google if custom URL is invalid
                            searchUrl = new URL('https://www.google.com/search')
                        }
                    } else {
                        searchUrl = new URL('https://www.google.com/search')
                    }
                    break
                default: // google
                    searchUrl = new URL('https://www.google.com/search')
                    break
            }
            
            searchUrl.searchParams.set('q', editingUrlValue)
            data.navigate(data.spaceMeta.activeTabId, searchUrl.href)
        }
        
        stopEditingUrl()
    }

    function handleUrlKeydown(event) {
        if (event.key === 'Escape') {
            stopEditingUrl()
        }
    }

    function setupFallbackColor() {
        if (!controlledFrameSupported) {
            const storedColorData = localStorage.getItem('darc-dev-color')
            if (storedColorData) {
                try {
                    const colorData = JSON.parse(storedColorData)
                    fallbackColor = colorData.color
                    fallbackColorName = colorData.name
                } catch (error) {
                    // Handle old format or corrupted data
                    const randomIndex = Math.floor(Math.random() * colors.length)
                    const selectedColorData = colors[randomIndex]
                    fallbackColor = selectedColorData.color
                    fallbackColorName = selectedColorData.name
                    localStorage.setItem('darc-dev-color', JSON.stringify(selectedColorData))
                }
            } else {
                // Pick a random color from the colors array
                const randomIndex = Math.floor(Math.random() * colors.length)
                const selectedColorData = colors[randomIndex]
                fallbackColor = selectedColorData.color
                fallbackColorName = selectedColorData.name
                localStorage.setItem('darc-dev-color', JSON.stringify(selectedColorData))
            }
        }
    }

    // reserved for possibly handling only closed tabs from current tab group in future do not remove or switch to data.closedTabs
    const closedTabs = []

    let leftPinnedTabs = $derived(tabs.filter(tab => (tab.pinned === true || tab.pinned === 'left')))
    let rightPinnedTabs = $derived(tabs.filter(tab => tab.pinned === 'right'))
    let unpinnedTabs = $derived(tabs.filter(tab => !tab.pinned))

    // Calculate space taken by different UI elements
    let leftPinnedWidth = $derived.by(() => {
        return leftPinnedTabs.length * data.spaceMeta.config.leftPinnedTabWidth
    })
    
    let rightPinnedWidth = $derived.by(() => {
        return rightPinnedTabs.length * data.spaceMeta.config.rightPinnedTabWidth
    })
    
    let rightSidebarWidth = $derived.by(() => {
        return openSidebars.size * data.spaceMeta.config.rightSidebarWidth
    })
    
    // Total space taken by all UI elements (affects available width)
    let spaceTaken = $derived.by(() => {
        let baseSpace = leftPinnedWidth + rightPinnedWidth + rightSidebarWidth
        
        // Reduce space taken to allow content to scroll behind pinned tabs
        let reduction = 0
        if (leftPinnedTabs.length > 0) reduction += 9  // 8px for left pins
        if (rightPinnedTabs.length > 0) reduction += 9  // 8px for right pins
        
        return baseSpace - reduction
    })
</script>

<!-- {#snippet trashIcon()}
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
{/snippet} -->

{#snippet tabContextMenu(menu, onHide)}
    <div class="context-menu-scrim" 
         role="button"
         tabindex="0"
         onmousedowncapture={onHide}
         onmouseup={() => {
             if (Date.now() - contextMenuOpenTime > 500) {
                 onHide()
             }
         }}
         oncontextmenu={(e) => { e.preventDefault(); onHide(); }}></div>
    
    <div class="context-menu" 
         role="menu"
         tabindex="0"
         style="left: {menu.x}px; top: {menu.y}px;"
         onclick={(e) => e.stopPropagation()}
         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation() }}
         oncontextmenu={(e) => e.preventDefault()}>
        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => reloadTab(menu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reloadTab(menu.tab) } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
            </span>
            <span>Reload</span>
        </div>
        
        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => toggleCertificateMonitor(menu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCertificateMonitor(menu.tab) } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
            </span>
            <span>Certificate Info</span>
        </div>
        
        {#if menu.tab.pinned}
            <div class="context-menu-item" 
                 role="menuitem"
                 tabindex="0"
                 onmouseup={() => unpinTab(menu.tab)}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unpinTab(menu.tab) } }}>
                <span class="context-menu-icon">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                    </svg>
                </span>
                <span>Unpin Tab</span>
            </div>
        {:else}
            <div class="context-menu-item-row">
                <div class="context-menu-item context-menu-item-left" 
                     role="menuitem"
                     tabindex="0"
                     onmouseup={() => pinTabLeft(menu.tab)}
                     onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinTabLeft(menu.tab) } }}>
                    <span class="context-menu-icon">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                        </svg>
                    </span>
                    <span>Pin Left</span>
                </div>
                <div class="context-menu-item context-menu-item-right" 
                     role="menuitem"
                     tabindex="0"
                     onmouseup={() => pinTabRight(menu.tab)}
                     onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinTabRight(menu.tab) } }}>
                    <span class="context-menu-icon">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                        </svg>
                    </span>
                    <span>Pin Right</span>
                </div>
            </div>
        {/if}
        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => toggleMuteTab(menu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMuteTab(menu.tab) } }}>
            <span class="context-menu-icon">
                {#if menu.tab.muted}
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.79-1.59-1.76V9.51c0-.97.71-1.76 1.59-1.76h2.24Z" />
                    </svg>
                {:else}
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.79-1.59-1.76V9.51c0-.97.71-1.76 1.59-1.76h2.24Z" />
                    </svg>
                {/if}
            </span>
            <span>{menu.tab.muted ? 'Unmute' : 'Mute'} Tab</span>
        </div>

        <!-- TODO: -->
        <div class="context-menu-item" 
                role="menuitem"
                tabindex="0"
                onmouseup={() => toggleMuteTab(menu.tab)}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMuteTab(menu.tab) } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
            </span>
            <span>Load at startup</span>
        </div>

        {#if data.frames[menu.tab.id]?.frame && data.spaceMeta.activeTabId !== menu.tab.id}
            <div class="context-menu-item" 
                role="menuitem"
                tabindex="0"
                onmouseup={() => { data.hibernate(menu.tab.id); onHide(); }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); data.hibernate(menu.tab.id); onHide(); } }}>
                <span class="context-menu-icon">
                    <!-- {#if menu.tab.hibernated}
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                        </svg>
                    {:else} -->
                    
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                    </svg>  
                </span>
                <span>Hibernate</span>
            </div>
        {/if}

        <div class="context-menu-item" 
            role="menuitem"
            tabindex="0"
            onmouseup={() => {  data.hibernateOthers(menu.tab.id); onHide(); }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();  data.hibernateOthers(menu.tab.id); onHide(); } }}>
            <span class="context-menu-icon">
                <!-- {#if menu.tab.hibernated}
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                    </svg>
                {:else} -->
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                    </svg>
                <!-- {/if} -->
            </span>
            <span>Hibernate others</span>
        </div>

        <div class="context-menu-item has-submenu" 
             role="menuitem"
             tabindex="0">
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
            </span>
            <span>Container: {menu.tab?.partition || 'default'}</span>
            <span class="submenu-arrow">
                <svg class="w-2 h-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
            </span>
            <div class="context-submenu">
                {#each partitions as partition}
                    <div class="context-submenu-item" 
                         class:active={menu.tab?.partition === partition}
                         role="menuitem"
                         tabindex="0"
                         onmouseup={() => selectPartition(partition, menu.tab)}
                         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPartition(partition, menu.tab) } }}>
                        <span class="partition-icon">
                            {#if partition.startsWith('persist')}
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                                </svg>
                            {:else}
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5 10 3.75 16.25 13.5h-12.5Z" />
                                </svg>
                            {/if}
                        </span>
                        <span>{partition}</span>
                        {#if menu.tab?.partition === partition}
                            <span class="checkmark">•</span>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => copyTabUrl(menu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyTabUrl(menu.tab) } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v9.75c0 .621.504 1.125 1.125 1.125h.75m2.25 0H9a2.25 2.25 0 0 0 2.25-2.25v-.75" />
                </svg>
            </span>
            <span>Copy URL</span>
        </div>

        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => {}}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault() } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
            </span>
            <span>Take Screenshot</span>
        </div>

        <div class="context-menu-separator"></div>

        <div class="context-menu-item danger" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => closeTabFromMenu(menu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeTabFromMenu(menu.tab) } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
            </span>
            <span>Close Tab</span>
        </div>
    </div>
{/snippet}

<svelte:window
    onkeydowncapture={handleKeyDown}
    onclick={hideContextMenu}
    oncontextmenu={handleGlobalContextMenu}
    onmousemove={handleGlobalMouseMove}
    onmousedown={handleGlobalMouseDown}
    onmouseup={handleGlobalMouseUp}
    onresize={handleResize}
    onfocus={updateWindowFocusState}
    onblur={updateWindowFocusState}
    onvisibilitychange={() => { 
        // console.log('visibilitychange', document.visibilityState) 
    }}
/>

<header role="toolbar" tabindex="0" class:window-controls-overlay={headerPartOfMain} class:window-background={isWindowBackground} class:focus-mode={focusModeEnabled} onmouseenter={() => { if (focusModeEnabled && contentAreaScrimActive) focusModeHovered = true }} onmouseleave={() => { if (focusModeEnabled && !contentAreaScrimActive) focusModeHovered = false }}>
    <div class="header-drag-handle" class:drag-enabled={isDragEnabled} style="{devModeEnabled ? 'right: 178px;' : 'right: 137px;'}"></div>
     
        <div class="tab-wrapper" role="tablist" tabindex="0" class:overflowing-right={isTabListOverflowing && !isTabListAtEnd} class:overflowing-left={isTabListOverflowing && !isTabListAtStart} style="width: {devModeEnabled ? 'calc(100% - 413px)' : 'calc(100% - 383px)'};" class:hidden={focusModeEnabled && !focusModeHovered} onmouseenter={handleTabBarMouseEnter} onmouseleave={handleTabBarMouseLeave}>
       <!-- transition:flip={{duration: 100}} -->
        <ul class="tab-list" style="padding: 0; margin: 0;" onscroll={handleTabListScroll} >
            {#each leftPinnedTabs as tabPinned, i (tabPinned.id)}
                {@const tab = data.docs[tabPinned.id]}
                {@const frameData = data.frames[tab.id]}
                {#if tab.type !== 'divider'}
                    <li 
                        bind:this={tabButtons[tab.id]}
                        class="tab-container" 
                        class:active={tab.id === data.spaceMeta.activeTabId} 
                        class:hovered={tab.id === hoveredTab?.id}
                        class:menu-open={contextMenu.visible && contextMenu.tab?.id === tab.id}
                        role="tab"
                        tabindex="0"
                        onclick={() => openTab(tab, i)}
                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTab(tab, i) } }}
                        oncontextmenu={(e) => handleTabContextMenu(e, tab, i)}
                        onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                        onmouseleave={handleTabMouseLeave}
                        >
                        <div class="tab">
                            {#if frameData?.loading}
                                <svg class="tab-loading-spinner" viewBox="0 0 16 16">
                                    <path d="M8 2 A6 6 0 0 1 14 8" 
                                        fill="none" 
                                        stroke="rgba(255, 255, 255, 0.8)" 
                                        stroke-width="2" 
                                        stroke-linecap="round"/>
                                </svg>
                            {/if}

                            <div class="favicon-wrapper">    
                                <Favicon {tab} />
                            </div>
                            <span class="tab-title"> {#if tab.audioPlaying && !tab.muted}
                                🔊 &nbsp;
                            {:else if tab.muted}
                                🔇 &nbsp;
                            {/if}{tab.title || tab.url}</span>
                            <button class="close-btn" onclick={() => closeTab(tab, event, true)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeTab(tab, e, true) } }}>×</button>
                        </div>
                    </li>
                {/if}
            {/each}

            {#if leftPinnedTabs.length}
                <li class="tab-divider-container">
                    <div class="tab-divider-vertical"></div>
                </li>
            {/if}

            {#each unpinnedTabs as unpinned, i (unpinned.id)}
                {@const tab = data.docs[unpinned.id]}
                {@const frameData = data.frames[tab.id]}
                {#if tab.type === 'divider'}
                    <li class="tab-divider-container">
                        <div class="tab-divider-vertical"></div>
                    </li>
                {:else}
                    <li 
                        bind:this={tabButtons[tab.id]}
                        class="tab-container" 
                        class:active={tab.id === data.spaceMeta.activeTabId} 
                        class:hovered={tab.id === hoveredTab?.id}
                        class:menu-open={contextMenu.visible && contextMenu.tab?.id === tab.id}
                        role="tab"
                        tabindex="0"
                        onclick={() => openTab(tab, i)}
                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTab(tab, i) } }}
                        oncontextmenu={(e) => handleTabContextMenu(e, tab, i)}
                        onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                        onmouseleave={handleTabMouseLeave}
                        >
                        <div class="tab">
                            {#if frameData?.loading}
                                <svg class="tab-loading-spinner" viewBox="0 0 16 16">
                                    <path d="M8 2 A6 6 0 0 1 14 8" 
                                        fill="none" 
                                        stroke="rgba(255, 255, 255, 0.8)" 
                                        stroke-width="2" 
                                        stroke-linecap="round"/>
                                </svg>
                            {/if}

                            <div class="favicon-wrapper">    
                                <Favicon {tab} />
                            </div>
                            <span class="tab-title"> {#if tab.audioPlaying && !tab.muted}
                                🔊 &nbsp;
                            {:else if tab.muted}
                                🔇 &nbsp;
                            {/if}{tab.title || tab.url}</span>
                            <button class="close-btn" onclick={() => closeTab(tab, event, true)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeTab(tab, e, true) } }}>×</button>
                        </div>
                    </li>
                {/if}
            {/each}

            {#if rightPinnedTabs.length}
                <li class="tab-divider-container">
                    <div class="tab-divider-vertical"></div>
                </li>
            {/if}

            {#each rightPinnedTabs as rightPinned, i (rightPinned.id)}
                {@const tab = data.docs[rightPinned.id]}
                {@const frameData = data.frames[tab.id]}
                <!-- FIXME: restructure other frame instance metadata like audio etc. -->
                {#if tab.type !== 'divider'}
                    <li 
                        bind:this={tabButtons[tab.id]}
                        class="tab-container" 
                        class:active={tab.id === data.spaceMeta.activeTabId} 
                        class:hovered={tab.id === hoveredTab?.id}
                        class:menu-open={contextMenu.visible && contextMenu.tab?.id === tab.id}
                        role="tab"
                        tabindex="0"
                        onclick={() => openTab(tab, i)}
                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTab(tab, i) } }}
                        oncontextmenu={(e) => handleTabContextMenu(e, tab, i)}
                        onmouseenter={(e) => handleTabMouseEnter(tab, e)}
                        onmouseleave={handleTabMouseLeave}
                        >
                        <div class="tab">
                            {#if frameData?.loading}
                                <svg class="tab-loading-spinner" viewBox="0 0 16 16">
                                    <path d="M8 2 A6 6 0 0 1 14 8" 
                                        fill="none" 
                                        stroke="rgba(255, 255, 255, 0.8)" 
                                        stroke-width="2" 
                                        stroke-linecap="round"/>
                                </svg>
                            {/if}

                            <div class="favicon-wrapper">    
                                <Favicon {tab} />
                            </div>
                            <span class="tab-title"> {#if tab.audioPlaying && !tab.muted}
                                🔊 &nbsp;
                            {:else if tab.muted}
                                🔇 &nbsp;
                            {/if}{tab.title || tab.url}</span>
                            <button class="close-btn" onclick={() => closeTab(tab, event, true)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeTab(tab, e, true) } }}>×</button>
                        </div>
                    </li>
                {/if}
            {/each}
            
            <button class="inline-new-tab-button" 
                class:hidden={showFixedNewTabButton}
                onmousedown={openNewTab}
                title="New Tab (⌘T)">
                <span class="new-tab-icon">+</span>
            </button>
            
            {#each Array.from({length: closedTabPlaceholderCount}, (_, i) => i) as placeholder (placeholder)}
                <li class="tab-container tab-placeholder" class:collapsing={collapsingPlaceholders}>
                    <div class="tab">
                        <!-- Completely empty for transparent placeholder -->
                    </div>
                </li>
            {/each}
            
            <div class="tab-spacer"></div>
        </ul>
    </div>

    <div class="header-drag-handle" class:drag-enabled={isDragEnabled} style="width: 105px;"></div>

    <div class="header-drag-handle" class:drag-enabled={isDragEnabled} style="width: 115px; left: unset; {devModeEnabled ? 'right: 190px;' : 'right: 158px;'}"></div>

    <div class="header-icon-button view-mode-icon" 
        role="button"
        tabindex="0"
        onclick={toggleViewMode}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleViewMode() } }}
        class:hidden={focusModeEnabled && !focusModeHovered}>
        {@html getViewModeIcon(viewMode)}
        <div class="view-mode-menu">
            <div class="view-mode-menu-header menu-header">View Mode</div>
            <div class="view-mode-menu-item menu-item" 
                 class:active={viewMode === 'default'}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); selectViewMode('default') }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('default') } }}>
                <span class="view-mode-icon-item menu-icon-item">
                    {@html getViewModeIcon('default')}
                </span>
                <span>Default</span>
                {#if viewMode === 'default'}<span class="checkmark">•</span>{/if}
            </div>
            <!-- <div class="view-mode-menu-item menu-item" 
                    class:active={viewMode === 'stage'}
                    role="button"
                    tabindex="0"
                    onclick={(e) => { e.stopPropagation(); selectViewMode('stage') }}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('stage') } }}>
                <span class="view-mode-icon-item menu-icon-item">
                    {@html getViewModeIcon('stage')}
                </span>
                <span>Stage</span>
                {#if viewMode === 'stage'}<span class="checkmark">•</span>{/if}
            </div> -->
            <div class="view-mode-menu-item menu-item" 
                    class:active={viewMode === 'canvas'}
                    role="button"
                    tabindex="0"
                    onclick={(e) => { e.stopPropagation(); selectViewMode('canvas') }}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('canvas') } }}>
                <span class="view-mode-icon-item menu-icon-item">
                    {@html getViewModeIcon('canvas')}
                </span>
                <span>Canvas</span>
                {#if viewMode === 'canvas'}<span class="checkmark">•</span>{/if}
            </div>
            <div class="view-mode-menu-item menu-item" 
                    class:active={viewMode === 'tile'}
                    role="button"
                    tabindex="0"
                    onclick={(e) => { e.stopPropagation(); selectViewMode('tile') }}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('tile') } }}>
                <span class="view-mode-icon-item menu-icon-item">
                    {@html getViewModeIcon('tile')}
                </span>
                <span>Tiles</span>
                {#if viewMode === 'tile'}<span class="checkmark">•</span>{/if}
            </div>
            <div class="view-mode-menu-item menu-item" 
                    class:active={viewMode === 'reading'}
                    role="button"
                    tabindex="0"
                    onclick={(e) => { e.stopPropagation(); selectViewMode('reading') }}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('reading') } }}>
                <span class="view-mode-icon-item menu-icon-item">
                    {@html getViewModeIcon('reading')}
                </span>
                <span>Reading</span>
                {#if viewMode === 'reading'}<span class="checkmark">•</span>{/if}
            </div>
            <div class="view-mode-menu-item menu-item" 
                 class:active={viewMode === 'squat'}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); selectViewMode('squat') }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('squat') } }}>
                <span class="view-mode-icon-item menu-icon-item">
                    {@html getViewModeIcon('squat')}
                </span>
                <span>Squat</span>
                {#if viewMode === 'squat'}<span class="checkmark">•</span>{/if}
            </div>
            <div class="view-mode-menu-item menu-item" 
                class:active={viewMode === 'notebook'}
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); selectViewMode('notebook') }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectViewMode('notebook') } }}>
            <span class="view-mode-icon-item menu-icon-item">
                {@html getViewModeIcon('notebook')}
            </span>
            <span>Notebook</span>
            {#if viewMode === 'notebook'}<span class="checkmark">•</span>{/if}
            </div>
        </div>
    </div>

    <div class="new-tab-button" 
         role="button"
         tabindex="0"
         onmousedown={openNewTab}
         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNewTab() } }}
         title="New Tab (⌘T)"
         style="{devModeEnabled ? 'right: 174px;' : 'right: 133px;'}"
         class:visible={showFixedNewTabButton && (!focusModeEnabled || focusModeHovered)}>
        <span class="new-tab-icon">+</span>
    </div>

    <!-- {#if closed.length > 0}
        <div class="trash-icon" class:hidden={focusModeEnabled}>
            {@render trashIcon()}
               
            <span class="trash-count">{closed.length}</span>
            <div class="trash-menu">
                <div class="trash-menu-header">Recently Closed  </div>
                <div class="trash-menu-items">
                    {#each closed as closedTab}
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
                </div>
                {#if closed.length > 0}
                    <div class="trash-menu-separator"></div>
                    <div class="trash-menu-clear" 
                         onclick={() => clearAllClosedTabs()} 
                         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clearAllClosedTabs() } }}
                         tabindex="0" 
                         role="button">
                        <span>
                            {@render trashIcon()}
                        </span>
                        <span>Clear All ({closed.length})</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if} -->

    <div class="header-icon-button focus-mode-icon" 
        role="button"
        tabindex="0"
        onclick={toggleFocusMode}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFocusMode() } }}
        onmouseenter={() => { if (focusModeEnabled && hasLeftToggle) { focusModeHovered = true; contentAreaScrimActive = true; } }}
        title="Toggle Focus Mode">
        {#if focusModeEnabled}
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z"/>
            </svg>
        {:else}
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6 1.41 1.41z"/>
            </svg>
        {/if}
    </div>

    <div class="header-icon-button settings-menu-icon" 
        role="button"
        tabindex="0"
        title="Settings"
        class:hidden={focusModeEnabled && !focusModeHovered}>
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        <div class="settings-menu">
            <div class="settings-menu-header menu-header">Options</div>
            
            <div class="settings-menu-item menu-item" 
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleDarkMode() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleDarkMode() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                    </svg>
                </span>
                <span>Dark Mode</span>
                {#if darkMode}<span class="checkmark">•</span>{/if}
            </div>
            <div class="settings-menu-item menu-item" 
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleGlobalTabComplete() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleGlobalTabComplete() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25 12 21m0 0-3.75-3.75M12 21V3" />
                    </svg>
                </span>
                <span>Global Tab Complete</span>
                {#if globalTabComplete}<span class="checkmark">•</span>{/if}
            </div>
            <div class="settings-menu-item menu-item" 
                 class:active={batterySaver}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleBatterySaver() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleBatterySaver() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M4.5 10.5H18V15H4.5v-4.5ZM3.75 18h16.5v1.5H3.75V18Z" />
                    </svg>
                </span>
                <span>Battery Saver</span>
                {#if batterySaver}<span class="checkmark">•</span>{/if}
            </div>
            <div class="settings-menu-item menu-item" 
                 class:active={dataSaver}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleDataSaver() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleDataSaver() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                </span>
                <span>Data Saver</span>
                {#if dataSaver}<span class="checkmark">•</span>{/if}
            </div>
            <div class="settings-menu-item menu-item" 
                class:active={secondScreenActive}
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); toggleSecondScreen() }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSecondScreen() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                    </svg>
                </span>
                <span>Second Screen</span>
                {#if secondScreenActive}<span class="checkmark">•</span>{/if}
            </div>
            <div class="settings-menu-item menu-item" 
                class:active={statusLightsEnabled}
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); toggleStatusLights() }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleStatusLights() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <circle cx="12" cy="16" r="2" fill="currentColor"/>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 14v-2M10 8l2-2 2 2M8 6l4-4 4 4"/>
                    </svg>
                </span>
                <span>Status Lights</span>
                {#if statusLightsEnabled}<span class="checkmark">•</span>{/if}
            </div>
            <div class="settings-menu-item menu-item" 
                class:active={devModeEnabled}
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); toggleDevMode() }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleDevMode() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 1 3.75 6v12A2.25 2.25 0 0 1 6 20.25Z" />
                    </svg>
                </span>
                <span>Dev Mode</span>
                {#if devModeEnabled}<span class="checkmark">•</span>{/if}
            </div>
            
            <div class="settings-menu-item menu-item" 
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleLinkPreviews() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleLinkPreviews() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                </span>
                <span>Link Previews</span>
                {#if data.spaceMeta.config.showLinkPreviews}<span class="checkmark">•</span>{/if}
            </div>

            <div class="settings-menu-item menu-item" 
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleLightboxMode() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleLightboxMode() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
                    </svg>
                </span>
                <span>Lightbox Mode</span>
                {#if lightboxModeEnabled}<span class="checkmark">•</span>{/if}
            </div>

            <div class="settings-menu-item menu-item" 
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleTabsOpenRight() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleTabsOpenRight() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M13.5 12H3" />
                    </svg>
                </span>
                <span>Tabs Open Right</span>
                {#if tabsOpenRight}<span class="checkmark">•</span>{/if}
            </div>
            
            <div class="settings-menu-separator"></div>
            
            <div class="settings-menu-item menu-item" 
                 class:active={openSidebars.has('resources')}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleResourcesSidebar() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleResourcesSidebar() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                </span>
                <span>Resources</span>
                {#if openSidebars.has('resources')}<span class="checkmark">•</span>{/if}
            </div>
            <div class="settings-menu-item menu-item" 
                 class:active={openSidebars.has('activity')}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleActivitySidebar() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleActivitySidebar() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                </span>
                <span>Activity</span>
                {#if openSidebars.has('activity')}<span class="checkmark">•</span>{/if}
            </div>
            <div class="settings-menu-item menu-item" 
                 class:active={openSidebars.has('userMods')}
                 role="button"
                 tabindex="0"
                 onclick={(e) => { e.stopPropagation(); toggleUserModsSidebar() }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleUserModsSidebar() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                </span>
                <span>Mods</span>
                {#if openSidebars.has('userMods')}<span class="checkmark">•</span>{/if}
            </div>

            <div class="settings-menu-item menu-item" 
                class:active={openSidebars.has('settings')}
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); toggleSettingsSidebar() }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleSettingsSidebar() } }}>
                <span class="settings-menu-icon-item menu-icon-item">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                </span>
                <span>Settings</span>
                {#if openSidebars.has('settings')}<span class="checkmark">•</span>{/if}
            </div>
        </div>
    </div>

    {#if devModeEnabled}
        <div class="dev-menu-icon" 
            role="button"
            tabindex="0"
            title="Dev Menu"
            style="right: 133px;"
            class:hidden={focusModeEnabled && !focusModeHovered}>
            <svg class="w-4 h-4" fill="none" viewBox="1 1 21 21" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <div class="dev-menu">
                <div class="dev-menu-header">Developer</div>
                <div class="dev-menu-item" 
                     role="button"
                     tabindex="0"
                     onclick={(e) => { e.stopPropagation(); data.loadSampleData() }}
                     onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); data.loadSampleData() } }}>
                    <span class="dev-menu-icon-item">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                        </svg>
                    </span>
                    <span>Load Sample Data</span>
                </div>
                <div class="dev-menu-item" 
                     role="button"
                     tabindex="0"
                     onclick={(e) => { e.stopPropagation(); openTestSuite() }}
                     onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openTestSuite() } }}>
                    <span class="dev-menu-icon-item">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                        </svg>
                    </span>
                    <span>Open Test Suite</span>
                </div>
                <div class="dev-menu-item" 
                        role="button"
                        tabindex="0"
                        onclick={(e) => { e.stopPropagation(); data.newTab(data.spaceMeta.activeSpace, { url: 'http://localhost:5601', shouldFocus: true }) }}
                        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); data.newTab(data.spaceMeta.activeSpace, { url: 'http://localhost:5601', shouldFocus: true }) } }}>
                    <span class="dev-menu-icon-item">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                    </span>
                    <span>Logs</span>
                </div>
                <div class="dev-menu-item" 
                     role="button"
                     tabindex="0"
                     onclick={(e) => { e.stopPropagation(); openVSCodeWorkspace() }}
                     onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openVSCodeWorkspace() } }}>
                    <span class="dev-menu-icon-item">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/>
                        </svg>
                    </span>
                    <span>Code</span>
                </div>
            </div>
        </div>
    {/if}
</header>

{#if !controlledFrameSupported && fallbackColor}
    <div class="dev-color-badge" style="background-color: {fallbackColor};" title="Fallback Mode - ControlledFrame API not available">
        <span class="dev-color-text">{fallbackColorName}</span>
    </div>
{/if}

{#if devModeEnabled}
    <div id="test-panel-mount"></div>
{/if}

{#if focusModeEnabled && contentAreaScrimActive}
    <div class="content-area-scrim"
         role="button"
         tabindex="0"
         onmouseenter={hideContentAreaScrim}
         onclick={hideContentAreaScrim}
         onkeydown={(e) => { if (e.key === 'Escape') hideContentAreaScrim() }}
         oncontextmenu={hideContentAreaScrim}></div>
{/if}

{#if contextMenu.visible && contextMenu.tab}
    {@render tabContextMenu(contextMenu, hideContextMenu)}
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
                                 // Find the tab by checking all tab arrays (leftPinned, regular, rightPinned)
                                 const allTabs = [...leftPinnedTabs, ...tabs.filter(tab => !tab.pinned), ...rightPinnedTabs]
                                 const matchingTab = allTabs.find(tab => tabButtons[tab.id] === hoveredTabElement)
                                 shouldKeepOpen = matchingTab?.id === hoveredTab?.id
                             }
                         }
                         
                         if (!shouldKeepOpen) {
                             hoveredTab = null
                             isTrashItemHover = false
                             stopHovercardPositionCheck()
                         }
                     }, 100)
                 }}>
                <div class="hovercard-header">
                    <div class="hovercard-text">
                        <div class="hovercard-title">{hoveredTab.title || 'Untitled'}</div>
                        <div class="hovercard-url">
                            <UrlRenderer url={hoveredTab.url} variant="compact" />
                        </div>
                    </div>
                </div>
            </div>
            {#if hoveredTab.screenshot}
                <div class="hovercard-screenshot">
                    <img src={hoveredTab.screenshot} alt="Page preview" />
                </div>
            {/if}
        </div>
    </div>
{/if}

<TabSidebar {isDragEnabled} />


<div class="frame-title-bar" class:window-controls-overlay={headerPartOfMain} class:editing-url={isEditingUrl}>
    <div class="frame-header-controls">
        <button class="frame-button" title="Back" aria-label="Back" onclick={goBack}>
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
        </button>
        <button class="frame-button" title="Forward" aria-label="Forward" onclick={goForward}>
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
        </button>
        <button class="frame-button" title="Reload" aria-label="Reload" onclick={reloadActiveTab}>
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
        </button>
    </div>

    <div class="frame-header-url-container">
        <div class="frame-header-url">
            {#if isEditingUrl}
                <form onsubmit={handleUrlSubmit} class="url-edit-form">
                    <input
                        bind:this={urlInput}
                        bind:value={editingUrlValue}
                        onkeydown={handleUrlKeydown}
                        onblur={stopEditingUrl}
                        class="url-input"
                        type="text"
                        placeholder="Enter URL or search..."
                    />
                </form>
            {:else}
                <button class="url-display-button" onclick={startEditingUrl} title="Click to edit URL">
                    <UrlRenderer url={getDisplayUrl(data.docs[data.spaceMeta.activeTabId]?.url)} variant="compact" />
                </button>
            {/if}
        </div>
    </div>

    <div class="frame-header-actions">
        <!-- <button class="frame-button" title="{tabs.find(tab => tab.id === data.spaceMeta.activeTab)?.pinned ? 'Unpin Tab' : 'Pin Tab'}" aria-label="{tabs.find(tab => tab.id === data.spaceMeta.activeTab)?.pinned ? 'Unpin Tab' : 'Pin Tab'}" onclick={() => togglePinTab(tabs.find(tab => tab.id === data.spaceMeta.activeTab))}>
            {#if tabs.find(tab => tab.id === data.spaceMeta.activeTab)?.pinned}
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 4V2a1 1 0 0 1 2 0v2h6V2a1 1 0 0 1 2 0v2h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v6a1 1 0 0 1-1 1h-2v3a1 1 0 0 1-2 0v-3H8a1 1 0 0 1-1-1V9H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h1z" />
                </svg>
            {:else}
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M7 4V2a1 1 0 0 1 2 0v2h6V2a1 1 0 0 1 2 0v2h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v6a1 1 0 0 1-1 1h-2v3a1 1 0 0 1-2 0v-3H8a1 1 0 0 1-1-1V9H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h1z" />
                </svg>
            {/if}
        </button> -->
        <button class="frame-button" title="Settings" aria-label="Settings">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
        </button>
        <button class="frame-button frame-close" title="Close Tab" aria-label="Close Tab" onclick={(e) => closeTab(data.docs[data.spaceMeta.activeTabId], e)}>
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
        </button>
    </div>
</div>


<div class="pinned-frames-left" class:window-controls-overlay={headerPartOfMain} 
class:scrolling={isScrolling} class:no-transitions={isWindowResizing}
style="--left-pinned-width: {leftPinnedWidth}px; --left-pinned-count: {leftPinnedTabs.length};">
    {#each leftPinnedTabs as leftPinned (leftPinned.id)}
        {@const tab = data.docs[leftPinned.id]}
        {#key userModsHash}
            {#if tab.type !== 'divider'}
                <div>
                    {#key origin(tab.url)}
                        <div class="url-display visible">
                            <UrlRenderer url={getDisplayUrl(tab.url)} variant="default" />
                        </div>
                    {/key}
                    
                    <Frame {observer} tabId={tab.id} {controlledFrameSupported} {requestedResources} {headerPartOfMain} {isScrolling}  onFrameFocus={() => handleFrameFocus(tab.id)} onFrameBlur={handleFrameBlur} userMods={getEnabledUserMods(tab)} {statusLightsEnabled} />
                </div>
            {/if}
        {/key}
    {/each}
</div>

<div class="controlled-frame-container browser-frame" 
     class:window-controls-overlay={headerPartOfMain} 
     class:scrolling={isScrolling}
     class:sidebar-open={openSidebars.size > 0}
     class:no-transitions={isWindowResizing}
     class:has-left-pins={leftPinnedTabs.length > 0}
     class:has-right-pins={rightPinnedTabs.length > 0}
     onscroll={handleScroll} 
     style="box-sizing: border-box; --space-taken: {spaceTaken}px; --left-pinned-width: {leftPinnedWidth}px; --right-pinned-width: {rightPinnedWidth}px; --left-pinned-count: {leftPinnedTabs.length}; --right-pinned-count: {rightPinnedTabs.length}; --sidebar-width: {rightSidebarWidth}px; --sidebar-count: {openSidebars.size};">
    {#if viewMode === 'canvas'}
        <Excalidraw {controlledFrameSupported} onFrameFocus={handleFrameFocus} onFrameBlur={handleFrameBlur} {getEnabledUserMods} />
    <!-- {:else if viewMode === 'reading'}
        {#each tabs as tab, tabIndex (tab.id)}
                {#key userModsHash}
                    <div class="reading-mode">
                        {#key origin(tab.url)}
                            <div class="url-display visible">
                                <UrlRenderer url={getDisplayUrl(tab.url)} variant="default" />
                            </div>
                        {/key}
                        
                        <Frame tabId={tab.id} {controlledFrameSupported} {headerPartOfMain} {isScrolling}  onFrameFocus={() => handleFrameFocus(tab.id)} onFrameBlur={handleFrameBlur} userMods={getEnabledUserMods(tab)} {statusLightsEnabled} />
                    </div>
                {/key}
        {/each} -->
    {:else}
        {#each unpinnedTabs as unpinned (unpinned.id)}
            {@const tab = data.docs[unpinned.id]}
            {#key userModsHash}
                {#if  tab.type !== 'divider'}
                    <div class:tab-group={unpinnedTabs.length > 1} class:active={tab.id === data.spaceMeta.activeTabId}>
                        {#key origin(tab.url)}
                            <div class="url-display visible">
                                <UrlRenderer url={getDisplayUrl(tab.url)} variant="default" />
                            </div>
                        {/key}
                        
                        <Frame {observer} {controlledFrameSupported} tabId={tab.id} {requestedResources} {headerPartOfMain} {isScrolling}  onFrameFocus={() => handleFrameFocus(tab.id)} onFrameBlur={handleFrameBlur} userMods={getEnabledUserMods(tab)} {statusLightsEnabled} />
                    </div>
                {/if}
            {/key}
        {/each}
    {/if}    
</div>

<CertificateMonitor 
    bind:certificateMonitorForTab={certificateMonitorForTab} 
/>

{#if rightPinnedTabs.length > 0}
    <div class="pinned-frames-right" class:window-controls-overlay={headerPartOfMain} 
    class:scrolling={isScrolling} class:no-transitions={isWindowResizing}
    style="--right-pinned-width: {rightPinnedWidth}px; --right-pinned-count: {rightPinnedTabs.length}; --sidebar-width: {rightSidebarWidth}px;">
        {#each rightPinnedTabs as rigthPinned (rigthPinned.id)}
            {@const tab = data.docs[rigthPinned.id]}
            {#key userModsHash}
                {#if  tab.type !== 'divider'}
                    <div>
                        {#key origin(tab.url)}
                            <div class="url-display visible">
                                <UrlRenderer url={getDisplayUrl(tab.url)} variant="default" />
                            </div>
                        {/key}
                        
                        <Frame {observer} tabId={tab.id} {controlledFrameSupported} {requestedResources} {headerPartOfMain} {isScrolling}  onFrameFocus={() => handleFrameFocus(tab.id)} onFrameBlur={handleFrameBlur} userMods={getEnabledUserMods(tab)} {statusLightsEnabled} />
                    </div>
                {/if}
            {/key}
        {/each}
    </div>
{/if}

<!-- class:sidebar-right-hovered={sidebarRightHovered} onmouseenter={handleSidebarRightMouseEnter} onmouseleave={handleSidebarRightMouseLeave}  -->
<div class="sidebar-right" role="region" >
    <div class="sidebar-buttons">
        <button class="sidebar-button" title="Add" aria-label="Add">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
        </button>
        
        <button class="sidebar-button" title="Agent" aria-label="Agent" onmouseup={toggleAIAgentSidebar}>
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 0 0 1.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
        </button>
        

    </div>

    <!-- class:drag-enabled={isDragEnabled} -->
</div>

<div class="drag-handle-bottom" class:drag-enabled={isDragEnabled}></div>

{#if openSidebars.size > 0}
    <div class="sidebar-container" 
         class:window-controls-overlay={headerPartOfMain}
         class:no-transitions={isWindowResizing}
         style="--sidebar-width: {rightSidebarWidth}px; --space-taken: {spaceTaken}px;">
        {#if openSidebars.has('resources')}
            <div class="sidebar-panel" class:new-panel={openSidebars.has('resources') && !prevOpenSidebars.has('resources') && !isSwitchingSidebars && !isWindowResizing}>
                <Resources onClose={closeResourcesSidebar}  {requestedResources}
                          {openSidebars}
                          {switchToResources} 
                          {switchToSettings}
                          {switchToUserMods}
                          {switchToActivity}
                          switchToAgent={switchToAIAgent} />
            </div>
        {/if}
        
        {#if openSidebars.has('activity')}
            <div class="sidebar-panel" class:new-panel={openSidebars.has('activity') && !prevOpenSidebars.has('activity') && !isSwitchingSidebars && !isWindowResizing}>
                <Activity onClose={closeActivitySidebar}
                         {openSidebars}
                         {switchToResources} 
                         {switchToSettings}
                         {switchToUserMods}
                         {switchToActivity}
                         switchToAgent={switchToAIAgent} />
            </div>
        {/if}
        
        {#if openSidebars.has('userMods')}
            <div class="sidebar-panel" class:new-panel={openSidebars.has('userMods') && !prevOpenSidebars.has('userMods') && !isSwitchingSidebars && !isWindowResizing}>
                <UserMods onClose={closeUserModsSidebar} 
                         {openSidebars}
                         {switchToResources} 
                         {switchToSettings}
                         {switchToUserMods}
                         {switchToActivity}
                         switchToAgent={switchToAIAgent}
                         {userMods}
                         onUpdateUserMods={updateUserMods}
                         currentTab={data.docs[data.spaceMeta.activeTabId]} />
            </div>
        {/if}
        
        {#if openSidebars.has('aiAgent')}
            <div class="sidebar-panel" class:new-panel={openSidebars.has('aiAgent') && !prevOpenSidebars.has('aiAgent') && !isSwitchingSidebars && !isWindowResizing}>
                <AIAgent onClose={closeAIAgentSidebar} 
                         {openSidebars}
                         {switchToResources} 
                         {switchToSettings}
                         {switchToUserMods}
                         {switchToActivity}
                         {switchToAIAgent}
                         {viewMode}
                         currentTab={data.docs[data.spaceMeta.activeTabId]} />
            </div>
        {/if}
        
        {#if openSidebars.has('settings')}
            <div class="sidebar-panel" class:new-panel={openSidebars.has('settings') && !prevOpenSidebars.has('settings') && !isSwitchingSidebars && !isWindowResizing}>
                <Settings onClose={closeSettingsSidebar} 
                         {openSidebars}
                         {switchToResources} 
                         {switchToSettings}
                         {switchToUserMods}
                         {switchToActivity}
                         switchToAgent={switchToAIAgent}
                         {tabs}
                         closedTabs={data.closedTabs} />
            </div>
        {/if}
    </div>
{/if}

<style>
    @import "app.css";
    
    .dev-color-badge {
        position: fixed;
        top: 10px;
        left: 10px;
        width: 75px;
        height: 20px;
        border-radius: 8px;
        z-index: 9999;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .dev-color-text {
        font-size: 10px;
        font-weight: 500;
        color: white;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>

<script>
    // Tab sidebar component with Firefox-like hover behavior
    // let { isDragEnabled = true } = $props()
    let { 
        onShowApps = () => {},
        customTabSidebarWidth = null,
        tabSidebarVisible = false,
        isResizingTabSidebar = false,
        onStartResizeTabSidebar = null
    } = $props()
    import data from '../data.svelte.js'
    import Favicon from './Favicon.svelte'
    import Tooltip from './Tooltip.svelte'
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
    let resizeHandleHovered = $state(false)
    let resizeHandleVisible = $state(false)
    let resizeHandleShowTimeout = null

    let isManualScroll = false
    let previousSpaceIndex = -1
    // let scrollActiveSpaceTimeout = null


    // TODO: active tab on tab title and track active tabs per space, show active tab in each space

    const globallyPinnedTabs = $derived(data.spaceMeta.globalPins)
    
    function handleMouseEnter() {
        isHovered = true
        
        // Show resize handle after delay
        if (resizeHandleShowTimeout) {
            clearTimeout(resizeHandleShowTimeout)
        }
        resizeHandleShowTimeout = setTimeout(() => {
            resizeHandleVisible = true
        }, 200)
    }
    
    function handleMouseLeave() {
        // Always set isHovered to false for resize handle logic
        isHovered = false
        resizeHandleVisible = false
        
        // Clear resize handle timeout
        if (resizeHandleShowTimeout) {
            clearTimeout(resizeHandleShowTimeout)
            resizeHandleShowTimeout = null
        }
        
        // Close context menu when leaving sidebar
        if (spaceContextMenuId !== null) {
            spaceContextMenuId = null
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
            data.spaceMeta.activeSpace = spaceId
            previousSpaceIndex = data.spaceMeta.spaceOrder.indexOf(spaceId)
            isManualScroll = true
            scrollToCurrentSpace('smooth')
            setTimeout(() => { isManualScroll = false }, 300)
        }
    }

    function activateTab(tabId, spaceId) {
        // If clicking on the currently active tab, switch to previous tab
        data.spaceMeta.activeSpace = spaceId
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

    function handleTabScroll(event) {
        if (!tabListRef) return
        
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
        closedTabsHovered = false
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
            if (resizeHandleShowTimeout) {
                clearTimeout(resizeHandleShowTimeout)
            }
            if (closedTabsHideTimeout) {
                clearTimeout(closedTabsHideTimeout)
            }
        }
    })
    
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
    
    function handleResizeHandleMouseEnter() {
        resizeHandleHovered = true
        // Ensure resize handle stays visible
        resizeHandleVisible = true
        // Clear any pending timeout
        if (resizeHandleShowTimeout) {
            clearTimeout(resizeHandleShowTimeout)
            resizeHandleShowTimeout = null
        }
    }
    
    function handleResizeHandleMouseLeave() {
        resizeHandleHovered = false
        // Let the main sidebar mouse leave handler deal with hiding
    }

</script>

<svelte:window onclick={handleClickOutside} onmouseup={handleMouseUpOutside} onkeydown={(e) => { if (e.key === 'Escape') { handleClickOutside(e); if (newSpaceMenuOpen) newSpaceMenuOpen = false; if (spaceContextMenuId !== null) spaceContextMenuId = null; } }} />

<div class="sidebar-box" 
     class:hovered={isHovered}
     class:visible={tabSidebarVisible}
     class:resizing={isResizingTabSidebar}
     onmouseenter={handleMouseEnter} 
     onmouseleave={handleMouseLeave}
     style="width: {customTabSidebarWidth || 263}px;"
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
        <div class="sidebar-content">
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
                    {#each globallyPinnedTabs as tab}
                        <button class="pinned-tab" title={tab.url}>
                            <Favicon {tab} showButton={false} />
                        </button>
                    {/each}
                </div>
            </div>

            <div class="section">
                <div class="spaces-container">
                    <div class="spaces-list" bind:this={spacesListRef}>
                        {#each data.spaceMeta.spaceOrder as spaceId}
                            <Tooltip text={data.spaces[spaceId].name} position="top" delay={300}>
                                <button class="space-item" 
                                        class:active={data.spaceMeta.activeSpace === spaceId}
                                        class:scrolled={currentScrolledSpace === spaceId}
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
                    <div class="new-space-menu">
                        <button class="new-space-button" 
                                onmousedown={(e) => { e.stopPropagation(); handleNewSpaceMenuToggle(); }}
                                aria-label="Create new space">
                            <span class="plus-icon">+</span>
                        </button>
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
                     bind:this={tabListRef}
                     onscroll={handleTabScroll}
                    >
                    <div class="tab-content-track">
                        {#each data.spaceMeta.spaceOrder as spaceId (spaceId)}
                            <div class="space-content" data-space-id={spaceId}>
                                <div class="space-title-container">
                                    <div class="space-title" class:active={data.spaceMeta.activeSpace === spaceId}>
                                        {data.spaces[spaceId].name}
                                    </div>
                                    <div class="space-menu">
                                        <button class="space-menu-button" 
                                                onmousedown={(e) => { e.stopPropagation(); handleMenuToggle(spaceId); }}
                                                aria-label="Space options">⋯</button>
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
                                            <button class="app-tab" class:active={tab.id === data.spaceMeta.activeTabId} title={tab.url} onmousedown={() => activateTab(tab.id, spaceId)}>
                                                <Favicon {tab} showButton={false} />
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                                
                                <button class="new-tab-button" 
                                        onmousedown={() => {
                                            const newTab = data.newTab(spaceId)
                                            if (newTab) {
                                                data.spaceMeta.activeSpace = spaceId
                                                data.activate(newTab.id)
                                            }
                                        }}
                                        aria-label="Create new tab">
                                    <span class="new-tab-icon">+</span>
                                    <span class="new-tab-text">New Tab</span>
                                </button>
                                
                                <div class="tabs-list">
                                    {#each data.spaces[spaceId].tabs as tab (tab.id)}
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
                                            <div class="tab-item-container" class:active={tab.id === data.spaceMeta.activeTabId} data-tab-id={tab.id}>
                                                <button class="tab-item-main" title={tab.url} onmousedown={() => activateTab(tab.id, spaceId)}>
                                                    <Favicon {tab} showButton={false} />
                                                    <span class="tab-title">{tab.title}</span>
                                                </button>
                                                <button class="tab-close" aria-label="Close tab" onmousedown={(e) => { e.stopPropagation(); data.closeTab(spaceId, tab.id); }}>×</button>
                                            </div>
                                        {/if}
                                    {/each}
                                    
                                    <!-- TODO: <div class="tab-group" title="April - 10 tabs">
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
                                        <button class="tab-group-close" aria-label="Close tab group">×</button>
                                    </div> -->
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
                        onclick={() => { data.clearClosedTabs(); handleClosedTabsMouseLeave() }}
                        aria-label="Clear all recently closed tabs">
                    <span class="closed-tabs-title">{closedTabsHeaderHovered ? 'Clear All' : 'Recently Closed'}</span>
                    <span class="closed-tabs-count">{data.spaceMeta.closedTabs.length}</span>
                </button>
                <div class="closed-tabs-content" class:expanded={closedTabsHovered}>
                    <div class="closed-tabs-list">
                        {#each data.spaceMeta.closedTabs as tab}
                            <button class="closed-tab-item" title={tab.url} onmousedown={() => data.restoreClosedTab(tab.id)}>
                                <Favicon {tab} showButton={false} />
                                <div class="tab-text">
                                    <span class="tab-title">{tab.title}</span>
                                    <span class="tab-space">{data.spaces[tab.spaceId]?.name || 'Unknown Space'}</span>
                                </div>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}
        
        <div class="resize-handle-hover-zone"
             onmouseenter={handleResizeHandleMouseEnter}
             onmouseleave={handleResizeHandleMouseLeave}></div>
        
        {#if resizeHandleVisible || isResizingTabSidebar}
            <button class="resize-handle resize-handle-right" 
                    class:active={isResizingTabSidebar}
                    aria-label="Resize tab sidebar"
                    onmousedown={onStartResizeTabSidebar}
                    title="Drag to resize tab sidebar"></button>
        {/if}
    </div>
</div>

<style>
    .sidebar-box {
        background: transparent;
        position: fixed;
        z-index: 5;
        bottom: 9px;
        top: 43px;
        left: 0px;
        transition: transform 190ms 340ms cubic-bezier(.78,-0.01,.34,1.04);
        padding-right: 9px;
        backface-visibility: hidden;
        padding-left: 9px;
        pointer-events: auto;
        overflow: visible;
        transform: translateX(calc(-100% + 8px));
    }

    .sidebar-box:hover, .sidebar-box.hovered, .sidebar-box.resizing, .sidebar-box.visible {
        transition: transform 190ms 0ms cubic-bezier(.78,-0.01,.34,1.04);
        transform: translateX(0px);
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
    }
    
    .sidebar-box.visible .sidebar {
        background: rgb(0, 0, 0);
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
        overflow-y: auto;
        overflow-x: visible;
        background: transparent;
        padding: 4px;
        display: flex;
        flex-direction: column;
        position: relative;
        padding-bottom: 0;
        border-radius: 9px;
        box-shadow: 0 0 16px 0 #000, -18px 0px 2px 1px #000;
        border: 1px solid hsl(0 0% 12% / 1);
        transition: border-radius 190ms ease, box-shadow 190ms ease, border 190ms ease;
    }

    .sidebar-box.visible .sidebar-content {
        border-radius: 0;
        box-shadow: 13px 0 13px 7px #0000003c;
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
        background: rgb(255 255 255 / 7%);
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
    
    .spaces-list {
        display: flex;
        flex-direction: row;
        gap: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        flex: 1;
        min-width: 0;
    }
    
    .spaces-list::-webkit-scrollbar {
        display: none;
    }
    
    .space-item {
        width: 22px;
        height: 22px;
        border-radius: 10px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        opacity: 0.35;
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
        font-size: 12px;
        line-height: 1;
        width: 12px;
        height: 12px;
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
        width: 8px;
        height: 8px;
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
        width: 22px;
        height: 22px;
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
        opacity: 0.6;
        visibility: visible;
    }
    
    .new-space-button:hover {
        background: rgba(255, 255, 255, 0.1);
        opacity: 1;
    }
    
    .plus-icon {
        font-size: 16px;
        line-height: 1;
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
        overflow: visible;
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

    .space-item.scrolled:after {
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
    }
    

    
    .app-tab {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: rgb(255 255 255 / 7%);
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
        opacity: 0.5;
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
        opacity: 0.5;
    }
    
    .app-tab.active :global(.favicon-wrapper) {
        opacity: 0.85;
    }
    
    .app-tab:hover :global(.favicon-wrapper) {
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
        padding-bottom: 60px; /* Add space at bottom for closed tabs overlay */
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
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
    
    .tab-item-container {
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 10px;
        background: rgb(255 255 255 / 7%);
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
        opacity: 0.5;
    }
    
    :global(.favicon-wrapper svg) {
        width: 100%;
        height: 100%;
    }
    
    .tab-title {
        color: hsl(0 0% 35% / 1);
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
        color: #c6c6c6;
    }
    
    .tab-item-container:hover .tab-title {
        color: #fff;
    }
    
    .tab-item-container.active :global(.favicon-wrapper) {
        opacity: 0.85;
    }
    
    .tab-item-container:hover :global(.favicon-wrapper) {
        opacity: 1;
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
        width: 20px;
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
    
    .new-tab-button:hover {
        background-color: rgb(255 255 255 / 9%);
        border: 1px solid hsl(0deg 0% 100% / 3%);
    }
    
    .new-tab-icon {
        font-size: 18px;
        line-height: 1;
        flex-shrink: 0;
        width: 16px;
        height: 16px;
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
        max-width: 180px;
    }
    
    .new-tab-button:hover .new-tab-icon {
        color: rgba(255, 255, 255, 0.7);
    }
    
    .new-tab-button:hover .new-tab-text {
        color: #fff;
    }
    
    /* Tab Group */
    .tab-group {
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 10px;
        background: rgb(255 255 255 / 7%);
        transition: all 150ms ease;
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
        color: hsl(0 0% 35% / 1);
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
    
    .tab-group-close {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        font-size: 18px;
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
        line-height: 1;
        position: absolute;
        right: 0;
        transition: opacity 150ms ease;
        /* margin-top: -1px; */
    }

    .tab-group-close:hover {
        color: rgba(255, 255, 255, 0.9);
    }
    
    .tab-group:hover .tab-group-count {
        opacity: 0;
    }
    
    .tab-group:hover .tab-group-close {
        opacity: 1;
    }
    
    .tab-group:hover .tab-group-title {
        color: #fff;
    }
    
    .tab-group:hover .tab-group-favicon {
        color: rgba(255, 255, 255, 0.6);
    }
    
    /* Recently Closed Tabs */
    .closed-tabs-section {
        position: absolute;
        bottom: 4px;
        left: 4px;
        right: 4px;
        z-index: 10;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        width: calc(100% - 8px);
        flex-shrink: 0;
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
    
    /* Tab sidebar resize handle - custom styling to work with absolute positioning */
    .sidebar .resize-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 6px;
        cursor: ew-resize;
        z-index: 1000;
        opacity: 0;
        transition: opacity 150ms ease;
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 3px;
        margin-top: 4px;
        margin-bottom: 4px;
        padding: 0;
        pointer-events: auto;
        box-shadow: 0 0 1px rgba(0, 0, 0, 0.15);
    }
    
    .sidebar .resize-handle:hover, 
    .sidebar .resize-handle.active {
        opacity: 1;
        background: rgba(255, 255, 255, 0.3);
        border: 1px solid rgba(0, 0, 0, 0.2);
        box-shadow: 0 0 2px rgba(0, 0, 0, 0.2);
    }
    
    .sidebar .resize-handle.resize-handle-right {
        right: -6px;
    }

    .sidebar-box.visible .resize-handle.resize-handle-right {
        right: 3px;
    }
    
    
    /* Invisible hover zone for resize handle */
    .resize-handle-hover-zone {
        position: absolute;
        top: 0;
        bottom: 0;
        right: -15px;
        width: 20px;
        pointer-events: auto;
        z-index: 999;
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
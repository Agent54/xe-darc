<script>
    import data from '../data.svelte.js'
    
    let {
        menu = { visible: false, x: 0, y: 0, tab: null, index: null },
        onHide = () => {},
        onReload = null,
        partitions = ['persist:1', 'persist:2', 'persist:3', 'ephemeral:1', 'ephemeral:2', 'ephemeral:3'],
        contextMenuOpenTime = 0,
        onToggleCertificateMonitor = null
    } = $props()
    
    let menuElement = $state(null)
    let adjustedY = $state(0)
    
    $effect(() => {
        if (menu.visible) {
            adjustedY = menu.y
            if (menuElement) {
                requestAnimationFrame(() => {
                    const menuHeight = menuElement.offsetHeight
                    const viewportHeight = window.innerHeight
                    const margin = 8
                    if (menu.y + menuHeight + margin > viewportHeight) {
                        adjustedY = Math.max(margin, viewportHeight - menuHeight - margin)
                    }
                })
            }
        }
    })
    
    function reloadTab(tab) {
        const frame = data.frames[tab.id]?.frame
        if (!frame) {
            data.unhibernate(tab.id)
            onHide()
            return
        }
        if (onReload) {
            onReload(tab)
        } else {
            data.reloadTab(tab.id)
        }
        onHide()
    }
    
    function toggleCertificateMonitor(tab) {
        if (onToggleCertificateMonitor) {
            onToggleCertificateMonitor(tab)
        }
        onHide()
    }
    
    function pinTabLeft(tab) {
        if (!data.spaceMeta.activeSpace || !tab) return
        const wasActive = data.spaceMeta.activeTabId === tab.id
        data.pin({ tabId: tab.id, pinned: 'left' })
        if (wasActive) {
            data.previous()
        }
        onHide()
    }
    
    function pinTabRight(tab) {
        const wasActive = data.spaceMeta.activeTabId === tab.id
        data.pin({ tabId: tab.id, pinned: 'right' })
        if (wasActive) {
            data.previous()
        }
        onHide()
    }
    
    function unpinTab(tab) {
        data.pin({ tabId: tab.id, pinned: null })
        onHide()
    }
    
    function toggleMuteTab(tab) {
        if (!data.spaceMeta.activeSpace || !tab) return
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
        onHide()
    }
    
    function selectPartition(partition, tab) {
        console.log('Selected partition:', partition, 'for tab:', tab.id)
        tab.partition = partition
        onHide()
    }
    
    async function copyTabUrl(tab) {
        try {
            await navigator.clipboard.writeText(tab.url)
            console.log('URL copied to clipboard:', tab.url)
        } catch (error) {
            console.error('Failed to copy URL:', error)
            const textArea = document.createElement('textarea')
            textArea.value = tab.url
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
        }
        onHide()
    }
    
    function closeTabFromMenu(tab) {
        if (tab) {
            data.closeTab(tab.spaceId, tab.id)
        }
        onHide()
    }
    
    async function takeScreenshot(tab) {
        if (tab) {
            await data.captureScreenshot(tab.id)
        }
        onHide()
    }
</script>

{#if menu.visible && menu.tab}
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
         bind:this={menuElement}
         role="menu"
         tabindex="0"
         style="left: {menu.x}px; top: {adjustedY}px;"
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

        {#if data.frames[menu.tab.id]?.frame}
            <div class="context-menu-item" 
                 role="menuitem"
                 tabindex="0"
                 onmouseup={() => { data.hibernate(menu.tab.id, data.spaceMeta.activeTabId === menu.tab.id); onHide(); }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); data.hibernate(menu.tab.id, data.spaceMeta.activeTabId === menu.tab.id); onHide(); } }}>
                <span class="context-menu-icon">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                    </svg>
                </span>
                <span>Hibernate</span>
            </div>
        {:else if data.spaceMeta.activeTabId !== menu.tab.id}
            <div class="context-menu-item" 
                 role="menuitem"
                 tabindex="0"
                 onmouseup={() => { data.unhibernate(menu.tab.id); onHide(); }}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); data.unhibernate(menu.tab.id); onHide(); } }}>
                <span class="context-menu-icon">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                    </svg>
                </span>
                <span>Unhibernate</span>
            </div>
        {/if}

        <div class="context-menu-item" 
             role="menuitem"
             tabindex="0"
             onmouseup={() => { data.hibernateOthers(menu.tab.id); onHide(); }}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); data.hibernateOthers(menu.tab.id); onHide(); } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
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
             class:disabled={!data.frames[menu.tab.id]?.frame}
             role="menuitem"
             tabindex={!data.frames[menu.tab.id]?.frame ? -1 : 0}
             title={!data.frames[menu.tab.id]?.frame ? 'Tab hibernated' : null}
             onmouseup={() => data.frames[menu.tab.id]?.frame && takeScreenshot(menu.tab)}
             onkeydown={(e) => { if (data.frames[menu.tab.id]?.frame && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); takeScreenshot(menu.tab) } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
            </span>
            <span>Take Screenshot</span>
        </div>

        <div class="context-menu-separator"></div>

        <div class="context-menu-item" 
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
{/if}

<style>
    .context-menu-scrim {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        z-index: 10001;
    }

    .context-menu {
        position: fixed;
        z-index: 10002;
        background: rgba(0, 0, 0, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        min-width: 200px;
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        overflow: visible;
        font-family: 'Inter', sans-serif;
        animation: context-menu-appear 0.1s ease-out;
        -webkit-app-region: no-drag;
        white-space: nowrap;
    }

    @keyframes context-menu-appear {
        from {
            opacity: 0;
            transform: scale(0.9) translateY(-8px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }

    .context-menu-item {
        padding: 6px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.9);
        user-select: none;
    }

    .context-menu-item:hover:not(.disabled) {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
    }

    .context-menu-item.disabled {
        opacity: 0.4;
    }

    .context-menu-item:first-child:not(.context-menu-item-left):not(.context-menu-item-right) {
        border-radius: 8px 8px 0 0;
    }

    .context-menu-item:last-child:not(.context-menu-item-left):not(.context-menu-item-right) {
        border-radius: 0 0 8px 8px;
    }

    .context-menu-item-row:first-child .context-menu-item-left {
        border-radius: 8px 0 0 0;
    }

    .context-menu-item-row:first-child .context-menu-item-right {
        border-radius: 0 8px 0 0;
    }

    .context-menu-item-row:last-child .context-menu-item-left {
        border-radius: 0 0 0 8px;
    }

    .context-menu-item-row:last-child .context-menu-item-right {
        border-radius: 0 0 8px 0;
    }

    .context-menu-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 12px;
        transform: translateZ(0);
    }

    .context-menu-separator {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
        margin: 4px 0;
    }

    .context-menu-item-row {
        display: flex;
        width: 100%;
    }

    .context-menu-item-left,
    .context-menu-item-right {
        flex: 1;
        border-radius: 0;
    }

    .context-menu-item-left {
        border-right: 1px solid transparent;
    }

    .context-menu-item-left:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
        border-right: 1px solid transparent;
    }

    .context-menu-item-right:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
    }

    .context-menu-item.has-submenu {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .submenu-arrow {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        margin-left: auto;
    }

    .context-menu-item.has-submenu:hover .submenu-arrow {
        color: rgba(255, 255, 255, 0.8);
    }

    .context-submenu {
        position: absolute;
        left: calc(100% + 4px);
        top: -1px;
        min-width: 180px;
        background: rgba(0, 0, 0, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transform: translateX(-4px);
        transition: all 0.12s ease-out;
        z-index: 10003;
        pointer-events: auto;
        white-space: nowrap;
    }

    .context-menu-item.has-submenu:hover .context-submenu,
    .context-submenu:hover {
        opacity: 1;
        visibility: visible;
        transform: translateX(0);
        pointer-events: auto;
    }

    /* Extend hover area to prevent submenu from disappearing */
    .context-menu-item.has-submenu::after {
        content: '';
        position: absolute;
        top: 0;
        right: -4px;
        width: 8px;
        height: 100%;
        background: transparent;
        z-index: 10002;
    }

    .context-submenu-item {
        padding: 6px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.9);
        user-select: none;
        position: relative;
        white-space: nowrap;
    }

    .context-submenu-item:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
        color: rgba(255, 255, 255, 0.95);
    }

    .context-submenu-item.active {
        background: rgba(59, 130, 246, 0.1);
        color: rgba(59, 130, 246, 0.9);
    }

    .context-submenu-item.active:hover {
        background: rgba(59, 130, 246, 0.12);
        color: rgba(59, 130, 246, 1);
    }

    .context-submenu-item:first-child {
        border-radius: 8px 8px 0 0;
    }

    .context-submenu-item:last-child {
        border-radius: 0 0 8px 8px;
    }

    .partition-icon {
        font-size: 12px;
        flex-shrink: 0;
        opacity: 0.8;
    }

    .context-submenu-item .checkmark {
        margin-left: auto;
        color: rgba(59, 130, 246, 0.8);
        font-weight: bold;
        font-size: 14px;
    }
</style>

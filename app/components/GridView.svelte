<script>
  import { onMount, tick } from 'svelte'
  import Frame from './Frame.svelte'
  import AttachmentImage from './AttachmentImage.svelte'
  import Favicon from './Favicon.svelte'
  import data from '../data.svelte.js'

  let {
    controlledFrameSupported,
    onFrameFocus = () => {},
    onFrameBlur = () => {},
    getEnabledUserMods = () => { return { css: [], js: [] } },
    onTabActivate = () => {},
    onViewModeChange = () => {},
    onTabClose = () => {},
    leftPinnedWidth = 0,
    rightPinnedWidth = 0,
    rightSidebarWidth = 0,
    tabSidebarWidth = 0,
    spaceTaken = 0,
    onSpaceSwitch = () => {}
  } = $props()

  // Get all spaces and their tabs
  let spaceOrder = $derived(data.spaceMeta.spaceOrder || [])
  let activeSpaceId = $derived(data.spaceMeta.activeSpace)
  let highlightedSpaceId = $state(data.spaceMeta.activeSpace)
  
  function switchSpace(id) {
    if (id && id !== activeSpaceId) {
      onSpaceSwitch(id)
      // Scroll to the new space after switching
      setTimeout(() => {
        highlightedSpaceId = id
        scrollToSpace(id)
      }, 50)
    }
  }
  
  // Handle new tab creation in specific space
  function handleNewTabInSpace(spaceId) {
    // Switch to the space first if not already active
    if (spaceId !== activeSpaceId) {
      switchSpace(spaceId)
      // Wait for space switch, then create new tab
      setTimeout(() => {
        data.newTab(spaceId, { shouldFocus: true })
        // Close the grid view after creating tab
        onViewModeChange()
      }, 150)
    } else {
      // Already in the right space, just create tab
      data.newTab(spaceId, { shouldFocus: true })
      onViewModeChange()
    }
  }
  
  // Grid container and scroll references
  let gridContainer
  let scrollContainer
  let isScrolling = $state(false)
  let scrollTimeout = null
  
  // Handle scroll to highlight current space (throttled for performance)
  let scrollThrottleFrame = null
  function handleScroll() {
    if (!scrollContainer || scrollThrottleFrame) return
    
    scrollThrottleFrame = requestAnimationFrame(() => {
      if (!scrollContainer) {
        scrollThrottleFrame = null
        return
      }
      
      isScrolling = true
      if (scrollTimeout) clearTimeout(scrollTimeout)
      
      const containerWidth = scrollContainer.clientWidth
      const scrollLeft = scrollContainer.scrollLeft
      const currentPage = Math.round(scrollLeft / containerWidth)
      const spaceId = spaceOrder[currentPage]
      
      if (spaceId && spaceId !== highlightedSpaceId) {
        highlightedSpaceId = spaceId
      }
      
      scrollTimeout = setTimeout(() => {
        isScrolling = false
      }, 150)
      
      scrollThrottleFrame = null
    })
  }
  
  // Scroll to specific space
  function scrollToSpace(spaceId) {
    if (!scrollContainer) return
    const spaceIndex = spaceOrder.indexOf(spaceId)
    if (spaceIndex >= 0) {
      const containerWidth = scrollContainer.clientWidth
      scrollContainer.scrollTo({
        left: spaceIndex * containerWidth,
        behavior: 'smooth'
      })
    }
  }
  
  // Initialize scroll position immediately without animation
  let hasInitialized = $state(false)
  
  onMount(async () => {
    // Wait for DOM to be ready
    await tick()
    if (scrollContainer && !hasInitialized) {
      highlightedSpaceId = activeSpaceId
      // Scroll immediately without animation by setting scrollLeft directly
      const spaceIndex = spaceOrder.indexOf(activeSpaceId)
      if (spaceIndex >= 0) {
        // Temporarily disable smooth scrolling for instant positioning
        const originalBehavior = scrollContainer.style.scrollBehavior
        scrollContainer.style.scrollBehavior = 'auto'
        
        const containerWidth = scrollContainer.clientWidth
        scrollContainer.scrollLeft = spaceIndex * containerWidth
        
        // Restore smooth scrolling for user interactions
        setTimeout(() => {
          scrollContainer.style.scrollBehavior = originalBehavior
        }, 0)
      }
      hasInitialized = true
    }
  })
  
  $effect(() => {
    // Fallback effect in case onMount doesn't work
    if (!hasInitialized && scrollContainer && scrollContainer.clientWidth > 0) {
      highlightedSpaceId = activeSpaceId
      // Scroll immediately without animation
      const spaceIndex = spaceOrder.indexOf(activeSpaceId)
      if (spaceIndex >= 0) {
        // Temporarily disable smooth scrolling for instant positioning
        const originalBehavior = scrollContainer.style.scrollBehavior
        scrollContainer.style.scrollBehavior = 'auto'
        
        const containerWidth = scrollContainer.clientWidth
        scrollContainer.scrollLeft = spaceIndex * containerWidth
        
        // Restore smooth scrolling for user interactions
        setTimeout(() => {
          scrollContainer.style.scrollBehavior = originalBehavior
        }, 0)
      }
      hasInitialized = true
    }
  })

  // Handle clicking on frame screenshot
  function handleFrameClick(tab, index, spaceId) {
    // If clicking a tab from a different space, switch to that space first
    if (spaceId !== activeSpaceId) {
      switchSpace(spaceId)
      // Wait for space switch, then activate tab and close view
      setTimeout(() => {
        onTabActivate(tab, index)
        onViewModeChange()
      }, 100)
    } else if (tab.id === data.spaceMeta.activeTabId) {
      // Same space, same tab - just toggle view mode
      onViewModeChange()
    } else {
      // Same space, different tab - activate tab and toggle view mode
      onTabActivate(tab, index)
      onViewModeChange()
    }
  }

  // Handle zoom gestures on frame screenshots
  function handleFrameWheel(event, tab, index) {
    // Check for zoom gesture (Ctrl/Cmd + wheel)
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      
      // Determine zoom direction based on deltaY
      const zoomDirection = event.deltaY < 0 ? 'in' : 'out'
      
      if (zoomDirection === 'in') {
        console.log(`🔍 [GRID-VIEW] Zoom in detected on tab ${tab.title || 'Untitled'} - activating tab`)
        // Activate the tab and switch to default view
        if (tab.id !== data.spaceMeta.activeTabId) {
          onTabActivate(tab, index)
        }
        onViewModeChange()
      }
    }
  }

  function handleCloseTab(event, tab, index, spaceId) {
    event.preventDefault()
    event.stopPropagation()
    onTabClose(tab, event)
  }

  function handleBackgroundClick(event) {
    const target = event.target
    const isBackgroundClick = (
      target === gridContainer || 
      target === scrollContainer ||
      target.classList.contains('space-page') ||
      target.classList.contains('space-grid') ||
      target.classList.contains('empty-space') ||
      target.classList.contains('empty-space-icon') ||
      target.classList.contains('empty-space-title') ||
      target.classList.contains('empty-space-subtitle') ||
      (target.tagName === 'svg' && target.closest('.empty-space')) ||
      (target.tagName === 'path' && target.closest('.empty-space'))
    )
    
    // Don't handle if clicking on tabs, space chips, or other interactive elements
    const isInteractiveElement = (
      target.closest('.grid-frame') ||
      target.closest('.space-chip') ||
      target.closest('.spaces-switcher') ||
      target.closest('.new-tab-button')
    )
    
    if (isBackgroundClick && !isInteractiveElement) {
      // If we're viewing a different space than the active one, switch to it
      if (highlightedSpaceId && highlightedSpaceId !== activeSpaceId) {
        switchSpace(highlightedSpaceId)
        onViewModeChange()
      } else {
        // If we're already in the active space, just close the view
        onViewModeChange()
      }
    }
  }
</script>

<div 
  class="grid-view"
  bind:this={gridContainer}
  onmousedown={handleBackgroundClick}
  onkeydown={(e) => { if (e.key === 'Escape') handleBackgroundClick(e) }}
  role="button"
  tabindex="0"
  aria-label="Close tab overview"
  style="--left-pinned-width: {leftPinnedWidth}px; --right-pinned-width: {rightPinnedWidth}px; --tab-sidebar-width: {tabSidebarWidth}px; --sidebar-width: {rightSidebarWidth}px; --space-taken: {spaceTaken}px;"
>
  <div class="spaces-switcher" role="navigation" aria-label="Spaces">
    {#each spaceOrder as id}
      {@const space = data.spaces[id]}
      {#if space}
        <button 
          class="space-chip"
          class:active={id === activeSpaceId}
          class:highlighted={id === highlightedSpaceId}
          style="--space-color: {space.color || '#5b5b5b'}"
          onmousedown={() => switchSpace(id)}
          aria-current={id === activeSpaceId ? 'true' : 'false'}
          title={space.title || space.name}
          type="button"
        >
          <span class="space-color-dot" aria-hidden="true"></span>
          <span class="space-name">{space.name || 'Space'}</span>
        </button>
      {/if}
    {/each}
  </div>
  
  <div 
    class="spaces-scroll-container"
    class:scrolling={isScrolling}
    bind:this={scrollContainer}
    onscroll={handleScroll}
  >
    {#each spaceOrder as spaceId}
      {@const space = data.spaces[spaceId]}
      {@const tabs = space?.tabs?.filter(tab => !tab.pinned) || []}
      <div class="space-page">
        {#if tabs.length === 0}
          <div class="empty-space">
            <button 
              class="empty-space-icon new-tab-button"
              onmousedown={(e) => { e.stopPropagation(); handleNewTabInSpace(spaceId); }}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleNewTabInSpace(spaceId); } }}
              title="New Tab (⌘T)"
              aria-label="New Tab"
              type="button"
            >
              <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <div class="empty-space-title">No open tabs</div>
            <div class="empty-space-subtitle">This space is empty</div>
          </div>
        {:else}
          <div class="space-grid">
            {#each tabs as tab, index (tab.id)}
              <div 
                class="grid-frame"
                class:active={tab.id === data.spaceMeta.activeTabId}
              >
                <!-- Tab title and close button bar -->
                <div class="tab-header">
                  <div class="tab-info clickable"
                       onmousedown={(e) => { if (e.button === 0) handleFrameClick(tab, index, spaceId) }}
                       onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFrameClick(tab, index, spaceId) } }}
                       tabindex="0"
                       role="button"
                       aria-label="Activate {tab.title || 'Untitled'}">
                    <div class="tab-favicon">
                      <Favicon url={tab.url} />
                    </div>
                    <div class="header-tab-title">{tab.title || 'Untitled'}</div>
                  </div>
                  <button 
                    class="close-button"
                    onmousedown={(e) => handleCloseTab(e, tab, index, spaceId)}
                    aria-label="Close {tab.title || 'Untitled'}"
                    type="button"
                  >×</button>
                </div>
                
                <!-- Screenshot layer - always visible, no replacement -->
                <div 
                  class="frame-screenshot clickable" 
                  onmousedown={(e) => { if (e.button === 0) handleFrameClick(tab, index, spaceId) }}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFrameClick(tab, index, spaceId) } }}
                  onwheel={(e) => handleFrameWheel(e, tab, index)}
                  tabindex="0"
                  role="button"
                  aria-label="Activate {tab.title || 'Untitled'}"
                >
                  {#if tab.screenshot}
                    <AttachmentImage src={tab.screenshot} alt="Tab preview" />
                  {:else}
                    <div class="no-screenshot">
                      <div class="favicon-container">
                        <Favicon url={tab.url} />
                      </div>
                      <div class="tab-title">{tab.title || 'Untitled'}</div>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .grid-view {
    position: fixed;
    top: 35px;
    left: calc(var(--left-pinned-width, 0px) + var(--tab-sidebar-width, 0px));
    width: calc(100% - var(--space-taken, 0px) - 2px);
    height: calc(100vh - 35px);
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(8px);
    overflow: hidden;
    z-index: 1000;
    opacity: 0;
    animation: grid-fade-in 0.3s cubic-bezier(0, 1, 0.3, 1) forwards;
  }

  .spaces-scroll-container {
    display: flex;
    width: 100%;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -ms-overflow-style: none;
    will-change: scroll-position;
    scroll-behavior: smooth;
  }

  .spaces-scroll-container.scrolling .space-page {
    pointer-events: none;
  }

  .spaces-scroll-container.scrolling .grid-frame {
    pointer-events: none;
  }

  .spaces-scroll-container::-webkit-scrollbar {
    display: none;
  }

  .space-page {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
    scroll-snap-align: start;
    padding: 40px;
    box-sizing: border-box;
    transform: translateZ(0);
  }

  .space-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    grid-auto-rows: 180px;
    gap: 24px;
    place-content: center;
    place-items: center;
    width: 100%;
    height: 100%;
    will-change: auto;
    contain: layout style;
  }

  .empty-space {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: 16px;
    opacity: 0.6;
  }

  .empty-space-icon {
    width: 48px;
    height: 48px;
    color: rgba(255, 255, 255, 0.4);
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
  }

  .empty-space-icon:hover {
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.08);
    transform: scale(1.05);
  }

  .empty-space-icon:active {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.12);
    transform: scale(0.98);
  }

  .empty-space-title {
    font-size: 18px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  .empty-space-subtitle {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.45);
  }

  .spaces-switcher {
    position: absolute;
    top: 10px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: rgba(10, 10, 10, 0.36);
    backdrop-filter: blur(4px);
    border: none;
    border-radius: 9999px;
    max-width: calc(100% - 32px);
    overflow-x: auto;
  }

  .space-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: none;
    color: rgba(255, 255, 255, 0.72);
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .space-chip:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }

  .space-chip.active {
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 1);
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .space-chip.highlighted:not(.active) {
    position: relative;
  }

  .space-chip.highlighted:not(.active)::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 50%;
    transform: translateX(-50%);
    width: 28px;
    height: 2px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 1px;
    opacity: 0;
    animation: underline-fade-in 0.3s ease-out 0.15s forwards;
  }

  @keyframes underline-fade-in {
    from {
      opacity: 0;
      transform: translateX(-50%) scaleX(0.5);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) scaleX(1);
    }
  }

  .space-chip.active .space-color-dot {
    opacity: 0.9;
    filter: saturate(1.1) brightness(1.0) contrast(1.1);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.3) inset;
  }

  .space-chip.highlighted:not(.active) .space-color-dot {
    opacity: 0.75;
    filter: saturate(0.9) brightness(0.85) contrast(1.0);
  }

  .space-color-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--space-color, #6b7280);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35) inset;
    opacity: 0.6;
    filter: saturate(0.85) brightness(0.75) contrast(0.95);
  }

  .space-chip:not(.active) .space-color-dot {
    opacity: 0.55;
  }

  @keyframes grid-fade-in {
    from {
      opacity: 0;
      /* transform: scale(1.3); */
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .grid-frame {
    width: 320px;
    height: 180px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.3),
      0 2px 8px rgba(0, 0, 0, 0.2);
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
  }

  .grid-frame::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    pointer-events: none;
    z-index: 1;
    transition: opacity 0.2s ease-out;
  }

  .grid-frame:hover::before {
    opacity: 0;
  }

  .grid-frame.active::before {
    opacity: 0;
  }

  /* Frame scaler styles commented out - no longer used since replacement is disabled
  .frame-scaler {
    width: 1200px;
    height: 800px;
    transform: scale(0.267) translate(-50%, -50%);
    transform-origin: top left;
    position: absolute;
    top: 50%;
    left: 50%;
    transition: opacity 0.1s ease-out;
  }

  .frame-scaler :global(.frame) {
    width: 100%;
    height: 100%;
  }
  */

  .frame-screenshot {
    width: 100%;
    height: calc(100% - 28px);
    background: #1a1a1a;
    border-radius: 0 0 8px 8px;
    overflow: hidden;
    position: relative;
    transition: opacity 0.1s ease-out;
  }

  .frame-screenshot.clickable {
    cursor: pointer;
    transition: opacity 0.2s ease-out, background-color 0.2s ease-out;
  }

  .frame-screenshot.clickable:hover {
    opacity: 0.8;
  }

  .frame-screenshot.clickable:focus {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }

  .frame-screenshot :global(.attachment-image) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
  }

  .no-screenshot {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #1a1a1a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    gap: 12px;
    padding: 20px;
  }

  .favicon-container {
    width: 32px;
    height: 32px;
    opacity: 0.7;
  }

  .tab-title {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    line-height: 1.3;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .tab-header {
    height: 28px;
    background: rgba(40, 40, 40, 0.95);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 8px;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .tab-info {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .tab-info.clickable {
    cursor: pointer;
  }

  .tab-favicon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    opacity: 0.5;
    transition: opacity 0.2s ease-out;
  }

  .header-tab-title {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
    font-weight: 500;
    overflow: hidden;
    flex: 1;
    min-width: 0;
    text-align: left;
    white-space: nowrap;
    mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
    -webkit-mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
    transition: color 0.2s ease-out;
  }

  .close-button {
    background: none;
    border: none;
    color: #717171;
    cursor: pointer;
    font-size: 16px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 0;
    height: 18px;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.2s ease, background-color 0.2s ease, width 0.2s ease, padding 0.2s ease;
    flex-shrink: 0;
    overflow: hidden;
  }

  .grid-frame:hover .tab-favicon,
  .grid-frame.active .tab-favicon {
    opacity: 1;
  }

  .grid-frame:hover .header-tab-title,
  .grid-frame.active .header-tab-title {
    color: rgba(255, 255, 255, 0.9);
  }

  .grid-frame:hover .close-button {
    opacity: 1;
    width: 18px;
    padding: 0 3px;
  }

  .close-button:hover {
    background-color: #2a2a2a;
    color: #fff;
  }

  .close-button:active {
    background-color: #3a3a3a;
  }
</style>

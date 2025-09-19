<script>
  import { onMount } from 'svelte'
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
    spaceTaken = 0
  } = $props()

  // Get tabs from current space
  let tabs = $derived(((data.spaceMeta.activeSpace && data.spaces[data.spaceMeta.activeSpace]?.tabs.filter(tab => !tab.pinned)) || []))
  
  
  // Grid container reference
  let gridContainer

  // Handle clicking on frame screenshot
  function handleFrameClick(tab, index) {
    // If this tab is already active, only toggle view mode (same logic as toggleViewMode)
    if (tab.id === data.spaceMeta.activeTabId) {
      // Use the same toggle logic as the view mode button
      onViewModeChange()
    } else {
      // Activate the tab and toggle view mode
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

  // Handle close button click
  function handleCloseTab(event, tab, index) {
    event.preventDefault()
    event.stopPropagation()
    onTabClose(tab, event)
  }
</script>

<div 
  class="grid-view"
  bind:this={gridContainer}
  style="--left-pinned-width: {leftPinnedWidth}px; --right-pinned-width: {rightPinnedWidth}px; --tab-sidebar-width: {tabSidebarWidth}px; --sidebar-width: {rightSidebarWidth}px; --space-taken: {spaceTaken}px;"
>
  {#each tabs as tab, index (tab.id)}
    <div 
      class="grid-frame"
      class:active={tab.id === data.spaceMeta.activeTabId}
    >
      <!-- Tab title and close button bar -->
      <div class="tab-header">
        <div class="tab-info clickable"
             onmousedown={(e) => { if (e.button === 0) handleFrameClick(tab, index) }}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFrameClick(tab, index) } }}
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
          onmousedown={(e) => handleCloseTab(e, tab, index)}
          aria-label="Close {tab.title || 'Untitled'}"
          type="button"
        >×</button>
      </div>
      
      <!-- Screenshot layer - always visible, no replacement -->
      <div 
        class="frame-screenshot clickable" 
        onmousedown={(e) => { if (e.button === 0) handleFrameClick(tab, index) }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleFrameClick(tab, index) } }}
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
      
      <!-- Frame layer - commented out to disable replacement -->
      <!-- 
      {#if isFullyOpen}
        <div class="frame-scaler" style="opacity: {frameOpacity};">
          <Frame 
            tabId={tab.id} 
            {controlledFrameSupported} 
            headerPartOfMain={false}
            isScrolling={false}
            onFrameFocus={() => onFrameFocus(tab.id)} 
            onFrameBlur={onFrameBlur} 
            userMods={getEnabledUserMods(tab)} 
            statusLightsEnabled={false}
          />
        </div>
      {/if}
      -->
    </div>
  {/each}
</div>

<style>
  .grid-view {
    position: fixed;
    top: 35px;
    left: calc(var(--left-pinned-width, 0px) + var(--tab-sidebar-width, 0px));
    width: calc(100% - var(--space-taken, 0px));
    height: calc(100vh - 35px);
    background: rgba(0, 0, 0, 0.95);
    backdrop-filter: blur(8px);
    overflow: hidden;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    grid-auto-rows: 180px;
    gap: 24px;
    padding: 40px;
    place-content: center;
    place-items: center;
    z-index: 2000;
    opacity: 0;
    animation: grid-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes grid-fade-in {
    from {
      opacity: 0;
      transform: scale(1.3);
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
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease-out;
    opacity: 0.7;
  }

  .grid-frame:hover {
    opacity: 1;
  }

  .grid-frame.active {
    opacity: 1;
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

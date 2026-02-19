<script>
  import AttachmentImage from './AttachmentImage.svelte'
  import Favicon from './Favicon.svelte'
  import data from '../data.svelte.js'
  import { colors as spaceColors } from '../lib/utils.js'

  let {
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

  let activeView = $state(localStorage.getItem('gridActiveView') || 'tabs')
  let spaceScope = $state(localStorage.getItem('gridSpaceScope') || 'current')

  function setActiveView(view) {
    activeView = view
    localStorage.setItem('gridActiveView', view)
  }

  function toggleSpaceScope() {
    spaceScope = spaceScope === 'current' ? 'all' : 'current'
    localStorage.setItem('gridSpaceScope', spaceScope)
  }

  // Track collapsed spaces
  let collapsedSpaces = $state(new Set(JSON.parse(localStorage.getItem('gridCollapsedSpaces') || '[]')))

  function toggleSpaceCollapsed(spaceId) {
    const next = new Set(collapsedSpaces)
    if (next.has(spaceId)) next.delete(spaceId)
    else next.add(spaceId)
    collapsedSpaces = next
    localStorage.setItem('gridCollapsedSpaces', JSON.stringify([...next]))
  }

  let gridContextMenuId = $state(null)
  let gridContextMenuPosition = $state({ x: 0, y: 0 })
  let gridOverlayPosition = $state({ x: 0, y: 0 })
  let gridColorPickerSpaceId = $state(null)
  let gridRenamingSpaceId = $state(null)
  let gridRenameInputValue = $state('')
  let gridRenameInputRef = $state(null)

  function handleSpaceHeaderContext(e, id) {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    gridContextMenuPosition = { x: rect.left, y: rect.bottom + 4 }
    gridContextMenuId = gridContextMenuId === id ? null : id
  }

  function handleGridContextAction(action, spaceId) {
    const headerEl = document.querySelector(`.space-group-header[data-space-id="${spaceId}"]`)
    if (action === 'rename') {
      gridRenamingSpaceId = spaceId
      gridRenameInputValue = data.spaces[spaceId].name
      if (headerEl) {
        const rect = headerEl.getBoundingClientRect()
        gridOverlayPosition = { x: rect.left + 22, y: rect.bottom + 4 }
      }
      requestAnimationFrame(() => {
        gridRenameInputRef?.focus()
        gridRenameInputRef?.select()
      })
    } else if (action === 'change-color') {
      gridColorPickerSpaceId = spaceId
      if (headerEl) {
        const rect = headerEl.getBoundingClientRect()
        gridOverlayPosition = { x: rect.left + 22, y: rect.bottom + 4 }
      }
    } else {
      console.log(`Action: ${action} for space: ${data.spaces[spaceId]?.name}`)
    }
    gridContextMenuId = null
  }

  function commitGridRename() {
    if (gridRenamingSpaceId && gridRenameInputValue.trim()) {
      data.updateSpace(gridRenamingSpaceId, { name: gridRenameInputValue.trim() })
    }
    gridRenamingSpaceId = null
  }

  function handleGridRenameKeydown(e) {
    if (e.key === 'Enter') commitGridRename()
    else if (e.key === 'Escape') gridRenamingSpaceId = null
  }

  function pickGridColor(spaceId, color) {
    data.updateSpace(spaceId, { color })
    gridColorPickerSpaceId = null
  }

  // Pre-compute derived data once to avoid reactive re-renders in templates
  let spaceOrder = $derived(data.spaceMeta.spaceOrder || [])
  let activeSpaceId = $derived(data.spaceMeta.activeSpace)
  let activeTabId = $derived(data.spaceMeta.activeTabId)
  let highlightedSpaceId = $state(data.spaceMeta.activeSpace)
  
  // Pre-compute spaces data with filtered tabs to avoid reactive lookups in template
  let spacesData = $derived.by(() => {
    const result = {}
    for (const id of spaceOrder) {
      const space = data.spaces[id]
      if (space) {
        const tabs = space.tabs || []
        result[id] = {
          ...space,
          leftPinnedTabs: tabs.filter(tab => tab.pinned === true || tab.pinned === 'left'),
          rightPinnedTabs: tabs.filter(tab => tab.pinned === 'right'),
          unpinnedTabs: tabs.filter(tab => !tab.pinned)
        }
      }
    }
    return result
  })

  let displayedSpaceOrder = $derived(
    spaceScope === 'current' ? spaceOrder.filter(id => id === activeSpaceId) : spaceOrder
  )
  
  function switchSpace(id) {
    if (id && id !== activeSpaceId) {
      onSpaceSwitch(id)
      highlightedSpaceId = id
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
        onViewModeChange({fromTileMode: true})
      }, 150)
    } else {
      // Already in the right space, just create tab
      data.newTab(spaceId, { shouldFocus: true })
      onViewModeChange({fromTileMode: true})
    }
  }
  
  let gridContainer

  // Handle clicking on frame screenshot
  function handleFrameClick(tab, index, spaceId) {
    // If clicking a tab from a different space, switch to that space first
    if (spaceId !== activeSpaceId) {
      switchSpace(spaceId)
      // Wait for space switch, then activate tab and close view
      setTimeout(() => {
        onTabActivate(tab, index)
        onViewModeChange({fromTileMode: true})
      }, 100)
    } else if (tab.id === data.spaceMeta.activeTabId) {
      // Same space, same tab - just toggle view mode
      onViewModeChange({fromTileMode: true})
    } else {
      // Same space, different tab - activate tab and toggle view mode
      onTabActivate(tab, index)
      onViewModeChange({fromTileMode: true})
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
        onViewModeChange({fromTileMode: true})
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
      target.classList.contains('spaces-vertical-container') ||
      target.classList.contains('space-section') ||
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
      target.closest('.new-tab-button') ||
      target.closest('.grid-top-bar') ||
      target.closest('.grid-empty-view') ||
      target.closest('.grid-context-menu') ||
      target.closest('.grid-menu-scrim') ||
      target.closest('.grid-color-picker-dropdown') ||
      target.closest('.grid-rename-overlay')
    )
    
    if (gridContextMenuId || gridColorPickerSpaceId || gridRenamingSpaceId) return
    
    if (isBackgroundClick && !isInteractiveElement) {
      // If we're viewing a different space than the active one, switch to it
      if (highlightedSpaceId && highlightedSpaceId !== activeSpaceId) {
        switchSpace(highlightedSpaceId)
        onViewModeChange({fromTileMode: true})
      } else {
        // If we're already in the active space, just close the view
        onViewModeChange({fromTileMode: true})
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
  <div class="grid-top-bar">
    <div class="grid-view-tabs" role="tablist">
      <button class="grid-view-tab" class:active={activeView === 'tabs'} onmousedown={() => setActiveView('tabs')} role="tab">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="grid-tab-icon"><path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h3.879a2.5 2.5 0 0 1 1.767.732l.732.732A1.5 1.5 0 0 0 11.94 4H15.5A2.5 2.5 0 0 1 18 6.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 2 14.5v-10Z"/></svg>
        Tabs
      </button>
      <button class="grid-view-tab" class:active={activeView === 'history'} onmousedown={() => setActiveView('history')} role="tab">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="grid-tab-icon"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clip-rule="evenodd"/></svg>
        History
      </button>
      <button class="grid-view-tab" class:active={activeView === 'resources'} onmousedown={() => setActiveView('resources')} role="tab">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="grid-tab-icon"><path d="M10 1a6 6 0 0 0-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 0 0 .75.75h2.5a.75.75 0 0 0 .75-.75v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0 0 10 1ZM8.863 17.414a.75.75 0 0 0-.226 1.483 9.066 9.066 0 0 0 2.726 0 .75.75 0 0 0-.226-1.483 7.563 7.563 0 0 1-2.274 0Z"/></svg>
        Resources
      </button>
    </div>
    <button class="grid-scope-toggle" class:active={spaceScope === 'all'} onmousedown={toggleSpaceScope}>
      <span class="grid-scope-track"><span class="grid-scope-thumb"></span></span>
      <span class="grid-scope-label">All Spaces</span>
    </button>
    {#if spaceScope === 'all'}
      <button class="grid-collapse-btn" onmousedown={() => { collapsedSpaces = new Set(spaceOrder); localStorage.setItem('gridCollapsedSpaces', JSON.stringify(spaceOrder)) }} title="Collapse All" aria-label="Collapse All" type="button">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8Zm3.646-2.146a.5.5 0 0 1 0-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 1 1-.708.708L8.5 3.707V6.5a.5.5 0 0 1-1 0V3.707L5.354 5.854a.5.5 0 0 1-.708 0Zm0 4.292a.5.5 0 0 0 0 .708l3 3a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 12.293V9.5a.5.5 0 0 0-1 0v2.793l-2.146-2.147a.5.5 0 0 0-.708 0Z" clip-rule="evenodd"/></svg>
      </button>
      <button class="grid-collapse-btn" onmousedown={() => { collapsedSpaces = new Set(); localStorage.setItem('gridCollapsedSpaces', '[]') }} title="Expand All" aria-label="Expand All" type="button">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8ZM4.646 2.146a.5.5 0 0 1 .708 0L8 4.793l2.646-2.647a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 0-.708Zm0 11.708a.5.5 0 0 0 .708 0L8 11.207l2.646 2.647a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0l-3 3a.5.5 0 0 0 0 .708Z" clip-rule="evenodd"/></svg>
      </button>
    {/if}
  </div>

  <div class="spaces-switcher" class:hidden={spaceScope === 'current'} role="navigation" aria-label="Spaces">
    {#each spaceOrder as id (id)}
      {@const space = spacesData[id]}
      {#if space}
        <div class="space-chip-wrapper">
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
              {#if space.glyph}
                <span class="space-chip-glyph" style="color: {space.color || '#5b5b5b'}" aria-hidden="true">{@html space.glyph}</span>
              {:else}
                <span class="space-color-dot" aria-hidden="true"></span>
              {/if}
              <span class="space-name">{space.name || 'Space'}</span>
            </button>
        </div>
      {/if}
    {/each}
  </div>
  {#if gridContextMenuId}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="grid-menu-scrim" onmousedown={(e) => { e.stopPropagation(); gridContextMenuId = null; }}></div>
    <div class="grid-context-menu" style="top: {gridContextMenuPosition.y}px; left: {gridContextMenuPosition.x}px;">
      <button class="grid-context-item" onmouseup={() => handleGridContextAction('rename', gridContextMenuId)} role="menuitem">Rename</button>
      <button class="grid-context-item" onmouseup={() => handleGridContextAction('change-icon', gridContextMenuId)} role="menuitem">Change icon</button>
      <button class="grid-context-item" onmouseup={() => handleGridContextAction('change-color', gridContextMenuId)} role="menuitem">Change color</button>
      <button class="grid-context-item" onmouseup={() => handleGridContextAction('container', gridContextMenuId)} role="menuitem">Container</button>
      <button class="grid-context-item delete" onmouseup={() => handleGridContextAction('delete', gridContextMenuId)} role="menuitem">Delete</button>
    </div>
  {/if}
  {#if gridRenamingSpaceId}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="grid-menu-scrim" onmousedown={(e) => { e.stopPropagation(); commitGridRename(); }}></div>
    <div class="grid-rename-overlay" style="top: {gridOverlayPosition.y}px; left: {gridOverlayPosition.x}px;">
      <input class="grid-rename-input"
             bind:this={gridRenameInputRef}
             bind:value={gridRenameInputValue}
             onblur={commitGridRename}
             onkeydown={handleGridRenameKeydown} />
    </div>
  {/if}
  {#if gridColorPickerSpaceId}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="grid-menu-scrim" onmousedown={(e) => { e.stopPropagation(); gridColorPickerSpaceId = null; }}></div>
    <div class="grid-color-picker-dropdown" style="top: {gridOverlayPosition.y}px; left: {gridOverlayPosition.x}px;">
      {#each spaceColors as c}
        <button class="grid-color-swatch" 
                class:active={data.spaces[gridColorPickerSpaceId]?.color === c.color}
                style="background-color: {c.color}"
                onmousedown={(e) => { e.stopPropagation(); pickGridColor(gridColorPickerSpaceId, c.color); }}
                aria-label={c.name}></button>
      {/each}
    </div>
  {/if}
  
  {#if activeView === 'tabs'}
    <div class="spaces-vertical-container">
      <div class="spaces-content">
      {#each displayedSpaceOrder as spaceId (spaceId)}
        {@const space = spacesData[spaceId]}
        {@const tabs = space?.unpinnedTabs || []}
        {@const leftPins = space?.leftPinnedTabs || []}
        {@const rightPins = space?.rightPinnedTabs || []}
        {@const isCollapsed = collapsedSpaces.has(spaceId)}
        {@const tabCount = leftPins.length + tabs.length + rightPins.length}
        <div class="space-section">
          {#if spaceScope === 'all'}
            <button
              class="space-group-header"
              class:collapsed={isCollapsed}
              class:active={spaceId === activeSpaceId}
              style="--space-color: {space?.color || '#5b5b5b'}"
              data-space-id={spaceId}
              onmousedown={(e) => { if (e.button === 0) toggleSpaceCollapsed(spaceId) }}
              oncontextmenu={(e) => handleSpaceHeaderContext(e, spaceId)}
              type="button"
            >
              <span class="space-group-left">
                <svg class="collapse-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/></svg>
                {#if space?.glyph}
                  <span class="space-group-glyph" style="color: {space.color || '#5b5b5b'}" aria-hidden="true">{@html space.glyph}</span>
                {:else}
                  <span class="space-group-dot" aria-hidden="true"></span>
                {/if}
                <span class="space-group-name">{space?.name || 'Space'}</span>
                <span class="space-group-count">{tabCount}</span>
              </span>
              <span class="space-group-line"></span>
            </button>
          {/if}
          {#if !isCollapsed || spaceScope === 'current'}
            {#if tabCount === 0}
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
                {#each leftPins as tab, index (tab.id)}
                  <div 
                    class="grid-frame pinned-frame"
                    class:active={tab.id === activeTabId}
                    class:pinned-last={index === leftPins.length - 1 && (tabs.length > 0 || rightPins.length > 0)}
                  >
                    <div class="tab-header">
                      <div class="tab-info clickable"
                           onmousedown={(e) => { if (e.button === 0) handleFrameClick(tab, index, spaceId) }}
                           tabindex="0" role="button" aria-label="Activate {tab.title || 'Untitled'}">
                        <svg class="pin-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3a1 1 0 0 0-1.414 0L9.586 8l-.793-.793a1 1 0 0 0-1.414 0l-.586.586a1 1 0 0 0 0 1.414L9.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L11 13.414l2.793 2.793a1 1 0 0 0 1.414 0l.586-.586a1 1 0 0 0 0-1.414L15 13.414 20.414 8A1 1 0 0 0 20.414 6.586L16 3Z"/></svg>
                        <div class="tab-favicon"><Favicon url={tab.url} /></div>
                        <div class="header-tab-title">{tab.title || 'Untitled'}</div>
                      </div>
                    </div>
                    <div 
                      class="frame-screenshot clickable" 
                      onmousedown={(e) => { if (e.button === 0) handleFrameClick(tab, index, spaceId) }}
                      onwheel={(e) => handleFrameWheel(e, tab, index)}
                      tabindex="0" role="button" aria-label="Activate {tab.title || 'Untitled'}"
                    >
                      {#if tab.screenshot}
                        <AttachmentImage src={tab.screenshot} digest={tab._attachments?.screenshot?.digest} alt="Tab preview" lazy={true} fadeIn={true} />
                      {:else}
                        <div class="no-screenshot">
                          <div class="favicon-container"><Favicon url={tab.url} /></div>
                          <div class="tab-title">{tab.title || 'Untitled'}</div>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
                {#each tabs as tab, index (tab.id)}
                  {@const isSpaceActiveTab = spaceId !== activeSpaceId && tab.id === data.spaces[spaceId]?.activeTabsOrder?.[0]}
                  <div 
                    class="grid-frame"
                    class:active={tab.id === activeTabId}
                    class:space-active-tab={isSpaceActiveTab}
                    class:pinned-last={index === tabs.length - 1 && rightPins.length > 0}
                  >
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
                        <AttachmentImage src={tab.screenshot} digest={tab._attachments?.screenshot?.digest} alt="Tab preview" lazy={true} fadeIn={true} />
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
                {#each rightPins as tab, index (tab.id)}
                  <div 
                    class="grid-frame pinned-frame"
                    class:active={tab.id === activeTabId}
                  >
                    <div class="tab-header">
                      <div class="tab-info clickable"
                           onmousedown={(e) => { if (e.button === 0) handleFrameClick(tab, index, spaceId) }}
                           tabindex="0" role="button" aria-label="Activate {tab.title || 'Untitled'}">
                        <svg class="pin-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3a1 1 0 0 0-1.414 0L9.586 8l-.793-.793a1 1 0 0 0-1.414 0l-.586.586a1 1 0 0 0 0 1.414L9.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L11 13.414l2.793 2.793a1 1 0 0 0 1.414 0l.586-.586a1 1 0 0 0 0-1.414L15 13.414 20.414 8A1 1 0 0 0 20.414 6.586L16 3Z"/></svg>
                        <div class="tab-favicon"><Favicon url={tab.url} /></div>
                        <div class="header-tab-title">{tab.title || 'Untitled'}</div>
                      </div>
                    </div>
                    <div 
                      class="frame-screenshot clickable" 
                      onmousedown={(e) => { if (e.button === 0) handleFrameClick(tab, index, spaceId) }}
                      onwheel={(e) => handleFrameWheel(e, tab, index)}
                      tabindex="0" role="button" aria-label="Activate {tab.title || 'Untitled'}"
                    >
                      {#if tab.screenshot}
                        <AttachmentImage src={tab.screenshot} digest={tab._attachments?.screenshot?.digest} alt="Tab preview" lazy={true} fadeIn={true} />
                      {:else}
                        <div class="no-screenshot">
                          <div class="favicon-container"><Favicon url={tab.url} /></div>
                          <div class="tab-title">{tab.title || 'Untitled'}</div>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
                <button 
                  class="grid-new-tab new-tab-button"
                  onmousedown={(e) => { e.stopPropagation(); handleNewTabInSpace(spaceId); }}
                  title="New Tab (⌘T)"
                  aria-label="New Tab"
                  type="button"
                >
                  <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>
            {/if}
          {/if}
        </div>
      {/each}
      </div>
    </div>
  {:else if activeView === 'history'}
    <div class="grid-empty-view">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="grid-empty-icon">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <div class="grid-empty-title">History</div>
      <div class="grid-empty-subtitle">Browsing history will appear here</div>
    </div>
  {:else if activeView === 'resources'}
    <div class="grid-empty-view">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="grid-empty-icon">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
      <div class="grid-empty-title">Resources</div>
      <div class="grid-empty-subtitle">Saved resources will appear here</div>
    </div>
  {/if}
</div>

<style>
  .grid-view {
    position: fixed;
    top: 35px;
    left: 0;
    right: 0;
    width: 100%;
    height: calc(100vh - 35px);
    background: rgb(0, 0, 0);
    overflow: hidden;
    z-index: 10000;
    opacity: 0;
    animation: grid-fade-in 0.3s cubic-bezier(0, 1, 0.3, 1) forwards;
  }

  .grid-top-bar {
    position: absolute;
    top: 10px;
    left: 16px;
    display: flex;
    align-items: center;
    gap: 2px;
    z-index: 10;
    background: rgba(30, 30, 30, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
    border-radius: 9999px;
    padding: 4px;
  }

  .grid-view-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .grid-view-tab {
    padding: 6px 14px;
    border-radius: 9999px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .grid-tab-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .grid-view-tab:hover {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.06);
  }

  .grid-view-tab.active {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  .grid-scope-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    background: transparent;
    border-radius: 9999px;
    border: none;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
    margin-left: 2px;
    cursor: pointer;
  }

  .grid-scope-track {
    width: 28px;
    height: 16px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.15);
    position: relative;
    transition: background 150ms ease;
  }

  .grid-scope-toggle.active .grid-scope-track {
    background: rgba(255, 255, 255, 0.4);
  }

  .grid-scope-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 150ms ease, background 150ms ease;
  }

  .grid-scope-toggle.active .grid-scope-thumb {
    transform: translateX(12px);
    background: white;
  }

  .grid-scope-label {
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    transition: color 150ms ease;
  }

  .grid-scope-toggle.active .grid-scope-label {
    color: rgba(255, 255, 255, 0.9);
  }

  .grid-collapse-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 9999px;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 150ms ease, color 150ms ease;
  }

  .grid-collapse-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .grid-collapse-btn svg {
    width: 14px;
    height: 14px;
  }

  .grid-empty-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: 12px;
    opacity: 0.5;
  }

  .grid-empty-icon {
    width: 48px;
    height: 48px;
    color: rgba(255, 255, 255, 0.4);
  }

  .grid-empty-title {
    font-size: 18px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  .grid-empty-subtitle {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.45);
  }

  .spaces-switcher.hidden {
    display: none;
  }

  .spaces-vertical-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
  }

  .spaces-content {
    padding: 60px 40px 40px 40px;
    margin: auto 0;
  }

  .spaces-vertical-container::-webkit-scrollbar {
    width: 6px;
  }

  .spaces-vertical-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .spaces-vertical-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }

  .space-section {
    margin-bottom: 40px;
  }

  .space-section:last-child {
    margin-bottom: 0;
  }

  .space-group-header {
    display: flex;
    align-items: center;
    gap: 0;
    width: 100%;
    padding: 0;
    margin-bottom: 10px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  }

  .space-group-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding: 5px 14px 5px 0;
    border-radius: 8px;
    transition: background 150ms ease;
  }

  .space-group-header:hover .space-group-left {
    background: rgba(255, 255, 255, 0.05);
  }

  .space-group-header:hover .space-group-name {
    color: rgba(255, 255, 255, 0.9);
  }

  .space-group-header:hover .collapse-chevron {
    color: rgba(255, 255, 255, 0.6);
  }

  .space-group-line {
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
  }

  .space-group-header:hover .space-group-line {
    background: rgba(255, 255, 255, 0.1);
  }

  .collapse-chevron {
    width: 14px;
    height: 14px;
    color: rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
    transition: transform 150ms ease, color 150ms ease;
  }

  .space-group-header.collapsed .collapse-chevron {
    transform: rotate(-90deg);
  }

  .space-group-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--space-color, #6b7280);
    flex-shrink: 0;
  }

  .space-group-glyph {
    font-size: 12px;
    line-height: 1;
    width: 13px;
    height: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  :global(.space-group-glyph svg) {
    width: 100%;
    height: 100%;
  }

  .space-group-name {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.01em;
    text-align: left;
    transition: color 150ms ease;
  }

  .space-group-header.active .space-group-name {
    color: rgba(255, 255, 255, 0.65);
  }

  .space-group-count {
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.25);
  }

  .space-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 320px);
    grid-auto-rows: 180px;
    gap: 20px;
    width: 100%;
    padding-left: 22px;
    will-change: auto;
    contain: layout style;
  }

  .pinned-frame {
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .pinned-last {
    margin-right: 16px;
  }

  .pin-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.5);
    transform: rotate(-45deg);
  }

  .grid-new-tab {
    width: 100%;
    height: 180px;
    border-radius: 8px;
    border: 1px dashed rgba(255, 255, 255, 0.12);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
    color: rgba(255, 255, 255, 0.3);
  }

  .grid-new-tab svg {
    width: 32px;
    height: 32px;
  }

  .grid-new-tab:hover {
    border-color: rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.6);
  }

  .grid-new-tab:active {
    background: rgba(255, 255, 255, 0.08);
  }

  .empty-space {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 180px;
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
    gap: 4px;
    padding: 4px;
    background: rgba(30, 30, 30, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
    border-radius: 9999px;
    max-width: calc(100% - 32px);
    overflow-x: auto;
    z-index: 10;
  }

  .space-chip-wrapper {
    position: relative;
  }

  .space-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 9999px;
    background: transparent;
    border: 1px solid transparent;
    color: rgba(255, 255, 255, 0.55);
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .space-chip-glyph {
    font-size: 12px;
    line-height: 1;
    width: 12px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  :global(.space-chip-glyph svg) {
    width: 100%;
    height: 100%;
  }

  .grid-rename-overlay {
    position: fixed;
    z-index: 10001;
  }

  .grid-rename-input {
    color: white;
    font-size: 13px;
    font-weight: 500;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 6px 10px;
    outline: none;
    min-width: 120px;
    backdrop-filter: blur(12px);
  }

  .space-chip:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
  }

  .space-chip.active {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-weight: 600;
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
    width: 9px;
    height: 9px;
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
    }
    to {
      opacity: 1;
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
    contain: layout style paint;
    will-change: transform;
    border: 1px solid transparent;
  }

  .grid-frame.active {
    border-color: rgba(255, 255, 255, 0.25);
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
    will-change: opacity;
  }

  .frame-screenshot.clickable {
    cursor: pointer;
    transition: opacity 0.15s ease-out;
  }

  .frame-screenshot.clickable:hover {
    opacity: 0.85;
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
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 8px;
    border-radius: 8px 8px 0 0;
    border: 1px solid transparent;
    border-bottom: none;
    transition: background 0.2s ease-out, border-color 0.2s ease-out;
  }

  .grid-frame.active .tab-header {
    background: rgb(255 255 255 / 14%);
    border: 1px solid hsl(0deg 0% 100% / 4%);
    border-bottom: none;
  }

  .grid-frame.space-active-tab .tab-header {
    background: rgb(255 255 255 / 8%);
    border: 1px solid hsl(0deg 0% 100% / 5.5%);
    border-bottom: none;
  }

  .grid-frame.space-active-tab .header-tab-title {
    color: #e5e5e5;
    text-shadow: 0 0 0.3px currentColor;
  }

  .grid-frame.space-active-tab .tab-favicon {
    opacity: 0.87;
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

  .grid-menu-scrim {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 9999;
  }

  .grid-context-menu {
    position: fixed;
    display: flex;
    flex-direction: column;
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 4px 0;
    width: max-content;
    z-index: 10001;
    backdrop-filter: blur(12px);
    transform: translateY(-4px);
    animation: grid-menu-in 150ms ease forwards;
  }

  @keyframes grid-menu-in {
    to { transform: translateY(0); opacity: 1; }
  }

  .grid-context-item {
    padding: 6px 14px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    -webkit-font-smoothing: subpixel-antialiased;
    text-rendering: optimizeLegibility;
    cursor: pointer;
    transition: background 150ms ease;
    background: transparent;
    border: none;
    text-align: left;
  }

  .grid-context-item:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.95);
  }

  .grid-context-item:active {
    background: rgba(255, 255, 255, 0.15);
  }

  .grid-context-item.delete {
    color: #ff6b6b;
  }

  .grid-context-item.delete:hover {
    color: #ff4444;
    background: rgba(255, 107, 107, 0.1);
  }

  .grid-color-picker-dropdown {
    position: fixed;
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

  .grid-color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: transform 150ms ease;
  }

  .grid-color-swatch:hover {
    transform: scale(1.2);
  }

  .grid-color-swatch.active {
    border-color: white;
  }
</style>

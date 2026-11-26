<script>
  import { getTabTitle } from '../lib/tab-title.js'
  import { onDestroy, tick } from 'svelte'
  import AttachmentImage from './AttachmentImage.svelte'
  import Favicon from './Favicon.svelte'
  import data from '../data.svelte.js'
  import { createTabGroupPreview, getFaviconWindow, getDefaultGroupTabIndex } from '../lib/tab-group-preview.svelte.js'

  let { group, activeTabId, spaceActiveTabId = null, defaultTabId = null, onActivate, onClose, onWheel } = $props()
  let keyboardIndex = $state(null)
  let previewActiveTabId
  const preview = createTabGroupPreview()
  const scrubbing = $derived(preview.state.groupId === group.id)
  const defaultIndex = $derived(getDefaultGroupTabIndex(group.tabs, [activeTabId, spaceActiveTabId, defaultTabId]))
  const position = $derived(Math.min(group.tabs.length - 1, scrubbing ? preview.state.progress * (group.tabs.length - 1) : keyboardIndex ?? defaultIndex))
  const selectedIndex = $derived(Math.round(position))
  const selectedTab = $derived(group.tabs[selectedIndex])
  const shownTab = $derived(data.getDisplayedTab?.(selectedTab.id) || selectedTab)
  const stackTitle = $derived((!scrubbing && keyboardIndex === null ? group.name : null) || getTabTitle(shownTab))
  const faviconSlots = $derived(group.metadata?.emoji || group.metadata?.favicon ? 2 : 3)
  const progress = $derived(position / Math.max(1, group.tabs.length - 1))
  const faviconWindow = $derived(getFaviconWindow(group.tabs.length, progress, faviconSlots))
  const firstVisible = $derived(Math.max(0, selectedIndex - 1))
  const visibleTabs = $derived(group.tabs.slice(firstVisible, selectedIndex + 2))

  onDestroy(preview.destroy)

  $effect(() => {
    if (activeTabId !== previewActiveTabId) {
      previewActiveTabId = activeTabId
      keyboardIndex = null
      preview.dismiss()
    }
  })

  function scrub (event) {
    if (event.pointerType === 'touch') {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width) {
      preview.move(group.id, (event.clientX - rect.left) / rect.width, group.tabs.length)
    }
  }

  function resetPreview () {
    preview.leave(group.id)
  }

  function dismissOverlays () {
    preview.dismiss()
    keyboardIndex = null
  }

  async function handleStackKey (event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return
    }
    event.preventDefault()
    const currentIndex = selectedIndex
    preview.dismiss()
    keyboardIndex = event.key === 'Home' ? 0 : event.key === 'End' ? group.tabs.length - 1
      : Math.max(0, Math.min(group.tabs.length - 1, currentIndex + (event.key === 'ArrowRight' ? 1 : -1)))
    if (event.currentTarget.classList.contains('carousel-card')) {
      const groupElement = event.currentTarget.closest('.grid-tab-group')
      await tick()
      groupElement?.querySelector('.carousel-card.current')?.focus({ preventScroll: true })
    }
  }
</script>

<svelte:window ondarc-dismiss-overlays={dismissOverlays} />

<div class="grid-tab-group" class:scrubbing onpointerenter={scrub} onpointermove={scrub} onpointerleave={resetPreview} role="group" aria-label="{group.title}, {group.tabs.length} tabs">
  <div class="stack-header" class:active={selectedTab.id === activeTabId} class:space-active-tab={selectedTab.id === spaceActiveTabId}>
    <button class="stack-title" onmousedown={(event) => { if (event.button === 0) { onActivate(selectedTab, selectedIndex) } }} onclick={(event) => { if (event.detail === 0) { onActivate(selectedTab, selectedIndex) } }} onkeydown={handleStackKey} aria-label="Activate {getTabTitle(shownTab)}. Use left and right arrows to browse tabs.">
      {#if group.metadata?.emoji}
        <span class="custom-group-icon" aria-hidden="true">{group.metadata.emoji}</span>
      {:else if group.metadata?.favicon}
        <span class="custom-group-icon" aria-hidden="true"><Favicon tab={{ favicon: group.metadata.favicon, title: group.title }} showButton={false} /></span>
      {/if}
      <span class="group-favicons" class:scrolled={progress > 0} class:at-end={progress === 1} aria-hidden="true" style:width="{faviconWindow.visible * 18}px">
        <span class="group-favicon-track" style:transform="translateX({-faviconWindow.offset * 18}px)">
          {#each group.tabs.slice(faviconWindow.start, faviconWindow.end) as tab (tab.id)}
            <span class="preview-favicon" class:selected={selectedTab.id === tab.id}><Favicon tab={data.getDisplayedTab?.(tab.id) || tab} showButton={false} /></span>
          {/each}
        </span>
      </span>
      <span class="title-text">{stackTitle}</span>
    </button>
    <span class="stack-count">{selectedIndex + 1} / {group.tabs.length}</span>
    <button class="close-tab" onmousedown={(event) => { if (event.button === 0) { onClose(event, selectedTab, selectedIndex) } }} onclick={(event) => { if (event.detail === 0) { onClose(event, selectedTab, selectedIndex) } }} aria-label="Close {getTabTitle(selectedTab)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
    </button>
  </div>
  <div class="stack-carousel">
    {#each visibleTabs as tab, offset (tab.id)}
      {@const index = firstVisible + offset}
      {@const shown = data.getDisplayedTab?.(tab.id) || tab}
      <button class="carousel-card" class:active={tab.id === activeTabId} class:current={index === selectedIndex} data-tab-id={tab.id}
        style:--offset={index - position} tabindex={index === selectedIndex ? 0 : -1}
        onmousedown={(event) => { if (event.button === 0) { onActivate(tab, index) } }}
        onclick={(event) => { if (event.detail === 0) { onActivate(tab, index) } }}
        onkeydown={handleStackKey} onwheel={(event) => onWheel(event, tab, index)} aria-label="Activate {getTabTitle(shown)}">
        {#if shown.screenshot}
          <AttachmentImage src={shown.screenshot} digest={shown._attachments?.screenshot?.digest} alt="" lazy={true} fadeIn={false} />
        {:else}
          <span class="empty-preview"><span class="empty-favicon"><Favicon tab={shown} showButton={false} /></span><span class="empty-title">{getTabTitle(shown)}</span></span>
        {/if}
      </button>
    {/each}
    <span class="scrub-track" aria-hidden="true"><span style:width="{100 / group.tabs.length}%" style:left="{progress * (100 - 100 / group.tabs.length)}%"></span></span>
  </div>
</div>

<style>
  .grid-tab-group { position: relative; min-width: 0; height: 180px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid #a8c7fa; outline-offset: -2px; }
  .stack-header { display: flex; align-items: center; gap: 6px; height: 28px; padding: 3px 8px; border: 1px solid rgb(255 255 255 / 10%); border-radius: 8px; }
  .stack-header.active { background: rgb(255 255 255 / 14%); border-color: rgb(255 255 255 / 25%); }
  .stack-header.space-active-tab { background: rgb(255 255 255 / 8%); }
  .stack-title { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: none; text-align: left; }
  .custom-group-icon { display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex-shrink: 0; font-size: 14px; line-height: 1; }
  .custom-group-icon :global(.favicon-wrapper) { width: 14px; height: 14px; }
  .group-favicons { display: block; height: 16px; flex-shrink: 0; overflow: hidden; mask: linear-gradient(to right, black 70%, transparent); }
  .group-favicons.scrolled { mask: linear-gradient(to right, transparent, black 15%, black 85%, transparent); }
  .group-favicons.at-end { mask: linear-gradient(to right, transparent, black 15%); }
  .group-favicon-track { display: flex; width: max-content; height: 100%; }
  .preview-favicon { display: flex; align-items: center; justify-content: center; width: 18px; height: 16px; flex-shrink: 0; opacity: .5; }
  .preview-favicon :global(.favicon-wrapper) { width: 14px; height: 14px; }
  .preview-favicon.selected { opacity: 1; }
  .title-text { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 11px; font-weight: 500; color: rgb(255 255 255 / 55%); mask: linear-gradient(to right, black 85%, transparent); }
  .grid-tab-group:hover .title-text, .active .title-text { color: rgb(255 255 255 / 90%); }
  .stack-count { flex-shrink: 0; color: rgb(255 255 255 / 40%); font-size: 10px; font-variant-numeric: tabular-nums; }
  .close-tab { display: grid; place-items: center; width: 18px; height: 18px; padding: 2px; flex-shrink: 0; border: 0; border-radius: 4px; color: #717171; background: transparent; opacity: 0; transition: opacity 150ms ease; }
  .close-tab svg { width: 14px; height: 14px; }
  .close-tab:hover { background: #2a2a2a; color: #fff; }
  .grid-tab-group:hover .close-tab, .grid-tab-group:focus-within .close-tab { opacity: 1; }
  .stack-carousel { position: relative; height: calc(100% - 32px); margin-top: 4px; overflow: hidden; }
  .carousel-card { position: absolute; top: 0; left: 50%; width: calc((100% - 16px) / 1.3); height: 100%; padding: 0; border: 1px solid rgb(255 255 255 / 10%); border-radius: 8px; background: #070707; overflow: hidden; transform: translateX(calc(-50% + var(--offset) * (100% + 8px))); }
  .carousel-card.active { border-color: rgb(255 255 255 / 25%); }
  .carousel-card :global(.attachment-image) { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .empty-preview { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; gap: 12px; padding: 20px; box-sizing: border-box; }
  .empty-favicon { display: block; width: 32px; height: 32px; opacity: .7; }
  .empty-title { max-width: 100%; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; font-size: 12px; line-height: 1.3; color: rgb(255 255 255 / 60%); }
  .scrub-track { position: absolute; pointer-events: none; height: 2px; inset: auto 10px 6px; background: #ffffff1a; border-radius: 2px; opacity: 0; transition: opacity 150ms; }
  .scrub-track span { position: absolute; top: 0; height: 100%; background: #ffffffa6; border-radius: inherit; }
  .scrubbing .scrub-track, .grid-tab-group:focus-within .scrub-track { opacity: 1; }
  @media (hover: none) { .close-tab { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .scrub-track, .close-tab { transition: none; } }
</style>

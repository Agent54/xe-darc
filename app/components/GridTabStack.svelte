<script>
  import { onDestroy } from 'svelte'
  import AttachmentImage from './AttachmentImage.svelte'
  import Favicon from './Favicon.svelte'
  import { createTabGroupPreview, getFaviconWindow, getDefaultGroupTabIndex } from '../lib/tab-group-preview.svelte.js'

  let { group, activeTabId, spaceActiveTabId = null, defaultTabId = null, onActivate, onClose, onWheel } = $props()
  let dialog = $state(null)
  let expanded = $state(false)
  let keyboardIndex = $state(null)
  let visiblePreviews = $state(new Set())
  let previewObserver
  const preview = createTabGroupPreview()
  const scrubbing = $derived(preview.state.groupId === group.id)
  const defaultIndex = $derived(getDefaultGroupTabIndex(group.tabs, [activeTabId, spaceActiveTabId, defaultTabId]))
  const selectedIndex = $derived(Math.min(scrubbing ? preview.state.tabIndex : keyboardIndex ?? defaultIndex, group.tabs.length - 1))
  const selectedTab = $derived(group.tabs[selectedIndex])
  const faviconWindow = $derived(getFaviconWindow(group.tabs.length, scrubbing ? preview.state.progress : selectedIndex / Math.max(1, group.tabs.length - 1)))

  onDestroy(() => {
    preview.destroy()
    previewObserver?.disconnect()
  })

  // Mount screenshot and favicon components only after visible cards have laid out.
  function observePreview(node) {
    previewObserver ??= new IntersectionObserver(entries => {
      if (!dialog?.open) return
      const next = new Set(visiblePreviews)
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        next.add(entry.target.dataset.tabId)
        previewObserver.unobserve(entry.target)
      }
      if (next.size !== visiblePreviews.size) visiblePreviews = next
    }, { root: node.parentElement, rootMargin: '120px' })
    previewObserver.observe(node)
    return { destroy: () => previewObserver.unobserve(node) }
  }

  function scrub(event) {
    if (event.pointerType === 'touch') return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width) preview.move(group.id, (event.clientX - rect.left) / rect.width, group.tabs.length)
  }

  function resetPreview() {
    preview.leave(group.id)
    keyboardIndex = null
  }

  function openGroup() {
    if (!dialog?.isConnected || dialog.open) return
    resetPreview()
    dialog.showModal()
    expanded = true
  }

  function handleExpandMouseDown(event) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    openGroup()
  }

  function handleStackKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const currentIndex = selectedIndex
    preview.leave(group.id)
    keyboardIndex = event.key === 'Home' ? 0 : event.key === 'End' ? group.tabs.length - 1
      : Math.max(0, Math.min(group.tabs.length - 1, currentIndex + (event.key === 'ArrowRight' ? 1 : -1)))
  }

  function closeOutside(event) {
    if (event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
  }
</script>

{#snippet thumbnail(tab, lazy = true)}
  {#if tab.screenshot}
    <AttachmentImage src={tab.screenshot} digest={tab._attachments?.screenshot?.digest} alt="" {lazy} fadeIn={false} />
  {:else}
    <span class="empty-preview">
      <span class="empty-favicon"><Favicon {tab} showButton={false} /></span>
      <span class="empty-title">{tab.title || tab.url || 'Untitled'}</span>
    </span>
  {/if}
{/snippet}

<div class="grid-tab-group" class:scrubbing onpointerenter={scrub} onpointermove={scrub} onpointerleave={resetPreview} role="group" aria-label="{group.title}, {group.tabs.length} tabs">
  <div class="stack-layer stack-back" aria-hidden="true"></div>
  <div class="stack-layer stack-middle" aria-hidden="true"></div>
  <div class="stack-front" class:active={selectedTab.id === activeTabId} class:space-active-tab={selectedTab.id === spaceActiveTabId}>
    <div class="stack-header">
      <button class="stack-title" onclick={() => onActivate(selectedTab, selectedIndex)} onkeydown={handleStackKey} aria-label="Activate {selectedTab.title || 'Untitled'}. Use left and right arrows to browse tabs.">
        <span class="group-favicons" aria-hidden="true" style:width="{faviconWindow.visible * 18}px">
          <span class="group-favicon-track" style:transform="translateX({-faviconWindow.offset * 18}px)">
            {#each group.tabs.slice(faviconWindow.start, faviconWindow.end) as tab (tab.id)}
              <span class="preview-favicon" class:selected={scrubbing && selectedTab.id === tab.id}><Favicon {tab} showButton={false} /></span>
            {/each}
          </span>
        </span>
        <span class="title-text">{selectedTab.title || 'Untitled'}</span>
      </button>
      <span class="stack-count">{group.tabs.length}</span>
      <button class="icon-button expand-button" onmousedown={handleExpandMouseDown} onclick={(event) => { if (event.detail === 0) openGroup() }} aria-label="Expand {group.title}" aria-haspopup="dialog" aria-expanded={expanded} title="Expand group">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6m0-6-7 7M10 20H4v-6m0 6 7-7" /></svg>
      </button>
    </div>
    <button class="stack-preview" onclick={() => onActivate(selectedTab, selectedIndex)} onkeydown={handleStackKey} onwheel={(event) => onWheel(event, selectedTab, selectedIndex)} aria-label="Activate {selectedTab.title || 'Untitled'}">
      {#key selectedTab.id}
        <span class="preview-image">{@render thumbnail(selectedTab)}</span>
      {/key}
      <span class="scrub-position" aria-hidden="true">{selectedIndex + 1} / {group.tabs.length}</span>
      <span class="scrub-track" aria-hidden="true"><span style:width="{100 / group.tabs.length}%" style:left="{selectedIndex * 100 / group.tabs.length}%"></span></span>
    </button>
  </div>
</div>

<!-- The native dialog provides focus containment, Escape, and focus restoration. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialog} class="group-dialog" aria-label={group.title} style:--columns={Math.min(3, group.tabs.length)}
  onclose={() => { expanded = false; visiblePreviews = new Set() }} oncancel={(event) => event.stopPropagation()}
  onkeydown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
  onmousedown={(event) => { event.stopPropagation(); if (event.button === 0) closeOutside(event) }}>
  <header class="dialog-header">
    <div class="dialog-heading"><h2>{group.title}</h2><span>{group.tabs.length} tabs</span></div>
    <button class="icon-button dismiss-button" onclick={() => dialog.close()} aria-label="Close group" title="Close group">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
    </button>
  </header>
  <div class="dialog-grid">
    {#if expanded}
    {#each group.tabs as tab, index (tab.id)}
      <div class="dialog-card" class:active={tab.id === activeTabId} class:space-active-tab={tab.id === spaceActiveTabId} data-tab-id={tab.id} use:observePreview>
        <div class="card-header">
          <button class="stack-title" onclick={() => onActivate(tab, index)} aria-label="Activate {tab.title || 'Untitled'}">
            <span class="tab-favicon">{#if visiblePreviews.has(tab.id)}<Favicon {tab} showButton={false} />{/if}</span>
            <span class="title-text">{tab.title || 'Untitled'}</span>
          </button>
          <button class="icon-button close-tab" onclick={(event) => onClose(event, tab, index)} aria-label="Close {tab.title || 'Untitled'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
          </button>
        </div>
        <button class="card-preview" onclick={() => onActivate(tab, index)} onwheel={(event) => onWheel(event, tab, index)} aria-label="Activate {tab.title || 'Untitled'}">
          {#if visiblePreviews.has(tab.id)}{@render thumbnail(tab, false)}{/if}
        </button>
      </div>
    {/each}
    {/if}
  </div>
</dialog>

<style>
  .grid-tab-group {
    position: relative;
    min-width: 0;
    height: 180px;
    margin-bottom: 12px;
    isolation: isolate;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  }

  .stack-layer {
    position: absolute;
    inset: 28px 0 0;
    border: 1px solid rgb(255 255 255 / 4%);
    border-radius: 8px;
    background: #0c0c0c;
    pointer-events: none;
    transition: transform 240ms cubic-bezier(.2, .8, .2, 1);
  }
  .stack-back { transform: translateY(12px) scaleX(.92); z-index: -2; background: #070707; }
  .stack-middle { transform: translateY(6px) scaleX(.96); z-index: -1; }
  .grid-tab-group:hover .stack-back { transform: translateY(14px) scaleX(.92); }
  .grid-tab-group:hover .stack-middle { transform: translateY(7px) scaleX(.96); }
  /* Match GridView's ordinary cards: only the displayed active tab is outlined. */
  .stack-front, .dialog-card { overflow: hidden; border: 1px solid transparent; border-radius: 8px; background: transparent; box-shadow: 0 8px 24px rgb(0 0 0 / 30%), 0 2px 8px rgb(0 0 0 / 20%); }
  .stack-front { height: 100%; display: flex; flex-direction: column; }
  .active { border-color: rgb(255 255 255 / 25%); }
  .stack-header, .card-header { display: flex; align-items: center; gap: 6px; height: 28px; box-sizing: border-box; padding: 3px 8px; flex-shrink: 0; background: transparent; border: 1px solid transparent; border-bottom: none; border-radius: 8px 8px 0 0; transition: background 200ms ease-out, border-color 200ms ease-out; }
  .active .stack-header, .active .card-header { background: rgb(255 255 255 / 14%); border-color: rgb(255 255 255 / 4%); }
  .space-active-tab .stack-header, .space-active-tab .card-header { background: rgb(255 255 255 / 8%); border-color: rgb(255 255 255 / 5.5%); }
  button { font: inherit; color: inherit; cursor: pointer; }
  .stack-title { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; background: none; text-align: left; }
  .tab-favicon { display: flex; width: 14px; height: 14px; flex-shrink: 0; opacity: .5; transition: opacity 200ms ease-out; }
  .group-favicons { display: block; height: 16px; flex-shrink: 0; overflow: hidden; }
  .group-favicon-track { display: flex; width: max-content; height: 100%; }
  .preview-favicon { display: flex; align-items: center; justify-content: center; width: 18px; height: 16px; flex-shrink: 0; opacity: .5; transition: opacity 200ms ease-out; }
  .preview-favicon :global(.favicon-wrapper) { width: 14px; height: 14px; }
  .space-active-tab .preview-favicon { opacity: .87; }
  .grid-tab-group:hover .preview-favicon { opacity: .85; }
  .active .preview-favicon, .preview-favicon.selected { opacity: 1; }
  .title-text { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 11px; font-weight: 500; color: rgb(255 255 255 / 45%); mask: linear-gradient(to right, black 0%, black 85%, transparent 100%); transition: color 200ms ease-out; }
  .space-active-tab .title-text { color: #e5e5e5; text-shadow: 0 0 .3px currentColor; }
  .space-active-tab .tab-favicon { opacity: .87; }
  .grid-tab-group:hover .title-text, .dialog-card:hover .title-text, .active .title-text { color: rgb(255 255 255 / 90%); }
  .dialog-card:hover .tab-favicon, .active .tab-favicon { opacity: 1; }
  .stack-count { color: rgb(255 255 255 / 40%); background: rgb(255 255 255 / 4%); border-radius: 4px; min-width: 18px; text-align: center; font-size: 10px; line-height: 16px; font-variant-numeric: tabular-nums; padding: 0 4px; transition: color 200ms ease-out; }
  .grid-tab-group:hover .stack-count { color: rgb(255 255 255 / 50%); }
  .icon-button { display: grid; place-items: center; width: 18px; height: 18px; padding: 2px; flex-shrink: 0; border: 0; border-radius: 4px; color: #717171; background: transparent; transition: background 150ms ease, color 150ms ease; }
  .icon-button svg { width: 14px; height: 14px; }
  .icon-button:hover { background: #2a2a2a; color: #fff; }
  .expand-button { transition: background 150ms ease, color 150ms ease, opacity 150ms ease; }
  .expand-button { opacity: 0; pointer-events: none; }
  .grid-tab-group:hover .expand-button,
  .grid-tab-group:focus-within .expand-button { opacity: 1; pointer-events: auto; }
  button:focus-visible { outline: 2px solid #a8c7fa; outline-offset: -2px; border-radius: 5px; }
  .stack-preview, .card-preview { display: block; position: relative; width: 100%; min-height: 0; padding: 0; border: 0; background: #1a1a1a; border-radius: 0 0 8px 8px; overflow: hidden; transition: opacity 150ms ease-out; }
  .stack-preview:hover, .card-preview:hover { opacity: .85; }
  .stack-preview { flex: 1; }
  .preview-image { display: block; width: 100%; height: 100%; animation: preview-in 130ms ease-out; }
  .stack-preview :global(.attachment-image), .card-preview :global(.attachment-image) { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .empty-preview { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; gap: 12px; padding: 20px; box-sizing: border-box; background: #070707; border: 1px solid rgb(58 58 58 / 10%); }
  .empty-favicon { display: block; width: 32px; height: 32px; opacity: .7; }
  .empty-title { max-width: 100%; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; font-size: 12px; line-height: 1.3; color: rgb(255 255 255 / 60%); }
  .scrub-position { position: absolute; bottom: 12px; right: 10px; padding: 3px 6px; border-radius: 5px; background: #171717cc; color: #e5e5e5; font-size: 10px; font-variant-numeric: tabular-nums; opacity: 0; transition: opacity 150ms; }
  .scrub-track { position: absolute; height: 2px; inset: auto 10px 6px; background: #ffffff1a; border-radius: 2px; opacity: 0; transition: opacity 150ms; }
  .scrub-track span { position: absolute; top: 0; height: 100%; background: #ffffffa6; border-radius: inherit; transition: left 100ms ease-out; }
  .scrubbing .scrub-position, .scrubbing .scrub-track, .grid-tab-group:focus-within .scrub-position, .grid-tab-group:focus-within .scrub-track { opacity: 1; }

  .group-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(calc(var(--columns) * 300px + 80px), calc(100vw - 48px));
    max-width: none;
    max-height: calc(100dvh - 96px);
    padding: 0;
    box-sizing: border-box;
    border: 1px solid rgb(255 255 255 / 6%);
    border-radius: 16px;
    background: #0c0c0cf5;
    color: #e5e5e5;
    box-shadow: 0 32px 100px #0009, 0 0 0 1px #0006;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  }
  .group-dialog[open] { display: flex; flex-direction: column; animation: dialog-in 180ms cubic-bezier(.2, .8, .2, 1); }
  .group-dialog::backdrop { background: rgb(0 0 0 / 12%); backdrop-filter: blur(1px); }
  .dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 24px 18px; flex-shrink: 0; }
  .dialog-heading { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  h2 { margin: 0; font-size: 17px; line-height: 1.4; font-weight: 600; letter-spacing: -.025em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dialog-heading > span { font-size: 12px; color: #999; white-space: nowrap; }
  .dismiss-button { width: 28px; height: 28px; background: #ffffff0a; border-radius: 50%; }
  .dialog-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); grid-auto-rows: max-content; align-content: start; min-height: 0; gap: 18px; overflow-y: auto; overscroll-behavior: contain; padding: 2px 24px 24px; scrollbar-width: thin; scrollbar-color: #ffffff26 transparent; }
  .dialog-card { min-width: 0; }
  .card-preview { aspect-ratio: 2 / 1; }
  .close-tab { opacity: 0; }
  .dialog-card:hover .close-tab, .dialog-card:focus-within .close-tab { opacity: 1; }
  @keyframes preview-in { from { opacity: .65; transform: translateX(3px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes dialog-in { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
  @media (max-width: 480px) {
    .group-dialog { width: calc(100vw - 24px); max-height: calc(100dvh - 48px); border-radius: 16px; }
    .dialog-header { padding: 16px; }
    .dialog-grid { padding: 2px 16px 16px; gap: 14px; }
    .close-tab { opacity: 1; }
  }
  @media (hover: none) {
    .expand-button { opacity: 1; pointer-events: auto; }
  }
  @media (prefers-reduced-motion: reduce) {
    .stack-layer, .stack-header, .card-header, .tab-favicon, .preview-favicon, .title-text, .stack-count, .icon-button, .expand-button, .stack-preview, .card-preview, .preview-image, .scrub-position, .scrub-track, .group-dialog[open] { animation: none; transition: none; }
  }
</style>

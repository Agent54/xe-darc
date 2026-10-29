<script>
    import Favicon from './Favicon.svelte'
    import { getFaviconWindow } from '../lib/tab-group-preview.svelte.js'

    let { group, groupId, preview = null, active = false, disabled = false } = $props()
    const scrubbing = $derived(preview != null && preview.state.groupId === groupId)
    const progress = $derived(scrubbing ? preview.state.progress : 0)
    const selectedTab = $derived(scrubbing ? group.tabs[Math.min(preview.state.tabIndex, group.tabs.length - 1)] : null)
    const faviconSlots = $derived(group.metadata?.emoji || group.metadata?.favicon ? 2 : 3)
    const window = $derived(getFaviconWindow(group.tabs.length, progress, faviconSlots))
    const title = $derived(selectedTab ? selectedTab.title || selectedTab.url || 'New tab' : group.title)

    function scrub (event) {
        if (disabled || !preview) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (!rect.width) return
        preview.move(groupId, (event.clientX - rect.left) / rect.width, group.tabs.length)
    }

    $effect(() => { if (disabled) preview?.leaveStrip(groupId) })
</script>

<span class="group-preview" class:active aria-hidden="true">
    {#if group.metadata?.emoji}
        <span class="custom-icon">{group.metadata.emoji}</span>
    {:else if group.metadata?.favicon}
        <span class="custom-icon"><Favicon tab={{ favicon: group.metadata.favicon, title: group.name }} showButton={false} /></span>
    {/if}
    <span class="favicon-viewport" class:scrolled={group.tabs.length > window.visible && progress > 0} class:at-end={group.tabs.length <= window.visible || progress === 1}
          role="group" style:width="{window.visible * 18}px" onmouseenter={scrub} onmousemove={scrub} onmouseleave={() => preview?.leaveStrip(groupId)}>
        <span class="favicon-track" style:transform="translateX({-window.offset * 18}px)">
            {#each group.tabs.slice(window.start, window.end) as tab (tab.id)}
                <span class="preview-favicon" class:selected={selectedTab?.id === tab.id}><Favicon {tab} showButton={false} /></span>
            {/each}
        </span>
    </span>
    <span class="preview-title">{title}</span>
</span>

<style>
    .group-preview { display: flex; align-items: center; gap: 8px; min-width: 0; width: 100%; }
    .preview-title { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; line-height: 1.2; color: #808080; font-size: 13px; font-weight: 500; mask: linear-gradient(to right, black 0%, black 85%, transparent 100%); }
    .favicon-viewport { display: block; height: 16px; flex-shrink: 0; overflow: hidden; mask: linear-gradient(to right, black 0%, black 70%, transparent 100%); }
    .favicon-viewport.scrolled { mask: linear-gradient(to right, transparent, black 15%, black 85%, transparent); }
    .favicon-viewport.at-end { mask: none; }
    .favicon-viewport.scrolled.at-end { mask: linear-gradient(to right, transparent, black 15%); }
    .favicon-track { display: flex; width: max-content; height: 100%; }
    .preview-favicon { width: 18px; height: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; opacity: 0.5; }
    .preview-favicon :global(.favicon-wrapper), .custom-icon :global(.favicon-wrapper) { width: 14px; height: 14px; }
    .custom-icon { display: flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex-shrink: 0; font-size: 14px; line-height: 1; }
    :global(.tab-group-wrapper:hover) .preview-title { color: #ccc; }
    :global(.tab-group-wrapper:hover) .preview-favicon { opacity: 0.85; }
    .group-preview.active .preview-title { color: #e5e5e5; }
    .group-preview.active .preview-favicon { opacity: 0.87; }
    .group-preview .preview-favicon.selected { opacity: 1; }
</style>

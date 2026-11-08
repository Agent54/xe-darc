<script>
    import { onMount, untrack } from 'svelte'
    import { fade } from 'svelte/transition'
    import data from '../data.svelte.js'
    import { getTabTitle } from '../lib/tab-title.js'
    import Favicon from './Favicon.svelte'

    let { headerPartOfMain = false } = $props()
    const mountedAt = Date.now()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let now = $state(mountedAt)
    let previewUntil = $state(0)
    let hovered = $state(false)
    let focused = $state(false)
    let previousClosedTabs = null
    let previousMoves = null

    const recentClosedTabs = $derived(data.spaceMeta.closedTabs.filter(tab =>
        tab.closedAt >= mountedAt && tab.closedAt > now - 10_000 && tab.closedAt <= now
    ))
    const recentMoves = $derived((data.spaceMeta.recentTabMoves || []).filter(move =>
        move.movedAt >= mountedAt && move.movedAt > now - 10_000 && move.movedAt <= now
    ))
    const movedSections = $derived.by(() => {
        const sections = new Map()
        for (const move of recentMoves) {
            if (!sections.has(move.targetSpaceId)) sections.set(move.targetSpaceId, [])
            sections.get(move.targetSpaceId).push(move)
        }
        return [...sections].map(([spaceId, moves]) => ({ spaceId, moves }))
    })
    const visible = $derived(previewUntil > now && (recentMoves.length > 0 || recentClosedTabs.length > 0))

    function reveal() {
        now = Date.now()
        previewUntil = now + 3000
    }

    function dismiss() {
        previewUntil = 0
        hovered = false
        focused = false
    }

    // Observe fresh actions, not a history refresh or a newly mounted sidebar.
    $effect(() => {
        const closed = new Map(data.spaceMeta.closedTabs.map(tab => [tab.id, tab.closedAt]))
        const moves = new Set((data.spaceMeta.recentTabMoves || []).map(move => move.id))
        const time = Date.now()
        const freshClose = previousClosedTabs && [...closed].some(([id, closedAt]) =>
            closedAt >= mountedAt && closedAt > time - 10_000 && closedAt <= time && previousClosedTabs.get(id) !== closedAt
        )
        const freshMove = previousMoves && [...moves].some(id => !previousMoves.has(id))
        if (freshClose || freshMove) untrack(reveal)
        previousClosedTabs = closed
        previousMoves = moves
    })

    // Keep the rows usable while hovered or keyboard focused, then allow time to return.
    $effect(() => {
        if (!visible) {
            hovered = false
            focused = false
        }
    })

    $effect(() => {
        if (!visible || hovered || focused) return
        const nextExpiry = Math.min(previewUntil,
            ...recentClosedTabs.map(tab => tab.closedAt + 10_000),
            ...recentMoves.map(move => move.movedAt + 10_000))
        const timeout = setTimeout(() => { now = Date.now() }, Math.max(1, nextExpiry - Date.now()))
        return () => clearTimeout(timeout)
    })

    onMount(() => {
        window.addEventListener('darc-dismiss-overlays', dismiss)
        return () => window.removeEventListener('darc-dismiss-overlays', dismiss)
    })
</script>

<svelte:window onkeydown={event => { if (visible && event.key === 'Escape') dismiss() }} />

{#if visible}
    <section class="tab-toasts" class:window-controls-overlay={headerPartOfMain}
        aria-label="Tab notifications" aria-live="polite" aria-relevant="additions"
        onmouseenter={() => { hovered = true }}
        onmouseleave={() => { hovered = false; if (previewUntil) reveal() }}
        onfocusin={() => { focused = true }}
        onfocusout={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                focused = false
                if (previewUntil) reveal()
            }
        }}
        transition:fade={{ duration: reducedMotion ? 0 : 150 }}>
        <div class="tab-toast">
            <button class="dismiss" aria-label="Dismiss tab notifications" title="Dismiss" onclick={dismiss}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" d="m6 6 12 12M6 18 18 6" /></svg>
            </button>
            {#each movedSections as section (section.spaceId)}
                <section class="toast-section moved-section" aria-label={`Moved to ${data.spaces[section.spaceId]?.name || 'Unknown space'}`}>
                    <h2>Moved to {data.spaces[section.spaceId]?.name || 'Unknown space'}</h2>
                    {#each section.moves as move (move.id)}
                        <button class="tab-toast-item moved-tab-item" data-move-id={move.id}
                            title={move.title || getTabTitle(data.docs[move.tabs[0].id] || move.tabs[0])}
                            onclick={() => {
                                data.activateSpace(move.targetSpaceId)
                                data.activate(move.tabs[0].id)
                                dismiss()
                            }}>
                            <Favicon tab={move.tabs[0]} showButton={false} />
                            <span class="tab-text">{move.title || getTabTitle(data.docs[move.tabs[0].id] || move.tabs[0])}</span>
                            {#if move.tabs.length > 1}<span class="tab-count">{move.tabs.length} tabs</span>{/if}
                        </button>
                    {/each}
                </section>
            {/each}
            {#if recentClosedTabs.length}
                <section class="toast-section closed-section" aria-label="Recently closed tabs">
                    <h2>Recently closed tabs</h2>
                    {#each recentClosedTabs as tab (tab.id)}
                        <div class="closed-toast-row" data-tab-id={tab.id}>
                            <button class="tab-toast-item" title={`Restore ${getTabTitle(data.docs[tab.id] || tab)}`}
                                onclick={() => data.restoreClosedTab(tab.id)}>
                                <Favicon {tab} showButton={false} />
                                <span class="tab-text">{getTabTitle(data.docs[tab.id] || tab)}</span>
                            </button>
                            <button class="remove" aria-label={`Remove ${getTabTitle(data.docs[tab.id] || tab)} from recently closed tabs`}
                                onclick={() => data.removeClosedTab(tab.id)}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" d="m6 6 12 12M6 18 18 6" /></svg>
                            </button>
                        </div>
                    {/each}
                </section>
            {/if}
        </div>
    </section>
{/if}

<style>
    .tab-toasts {
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        left: calc(16px + env(safe-area-inset-left, 0px));
        z-index: 10002;
        width: 350px;
        max-width: calc(100vw - 32px - env(safe-area-inset-left, 0px));
        max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px));
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        padding: 0 0 8px;
        -webkit-app-region: no-drag;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .tab-toasts.window-controls-overlay {
        top: calc(env(titlebar-area-height, 35px) + 16px);
        max-height: calc(100dvh - env(titlebar-area-height, 35px) - 32px);
    }
    .tab-toast {
        position: relative;
        padding: 12px;
        background: rgb(0 0 0 / 95%);
        border: 1px solid rgb(255 255 255 / 8%);
        border-radius: 6px;
        backdrop-filter: blur(20px);
    }
    .toast-section + .toast-section {
        border-top: 1px solid rgb(255 255 255 / 8%);
        margin-top: 10px;
        padding-top: 10px;
    }
    h2 {
        margin: 0 22px 8px 0;
        color: rgb(255 255 255 / 75%);
        font-size: 13px;
        font-weight: 500;
        line-height: 1.3;
        overflow-wrap: anywhere;
    }
    button {
        border: 0;
        color: rgb(255 255 255 / 70%);
        background: transparent;
        font: inherit;
        cursor: pointer;
    }
    button:hover { background: rgb(255 255 255 / 7%); color: white; }
    button:focus-visible { outline: 2px solid #8ab4f8; outline-offset: -2px; }
    .tab-toast-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 6px;
        width: 100%;
        min-width: 0;
        text-align: left;
        border-radius: 4px;
        font-size: 12px;
    }
    .tab-text { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .tab-count { flex-shrink: 0; color: rgb(255 255 255 / 45%); font-size: 10px; }
    .dismiss, .remove { display: flex; align-items: center; justify-content: center; border-radius: 3px; padding: 4px; }
    .dismiss { position: absolute; top: 8px; right: 8px; }
    .closed-toast-row { display: flex; align-items: center; }
    .closed-toast-row .tab-toast-item { flex: 1; }
    .remove { flex-shrink: 0; opacity: 0; }
    .closed-toast-row:hover .remove, .closed-toast-row:focus-within .remove { opacity: 1; }
    @media (hover: none) { .remove { opacity: 1; } }
</style>

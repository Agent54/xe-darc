<script>
    import { onMount, untrack } from 'svelte'
    import { fade } from 'svelte/transition'
    import data from '../data.svelte.js'
    import { getArchivedTabItems } from '../lib/pending-tabs.js'
    import ToastCountdown from './ToastCountdown.svelte'

    let { headerPartOfMain = false, sidebarWidth = 0, tabRows, movedItems, hovercardActive, onDismiss } = $props()
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
    const recentClosedItems = $derived(getArchivedTabItems(recentClosedTabs, data.docs))
    const recentMoves = $derived(movedItems.filter(move =>
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
    const hideAt = $derived(Math.min(previewUntil, Math.max(
        ...recentClosedTabs.map(tab => tab.closedAt + 10_000),
        ...recentMoves.map(move => move.movedAt + 10_000)
    )))

    function reveal() {
        now = Date.now()
        previewUntil = now + 3000
    }

    function dismiss() {
        onDismiss()
        previewUntil = 0
        hovered = false
        focused = false
    }

    // Observe fresh actions, not a history refresh or a newly mounted sidebar.
    $effect(() => {
        const closed = new Map(data.spaceMeta.closedTabs.map(tab => [tab.id, tab.closedAt]))
        const moves = new Set(movedItems.map(move => move.id))
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
        if (!visible || hovered || focused || hovercardActive) return
        const interval = setInterval(() => { now = Date.now() }, 50)
        return () => clearInterval(interval)
    })

    $effect(() => {
        if (hovercardActive) return
        untrack(() => { if (previewUntil) reveal() })
    })

    onMount(() => {
        window.addEventListener('darc-dismiss-overlays', dismiss)
        return () => window.removeEventListener('darc-dismiss-overlays', dismiss)
    })
</script>

<svelte:window onkeydown={event => { if (visible && event.key === 'Escape') dismiss() }} />

{#if visible}
    <section class="tab-toasts" class:window-controls-overlay={headerPartOfMain}
        style:--sidebar-width={`${sidebarWidth}px`}
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
                <ToastCountdown remaining={hideAt - now} duration={3000} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" d="m6 6 12 12M6 18 18 6" /></svg>
            </button>
            {#each movedSections as section (section.spaceId)}
                <section class="toast-section moved-section" aria-label={`Moved to ${data.spaces[section.spaceId]?.name || 'Unknown space'}`}>
                    <h2>Moved to {data.spaces[section.spaceId]?.name || 'Unknown space'}</h2>
                    {@render tabRows(section.moves, false, (move) => {
                        data.activateSpace(move.targetSpaceId)
                        data.activate(move.tabs[0].id)
                        dismiss()
                    }, true)}
                </section>
            {/each}
            {#if recentClosedTabs.length}
                <section class="toast-section closed-section" aria-label="Recently closed tabs">
                    <h2>Recently closed tabs</h2>
                    {@render tabRows(recentClosedItems, false, null, true)}
                </section>
            {/if}
        </div>
    </section>
{/if}

<style>
    .tab-toasts {
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        left: calc(var(--sidebar-width) + 16px + env(safe-area-inset-left, 0px));
        z-index: 10002;
        width: 350px;
        max-width: calc(100vw - var(--sidebar-width) - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
        max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px));
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        filter: drop-shadow(0 8px 18px rgb(0 0 0 / 55%));
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
        border-radius: 12px;
        backdrop-filter: blur(20px);
    }
    .toast-section + .toast-section {
        border-top: 1px solid rgb(255 255 255 / 8%);
        margin-top: 10px;
        padding-top: 10px;
    }
    h2 {
        margin: 0 30px 8px 0;
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
    .dismiss { display: flex; align-items: center; justify-content: center; padding: 4px; }
    .dismiss { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 50%; }
</style>

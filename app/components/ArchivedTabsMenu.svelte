<script>
    import { onMount } from 'svelte'
    import { sidebarMenuCloseDelay, sidebarMenuHoldDelay } from '../lib/sidebar-menu-timing.js'

    let { label, count, pending = false, open = false, onOpenChange, onOpen = async () => {},
        disabled = false, keepOpen = false, children } = $props()
    let root = $state(null)
    let trigger = $state(null)
    let loading = $state(false)
    let error = $state('')
    let closeTimer = null
    let press = null
    let suppressClick = false
    let load = null
    let removalPoint = null
    let keyboardOpen = false

    function retain() {
        clearTimeout(closeTimer)
        closeTimer = null
    }

    function dismiss() {
        retain()
        press = null
        removalPoint = null
        onOpenChange(false)
    }

    async function show(keyboard = false) {
        if (disabled) return
        keyboardOpen = keyboard === true
        retain()
        if (open) return
        onOpenChange(true)
        if (load) return
        loading = true
        error = ''
        load = Promise.resolve().then(onOpen)
        try { await load }
        catch (failure) { error = `Could not load ${label.toLowerCase()}. ${failure.message}` }
        finally { loading = false; load = null }
    }

    function leave() {
        retain()
        if (!open) return
        closeTimer = setTimeout(() => {
            closeTimer = null
            if (press || removalPoint || keepOpen || root?.matches(':hover') ||
                (keyboardOpen && root?.contains(document.activeElement)) || root?.querySelector('.closed-tabs-content :focus-visible')) return
            dismiss()
        }, sidebarMenuCloseDelay)
    }

    $effect(() => {
        if (!open) {
            retain()
            if (press) suppressClick = true
            press = null
            removalPoint = null
        } else if (!keepOpen) leave()
    })

    function startPress(event) {
        if (event.button !== 0 || disabled) return
        press = { time: Date.now(), x: event.clientX, y: event.clientY }
        show()
    }

    onMount(() => {
        function outside(event) {
            suppressClick = false
            if (!open) return
            if (root.contains(event.target)) {
                if (event.target.closest('[data-keep-menu-open]')) {
                    removalPoint = { x: event.clientX, y: event.clientY }
                    retain()
                }
                return
            }
            if (keepOpen && event.target.closest('.tab-hovercard-sidebar, .context-menu, .context-submenu')) return
            dismiss()
        }
        function move(event) {
            if (!removalPoint || (event.clientX === removalPoint.x && event.clientY === removalPoint.y)) return
            removalPoint = null
            if (!root.contains(event.target)) leave()
        }
        function release(event) {
            if (event.button !== 0 || !press) return
            const openingPress = press
            press = null
            const moved = Math.hypot(event.clientX - openingPress.x, event.clientY - openingPress.y) > 5
            const action = event.target.closest('button[data-archive-action]')
            if (moved && action && root.contains(action) && !action.disabled) {
                suppressClick = true
                if (action.hasAttribute('data-keep-menu-open')) removalPoint = { x: event.clientX, y: event.clientY }
                action.click()
                if (!action.hasAttribute('data-keep-menu-open')) dismiss()
            } else if (Date.now() - openingPress.time >= sidebarMenuHoldDelay) {
                suppressClick = true
                dismiss()
            } else if (!root.contains(event.target)) leave()
        }
        function click(event) {
            if (suppressClick && event.detail > 0) {
                event.preventDefault()
                event.stopImmediatePropagation()
                suppressClick = false
                return
            }
            if (open && event.detail === 0 && !removalPoint && root.contains(event.target) && event.target.closest('[data-keep-menu-open]')) {
                keyboardOpen = true
                trigger?.focus({ preventScroll: true })
            }
        }
        function keydown(event) {
            if (!open || event.key !== 'Escape' || event.target.closest('.context-menu')) return
            suppressClick = true
            dismiss()
            trigger?.focus({ preventScroll: true })
        }
        window.addEventListener('mousedown', outside, true)
        window.addEventListener('mouseup', release)
        window.addEventListener('mousemove', move)
        window.addEventListener('click', click, true)
        window.addEventListener('keydown', keydown)
        return () => {
            retain()
            window.removeEventListener('mousedown', outside, true)
            window.removeEventListener('mouseup', release)
            window.removeEventListener('mousemove', move)
            window.removeEventListener('click', click, true)
            window.removeEventListener('keydown', keydown)
        }
    })
</script>

<div bind:this={root} class="closed-tabs-section" class:pending-tabs-section={pending} role="region" aria-label={label}
     onmouseenter={retain} onmouseleave={leave} onfocusin={retain}
     onfocusout={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) leave() }}
     ondblclick={(event) => event.stopPropagation()}>
    <button bind:this={trigger} class="closed-tabs-header" type="button" aria-expanded={open}
            onmousedown={startPress} onclick={(event) => { if (event.detail === 0) show(true) }}>
        <span class="closed-tabs-title">{label}</span>
        <span class="closed-tabs-count">{count}</span>
        <span class="archived-menu-arrow" onmouseenter={show} aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d={pending ? 'm6 8 4 4 4-4' : 'm6 12 4-4 4 4'} /></svg>
        </span>
    </button>
    <div class="closed-tabs-content" class:pending-tabs-content={pending} class:expanded={open} inert={!open} aria-busy={loading}>
        <div class="closed-tabs-list">
            {#if loading}<p class="menu-status" role="status">Loading…</p>{/if}
            {#if error}<p class="menu-status" role="alert">{error}</p>{/if}
            {@render children()}
            {#if !count && !loading && !error}<p class="menu-status">No {label.toLowerCase()} tabs</p>{/if}
        </div>
    </div>
</div>

<style>
    .closed-tabs-section { position: absolute; bottom: 8px; left: 9px; right: 8px; z-index: 10; pointer-events: auto; display: flex; flex-direction: column; /* width: calc(100% - 17px); */ flex-shrink: 0; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
    :global(.sidebar-box.visible) .closed-tabs-section { /* bottom: 6px; */ /* left: 17px; */ width: calc(100% - 19px); bottom: 1px; }
    :global(.sidebar-box.multi-space-mode) .closed-tabs-section:not(.pending-tabs-section) { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); width: 263px; max-width: 320px; }
    .closed-tabs-section.pending-tabs-section { position: relative; inset: auto; width: auto; margin: 4px 0 8px; z-index: 12; }
    :global(.sidebar-box.visible) .closed-tabs-section.pending-tabs-section { width: auto; bottom: auto; }
    .closed-tabs-header { display: flex; align-items: center; padding: 0 0 0 12px; cursor: pointer; border-radius: 12px; background: #000c; backdrop-filter: blur(15px); box-shadow: 0 2px 12px #0005; position: relative; z-index: 11; width: 100%; min-width: 0; height: 35px; border: 1px solid #232323; }
    .closed-tabs-header:hover { background: #ffffff1a; }
    .closed-tabs-title { color: #fff9; font: 500 11px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; flex: 1; text-align: left; min-width: 0; }
    .closed-tabs-count { color: #fff6; font: 400 10px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #ffffff1a; padding: 2px 6px; border-radius: 8px; min-width: 16px; text-align: center; }
    .archived-menu-arrow { display: grid; place-items: center; width: 30px; align-self: stretch; color: #aaa; }
    .archived-menu-arrow svg { width: 16px; height: 16px; }
    .closed-tabs-content { position: absolute; bottom: calc(100% - 8px); left: 0; right: 0; background: #000f; border: 1px solid var(--menu-border); border-radius: 13px 13px 0 0; border-bottom: none; backdrop-filter: blur(20px); box-shadow: 0 -2px 6px #0008, 0 -8px 28px #000a; opacity: 0; visibility: hidden; pointer-events: none; width: 100%; box-sizing: border-box; overflow: hidden; transition: opacity 150ms ease, visibility 150ms ease; }
    .closed-tabs-content.expanded { opacity: 1; visibility: visible; pointer-events: auto; }
    .closed-tabs-content.pending-tabs-content { top: calc(100% - 6px); bottom: auto; border: 1px solid var(--menu-border); border-radius: 0 0 13px 13px; }
    .closed-tabs-list { padding: 5px 4px 12px; display: flex; flex-direction: column; gap: 4px; max-height: min(360px, 60vh); overflow-y: auto; scrollbar-width: thin; scrollbar-color: #fff3 transparent; }
    .pending-tabs-content .closed-tabs-list { padding: 8px 4px 5px; max-height: min(360px, 45vh); }
    .menu-status { color: #aaa; font-size: 12px; margin: 8px; }
    button:focus-visible { outline: 1px solid #a3a3a3; outline-offset: -2px; }
</style>

<script>
    import data from '../data.svelte.js'
    import Tooltip from './Tooltip.svelte'
    import { tick, onMount } from 'svelte'

    let { tabId, targetUrl, onOpenInTab = null, onClose = null } = $props()
    let open = $state(false)
    let saving = $state(false)
    let error = $state('')
    let container = $state(null)
    let menu = $state(null)
    let trigger = $state(null)
    const decision = $derived(data.permissionDecision('open-tab', tabId))

    onMount(() => {
        const dismiss = () => { open = false }
        window.addEventListener('darc-controlled-frame-mousedown', dismiss)
        return () => window.removeEventListener('darc-controlled-frame-mousedown', dismiss)
    })

    async function toggle(event) {
        event.stopPropagation()
        open = !open
        if (open && event.detail === 0) {
            await tick()
            menu?.querySelector('button')?.focus()
        }
    }

    function menuKey(event) {
        if (event.key === 'Escape') {
            event.stopPropagation()
            event.preventDefault()
            open = false
            trigger?.focus()
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const buttons = Array.from(menu.querySelectorAll('button:not(:disabled)'))
            const index = buttons.indexOf(document.activeElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
        }
    }

    async function choose(value, event) {
        saving = true
        error = ''
        try {
            if (!await data.setPermissionDecision('open-tab', tabId, value)) {
                throw new Error('The opening page is no longer available.')
            }
            open = false
            if (value === 'allow') {
                onOpenInTab?.(event)
            } else if (value === 'same-tab') {
                await data.navigate(tabId, targetUrl)
                onClose?.()
            } else if (value === 'deny') {
                onClose?.()
            }
        } catch (cause) {
            error = cause.message || 'Could not save this decision.'
        } finally {
            saving = false
        }
    }
</script>

<svelte:window onmousedown={event => { if (!container?.contains(event.target)) { open = false } }}
    onkeydown={event => { if (event.key === 'Escape') { open = false } }} />

<div class="open-tab-settings" bind:this={container}>
    <Tooltip text="Link and popup settings" position="bottom">
        <button class="settings-button" bind:this={trigger} aria-label="Link and popup settings" aria-haspopup="menu" aria-expanded={open}
            onmousedown={toggle} onclick={event => { if (event.detail === 0) { toggle(event) } }}
            onkeydown={event => { if (open && event.key === 'Escape') { menuKey(event) } }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="m9.66 3.06-.58 1.5-1.6.92-1.6-.25-2.34 4.04 1.02 1.26v1.85l-1.02 1.26 2.34 4.04 1.6-.25 1.6.92.58 1.5h4.68l.58-1.5 1.6-.92 1.6.25 2.34-4.04-1.02-1.26v-1.85l1.02-1.26-2.34-4.04-1.6.25-1.6-.92-.58-1.5H9.66Z" />
                <circle cx="12" cy="11.45" r="3" />
            </svg>
        </button>
    </Tooltip>
    {#if open}
        <div class="popup-settings-menu" bind:this={menu} role="menu" tabindex="-1" aria-label="Links and popups" onkeydown={menuKey} onmousedown={event => event.stopPropagation()}>
            <p>Links and popups from the opening site</p>
            {#each [{ value: null, label: 'Open in lightbox (default)' }, { value: 'allow', label: 'Open in new tab' }, { value: 'same-tab', label: 'Navigate in the same tab' }, { value: 'deny', label: 'Deny' }] as option}
                <button role="menuitemradio" aria-checked={decision === (option.value || 'ask')} disabled={saving}
                    onmousedown={event => choose(option.value, event)} onclick={event => { if (event.detail === 0) { choose(option.value, event) } }}>{option.label}</button>
            {/each}
            {#if error}<p role="alert">{error}</p>{/if}
        </div>
    {/if}
</div>

<style>
    .open-tab-settings { position: relative; }
    .settings-button { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 4px; background: transparent; color: rgb(255 255 255 / 60%); cursor: pointer; }
    .settings-button:hover { background: rgb(255 255 255 / 15%); color: rgb(255 255 255 / 90%); }
    svg { width: 16px; height: 16px; }
    .popup-settings-menu { position: absolute; top: 30px; right: 0; z-index: 100; width: 240px; padding: 6px; border: 1px solid rgb(255 255 255 / 15%); border-radius: 8px; background: #202020; box-shadow: 0 8px 24px #0008; }
    p { margin: 4px 8px 8px; color: #aaa; font-size: 11px; }
    .popup-settings-menu button { display: block; width: 100%; padding: 8px; text-align: left; border: 0; border-radius: 4px; background: transparent; color: #ddd; font-size: 12px; cursor: pointer; }
    .popup-settings-menu button:hover, .popup-settings-menu button[aria-checked='true'] { background: rgb(255 255 255 / 10%); }
</style>

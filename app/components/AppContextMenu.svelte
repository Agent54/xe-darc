<script>
    import { tick } from 'svelte'
    import { composeActionItems } from '../lib/compose-actions.js'

    let { menu, onHide, onAction } = $props()
    let root
    let dockerTrigger
    let submenu
    let dockerOpen = $state(false)
    const items = $derived(composeActionItems(menu.app, menu.container))

    function positionMenu(node) {
        node.showPopover()
        const rect = node.getBoundingClientRect()
        node.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`
        node.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`
        node.querySelector('button')?.focus()
    }

    function positionSubmenu(node) {
        const anchor = dockerTrigger.getBoundingClientRect()
        const rect = node.getBoundingClientRect()
        const left = anchor.right + rect.width + 8 > window.innerWidth ? anchor.left - rect.width : anchor.right
        node.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`
        node.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - rect.height - 8))}px`
    }

    function dismiss(event) {
        if (!root?.contains(event.target)) {
            onHide()
        }
    }

    async function openDocker(focus = false) {
        dockerOpen = true
        if (focus) {
            await tick()
            submenu?.querySelector('button')?.focus()
        }
    }

    async function closeMenu() {
        const target = menu.target
        onHide()
        await tick()
        target?.focus()
    }

    function handleKey(event) {
        event.stopPropagation()
        if (event.key === 'Escape') {
            event.preventDefault()
            closeMenu()
        } else if (event.key === 'ArrowLeft' && dockerOpen) {
            event.preventDefault()
            dockerOpen = false
            dockerTrigger?.focus()
        } else if (event.key === 'ArrowRight' && event.target === dockerTrigger) {
            event.preventDefault()
            openDocker(true)
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const menuElement = event.target.closest('[role="menu"]')
            const buttons = [...menuElement.querySelectorAll('button')].filter(button => button.closest('[role="menu"]') === menuElement)
            const index = buttons.indexOf(document.activeElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
                (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
        } else if (event.key === 'Tab') {
            onHide()
        }
    }
</script>

<svelte:window onmousedown={dismiss} onfocusin={dismiss} onresize={onHide} />

<div
    class="app-context-menu menu-surface"
    bind:this={root}
    use:positionMenu
    popover="manual"
    role="menu"
    aria-label={`Actions for ${menu.container?.name || menu.app.name}`}
    tabindex="-1"
    onkeydown={handleKey}
    oncontextmenu={(event) => event.preventDefault()}
>
    <div class="menu-heading menu-caption">{menu.container?.name || menu.app.name}</div>
    <button
        class="menu-action menu-action-between"
        bind:this={dockerTrigger}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={dockerOpen}
        aria-controls="app-docker-submenu"
        onmouseenter={() => openDocker()}
        onmousedown={(event) => { if (event.button === 0) { openDocker() } }}
        onclick={(event) => { if (event.detail === 0) { openDocker(true) } }}
    >
        <span>Docker</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
    </button>
    {#if dockerOpen}
        <div id="app-docker-submenu" class="app-docker-submenu menu-surface" bind:this={submenu} use:positionSubmenu role="menu" aria-label="Docker" tabindex="-1">
            {#each items as item (item.id)}
                <button class="menu-action" type="button" role="menuitem" onclick={() => onAction(item.id, menu.app, menu.container)}>{item.label}</button>
            {/each}
        </div>
    {/if}
</div>

<style>
    .app-context-menu,
    .app-docker-submenu {
        position: fixed;
        inset: auto;
        width: 216px;
        max-width: calc(100vw - 16px);
        margin: 0;
        overflow: visible;
    }
    .app-docker-submenu {
        max-height: calc(100vh - 16px);
        overflow-y: auto;
    }
    .menu-heading {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>

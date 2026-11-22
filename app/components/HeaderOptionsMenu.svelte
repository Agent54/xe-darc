<script>
    import { onMount, tick } from 'svelte'

    let { label, class: className = '', hidden = false, submenu = false, primaryAction,
        forceClose = false, onOpen, onClose, icon, children } = $props()
    let root
    let trigger
    let panel
    let keyboardOpen = $state(false)
    let press = null

    onMount(() => {
        const dismiss = () => { keyboardOpen = false; press = null }
        window.addEventListener('darc-dismiss-header-options', dismiss)
        window.addEventListener('darc-dismiss-overlays', dismiss)
        return () => {
            window.removeEventListener('darc-dismiss-header-options', dismiss)
            window.removeEventListener('darc-dismiss-overlays', dismiss)
        }
    })

    function close(restoreFocus = false) {
        keyboardOpen = false
        press = null
        onClose()
        if (restoreFocus) {
            trigger?.focus()
        }
    }

    async function focusMenu() {
        onOpen()
        keyboardOpen = true
        await tick()
        actions()[0]?.focus()
    }

    function actions() {
        return [...panel.querySelectorAll('[data-menu-action], [data-header-submenu]')]
            .filter(item => item.closest('[role="menu"]') === panel && !item.disabled)
    }

    function select(event, action) {
        if (event.type === 'keydown') {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return
            }
        } else if (event.button !== 0) {
            return
        }
        if (event.type === 'mouseup' && !press) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        action()
        close()
    }

    function start(event) {
        if (event.button !== 0) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        if (primaryAction) {
            primaryAction()
            close()
        } else {
            press = true
            onOpen()
        }
    }

    function keydown(event) {
        if (event.target.closest('[role="menu"]') !== panel) {
            return
        }
        const items = actions()
        const index = items.indexOf(document.activeElement)
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            event.stopPropagation()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
                (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
            items[next]?.focus()
        } else if (event.key === 'ArrowLeft' && submenu) {
            event.preventDefault()
            event.stopPropagation()
            keyboardOpen = false
            trigger.focus()
        }
    }

    function dismissOutside(event) {
        if (!submenu && !root.contains(event.target)) {
            close()
        }
    }
</script>

<svelte:window onmousedown={dismissOutside} onmouseup={() => press = null}
    onkeydown={(event) => {
        if (!submenu && event.key === 'Escape' && !forceClose &&
            (root.matches(':hover') || root.contains(document.activeElement))) {
            event.preventDefault()
            event.stopPropagation()
            close(true)
        }
    }} />

<div bind:this={root} class="header-options-menu {className}" class:submenu class:hidden
    onmouseenter={onOpen} onkeydowncapture={keydown} role="presentation">
    <button bind:this={trigger} class="header-options-trigger" class:menu-action={submenu}
        type="button" title={label} aria-label={label} aria-haspopup="menu"
        role={submenu ? 'menuitem' : undefined} data-header-submenu={submenu || undefined}
        onmousedown={start}
        onkeydown={(event) => {
            if (event.key === 'ArrowDown' || (submenu && ['Enter', ' ', 'ArrowRight'].includes(event.key))) {
                event.preventDefault()
                event.stopPropagation()
                focusMenu()
            } else if (event.key === 'Enter' || event.key === ' ') {
                select(event, primaryAction)
            }
        }}>
        {@render icon()}
        {#if submenu}<span>{label}</span><span aria-hidden="true">›</span>{/if}
    </button>
    <div bind:this={panel} class="header-options-panel hover-menu menu-surface"
        class:menu-force-close={forceClose} class:keyboard-open={keyboardOpen}
        role="menu" aria-label={label}>
        {@render children(select)}
    </div>
</div>

<style>
    .header-options-menu.hidden { display: none; }
    .header-options-trigger {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
    }
    .submenu { position: relative; }
    .submenu > .header-options-trigger {
        justify-content: flex-start;
        gap: 10px;
        padding: 8px 10px;
    }
    .submenu > .header-options-trigger > span:first-of-type { flex: 1; }
    .header-options-panel {
        position: absolute;
        top: 17px;
        right: 0;
        width: 224px;
        z-index: 10010;
    }
    .submenu > .header-options-panel {
        top: 0;
        right: 100%;
    }
    .header-options-menu:hover > .header-options-panel,
    .header-options-panel.keyboard-open {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transition: opacity 0.25s ease, visibility 0.25s ease;
    }
    .header-options-panel :global(.menu-item) {
        padding: 8px 10px;
        font: var(--menu-font);
        color: var(--menu-color);
    }
    .header-options-panel.keyboard-open {
        transition: none;
    }
</style>

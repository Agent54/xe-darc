<script>
    import { getContext, setContext, onMount, tick } from 'svelte'
    import { sidebarMenuHoldDelay } from '../lib/sidebar-menu-timing.js'

    let { label, class: className = '', hidden = false, submenu = false, side = false, icon, children } = $props()
    let root
    let trigger
    let panel
    let open = $state(false)
    let press = null
    const parentMenu = getContext('app-toolbar-menu')
    const openingPress = () => press ?? parentMenu?.openingPress()
    setContext('app-toolbar-menu', { openingPress })

    function close(restoreFocus = false) {
        open = false
        press = null
        if (restoreFocus) {
            trigger?.focus()
        }
    }

    async function show(focus = false) {
        open = true
        await tick()
        if (!open || !panel) {
            return
        }
        if (!panel.matches(':popover-open')) {
            panel.showPopover()
        }
        const anchor = trigger.getBoundingClientRect()
        const rect = panel.getBoundingClientRect()
        const left = submenu || side ? anchor.left - rect.width : anchor.right - rect.width
        const top = submenu || side ? anchor.top : anchor.bottom + 4
        panel.style.left = `${Math.max(8, Math.min(left, innerWidth - rect.width - 8))}px`
        panel.style.top = `${Math.max(8, Math.min(top, innerHeight - rect.height - 8))}px`
        if (focus) {
            actions()[0]?.focus()
        }
    }

    function actions() {
        return [...panel.querySelectorAll('[data-menu-action], [data-submenu-trigger]')]
            .filter(item => item.closest('[role="menu"]') === panel && !item.disabled)
    }

    function start(event) {
        if (event.button !== 0) {
            return
        }
        event.preventDefault()
        event.stopPropagation()
        if (open && !submenu) {
            close()
            return
        }
        press = { time: Date.now(), x: event.clientX, y: event.clientY }
        show()
    }

    function select(event, action) {
        if (event.type === 'keydown') {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return
            }
        } else if (event.button !== 0) {
            return
        }
        if (event.type === 'mouseup') {
            const opening = openingPress()
            if (!opening || Math.hypot(event.clientX - opening.x, event.clientY - opening.y) <= 5) {
                return
            }
        }
        event.preventDefault()
        event.stopPropagation()
        action()
        window.dispatchEvent(new Event('darc-dismiss-toolbar-menus'))
    }

    function keydown(event) {
        if (!open || event.target.closest('[role="menu"]') !== panel) {
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
            close(true)
        }
    }

    onMount(() => {
        function down(event) {
            if (!open) {
                return
            }
            if (!root.contains(event.target)) {
                close()
                return
            }
        }
        function up(event) {
            if (event.button !== 0 || !press) {
                return
            }
            const opening = press
            press = null
            if (Date.now() - opening.time >= sidebarMenuHoldDelay) {
                close()
            }
        }
        function escape(event) {
            if (!open) {
                return
            }
            if (event.key === 'Escape') {
                event.preventDefault()
                event.stopImmediatePropagation()
                window.dispatchEvent(new Event('darc-dismiss-toolbar-menus'))
                trigger?.focus()
            } else if (event.key === 'Tab') {
                close()
            }
        }
        const dismiss = () => close()
        window.addEventListener('mousedown', down, true)
        window.addEventListener('mouseup', up)
        window.addEventListener('keydown', escape, true)
        window.addEventListener('resize', dismiss)
        window.addEventListener('darc-dismiss-overlays', dismiss)
        window.addEventListener('darc-dismiss-toolbar-menus', dismiss)
        return () => {
            window.removeEventListener('mousedown', down, true)
            window.removeEventListener('mouseup', up)
            window.removeEventListener('keydown', escape, true)
            window.removeEventListener('resize', dismiss)
            window.removeEventListener('darc-dismiss-overlays', dismiss)
            window.removeEventListener('darc-dismiss-toolbar-menus', dismiss)
        }
    })
</script>

<div bind:this={root} class="app-toolbar-menu" class:submenu class:open class:hidden
    onkeydowncapture={keydown} role="presentation">
    <button bind:this={trigger} type="button" class={className} title={label} aria-label={label}
        aria-haspopup="menu" aria-expanded={open} data-submenu-trigger={submenu || undefined}
        role={submenu ? 'menuitem' : undefined}
        onmousedown={start}
        onmouseenter={() => { if (submenu) { show() } }}
        oncontextmenu={(event) => { event.preventDefault(); event.stopPropagation(); show(true) }}
        onkeydown={(event) => {
            if (['Enter', ' ', 'ArrowDown'].includes(event.key) || (submenu && event.key === 'ArrowRight')) {
                event.preventDefault(); event.stopPropagation(); show(true)
            }
        }}>
        {@render icon()}
        {#if submenu}<span>{label}</span><span aria-hidden="true">›</span>{/if}
    </button>
    {#if open}
        <div bind:this={panel} popover="manual" class="app-toolbar-menu-panel menu-surface" role="menu" aria-label={label}>
            {@render children(select)}
        </div>
    {/if}
</div>

<style>
    .app-toolbar-menu { display: contents; }
    .app-toolbar-menu.hidden { display: none; }
    .submenu { display: block; }
    .app-toolbar-menu-panel {
        --menu-active-background: var(--menu-hover-background);
        --menu-active-hover-background: var(--menu-hover-background);
        --menu-active-color: var(--menu-color);
        position: fixed;
        inset: auto;
        margin: 0;
        width: 224px;
        max-width: calc(100vw - 16px);
        max-height: calc(100vh - 16px);
        overflow: auto;
    }

    .app-toolbar-menu-panel :global(.menu-item) {
        padding: 8px 10px;
        color: var(--menu-color);
        font: var(--menu-font);
        letter-spacing: -0.008em;
    }

    .app-toolbar-menu-panel :global(.checkmark) {
        color: var(--menu-color);
        font-size: 12px;
        font-weight: 600;
    }

    .app-toolbar-menu-panel :global(.settings-menu-version) {
        font-size: 10px;
    }
</style>

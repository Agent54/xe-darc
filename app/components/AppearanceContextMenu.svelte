<script>
    import { sidebarMenuHoldDelay } from '../lib/sidebar-menu-timing.js'

    let { menu, items, onHide, label = 'Appearance' } = $props()
    let root
    let openingGesture

    function positionMenu(node) {
        root = node
        openingGesture = menu.gesture
        node.showPopover()
        const rect = node.getBoundingClientRect()
        node.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`
        node.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`
        const focusTarget = node.querySelector('button:not(:disabled)') || node
        focusTarget.focus()
    }

    function dismiss(event) {
        if (openingGesture && menu.target?.contains(event.target)) {
            return
        }
        if (!root?.contains(event.target)) {
            closeMenu()
        }
    }

    function closeMenu() {
        openingGesture = null
        onHide()
    }

    function selectItem(item) {
        if (item.disabled) {
            return
        }
        if (item.action) {
            item.action()
        } else {
            item.toggle()
        }
        closeMenu()
    }

    function finishOpeningGesture(event) {
        if (!openingGesture) {
            return
        }
        const gesture = openingGesture
        openingGesture = null
        const moved = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4
        const button = document.elementFromPoint(event.clientX, event.clientY)?.closest('button[data-menu-item]')
        if (moved && root?.contains(button) && !button.disabled) {
            selectItem(items.find(item => item.id === button.dataset.menuItem))
        } else if (performance.now() - gesture.startedAt >= sidebarMenuHoldDelay) {
            closeMenu()
        }
    }

    function handleKey(event) {
        event.stopPropagation()
        if (event.key === 'Escape') {
            event.preventDefault()
            const target = menu.target
            closeMenu()
            target?.focus()
        } else if (event.key === 'Tab') {
            closeMenu()
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const buttons = [...root.querySelectorAll('button:not(:disabled)')]
            const index = buttons.indexOf(document.activeElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
                (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
        }
    }
</script>

<svelte:window onmousedown={dismiss} onmouseup={finishOpeningGesture} oncontextmenu={dismiss} onfocusin={dismiss} onresize={closeMenu} onblur={closeMenu} />

<div
    class="appearance-context-menu menu-surface"
    bind:this={root}
    use:positionMenu
    popover="manual"
    role="menu"
    aria-label={label}
    tabindex="-1"
    onkeydown={handleKey}
    oncontextmenu={(event) => { event.preventDefault(); event.stopPropagation() }}
>
    {#each items as item (item.id)}
        <button
            class="menu-action menu-action-between"
            type="button"
            role={item.action ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.action ? undefined : item.checked}
            data-menu-item={item.id}
            disabled={item.disabled}
            onmousedown={(event) => { if (event.button === 0 && !openingGesture) { event.preventDefault(); selectItem(item) } }}
            onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    selectItem(item)
                }
            }}
        >
            <span>{item.action || item.actionLabel ? item.label : `${item.checked ? 'Hide' : 'Show'} ${item.label}`}</span>
            {#if !item.action}
                <span class="checkmark" aria-hidden="true">{item.checked ? '✓' : ''}</span>
            {/if}
        </button>
    {/each}
</div>

<style>
    .appearance-context-menu {
        position: fixed;
        inset: auto;
        width: 248px;
        max-width: calc(100vw - 16px);
        margin: 0;
    }

    .checkmark {
        width: 14px;
        flex-shrink: 0;
    }
</style>

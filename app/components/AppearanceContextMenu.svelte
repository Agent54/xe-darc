<script>
    let { menu, items, onHide } = $props()
    let root

    function positionMenu(node) {
        node.showPopover()
        const rect = node.getBoundingClientRect()
        node.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8))}px`
        node.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8))}px`
        node.querySelector('button')?.focus()
    }

    function dismiss(event) {
        if (!root?.contains(event.target)) onHide()
    }

    function handleKey(event) {
        event.stopPropagation()
        if (event.key === 'Escape') {
            event.preventDefault()
            const target = menu.target
            onHide()
            target?.focus()
        } else if (event.key === 'Tab') {
            onHide()
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const buttons = [...root.querySelectorAll('button')]
            const index = buttons.indexOf(document.activeElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
                (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
        }
    }
</script>

<svelte:window onmousedown={dismiss} oncontextmenu={dismiss} onfocusin={dismiss} onresize={onHide} />

<div
    class="appearance-context-menu"
    bind:this={root}
    use:positionMenu
    popover="manual"
    role="menu"
    aria-label="Appearance"
    tabindex="-1"
    onkeydown={handleKey}
    oncontextmenu={(event) => event.preventDefault()}
>
    {#each items as item (item.id)}
        <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={item.checked}
            onclick={() => { item.toggle(); onHide() }}
        >
            <span>{item.checked ? 'Hide' : 'Show'} {item.label}</span>
            <span class="checkmark" aria-hidden="true">{item.checked ? '✓' : ''}</span>
        </button>
    {/each}
</div>

<style>
    .appearance-context-menu {
        position: fixed;
        box-sizing: border-box;
        inset: auto;
        width: 248px;
        max-width: calc(100vw - 16px);
        margin: 0;
        padding: 5px;
        border: 1px solid #ffffff26;
        border-radius: 10px;
        background: #171717;
        color: #ffffffe0;
        box-shadow: 0 12px 30px #0008;
        font: 13px/1.4 system-ui, sans-serif;
        -webkit-app-region: no-drag;
    }

    button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        border: 0;
        border-radius: 5px;
        padding: 7px 9px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    button:hover, button:focus-visible {
        outline: none;
        background: #ffffff14;
    }

    .checkmark {
        width: 14px;
        flex-shrink: 0;
    }
</style>

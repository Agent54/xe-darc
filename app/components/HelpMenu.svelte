<script>
    let { hidden = false, onShowShortcuts } = $props()
    let menu = $state(null)
    let trigger = $state(null)
    let open = $state(false)

    export function dismiss() {
        if (!open) return false
        menu.hidePopover()
        trigger.focus()
        return true
    }

    function handleKeyDown(event) {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        menu.showPopover()
        menu.querySelector('button').focus()
    }
</script>

<button
    class="header-icon-button help-menu-icon"
    class:hidden
    bind:this={trigger}
    type="button"
    title="Help"
    aria-label="Help"
    aria-haspopup="menu"
    aria-expanded={open}
    popovertarget="help-menu"
    onkeydown={handleKeyDown}
>
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9a2.25 2.25 0 1 1 3.81 1.62C12.5 11.3 12 11.75 12 13.5M12 16.5h.01" />
    </svg>
</button>

<div
    id="help-menu"
    class="help-menu menu-surface"
    popover="auto"
    role="menu"
    aria-label="Help"
    tabindex="-1"
    bind:this={menu}
    ontoggle={(event) => { open = event.newState === 'open' }}
    onkeydown={handleKeyDown}
>
    <div class="menu-caption">Help</div>
    <button type="button" class="shortcut-menu-item menu-action" role="menuitem"
        onmouseup={() => { dismiss(); onShowShortcuts() }}
        onclick={(event) => { if (event.detail === 0) { dismiss(); onShowShortcuts() } }}>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path stroke-linecap="round" d="M7 9h.01M12 9h.01M17 9h.01M7 12h.01M12 12h.01M17 12h.01M8 15h8" />
        </svg>
        <span>Keyboard shortcuts</span>
    </button>
</div>

<style>
    .help-menu-icon {
        position: fixed;
        top: 8px;
        right: 90px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 30px;
        padding: 0 0 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: white;
        cursor: pointer;
        z-index: 10000;
        -webkit-app-region: no-drag;
    }
    .help-menu-icon svg { width: 16px; height: 16px; opacity: .7; }
    .help-menu-icon:hover svg, .help-menu-icon[aria-expanded="true"] svg { opacity: 1; }
    .help-menu-icon.hidden { opacity: 0; visibility: hidden; pointer-events: none; }
    .help-menu-icon:focus-visible { outline: 2px solid #a3aab8; outline-offset: -3px; }
    .help-menu {
        position: fixed;
        inset: 30px 90px auto auto;
        margin: 0;
        min-width: 210px;
        max-width: calc(100vw - 100px);
        overflow: hidden;
    }
    .shortcut-menu-item svg { flex-shrink: 0; }
</style>

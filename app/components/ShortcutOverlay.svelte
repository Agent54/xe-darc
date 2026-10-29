<script>
    import { getShortcutHelp } from '../lib/shortcuts.js'

    let { isMac = true, dismissible = false, onClose } = $props()
    const groups = $derived(getShortcutHelp(isMac))

    // A manual popover stays above embedded pages without moving keyboard focus.
    function showLayer(node) {
        const previousFocus = document.activeElement
        node.showPopover()
        if (dismissible) node.querySelector('button')?.focus({ preventScroll: true })
        return { destroy() { if (dismissible && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) } }
    }
</script>

<div class="shortcut-overlay" popover="manual" use:showLayer onpointerdown={(event) => { if (dismissible && event.target === event.currentTarget) onClose?.() }}>
    <section class="shortcut-sheet" role={dismissible ? 'dialog' : undefined} aria-label="Keyboard shortcuts">
        <header class="sheet-header">
            <div>
                <p class="eyebrow">Darc <span>/</span> Quick reference</p>
                <h2>Keyboard shortcuts</h2>
                <p class="intro">Your tabs, spaces and navigation, within reach.</p>
            </div>
            <div class="command-mark" aria-hidden="true">{isMac ? '⌘' : '⌃'}</div>
        </header>

        <div class="shortcut-groups">
            {#each groups as group}
                <section class="shortcut-group" aria-label={group.title}>
                    <h3>{group.title}</h3>
                    <dl>
                        {#each group.items as item}
                            <div class="shortcut-row" class:hold-action={item.hold}>
                                <dt>{item.label}</dt>
                                <dd>
                                    {#if item.hold}<span class="hold-label">Hold</span>{/if}
                                    <span class="key-combination">
                                        {#each item.keys as key}<kbd>{key}</kbd>{/each}
                                    </span>
                                </dd>
                            </div>
                        {/each}
                    </dl>
                </section>
            {/each}
        </div>

        <footer>
            {#if dismissible}
                <span>Hold {isMac ? '⌘ or Control' : 'Control'} for a quick look anytime</span>
                <button type="button" class="close-button" onclick={onClose}>Close <kbd>Esc</kbd></button>
            {:else}
                <span class="release-hint"><span class="hold-indicator"></span>Release {isMac ? '⌘ or Control' : 'Control'} to return</span>
                <span class="escape-hint"><kbd>Esc</kbd> to dismiss</span>
            {/if}
        </footer>
    </section>
</div>

<style>
    .shortcut-overlay {
        --sheet: #17191f;
        --key: #262932;
        --ink: #f4f5f8;
        --muted: #a3aab8;
        --mint: #b9decf;
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        margin: 0;
        padding: 24px;
        border: 0;
        color: var(--ink);
        background: rgb(8 10 15 / 42%);
        backdrop-filter: blur(10px);
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .shortcut-overlay:popover-open { display: grid; place-items: center; }
    .shortcut-sheet {
        width: min(820px, 100%);
        max-height: 100%;
        overflow: auto;
        padding: 30px 34px 20px;
        box-sizing: border-box;
        border: 1px solid rgb(255 255 255 / 13%);
        border-radius: 22px;
        background: var(--sheet);
        box-shadow: 0 32px 100px rgb(0 0 0 / 45%), inset 0 1px 0 rgb(255 255 255 / 5%);
        animation: sheet-enter 160ms ease-out;
    }
    .sheet-header { position: static; width: auto; height: auto; padding: 0; background: transparent; color: inherit; display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 30px; }
    .eyebrow { margin: 0 0 12px; color: var(--muted); font-size: 10px; font-weight: 600; letter-spacing: .15em; text-transform: uppercase; }
    .eyebrow span { margin: 0 8px; color: #535a69; }
    h2 { margin: 0; font-size: clamp(25px, 3.8vw, 33px); font-weight: 550; letter-spacing: -.045em; line-height: 1.15; }
    .intro { margin: 10px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .command-mark {
        display: grid;
        place-items: center;
        flex: 0 0 70px;
        height: 70px;
        border: 1px solid rgb(255 255 255 / 12%);
        border-radius: 17px;
        background: #20232a;
        box-shadow: 0 4px 0 #0c0e13, inset 0 1px 0 rgb(255 255 255 / 7%);
        color: #c4cbd8;
        font-size: 42px;
        line-height: 1;
    }
    .shortcut-groups { display: grid; grid-template-columns: 1fr 1fr; column-gap: 38px; row-gap: 22px; }
    .shortcut-group:first-child { grid-row: span 2; }
    h3 { margin: 0 0 10px; padding-bottom: 10px; border-bottom: 1px solid rgb(255 255 255 / 9%); color: var(--muted); font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; }
    dl { margin: 0; }
    .shortcut-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 37px; }
    dt { font-size: 12px; line-height: 1.4; }
    dd { display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0; gap: 8px; margin: 0; }
    .key-combination { display: inline-flex; gap: 4px; }
    kbd {
        display: inline-grid;
        place-items: center;
        min-width: 23px;
        height: 24px;
        padding: 0 5px;
        box-sizing: border-box;
        border: 1px solid rgb(255 255 255 / 10%);
        border-bottom-color: rgb(255 255 255 / 18%);
        border-radius: 5px;
        background: var(--key);
        color: #dbe0ea;
        box-shadow: 0 2px 0 rgb(0 0 0 / 24%);
        font: 12px 'SFMono-Regular', Consolas, monospace;
        white-space: nowrap;
    }
    .hold-action dt, .hold-label { color: var(--mint); }
    .hold-label { font-size: 10px; }
    footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 28px; padding-top: 17px; border-top: 1px solid rgb(255 255 255 / 9%); color: var(--muted); font-size: 10px; }
    .release-hint, .escape-hint { display: inline-flex; align-items: center; gap: 8px; }
    .hold-indicator { width: 5px; height: 5px; border-radius: 50%; background: var(--mint); }
    footer kbd { height: 20px; font-size: 10px; }
    .close-button { display: inline-flex; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid rgb(255 255 255 / 13%); border-radius: 6px; background: var(--key); color: var(--ink); font: inherit; cursor: pointer; }
    .close-button:hover { background: #343844; }
    .close-button:focus-visible { outline: 2px solid var(--mint); outline-offset: 3px; }
    @keyframes sheet-enter { from { opacity: 0; transform: translateY(6px) scale(.99); } to { opacity: 1; transform: none; } }
    @media (max-width: 680px) {
        .shortcut-overlay { padding: 14px; }
        .shortcut-sheet { padding: 24px 22px 18px; border-radius: 18px; }
        .shortcut-groups { grid-template-columns: 1fr; gap: 22px; }
        .shortcut-group:first-child { grid-row: auto; }
        .command-mark { flex-basis: 52px; height: 52px; font-size: 31px; border-radius: 13px; }
        .sheet-header { margin-bottom: 26px; }
        .intro { max-width: 220px; }
        footer { flex-wrap: wrap; }
    }
    @media (prefers-reduced-motion: reduce) { .shortcut-sheet { animation: none; } }
</style>

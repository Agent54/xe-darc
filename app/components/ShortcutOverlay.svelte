<script>
    import HelpSheet from './HelpSheet.svelte'
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

<div class="shortcut-overlay help-overlay" popover="manual" use:showLayer onpointerdown={(event) => { if (dismissible && event.target === event.currentTarget) onClose?.() }}>
    <HelpSheet title="Keyboard shortcuts" titleId="shortcuts-title" variant="shortcut" dialog={dismissible} onClose={dismissible ? onClose : undefined}>
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

        {#snippet footnote()}
            {dismissible ? 'Hold' : 'Release'}
            {#if isMac}
                <kbd aria-label="Command">⌘</kbd> or
            {/if}
            <kbd aria-label="Control">Ctrl</kbd>
            {dismissible ? 'to show shortcuts' : 'to close'}
        {/snippet}
    </HelpSheet>
</div>

<style>
    .shortcut-overlay { --help-width: 680px; }
    .shortcut-groups {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 24px;
        row-gap: 14px;
    }
    .shortcut-group:first-child { grid-row: span 2; }
    h3 {
        margin: 0;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--menu-border);
        color: var(--help-secondary);
        font-size: 11px;
        font-weight: 600;
    }
    dl { margin: 0; }
    .shortcut-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 33px;
    }
    dt { min-width: 0; }
    dd { display: flex; align-items: center; flex-shrink: 0; gap: 6px; margin: 0; }
    .key-combination { display: inline-flex; gap: 3px; }
    .hold-label { color: var(--help-secondary); font-size: 11px; }
    @media (max-width: 580px) {
        .shortcut-groups { grid-template-columns: minmax(0, 1fr); }
        .shortcut-group:first-child { grid-row: auto; }
    }
</style>

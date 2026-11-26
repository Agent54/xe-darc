<script>
    let { title, titleId, variant, dialog = false, onClose, children, footnote } = $props()
</script>

<section class="help-sheet menu-surface {variant}-sheet" role={dialog ? 'dialog' : undefined} aria-labelledby={titleId}>
    <div class="sheet-heading">
        <h2 id={titleId}>{title}</h2>
        {#if onClose}
            <button type="button" class="close-button menu-action" aria-label="Close" title="Close (Esc)"
                onmousedown={(event) => {
                    if (event.button === 0) {
                        event.preventDefault()
                        onClose()
                    }
                }}
                onclick={(event) => {
                    if (event.detail === 0) {
                        onClose()
                    }
                }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
                    <path d="m5 5 10 10M15 5 5 15" />
                </svg>
            </button>
        {/if}
    </div>

    <div class="sheet-content">
        {@render children()}
    </div>

    {#if footnote}
        <footer>{@render footnote()}</footer>
    {/if}
</section>

<style>
    :global(.help-overlay) {
        position: fixed;
        inset: 0;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        margin: 0;
        padding: 16px;
        border: 0;
        background: rgb(0 0 0 / 52%);
    }
    :global(.help-overlay:popover-open),
    :global(dialog.help-overlay[open]) {
        display: grid;
        place-items: center;
    }
    :global(dialog.help-overlay::backdrop) {
        background: transparent;
    }
    .help-sheet {
        --help-secondary: #a3a3a3;
        width: min(var(--help-width), 100%);
        max-height: 100%;
        overflow: auto;
        overscroll-behavior: contain;
        padding: 0;
        border-radius: 12px;
        background: #050505;
        line-height: 1.4;
    }
    .sheet-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 58px;
        padding: 0 22px;
        border-bottom: 1px solid var(--menu-border);
    }
    h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        letter-spacing: -.035em;
    }
    .close-button {
        display: grid;
        place-items: center;
        flex: none;
        width: 28px;
        height: 28px;
        padding: 0;
        color: var(--help-secondary);
    }
    .close-button svg {
        width: 16px;
        height: 16px;
    }
    .sheet-content {
        padding: 16px 22px 20px;
    }
    footer {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px;
        padding: 10px 22px;
        border-top: 1px solid var(--menu-border);
        color: var(--help-secondary);
        font-size: 11px;
    }
    .help-sheet :global(kbd) {
        display: inline-grid;
        place-items: center;
        box-sizing: border-box;
        min-width: 23px;
        height: 23px;
        padding: 0 5px;
        border: 1px solid var(--menu-border);
        border-radius: 5px;
        background: #141414;
        color: #e7e7e7;
        font: 500 11px/1 ui-monospace, 'SF Mono', Consolas, monospace;
        white-space: nowrap;
    }
    footer :global(kbd) {
        height: 19px;
        font-size: 10px;
    }
    @media (max-width: 520px) {
        :global(.help-overlay) { padding: 10px; }
        .sheet-heading { min-height: 51px; }
        .sheet-heading, .sheet-content, footer { padding-inline: 14px; }
    }
</style>

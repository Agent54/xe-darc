<script>
    import HelpSheet from './HelpSheet.svelte'

    let { onClose } = $props()

    function showLayer(node) {
        node.showModal()
        node.querySelector('button')?.focus({ preventScroll: true })
    }
</script>

{#snippet trackpad(fingers, direction, pressed = false)}
    <svg class="trackpad" viewBox="0 0 108 64" fill="none" aria-hidden="true">
        <rect x=".5" y=".5" width="107" height="63" rx="8" fill="#0d0d0d" stroke="#292929" />
        {#each Array.from({ length: fingers }) as _, i}
            <rect x={54 - (fingers * 13 - 5) / 2 + i * 13} y={31 + (i === 0 || i === fingers - 1 ? 3 : 0)} width="8" height="16" rx="4" fill={pressed ? '#eee' : '#242424'} stroke="#b8b8b8" />
        {/each}
        {#if direction === 'horizontal'}
            <path d="M33 19h42m-5-5 5 5-5 5M38 14l-5 5 5 5" stroke="#eee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        {:else}
            <path d="M54 24V10m-5 5 5-5 5 5" stroke="#eee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        {/if}
        {#if pressed}
            <path d="M37 54h34" stroke="#777" stroke-dasharray="2 3" stroke-linecap="round" />
        {/if}
    </svg>
{/snippet}

<dialog class="gesture-overlay help-overlay" aria-labelledby="gestures-title" use:showLayer
    oncancel={(event) => { event.preventDefault(); onClose?.() }}
    onpointerdown={(event) => { if (event.target === event.currentTarget) { onClose?.() } }}>
    <HelpSheet title="Gestures" titleId="gestures-title" variant="gesture" {onClose}>
        <section class="gesture-group" aria-labelledby="gesture-macos">
            <div class="group-heading">
                <h3 id="gesture-macos">macOS</h3>
                <p>System Settings › Trackpad › More Gestures</p>
            </div>
            <div class="gesture-row">
                <div>
                    <h4>Back and forward</h4>
                    <p>Set <strong>Swipe between pages</strong> to <strong>Swipe with Three Fingers</strong>.</p>
                    <p>Use four fingers for <strong>Swipe between full-screen applications</strong>.</p>
                </div>
                {@render trackpad(3, 'horizontal')}
            </div>
            <div class="gesture-row">
                <div>
                    <h4>Mission Control</h4>
                    <p>Choose <strong>Swipe Up with Four Fingers</strong>.</p>
                </div>
                {@render trackpad(4, 'up')}
            </div>
        </section>

        <section class="gesture-group" aria-labelledby="gesture-btt">
            <div class="group-heading">
                <div class="group-title">
                    <h3 id="gesture-btt">BetterTouchTool</h3>
                    <a class="install-link menu-action" href="https://folivora.ai/" target="_blank" rel="noopener noreferrer" aria-label="Get BetterTouchTool">Download <span aria-hidden="true">↗</span></a>
                </div>
                <p>Allow Accessibility access, then select Darc › Trackpad.</p>
            </div>
            <div class="gesture-row">
                <div>
                    <h4>Previous or next space</h4>
                    <p>Set <strong>3 Finger Click</strong> to <strong>Custom Click › Middle Mouse Down</strong>. Add <strong>Middle Mouse Up</strong> under <strong>Actions Executed On Touch Release</strong>.</p>
                    <p>Click with three fingers, then swipe left or right before lifting them.</p>
                </div>
                {@render trackpad(3, 'horizontal', true)}
            </div>
            <div class="gesture-row">
                <div>
                    <h4>Grid view</h4>
                    <p>Add <strong>3 Finger Swipe Up</strong> with <strong>Send Keyboard Shortcut</strong>. Choose <kbd>F18</kbd> from the function-key menu.</p>
                </div>
                {@render trackpad(3, 'up')}
            </div>
        </section>
    </HelpSheet>
</dialog>

<style>
    .gesture-overlay { --help-width: 640px; }
    .gesture-group + .gesture-group { margin-top: 16px; }
    .group-heading {
        padding-bottom: 10px;
        border-bottom: 1px solid var(--menu-border);
    }
    .group-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }
    h3, h4 { margin: 0 0 3px; font-size: 13px; font-weight: 600; }
    .group-title h3 { margin: 0; }
    p { margin: 0; color: var(--help-secondary); font-size: 12px; line-height: 1.5; }
    p + p { margin-top: 4px; }
    strong { color: #ddd; font-weight: 560; }
    .install-link {
        width: auto;
        padding: 4px 6px;
        gap: 5px;
        color: var(--help-secondary);
        font-size: 11px;
        text-decoration: none;
    }
    .gesture-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) clamp(62px, 15vw, 102px);
        align-items: center;
        gap: 16px;
        padding: 12px 0;
    }
    .gesture-row + .gesture-row { border-top: 1px solid var(--menu-border); }
    .gesture-row:last-child { padding-bottom: 0; }
    .trackpad { display: block; width: 100%; }
    .gesture-row kbd { height: 18px; font-size: 10px; }
    @media (max-width: 520px) {
        .gesture-row { gap: 10px; }
    }
</style>

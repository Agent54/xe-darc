<script>
    let { onClose } = $props()

    function showLayer(node) {
        node.showModal()
        node.querySelector('button')?.focus({ preventScroll: true })
    }
</script>

{#snippet trackpad(fingers, direction, pressed = false, overview = false)}
    <svg class="trackpad" viewBox="0 0 160 112" fill="none" aria-hidden="true">
        <rect x="13" y="28" width="134" height="78" rx="12" fill="#191919" stroke="#414141" />
        <path d="M26 91h108" stroke="#2c2c2c" />
        {#each Array.from({ length: fingers }) as _, i}
            <rect x={80 - (fingers * 15 - 5) / 2 + i * 15} y={50 + (i === 0 || i === fingers - 1 ? 5 : 0)} width="10" height="29" rx="5" fill={pressed ? '#d4d4d4' : '#333333'} stroke="#d4d4d4" />
        {/each}
        {#if direction === 'horizontal'}
            <path d="M42 16h76m-7-6 7 6-7 6M49 10l-7 6 7 6" stroke="#dedede" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        {:else}
            <path d="M80 38V6m-6 7 6-7 6 7" stroke="#dedede" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        {/if}
        {#if pressed}
            <path d="M48 82c6 8 58 8 64 0" stroke="#a3a3a3" stroke-dasharray="3 4" stroke-linecap="round" />
        {/if}
        {#if overview}
            <rect x="111" y="6" width="10" height="7" rx="1.5" stroke="#a3a3a3" />
            <rect x="125" y="6" width="10" height="7" rx="1.5" stroke="#a3a3a3" />
            <rect x="111" y="17" width="10" height="7" rx="1.5" stroke="#a3a3a3" />
            <rect x="125" y="17" width="10" height="7" rx="1.5" stroke="#a3a3a3" />
        {/if}
    </svg>
{/snippet}

<dialog class="gesture-overlay" aria-labelledby="gestures-title" use:showLayer
    oncancel={(event) => { event.preventDefault(); onClose?.() }}
    onpointerdown={(event) => { if (event.target === event.currentTarget) { onClose?.() } }}>
    <section class="gesture-sheet">
        <header class="sheet-header">
            <p class="eyebrow">Darc <span>/</span> Quick reference</p>
            <h2 id="gestures-title">Gestures</h2>
            <p class="intro">A few trackpad settings for moving through tabs and spaces on macOS.</p>
        </header>

        <div class="recommendation">
            <div>
                <h3>Recommended: BetterTouchTool</h3>
                <p>Install it to add the click-and-swipe and grid view gestures below. Allow Accessibility access when prompted.</p>
            </div>
            <a class="install-link" href="https://folivora.ai/" target="_blank" rel="noopener noreferrer">Get BetterTouchTool <span aria-hidden="true">↗</span></a>
        </div>

        <div class="gesture-list">
            <section class="gesture-row" aria-labelledby="gesture-navigation">
                <div class="gesture-copy">
                    <p class="section-label">macOS <span>System Settings → Trackpad → More Gestures</span></p>
                    <h3 id="gesture-navigation">Three fingers to go back or forward</h3>
                    <p>Set <strong>Swipe between pages</strong> to <strong>Swipe with Three Fingers</strong> instead of two. Swipe left or right to navigate the current tab’s history.</p>
                    <p class="detail">Set <strong>Swipe between full-screen applications</strong> to four fingers to keep it separate.</p>
                </div>
                <figure>
                    {@render trackpad(3, 'horizontal')}
                    <figcaption>Back / Forward</figcaption>
                </figure>
            </section>

            <section class="gesture-row" aria-labelledby="gesture-mission-control">
                <div class="gesture-copy">
                    <p class="section-label">macOS <span>Trackpad → More Gestures</span></p>
                    <h3 id="gesture-mission-control">Four fingers for Mission Control</h3>
                    <p>Set <strong>Mission Control</strong> to <strong>Swipe Up with Four Fingers</strong> instead of three. This frees three-finger swipe up for Darc’s grid view.</p>
                </div>
                <figure>
                    {@render trackpad(4, 'up')}
                    <figcaption>Mission Control</figcaption>
                </figure>
            </section>

            <section class="gesture-row" aria-labelledby="gesture-spaces">
                <div class="gesture-copy">
                    <p class="section-label">BetterTouchTool <span>Trackpad</span></p>
                    <h3 id="gesture-spaces">Three-finger click, then swipe to switch spaces</h3>
                    <p>Add <strong>3 Finger Click</strong> → <strong>Custom Click</strong> → <strong>Middle Mouse Down</strong>. Under <strong>Actions Executed On Touch Release</strong>, add <strong>Middle Mouse Up</strong>.</p>
                    <p class="detail">Click with three fingers, keep them touching the trackpad, then swipe back or forward. While the middle button is held, Back goes to the previous Darc space and Forward goes to the next. Lift all fingers to release.</p>
                </div>
                <figure>
                    {@render trackpad(3, 'horizontal', true)}
                    <figcaption>Click + swipe<br />Previous / Next space</figcaption>
                </figure>
            </section>

            <section class="gesture-row" aria-labelledby="gesture-grid">
                <div class="gesture-copy">
                    <p class="section-label">BetterTouchTool <span>Trackpad</span></p>
                    <h3 id="gesture-grid">Three fingers up for grid view</h3>
                    <p>Add <strong>3 Finger Swipe Up</strong> → <strong>Send Keyboard Shortcut</strong> → <kbd>F18</kbd>. Choose F18 from BetterTouchTool’s function-key picker if your keyboard doesn’t have it.</p>
                    <p class="detail">Swipe up with three fingers in Darc to see your tabs in grid view.</p>
                </div>
                <figure>
                    {@render trackpad(3, 'up', false, true)}
                    <figcaption>Grid view <kbd>F18</kbd></figcaption>
                </figure>
            </section>
        </div>

        <footer>
            <span>In BetterTouchTool, select Darc in the app list, then Trackpad → Add a gesture.</span>
            <button type="button" class="close-button" onmousedown={(event) => { if (event.button === 0) { onClose?.() } }} onclick={(event) => { if (event.detail === 0) { onClose?.() } }}>Close <kbd>Esc</kbd></button>
        </footer>
    </section>
</dialog>

<style>
    .gesture-overlay {
        --sheet: #111111;
        --key: #232323;
        --ink: #f2f2f2;
        --muted: #a3a3a3;
        --accent: #d4d4d4;
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        max-width: none;
        max-height: none;
        margin: 0;
        padding: 24px;
        border: 0;
        box-sizing: border-box;
        color: var(--ink);
        background: rgb(0 0 0 / 30%);
        backdrop-filter: blur(2px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .gesture-overlay[open] { display: grid; place-items: center; }
    .gesture-overlay::backdrop { background: transparent; }
    .gesture-sheet {
        width: min(880px, 100%);
        max-height: 100%;
        overflow: auto;
        overscroll-behavior: contain;
        padding: 30px 34px 20px;
        box-sizing: border-box;
        border: 1px solid rgb(255 255 255 / 13%);
        border-radius: 22px;
        background: var(--sheet);
        box-shadow: 0 32px 100px rgb(0 0 0 / 45%), inset 0 1px 0 rgb(255 255 255 / 5%);
    }
    .sheet-header { position: static; display: block; width: auto; height: auto; padding: 0; margin-bottom: 20px; background: transparent; color: inherit; }
    .eyebrow { margin: 0 0 12px; color: var(--muted); font-size: 10px; font-weight: 600; letter-spacing: .15em; text-transform: uppercase; }
    .eyebrow span { margin: 0 8px; color: #575757; }
    h2 { margin: 0; font-size: clamp(25px, 3.8vw, 33px); font-weight: 550; letter-spacing: -.045em; line-height: 1.15; }
    .intro { margin: 10px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .recommendation { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 15px 17px; border: 1px solid rgb(255 255 255 / 10%); border-radius: 10px; background: #1b1b1b; }
    h3 { margin: 0 0 7px; font-size: 13px; font-weight: 550; line-height: 1.4; }
    p { margin: 0; font-size: 12px; line-height: 1.65; }
    .recommendation p { max-width: 470px; color: var(--muted); font-size: 11px; }
    .install-link { flex-shrink: 0; display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: 11px; text-underline-offset: 4px; }
    .install-link:hover { color: var(--muted); }
    .gesture-row { display: grid; grid-template-columns: minmax(0, 1fr) 160px; align-items: center; gap: 30px; padding: 20px 0; border-bottom: 1px solid rgb(255 255 255 / 9%); }
    .gesture-row:last-child { border-bottom: 0; padding-bottom: 0; }
    .section-label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin: 0 0 8px; color: var(--muted); font-size: 9px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
    .section-label span { font-weight: 400; letter-spacing: normal; text-transform: none; }
    .gesture-copy > p:not(.section-label) { color: var(--muted); }
    strong { color: var(--accent); font-weight: 500; }
    .detail { margin-top: 7px; font-size: 11px; }
    figure { margin: 0; }
    .trackpad { display: block; width: 100%; height: auto; }
    figcaption { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 7px; color: var(--muted); text-align: center; font-size: 10px; line-height: 1.6; }
    kbd { display: inline-grid; place-items: center; min-width: 23px; height: 21px; padding: 0 5px; box-sizing: border-box; border: 1px solid rgb(255 255 255 / 10%); border-bottom-color: rgb(255 255 255 / 18%); border-radius: 5px; background: var(--key); color: #dedede; box-shadow: 0 2px 0 rgb(0 0 0 / 24%); font: 10px 'SFMono-Regular', Consolas, monospace; white-space: nowrap; }
    footer { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-top: 24px; padding-top: 17px; border-top: 1px solid rgb(255 255 255 / 9%); color: var(--muted); font-size: 10px; line-height: 1.6; }
    .close-button { display: inline-flex; align-items: center; flex-shrink: 0; gap: 10px; padding: 6px 10px; border: 1px solid rgb(255 255 255 / 13%); border-radius: 6px; background: var(--key); color: var(--ink); font: inherit; cursor: pointer; }
    .close-button:hover { background: #303030; }
    .close-button:focus-visible, .install-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    @media (max-width: 680px) {
        .gesture-overlay { padding: 14px; }
        .gesture-sheet { padding: 24px 22px 18px; border-radius: 18px; }
        .recommendation { flex-wrap: wrap; gap: 10px; }
        .gesture-row { grid-template-columns: minmax(0, 1fr) 100px; gap: 16px; }
        footer { flex-wrap: wrap; gap: 12px; }
    }
    @media (max-width: 380px) {
        .gesture-sheet { padding-right: 16px; padding-left: 16px; }
        .gesture-row { grid-template-columns: minmax(0, 1fr) 76px; gap: 10px; }
        figcaption { flex-wrap: wrap; font-size: 9px; }
    }
</style>

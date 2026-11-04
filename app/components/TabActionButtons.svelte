<script>
    let {
        variant = 'default',
        isClosedTab = false,
        showDevTools = false,
        showSettingsButton = false,
        showCloseButton = true,
        copyUrlSuccess = false,
        onGoBack = null,
        onGoForward = null,
        onReload = null,
        onDevTools = null,
        onSettings = null,
        onCopyUrl = null,
        onCloseTab = null
    } = $props()

    const actions = $derived([
        ...(!isClosedTab ? [
            { label: 'Back', run: onGoBack, path: 'M15.75 19.5 8.25 12l7.5-7.5' },
            { label: 'Forward', run: onGoForward, path: 'm8.25 4.5 7.5 7.5-7.5 7.5' },
            { label: 'Reload', run: onReload, path: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99' }
        ] : []),
        ...(showDevTools ? [{ label: 'Open Developer Tools', run: onDevTools, path: 'M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5' }] : []),
        ...(showSettingsButton ? [{ label: 'Settings', run: onSettings, path: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z' }] : []),
        { label: copyUrlSuccess ? 'Copied!' : 'Copy URL', run: onCopyUrl, success: copyUrlSuccess, path: copyUrlSuccess ? 'M4.5 12.75l6 6 9-13.5' : 'M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184' },
        ...(showCloseButton && !isClosedTab ? [{ label: 'Close Tab', run: onCloseTab, path: 'M6 18 18 6M6 6l12 12' }] : [])
    ])

    function activate(event, action) {
        event.preventDefault()
        event.stopPropagation()
        action.run?.()
    }
</script>

<div class="tab-actions" class:menu={variant === 'menu'} class:hovercard={variant === 'hovercard'} role="group" aria-label="Tab actions">
    {#each actions as action}
        <button type="button" class="url-bar-button" class:success={action.success}
                role={variant === 'menu' ? 'menuitem' : undefined}
                title={action.label} aria-label={action.label}
                onmousedown={(event) => { event.preventDefault(); event.stopPropagation() }}
                onmouseup={(event) => activate(event, action)}
                onclick={(event) => { if (event.detail === 0) activate(event, action) }}>
            <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d={action.path} />
            </svg>
        </button>
    {/each}
</div>

<style>
    .tab-actions {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .url-bar-button {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
        padding: 0;
        border: 0;
        border-radius: 3px;
        background: transparent;
        color: rgb(255 255 255 / 60%);
        cursor: pointer;
        transition: background 90ms ease, color 90ms ease;
    }

    svg { width: 14px; height: 14px; }

    .url-bar-button:hover, .url-bar-button:focus-visible {
        background: var(--menu-hover-background, rgb(255 255 255 / 12%));
        color: #fff;
    }

    .url-bar-button:focus-visible {
        outline: 1px solid var(--menu-focus-color, #a3a3a3);
        outline-offset: -2px;
    }

    .hovercard {
        width: max-content;
        max-width: calc(90vw - 34px);
    }

    .hovercard .url-bar-button {
        flex: 1 1 28px;
        min-width: 0;
        width: 28px;
        height: 28px;
        border-radius: 4px;
        color: var(--menu-color, #fff);
    }

    .hovercard svg { width: 16px; height: 16px; }

    .menu {
        gap: 2px;
        padding: 6px;
    }

    .menu .url-bar-button {
        flex: 1;
        width: 28px;
        height: 28px;
        border-radius: 4px;
        color: var(--menu-color, #fff);
    }

    .menu svg { width: 16px; height: 16px; }

    .menu .url-bar-button:hover, .menu .url-bar-button:focus-visible {
        background: var(--menu-hover-background, rgb(255 255 255 / 12%));
    }

    .url-bar-button.success {
        color: #22c55e;
        background: rgb(34 197 94 / 10%);
    }

    @media (prefers-reduced-motion: reduce) {
        .url-bar-button { transition: none; }
    }
</style>

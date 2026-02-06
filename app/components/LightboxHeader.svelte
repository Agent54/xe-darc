<script>
    import UrlBar from './UrlBar.svelte'
    import Tooltip from './Tooltip.svelte'

    let {
        url = '',
        title = '',
        tabId = null,
        favicon = '',
        showControls = true,
        onMoveToTab = null,
        onExpandFull = null,
        onCollapsePreview = null,
        onSettings = null,
        onClose = null,
    } = $props()

    const faviconUrl = $derived(
        favicon || (url ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=16` : '')
    )
</script>

<div class="lightbox-header-wrapper">
    {#if title}
        <div class="lightbox-title">{title}</div>
    {/if}
    <div class="lightbox-header">
    <div class="lightbox-info">
        {#if faviconUrl}
            <img src={faviconUrl} alt="" class="lightbox-favicon" />
        {/if}
        <div class="lightbox-urlbar">
            <UrlBar {url} {tabId} variant="hovercard" showCloseButton={false} showSettingsButton={false} />
        </div>
    </div>
    {#if showControls}
        <div class="lightbox-controls">
            {#if onMoveToTab}
                <Tooltip text="Open in new tab" position="bottom">
                    <button
                        class="lightbox-btn"
                        aria-label="Open in new tab"
                        onmousedown={onMoveToTab}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="19" x2="19" y2="5"></line>
                            <polyline points="9,5 19,5 19,15"></polyline>
                        </svg>
                    </button>
                </Tooltip>
            {/if}
            {#if onExpandFull}
                <Tooltip text="Expand to full tab" position="bottom">
                    <button
                        class="lightbox-btn"
                        aria-label="Expand to full tab"
                        onmousedown={onExpandFull}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15,3 21,3 21,9"></polyline>
                            <polyline points="9,21 3,21 3,15"></polyline>
                            <line x1="21" y1="3" x2="14" y2="10"></line>
                            <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                    </button>
                </Tooltip>
            {/if}
            {#if onCollapsePreview}
                <Tooltip text="Collapse to preview card" position="bottom">
                    <button
                        class="lightbox-btn"
                        aria-label="Collapse to preview card"
                        onmousedown={onCollapsePreview}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="4,14 10,14 10,20"></polyline>
                            <polyline points="20,10 14,10 14,4"></polyline>
                            <line x1="14" y1="10" x2="21" y2="3"></line>
                            <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                    </button>
                </Tooltip>
            {/if}
            {#if onSettings}
                <Tooltip text="Settings" position="bottom">
                    <button
                        class="lightbox-btn"
                        aria-label="Settings"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                </Tooltip>
            {/if}
            {#if onClose}
                <Tooltip text="Close" position="bottom">
                    <button
                        class="lightbox-btn"
                        aria-label="Close lightbox"
                        onmousedown={onClose}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </Tooltip>
            {/if}
        </div>
    {/if}
    </div>
</div>

<style>
    .lightbox-header-wrapper {
        position: relative;
        flex-shrink: 0;
    }

    .lightbox-title {
        position: absolute;
        top: -24px;
        left: 6px;
        right: 0;
        font-size: 14px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.7);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    }

    .lightbox-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 16px 8px;
        background: rgba(0, 0, 0, 0.3);
        flex-shrink: 0;
        gap: 8px;
    }

    .lightbox-info {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
    }

    .lightbox-favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        border-radius: 2px;
    }

    .lightbox-urlbar {
        min-width: 0;
        flex: 1;
    }

    .lightbox-urlbar :global(.url-bar-section) {
        padding-bottom: 0;
        margin-top: 0;
    }

    .lightbox-urlbar :global(.url-bar-container) {
        background: transparent;
        border-color: transparent;
    }

    .lightbox-urlbar :global(.url-bar-container:hover) {
        background: rgb(255 255 255 / 5%);
    }

    .lightbox-urlbar :global(.url-bar-wrapper) {
        margin-left: 0;
    }

    .lightbox-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    .lightbox-btn {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.6);
        transition: background 0.2s ease, color 0.2s ease;
        flex-shrink: 0;
    }

    .lightbox-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
    }

    .lightbox-btn svg {
        width: 14px;
        height: 14px;
    }
</style>

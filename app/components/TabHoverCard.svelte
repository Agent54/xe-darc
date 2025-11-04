<script>
    import UrlRenderer from './UrlRenderer.svelte'
    import AttachmentImage from './AttachmentImage.svelte'
    import data from '../data.svelte.js'
    
    let { tab, onMouseLeave, isClosedTab = false } = $props()
    
    let hovercardHovered = $state(false)
</script>

<div class="hovercard-content"
     onmouseenter={() => hovercardHovered = true}
     onmouseleave={() => hovercardHovered = false}>
    <div class="hovercard-info"
         role="region"
         onmouseenter={() => {}}
         onmouseleave={onMouseLeave}>
        <div class="hovercard-header">
            <div class="hovercard-text">
                <div class="hovercard-title">{tab.title || 'Untitled'}</div>
                <div class="hovercard-url">
                    <UrlRenderer url={tab.url} variant="compact" />
                </div>
            </div>
            {#if isClosedTab}
                <svg class="hibernation-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
            {:else if !data.frames[tab.id]?.frame}
                <svg class="hibernation-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
            {/if}
        </div>
    </div>
    {#if tab.screenshot}
        <div class="hovercard-screenshot">
            <AttachmentImage src={tab.screenshot} alt="Page preview" />
            {#if hovercardHovered}
                <button class="expand-button" aria-label="Expand screenshot">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                </button>
            {/if}
        </div>
    {/if}
</div>

<style>
    /* Ensure these styles are scoped to this component */
    .hovercard-content {
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        overflow: visible;
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2);
        width: 320px;
        max-width: 90vw;
        margin-top: 8px;
        margin-left: 8px;
    }

    .hovercard-info {
        padding: 16px;
        font-family: 'Inter', sans-serif;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        overflow: visible;
    }

    .hovercard-info:last-child {
        border-bottom: none;
    }

    .hovercard-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
    }

    .hovercard-text {
        flex: 1;
        min-width: 0;
    }

    .hovercard-title {
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        margin-bottom: 6px;
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .hovercard-url {
        font-size: 12px;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.5;
    }

    .hovercard-screenshot {
        width: 100%;
        height: 180px;
        overflow: hidden;
        border-bottom-left-radius: 12px;
        border-bottom-right-radius: 12px;
        position: relative;
    }
    
    .expand-button {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        color: rgba(255, 255, 255, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        opacity: 0;
        animation: expand-button-fade-in 150ms ease-out forwards;
    }
    
    .expand-button:hover {
        background: rgba(0, 0, 0, 0.85);
        border-color: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
    }
    
    .expand-button .w-4 {
        width: 16px;
        height: 16px;
    }
    
    @keyframes expand-button-fade-in {
        from {
            opacity: 0;
            transform: scale(0.9);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    .hibernation-icon {
        width: 16px;
        height: 16px;
        color: rgba(255, 255, 255, 0.7);
        flex-shrink: 0;
        margin-left: 8px;
    }
</style>

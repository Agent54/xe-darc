<script>
    import UrlRenderer from './UrlRenderer.svelte'
    import AttachmentImage from './AttachmentImage.svelte'
    import data from '../data.svelte.js'
    
    let { tab, onMouseLeave } = $props()
</script>

<div class="hovercard-content">
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
            {#if !data.frames[tab.id]?.frame}
                <svg class="hibernation-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
            {/if}
        </div>
    </div>
    {#if tab.screenshot}
        <div class="hovercard-screenshot">
            <AttachmentImage src={tab.screenshot} alt="Page preview" />
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
    }

    .hibernation-icon {
        width: 16px;
        height: 16px;
        color: rgba(255, 255, 255, 0.7);
        flex-shrink: 0;
        margin-left: 8px;
    }
</style>

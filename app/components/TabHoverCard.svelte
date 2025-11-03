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

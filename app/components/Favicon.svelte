<script>
    import SecurityIndicator from './SecurityIndicator.svelte'
    import data from '../data.svelte.js'
    
    let { tab, security = null, showButton = true, size = 'normal' } = $props()
    
    // Derive security status if not provided
    const securityStatus = $derived(() => {
        if (security !== null) return security
        
        if (!tab?.url) return null
        
        try {
            const origin = new URL(tab.url).origin
            const originData = data.origins[origin]
            
            return {
                hasError: originData?.certificateError || 
                         originData?.hasSecurityWarning || 
                         originData?.mixedContent || 
                         originData?.securityState === 'mixed' || 
                         (originData?.securityState === 'insecure' && tab.url?.startsWith('https:')),
                originData
            }
        } catch (error) {
            return null
        }
    })
    
    function getFaviconContent() {
        // Security indicator takes precedence
        if (securityStatus()?.hasError) {
            return { type: 'security', component: SecurityIndicator }
        }
        
        // New tab icon
        if (tab?.url?.startsWith?.('about:newtab') || tab?.url?.startsWith?.('about:blank')) {
            return { type: 'newTab' }
        }

        // Custom favicon - check if it's SVG markup or URL
        if (tab?.favicon) {
            if (tab.favicon.startsWith('<svg') || tab.favicon.includes('viewBox')) {
                return { type: 'svg', markup: tab.favicon }
            } else if (tab.favicon.startsWith('http') || tab.favicon.startsWith('data:')) {
                return { type: 'image', src: tab.favicon }
            } else {
                // Assume it's SVG markup if it's not a URL
                return { type: 'svg', markup: tab.favicon }
            }
        }
        
        // Default globe icon
        return { type: 'globe' }
    }
    
    const faviconContent = $derived(getFaviconContent())
</script>

{#snippet newTabIcon()}
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="new-tab-icon w-4 h-4">
        <!-- central plus -->
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12M6 12h12" />
        <!-- subtle rays -->
        <path stroke-linecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2M5.8 5.8l1.3 1.3M16.9 16.9l1.3 1.3M5.8 18.2l1.3-1.3M16.9 7.1l1.3-1.3" />
    </svg>
{/snippet}

{#snippet globeIcon()}
    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" class="w-4 h-4">
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
    </svg>
{/snippet}

{#if showButton}
    <span 
        class="favicon-display" 
        class:small={size === 'small'}
        title={tab?.title || tab?.url || ''}
        aria-label="Tab favicon and security status">
        {#if faviconContent.type === 'security'}
            <SecurityIndicator {tab} {size} />
        {:else if faviconContent.type === 'image'}
            <img src={faviconContent.src} alt="favicon" class="favicon" />
        {:else if faviconContent.type === 'svg'}
            {@html faviconContent.markup}
        {:else if faviconContent.type === 'newTab'}
            {@render newTabIcon()}
        {:else}
            {@render globeIcon()}
        {/if}
    </span>
{:else}
    <span class="favicon-wrapper" class:small={size === 'small'}>
        {#if faviconContent.type === 'security'}
            <SecurityIndicator {tab} {size} />
        {:else if faviconContent.type === 'image'}
            <img src={faviconContent.src} alt="favicon" class="favicon" />
        {:else if faviconContent.type === 'svg'}
            {@html faviconContent.markup}
        {:else if faviconContent.type === 'newTab'}
            {@render newTabIcon()}
        {:else}
            {@render globeIcon()}
        {/if}
    </span>
{/if}

<style>
    .favicon-display {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        padding: 0;
        border-radius: 3px;
        width: 100%;
        height: 100%;
        overflow: hidden;
    }
    
    .favicon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        border-radius: 3px;
        font-size: 16px;
        line-height: 1;
    }
    
    .favicon-wrapper.small {
        width: 12px;
        height: 12px;
    }
    
    .favicon-wrapper.small .favicon,
    .favicon-wrapper.small :global(svg) {
        max-width: 12px;
        max-height: 12px;
    }
    
    .favicon {
        width: 100%;
        height: 100%;
        max-width: 16px;
        max-height: 16px;
        object-fit: contain;
        border-radius: 3px;
    }
    
    :global(.favicon-display svg),
    :global(.favicon-wrapper svg) {
        width: 100%;
        height: 100%;
        max-width: 16px;
        max-height: 16px;
        color: white;
        flex-shrink: 0;
    }
    
    /* Sidebar favicon opacity states - only target favicons inside sidebar elements */
    :global(.sidebar .favicon-wrapper) {
        opacity: 0.6;
    }
    
    :global(.sidebar .pinned-tab:hover .favicon-wrapper),
    :global(.sidebar .app-tab:hover .favicon-wrapper), 
    :global(.sidebar .tab-item:hover .favicon-wrapper),
    :global(.sidebar .closed-tab-item:hover .favicon-wrapper) {
        opacity: 1;
    }
</style>

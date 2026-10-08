<script>
    import SecurityIndicator from './SecurityIndicator.svelte'
    import data from '../data.svelte.js'
    
    let { tab, security = null, showButton = true, size = 'normal' } = $props()
    let failedFaviconSrc = $state(null)

    function getFaviconSrc(favicon) {
        if (!favicon?.startsWith?.('http')) return favicon

        try {
            const faviconUrl = new URL(favicon)
            if (faviconUrl.hostname.endsWith('.gstatic.com') && faviconUrl.pathname === '/faviconV2') {
                faviconUrl.searchParams.set('drop_404_icon', 'true')
                return faviconUrl.toString()
            }
        } catch {}

        return favicon
    }
    
    // Use reactive doc data for url/favicon, falling back to prop
    const reactiveTab = $derived({
        ...tab,
        url: data.docs[tab?.id]?.url ?? tab?.url,
        favicon: data.docs[tab?.id]?.favicon ?? tab?.favicon,
        title: data.docs[tab?.id]?.title ?? tab?.title
    })
    
    // Derive security status if not provided
    const securityStatus = $derived(() => {
        if (security !== null) return security
        
        if (!reactiveTab?.url) return null
        
        // Skip security checks for about: URLs - they don't have origins
        if (reactiveTab.url.startsWith('about:')) return null
        
        try {
            const origin = new URL(reactiveTab.url).origin
            const originData = data.origins[origin]
            
            return {
                hasError: originData?.certificateError || 
                         originData?.hasSecurityWarning || 
                         originData?.mixedContent || 
                         originData?.securityState === 'mixed' || 
                         (originData?.securityState === 'insecure' && reactiveTab.url?.startsWith('https:')),
                originData
            }
        } catch (error) {
            return null
        }
    })
    
    const faviconContent = $derived.by(() => {
        const url = reactiveTab?.url
        const favicon = reactiveTab?.favicon
        
        // New tab icon - check URL FIRST before anything else
        // This ensures about: pages always show correct icon regardless of any other state
        if (url?.startsWith?.('about:newtab') || url?.startsWith?.('about:blank')) {
            return { type: 'newTab' }
        }
        
        // Security indicator takes precedence for non-about: URLs
        if (securityStatus()?.hasError) {
            return { type: 'security', component: SecurityIndicator }
        }

        // Custom favicon - check if it's SVG markup or URL
        // But skip if favicon URL doesn't match current URL's domain (stale favicon)
        if (favicon) {
            // Skip stale favicons from different domains
            if (favicon.startsWith('http') && url) {
                try {
                    const faviconUrlParam = new URL(favicon).searchParams.get('url')
                    if (faviconUrlParam) {
                        const faviconDomain = new URL(faviconUrlParam).hostname
                        const currentDomain = new URL(url).hostname
                        if (faviconDomain !== currentDomain) {
                            return { type: 'fallback' }
                        }
                    }
                } catch {}
            }
            
            if (favicon.startsWith('<svg') || favicon.includes('viewBox')) {
                return { type: 'svg', markup: favicon }
            } else if (favicon.startsWith('http') || favicon.startsWith('data:')) {
                const src = getFaviconSrc(favicon)
                return src === failedFaviconSrc
                    ? { type: 'fallback' }
                    : { type: 'image', src }
            } else {
                return { type: 'svg', markup: favicon }
            }
        }
        
        return { type: 'fallback' }
    })

    function handleFaviconError(src) {
        failedFaviconSrc = src
    }
</script>

{#snippet newTabIcon()}
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="new-tab-icon w-4 h-4">
        <!-- central plus -->
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12M6 12h12" />
        <!-- subtle rays -->
        <path stroke-linecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2M5.8 5.8l1.3 1.3M16.9 16.9l1.3 1.3M5.8 18.2l1.3-1.3M16.9 7.1l1.3-1.3" />
    </svg>
{/snippet}

{#snippet fallbackIcon()}
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" class="fallback-favicon w-4 h-4">
        <circle cx="12" cy="12" r="8.25" />
        <path d="M3.75 12h16.5M12 3.75c2.15 2.25 3.25 5 3.25 8.25S14.15 18 12 20.25C9.85 18 8.75 15.25 8.75 12S9.85 6 12 3.75Z" />
    </svg>
{/snippet}

{#if showButton}
    <span 
        class="favicon-display" 
        class:small={size === 'small'}
        title={reactiveTab?.title || reactiveTab?.url || ''}
        aria-label="Tab favicon and security status">
        {#if faviconContent.type === 'security'}
            <SecurityIndicator {tab} {size} />
        {:else if faviconContent.type === 'image'}
            <img src={faviconContent.src} alt="" class="favicon" draggable="false" onerror={() => handleFaviconError(faviconContent.src)} />
        {:else if faviconContent.type === 'svg'}
            {@html faviconContent.markup}
        {:else if faviconContent.type === 'newTab'}
            {@render newTabIcon()}
        {:else}
            {@render fallbackIcon()}
        {/if}
    </span>
{:else}
    <span class="favicon-wrapper" class:small={size === 'small'}>
        {#if faviconContent.type === 'security'}
            <SecurityIndicator {tab} {size} />
        {:else if faviconContent.type === 'image'}
            <img src={faviconContent.src} alt="" class="favicon" draggable="false" onerror={() => handleFaviconError(faviconContent.src)} />
        {:else if faviconContent.type === 'svg'}
            {@html faviconContent.markup}
        {:else if faviconContent.type === 'newTab'}
            {@render newTabIcon()}
        {:else}
            {@render fallbackIcon()}
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
        opacity: 0.8;
    }
    
    /* Hibernated tabs should have more transparent favicons */
    :global(.sidebar .hibernated .favicon-wrapper) {
        opacity: 0.3;
    }
    
    /* Hibernated active tabs from inactive spaces should have reduced transparency */
    :global(.sidebar .tab-item-container.hibernated.space-active-tab .favicon-wrapper) {
        opacity: 0.45;
    }
    
    :global(.sidebar .pinned-tab:hover .favicon-wrapper),
    :global(.sidebar .app-tab:hover .favicon-wrapper), 
    :global(.sidebar .tab-item:hover .favicon-wrapper),
    :global(.sidebar .tab-item-container:hover .favicon-wrapper),
    :global(.sidebar .closed-tab-item:hover .favicon-wrapper) {
        opacity: 1;
    }
</style>

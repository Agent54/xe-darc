<script>
    import { getTabTitle } from '../lib/tab-title.js'
    import SecurityIndicator from './SecurityIndicator.svelte'
    import data from '../data.svelte.js'
    import Tooltip from './Tooltip.svelte'
    
    let { tab, security = null, showButton = true, size = 'normal' } = $props()
    let failedFaviconSrc = $state(null)

    function getFaviconSrc(favicon) {
        if (!favicon?.startsWith?.('http')) return favicon

        try {
            const faviconUrl = new URL(favicon)
            if (faviconUrl.hostname.endsWith('.gstatic.com') && faviconUrl.pathname === '/faviconV2') {
                // Old saved favicons may contain private paths, credentials or tokens.
                const site = new URL(faviconUrl.searchParams.get('url'))
                if (!['http:', 'https:'].includes(site.protocol)) {
                    return null
                }
                const requestedSize = faviconUrl.searchParams.get('size')
                const size = ['16', '32', '64', '128'].includes(requestedSize) ? requestedSize : '64'
                return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(site.origin)}&size=${size}&drop_404_icon=true`
            }
        } catch {
            return null
        }

        return favicon
    }
    
    // Use reactive doc data for url/favicon, falling back to prop
    const reactiveUrl = $derived(data.docs[tab?.id]?.url ?? tab?.url)
    const currentTab = $derived(data.docs[tab?.id] || tab)
    const reactiveFavicon = $derived(currentTab?.faviconOverride || currentTab?.favicon)
    const reactiveTitle = $derived(getTabTitle(currentTab))
    const loading = $derived(data.frames[tab?.id]?.loading ?? false)
    
    // Derive security status if not provided
    const securityStatus = $derived.by(() => {
        if (security !== null) return security
        
        if (!reactiveUrl) return null
        
        // Skip security checks for about: URLs - they don't have origins
        if (reactiveUrl.startsWith('about:')) return null
        
        try {
            const origin = new URL(reactiveUrl).origin
            const originData = data.origins[origin]
            
            return {
                hasError: originData?.certificateError || 
                         originData?.hasSecurityWarning || 
                         originData?.mixedContent || 
                         originData?.securityState === 'mixed' || 
                         (originData?.securityState === 'insecure' && reactiveUrl.startsWith('https:')),
                originData
            }
        } catch (error) {
            return null
        }
    })
    
    const faviconContent = $derived.by(() => {
        const url = reactiveUrl
        const favicon = reactiveFavicon
        
        // New tab icon - check URL FIRST before anything else
        // This ensures about: pages always show correct icon regardless of any other state
        if (!currentTab?.emojiOverride && !currentTab?.faviconOverride && (url?.startsWith?.('about:newtab') || url?.startsWith?.('about:blank'))) {
            return { type: 'newTab' }
        }
        
        // Security indicator takes precedence for non-about: URLs
        if (securityStatus?.hasError) {
            return { type: 'security', component: SecurityIndicator }
        }

        if (currentTab?.emojiOverride) {
            return { type: 'emoji', emoji: currentTab.emojiOverride }
        }

        // Custom favicon - check if it's SVG markup or URL
        // But skip if favicon URL doesn't match current URL's domain (stale favicon)
        if (favicon) {
            // Skip stale favicons from different domains
            if (!currentTab?.faviconOverride && favicon.startsWith('http') && url) {
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
            
            if (favicon.startsWith('<svg')) {
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

{#snippet loadingIndicator()}
    {#if loading}
        <svg class="favicon-loading-spinner" viewBox="0 0 16 16" role="img" aria-label="Loading page">
            <path d="M8 2 A6 6 0 0 1 14 8" fill="none" stroke="rgba(255, 255, 255, 0.8)" stroke-width="2" stroke-linecap="round" />
        </svg>
    {/if}
{/snippet}

{#snippet audioIndicator()}
    {#if currentTab?.muted || currentTab?.audioPlaying}
        <svg class="favicon-audio-indicator" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label={currentTab.muted ? 'Tab muted' : 'Playing audio'}>
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            {#if currentTab.muted}
                <path d="m16 9 5 6m0-6-5 6" />
            {:else}
                <path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13" />
            {/if}
        </svg>
    {/if}
{/snippet}

{#snippet resumeIndicator()}
    {#if currentTab?.resumedAt && !currentTab.archive}
        <span class="favicon-resumed">
            <Tooltip position="right" delay={250} text={`${currentTab.resumedReason === 'external' ? 'Returned from waiting for external action' : 'Returned from snooze'} on ${new Date(currentTab.resumedAt).toLocaleString()}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Returned from Pending"><path d="M12 2a6 6 0 0 0-6 6v4l-2 4h16l-2-4V8a6 6 0 0 0-6-6Zm-3 16a3 3 0 0 0 6 0H9Z" /></svg>
            </Tooltip>
        </span>
    {/if}
{/snippet}

{#if showButton}
    <span 
        class="favicon-display" 
        class:small={size === 'small'}
        title={reactiveTitle || reactiveUrl || ''}
        aria-label="Tab favicon and security status">
        {#if faviconContent.type === 'security'}
            <SecurityIndicator {tab} {size} />
        {:else if faviconContent.type === 'emoji'}
            <span class="favicon-emoji">{faviconContent.emoji}</span>
        {:else if faviconContent.type === 'image'}
            <img src={faviconContent.src} alt="" class="favicon" draggable="false" onerror={() => handleFaviconError(faviconContent.src)} />
        {:else if faviconContent.type === 'svg'}
            {@html faviconContent.markup}
        {:else if faviconContent.type === 'newTab'}
            {@render newTabIcon()}
        {:else}
            {@render fallbackIcon()}
        {/if}
        {@render loadingIndicator()}
        {@render audioIndicator()}
        {@render resumeIndicator()}
    </span>
{:else}
    <span class="favicon-wrapper" class:small={size === 'small'}>
        {#if faviconContent.type === 'security'}
            <SecurityIndicator {tab} {size} />
        {:else if faviconContent.type === 'emoji'}
            <span class="favicon-emoji">{faviconContent.emoji}</span>
        {:else if faviconContent.type === 'image'}
            <img src={faviconContent.src} alt="" class="favicon" draggable="false" onerror={() => handleFaviconError(faviconContent.src)} />
        {:else if faviconContent.type === 'svg'}
            {@html faviconContent.markup}
        {:else if faviconContent.type === 'newTab'}
            {@render newTabIcon()}
        {:else}
            {@render fallbackIcon()}
        {/if}
        {@render loadingIndicator()}
        {@render audioIndicator()}
        {@render resumeIndicator()}
    </span>
{/if}

<style>
    .favicon-resumed { position: absolute; right: 0; bottom: 0; display: flex; width: 10px; height: 10px; border-radius: 3px; background: #171717; color: #d6bb82; }
    .favicon-resumed :global(svg) { width: 10px !important; height: 10px !important; }
    .favicon-display,
    .favicon-wrapper {
        position: relative;
    }

    .favicon-emoji {
        font-size: 14px;
        line-height: 1;
    }

    .small .favicon-emoji {
        font-size: 12px;
    }

    .favicon-loading-spinner {
        position: absolute;
        inset: 0;
        margin: auto;
        animation: favicon-spin 1s linear infinite;
        pointer-events: none;
    }

    @keyframes favicon-spin {
        to { transform: rotate(360deg); }
    }

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

    .favicon-display .favicon-audio-indicator,
    .favicon-wrapper .favicon-audio-indicator {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 10px;
        height: 10px;
        padding: 1px;
        box-sizing: border-box;
        border-radius: 2px;
        background: #181818;
        pointer-events: none;
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

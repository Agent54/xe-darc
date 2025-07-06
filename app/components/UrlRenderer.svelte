<script>
    let { url = '', variant = 'default', class: className = '' } = $props()
    
    let parsedUrl = $derived.by(() => {
        if (!url || url.startsWith('about:')) {
            return {
                protocol: '',
                origin: '',
                pathname: '',
                search: '',
                hash: '',
                isAbout: true,
                displayText: url === 'about:blank#blocked' ? 'about:newtab' : url
            }
        }
        
        try {
            const urlObj = new URL(url)
            return {
                protocol: urlObj.protocol.replace(':', ''),
                origin: urlObj.hostname + (urlObj.port ? ':' + urlObj.port : ''),
                pathname: urlObj.pathname,
                search: urlObj.search,
                hash: urlObj.hash,
                isAbout: false,
                displayText: url
            }
        } catch (error) {
            return {
                protocol: '',
                origin: '',
                pathname: '',
                search: '',
                hash: '',
                isAbout: true,
                displayText: url
            }
        }
    })
    
    let pathSegments = $derived.by(() => {
        if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
            return []
        }
        return parsedUrl.pathname.split('/').filter(segment => segment !== '')
    })
    
    // Parse query parameters
    let queryParams = $derived.by(() => {
        if (!parsedUrl.search) {
            return []
        }
        
        const params = []
        const searchParams = new URLSearchParams(parsedUrl.search)
        
        for (const [key, value] of searchParams) {
            params.push({
                key: decodeURIComponent(key),
                value: decodeURIComponent(value)
            })
        }
        
        return params
    })
    
    // Check if protocol should be shown (not https)
    let showProtocol = $derived(parsedUrl.protocol && parsedUrl.protocol !== 'https')
    
    // Clean hash without the #
    let cleanHash = $derived(parsedUrl.hash ? parsedUrl.hash.substring(1) : '')
</script>

<div class="url-renderer {className}" class:variant-{variant}>
    {#if parsedUrl.isAbout}
        <span class="about-url">{parsedUrl.displayText}</span>
    {:else}
        {#if showProtocol}
            <span class="protocol-badge" class:http={parsedUrl.protocol === 'http'}>{parsedUrl.protocol}:</span>
        {/if}
        
        {#if parsedUrl.origin}
            <span class="origin">{parsedUrl.origin}</span>
        {/if}
        
        {#if pathSegments.length > 0}
            <span class="path-separator">/</span>
            {#each pathSegments as segment, index}
                <span class="path-segment">{segment}</span>
                {#if index < pathSegments.length - 1}
                    <span class="path-separator">/</span>
                {/if}
            {/each}
        {/if}
        
        {#if queryParams.length > 0}
            <span class="query-start-separator">?</span>
            {#each queryParams as param, index}
                <span class="query-key">{param.key}</span>
                <span class="query-equals-separator">=</span>
                <span class="query-value">{param.value}</span>
                {#if index < queryParams.length - 1}
                    <span class="query-and-separator">&</span>
                {/if}
            {/each}
        {/if}
        
        {#if cleanHash}
            <span class="hash-separator">#</span>
            <span class="hash-value">{cleanHash}</span>
        {/if}
    {/if}
</div>

<style>
    .url-renderer {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        font-size: 13px;
        line-height: 1.2;
        white-space: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        width: 100%;
        gap: 1px;
        scrollbar-width: none;
        -ms-overflow-style: none;
    }
    
    .url-renderer::-webkit-scrollbar {
        display: none;
    }
    
    .about-url {
        color: rgba(255, 255, 255, 0.8);
        font-weight: 500;
    }
    
    .protocol-badge {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        margin-right: 4px;
        border: 1px solid rgba(255, 255, 255, 0.25);
    }
    
    .protocol-badge.http {
        background: rgba(255, 140, 0, 0.2);
        color: rgba(255, 140, 0, 1);
        border: 1px solid rgba(255, 140, 0, 0.4);
    }
    
    .origin {
        font-weight: 700;
        color: rgba(255, 255, 255, 0.95);
        margin-right: 2px;
    }
    
    .path-separator {
        color: #555555;
        font-weight: 800;
        margin: 0 2px 0 1px;
    }
    
    .path-segment {
        color: rgba(255, 255, 255, 0.95);
        font-weight: 300;
    }
    
    .query-start-separator {
        color: #555555;
        font-weight: 800;
        margin: 0 3px 0 12px;
    }
    
    .query-equals-separator {
        color: #777777;
        font-weight: 800;
        margin: 0 2px;
    }
    
    .query-and-separator {
        color: #555555;
        font-weight: 800;
        margin: 0 3px 0 12px;
    }
    
    .query-key {
        color: rgba(255, 255, 255, 0.95);
        font-weight: 500;
    }
    
    .query-value {
        color: rgba(255, 255, 255, 0.95);
        font-weight: 300;
    }
    
    .hash-separator {
        color: #555555;
        font-weight: 800;
        margin: 0 3px 0 15px;
    }
    
    .hash-value {
        color: rgba(255, 255, 255, 0.95);
        font-weight: 400;
    }
    
    /* Variant styles */
    .variant-compact {
        font-size: 12px;
        gap: 0;
    }
    
    .variant-compact .protocol-badge {
        font-size: 10px;
        padding: 1px 4px;
        margin-right: 3px;
    }
    
    .variant-compact .origin {
        margin-right: 1px;
    }
    
    .variant-compact .path-separator,
    .variant-compact .query-start-separator,
    .variant-compact .query-equals-separator,
    .variant-compact .query-and-separator,
    .variant-compact .hash-separator {
        margin: 0;
    }
    
    .variant-large {
        font-size: 14px;
        gap: 2px;
    }
    
    .variant-large .protocol-badge {
        font-size: 12px;
        padding: 3px 8px;
        margin-right: 6px;
    }
    
    .variant-large .origin {
        margin-right: 3px;
    }
    
    .variant-large .path-separator,
    .variant-large .query-start-separator,
    .variant-large .query-and-separator {
        margin: 0 2px;
    }
    
    .variant-large .query-equals-separator {
        margin: 0 2px;
    }
    
    .variant-large .hash-separator {
        margin: 0 2px 0 3px;
    }
    
    /* Badge variant for small spaces */
    .variant-badge {
        font-size: 11px;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 8px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        gap: 1px;
        max-width: 200px;
        overflow: hidden;
    }
    
    .variant-badge .protocol-badge {
        font-size: 9px;
        padding: 1px 3px;
        margin-right: 2px;
    }
    
    .variant-badge .origin {
        margin-right: 1px;
    }
    
    .variant-badge .path-separator,
    .variant-badge .query-start-separator,
    .variant-badge .query-equals-separator,
    .variant-badge .query-and-separator,
    .variant-badge .hash-separator {
        margin: 0;
    }
</style> 
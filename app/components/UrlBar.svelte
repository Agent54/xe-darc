<script>
    import UrlRenderer from './UrlRenderer.svelte'
    import data from '../data.svelte.js'
    
    let { 
        url = '',
        tabId = null,
        expanded = false,
        showDevTools = false,
        showSettingsButton = false,
        showCloseButton = true,
        isClosedTab = false,
        onGoBack = null,
        onGoForward = null,
        onReload = null,
        onCloseTab = null,
        onDevTools = null,
        onSettings = null,
        onExpandedChange = null,
        variant = 'default',
        enableHoverExpand = true
    } = $props()
    
    let urlBarExpanded = $state(expanded)
    let urlInput = $state(null)
    let urlInputValue = $state('')
    let copyUrlSuccess = $state(false)
    let urlBarContainer = $state(null)
    let maxExpandedWidth = $state(null)
    let isHovered = $state(false)
    let urlButtonEl = $state(null)
    let showLeftFade = $state(false)
    let showRightFade = $state(true)
    
    function calculateMaxWidth() {
        if (urlBarContainer && variant === 'hovercard') {
            const rect = urlBarContainer.getBoundingClientRect()
            maxExpandedWidth = Math.min(600, window.innerWidth - rect.left - 20)
        }
    }
    
    function handleMouseEnter() {
        isHovered = true
        if (enableHoverExpand) {
            calculateMaxWidth()
        }
    }
    
    function handleMouseLeave() {
        if (!urlBarExpanded) {
            isHovered = false
            maxExpandedWidth = null
        }
    }
    
    function handleUrlScroll(e) {
        const el = e.target
        const isAtStart = el.scrollLeft <= 1
        const isAtEnd = el.scrollWidth - el.scrollLeft <= el.clientWidth + 1
        const hasOverflow = el.scrollWidth > el.clientWidth
        showLeftFade = hasOverflow && !isAtStart
        showRightFade = hasOverflow && !isAtEnd
    }
    
    function initUrlFade(el) {
        if (!el) return
        const hasOverflow = el.scrollWidth > el.clientWidth
        showLeftFade = false
        showRightFade = hasOverflow
    }
    
    $effect(() => {
        urlBarExpanded = expanded
    })
    
    $effect(() => {
        if (urlBarExpanded && urlInput) {
            urlInputValue = url || ''
            setTimeout(() => {
                urlInput.focus()
                urlInput.select()
            }, 1)
        }
    })
    
    function setExpanded(value) {
        if (value) {
            calculateMaxWidth()
        } else {
            maxExpandedWidth = null
            isHovered = false
        }
        urlBarExpanded = value
        if (onExpandedChange) onExpandedChange(value)
    }
    
    function handleUrlSubmit() {
        if (!urlInputValue.trim() || !tabId) {
            setExpanded(false)
            return
        }
        
        try {
            let parsedUrl = new URL(urlInputValue)
            data.navigate(tabId, parsedUrl.href)
        } catch {
            const defaultSearchEngine = localStorage.getItem('defaultSearchEngine') || 'google'
            let searchUrl
            
            switch (defaultSearchEngine) {
                case 'kagi':
                    searchUrl = new URL('https://kagi.com/search')
                    break
                case 'custom':
                    const customUrl = localStorage.getItem('customSearchUrl')
                    if (customUrl) {
                        try {
                            searchUrl = new URL(customUrl + encodeURIComponent(urlInputValue))
                            data.navigate(tabId, searchUrl.href)
                            setExpanded(false)
                            return
                        } catch {
                            searchUrl = new URL('https://www.google.com/search')
                        }
                    } else {
                        searchUrl = new URL('https://www.google.com/search')
                    }
                    break
                default:
                    searchUrl = new URL('https://www.google.com/search')
                    break
            }
            
            searchUrl.searchParams.set('q', urlInputValue)
            data.navigate(tabId, searchUrl.href)
        }
        
        setExpanded(false)
    }
    
    async function handleCopyUrlClick(e) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (url) {
            try {
                await navigator.clipboard.writeText(url)
                copyUrlSuccess = true
                setTimeout(() => {
                    copyUrlSuccess = false
                }, 1500)
            } catch (err) {
                console.error('Failed to copy URL:', err)
            }
        }
    }
    
    function handleBackClick(e) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (onGoBack) onGoBack()
    }
    
    function handleForwardClick(e) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (onGoForward) onGoForward()
    }
    
    function handleReloadClick(e) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (onReload) onReload()
    }
    
    function handleCloseTabClick(e) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (onCloseTab) onCloseTab()
    }
    
    function handleDevToolsClick(e) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (onDevTools) onDevTools()
    }
    
    function handleSettingsClick(e) {
        e?.preventDefault?.()
        e?.stopPropagation?.()
        if (onSettings) onSettings()
    }
</script>

<div class="url-bar-section" class:hovercard={variant === 'hovercard'} class:hover-expand-enabled={enableHoverExpand}
     role="group"
     onmouseenter={handleMouseEnter}
     onmouseleave={handleMouseLeave}>
    <div class="url-bar-wrapper">
        <div class="url-bar-container" 
             bind:this={urlBarContainer}
             class:expanded={urlBarExpanded}
             style={maxExpandedWidth ? `width: ${maxExpandedWidth}px;` : ''}
             role="toolbar"
             tabindex="0"
             aria-label="URL bar with navigation controls">
            
            {#if urlBarExpanded}
                <input bind:this={urlInput} 
                       bind:value={urlInputValue} 
                       class="url-bar-input"
                       onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUrlSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); setExpanded(false); } }} 
                       onblur={() => { setExpanded(false) }} />
            {:else}
                <button class="url-bar-url" 
                        class:fade-left={showLeftFade}
                        class:fade-right={showRightFade}
                        bind:this={urlButtonEl}
                        use:initUrlFade
                        onscroll={handleUrlScroll}
                        onmousedown={() => { if (!urlBarExpanded) { setExpanded(true); } }}>
                    <UrlRenderer url={url} variant="compact" />
                </button>
            {/if}
        </div>
        
        <div class="url-bar-controls">
            {#if !isClosedTab}
                <button class="url-bar-button" title="Back" aria-label="Back" onmousedown={handleBackClick}>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                </button>
                <button class="url-bar-button" title="Forward" aria-label="Forward" onmousedown={handleForwardClick}>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                </button>
                <button class="url-bar-button" title="Reload" aria-label="Reload" onmousedown={handleReloadClick}>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                </button>
            {/if}
            {#if showDevTools}
                <button class="url-bar-button" title="Open Developer Tools" aria-label="Open Developer Tools" onmousedown={handleDevToolsClick}>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                    </svg>
                </button>
            {/if}
            {#if showSettingsButton}
                <button class="url-bar-button" title="Settings" aria-label="Settings" onmousedown={handleSettingsClick}>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                </button>
            {/if}
            <button class="url-bar-button" 
                    class:success={copyUrlSuccess}
                    title={copyUrlSuccess ? "Copied!" : "Copy URL"} 
                    aria-label={copyUrlSuccess ? "Copied!" : "Copy URL"} 
                    onmousedown={handleCopyUrlClick}>
                {#if copyUrlSuccess}
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                {:else}
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                    </svg>
                {/if}
            </button>
            {#if showCloseButton && !isClosedTab}
                <button class="url-bar-button" title="Close Tab" aria-label="Close Tab" onmousedown={handleCloseTabClick}>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
            {/if}
        </div>
    </div>
</div>

<style>
    .url-bar-section {
        flex-shrink: 0;
        padding-bottom: 12px;
    }
    
    .url-bar-section.hovercard {
        padding-bottom: 0;
        margin-top: 8px;
        position: relative;
        z-index: 10;
    }
    
    .url-bar-wrapper {
        position: relative;
    }
    
    .hovercard .url-bar-wrapper {
        margin-left: -10px;
    }
    
    .url-bar-container {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px 4px 8px;
        border-radius: 10px;
        background: rgb(255 255 255 / 5%);
        cursor: default;
        transition: all 250ms ease;
        border: 1px solid hsl(0deg 0% 100% / 2%);
        height: 36px;
        flex-shrink: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        width: calc(100% - 6px);
        margin: -4px 4px;
        position: relative;
        overflow: hidden;
    }
    
    .hovercard .url-bar-container {
        width: calc(100% + 9px);
        margin: 0;
        height: 32px;
        border-radius: 8px;
        z-index: 20;
        background: rgb(255 255 255 / 5%);
    }
    
    .url-bar-container:not(.expanded):not(:hover) {
        transition-delay: 0ms;
    }
    
    .url-bar-container.expanded {
        width: min(600px, 90vw);
        background: rgba(0, 0, 0, 0.98);
        backdrop-filter: blur(20px);
        border: 1px solid hsl(0deg 0% 100% / 10%);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        z-index: 2000;
    }
    
    .hovercard .url-bar-container.expanded {
        background: rgba(0, 0, 0, 0.95);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    }
    
    .url-bar-section.hover-expand-enabled:hover .url-bar-container:not(.expanded) {
        width: min(600px, 90vw);
        background: rgba(0, 0, 0, 0.98);
        backdrop-filter: blur(20px);
        border: 1px solid hsl(0deg 0% 100% / 10%);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        z-index: 1000;
        transition-delay: 200ms;
    }
    
    .url-bar-section.hovercard.hover-expand-enabled:hover .url-bar-container:not(.expanded) {
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border: 1px solid hsl(0deg 0% 100% / 10%);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        transition-delay: 0ms;
        overflow: visible;
    }
    
    .url-bar-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
        position: absolute;
        top: 100%;
        left: 4px;
        margin-top: 4px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 150ms ease, visibility 150ms ease;
        background: rgba(0, 0, 0, 0.95);
        padding: 2px 4px;
        border-radius: 6px;
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        z-index: 100;
        box-shadow: 1px 16px 10px 10px #000000bf;
    }
    
    .hovercard .url-bar-controls {
        left: 0;
        margin-top: 2px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }
    
    .url-bar-section.hover-expand-enabled .url-bar-wrapper:hover .url-bar-controls {
        opacity: 1;
        visibility: visible;
    }
    
    .url-bar-section.hover-expand-enabled:not(.hovercard):hover .url-bar-controls {
        opacity: 1;
        visibility: visible;
        transition-delay: 200ms;
    }
    
    .url-bar-button {
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.6);
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        padding: 0;
    }
    
    .url-bar-button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.9);
    }
    
    .url-bar-button .w-4 {
        width: 14px;
        height: 14px;
    }
    
    .url-bar-url {
        flex: 1;
        min-width: 0;
        max-width: 100%;
        margin: 0 7px 0 7px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 12px;
        font-family: 'SF Mono', Consolas, monospace;
        font-weight: 400;
        overflow-x: auto;
        overflow-y: hidden;
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        padding: 0;
        transition: color 150ms ease;
        scrollbar-width: none;
        -ms-overflow-style: none;
    }
    
    .url-bar-url::-webkit-scrollbar {
        display: none;
    }
    
    .url-bar-url {
        -webkit-mask-image: none;
        mask-image: none;
    }
    
    .url-bar-url.fade-right {
        -webkit-mask-image: linear-gradient(to right, black calc(100% - 20px), transparent 100%);
        mask-image: linear-gradient(to right, black calc(100% - 20px), transparent 100%);
    }
    
    .url-bar-url.fade-left {
        -webkit-mask-image: linear-gradient(to left, black calc(100% - 20px), transparent 100%);
        mask-image: linear-gradient(to left, black calc(100% - 20px), transparent 100%);
    }
    
    .url-bar-url.fade-left.fade-right {
        -webkit-mask-image: linear-gradient(to right, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%);
        mask-image: linear-gradient(to right, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%);
    }
    
    .url-bar-url :global(.url-renderer) {
        overflow: visible !important;
    }
    
    .hovercard .url-bar-url {
        margin-left: 5px;
        margin-top: -1px;
    }
    
    .url-bar-url:hover {
        color: rgba(255, 255, 255, 0.9);
    }
    
    .url-bar-input {
        z-index: 2000;
        width: 100%;
        color: white;
        font-size: 12px;
        border: none;
        outline: none;
        background: transparent;
        padding: 8px 8px 8px 7px;
        font-family: 'SF Mono', Consolas, monospace;
    }
    
    .hovercard .url-bar-input {
        padding-left: 5px;
    }
    
    .url-bar-button.success {
        color: #22c55e !important;
        background: rgba(34, 197, 94, 0.1) !important;
    }
</style>

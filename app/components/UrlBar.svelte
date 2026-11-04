<script>
    import UrlRenderer from './UrlRenderer.svelte'
    import TabActionButtons from './TabActionButtons.svelte'
    import data from '../data.svelte.js'
    import { overflowPopover } from '../lib/overflow-popover.js'
    import { tick, untrack } from 'svelte'
    
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
        onNavigate = null,
        variant = 'default',
        enableHoverExpand = true,
        escapeOverflow = false
    } = $props()
    
    let urlBarExpanded = $state(false)
    let urlInput = $state(null)
    let urlInputValue = $state('')
    let copyUrlSuccess = $state(false)
    let urlBarContainer = $state(null)
    let maxExpandedWidth = $state(null)
    let isHovered = $state(false)
    let urlButtonEl = $state(null)
    let showLeftFade = $state(false)
    let showRightFade = $state(true)
    let urlBarSection = $state(null)
    
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
        if (expanded) urlInputValue = untrack(() => url || '')
        urlBarExpanded = expanded
    })
    
    $effect(() => {
        if (urlBarExpanded && urlInput) {
            const input = urlInput
            tick().then(() => {
                if (urlInput !== input || !urlBarExpanded) return
                input.focus()
                input.select()
            })
        }
    })
    
    function setExpanded(value) {
        if (value) {
            if (!urlBarExpanded) urlInputValue = url || ''
            calculateMaxWidth()
        } else {
            maxExpandedWidth = null
            isHovered = false
        }
        urlBarExpanded = value
        if (onExpandedChange) onExpandedChange(value)
    }

    export async function focusLocation() {
        urlInputValue = url || ''
        setExpanded(true)
        await tick()
        urlInput?.focus()
        urlInput?.select()
    }
    
    function handleUrlSubmit() {
        if (!urlInputValue.trim() || (!tabId && !onNavigate)) {
            setExpanded(false)
            return
        }
        
        try {
            let parsedUrl = new URL(urlInputValue)
            navigate(parsedUrl.href)
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
                            navigate(searchUrl.href)
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
            navigate(searchUrl.href)
        }
        
        setExpanded(false)
    }

    function navigate(url) {
        if (onNavigate) onNavigate(url)
        else data.navigate(tabId, url)
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
</script>

<svelte:window ondarc-dismiss-overlays={() => setExpanded(false)} />

<div class="url-bar-section" class:hovercard={variant === 'hovercard'} class:hover-expand-enabled={enableHoverExpand}
     bind:this={urlBarSection}
     role="group"
     onmouseenter={handleMouseEnter}
     onmouseleave={handleMouseLeave}>
    <div class="url-bar-wrapper" use:overflowPopover={{ open: escapeOverflow && (urlBarExpanded || (isHovered && enableHoverExpand)), anchor: urlBarSection }}>
        <div class="url-bar-container" 
             bind:this={urlBarContainer}
             class:expanded={urlBarExpanded}
             class:hover-expanded={isHovered && enableHoverExpand}
             style={maxExpandedWidth ? `width: ${maxExpandedWidth}px;` : ''}
             role="toolbar"
             tabindex="0"
             aria-label="URL bar with navigation controls">
            
            {#if urlBarExpanded}
                <input bind:this={urlInput} 
                       aria-label="Tab URL"
                       bind:value={urlInputValue} 
                       class="url-bar-input"
                       onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleUrlSubmit(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setExpanded(false); } }} 
                       onblur={() => { setExpanded(false) }} />
            {:else}
                <button class="url-bar-url" 
                        class:fade-left={showLeftFade}
                        class:fade-right={showRightFade}
                        bind:this={urlButtonEl}
                        use:initUrlFade
                        onscroll={handleUrlScroll}
                        onmousedown={(event) => { if (event.button === 0) { event.preventDefault(); event.stopPropagation(); setExpanded(true) } }}
                        onclick={(event) => { if (event.detail === 0) setExpanded(true) }}>
                    <UrlRenderer url={url} variant="compact" />
                </button>
            {/if}
        </div>
        
        <div class="url-bar-controls">
            <TabActionButtons {variant} {isClosedTab} {showDevTools} {showSettingsButton} {showCloseButton}
                {copyUrlSuccess} {onGoBack} {onGoForward} {onReload} {onDevTools} {onSettings} {onCloseTab}
                onCopyUrl={handleCopyUrlClick} />
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
        min-height: 32px;
    }
    
    .url-bar-wrapper {
        position: relative;
    }
    
    .hovercard .url-bar-wrapper {
        margin-left: -10px;
    }

    .url-bar-wrapper:popover-open {
        position: fixed;
        inset: auto;
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        overflow: visible;
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
        min-width: calc(100% + 9px);
        margin: 0;
        height: 32px;
        border-radius: 8px;
        z-index: 20;
        background: var(--url-bar-idle-background, rgb(255 255 255 / 5%));
        border-color: var(--url-bar-idle-border, rgb(255 255 255 / 2%));
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
        background: #161616;
        border-color: rgb(255 255 255 / 4%);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        transition-property: width, box-shadow, border-color;
    }
    
    .url-bar-section.hover-expand-enabled .url-bar-container.hover-expanded:not(.expanded) {
        width: min(600px, 90vw);
        background: rgba(0, 0, 0, 0.98);
        backdrop-filter: blur(20px);
        border: 1px solid hsl(0deg 0% 100% / 10%);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        z-index: 1000;
        transition-delay: 200ms;
    }
    
    .url-bar-section.hovercard.hover-expand-enabled .url-bar-container.hover-expanded:not(.expanded) {
        background: #161616;
        backdrop-filter: blur(20px);
        border: 1px solid rgb(255 255 255 / 4%);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
        transition-property: width, box-shadow, border-color;
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

    .url-bar-controls::before {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: -6px;
        height: 6px;
    }
    
    .hovercard .url-bar-controls {
        left: 0;
        margin-top: 4px;
        padding: 4px;
        border-radius: 8px;
        background: var(--menu-background, rgb(0 0 0 / 95%));
        box-shadow: var(--menu-shadow, 0 4px 12px rgb(0 0 0 / 40%));
    }

    .url-bar-wrapper:focus-within .url-bar-controls,
    .url-bar-wrapper:has(.expanded) .url-bar-controls {
        opacity: 1;
        visibility: visible;
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
</style>

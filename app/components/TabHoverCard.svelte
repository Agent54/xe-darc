<script>
    import UrlRenderer from './UrlRenderer.svelte'
    import AttachmentImage from './AttachmentImage.svelte'
    import Favicon from './Favicon.svelte'
    import UrlBar from './UrlBar.svelte'
    import data from '../data.svelte.js'
    
    let { 
        tab, 
        onMouseLeave, 
        isClosedTab = false, 
        showHistoryImmediately = false,
        instantMode = false,
        showDevTools = false,
        onGoBack = null,
        onGoForward = null,
        onReload = null,
        onCloseTab = null,
        onDevTools = null,
        onUrlBarExpandedChange = null,
        onHistoryVisibilityChange = null,
        availableHeight = null
    } = $props()
    
    const HEADER_HEIGHT = 100
    const SCREENSHOT_HEIGHT = 180
    const HISTORY_TITLE_HEIGHT = 30
    const MIN_HISTORY_HEIGHT = 100
    
    let historyMaxHeight = $derived(() => {
        const maxFromVh = window.innerHeight * 0.5
        if (!availableHeight) return `${maxFromVh}px`
        const contentHeight = HEADER_HEIGHT + (tab?.screenshot ? SCREENSHOT_HEIGHT : 0) + HISTORY_TITLE_HEIGHT
        const remaining = availableHeight - contentHeight
        const height = Math.min(Math.max(remaining, MIN_HISTORY_HEIGHT), maxFromVh)
        return `${height}px`
    })
    
    async function openTabHistory() {
        const historyTab = await data.newTab(data.spaceMeta.activeSpace, {
            url: `about:tabhistory#${tab.id}`,
            title: `History - ${tab.title || 'Untitled'}`,
            pinned: 'right'
        })
        if (historyTab) {
            data.activate(historyTab.id)
        }
    }
    
    let hovercardHovered = $state(false)
    let showHistory = $state(false)
    let showDelayedElements = $state(false)
    let historyShowTimer = null
    let delayedElementsTimer = null
    let hoveredHistoryEntry = $state(null)
    let hoveredEntryIndex = $state(null)
    
    // Check if an entry is in the direct lineage (predecessor) of the hovered entry
    function isInLineage(entryIndex) {
        if (hoveredEntryIndex === null) return false
        // All entries after the hovered one (higher index = older = predecessor)
        return entryIndex > hoveredEntryIndex
    }
    let urlBarExpanded = $state(false)
    let copiedEntryId = $state(null)
    
    function handleScrollFade(event) {
        const el = event.target
        // el could be the wrapper itself or an inner element
        const wrapper = el.classList.contains('history-url-wrapper') || el.classList.contains('history-title-scroll-wrapper') 
            ? el 
            : el.parentElement
        const fadeLeft = wrapper?.querySelector('.fade-left')
        const fadeRight = wrapper?.querySelector('.fade-right')
        
        // For wrappers with inner content, check the content element for width
        const contentEl = wrapper?.querySelector('.url-renderer') || wrapper?.querySelector('.history-title') || el
        const scrollContainer = wrapper?.classList.contains('history-url-wrapper') || wrapper?.classList.contains('history-title-scroll-wrapper')
            ? wrapper
            : el
        const contentWidth = contentEl.scrollWidth
        
        const isAtStart = scrollContainer.scrollLeft <= 1
        const isAtEnd = contentWidth - scrollContainer.scrollLeft <= scrollContainer.clientWidth + 1
        const hasOverflow = contentWidth > scrollContainer.clientWidth
        
        if (fadeLeft) fadeLeft.style.opacity = (hasOverflow && !isAtStart) ? '1' : '0'
        if (fadeRight) fadeRight.style.opacity = (hasOverflow && !isAtEnd) ? '1' : '0'
    }
    
    function initScrollFade(wrapper) {
        if (!wrapper) return
        const fadeLeft = wrapper.querySelector('.fade-left')
        const fadeRight = wrapper.querySelector('.fade-right')
        
        // Determine scroll container and content element
        const isUrlWrapper = wrapper.classList.contains('history-url-wrapper')
        const isTitleScrollWrapper = wrapper.classList.contains('history-title-scroll-wrapper')
        const scrollContainer = (isUrlWrapper || isTitleScrollWrapper) ? wrapper : wrapper.querySelector('.hovercard-title, .history-title')
        const contentEl = wrapper.querySelector('.url-renderer') || wrapper.querySelector('.history-title') || wrapper.querySelector('.hovercard-title')
        
        if (!scrollContainer || !contentEl) return
        
        function checkOverflow() {
            const contentWidth = contentEl.scrollWidth
            const containerWidth = scrollContainer.clientWidth
            const hasOverflow = contentWidth > containerWidth
            if (fadeLeft) fadeLeft.style.opacity = '0'
            if (fadeRight) fadeRight.style.opacity = hasOverflow ? '1' : '0'
        }
        
        // Use ResizeObserver to detect when content actually renders
        const observer = new ResizeObserver(() => {
            checkOverflow()
        })
        observer.observe(contentEl)
        
        // Also check immediately after a frame
        requestAnimationFrame(checkOverflow)
    }
    
    async function copyUrl(url, entryId) {
        await navigator.clipboard.writeText(url)
        copiedEntryId = entryId
        setTimeout(() => {
            if (copiedEntryId === entryId) copiedEntryId = null
        }, 1000)
    }
    
    function handleUrlBarExpandedChange(expanded) {
        urlBarExpanded = expanded
        if (onUrlBarExpandedChange) onUrlBarExpandedChange(expanded)
    }
    
    function formatRelativeTime(timestamp) {
        const now = Date.now()
        const diff = now - timestamp
        const seconds = Math.floor(diff / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)
        
        if (seconds < 60) return 'just now'
        if (minutes < 60) return `${minutes}m ago`
        if (hours < 24) return `${hours}h ago`
        if (days < 7) return `${days}d ago`
        return new Date(timestamp).toLocaleDateString()
    }
    
    function formatAbsoluteTime(timestamp) {
        return new Date(timestamp).toLocaleString()
    }
    
    // Hardcoded debug history entries (history entries not yet implemented)
    // Order: youngest to oldest (top to bottom), tab opened at the end
    const debugHistoryEntries = [
        {
            id: 'nav5',
            type: 'navigation',
            title: 'Blog - Latest Updates',
            url: 'https://example.com/blog',
            timestamp: Date.now() - 1000 * 60 * 5,
            isCurrent: false,
            isLeaf: false
        },
        {
            id: 'nav4',
            type: 'navigation',
            title: 'Advanced Topics - Performance',
            url: 'https://example.com/docs/advanced/performance',
            timestamp: Date.now() - 1000 * 60 * 10,
            isCurrent: false,
            isLeaf: true
        },
        {
            id: 'nav3',
            type: 'navigation',
            title: 'API Reference',
            url: 'https://example.com/docs/api',
            timestamp: Date.now() - 1000 * 60 * 20,
            isCurrent: false,
            isLeaf: false
        },
        {
            id: 'nav2',
            type: 'navigation',
            title: 'Documentation - Getting Started',
            url: 'https://example.com/docs/getting-started',
            timestamp: Date.now() - 1000 * 60 * 30,
            isCurrent: false,
            isLeaf: true
        },
        {
            id: 'nav1',
            type: 'navigation',
            title: 'Welcome to Example',
            url: 'https://example.com/',
            timestamp: Date.now() - 1000 * 60 * 40,
            isCurrent: false,
            isLeaf: false
        },
        {
            id: 'opened',
            type: 'opened',
            title: 'Tab opened',
            url: tab.url,
            timestamp: Date.now() - 1000 * 60 * 45,
            source: { type: 'clipboard', label: 'from clipboard' },
            isCurrent: false,
            isLeaf: false
        }
    ]
    
    // Add closed entry for closed tabs
    const closedTabEntry = isClosedTab ? [{
        id: 'closed',
        type: 'closed',
        title: 'Tab closed',
        url: tab.url,
        timestamp: Date.now() - 1000 * 60 * 2,
        isCurrent: false,
        isLeaf: false
    }] : []
    
    let historyEntries = $derived([...debugHistoryEntries, ...closedTabEntry])
    
    // Handle showHistoryImmediately (already has delay applied from parent)
    $effect(() => {
        if (showHistoryImmediately && !showHistory) {
            if (historyShowTimer) clearTimeout(historyShowTimer)
            showHistory = true
        }
    })
    
    // Reset showHistory when tab changes
    let previousTabId = null
    $effect(() => {
        const tabId = tab.id
        if (previousTabId !== null && previousTabId !== tabId) {
            showHistory = false
            showDelayedElements = false
            hovercardHovered = false
            if (historyShowTimer) {
                clearTimeout(historyShowTimer)
                historyShowTimer = null
            }
            if (delayedElementsTimer) {
                clearTimeout(delayedElementsTimer)
                delayedElementsTimer = null
            }
        }
        previousTabId = tabId
    })
    
    // Show history after delay when hovering the hovercard
    $effect(() => {
        if (hovercardHovered && !showHistory && !showHistoryImmediately) {
            const delay = 1500
            historyShowTimer = setTimeout(() => {
                showHistory = true
            }, delay)
            
            return () => {
                if (historyShowTimer) {
                    clearTimeout(historyShowTimer)
                    historyShowTimer = null
                }
            }
        }
    })
    
    // Show delayed elements (expand button, full URL) after delay
    $effect(() => {
        if (hovercardHovered && !showDelayedElements) {
            const delay = 300
            delayedElementsTimer = setTimeout(() => {
                showDelayedElements = true
            }, delay)
            
            return () => {
                if (delayedElementsTimer) {
                    clearTimeout(delayedElementsTimer)
                    delayedElementsTimer = null
                }
            }
        } else if (!hovercardHovered && showDelayedElements) {
            showDelayedElements = false
        }
    })
    
    // Notify parent when history visibility changes
    $effect(() => {
        if (onHistoryVisibilityChange) {
            onHistoryVisibilityChange(showHistory)
        }
    })
</script>

<div class="hovercard-content"
     role="tooltip"
     onmouseenter={() => hovercardHovered = true}
     onmouseleave={() => { hovercardHovered = false; onMouseLeave?.() }}>
    <div class="hovercard-info"
         role="region">
        <div class="hovercard-header">
            <div class="hovercard-text">
                <div class="hovercard-title-wrapper" use:initScrollFade>
                    <div class="fade-left"></div>
                    <div class="hovercard-title" onscroll={handleScrollFade}>{tab.title || 'Untitled'}</div>
                    <div class="fade-right"></div>
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
        
        <UrlBar 
            url={tab.url}
            tabId={tab.id}
            {isClosedTab}
            {showDevTools}
            {onGoBack}
            {onGoForward}
            {onReload}
            {onCloseTab}
            {onDevTools}
            showSettingsButton={true}
            variant="hovercard"
            onExpandedChange={handleUrlBarExpandedChange}
            enableHoverExpand={showDelayedElements}
        />
    </div>
    {#if hoveredHistoryEntry?.screenshot}
        <div class="hovercard-screenshot" class:has-history={showHistory && historyEntries.length > 0}>
            {#key hoveredHistoryEntry.id}
                <AttachmentImage src={hoveredHistoryEntry.screenshot} digest={hoveredHistoryEntry._attachments?.screenshot?.digest} alt="Page preview" />
            {/key}
            {#if showDelayedElements}
                <button class="expand-button" aria-label="Expand screenshot">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                </button>
            {/if}
        </div>
    {:else if tab.screenshot}
        <div class="hovercard-screenshot" class:has-history={showHistory && historyEntries.length > 0}>
            {#key tab.id}
                <AttachmentImage src={tab.screenshot} digest={tab._attachments?.screenshot?.digest} alt="Page preview" />
            {/key}
            {#if showDelayedElements}
                <button class="expand-button" aria-label="Expand screenshot">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                </button>
            {/if}
        </div>
    {/if}
    {#if showHistory && historyEntries.length > 0}
        <div class="history-section">
            <div class="history-section-header">
                <button class="history-section-title" onclick={openTabHistory}>
                    Tab History
                    <svg class="expand-icon" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                </button>
                <button class="clear-all-btn" onclick={() => { /* TODO: clear all history */ }} title="Clear all history">
                    Clear all
                </button>
            </div>
            <div class="history-list" style="max-height: {historyMaxHeight()};">
                <div class="history-connector-line"></div>
                {#each historyEntries as historyTab, index}
                <div class="history-item"
                     class:is-leaf={historyTab.isLeaf}
                     class:in-lineage={isInLineage(index)}
                     role="button"
                     tabindex="0"
                     onmouseenter={() => { hoveredHistoryEntry = historyTab; hoveredEntryIndex = index }}
                     onmouseleave={() => { hoveredHistoryEntry = null; hoveredEntryIndex = null }}>
                    <div class="history-icon-wrapper" class:leaf-highlight={historyTab.isLeaf}>
                        {#if historyTab.type === 'opened'}
                            <div class="history-type-icon opened">
                                <svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m6-6H6" />
                                </svg>
                            </div>
                        {:else if historyTab.type === 'closed'}
                            <div class="history-type-icon closed">
                                <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                            </div>
                        {:else}
                            <Favicon tab={historyTab} showButton={false} />
                        {/if}
                    </div>
                    <div class="history-text">
                        <div class="history-title-row">
                            <span class="history-time" title={formatAbsoluteTime(historyTab.timestamp)}>{formatRelativeTime(historyTab.timestamp)}</span>
                            <div class="history-title-scroll-wrapper" use:initScrollFade>
                                <div class="fade-left"></div>
                                <div class="history-title" onscroll={handleScrollFade}>
                                    {historyTab.title || 'Untitled'}
                                    {#if historyTab.source}
                                        <span class="history-source">({historyTab.source.label})</span>
                                    {/if}
                                </div>
                                <div class="fade-right"></div>
                            </div>
                        </div>
                        <div class="history-url-wrapper" use:initScrollFade onscroll={handleScrollFade}>
                            <div class="fade-left"></div>
                            <div class="history-url"><UrlRenderer url={historyTab.url} variant="compact" /></div>
                            <div class="fade-right"></div>
                        </div>
                    </div>
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="history-actions" onclick={(e) => e.stopPropagation()}>
                        <button class="history-action-btn" class:success={copiedEntryId === historyTab.id} onclick={(e) => { e.stopPropagation(); copyUrl(historyTab.url, historyTab.id) }} title="Copy URL">
                            {#if copiedEntryId === historyTab.id}
                                <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                            {:else}
                                <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                                </svg>
                            {/if}
                        </button>
                        <button class="history-action-btn delete" onclick={(e) => { e.stopPropagation(); /* TODO: delete history entry */ }} title="Delete from history" aria-label="Delete from history">
                            <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            {/each}
            </div>
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
        /* overflow-x: hidden; */
        /* overflow-x: hidden;
        overflow-y: visible; */
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2);
        width: 320px;
        max-width: 90vw;
        margin-top: 8px;
        margin-left: 8px;
        clip-path: none;
        display: flex;
        flex-direction: column;
        max-height: 100%;
    }

    .hovercard-info {
        padding: 16px;
        font-family: 'Inter', sans-serif;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        overflow: visible;
        position: relative;
        z-index: 5;
        flex-shrink: 0;
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

    .hovercard-title-wrapper {
        position: relative;
        overflow: hidden;
        margin-bottom: 4px;
        margin-left: 3px;
    }
    
    .hovercard-title {
        font-size: 14px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        line-height: 1.4;
        white-space: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
    }
    
    .hovercard-title::-webkit-scrollbar {
        display: none;
    }
    
    .hovercard-title-wrapper .fade-left,
    .hovercard-title-wrapper .fade-right {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 24px;
        pointer-events: none;
        transition: opacity 150ms ease;
        opacity: 0;
    }
    
    .hovercard-title-wrapper .fade-left {
        left: 0;
        background: linear-gradient(to left, transparent, rgba(0, 0, 0, 0.95));
    }
    
    .hovercard-title-wrapper .fade-right {
        right: 0;
        background: linear-gradient(to right, transparent, rgba(0, 0, 0, 0.95));
    }

    .hovercard-screenshot {
        width: 100%;
        height: 180px;
        overflow: hidden;
        border-bottom-left-radius: 12px;
        border-bottom-right-radius: 12px;
        position: relative;
        z-index: 1;
        flex-shrink: 0;
    }
    
    .hovercard-screenshot.has-history {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
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
    
    .history-section {
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow-x: visible;
        overflow-y: hidden;
    }
    
    .history-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px 4px 12px;
    }
    
    .history-section-title {
        padding: 0;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: rgba(255, 255, 255, 0.5);
        font-family: 'Inter', sans-serif;
        background: none;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        text-align: left;
        transition: color 100ms ease;
    }
    
    .history-section-title:hover {
        color: rgba(255, 255, 255, 0.8);
    }
    
    .history-section-title .expand-icon {
        width: 10px;
        height: 10px;
        opacity: 0;
        transition: opacity 100ms ease;
    }
    
    .history-section-title:hover .expand-icon {
        opacity: 1;
    }
    
    .clear-all-btn {
        font-size: 10px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.35);
        font-family: 'Inter', sans-serif;
        background: none;
        border: none;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: all 100ms ease;
        opacity: 0;
    }
    
    .history-section:hover .clear-all-btn {
        opacity: 1;
    }
    
    .clear-all-btn:hover {
        color: rgba(248, 113, 113, 0.9);
        background: rgba(248, 113, 113, 0.15);
    }
    
    .history-list {
        flex: 1;
        min-height: 100px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        position: relative;
    }
    
    .history-connector-line {
        position: absolute;
        left: 19px;
        top: 0;
        bottom: 30px;
        width: 2px;
        background: linear-gradient(to bottom, transparent 0%, rgba(255, 255, 255, 0.15) 8px);
    }
    
    .history-list::-webkit-scrollbar {
        width: 6px;
    }
    
    .history-list::-webkit-scrollbar-track {
        background: transparent;
    }
    
    .history-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }
    
    .history-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        width: 100%;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: background 100ms ease, opacity 150ms ease;
        text-align: left;
        font-family: 'Inter', sans-serif;
        position: relative;
    }
    
    .history-item .history-icon-wrapper,
    .history-item .history-text {
        opacity: 0.75;
        transition: opacity 100ms ease;
    }
    
    .history-item:hover .history-icon-wrapper,
    .history-item:hover .history-text {
        opacity: 1;
    }
    
    .history-item:hover {
        background: rgba(255, 255, 255, 0.08);
    }
    
    .history-item:last-child {
        border-bottom-left-radius: 12px;
        border-bottom-right-radius: 12px;
    }
    
    .history-item.is-leaf::before {
        content: '';
        position: absolute;
        left: 17px;
        top: -11px;
        width: 6px;
        height: calc(50% + 8px);
        background: linear-gradient(to bottom, transparent 0%, #010101 50%);
        z-index: 0;
        /* transition: background 100ms ease; */
    }
    
    .history-item.is-leaf:hover::before {
        background: linear-gradient(to bottom, transparent 0%, #151515 50%);
    }
    
    .history-icon-wrapper {
        position: relative;
        flex-shrink: 0;
    }
    
    /* .history-icon-wrapper.leaf-highlight {
        background: rgba(59, 130, 246, 0.3);
        border-radius: 50%;
        padding: 2px;
        margin: -2px;
    } */
    
    .history-type-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
    }
    
    .history-type-icon svg {
        width: 14px;
        height: 14px;
    }
    
    .history-type-icon.opened {
        background: rgba(74, 222, 128, 0.2);
        color: rgba(74, 222, 128, 0.9);
        border: 1px solid rgba(74, 222, 128, 0.3);
    }
    
    .history-type-icon.closed {
        background: rgba(248, 113, 113, 0.2);
        color: rgba(248, 113, 113, 0.9);
        border: 1px solid rgba(248, 113, 113, 0.3);
    }
    
    .history-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    
    .history-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    .history-title-scroll-wrapper {
        position: relative;
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        overflow: hidden;
    }
    
    .history-title-scroll-wrapper .fade-left {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 20px;
        background: linear-gradient(to left, transparent, #010101);
        pointer-events: none;
        transition: opacity 150ms ease, background 100ms ease;
        opacity: 0;
        z-index: 1;
    }
    
    .history-title {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.8);
        white-space: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
        flex: 1;
        min-width: 0;
    }
    
    .history-title::-webkit-scrollbar {
        display: none;
    }
    
    .history-title-scroll-wrapper .fade-right {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 20px;
        background: linear-gradient(to right, transparent, #010101);
        pointer-events: none;
        transition: opacity 150ms ease, background 100ms ease;
        opacity: 0;
        z-index: 1;
    }
    
    .history-item:hover .history-title-scroll-wrapper .fade-left {
        background: linear-gradient(to left, transparent, #151515);
    }
    
    .history-item:hover .history-title-scroll-wrapper .fade-right {
        background: linear-gradient(to right, transparent, #151515);
    }
    
    .history-time {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
        background: rgba(255, 255, 255, 0.05);
        padding: 1px 5px;
        border-radius: 3px;
        flex-shrink: 0;
    }
    
    .history-time:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.6);
    }
    
    .history-source {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.35);
        font-style: italic;
    }
    
    .history-url-wrapper {
        position: relative;
        display: flex;
        align-items: center;
        overflow-x: auto;
        scrollbar-width: none;
    }
    
    .history-url-wrapper::-webkit-scrollbar {
        display: none;
    }
    
    .history-url-wrapper .fade-left {
        position: sticky;
        left: 0;
        flex-shrink: 0;
        align-self: stretch;
        width: 20px;
        margin-right: -20px;
        background: linear-gradient(to left, transparent, #010101);
        pointer-events: none;
        transition: opacity 150ms ease, background 100ms ease;
        opacity: 0;
        z-index: 1;
    }
    
    .history-url {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        white-space: nowrap;
    }
    
    .history-url-wrapper .fade-right {
        position: sticky;
        right: 0;
        flex-shrink: 0;
        align-self: stretch;
        width: 20px;
        margin-left: -20px;
        background: linear-gradient(to right, transparent, #010101);
        pointer-events: none;
        transition: opacity 150ms ease, background 100ms ease;
        opacity: 0;
        z-index: 1;
    }
    
    .history-item:hover .history-url-wrapper .fade-left {
        background: linear-gradient(to left, transparent, #151515);
    }
    
    .history-item:hover .history-url-wrapper .fade-right {
        background: linear-gradient(to right, transparent, #151515);
    }
    
    .history-actions {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        gap: 2px;
        opacity: 0;
        transition: opacity 100ms ease, background 100ms ease;
        transition-delay: 400ms;
        background: #010101;
        padding-left: 4px;
        border-radius: 4px;
    }
    
    .history-item:hover .history-actions {
        background: #151515;
        opacity: 1;
    }
    
    .history-item:not(:hover) .history-actions {
        transition-delay: 0ms;
    }
    
    .history-action-btn {
        width: 22px;
        height: 22px;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 100ms ease;
    }
    
    .history-action-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.6);
    }
    
    .history-action-btn.delete:hover {
        background: rgba(248, 113, 113, 0.15);
        color: rgba(248, 113, 113, 0.9);
    }
    
    .history-action-btn svg {
        width: 14px;
        height: 14px;
    }
    
    .history-action-btn.success {
        color: #22c55e;
        background: rgba(34, 197, 94, 0.1);
    }
</style>

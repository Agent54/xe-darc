<script>
    import RightSidebar from './RightSidebar.svelte'
    
    let {
        onClose,
        openSidebars,
        switchToResources,
        switchToSettings,
        switchToUserMods,
        switchToActivity,
        switchToAgent,
        switchToDevTools,
        devModeEnabled = false,
        data,
        currentSpaceId
    } = $props()
    
    let devToolsData = $state([])
    let loading = $state(true)
    let error = $state(null)
    let initialLoad = $state(true)
    let expandedItems = $state(new Set())
    
    // Fetch dev tools data on mount
    async function fetchDevToolsData() {
        try {
            if (initialLoad) {
                loading = true
                error = null
            }
            
            const response = await fetch('/devtools-api/json/list')
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            const newData = await response.json()
            
            // Update existing items or add new ones without full re-render
            updateDevToolsData(newData)
            
            if (initialLoad) {
                error = null
            }
        } catch (err) {
            if (initialLoad) {
                error = err.message
                console.error('Failed to fetch dev tools data:', err)
            } else {
                // Don't show errors on background updates, just log them
                console.warn('Background dev tools update failed:', err)
            }
        } finally {
            if (initialLoad) {
                loading = false
                initialLoad = false
            }
        }
    }
    
    // Smart update function that preserves UI state
    function updateDevToolsData(newData) {
        // Deduplicate by ID to avoid Svelte keyed each block errors
        const uniqueData = []
        const seenIds = new Set()
        
        for (const item of newData) {
            if (!seenIds.has(item.id)) {
                seenIds.add(item.id)
                uniqueData.push(item)
            }
        }
        
        devToolsData = uniqueData
    }
    
    // Build hierarchical structure from flat array
    function buildHierarchy(items) {
        const itemMap = new Map()
        const roots = []
        
        // First pass: create map of all items
        items.forEach(item => {
            itemMap.set(item.id, { ...item, children: [] })
        })
        
        // Second pass: build hierarchy
        items.forEach(item => {
            if (item.parentId && itemMap.has(item.parentId)) {
                itemMap.get(item.parentId).children.push(itemMap.get(item.id))
            } else {
                roots.push(itemMap.get(item.id))
            }
        })
        
        return roots
    }
    
    function openDevTools(item) {
        if (item.devtoolsFrontendUrl && data && currentSpaceId) {
            // Replace the remote DevTools frontend with local one while keeping WebSocket params
            const originalUrl = new URL(item.devtoolsFrontendUrl)
            const localDevToolsUrl = `https://localhost:5194/devtools-api/devtools/inspector.html${originalUrl.search}`
            
            data.newTab(currentSpaceId, { 
                url: localDevToolsUrl, 
                title: `DevTools - ${item.title || 'Untitled'}`,
                shouldFocus: true 
            })
        }
    }
    
    function closeFrame(item) {
        if (item.id) {
            fetch(`/devtools-api/json/close/${item.id}`)
                .then(() => {
                    // Refresh the data after closing
                    fetchDevToolsData()
                })
                .catch(err => console.warn('Failed to close frame:', err))
        }
    }
    
    function focusFrame(item) {
        if (item.id) {
            fetch(`/devtools-api/json/activate/${item.id}`)
                .catch(err => console.warn('Failed to focus frame:', err))
        }
    }
    
    function toggleExpanded(itemId) {
        if (expandedItems.has(itemId)) {
            expandedItems.delete(itemId)
        } else {
            expandedItems.add(itemId)
        }
        expandedItems = new Set(expandedItems)
    }
    
    function countAllChildren(item) {
        let count = item.children.length
        item.children.forEach(child => {
            count += countAllChildren(child)
        })
        return count
    }
    
    function getTypeIcon(type) {
        // Use the same frame icon for all types
        return `<path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />`
    }
    
    function getTypeColor(type) {
        switch (type) {
            case 'app':
                return '#10b981' // emerald-500
            case 'webview':
                return '#3b82f6' // blue-500
            case 'iframe':
                return '#f59e0b' // amber-500
            case 'page':
                return '#8b5cf6' // violet-500
            case 'worker':
                return '#06b6d4' // cyan-500
            case 'service_worker':
                return '#ec4899' // pink-500
            default:
                return '#6b7280' // gray-500
        }
    }
    
    // Fetch data on component mount
    fetchDevToolsData()
</script>

<RightSidebar title="Dev Tools" {onClose} {openSidebars} {switchToResources} {switchToSettings} {switchToUserMods} {switchToActivity} {switchToAgent} {switchToDevTools} {devModeEnabled}>
    {#snippet children()}
        <div class="devtools-content">
            <div class="devtools-header">
                <div class="section-title"></div>
                
                <button class="refresh-button" 
                        title="Refresh DevTools List" 
                        aria-label="Refresh DevTools List"
                        onmousedown={fetchDevToolsData}>
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.183m0-4.991v4.99" />
                    </svg>
                </button>
            </div>
            
            {#if loading}
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <span>Loading dev tools...</span>
                </div>
            {:else if error}
                <div class="error-state">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <div>
                        <div class="error-title">Connection Failed</div>
                        <div class="error-message">{error}</div>
                        <button class="retry-button" onmousedown={fetchDevToolsData}>
                            Retry Connection
                        </button>
                    </div>
                </div>
            {:else if devToolsData.length === 0}
                <div class="empty-state">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span>No dev tools targets found</span>
                </div>
            {:else}
                <div class="devtools-list">
                    {#each buildHierarchy(devToolsData) as item (item.id)}
                        {@render hierarchyItem(item, 0)}
                    {/each}
                </div>
            {/if}
        </div>
    {/snippet}
    
    {#snippet hierarchyItem(item, depth)}
        <div class="devtools-item" class:root-item={depth === 0} class:child-item={depth > 0} style="margin-left: {depth * 20}px">
            <div class="item-header" 
                 class:clickable={item.children.length > 0} 
                 role={item.children.length > 0 ? "button" : undefined}
                 onmousedown={item.children.length > 0 ? () => toggleExpanded(item.id) : undefined}>
                <div class="item-icon-container">
                    <div class="item-icon" style="color: {getTypeColor(item.type)}">
                        {#if item.faviconUrl}
                            <img src={item.faviconUrl} alt="" class="favicon" onerror={(e) => { e.target.style.display='none'; e.target.nextElementSibling.style.display='flex' }}>
                            <svg class="w-4 h-4 fallback-icon" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="display: none;">
                                {@html getTypeIcon(item.type)}
                            </svg>
                        {:else}
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                {@html getTypeIcon(item.type)}
                            </svg>
                        {/if}
                    </div>
                    {#if item.children.length > 0}
                        <div class="expand-icon" class:expanded={expandedItems.has(item.id)}>
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                            </svg>
                        </div>
                    {/if}
                </div>
                <div class="item-info">
                    <div class="item-title">{item.title || 'Untitled'}</div>
                    <div class="item-details">
                        {#if item.type !== 'other'}
                            <span class="item-type" style="color: {getTypeColor(item.type)}">{item.type}</span>
                        {/if}
                        {#if item.children.length > 0}
                            <span class="children-count">({countAllChildren(item)} frames)</span>
                        {/if}
                        <div class="item-id">ID: {item.id}</div>
                        {#if item.url}
                            <div class="item-url" title={item.url}>{item.url}</div>
                        {/if}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="action-button" 
                            title="Focus Frame" 
                            aria-label="Focus frame {item.title || 'Untitled'}"
                            onmousedown={(e) => { e.stopPropagation(); focusFrame(item) }}>
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                    </button>
                    {#if item.devtoolsFrontendUrl}
                        <button class="action-button" 
                                title="Open DevTools" 
                                aria-label="Open DevTools for {item.title || 'Untitled'}"
                                onmousedown={(e) => { e.stopPropagation(); openDevTools(item) }}>
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                            </svg>
                        </button>
                    {/if}
                    <button class="action-button close-button" 
                            title="Close Frame" 
                            aria-label="Close frame {item.title || 'Untitled'}"
                            onmousedown={(e) => { e.stopPropagation(); closeFrame(item) }}>
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
        
        {#if item.children.length > 0 && expandedItems.has(item.id)}
            {#each item.children as child (child.id)}
                {@render hierarchyItem(child, depth + 1)}
            {/each}
        {/if}
    {/snippet}
</RightSidebar>

<style>
    .devtools-content {
        color: #fff;
        padding-top: 20px;
    }
    
    .devtools-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
    }
    
    .refresh-button {
        width: 24px;
        height: 24px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.6);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .refresh-button:hover {
        background: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.9);
    }
    
    .loading-state, .error-state, .empty-state {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 20px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;
    }
    
    .loading-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top: 2px solid rgba(255, 255, 255, 0.8);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error-state {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }
    
    .error-state > svg {
        color: #ef4444;
    }
    
    .error-title {
        font-weight: 500;
        color: #ef4444;
    }
    
    .error-message {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
    }
    
    .retry-button {
        margin-top: 8px;
        padding: 6px 12px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .retry-button:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
    }
    
    .devtools-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    
    .devtools-item {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        overflow: hidden;
        transition: all 0.2s ease;
        position: relative;
    }
    
    .devtools-item:hover {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.16);
    }
    
    .child-item {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .child-item:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);
    }
    
    .item-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
    }
    
    .item-header.clickable {
        cursor: pointer;
    }
    
    .item-icon-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
        width: 20px;
    }
    
    .item-icon {
        color: rgba(255, 255, 255, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .favicon {
        width: 16px;
        height: 16px;
        border-radius: 2px;
    }
    
    .expand-icon {
        color: rgba(255, 255, 255, 0.5);
        transition: transform 0.2s ease;
        margin-top: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .expand-icon.expanded {
        transform: rotate(90deg);
    }
    
    .item-info {
        flex: 1;
        min-width: 0;
    }
    
    .item-title {
        font-size: 13px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
        margin-bottom: 4px;
        line-height: 1.3;
        word-wrap: break-word;
    }
    
    .item-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 11px;
    }
    
    .item-type {
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        font-weight: 500;
        letter-spacing: 0.5px;
    }
    
    .item-url {
        color: rgba(255, 255, 255, 0.4);
        word-break: break-all;
        line-height: 1.3;
        max-height: 4.5em; /* About 3-4 lines */
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
    }
    
    .children-count {
        color: rgba(255, 255, 255, 0.5);
        font-weight: 500;
        margin-left: 8px;
    }
    
    .item-id {
        color: rgba(255, 255, 255, 0.3);
        font-size: 10px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        margin-top: 2px;
        word-break: break-all;
    }
    
    .item-actions {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s ease;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 4px;
        padding: 4px;
        backdrop-filter: blur(4px);
    }
    
    .devtools-item:hover .item-actions {
        opacity: 1;
    }
    
    .action-button {
        width: 24px;
        height: 24px;
        border: none;
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.7);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
    }
    
    .action-button:hover {
        background: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.9);
    }
    
    .close-button:hover {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
    }
    
    
    .w-3 {
        width: 12px;
    }
    
    .h-3 {
        height: 12px;
    }
    
    .w-4 {
        width: 16px;
    }
    
    .h-4 {
        height: 16px;
    }
</style>
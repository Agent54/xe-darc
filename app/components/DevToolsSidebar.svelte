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
        devModeEnabled = false
    } = $props()
    
    let devToolsData = $state([])
    let loading = $state(true)
    let error = $state(null)
    
    // Fetch dev tools data on mount
    async function fetchDevToolsData() {
        try {
            loading = true
            error = null
            const response = await fetch('http://127.0.0.1:9226/json/list')
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }
            const data = await response.json()
            devToolsData = data
        } catch (err) {
            error = err.message
            console.error('Failed to fetch dev tools data:', err)
        } finally {
            loading = false
        }
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
        if (item.devtoolsFrontendUrl) {
            window.open(item.devtoolsFrontendUrl, '_blank')
        }
    }
    
    function getTypeIcon(type) {
        switch (type) {
            case 'app':
                return `<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />`
            case 'webview':
                return `<path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3s-4.5 4.03-4.5 9 2.015 9 4.5 9Zm8.716-6.747a9.004 9.004 0 0 0 0-8.506m0 8.506L12 12m8.716-6.747L12 12m-8.716 6.747a9.004 9.004 0 0 1 0-8.506m0 8.506L12 12M3.284 5.253L12 12" />`
            default:
                return `<path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />`
        }
    }
    
    // Fetch data on component mount
    fetchDevToolsData()
    
    $effect(() => {
        // Refresh data every 5 seconds
        const interval = setInterval(fetchDevToolsData, 5000)
        return () => clearInterval(interval)
    })
</script>

<RightSidebar title="Dev Tools" {onClose} {openSidebars} {switchToResources} {switchToSettings} {switchToUserMods} {switchToActivity} {switchToAgent} {switchToDevTools} {devModeEnabled}>
    {#snippet children()}
        <div class="devtools-content">
            <div class="section-title">Chrome DevTools</div>
            
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
                    {#each buildHierarchy(devToolsData) as item}
                        <div class="devtools-item" class:has-children={item.children.length > 0}>
                            <div class="item-header">
                                <div class="item-icon">
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                        {@html getTypeIcon(item.type)}
                                    </svg>
                                </div>
                                <div class="item-info">
                                    <div class="item-title">{item.title || 'Untitled'}</div>
                                    <div class="item-details">
                                        <span class="item-type">{item.type}</span>
                                        {#if item.url}
                                            <span class="item-url">{item.url}</span>
                                        {/if}
                                    </div>
                                </div>
                                <div class="item-actions">
                                    {#if item.devtoolsFrontendUrl}
                                        <button class="action-button" 
                                                title="Open DevTools" 
                                                aria-label="Open DevTools for {item.title || 'Untitled'}"
                                                onmousedown={() => openDevTools(item)}>
                                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                            </svg>
                                        </button>
                                    {/if}
                                </div>
                            </div>
                            
                            {#if item.children.length > 0}
                                <div class="children-list">
                                    {#each item.children as child}
                                        <div class="devtools-item child-item">
                                            <div class="item-header">
                                                <div class="item-icon">
                                                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                                        {@html getTypeIcon(child.type)}
                                                    </svg>
                                                </div>
                                                <div class="item-info">
                                                    <div class="item-title">{child.title || 'Untitled'}</div>
                                                    <div class="item-details">
                                                        <span class="item-type">{child.type}</span>
                                                        {#if child.url}
                                                            <span class="item-url">{child.url}</span>
                                                        {/if}
                                                    </div>
                                                </div>
                                                <div class="item-actions">
                                                    {#if child.devtoolsFrontendUrl}
                                                        <button class="action-button" 
                                                                title="Open DevTools" 
                                                                aria-label="Open DevTools for {child.title || 'Untitled'}"
                                                                onmousedown={() => openDevTools(child)}>
                                                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                                                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                                            </svg>
                                                        </button>
                                                    {/if}
                                                </div>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/snippet}
</RightSidebar>

<style>
    .devtools-content {
        color: #fff;
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
    
    .item-icon {
        color: rgba(255, 255, 255, 0.6);
        flex-shrink: 0;
        margin-top: 2px;
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
    }
    
    .item-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        transition: opacity 0.2s ease;
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
    
    .children-list {
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: rgba(0, 0, 0, 0.1);
    }
    
    .children-list .item-header {
        padding: 8px 10px;
    }
    
    .children-list .item-title {
        font-size: 12px;
    }
    
    .children-list .item-details {
        font-size: 10px;
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
<script>
    import { SvelteFlow, Position } from '@xyflow/svelte'
    import '@xyflow/svelte/dist/style.css'
    import HistoryNode from './HistoryNode.svelte'
    import data from '../data.svelte.js'
    
    let { tab, isActive = false } = $props()
    
    // Extract the target tab ID from the URL hash (about:tabhistory#tabid)
    let targetTabId = $derived(tab?.url?.split('#')[1] || null)
    let targetTab = $derived(targetTabId ? data.docs[targetTabId] : null)
    
    // Custom node types
    const nodeTypes = {
        historyNode: HistoryNode
    }
    
    // Debug history entries (will be replaced with real history data)
    // Order: oldest at top (tab opened first), newest at bottom, current state last
    const historyEntries = $derived(targetTab ? [
        {
            id: 'opened',
            type: 'opened',
            title: 'Tab opened',
            url: targetTab?.url || '',
            timestamp: Date.now() - 1000 * 60 * 45,
            source: { type: 'clipboard', label: 'from clipboard' },
            children: []
        },
        {
            id: 'nav1',
            type: 'navigation',
            title: 'Welcome to Example',
            url: 'https://example.com/',
            timestamp: Date.now() - 1000 * 60 * 40,
            children: []
        },
        {
            id: 'nav2',
            type: 'navigation',
            title: 'Documentation - Getting Started',
            url: 'https://example.com/docs/getting-started',
            timestamp: Date.now() - 1000 * 60 * 30,
            children: []
        },
        {
            id: 'nav3',
            type: 'navigation',
            title: 'API Reference',
            url: 'https://example.com/docs/api',
            timestamp: Date.now() - 1000 * 60 * 20,
            children: []
        },
        {
            id: 'nav4',
            type: 'navigation',
            title: 'Advanced Topics - Performance',
            url: 'https://example.com/docs/advanced/performance',
            timestamp: Date.now() - 1000 * 60 * 10,
            children: [
                {
                    id: 'nav4-1',
                    type: 'navigation',
                    title: 'Caching Strategies',
                    url: 'https://example.com/docs/advanced/performance/caching',
                    timestamp: Date.now() - 1000 * 60 * 8,
                    children: []
                }
            ]
        },
        {
            id: 'nav5',
            type: 'navigation',
            title: 'Blog - Latest Updates',
            url: 'https://example.com/blog',
            timestamp: Date.now() - 1000 * 60 * 5,
            children: []
        },
        {
            id: 'current',
            type: 'current',
            title: targetTab?.title || 'Untitled',
            url: targetTab?.url || '',
            timestamp: Date.now(),
            isCurrent: true,
            children: []
        }
    ] : [])
    
    // Convert history entries to SvelteFlow nodes and edges
    function buildFlowGraph(entries) {
        const nodes = []
        const edges = []
        const nodeWidth = 280
        const nodeHeight = 90
        const verticalGap = 40
        const horizontalGap = 80
        
        let yOffset = 0
        
        function processEntry(entry, depth = 0, parentId = null) {
            const x = depth * (nodeWidth + horizontalGap)
            const y = yOffset
            yOffset += nodeHeight + verticalGap
            
            nodes.push({
                id: entry.id,
                type: 'historyNode',
                position: { x, y },
                data: { entry, isCurrent: entry.isCurrent || false },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
            })
            
            if (parentId) {
                edges.push({
                    id: `e-${parentId}-${entry.id}`,
                    source: parentId,
                    target: entry.id,
                    type: 'default',
                    animated: false,
                    style: 'stroke: rgba(255, 255, 255, 0.25); stroke-width: 2px;'
                })
            }
            
            if (entry.children && entry.children.length > 0) {
                for (const child of entry.children) {
                    processEntry(child, depth + 1, entry.id)
                }
            }
        }
        
        let prevId = null
        for (const entry of entries) {
            processEntry(entry, 0, prevId)
            prevId = entry.id
        }
        
        return { nodes, edges }
    }
    
    let flowData = $derived(buildFlowGraph(historyEntries))
    let nodes = $state.raw([])
    let edges = $state.raw([])
    
    $effect(() => {
        nodes = flowData.nodes
        edges = flowData.edges
    })
</script>

<div class="tab-history-page" class:active={isActive}>
    <div class="tab-history-header">
        <h1 class="page-title">Tab History</h1>
    </div>
    
    {#if targetTab && nodes.length > 0}
        <div class="flow-container">
            <SvelteFlow
                bind:nodes
                bind:edges
                {nodeTypes}
                fitView
                nodesDraggable={true}
                nodesConnectable={false}
                elementsSelectable={true}
                panOnDrag={true}
                zoomOnScroll={true}
                minZoom={0.3}
                maxZoom={2}
                defaultEdgeOptions={{ type: 'default', animated: false }}
                colorMode="dark"
            >
            </SvelteFlow>
        </div>
    {:else}
        <div class="no-tab-message">
            <p>No tab specified. Open this page from a tab's history menu.</p>
        </div>
    {/if}
</div>

<style>
    .tab-history-page {
        width: 100%;
        height: 100%;
        background: rgb(10, 10, 10);
        color: #fff;
        font-family: 'Inter', sans-serif;
        display: flex;
        flex-direction: column;
    }
    
    .tab-history-header {
        padding: 20px 24px 16px;
        flex-shrink: 0;
    }
    
    .page-title {
        font-size: 18px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
        margin: 0;
    }
    
    .flow-container {
        flex: 1;
        min-height: 0;
    }
    
    .flow-container :global(.svelte-flow) {
        background: transparent !important;
    }
    
    .flow-container :global(.svelte-flow__background) {
        background: transparent !important;
    }
    
    .flow-container :global(.svelte-flow__node) {
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
    }
    
    .flow-container :global(.svelte-flow__attribution) {
        display: none !important;
    }
    
    .flow-container :global(.svelte-flow__handle) {
        width: 8px;
        height: 8px;
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
    }
    
    .flow-container :global(.svelte-flow__edge-path) {
        stroke: rgba(255, 255, 255, 0.2);
        stroke-width: 2;
    }
    
    .no-tab-message {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 60px 20px;
        color: rgba(255, 255, 255, 0.5);
    }
</style>

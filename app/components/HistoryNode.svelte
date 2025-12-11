<script>
    import { Handle, Position } from '@xyflow/svelte'
    import Favicon from './Favicon.svelte'
    import UrlRenderer from './UrlRenderer.svelte'
    
    let { data, id } = $props()
    
    const entry = $derived(data.entry)
    const isCurrent = $derived(data.isCurrent || false)
    
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
</script>

<div class="history-node" class:opened={entry.type === 'opened'} class:closed={entry.type === 'closed'} class:current={isCurrent}>
    {#if entry.type !== 'opened'}
        <Handle type="target" position={Position.Top} />
    {/if}
    
    <div class="node-header">
        {#if entry.type === 'opened'}
            <div class="node-icon opened">
                <svg fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m6-6H6" />
                </svg>
            </div>
        {:else if entry.type === 'closed'}
            <div class="node-icon closed">
                <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
            </div>
        {:else}
            <Favicon tab={entry} showButton={false} />
        {/if}
        <div class="node-text">
            <div class="node-title" title={entry.title || 'Untitled'}>{entry.title || 'Untitled'}</div>
            <div class="node-url" title={entry.url}><UrlRenderer url={entry.url} variant="compact" /></div>
        </div>
    </div>
    <div class="node-meta">
        <span class="node-time">{formatRelativeTime(entry.timestamp)}</span>
        {#if entry.source}
            <span class="node-source">{entry.source.label}</span>
        {/if}
    </div>
    
    <Handle type="source" position={Position.Bottom} />
</div>

<style>
    .history-node {
        background: rgba(30, 30, 30, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 10px;
        padding: 12px 14px;
        width: 260px;
        cursor: pointer;
        transition: all 100ms ease;
        position: relative;
    }
    
    .history-node:hover {
        background: rgba(45, 45, 45, 0.95);
        border-color: rgba(255, 255, 255, 0.25);
    }
    
    .history-node.current {
        background: rgba(59, 130, 246, 0.15);
        border-color: rgba(59, 130, 246, 0.5);
    }
    
    .history-node.current:hover {
        background: rgba(59, 130, 246, 0.2);
        border-color: rgba(59, 130, 246, 0.6);
    }
    

    
    .node-header {
        display: flex;
        align-items: flex-start;
        gap: 10px;
    }
    
    .node-icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        flex-shrink: 0;
    }
    
    .node-icon svg {
        width: 14px;
        height: 14px;
    }
    
    .node-icon.opened {
        background: rgba(74, 222, 128, 0.2);
        color: rgba(74, 222, 128, 0.9);
        border: 1px solid rgba(74, 222, 128, 0.3);
    }
    
    .node-icon.closed {
        background: rgba(248, 113, 113, 0.2);
        color: rgba(248, 113, 113, 0.9);
        border: 1px solid rgba(248, 113, 113, 0.3);
    }
    
    .node-text {
        flex: 1;
        min-width: 0;
    }
    
    .node-title {
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.85);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    
    .node-url {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 2px;
    }
    
    .node-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
        padding-left: 28px;
    }
    
    .node-time {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
        background: rgba(255, 255, 255, 0.05);
        padding: 2px 6px;
        border-radius: 3px;
    }
    
    .node-source {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.35);
        font-style: italic;
    }
</style>

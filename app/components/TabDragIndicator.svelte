<script>
    import { tabDrag } from '../lib/tab-drag.svelte.js'

    const pinLabel = $derived(tabDrag.dropTarget?.type === 'pin' ? {
        'sidebar-fixed': 'Pin above New Tab',
        sidebar: 'Pin in scrolling sidebar',
        space: 'Pin to space',
        global: 'Pin globally'
    }[tabDrag.dropTarget.pinScope] : tabDrag.sidepinZone ? `Pin ${tabDrag.sidepinZone}` : null)
</script>

{#if tabDrag.indicator.visible}
    <div class="tab-drag-indicator"
         style:left="{tabDrag.indicator.x}px" style:top="{tabDrag.indicator.y}px"
         style:width="{tabDrag.indicator.width}px" style:height="{tabDrag.indicator.height}px">
        {#if pinLabel}
            <span class="pin-label" class:vertical={tabDrag.indicator.width === 2}>{pinLabel}</span>
        {/if}
    </div>
{/if}

<style>
    .tab-drag-indicator {
        position: fixed;
        background: rgba(255, 255, 255, 0.7);
        border-radius: 2px;
        z-index: 99999;
        pointer-events: none;
        transform: translate(-50%, -50%);
    }

    .pin-label {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        padding: 2px 6px;
        border-radius: 4px;
        background: #111;
        color: white;
        font: 11px/16px system-ui, sans-serif;
        white-space: nowrap;
    }

    .pin-label.vertical {
        left: 6px;
        transform: translateY(-50%);
    }
</style>

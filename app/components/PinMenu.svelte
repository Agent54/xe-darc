<script>
    import { onMount, untrack } from 'svelte'
    import data from '../data.svelte.js'
    import { getSidebarHovercardPosition } from '../lib/hovercard-layout.js'

    let { tabId, anchor, onClose, children } = $props()
    let panel = $state(null)
    let viewport = $state({ width: window.innerWidth, height: window.innerHeight })
    let width = $state(untrack(() => data.docs[tabId]?.pinMenuWidth || 480))
    let resizing = $state(false)
    const height = $derived(Math.min(640, viewport.height - 80))
    const panelWidth = $derived(Math.min(width, Math.max(240, viewport.width - (anchor?.closest('.sidebar-box')?.getBoundingClientRect().right || 263) - 20)))
    const position = $derived(getSidebarHovercardPosition({
        ...anchor?.getBoundingClientRect().toJSON(),
        right: anchor?.closest('.sidebar-box')?.getBoundingClientRect().right || anchor?.getBoundingClientRect().right || 263
    }, panelWidth, height, viewport.width, viewport.height))

    onMount(() => {
        let pressed = null
        function down(event) { pressed = event.target }
        function up(event) {
            if (pressed === event.target && !panel?.contains(event.target) && !anchor?.contains(event.target)) onClose()
            pressed = null
        }
        function key(event) { if (event.key === 'Escape') onClose() }
        function resize() { viewport = { width: window.innerWidth, height: window.innerHeight } }
        window.addEventListener('mousedown', down, true)
        window.addEventListener('mouseup', up, true)
        window.addEventListener('keydown', key)
        window.addEventListener('resize', resize)
        return () => {
            window.removeEventListener('mousedown', down, true)
            window.removeEventListener('mouseup', up, true)
            window.removeEventListener('keydown', key)
            window.removeEventListener('resize', resize)
        }
    })

    function endResize(event) {
        if (!resizing) return
        resizing = false
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        data.setPinMenuWidth(tabId, width)
    }
</script>

<div class="pin-menu menu-surface" class:resizing bind:this={panel} role="dialog" aria-label={data.docs[tabId]?.title || 'Pinned webpage'}
     style:left="{position.x}px" style:top="{position.y}px" style:width="{panelWidth}px" style:height="{height}px">
    {@render children()}
    <button class="pin-menu-resize" type="button" aria-label="Resize pinned webpage" title="Drag to resize"
            onpointerdown={(event) => { if (event.button === 0) { resizing = true; event.currentTarget.setPointerCapture(event.pointerId) } }}
            onpointermove={(event) => { if (resizing) width = Math.max(240, Math.min(event.clientX - position.x, viewport.width - position.x - 10)) }}
            onpointerup={endResize} onpointercancel={endResize} onlostpointercapture={endResize}
            onkeydown={(event) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); width = Math.max(240, width + (event.key === 'ArrowRight' ? 20 : -20)); data.setPinMenuWidth(tabId, width) } }}></button>
</div>

<style>
    .pin-menu { position: fixed; z-index: 10007; border-radius: 12px; padding: 0; overflow: hidden; box-shadow: 0 12px 48px #0008; }
    .pin-menu :global(.frame-wrapper), .pin-menu :global(.frame) { height: 100%; }
    .pin-menu-resize { position: absolute; inset: 0 0 0 auto; width: 6px; cursor: ew-resize; background: transparent; border: 0; touch-action: none; }
    .pin-menu.resizing :global(iframe), .pin-menu.resizing :global(controlledframe) { pointer-events: none; }
</style>

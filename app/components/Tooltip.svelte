<script>
    let { children, text, position = 'top', delay = 500 } = $props()
    
    let isVisible = $state(false)
    let tooltipRef = $state(null)
    let targetRef = $state(null)
    let showTimeout = null
    let hideTimeout = null
    
    function handleMouseEnter() {
        if (hideTimeout) {
            clearTimeout(hideTimeout)
            hideTimeout = null
        }
        
        showTimeout = setTimeout(() => {
            isVisible = true
            showTimeout = null
        }, delay)
    }
    
    function handleMouseLeave() {
        if (showTimeout) {
            clearTimeout(showTimeout)
            showTimeout = null
        }
        
        hideTimeout = setTimeout(() => {
            isVisible = false
            hideTimeout = null
        }, 100)
    }
    
    function getTooltipPosition() {
        if (!tooltipRef || !targetRef) return { top: 0, left: 0 }
        
        const targetRect = targetRef.getBoundingClientRect()
        const tooltipRect = tooltipRef.getBoundingClientRect()
        
        // Find the sidebar container
        const sidebarContainer = targetRef.closest('.sidebar-box, .sidebar')
        const sidebarRect = sidebarContainer ? sidebarContainer.getBoundingClientRect() : null
        
        let top = 0
        let left = 0
        
        switch (position) {
            case 'top':
                top = -tooltipRect.height - 3
                left = (targetRect.width - tooltipRect.width) / 2
                break
            case 'bottom':
                top = targetRect.height + 3
                left = (targetRect.width - tooltipRect.width) / 2
                break
            case 'left':
                top = (targetRect.height - tooltipRect.height) / 2
                left = -tooltipRect.width - 3
                break
            case 'right':
                top = (targetRect.height - tooltipRect.height) / 2
                left = targetRect.width + 3
                break
        }
        
        // Check for overflow and adjust position if needed
        if (sidebarRect) {
            const tooltipLeft = targetRect.left + left
            const tooltipRight = tooltipLeft + tooltipRect.width
            const tooltipTop = targetRect.top + top
            const tooltipBottom = tooltipTop + tooltipRect.height
            
            // Adjust horizontal position if overflowing
            if (tooltipLeft < sidebarRect.left) {
                left = sidebarRect.left - targetRect.left + 4
            } else if (tooltipRight > sidebarRect.right) {
                left = sidebarRect.right - targetRect.left - tooltipRect.width - 4
            }
            
            // Adjust vertical position if overflowing
            if (tooltipTop < sidebarRect.top) {
                // If tooltip would go above sidebar, position it below instead
                top = targetRect.height + 3
            } else if (tooltipBottom > sidebarRect.bottom) {
                // If tooltip would go below sidebar, position it above instead
                top = -tooltipRect.height - 3
            }
        }
        
        return { top, left }
    }
    
    let tooltipPosition = $derived(isVisible ? getTooltipPosition() : { top: 0, left: 0 })
</script>

<div class="tooltip-container" 
     bind:this={targetRef}
     onmouseenter={handleMouseEnter}
     onmouseleave={handleMouseLeave}>
    {@render children()}
    
    {#if isVisible && text}
        <div class="tooltip" 
             bind:this={tooltipRef}
             style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
             role="tooltip"
             aria-hidden="false">
            {text}
        </div>
    {/if}
</div>

<style>
    .tooltip-container {
        position: relative;
        display: inline-block;
    }
    
    .tooltip {
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: rgba(255, 255, 255, 0.9);
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        white-space: nowrap;
        z-index: 1000;
        pointer-events: none;
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: tooltip-fadeIn 150ms ease-out;
    }
    
    @keyframes tooltip-fadeIn {
        from {
            opacity: 0;
            transform: translateY(-2px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style> 
<script>
    let { children, text, position = 'top', delay = 500 } = $props()
    
    let isVisible = $state(false)
    let targetRef = $state(null)
    let showTimeout = null
    let hideTimeout = null
    let tooltipEl = null
    
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
    
    // Portal tooltip to document.body to avoid transform containment issues
    $effect(() => {
        if (isVisible && text && targetRef) {
            tooltipEl = document.createElement('div')
            tooltipEl.textContent = text
            tooltipEl.setAttribute('role', 'tooltip')
            tooltipEl.style.cssText = `
                position: fixed;
                background: rgba(0, 0, 0, 0.9);
                color: rgba(255, 255, 255, 0.9);
                padding: 6px 10px;
                border-radius: 6px;
                font-size: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
                -webkit-font-smoothing: subpixel-antialiased;
                text-rendering: optimizeLegibility;
                white-space: nowrap;
                z-index: 100000;
                pointer-events: none;
                backdrop-filter: blur(8px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                opacity: 0;
                transition: opacity 120ms ease-out;
            `
            document.body.appendChild(tooltipEl)
            
            requestAnimationFrame(() => {
                if (!tooltipEl || !targetRef) return
                const targetRect = targetRef.getBoundingClientRect()
                const tooltipRect = tooltipEl.getBoundingClientRect()
                
                let top = 0
                let left = 0
                
                switch (position) {
                    case 'top':
                        top = targetRect.top - tooltipRect.height - 6
                        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2
                        break
                    case 'bottom':
                        top = targetRect.bottom + 6
                        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2
                        break
                    case 'left':
                        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2
                        left = targetRect.left - tooltipRect.width - 6
                        break
                    case 'right':
                        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2
                        left = targetRect.right + 6
                        break
                }
                
                // Clamp to viewport edges
                if (left < 4) left = 4
                if (left + tooltipRect.width > window.innerWidth - 4) {
                    left = window.innerWidth - tooltipRect.width - 4
                }
                if (top < 4) {
                    top = targetRect.bottom + 6
                }
                if (top + tooltipRect.height > window.innerHeight - 4) {
                    top = targetRect.top - tooltipRect.height - 6
                }
                
                tooltipEl.style.top = `${top}px`
                tooltipEl.style.left = `${left}px`
                tooltipEl.style.opacity = '1'
            })
            
            return () => {
                tooltipEl?.remove()
                tooltipEl = null
            }
        }
    })
</script>

<div class="tooltip-container" 
     bind:this={targetRef}
     onmouseenter={handleMouseEnter}
     onmouseleave={handleMouseLeave}>
    {@render children()}
</div>

<style>
    .tooltip-container {
        position: relative;
        display: flex;
    }
</style>

// The top layer lets the preview escape frame stacking contexts and clipping
// without raising web content above browser chrome or its menus.
export function showLinkPreview(node) {
    const frame = node.parentElement
    let animationFrame

    function updatePosition() {
        const rect = frame.getBoundingClientRect()
        const paddingLeft = parseFloat(getComputedStyle(frame).paddingLeft) || 0
        node.style.setProperty('--link-preview-frame-top', `${rect.top + frame.clientTop}px`)
        node.style.setProperty('--link-preview-frame-left', `${rect.left + frame.clientLeft + paddingLeft}px`)
        node.style.setProperty('--link-preview-frame-width', `${frame.clientWidth}px`)
        animationFrame = requestAnimationFrame(updatePosition)
    }

    // Follow scrolling, resizing and animated frame layouts while visible.
    updatePosition()
    node.showPopover()

    return {
        destroy() {
            cancelAnimationFrame(animationFrame)
            if (node.matches(':popover-open')) node.hidePopover()
        }
    }
}

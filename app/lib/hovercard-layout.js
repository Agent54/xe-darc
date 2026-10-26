export function getSidebarHovercardPosition (anchor, width, height, viewportWidth, viewportHeight) {
    const maxX = Math.max(10, viewportWidth - width - 10)
    const maxY = Math.max(20, viewportHeight - Math.min(height, viewportHeight - 40) - 20)
    const preferredX = anchor.right + width > viewportWidth - 10 ? anchor.left - width - 10 : anchor.right
    return {
        x: Math.max(10, Math.min(preferredX, maxX)),
        y: Math.max(20, Math.min(anchor.top - 26, maxY))
    }
}

export function fitSidebarHovercard (node, options) {
    let frame
    let anchor = options.anchor?.getBoundingClientRect()
    function update () {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
            if (options.anchor?.isConnected) anchor = options.anchor.getBoundingClientRect()
            if (!anchor) return
            options.onPosition(getSidebarHovercardPosition(
                anchor, node.offsetWidth, Math.max(node.offsetHeight, node.scrollHeight), window.innerWidth, window.innerHeight
            ))
        })
    }
    const observer = new ResizeObserver(update)
    observer.observe(node)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    update()
    return {
        update (next) { options = next; update() },
        destroy () {
            observer.disconnect()
            cancelAnimationFrame(frame)
            window.removeEventListener('resize', update)
            window.removeEventListener('scroll', update, true)
        }
    }
}

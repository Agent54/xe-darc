// Keep floating controls in their component's DOM while escaping ancestor scroll clips.
export function overflowPopover (node, options) {
    let shown = false
    let frame
    let offsetX = 0
    let offsetY = 0
    let widthOffset = 0

    function position () {
        if (!shown || !options.anchor?.isConnected) return
        const rect = options.anchor.getBoundingClientRect()
        node.style.left = `${rect.left + offsetX}px`
        node.style.top = `${rect.top + offsetY}px`
        node.style.width = `${rect.width + widthOffset}px`
    }

    function schedulePosition () {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(position)
    }

    const observer = new ResizeObserver(schedulePosition)

    function close () {
        if (!shown) return
        shown = false
        if (node.matches(':popover-open')) node.hidePopover()
        node.removeAttribute('popover')
        for (const property of ['left', 'top', 'width']) node.style.removeProperty(property)
        observer.disconnect()
        cancelAnimationFrame(frame)
        window.removeEventListener('scroll', schedulePosition, true)
        window.removeEventListener('resize', schedulePosition)
    }

    function update (next) {
        options = next
        if (!options.open || !options.anchor) {
            close()
            return
        }
        if (!shown) {
            const rect = node.getBoundingClientRect()
            const anchor = options.anchor.getBoundingClientRect()
            offsetX = rect.left - anchor.left
            offsetY = rect.top - anchor.top
            widthOffset = rect.width - anchor.width
            node.setAttribute('popover', 'manual')
            shown = true
            position()
            node.showPopover()
            observer.observe(options.anchor)
            window.addEventListener('scroll', schedulePosition, true)
            window.addEventListener('resize', schedulePosition)
        } else {
            position()
        }
    }

    update(options)
    return { update, destroy () { close(); observer.disconnect() } }
}

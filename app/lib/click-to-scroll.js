// Keep wheel gestures on the main list until a nested pane is pressed.
export function clickToScroll(node, selector) {
    let active = null
    let left = 0
    let top = 0
    const document = node.ownerDocument

    function deactivate() {
        active?.removeAttribute('data-scroll-active')
        active = null
    }

    function onPointerDown(event) {
        if (event.button !== 0) return
        deactivate()
        const pane = event.target.closest(selector)
        if (!pane || !node.contains(pane)) return
        active = pane
        active.setAttribute('data-scroll-active', '')
        left = active.scrollLeft
        top = active.scrollTop
    }

    function atEdge(deltaX, deltaY) {
        const vertical = Math.abs(deltaY) >= Math.abs(deltaX)
        const position = vertical ? active.scrollTop : active.scrollLeft
        const maximum = vertical ? active.scrollHeight - active.clientHeight : active.scrollWidth - active.clientWidth
        return (vertical ? deltaY : deltaX) < 0 ? position <= 0 : position >= maximum - 1
    }

    function onWheel(event) {
        if (!active || event.ctrlKey || event.defaultPrevented || (!event.deltaX && !event.deltaY)) return
        if (!active.contains(event.target) || atEdge(event.deltaX, event.deltaY)) deactivate()
    }

    function onScroll(event) {
        if (event.target !== active) return
        const deltaX = active.scrollLeft - left
        const deltaY = active.scrollTop - top
        left = active.scrollLeft
        top = active.scrollTop
        if ((deltaX || deltaY) && atEdge(deltaX, deltaY)) {
            deactivate()
        }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    node.addEventListener('wheel', onWheel, { passive: true })
    node.addEventListener('scroll', onScroll, true)
    return {
        destroy() {
            deactivate()
            document.removeEventListener('pointerdown', onPointerDown, true)
            node.removeEventListener('wheel', onWheel)
            node.removeEventListener('scroll', onScroll, true)
        }
    }
}

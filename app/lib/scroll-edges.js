export function observeScrollEdges (node) {
    function update () {
        const container = node.parentElement
        if (!container) return
        container.dataset.scrollTop = String(node.scrollTop > 0)
        container.dataset.scrollBottom = String(node.scrollHeight - node.scrollTop > node.clientHeight + 1)
    }

    const observer = new ResizeObserver(update)
    observer.observe(node)
    node.addEventListener('scroll', update, { passive: true })
    update()

    return {
        update () { queueMicrotask(update) },
        destroy () {
            observer.disconnect()
            node.removeEventListener('scroll', update)
        }
    }
}

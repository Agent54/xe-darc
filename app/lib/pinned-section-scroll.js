import { scrollTension, stretchScrollTension, releaseScrollTension } from './scroll-tension.js'

export function pinnedSectionScroll (node, enabled = true) {
    const section = node.querySelector('.pinned-tabs-section')
    let boundary = 0
    let accumulated = 0
    let offset = 0
    let timer = null
    let frame = null

    function reset () {
        clearTimeout(timer)
        cancelAnimationFrame(frame)
        timer = frame = null
        accumulated = offset = 0
    }

    function measure () {
        const wasHidden = node.scrollTop >= boundary - 1
        const previous = boundary
        boundary = section.getBoundingClientRect().height
        if (enabled && wasHidden) node.scrollTop += boundary - previous
    }

    function snapBack () {
        offset = releaseScrollTension(offset)
        node.scrollTop = boundary - offset
        if (offset) frame = requestAnimationFrame(snapBack)
        else reset()
    }

    function scheduleSnapBack () {
        clearTimeout(timer)
        timer = setTimeout(() => {
            if (offset) snapBack()
            else reset()
        }, scrollTension.delay)
    }

    function wheel (event) {
        if (!enabled || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX) * 2) return
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1)
        // Let expanded groups and pending lists consume their own scrolling first.
        for (let inner = event.target; inner && inner !== node; inner = inner.parentElement) {
            if (inner.scrollHeight <= inner.clientHeight + 1 || !/auto|scroll/.test(getComputedStyle(inner).overflowY)) continue
            if (delta < 0 ? inner.scrollTop > 0 : inner.scrollTop + inner.clientHeight < inner.scrollHeight - 1) return
        }

        if (offset && delta > 0) {
            event.preventDefault()
            cancelAnimationFrame(frame)
            offset = Math.max(0, offset - delta * scrollTension.reverseResistance)
            node.scrollTop = boundary - offset
            if (offset) scheduleSnapBack()
            else reset()
            return
        }
        if (!offset && node.scrollTop < boundary - 1) {
            // Returning to normal tabs lands exactly below the divider.
            if (delta > 0 && node.scrollTop + delta >= boundary) {
                event.preventDefault()
                node.scrollTop = boundary
                reset()
            }
            return
        }
        if (delta >= 0 || node.scrollTop + delta >= boundary) return

        event.preventDefault()
        cancelAnimationFrame(frame)
        if (node.scrollTop > boundary + 1) {
            node.scrollTop = boundary
            reset()
            return
        }
        accumulated += Math.abs(delta)
        if (accumulated >= scrollTension.activationThreshold) {
            offset = stretchScrollTension(offset, -delta)
            node.scrollTop = boundary - Math.min(offset, boundary)
            if (offset > scrollTension.threshold) {
                reset()
                node.scrollTo({ top: 0, behavior: 'smooth' })
                return
            }
        }
        scheduleSnapBack()
    }

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    observer.observe(section)
    node.addEventListener('wheel', wheel, { passive: false })
    measure()
    return {
        update (value) {
            enabled = value
            reset()
            if (enabled) node.scrollTop = boundary
        },
        destroy () {
            reset()
            observer.disconnect()
            node.removeEventListener('wheel', wheel)
        }
    }
}

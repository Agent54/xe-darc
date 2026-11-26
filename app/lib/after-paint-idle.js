export function afterPaintIdle(callback) {
    let idle = null
    let timer = null
    const frame = requestAnimationFrame(() => {
        // A task after rAF lets the initial screen paint before idle work starts.
        timer = setTimeout(() => {
            if (typeof requestIdleCallback === 'function') {
                idle = requestIdleCallback(callback, { timeout: 2000 })
            } else {
                callback()
            }
        }, 0)
    })
    return () => {
        cancelAnimationFrame(frame)
        clearTimeout(timer)
        if (idle !== null) {
            cancelIdleCallback(idle)
        }
    }
}

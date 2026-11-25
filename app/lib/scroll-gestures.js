let startupModifier

export function getScrollGestureModifier () {
    if (!startupModifier) {
        startupModifier = localStorage.getItem('scrollGestureModifier') === 'control' ? 'control' : 'option'
    }
    return startupModifier
}

export function isScrollGesture (event, modifier) {
    return !!(!event.metaKey && (modifier === 'control' ? event.ctrlKey && !event.altKey : event.altKey && !event.ctrlKey))
}

export function createScrollGestures ({ onProgress, onTrigger, onPan, onScale, isOverviewOpen = () => false, schedule = setTimeout, cancel = clearTimeout }) {
    let direction = 0
    let distance = 0
    let triggered = false
    let axis = null
    let scale = 1
    let timer = null

    function resetBurst () {
        direction = 0
        distance = 0
        triggered = false
        axis = null
        onProgress(null)
    }

    function setFrameMode (active) {
        if (active === (scale !== 1)) {
            return
        }
        scale = active ? 0.9 : 1
        axis = null
        onScale(scale)
    }

    function wheel (event, frameMode = event.shiftKey) {
        cancel(timer)
        timer = schedule(resetBurst, 240)
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
        const x = event.deltaX * unit
        const y = event.deltaY * unit
        setFrameMode(frameMode)
        if (frameMode) {
            onProgress(null)
            if (!axis && (x || y)) {
                axis = Math.abs(x) > Math.abs(y) ? 'x' : 'y'
            }
            if (axis === 'x') {
                onPan(x)
            } else if (axis === 'y') {
                scale = Math.max(0.45, Math.min(0.9, scale + y * 0.001))
                onScale(scale)
            }
            return
        }
        if (triggered || !y || Math.abs(x) > Math.abs(y)) {
            return
        }
        const nextDirection = Math.sign(y)
        if (direction !== nextDirection) {
            direction = nextDirection
            distance = 0
        }
        distance += Math.min(80, Math.abs(y))
        const progress = Math.min(1, distance / 240)
        onProgress({ direction, progress })
        if (progress === 1) {
            triggered = true
            onTrigger(direction)
        }
    }

    function reset () {
        cancel(timer)
        timer = null
        resetBurst()
        setFrameMode(false)
    }

    function listen (target) {
        const modifier = getScrollGestureModifier()
        const updateFrameMode = event => {
            setFrameMode(isScrollGesture(event, modifier) && event.shiftKey && !isOverviewOpen())
        }
        const shellWheel = event => {
            if (!isScrollGesture(event, modifier)) {
                setFrameMode(false)
                return
            }
            event.preventDefault()
            event.stopImmediatePropagation()
            if (!event.shiftKey || !isOverviewOpen()) {
                wheel(event)
            }
        }
        const release = () => {
            if (!target.document.hasFocus()) {
                reset()
            }
        }
        const frameInput = ({ detail }) => {
            if (detail.type === 'wheel') {
                if (isScrollGesture(detail, modifier) && (!detail.shiftKey || !isOverviewOpen())) {
                    wheel(detail)
                }
            } else if (detail.type === 'keydown' || detail.type === 'keyup') {
                updateFrameMode(detail)
            } else if (detail.type === 'blur') {
                release()
            }
        }
        target.addEventListener('wheel', shellWheel, { capture: true, passive: false })
        target.addEventListener('keydown', updateFrameMode, true)
        target.addEventListener('keyup', updateFrameMode, true)
        target.addEventListener('blur', release)
        target.addEventListener('darc-controlled-frame-input', frameInput)
        return () => {
            target.removeEventListener('wheel', shellWheel, true)
            target.removeEventListener('keydown', updateFrameMode, true)
            target.removeEventListener('keyup', updateFrameMode, true)
            target.removeEventListener('blur', release)
            target.removeEventListener('darc-controlled-frame-input', frameInput)
            reset()
        }
    }

    return { wheel, setFrameMode, reset, listen }
}

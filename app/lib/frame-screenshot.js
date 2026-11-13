export function createFrameScreenshotScheduler({ delay = 1000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    // A native frame can outlive its Svelte component during parking or promotion.
    const jobs = new WeakMap()

    function canCapture(data, tabId, frameData, frame) {
        const tab = data.docs[tabId]
        const wrapper = frameData.wrapper
        if (!tab || tab.preview || tab.archive || tab._deleted ||
            data.frames[tabId] !== frameData || frameData.frame !== frame ||
            frameData.loading || frameData.directNavigation ||
            !frame.isConnected || !wrapper?.isConnected || frame.parentNode !== wrapper ||
            typeof frame.captureVisibleRegion !== 'function' || frame.src === 'about:blank') {
            return false
        }
        if (wrapper.checkVisibility && !wrapper.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
            return false
        }
        const rect = wrapper.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 &&
            rect.left < (globalThis.innerWidth ?? Infinity) && rect.top < (globalThis.innerHeight ?? Infinity)
    }

    function isCurrent(frame, state, job) {
        const { data, tabId, frameData, version, url, requestedUrl } = job
        return state.version === version && canCapture(data, tabId, frameData, frame) &&
            (frameData.committedUrl || frame.src) === url && data.docs[tabId].url === requestedUrl
    }

    async function capture(frame, state) {
        if (state.running || !state.pending) return
        const job = state.pending
        state.pending = null
        if (!isCurrent(frame, state, job)) return

        state.running = true
        try {
            const screenshot = await frame.captureVisibleRegion({ format: 'png' })
            if (screenshot && isCurrent(frame, state, job)) {
                await job.data.updateTab(job.tabId, { screenshot })
            }
        } catch (error) {
            console.log('Error capturing screenshot:', error)
        } finally {
            state.running = false
            // A debounced request may have become ready during the previous capture.
            if (state.pending && state.timer === null) void capture(frame, state)
        }
    }

    function cancel(frame) {
        const state = frame && jobs.get(frame)
        if (!state) return
        state.version++
        if (state.timer !== null) clearTimer(state.timer)
        state.timer = null
        state.pending = null
    }

    function schedule(data, tabId) {
        const frameData = data.frames[tabId]
        const frame = frameData?.frame
        if (!frame) return
        cancel(frame)
        if (!canCapture(data, tabId, frameData, frame)) return

        let state = jobs.get(frame)
        if (!state) {
            state = { version: 0, timer: null, pending: null, running: false }
            jobs.set(frame, state)
        }
        state.pending = {
            data, tabId, frameData, version: state.version,
            url: frameData.committedUrl || frame.src, requestedUrl: data.docs[tabId].url
        }
        state.timer = setTimer(() => {
            state.timer = null
            return capture(frame, state)
        }, delay)
    }

    return { schedule, cancel }
}

export const frameScreenshots = createFrameScreenshotScheduler()

import assert from 'node:assert/strict'
import { createFrameScreenshotScheduler } from '../app/lib/frame-screenshot.js'

function harness() {
    const timers = new Map()
    let nextTimer = 0
    const screenshots = createFrameScreenshotScheduler({
        setTimer(callback) { timers.set(++nextTimer, callback); return nextTimer },
        clearTimer(id) { timers.delete(id) }
    })
    const saves = []
    const captures = []
    const wrapper = {
        isConnected: true,
        checkVisibility: () => true,
        getBoundingClientRect: () => ({ width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800 })
    }
    const frame = {
        isConnected: true, parentNode: wrapper, src: 'https://example.com/',
        captureVisibleRegion(options) {
            return new Promise((resolve, reject) => captures.push({ options, resolve, reject }))
        }
    }
    const tab = { id: 'page', url: frame.src }
    const frameData = { frame, wrapper, committedUrl: tab.url }
    const data = {
        docs: { page: tab }, frames: { page: frameData },
        async updateTab(id, update) { saves.push({ id, ...update }) }
    }
    return {
        screenshots, saves, captures, frame, frameData, wrapper, tab, data, timers,
        schedule: () => screenshots.schedule(data, tab.id),
        fire() {
            const callbacks = [...timers.values()]
            timers.clear()
            return Promise.all(callbacks.map(callback => callback()))
        }
    }
}

Deno.test('repeated load completions debounce into one PNG capture', async () => {
    const h = harness()
    h.schedule()
    h.schedule()
    h.schedule()
    assert.equal(h.timers.size, 1)
    const done = h.fire()
    assert.equal(h.captures.length, 1)
    assert.deepEqual(h.captures[0].options, { format: 'png' })
    h.captures[0].resolve('image')
    await done
    assert.deepEqual(h.saves, [{ id: 'page', screenshot: 'image' }])
})

Deno.test('cancelling a released frame clears its pending timer', async () => {
    const h = harness()
    h.schedule()
    h.screenshots.cancel(h.frame)
    assert.equal(h.timers.size, 0)
    await h.fire()
    assert.equal(h.captures.length, 0)
})

Deno.test('frames must still be current, visible and loaded when their timer fires', async () => {
    for (const change of [
        h => { h.data.frames.page.frame = null },
        h => { h.data.frames.page = { ...h.frameData } },
        h => { h.frame.isConnected = false },
        h => { h.wrapper.isConnected = false },
        h => { h.frame.parentNode = {} },
        h => { h.wrapper.checkVisibility = () => false },
        h => { h.wrapper.getBoundingClientRect = () => ({ width: 0, height: 0 }) },
        h => { h.wrapper.getBoundingClientRect = () => ({ width: 800, height: 600, left: -800, right: 0, top: 0, bottom: 600 }) },
        h => { h.frameData.loading = true },
        h => { h.frameData.directNavigation = { urls: [h.tab.url] } },
        h => { h.frame.src = 'about:blank' },
        h => { h.tab.preview = true },
        h => { h.tab.archive = 'closed' },
        h => { h.tab._deleted = true },
        h => { delete h.data.docs.page }
    ]) {
        const h = harness()
        h.schedule()
        change(h)
        await h.fire()
        assert.equal(h.captures.length, 0)
    }
})

Deno.test('hover previews never schedule automatic capture but lightboxes do', async () => {
    const h = harness()
    h.tab.preview = true
    h.schedule()
    assert.equal(h.timers.size, 0)
    h.tab.preview = false
    h.tab.lightbox = true
    h.schedule()
    const done = h.fire()
    h.captures[0].resolve('lightbox')
    await done
    assert.equal(h.saves[0].screenshot, 'lightbox')
})

Deno.test('closing, replacing or navigating a frame during capture discards its result', async () => {
    for (const change of [
        h => h.screenshots.cancel(h.frame),
        h => { h.frameData.frame = {} },
        h => { h.tab.archive = 'closed' },
        h => { h.frameData.committedUrl = 'https://next.example/' },
        h => { h.tab.url = 'https://requested.example/' },
        h => { h.frameData.wrapper = null }
    ]) {
        const h = harness()
        h.schedule()
        const done = h.fire()
        change(h)
        h.captures[0].resolve('stale')
        await done
        assert.deepEqual(h.saves, [])
    }
})

Deno.test('reload of the same URL invalidates an in-flight capture', async () => {
    const h = harness()
    h.schedule()
    const oldCapture = h.fire()
    h.screenshots.cancel(h.frame)
    h.schedule()
    h.captures[0].resolve('before reload')
    await oldCapture
    assert.deepEqual(h.saves, [])
    const newCapture = h.fire()
    h.captures[1].resolve('after reload')
    await newCapture
    assert.equal(h.saves[0].screenshot, 'after reload')
})

Deno.test('a frame never runs overlapping captures even when its component schedules again', async () => {
    const h = harness()
    h.schedule()
    const first = h.fire()
    h.schedule()
    h.schedule()
    await h.fire()
    assert.equal(h.captures.length, 1)
    h.captures[0].resolve('outdated')
    await first
    assert.equal(h.captures.length, 2)
    assert.deepEqual(h.saves, [])
    h.captures[1].resolve('latest')
    await Promise.resolve()
    assert.equal(h.saves[0].screenshot, 'latest')
})

Deno.test('cancellation also clears a request waiting for an in-flight capture', async () => {
    const h = harness()
    h.schedule()
    const first = h.fire()
    h.schedule()
    await h.fire()
    h.screenshots.cancel(h.frame)
    h.captures[0].resolve('closed')
    await first
    assert.equal(h.captures.length, 1)
    assert.deepEqual(h.saves, [])
})

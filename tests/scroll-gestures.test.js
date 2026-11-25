import assert from 'node:assert/strict'
import { createScrollGestures, isScrollGesture } from '../app/lib/scroll-gestures.js'

function harness () {
    const progress = [], triggers = [], pans = [], scales = []
    let pending
    const gestures = createScrollGestures({
        onProgress: value => progress.push(value), onTrigger: value => triggers.push(value),
        onPan: value => pans.push(value), onScale: value => scales.push(value),
        schedule: callback => { pending = callback; return 1 }, cancel: () => { pending = null }
    })
    return { ...gestures, progress, triggers, pans, scales, idle: () => pending?.() }
}

const wheel = (deltaY, extra = {}) => ({ deltaX: 0, deltaY, deltaMode: 0, shiftKey: false, ...extra })

Deno.test('overview thresholds normalize wheel units, cancel on reversal and trigger once per burst', () => {
    const h = harness()
    h.wheel(wheel(-10000))
    assert.equal(h.progress.at(-1).progress, 1 / 3)
    assert.deepEqual(h.triggers, [])
    h.wheel(wheel(5, { deltaMode: 1 }))
    assert.equal(h.progress.at(-1).progress, 1 / 3)
    h.wheel(wheel(80))
    h.wheel(wheel(80))
    assert.deepEqual(h.triggers, [1])
    h.wheel(wheel(-800))
    assert.deepEqual(h.triggers, [1])
    h.idle()
    assert.equal(h.progress.at(-1), null)
    for (let index = 0; index < 3; index++) {
        h.wheel(wheel(-1, { deltaMode: 2 }))
    }
    assert.deepEqual(h.triggers, [1, -1])
    h.reset()
})

Deno.test('frame scrolling locks axes per burst, starts ten percent smaller and restores on release', () => {
    const h = harness()
    h.setFrameMode(true)
    assert.deepEqual(h.scales, [0.9])
    h.wheel(wheel(2, { deltaX: 40, shiftKey: true }))
    h.wheel(wheel(-100, { deltaX: 3, shiftKey: true }))
    assert.deepEqual(h.pans, [40, 3])
    assert.deepEqual(h.scales, [0.9])
    h.idle()
    h.wheel(wheel(-100, { deltaX: 2, shiftKey: true }))
    assert.equal(h.scales.at(-1), 0.8)
    h.wheel(wheel(-10000, { deltaX: 200, shiftKey: true }))
    assert.equal(h.scales.at(-1), 0.45)
    assert.deepEqual(h.pans, [40, 3])
    h.wheel(wheel(10000, { shiftKey: true }))
    assert.equal(h.scales.at(-1), 0.9)
    h.setFrameMode(false)
    assert.equal(h.scales.at(-1), 1)
    assert.deepEqual(h.triggers, [])
    h.reset()
})

Deno.test('horizontal gestures never open overviews and modifier selection leaves ordinary zoom alone', () => {
    const h = harness()
    for (let index = 0; index < 10; index++) {
        h.wheel(wheel(-40, { deltaX: 100 }))
    }
    assert.deepEqual(h.triggers, [])
    assert.equal(isScrollGesture({ altKey: true }, 'option'), true)
    assert.equal(isScrollGesture({ ctrlKey: true }, 'option'), false)
    assert.equal(isScrollGesture({ ctrlKey: true }, 'control'), true)
    assert.equal(isScrollGesture({ altKey: true, ctrlKey: true }, 'control'), false)
    assert.equal(isScrollGesture({ altKey: true, metaKey: true }, 'option'), false)
    h.reset()
})

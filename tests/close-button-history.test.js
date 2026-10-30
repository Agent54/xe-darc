import assert from 'node:assert/strict'
import { closeButtonHistory } from '../app/lib/close-button-history.js'

function harness (instant) {
    let now = 0
    let nextId = 1
    const timers = new Map()
    const changes = []
    const node = new EventTarget()
    const create = new Function('setTimeout', 'clearTimeout', `return (${closeButtonHistory.toString()})`)(
        (callback, delay) => { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id },
        id => timers.delete(id)
    )
    const onChange = visible => changes.push(visible)
    const action = create(node, { instant, onChange })
    return {
        action, changes, timers, onChange,
        enter: () => node.dispatchEvent(new Event('mouseenter')),
        leave: () => node.dispatchEvent(new Event('mouseleave')),
        advance (ms) {
            now += ms
            for (const [id, timer] of timers) {
                if (timer.at <= now) { timers.delete(id); timer.callback() }
            }
        }
    }
}

Deno.test('cold close-button hover requests history before the initial card appears', () => {
    const h = harness(false)
    h.enter()
    assert.deepEqual(h.changes, [false, true])
    assert.equal(h.timers.size, 0)
    h.action.update({ instant: true, onChange: h.onChange })
    assert.deepEqual(h.changes, [false, true], 'warming the card does not restart the reveal')
    h.leave()
    assert.equal(h.changes.at(-1), false)
    h.action.destroy()
})

Deno.test('warm close-button hover reveals after 300 ms and survives reactive updates', () => {
    const h = harness(true)
    h.enter()
    h.advance(200)
    h.action.update({ instant: true, onChange: h.onChange })
    h.advance(99)
    assert.deepEqual(h.changes, [false])
    h.advance(1)
    assert.deepEqual(h.changes, [false, true])
    h.action.destroy()
})

Deno.test('leaving cancels pending history and re-entry starts a fresh delay', () => {
    const h = harness(true)
    h.enter()
    h.advance(200)
    h.leave()
    h.advance(300)
    assert.equal(h.changes.includes(true), false)
    h.enter()
    h.advance(299)
    assert.equal(h.changes.includes(true), false)
    h.advance(1)
    assert.equal(h.changes.at(-1), true)
    h.action.destroy()
})

Deno.test('removing a close button cancels history and detaches its listeners', () => {
    const h = harness(true)
    h.enter()
    h.action.destroy()
    h.advance(300)
    h.enter()
    h.leave()
    assert.deepEqual(h.changes, [false])
    assert.equal(h.timers.size, 0)
})

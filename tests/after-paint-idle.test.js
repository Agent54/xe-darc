import assert from 'node:assert/strict'
import { afterPaintIdle } from '../app/lib/after-paint-idle.js'

function withScheduler(run, { idle = true } = {}) {
    const names = ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'requestIdleCallback', 'cancelIdleCallback']
    const original = Object.fromEntries(names.map(name => [name, globalThis[name]]))
    const queues = { frame: new Map(), task: new Map(), idle: new Map() }
    let next = 0
    const schedule = queue => callback => { queue.set(++next, callback); return next }
    globalThis.requestAnimationFrame = schedule(queues.frame)
    globalThis.cancelAnimationFrame = id => queues.frame.delete(id)
    globalThis.setTimeout = schedule(queues.task)
    globalThis.clearTimeout = id => queues.task.delete(id)
    globalThis.requestIdleCallback = idle ? schedule(queues.idle) : undefined
    globalThis.cancelIdleCallback = id => queues.idle.delete(id)
    function flush(name) {
        const callbacks = [...queues[name].values()]
        queues[name].clear()
        for (const callback of callbacks) {
            callback()
        }
    }
    try {
        run({ flush, queues })
    } finally {
        for (const name of names) {
            if (original[name] === undefined) {
                delete globalThis[name]
            } else {
                globalThis[name] = original[name]
            }
        }
    }
}

Deno.test('background work waits for the initial frame, a paint opportunity, and idle time', () => {
    withScheduler(({ flush }) => {
        let calls = 0
        afterPaintIdle(() => calls++)
        assert.equal(calls, 0)
        flush('frame')
        assert.equal(calls, 0)
        flush('task')
        assert.equal(calls, 0)
        flush('idle')
        assert.equal(calls, 1)
    })
})

Deno.test('closing before any scheduling stage cancels pending background work', () => {
    for (const stage of ['frame', 'task', 'idle']) {
        withScheduler(({ flush, queues }) => {
            let calls = 0
            const cancel = afterPaintIdle(() => calls++)
            if (stage !== 'frame') {
                flush('frame')
            }
            if (stage === 'idle') {
                flush('task')
            }
            cancel()
            flush('frame')
            flush('task')
            flush('idle')
            assert.equal(calls, 0)
            assert.ok(Object.values(queues).every(queue => queue.size === 0))
        })
    }
})

Deno.test('browsers without idle callbacks still defer work until after the initial frame', () => {
    withScheduler(({ flush }) => {
        let calls = 0
        afterPaintIdle(() => calls++)
        flush('frame')
        assert.equal(calls, 0)
        flush('task')
        assert.equal(calls, 1)
    }, { idle: false })
})

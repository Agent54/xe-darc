import assert from 'node:assert/strict'
import { compileModule } from 'svelte/compiler'
import * as svelteClient from 'svelte/internal/client'

const source = compileModule(Deno.readTextFileSync(new URL('../app/lib/tab-group-preview.svelte.js', import.meta.url)), { generate: 'client' }).js.code
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')

function previewHarness () {
    let now = 0
    let nextId = 1
    const timers = new Map()
    const setTimeout = (callback, delay) => { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id }
    const clearTimeout = id => timers.delete(id)
    const api = new Function('$', 'setTimeout', 'clearTimeout', `${source}\nreturn { createTabGroupPreview, getFaviconWindow, getDefaultGroupTabIndex }`)(svelteClient, setTimeout, clearTimeout)
    return {
        preview: api.createTabGroupPreview(), window: api.getFaviconWindow, defaultIndex: api.getDefaultGroupTabIndex, timers,
        advance(ms) {
            const end = now + ms
            while (true) {
                const next = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= end)
                if (!next) break
                now = next[1].at
                timers.delete(next[0])
                next[1].callback()
            }
            now = end
        }
    }
}

Deno.test('grid stacks default to their current active member, then space or remembered activity', () => {
    const { defaultIndex } = previewHarness()
    const tabs = ['first', 'remembered', 'space-active', 'active'].map(id => ({ id }))
    assert.equal(defaultIndex(tabs, ['active', 'space-active', 'remembered']), 3)
    assert.equal(defaultIndex(tabs, ['another-group', 'space-active', 'remembered']), 2)
    assert.equal(defaultIndex(tabs, ['another-group', null, 'remembered']), 1)
    assert.equal(defaultIndex(tabs, [null, 'closed', 'missing']), 0)
    assert.equal(defaultIndex(tabs.toReversed(), ['active']), 0)
})

Deno.test('the default favicon window includes active members beyond the first three tabs', () => {
    const { defaultIndex, window } = previewHarness()
    for (const count of [2, 3, 10, 200]) {
        const tabs = Array.from({ length: count }, (_, index) => ({ id: `tab-${index}` }))
        for (const active of tabs) {
            const index = defaultIndex(tabs, [active.id])
            const favicons = window(tabs.length, index / Math.max(1, tabs.length - 1))
            assert.ok(index >= favicons.start && index < favicons.end)
        }
    }
})

Deno.test('favicon scrubbing waits 700 ms and pointer movement retains the initial timer', () => {
    const { preview, advance } = previewHarness()
    preview.enter('a')
    preview.move('a', 0.1, 10)
    advance(699)
    assert.equal(preview.state.groupId, null)
    preview.move('a', 0.9, 10)
    advance(1)
    assert.equal(preview.state.groupId, 'a')
    assert.equal(preview.state.tabIndex, 9)
    preview.move('a', 0, 10)
    assert.equal(preview.state.tabIndex, 0)
    preview.destroy()
})

Deno.test('warmed scrubbing follows other groups immediately and resets after two seconds away', () => {
    const { preview, advance } = previewHarness()
    preview.move('a', 0, 10)
    advance(700)
    preview.leave('a')
    preview.enter('b')
    preview.move('b', 0.5, 8)
    assert.equal(preview.state.groupId, 'b')
    assert.equal(preview.state.tabIndex, 4)
    preview.leave('b')
    advance(1999)
    preview.enter('c')
    preview.move('c', 1, 5)
    assert.equal(preview.state.tabIndex, 4)
    preview.leave('c')
    advance(2000)
    preview.move('d', 0.5, 10)
    assert.equal(preview.state.groupId, null)
    advance(699)
    assert.equal(preview.state.groupId, null)
    advance(1)
    assert.equal(preview.state.groupId, 'd')
    preview.destroy()
})

Deno.test('leaving the favicon strip cancels a pending preview without warming the next group', () => {
    const { preview, advance } = previewHarness()
    preview.move('a', 1, 10)
    advance(300)
    preview.leaveStrip('a')
    advance(1000)
    assert.equal(preview.state.groupId, null)
    preview.enter('b')
    preview.move('b', 0.5, 10)
    advance(699)
    assert.equal(preview.state.groupId, null)
    advance(1)
    assert.equal(preview.state.groupId, 'b')
    preview.destroy()
})

Deno.test('remaining anywhere over a group keeps warmed scrubbing available', () => {
    const { preview, advance } = previewHarness()
    preview.move('a', 0.5, 10)
    advance(700)
    preview.leaveStrip('a')
    advance(10000)
    assert.equal(preview.state.groupId, 'a')
    preview.leave('a')
    preview.enter('b')
    advance(10000)
    preview.move('b', 1, 10)
    assert.equal(preview.state.groupId, 'b')
    assert.equal(preview.state.tabIndex, 9)
    preview.destroy()
})

Deno.test('the favicon viewport reaches every tab while mounting only its visible window', () => {
    const { window } = previewHarness()
    assert.deepEqual(window(10, 0), { start: 0, end: 3, offset: 0, visible: 3 })
    assert.deepEqual(window(10, 1), { start: 7, end: 10, offset: 0, visible: 3 })
    assert.deepEqual(window(100, 0.5), { start: 48, end: 52, offset: 0.5, visible: 3 })
    assert.deepEqual(window(10, 0, 2), { start: 0, end: 2, offset: 0, visible: 2 })
    assert.deepEqual(window(10, 1, 2), { start: 8, end: 10, offset: 0, visible: 2 })
    for (const count of [2, 3, 4, 10, 200]) {
        for (const slots of [2, 3]) {
            for (let step = 0; step <= 100; step++) {
                const progress = step / 100
                const result = window(count, progress, slots)
                const hovered = Math.min(count - 1, Math.floor(progress * count))
                assert.equal(result.visible, Math.min(count, slots))
                assert.ok(result.end - result.start <= slots + 1)
                assert.ok(hovered >= result.start && hovered < result.end)
            }
        }
    }
})

Deno.test('disposing a sidebar cancels preview and reset timers', () => {
    const { preview, advance, timers } = previewHarness()
    preview.move('a', 0.5, 10)
    preview.destroy()
    assert.equal(timers.size, 0)
    advance(1000)
    assert.equal(preview.state.groupId, null)
})

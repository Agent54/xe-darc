import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createTabHistorySwitcher, getTabActivationHistory } from '../app/lib/tab-activation-history.js'
import { getFrameShortcutScript } from '../app/lib/shortcuts.js'

function harness() {
    let now = 0, nextTimer = 0, state = null
    const timers = new Map()
    const tabs = ['a', 'b', 'c', 'pin', 'closed', 'preview'].map(id => ({ id, spaceId: 'space', type: 'tab' }))
    const docs = Object.fromEntries(tabs.map(tab => [tab.id, tab]))
    docs.pin.pinned = 'left'
    docs.closed.archive = 'closed'
    docs.preview.preview = true
    const calls = []
    const data = {
        docs,
        spaceMeta: { activeSpace: 'space', activeTabId: 'a' },
        spaces: { space: { tabs, activeTabsOrder: ['a', 'pin', 'missing', 'a', 'b', 'b', 'c', 'b', 'closed', 'preview'] } },
        activate(id) {
            calls.push(id)
            this.spaceMeta.activeTabId = id
            this.spaces.space.activeTabsOrder.unshift({ id, activatedAt: now })
        },
        previous() { this.activate('b'); return true }
    }
    const switcher = createTabHistorySwitcher(data, value => { state = value }, {
        schedule(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id },
        cancel(id) { timers.delete(id) }
    })
    return {
        data, calls, switcher, get state() { return state },
        advance(ms) {
            now += ms
            for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn() }
        }
    }
}

Deno.test('activation history preserves repeated visits and legacy timestamps while filtering unavailable tabs', () => {
    const h = harness()
    h.data.spaces.space.activeTabsOrder[0] = { id: 'a', lastActiveAt: 123 }
    const entries = getTabActivationHistory(h.data)
    assert.deepEqual(entries.map(entry => entry.id), ['a', 'a', 'b', 'b', 'c', 'b'])
    assert.equal(entries[0].activatedAt, 123)
    assert.deepEqual(getTabActivationHistory(h.data, 'missing'), [])
})

Deno.test('quick switching uses the existing previous action immediately and cancels the delayed view on release', () => {
    const h = harness()
    h.switcher.previous()
    assert.deepEqual(h.calls, ['b'])
    h.advance(499)
    assert.equal(h.state.visible, false)
    h.switcher.finish()
    h.advance(2000)
    assert.equal(h.state, null)
    assert.equal(h.data.spaceMeta.activeTabId, 'b')
})

Deno.test('holding reveals History at 500 ms from the first Tab and cycles older visits without reordering the list', () => {
    const h = harness()
    h.switcher.previous()
    const snapshot = h.state.entries
    h.advance(300)
    h.switcher.previous()
    assert.deepEqual(h.calls, ['b', 'c'])
    h.advance(199)
    assert.equal(h.state.visible, false)
    h.advance(1)
    assert.equal(h.state.visible, true)
    h.switcher.previous()
    assert.deepEqual(h.calls, ['b', 'c', 'b'])
    assert.equal(h.state.entries, snapshot)
    h.switcher.previous()
    assert.deepEqual(h.calls, ['b', 'c', 'b'], 'stop when no older valid visit remains')
    h.switcher.finish()
    assert.equal(h.state, null)
    assert.equal(h.data.spaceMeta.activeTabId, 'b')
})

Deno.test('cycling skips tabs closed or pinned during the hold and no-history switches never open the view', () => {
    const h = harness()
    h.switcher.previous()
    h.data.docs.c.archive = 'closed'
    h.switcher.previous()
    assert.deepEqual(h.calls, ['b'])
    h.switcher.finish()
    h.data.previous = () => false
    h.switcher.previous()
    h.advance(1000)
    assert.equal(h.state, null)
})

Deno.test('a newly focused controlled frame forwards Control release without receiving the original Tab', () => {
    const listeners = new Map(), messages = []
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { platform: 'MacIntel' } })
    try {
        vm.runInNewContext(getFrameShortcutScript('new-frame'), {
            window: { addEventListener(name, listener) { const list = listeners.get(name) || []; list.push(listener); listeners.set(name, list) } },
            console: { log: message => messages.push(message) }, setTimeout, clearTimeout
        })
        for (const listener of listeners.get('keyup')) listener({ key: 'Control', ctrlKey: false })
        assert.deepEqual(messages, ['iwa:shortcut:' + JSON.stringify({ id: 'finish-tab-switch', tabId: 'new-frame' })])
    } finally {
        if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
        else delete globalThis.navigator
    }
})

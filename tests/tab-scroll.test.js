import assert from 'node:assert/strict'
import { compileModule } from 'svelte/compiler'
import * as svelteClient from 'svelte/internal/client'

// Exercise the actual App effect with the client runtime, including its reactive subscriptions.
const appSource = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
const effect = appSource
    .match(/    let initialScrollPerformed[\s\S]*?(?=    function closeTab\()/)[0]
    .replace('$state(false)', '$state(initial)')
const source = compileModule(`
    export function observe (state, data, scrollContainer, initial) {
        const openSidebars = new Set()
        const tabButtons = {}
        const isWindowResizing = false
        const visibleLeftPinnedTabs = $derived(state.leftPins)
        const visibleRightPinnedTabs = $derived(state.rightPins)
        const unpinnedTabCount = $derived(Object.values(state.docs).filter(tab => !tab.pinned).length)
        let tabChangeFromScroll = false
        ${effect}
        return {
            fromScroll (value) { tabChangeFromScroll = value },
            scrollSuppressed () { return tabChangeFromScroll || pinScrollTimer !== null },
            initialized () { return initialScrollPerformed }
        }
    }
`, { generate: 'client', filename: 'tab-scroll.svelte.js' }).js.code
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')

function scrollHarness ({ active = 'one', center = 'one', pinned = [], initial = true } = {}) {
    const calls = []
    const timers = new Map()
    let nextTimer = 1
    class Wrapper {
        constructor (id) { this.id = id; this.offsetLeft = 209; this.isConnected = true }
        scrollIntoView (options) { calls.push({ id: this.id, ...options }) }
        getBoundingClientRect () { return { left: this.offsetLeft } }
    }
    const state = svelteClient.proxy({
        leftPins: [], rightPins: [], center,
        ui: { tabActivation: { tabId: active, source: 'navigation' } },
        spaceMeta: { activeTabId: active },
        docs: Object.fromEntries(['one', 'two', 'pin', 'other-pin'].map(id => [id, { id, pinned: pinned.includes(id) }])),
        frames: Object.fromEntries(['one', 'two', 'pin', 'other-pin'].map(id => [id, { wrapper: new Wrapper(id) }]))
    })
    const data = { ...state, getLastActiveNonPinnedTabId: () => state.center }
    const container = { style: {}, scrollLeft: 0, getBoundingClientRect: () => ({ left: 0 }) }
    const observe = new Function('$', 'console', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', `${source}\nreturn observe`)(
        svelteClient, { log () {} },
        (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id },
        id => timers.delete(id), () => 1
    )
    let api
    const destroy = svelteClient.effect_root(() => { api = observe(state, data, container, initial) })
    svelteClient.flush()
    calls.length = 0
    return {
        state, api, calls, container, destroy,
        change (update) { svelteClient.flush(() => update(state)) },
        activate (tabId, source = 'navigation') {
            this.change(state => {
                state.spaceMeta.activeTabId = tabId
                state.ui.tabActivation = { tabId, source }
            })
        },
        mount (id) { this.change(() => { state.frames[id].wrapper = new Wrapper(id) }) },
        advance (ms) {
            for (const [id, timer] of timers) {
                timer.delay -= ms
                if (timer.delay <= 0) { timers.delete(id); timer.callback() }
            }
        }
    }
}

Deno.test('adding, removing, collapsing and expanding sidepins realigns the current center tab', () => {
    const h = scrollHarness()
    try {
        for (const [side, pins] of [['leftPins', ['pin']], ['leftPins', []], ['rightPins', ['pin']], ['rightPins', []]]) {
            h.change(state => { state[side] = pins })
            assert.deepEqual(h.calls.splice(0), [{ id: 'one', behavior: 'instant' }])
            assert.equal(h.state.spaceMeta.activeTabId, 'one')
        }
    } finally { h.destroy() }
})

Deno.test('selecting a group pin after startup aligns its group when the center wrapper mounts', () => {
    const h = scrollHarness({ pinned: ['pin'] })
    try {
        h.change(state => {
            state.frames.two.wrapper = null
            state.center = 'two'
            state.spaceMeta.activeTabId = 'pin'
        })
        assert.equal(h.calls.length, 0)
        h.mount('two')
        assert.deepEqual(h.calls, [{ id: 'two', behavior: 'instant' }])
        assert.equal(h.state.spaceMeta.activeTabId, 'pin')
        assert.equal(h.api.scrollSuppressed(), true)
        h.advance(450)
        assert.equal(h.api.scrollSuppressed(), true)
        h.advance(50)
        assert.equal(h.api.scrollSuppressed(), false)
    } finally { h.destroy() }
})

Deno.test('pin layout changes keep the center aligned while a sidepin remains active', () => {
    const h = scrollHarness({ active: 'pin', pinned: ['pin'] })
    try {
        h.change(state => { state.leftPins = ['pin'] })
        assert.deepEqual(h.calls, [{ id: 'one', behavior: 'instant' }])
        assert.equal(h.state.spaceMeta.activeTabId, 'pin')
    } finally { h.destroy() }
})

Deno.test('rapidly switching group pins still aligns their centers while observer activation is suppressed', () => {
    const h = scrollHarness({ pinned: ['pin', 'other-pin'] })
    try {
        h.change(state => { state.spaceMeta.activeTabId = 'pin' })
        assert.equal(h.api.scrollSuppressed(), true)
        h.change(state => {
            state.center = 'two'
            state.spaceMeta.activeTabId = 'other-pin'
        })
        assert.deepEqual(h.calls.map(call => call.id), ['one', 'two'])
        assert.equal(h.state.spaceMeta.activeTabId, 'other-pin')
    } finally { h.destroy() }
})

Deno.test('selecting a center tab during pin alignment still scrolls immediately', () => {
    const h = scrollHarness({ active: 'pin', pinned: ['pin'] })
    try {
        assert.equal(h.api.scrollSuppressed(), true)
        h.change(state => { state.spaceMeta.activeTabId = 'two' })
        assert.deepEqual(h.calls, [{ id: 'two', behavior: 'instant' }])
    } finally { h.destroy() }
})

Deno.test('observer-driven activation does not snap back, but does not suppress a subsequent pin toggle', () => {
    const h = scrollHarness()
    try {
        h.api.fromScroll(true)
        h.activate('two', 'scroll')
        assert.equal(h.calls.length, 0)
        h.change(state => { state.rightPins = ['pin'] })
        assert.deepEqual(h.calls, [{ id: 'two', behavior: 'instant' }])
    } finally { h.destroy() }
})

Deno.test('a sidebar activation during the previous scroll guard aligns immediately, even with unchanged tab counts', () => {
    const h = scrollHarness()
    try {
        h.api.fromScroll(true)
        h.activate('two', 'scroll')
        assert.equal(h.calls.length, 0)
        h.activate('one')
        assert.deepEqual(h.calls, [{ id: 'one', behavior: 'instant' }])
    } finally { h.destroy() }
})

Deno.test('an explicit activation of the same scroll-selected tab is reactive and requests alignment', () => {
    const h = scrollHarness()
    try {
        h.api.fromScroll(true)
        h.activate('two', 'scroll')
        h.activate('two')
        assert.deepEqual(h.calls, [{ id: 'two', behavior: 'instant' }])
    } finally { h.destroy() }
})

Deno.test('switching to an equal-sized group waits for its selected tab to mount and then aligns it', () => {
    const h = scrollHarness()
    try {
        h.api.fromScroll(true)
        h.activate('two', 'scroll')
        h.change(state => { state.frames.one.wrapper = null })
        h.activate('one')
        assert.equal(h.calls.length, 0)
        h.mount('one')
        assert.deepEqual(h.calls, [{ id: 'one', behavior: 'instant' }])
    } finally { h.destroy() }
})

Deno.test('unpinning the only tab waits for its center wrapper without scrolling the fixed pin', () => {
    const h = scrollHarness({ active: 'pin', center: null, pinned: ['pin'] })
    try {
        h.change(state => {
            state.docs.pin.pinned = false
            state.frames.pin.wrapper = null
        })
        assert.equal(h.calls.length, 0)
        h.mount('pin')
        assert.deepEqual(h.calls, [{ id: 'pin', behavior: 'instant' }])
    } finally { h.destroy() }
})

Deno.test('unpinning a hidden tab during observer suppression realigns after its center wrapper mounts', () => {
    const h = scrollHarness({ active: 'pin', pinned: ['pin'] })
    try {
        assert.equal(h.api.scrollSuppressed(), true)
        h.change(state => {
            state.docs.pin.pinned = false
            state.frames.pin.wrapper = null
        })
        assert.equal(h.calls.length, 0)
        h.mount('pin')
        assert.deepEqual(h.calls, [{ id: 'pin', behavior: 'instant' }])
    } finally { h.destroy() }
})

Deno.test('a pin-only startup can later align a new center tab', () => {
    const h = scrollHarness({ active: 'pin', center: null, pinned: ['pin'], initial: false })
    try {
        assert.equal(h.api.initialized(), true)
        h.change(state => { state.center = 'two' })
        assert.deepEqual(h.calls, [{ id: 'two', behavior: 'instant' }])
    } finally { h.destroy() }
})

Deno.test('startup retry timers cannot scroll back to the old group after a new selection', () => {
    const h = scrollHarness({ initial: false })
    try {
        h.activate('two')
        h.container.scrollLeft = 777
        h.advance(2000)
        assert.equal(h.container.scrollLeft, 777)
    } finally { h.destroy() }
})

const observerStart = appSource.indexOf('    onMount(() => {', appSource.indexOf('    let _observer = null'))
const observerSetup = appSource.slice(observerStart, appSource.indexOf('    // Only expose the observer', observerStart))

function visibilityHarness () {
    const timers = new Map()
    const targets = new Set()
    const calls = []
    const data = {
        ui: { tabActivation: { tabId: 'one', source: 'navigation' } },
        spaceMeta: { activeSpace: 'space', activeTabId: 'one' }, docs: {}, frames: {},
        activate (tabId, { source = 'navigation' } = {}) {
            calls.push({ tabId, source })
            this.spaceMeta.activeTabId = tabId
            this.ui.tabActivation = { tabId, source }
        }
    }
    let nextTimer = 1
    let deliver
    const visibilityTimers = new Map()
    new Function('onMount', 'IntersectionObserver', 'data', 'scrollContainer', 'visibilityTimers', 'console', 'setTimeout', 'clearTimeout', `
        let _observer = null
        let tabChangeFromScroll = false
        let tabChangeFromScrollTimer = null
        let pinScrollTimer = null
        ${observerSetup}
    `)(
        callback => callback(),
        function (callback) { deliver = callback }, data,
        { contains: target => targets.has(target) }, visibilityTimers, { log () {} },
        (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id },
        id => timers.delete(id)
    )
    return {
        data, calls, visibilityTimers,
        entry (tabId, intersectionRatio = 0.8) {
            const target = { id: `tab_${tabId}`, isConnected: true }
            targets.add(target)
            data.docs[tabId] = { id: tabId, spaceId: 'space' }
            data.frames[tabId] = { wrapper: target }
            return { target, isIntersecting: intersectionRatio > 0, intersectionRatio }
        },
        deliver: entries => deliver(entries),
        advance (ms) {
            for (const [id, timer] of timers) {
                timer.delay -= ms
                if (timer.delay <= 0) { timers.delete(id); timer.callback() }
            }
        }
    }
}

Deno.test('visibility activation is marked as scroll-origin and releases its pending callback', () => {
    const h = visibilityHarness()
    h.deliver([h.entry('two')])
    h.advance(450)
    assert.deepEqual(h.calls, [{ tabId: 'two', source: 'scroll' }])
    assert.equal(h.visibilityTimers.size, 0)
})

Deno.test('a delayed visibility callback cannot overwrite a newer sidebar selection', () => {
    const h = visibilityHarness()
    h.deliver([h.entry('two')])
    h.data.activate('three')
    h.advance(450)
    assert.deepEqual(h.calls, [{ tabId: 'three', source: 'navigation' }])
})

Deno.test('detached or replaced group frames cannot reactivate through stale visibility entries', () => {
    for (const invalidation of ['detached', 'replaced', 'space', 'pinned']) {
        const h = visibilityHarness()
        const entry = h.entry('two')
        h.deliver([entry])
        if (invalidation === 'detached') entry.target.isConnected = false
        if (invalidation === 'replaced') h.data.frames.two.wrapper = {}
        if (invalidation === 'space') h.data.spaceMeta.activeSpace = 'other-space'
        if (invalidation === 'pinned') h.data.docs.two.pinned = 'left'
        h.advance(450)
        assert.equal(h.calls.length, 0, invalidation)
    }
})

Deno.test('dropping below the visibility threshold cancels activation even while partly intersecting', () => {
    const h = visibilityHarness()
    const entry = h.entry('two')
    h.deliver([entry])
    h.deliver([{ ...entry, intersectionRatio: 0.5 }])
    h.advance(450)
    assert.equal(h.calls.length, 0)
})

Deno.test('repeated visibility entries replace the previous activation timer', () => {
    const h = visibilityHarness()
    const entry = h.entry('two')
    h.deliver([entry])
    h.advance(200)
    h.deliver([entry])
    h.advance(250)
    assert.equal(h.calls.length, 0)
    h.advance(200)
    assert.deepEqual(h.calls, [{ tabId: 'two', source: 'scroll' }])
})

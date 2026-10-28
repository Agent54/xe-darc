import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'

const source = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
const functions = ['closeHovercard', 'dismissHovercards', 'handleHovercardPointerDown', 'navigateTabHistory', 'handleFrameMouseDown']
const handlers = parse(source).instance.content.body
    .filter(node => node.type === 'FunctionDeclaration' && functions.includes(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n')

function navigationHarness() {
    let now = 0
    let nextId = 1
    const timers = new Map()
    const setTimeout = (callback, delay) => { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id }
    const clearTimeout = id => timers.delete(id)
    const actions = []
    const tab = { id: 'tab' }
    let api
    const window = { innerWidth: 1200, dispatchEvent: () => api.dismissHovercards() }
    const data = { docs: { tab }, frames: { tab: { frame: { back() { actions.push('back') }, forward() { actions.push('forward') } } } } }
    api = new Function('data', 'window', 'CustomEvent', 'setTimeout', 'clearTimeout', `
        let hoveredTab = null, navigationHovercardTabId = null, navigationHovercardTimeout = null
        let hoverTimeout = null, navButtonHoverTimeout = null, navButtonHovered = false
        let hovercardUrlBarExpanded = false, isTrashItemHover = false, hovercardShowTime = null
        let hovercardPosition = { x: 170, y: 40 }
        let isMouseDown = null, lastMouseActivityTime = 0, pendingBlurTimeout = null, controlledFrameHasFocus = false
        const tabButtons = {}, tabDrag = { active: false }
        const document = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, bottom: 40, width: 1200 }) }) }
        function startHovercardPositionCheck() {}
        function stopHovercardPositionCheck() {}
        ${handlers}
        return {
            navigateTabHistory, closeHovercard, dismissHovercards, handleHovercardPointerDown, handleFrameMouseDown,
            get visible() { return hoveredTab?.id || null },
            get held() { return navigationHovercardTabId },
            expandUrlBar() { hovercardUrlBarExpanded = true }
        }
    `)(data, window, class { constructor(type) { this.type = type } }, setTimeout, clearTimeout)
    return {
        api, actions, timers,
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
        },
        click(inside = false) { api.handleHovercardPointerDown({ target: { closest: () => inside ? {} : null } }) }
    }
}

Deno.test('back and forward reveal the hovercard immediately for 800 ms', () => {
    for (const direction of ['back', 'forward']) {
        const h = navigationHarness()
        h.api.navigateTabHistory('tab', direction)
        assert.deepEqual(h.actions, [direction])
        h.advance(799)
        h.api.closeHovercard()
        assert.equal(h.api.visible, 'tab')
        h.advance(1)
        assert.equal(h.api.visible, null)
    }
})

Deno.test('repeated history navigation restarts the reveal duration', () => {
    const h = navigationHarness()
    h.api.navigateTabHistory('tab', 'back')
    h.advance(400)
    h.api.navigateTabHistory('tab', 'forward')
    h.advance(799)
    assert.equal(h.api.visible, 'tab')
    h.advance(1)
    assert.equal(h.api.visible, null)
    assert.equal(h.timers.size, 0)
})

Deno.test('outside clicks dismiss immediately and cancel the timer even with an expanded URL bar', () => {
    const h = navigationHarness()
    h.api.navigateTabHistory('tab', 'back')
    h.advance(100)
    h.api.expandUrlBar()
    h.click()
    assert.equal(h.api.visible, null)
    assert.equal(h.api.held, null)
    assert.equal(h.timers.size, 0)
    h.api.navigateTabHistory('tab', 'forward')
    h.advance(799)
    assert.equal(h.api.visible, 'tab')
})

Deno.test('clicks inside the hovercard retain it while clicks inside a page frame dismiss it', () => {
    const h = navigationHarness()
    h.api.navigateTabHistory('tab', 'back')
    h.click(true)
    assert.equal(h.api.visible, 'tab')
    h.api.handleFrameMouseDown({ detail: { button: 0 } })
    assert.equal(h.api.visible, null)
    assert.equal(h.timers.size, 0)
})

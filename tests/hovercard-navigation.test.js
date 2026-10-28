import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'

const source = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
const functions = ['closeHovercard', 'dismissHovercards', 'handleHovercardPointerDown', 'navigateTabHistory', 'handleFrameMouseDown', 'handleFrameClick']
const handlers = parse(source).instance.content.body
    .filter(node => node.type === 'FunctionDeclaration' && functions.includes(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n')
const clickListener = parse(source).instance.content.body.find(node =>
    node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression' &&
    node.expression.callee.object?.name === 'window' && node.expression.callee.property?.name === 'addEventListener' &&
    node.expression.arguments[0]?.value === 'darc-controlled-frame-click')
assert.ok(clickListener, 'the app shell subscribes to clicks forwarded from controlled frames')
const controlledFrameSource = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const bridgeHandlers = parse(controlledFrameSource).instance.content.body
    .filter(node => node.type === 'FunctionDeclaration' && ['setupContentScripts', 'setupMessageListener'].includes(node.id.name))
    .map(node => controlledFrameSource.slice(node.start, node.end)).join('\n')
const ipc = Deno.readTextFileSync(new URL('../app/inject/ipc.js', import.meta.url))

function navigationHarness(tabId = 'tab', zenMode = false) {
    let now = 0
    let nextId = 1
    const timers = new Map()
    const setTimeout = (callback, delay) => { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id }
    const clearTimeout = id => timers.delete(id)
    const actions = []
    const tab = { id: tabId }
    let api
    const window = new EventTarget()
    window.innerWidth = 1200
    const data = { docs: { [tabId]: tab }, frames: { [tabId]: { frame: { back() { actions.push('back') }, forward() { actions.push('forward') } } } } }
    api = new Function('data', 'window', 'CustomEvent', 'setTimeout', 'clearTimeout', 'focusModeEnabled', `
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
        ${source.slice(clickListener.start, clickListener.end)}
        window.addEventListener('darc-dismiss-hovercards', dismissHovercards)
        return {
            navigateTabHistory, closeHovercard, dismissHovercards, handleHovercardPointerDown, handleFrameMouseDown,
            get visible() { return hoveredTab?.id || null },
            get held() { return navigationHovercardTabId },
            expandUrlBar() { hovercardUrlBarExpanded = true }
        }
    `)(data, window, CustomEvent, setTimeout, clearTimeout, zenMode)
    return {
        api, actions, timers, window,
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

function contentClickBridge(shellWindow, tabId, subframe = false) {
    const scripts = []
    const messages = []
    const errors = []
    const frame = { addContentScripts(injections) { scripts.push(...injections); return Promise.resolve() } }
    const setup = new Function('frame', 'window', 'CustomEvent', 'tab', 'tabId', 'ipc', 'console', `
        const untrack = callback => callback()
        const userMods = { css: [], js: [] }, select = '', zoomControl = '', contextMenu = ''
        let isCommandKeyDown = false, commandKeyPressed = false
        ${bridgeHandlers}
        setupMessageListener(frame)
        setupContentScripts(frame)
    `)
    setup(frame, shellWindow, CustomEvent, { id: tabId, url: 'https://example.com' }, tabId, ipc, { log() {}, error: error => errors.push(error) })
    const script = scripts.find(script => script.name === 'system-script')
    assert.equal(script.allFrames, true, 'the click bridge is injected into nested frames')
    assert.equal(script.matchAboutBlank, true)

    const registrations = []
    const contentWindow = new EventTarget()
    contentWindow.top = subframe ? {} : contentWindow
    const addEventListener = contentWindow.addEventListener.bind(contentWindow)
    contentWindow.addEventListener = (type, listener, options) => {
        registrations.push({ type, options })
        addEventListener(type, listener, options)
    }
    const contentDocument = new EventTarget()
    const contentConsole = { log(message) { messages.push(message); frame.onconsolemessage({ message }) } }
    new Function('window', 'document', 'console', script.js.code)(contentWindow, contentDocument, contentConsole)
    return {
        frame, messages, errors, registrations, contentWindow,
        click(properties = {}) {
            const event = Object.assign(new Event('click', { cancelable: true }), {
                button: 0, clientX: 42, clientY: 73, screenX: 142, screenY: 173,
                altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, detail: 1,
                ...properties
            })
            contentWindow.dispatchEvent(event)
            return event
        }
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

Deno.test('zen mode navigates back and forward without revealing a hovercard', () => {
    const h = navigationHarness('tab', true)
    for (const direction of ['back', 'forward']) {
        h.api.navigateTabHistory('tab', direction)
        assert.equal(h.api.visible, null)
        assert.equal(h.api.held, null)
        assert.equal(h.timers.size, 0)
    }
    assert.deepEqual(h.actions, ['back', 'forward'])
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

Deno.test('an injected page click crosses the console bridge and immediately dismisses a navigation hovercard', () => {
    const tabId = 'darc:tab:clicked-page'
    const h = navigationHarness(tabId)
    const bridge = contentClickBridge(h.window, tabId)
    const clicks = []
    let dismissals = 0
    h.window.addEventListener('darc-dismiss-hovercards', () => dismissals++)
    h.window.addEventListener('darc-controlled-frame-click', event => clicks.push(event.detail))
    h.api.navigateTabHistory(tabId, 'back')
    const beforeClick = dismissals
    h.advance(100)
    h.api.expandUrlBar()
    const click = bridge.click({ ctrlKey: true, shiftKey: true, detail: 2 })
    assert.equal(click.defaultPrevented, false, 'forwarding must preserve the page click')
    assert.equal(h.api.visible, null)
    assert.equal(h.timers.size, 0)
    assert.equal(dismissals, beforeClick + 1, 'the click also dismisses sidebar hovercards through the shared event')
    assert.deepEqual(clicks, [{
        tabId, sourceFrame: `tab_${tabId}`, button: 0, clientX: 42, clientY: 73, screenX: 142, screenY: 173,
        altKey: false, ctrlKey: true, metaKey: false, shiftKey: true, detail: 2, isTopLevel: true
    }])
    assert.deepEqual(bridge.errors, [])
    assert.deepEqual(bridge.registrations.find(event => event.type === 'click').options, { capture: true, passive: true })
})

Deno.test('click forwarding also works inside nested frames and before page handlers suppress the event', () => {
    const h = navigationHarness()
    const bridge = contentClickBridge(h.window, 'tab', true)
    const clicks = []
    h.window.addEventListener('darc-controlled-frame-click', event => clicks.push(event.detail))
    bridge.contentWindow.addEventListener('click', event => event.stopImmediatePropagation())
    h.api.navigateTabHistory('tab', 'forward')
    bridge.click({ detail: 0 })
    assert.equal(h.api.visible, null)
    assert.equal(clicks.length, 1)
    assert.equal(clicks[0].isTopLevel, false)
    assert.equal(clicks[0].detail, 0, 'keyboard-generated clicks also pass through the bridge')
})

Deno.test('the click bridge ignores malformed payloads and messages for other tabs', () => {
    const h = navigationHarness()
    const bridge = contentClickBridge(h.window, 'tab')
    const clicks = []
    h.window.addEventListener('darc-controlled-frame-click', event => clicks.push(event.detail))
    h.api.navigateTabHistory('tab', 'back')
    for (const message of ['iwa:click:other:{}', 'iwa:click:tab:not-json', 'iwa:click:tab:null', 'iwa:click:tab:[]']) {
        bridge.frame.onconsolemessage({ message })
    }
    assert.equal(h.api.visible, 'tab')
    assert.equal(clicks.length, 0)
})

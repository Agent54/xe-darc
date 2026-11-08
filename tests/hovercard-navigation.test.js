import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { createShortcutHandler, getFrameShortcutScript, listenForShortcutHelpCancellation, shortcutActionIds } from '../app/lib/shortcuts.js'
import { scopedGuestScript, readGuestMessage } from '../app/lib/frame-ipc.js'
import { releasedFrames, isLiveFrameTab } from '../app/lib/frame-lifecycle.js'

const source = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
const functions = ['closeHovercard', 'dismissHovercards', 'handleHovercardPointerDown', 'navigateTabHistory', 'handleTabMouseEnter', 'handleFrameMouseDown', 'handleFrameClick']
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
    let hovercardHovered = false
    let api
    const window = new EventTarget()
    window.innerWidth = 1200
    window.innerHeight = 800
    const data = { docs: { [tabId]: tab }, frames: { [tabId]: { frame: { back() { actions.push('back') }, forward() { actions.push('forward') } } } } }
    api = new Function('data', 'window', 'CustomEvent', 'setTimeout', 'clearTimeout', 'focusModeEnabled', 'isHovercardHovered', `
        let hoveredTab = null, navigationHovercardTabId = null, navigationHovercardTimeout = null
        let hovercardPreviewVisible = true
        let instantHovercardsMode = false, instantModeResetTimer = null, closeButtonHoveredDelayed = false
        let hovercardRecentlyActive = false, hovercardResetTimer = null
        let hoverTimeout = null, navButtonHoverTimeout = null, navButtonHovered = false
        let hovercardUrlBarExpanded = false, isTrashItemHover = false, hovercardShowTime = null
        let hovercardPosition = { x: 170, y: 40 }
        let isMouseDown = null, lastMouseActivityTime = 0, pendingBlurTimeout = null, controlledFrameHasFocus = false
        const tabButtons = {}, tabDrag = { active: false }
        const document = { querySelector: selector => selector === '.tab-hovercard:hover'
            ? (isHovercardHovered() ? {} : null)
            : ({ getBoundingClientRect: () => ({ left: 0, bottom: 40, width: 1200 }) }) }
        function startHovercardPositionCheck() {}
        function stopHovercardPositionCheck() {}
        ${handlers}
        ${source.slice(clickListener.start, clickListener.end)}
        window.addEventListener('darc-dismiss-hovercards', dismissHovercards)
        return {
            navigateTabHistory, closeHovercard, dismissHovercards, handleHovercardPointerDown, handleFrameMouseDown,
            hoverTab() { handleTabMouseEnter(Object.values(data.docs)[0], { target: { closest: () => ({ getBoundingClientRect: () => ({ left: 100, bottom: 40, width: 100 }) }) } }) },
            get visible() { return hoveredTab?.id || null },
            get previewVisible() { return hovercardPreviewVisible },
            get held() { return navigationHovercardTabId },
            expandUrlBar() { hovercardUrlBarExpanded = true }
        }
    `)(data, window, CustomEvent, setTimeout, clearTimeout, zenMode, () => hovercardHovered)
    return {
        api, actions, timers, window,
        hoverMenu(hovered = true) { hovercardHovered = hovered },
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
    const setup = new Function('frame', 'window', 'CustomEvent', 'tab', 'tabId', 'ipc', 'console', 'getFrameShortcutScript', 'connectFrameIPC', 'scopedGuestScript', 'readGuestMessage', 'releasedFrames', 'isLiveFrameTab', `
        const untrack = callback => callback()
        const data = { docs: { [tabId]: tab }, frames: { [tabId]: { frame } } }
        const userMods = { css: [], js: [] }, select = '', zoomControl = '', contextMenu = ''
        let isCommandKeyDown = false, commandKeyPressed = false
        ${bridgeHandlers}
        setupMessageListener(frame)
        setupContentScripts(frame)
    `)
    setup(frame, shellWindow, CustomEvent, { id: tabId, url: 'https://example.com' }, tabId, ipc, { log() {}, error: error => errors.push(error) }, getFrameShortcutScript, () => {},
        (frame, code) => scopedGuestScript(frame, code, 'https://darc.example'), readGuestMessage, releasedFrames, isLiveFrameTab)
    const script = scripts.find(script => script.name === 'system-script')
    assert.equal(script.allFrames, true, 'the click bridge is injected into nested frames')
    assert.equal(script.matchAboutBlank, true)

    const registrations = []
    const contentWindow = new EventTarget()
    contentWindow.top = subframe ? {} : contentWindow
    const addEventListener = contentWindow.addEventListener.bind(contentWindow)
    contentWindow.addEventListener = (type, listener, options) => {
        registrations.push({ type, options })
        addEventListener(type, event => listener(new Proxy(event, { get(target, key) {
            if (key === 'isTrusted') return true
            const value = Reflect.get(target, key, target)
            return typeof value === 'function' ? value.bind(target) : value
        } })), options)
    }
    const contentDocument = new EventTarget()
    const contentConsole = { log(message) { messages.push(readGuestMessage(frame, message) || message); frame.onconsolemessage({ message }) } }
    new Function('window', 'document', 'globalThis', script.js.code)(contentWindow, contentDocument, { console: contentConsole })
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

function shortcutHelpHarness() {
    const calls = [], timers = new Map()
    let nextTimer = 0
    const shell = new EventTarget()
    const guests = [contentClickBridge(shell, 'darc:tab:a'), contentClickBridge(shell, 'darc:tab:b', true)]
    const handler = createShortcutHandler(() => null, id => calls.push(id), {
        schedule(callback) { const id = ++nextTimer; timers.set(id, callback); return id },
        cancel(id) { timers.delete(id) },
        canStartHelp: () => !guests.some(guest => guest.frame.activeScrolls > 0)
    })
    const functions = parse(source).instance.content.body
        .filter(node => node.type === 'FunctionDeclaration' && ['handleFrameInput', 'handleFrameShortcut'].includes(node.id.name))
        .map(node => source.slice(node.start, node.end)).join('\n')
    const bridge = new Function('handleKeyDown', 'data', 'shortcutActionIds', 'runShortcut', `
        let shortcutHelpEscapeTabId = null
        ${functions}
        return { handleFrameInput, handleFrameShortcut }
    `)(handler, { docs: { 'darc:tab:a': {}, 'darc:tab:b': {} } }, shortcutActionIds, id => calls.push(id))
    shell.addEventListener('darc-controlled-frame-input', bridge.handleFrameInput)
    shell.addEventListener('darc-shortcut', bridge.handleFrameShortcut)
    listenForShortcutHelpCancellation(shell, handler.cancelHelp)
    return {
        calls, timers, shell, guests,
        key(guest, type, key, modifiers = {}) {
            guest.contentWindow.dispatchEvent(Object.assign(new Event(type), { key, ...modifiers }))
        },
        expire() {
            for (const [id, callback] of timers) {
                timers.delete(id)
                callback()
            }
        }
    }
}

Deno.test('guest clicks and scrolling abort the single shell help timer across nested documents until release', () => {
    for (const type of ['pointerdown', 'click', 'auxclick', 'contextmenu', 'wheel', 'scroll', 'touchstart']) {
        const h = shortcutHelpHarness()
        const [first, nested] = h.guests
        h.key(first, 'keydown', 'Meta', { metaKey: true })
        assert.equal(h.timers.size, 1)
        nested.contentWindow.dispatchEvent(new Event(type))
        h.key(nested, 'keydown', 'Meta', { metaKey: true, repeat: true })
        h.expire()
        assert.deepEqual(h.calls, [], type)
        h.key(nested, 'keyup', 'Meta')
        nested.contentWindow.dispatchEvent(new Event('pagehide'))
        h.key(nested, 'keydown', 'Control', { ctrlKey: true })
        h.expire()
        assert.deepEqual(h.calls, ['show-shortcuts'])
        h.key(first, 'keyup', 'Control')
        assert.deepEqual(h.calls, ['show-shortcuts', 'hide-shortcuts', 'finish-tab-switch'])
        assert.deepEqual(h.guests.flatMap(guest => guest.errors), [])
    }
})

Deno.test('a modifier pressed during a guest scroll stays disqualified after scrolling stops', () => {
    const h = shortcutHelpHarness()
    const [first, nested] = h.guests
    nested.contentWindow.dispatchEvent(new Event('wheel'))
    h.key(first, 'keydown', 'Meta', { metaKey: true })
    assert.equal(h.timers.size, 0)
    nested.contentWindow.dispatchEvent(new Event('pagehide'))
    h.expire()
    assert.deepEqual(h.calls, [])
    h.key(first, 'keyup', 'Meta')
    h.key(first, 'keydown', 'Meta', { metaKey: true })
    h.expire()
    assert.deepEqual(h.calls, ['show-shortcuts'])
})

Deno.test('shell previews cancel guest holds and extra keys stay disqualifying across documents', () => {
    const h = shortcutHelpHarness()
    const [first, nested] = h.guests
    h.key(first, 'keydown', 'Meta', { metaKey: true })
    h.shell.dispatchEvent(new Event('darc-link-preview'))
    h.expire()
    assert.deepEqual(h.calls, [])
    h.key(first, 'keyup', 'Meta')
    h.key(first, 'keydown', 'a')
    h.key(first, 'keydown', 'b')
    h.key(first, 'keyup', 'a')
    h.key(nested, 'keydown', 'Meta', { metaKey: true })
    h.key(first, 'keyup', 'b', { metaKey: true })
    h.expire()
    assert.deepEqual(h.calls, [])
    h.key(nested, 'keyup', 'Meta')
    h.key(first, 'keydown', 'Meta', { metaKey: true })
    h.expire()
    assert.deepEqual(h.calls, ['show-shortcuts'])
    h.shell.dispatchEvent(new Event('darc-link-preview'))
    assert.deepEqual(h.calls, ['show-shortcuts', 'hide-shortcuts'])
    const reportedKeys = h.guests.flatMap(guest => guest.messages)
        .filter(message => message.startsWith('iwa:input-event:'))
        .map(message => JSON.parse(message.slice('iwa:input-event:'.length)))
        .filter(event => event.type === 'keydown' || event.type === 'keyup')
    assert.ok(reportedKeys.every(event => ['Meta', 'Control', 'Escape', 'Unidentified'].includes(event.key) && !('code' in event)))
})

Deno.test('Escape from a guest dismisses help without also dismissing the underlying lightbox', () => {
    const h = shortcutHelpHarness()
    const [first] = h.guests
    h.key(first, 'keydown', 'Meta', { metaKey: true })
    h.expire()
    h.key(first, 'keydown', 'Escape')
    assert.deepEqual(h.calls, ['show-shortcuts', 'hide-shortcuts'])
    h.key(first, 'keyup', 'Escape')
    h.key(first, 'keydown', 'Escape')
    assert.deepEqual(h.calls, ['show-shortcuts', 'hide-shortcuts', 'escape'])
})

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

Deno.test('hovering navigation history keeps it open past the reveal timeout until the pointer leaves', () => {
    for (const direction of ['back', 'forward']) {
        const h = navigationHarness()
        h.api.navigateTabHistory('tab', direction)
        h.advance(400)
        h.hoverMenu()
        h.advance(2000)
        assert.equal(h.api.visible, 'tab')
        assert.equal(h.api.previewVisible, false)
        assert.equal(h.api.held, null, 'the expired navigation hold must allow pointer-leave dismissal')
        assert.equal(h.timers.size, 0)
        h.hoverMenu(false)
        h.api.closeHovercard()
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

Deno.test('navigation hides the preview until the tab is hovered again', () => {
    for (const direction of ['back', 'forward']) {
        const h = navigationHarness()
        h.api.hoverTab()
        h.advance(800)
        assert.equal(h.api.previewVisible, true)
        h.api.navigateTabHistory('tab', direction)
        assert.equal(h.api.visible, 'tab')
        assert.equal(h.api.previewVisible, false)
        h.advance(400)
        h.api.hoverTab()
        h.advance(0)
        assert.equal(h.api.previewVisible, true)
        assert.equal(h.api.held, null)
        h.advance(800)
        assert.equal(h.api.visible, 'tab', 'the navigation timer must not dismiss a freshly hovered card')
        h.api.navigateTabHistory('tab', direction)
        assert.equal(h.api.previewVisible, false, 'each navigation hides the preview again')
    }
})

Deno.test('navigation timeout does not restore the preview while the URL bar keeps the card open', () => {
    const h = navigationHarness()
    h.api.navigateTabHistory('tab', 'back')
    h.api.expandUrlBar()
    h.advance(800)
    assert.equal(h.api.visible, 'tab')
    assert.equal(h.api.previewVisible, false)
    h.api.hoverTab()
    h.advance(800)
    assert.equal(h.api.previewVisible, true)
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

Deno.test('shortcuts cross the injected frame bridge once and retain the source tab', () => {
    const h = navigationHarness()
    const tabId = 'darc:tab:keyboard'
    const bridge = contentClickBridge(h.window, tabId, true)
    const requests = []
    h.window.addEventListener('darc-shortcut', event => requests.push(event.detail))
    const event = new Event('keydown', { cancelable: true })
    Object.assign(event, { key: 'l', metaKey: /Mac|iPhone|iPad|iPod/.test(navigator.platform), ctrlKey: !/Mac|iPhone|iPad|iPod/.test(navigator.platform) })
    bridge.contentWindow.dispatchEvent(event)
    assert.equal(event.defaultPrevented, true)
    assert.deepEqual(requests, [{ id: 'open-location', tabId }])
    bridge.frame.onconsolemessage({ message: 'iwa:shortcut:' + JSON.stringify({ id: 'close-tab', tabId: 'another-tab' }) })
    assert.equal(requests.length, 1)
})

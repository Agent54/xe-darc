import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { connectFrameIPC, scopedGuestScript, readGuestMessage, releaseFrameIPC } from '../app/lib/frame-ipc.js'

const source = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const listener = parse(source).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'setupMessageListener')
const ipc = Deno.readTextFileSync(new URL('../app/inject/ipc.js', import.meta.url))

function harness(subframe = false, timers = { setTimeout, clearTimeout }) {
    const window = new EventTarget()
    const addListener = window.addEventListener.bind(window)
    window.addEventListener = (type, listener, options) => addListener(type, event => listener(new Proxy(event, {
        get(target, key) {
            if (key === 'isTrusted') return !target.synthetic
            const value = Reflect.get(target, key, target)
            return typeof value === 'function' ? value.bind(target) : value
        }
    })), options)
    window.top = subframe ? {} : window
    const document = new EventTarget()
    const messages = []
    const inputs = []
    const shell = new EventTarget()
    shell.addEventListener('darc-controlled-frame-input', event => inputs.push(event.detail))
    const rawMessages = []
    const transfers = []
    const guestPorts = []
    const frame = {
        contentWindow: {
            postMessage(data, origin, ports) {
                transfers.push({ data, origin })
                const transferred = structuredClone({ data, ports, origin: 'https://embedder.example' }, { transfer: ports })
                guestPorts.push(...transferred.ports)
                queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', transferred)))
            }
        }
    }
    let focusCount = 0
    new Function('frame', 'connectFrameIPC', 'readGuestMessage', 'window', `
        const tab = { id: 'tab' }, untrack = fn => fn()
        const onFrameFocus = () => frame.focus()
        ${source.slice(listener.start, listener.end)}
        setupMessageListener(frame)
    `)(frame, connectFrameIPC, readGuestMessage, shell)
    frame.focus = () => { focusCount++ }

    new Function('window', 'document', 'globalThis', 'setTimeout', 'clearTimeout', scopedGuestScript(frame, `const tabId = 'tab';\n${ipc}`, 'https://embedder.example'))(window, document, { console: {
        log(message) {
            rawMessages.push(message)
            messages.push(readGuestMessage(frame, message) || message)
            frame.onconsolemessage({ message })
        }
    } }, timers.setTimeout, timers.clearTimeout)

    return {
        window, document, frame, messages, inputs, transfers, guestPorts,
        get secret() { return JSON.parse(rawMessages.find(message => message.startsWith('darc:bridge:')).slice('darc:bridge:'.length)).secret },
        get focusCount() { return focusCount },
        close() {
            for (const port of guestPorts) {
                port.close()
            }
            frame.ipcPort?.close()
        }
    }
}

async function waitForReply(h, count = 1) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (h.messages.filter(message => message.includes('round trip complete')).length === count) {
            return
        }
        await new Promise(resolve => setTimeout(resolve, 5))
    }
    assert.fail('The content script did not receive the parent reply over the MessagePort')
}

Deno.test('tab readiness starts a real transferred MessagePort hello/reply alongside console events', async () => {
    const h = harness()
    try {
        assert.equal(h.messages[0], 'iwa:ipc-ready:tab')
        assert.equal(h.transfers.length, 1)
        assert.equal(h.transfers[0].data.type, 'darc:ipc-connect')
        await waitForReply(h)
        h.window.dispatchEvent(new Event('focus'))
        assert.equal(h.focusCount, 1)

        const originalPort = h.frame.ipcPort
        h.document.hidden = true
        h.document.dispatchEvent(new Event('visibilitychange'))
        h.guestPorts[0].postMessage({ type: 'darc:ipc-hello', message: 'Hello world', secret: h.secret })
        await waitForReply(h, 2)

        h.window.dispatchEvent(new Event('pagehide'))
        h.window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
        h.guestPorts[0].postMessage({ type: 'darc:ipc-hello', message: 'Hello world', secret: h.secret })
        await waitForReply(h, 3)
        assert.equal(h.frame.ipcPort, originalPort)
        assert.equal(h.transfers.length, 1)
    } finally {
        h.close()
    }
})

Deno.test('nested content scripts keep console events without starting a second tab channel', () => {
    const h = harness(true)
    try {
        assert.equal(h.transfers.length, 0)
        h.window.dispatchEvent(new Event('focus'))
        assert.equal(h.focusCount, 1)
    } finally {
        h.close()
    }
})

Deno.test('core keyboard events report key counts and modifiers without character keys', () => {
    const h = harness(true)
    try {
        const key = (type, key, code, modifiers = {}) => h.window.dispatchEvent(Object.assign(new Event(type), { key, code, ...modifiers }))
        key('keydown', 'a', 'KeyA')
        key('keydown', 'b', 'KeyB')
        key('keyup', 'a', 'KeyA')
        key('keydown', 'Control', 'ControlLeft', { ctrlKey: true })
        key('keyup', 'Control', 'ControlLeft')
        key('keyup', 'b', 'KeyB')
        assert.deepEqual(h.inputs.map(event => [event.type, event.key, event.pressedKeyCount, event.ctrlKey]), [
            ['keydown', 'Unidentified', 1, false],
            ['keydown', 'Unidentified', 2, false],
            ['keyup', 'Unidentified', 1, false],
            ['keydown', 'Control', 2, true],
            ['keyup', 'Control', 1, false],
            ['keyup', 'Unidentified', 0, false]
        ])
        assert.ok(h.inputs.every(event => !('code' in event) && !('event' in event)))
    } finally {
        h.close()
    }
})

Deno.test('discrete interactions are forwarded and raw movement is ignored', () => {
    const h = harness(true)
    try {
        h.window.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Meta', metaKey: true, synthetic: true }))
        for (const type of ['mousemove', 'pointermove', 'touchmove']) {
            h.window.dispatchEvent(new Event(type))
        }
        assert.deepEqual(h.inputs, [])
        assert.deepEqual(h.messages, [])
        for (const type of ['pointerdown', 'auxclick', 'contextmenu', 'touchstart']) {
            h.window.dispatchEvent(new Event(type))
        }
        assert.deepEqual(h.inputs.map(event => event.type), ['pointerdown', 'auxclick', 'contextmenu', 'touchstart'])
    } finally {
        h.close()
    }
})

Deno.test('wheel and scroll share one burst across short pauses and send only its boundaries', () => {
    let now = 0
    let nextTimer = 0
    const scheduled = new Map()
    const h = harness(true, {
        setTimeout(callback, delay) {
            const id = ++nextTimer
            scheduled.set(id, { callback, at: now + delay })
            return id
        },
        clearTimeout(id) { scheduled.delete(id) }
    })
    function advance(ms) {
        now += ms
        for (const [id, timer] of scheduled) {
            if (timer.at <= now) {
                scheduled.delete(id)
                timer.callback()
            }
        }
    }
    try {
        h.window.dispatchEvent(Object.assign(new Event('wheel'), { synthetic: true }))
        assert.deepEqual(h.messages, [])
        h.window.dispatchEvent(new Event('wheel'))
        assert.equal(h.frame.activeScrolls, 1)
        for (let i = 0; i < 10; i++) {
            advance(200)
            h.window.dispatchEvent(new Event(i % 2 ? 'wheel' : 'scroll'))
        }
        advance(299)
        assert.deepEqual(h.inputs, [{ tabId: 'tab', type: 'scrollstart' }])
        assert.equal(h.messages.length, 1)
        advance(1)
        assert.deepEqual(h.inputs, [{ tabId: 'tab', type: 'scrollstart' }, { tabId: 'tab', type: 'scrollend' }])
        assert.equal(h.messages.length, 2)
        assert.equal(h.frame.activeScrolls, 0)

        h.window.dispatchEvent(new Event('scroll'))
        h.window.dispatchEvent(new Event('pagehide'))
        advance(300)
        assert.deepEqual(h.inputs.map(event => event.type), ['scrollstart', 'scrollend', 'scrollstart', 'scrollend'])
        assert.equal(h.frame.activeScrolls, 0)
    } finally {
        h.close()
    }
})

Deno.test('the input bridge rejects malformed keyboard events, unknown types and other tab IDs', () => {
    const h = harness(true)
    try {
        for (const detail of [null, [], { tabId: 'other', type: 'scrollstart' },
            ...['cancel', 'wheel', 'scroll', 'mousemove', 'pointermove', 'touchmove'].map(type => ({ tabId: 'tab', type })),
            { tabId: 'tab', type: 'keydown' }, { tabId: 'tab', type: 'keyup', key: 'Meta', pressedKeyCount: -1 }]) {
            const message = 'iwa:input-event:' + JSON.stringify(detail)
            new Function('globalThis', scopedGuestScript(h.frame, `console.log(${JSON.stringify(message)})`, 'https://embedder.example'))({ console: {
                log(message) { h.frame.onconsolemessage({ message }) }
            } })
        }
        assert.deepEqual(h.inputs, [])
    } finally {
        h.close()
    }
})

Deno.test('unsigned, malformed, and cross-frame console commands are rejected', () => {
    const first = {}, second = {}
    let signed
    new Function('globalThis', scopedGuestScript(first, "console.log('iwa:focus')", 'https://embedder.example'))({ console: { log: message => { signed = message } } })
    scopedGuestScript(second, '', 'https://embedder.example')
    assert.equal(readGuestMessage(first, 'iwa:focus'), null)
    assert.equal(readGuestMessage(first, 'darc:bridge:{broken'), null)
    assert.equal(readGuestMessage(first, signed), 'iwa:focus')
    assert.equal(readGuestMessage(second, signed), null)
    releaseFrameIPC(first)
    assert.equal(readGuestMessage(first, signed), null)
})

Deno.test('public connection messages contain no secret and unsigned port messages get no reply', async () => {
    const h = harness()
    try {
        await waitForReply(h)
        assert.equal(JSON.stringify(h.transfers).includes(h.secret), false)
        const before = h.messages.filter(message => message.includes('round trip complete')).length
        h.guestPorts[0].postMessage({ type: 'darc:ipc-hello', message: 'Hello world' })
        h.guestPorts[0].postMessage({ type: 'darc:ipc-hello', message: 'Hello world', secret: 'wrong' })
        await new Promise(resolve => setTimeout(resolve, 20))
        assert.equal(h.messages.filter(message => message.includes('round trip complete')).length, before)
        const beforeFocus = h.focusCount
        h.frame.onconsolemessage({ message: 'iwa:focus' })
        assert.equal(h.focusCount, beforeFocus)
    } finally {
        h.close()
    }
})

Deno.test('synthetic embedder messages cannot steal the guest handshake', async () => {
    const h = harness()
    const { port1, port2 } = new MessageChannel()
    const stolen = []
    port1.onmessage = event => stolen.push(event.data)
    try {
        h.window.dispatchEvent(Object.assign(new MessageEvent('message', {
            origin: 'https://embedder.example', data: { type: 'darc:ipc-connect', tabId: 'tab' }, ports: [port2]
        }), { synthetic: true }))
        await waitForReply(h)
        assert.deepEqual(stolen, [])
    } finally {
        port1.close()
        port2.close()
        h.close()
    }
})

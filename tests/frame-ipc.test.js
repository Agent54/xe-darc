import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { connectFrameIPC, scopedGuestScript, readGuestMessage, releaseFrameIPC } from '../app/lib/frame-ipc.js'

const source = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const listener = parse(source).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'setupMessageListener')
const ipc = Deno.readTextFileSync(new URL('../app/inject/ipc.js', import.meta.url))

function harness(subframe = false) {
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
    new Function('frame', 'connectFrameIPC', 'readGuestMessage', `
        const tab = { id: 'tab' }, untrack = fn => fn()
        const onFrameFocus = () => frame.focus()
        ${source.slice(listener.start, listener.end)}
        setupMessageListener(frame)
    `)(frame, connectFrameIPC, readGuestMessage)
    frame.focus = () => { focusCount++ }

    new Function('window', 'document', 'globalThis', scopedGuestScript(frame, `const tabId = 'tab';\n${ipc}`, 'https://embedder.example'))(window, document, { console: {
        log(message) {
            rawMessages.push(message)
            messages.push(readGuestMessage(frame, message) || message)
            frame.onconsolemessage({ message })
        }
    } })

    return {
        window, document, frame, messages, transfers, guestPorts,
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

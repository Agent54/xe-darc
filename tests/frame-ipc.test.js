import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { connectFrameIPC } from '../app/lib/frame-ipc.js'

const source = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const listener = parse(source).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'setupMessageListener')
const ipc = Deno.readTextFileSync(new URL('../app/inject/ipc.js', import.meta.url))

function harness(subframe = false) {
    const window = new EventTarget()
    window.top = subframe ? {} : window
    const document = new EventTarget()
    const messages = []
    const transfers = []
    const guestPorts = []
    const frame = {
        contentWindow: {
            postMessage(data, origin, ports) {
                transfers.push({ data, origin })
                const transferred = structuredClone({ data, ports }, { transfer: ports })
                guestPorts.push(...transferred.ports)
                queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', transferred)))
            }
        }
    }
    let focusCount = 0
    new Function('frame', 'connectFrameIPC', `
        const tab = { id: 'tab' }, untrack = fn => fn()
        const onFrameFocus = () => frame.focus()
        ${source.slice(listener.start, listener.end)}
        setupMessageListener(frame)
    `)(frame, connectFrameIPC)
    frame.focus = () => { focusCount++ }

    new Function('window', 'document', 'console', 'tabId', ipc)(window, document, {
        log(message) {
            messages.push(message)
            frame.onconsolemessage({ message })
        }
    }, 'tab')

    return {
        window, document, frame, messages, transfers, guestPorts,
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
        h.guestPorts[0].postMessage({ type: 'darc:ipc-hello', message: 'Hello world' })
        await waitForReply(h, 2)

        h.window.dispatchEvent(new Event('pagehide'))
        h.window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
        h.guestPorts[0].postMessage({ type: 'darc:ipc-hello', message: 'Hello world' })
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

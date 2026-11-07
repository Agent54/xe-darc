const moduleSecret = crypto.randomUUID()
const frameSecrets = new WeakMap()
const bridgePrefix = 'darc:bridge:'

function frameSecret(frame) {
    if (!frameSecrets.has(frame)) {
        frameSecrets.set(frame, `${moduleSecret}:${crypto.randomUUID()}`)
    }
    return frameSecrets.get(frame)
}

export function scopedGuestScript(frame, code, embedderOrigin = window.location.origin) {
    return `(() => {
        const bridgeSecret = ${JSON.stringify(frameSecret(frame))};
        const embedderOrigin = ${JSON.stringify(embedderOrigin)};
        const nativeConsole = globalThis.console;
        const nativeLog = nativeConsole.log.bind(nativeConsole);
        const console = Object.create(nativeConsole);
        console.log = (...args) => {
            if (typeof args[0] === 'string' && /^(iwa:|oauth:)/.test(args[0])) {
                nativeLog(${JSON.stringify(bridgePrefix)} + JSON.stringify({ secret: bridgeSecret, message: args[0] }));
            } else {
                nativeLog(...args);
            }
        };
        ${code}
    })();`
}

export function readGuestMessage(frame, message) {
    if (typeof message !== 'string' || !message.startsWith(bridgePrefix) || !frameSecrets.has(frame)) {
        return null
    }
    try {
        const envelope = JSON.parse(message.slice(bridgePrefix.length))
        return envelope.secret === frameSecrets.get(frame) && typeof envelope.message === 'string' ? envelope.message : null
    } catch {
        return null
    }
}

export function releaseFrameIPC(frame) {
    frame.ipcPort?.close()
    frame.ipcPort = null
    frameSecrets.delete(frame)
}

export function connectFrameIPC(frame, tabId) {
    console.log('[IPC] Content script ready; opening channel:', tabId)
    frame.ipcPort?.close()
    const { port1, port2 } = new MessageChannel()
    frame.ipcPort = port1

    port1.onmessage = ({ data }) => {
        if (frameSecrets.has(frame) && data?.secret === frameSecrets.get(frame) && data?.type === 'darc:ipc-hello' && data.message === 'Hello world') {
            console.log('[IPC] Hello world from tab content script:', tabId)
            port1.postMessage({ type: 'darc:ipc-reply', message: 'Hello world', secret: frameSecret(frame) })
        }
    }

    try {
        frame.contentWindow.postMessage({ type: 'darc:ipc-connect', tabId }, '*', [port2])
        console.log('[IPC] Connection message sent to tab:', tabId)
    } catch (error) {
        port1.close()
        port2.close()
        frame.ipcPort = null
        console.error('[IPC] Could not connect to tab:', tabId, error)
    }
}

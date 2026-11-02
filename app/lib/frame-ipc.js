export function connectFrameIPC(frame, tabId) {
    console.log('[IPC] Content script ready; opening channel:', tabId)
    frame.ipcPort?.close()
    const { port1, port2 } = new MessageChannel()
    frame.ipcPort = port1

    port1.onmessage = ({ data }) => {
        if (data?.type === 'darc:ipc-hello' && data.message === 'Hello world') {
            console.log('[IPC] Hello world from tab content script:', tabId)
            port1.postMessage({ type: 'darc:ipc-reply', message: 'Hello world' })
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

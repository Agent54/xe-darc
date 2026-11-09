// The guest has no embedder WindowProxy until the embedder sends a message.
// Announce readiness first, then exchange the hello over a real MessagePort.
let ipcPort = null
const pendingIPCMessages = []
function sendIPC(type, payload) {
    if (window !== window.top) {
        console.log('iwa:' + type + ':' + tabId + ':' + JSON.stringify(payload))
    } else if (ipcPort) {
        ipcPort.postMessage({ type: 'darc:ipc-event', secret: bridgeSecret, tabId, event: type, payload })
    } else {
        pendingIPCMessages.push({ type, payload })
    }
}

if (window === window.top) {
    window.addEventListener('pageshow', event => {
        if (!event.persisted) return
        ipcPort?.close()
        ipcPort = null
        pendingIPCMessages.length = 0
        currentHoveredAnchor = null
        console.log(`iwa:ipc-ready:${tabId}`)
    })

    window.addEventListener('message', event => {
        if (!event.isTrusted || event.origin !== embedderOrigin || event.data?.type !== 'darc:ipc-connect' || event.data.tabId !== tabId || ipcPort) {
            return
        }

        if (!event.ports[0]) {
            console.warn('[IPC] Connection message arrived without a MessagePort')
            return
        }

        event.stopImmediatePropagation()

        console.log('[IPC] Content script received the MessagePort')
        ipcPort = event.ports[0]
        ipcPort.onmessage = ({ data }) => {
            if (data?.secret === bridgeSecret && data?.type === 'darc:ipc-reply' && data.message === 'Hello world') {
                console.log('[IPC] Hello world from parent (MessagePort round trip complete)')
            }
        }
        ipcPort.postMessage({ type: 'darc:ipc-hello', message: 'Hello world', secret: bridgeSecret })
        for (const { type, payload } of pendingIPCMessages.splice(0)) {
            sendIPC(type, payload)
        }
    })

    console.log(`iwa:ipc-ready:${tabId}`)
}

const pressedInputKeys = new Map()

function reportInputEvent(event) {
    if (!event.isTrusted) {
        return
    }
    const detail = { tabId, type: event.type }
    if (event.type === 'keydown' || event.type === 'keyup') {
        const key = event.code || event.key
        if (event.type === 'keydown') {
            pressedInputKeys.set(key, event.metaKey || event.ctrlKey)
        } else {
            pressedInputKeys.delete(key)
            // macOS can omit letter keyup during Command combinations.
            if ((event.key === 'Meta' || event.key === 'Control') && !event.metaKey && !event.ctrlKey) {
                for (const [key, duringCommand] of pressedInputKeys) {
                    if (duringCommand) {
                        pressedInputKeys.delete(key)
                    }
                }
            }
        }
        Object.assign(detail, {
            // Character keys stay inside the guest document.
            key: /^[A-Za-z][A-Za-z0-9]+$/.test(event.key) ? event.key : 'Unidentified',
            repeat: !!event.repeat,
            metaKey: !!event.metaKey,
            ctrlKey: !!event.ctrlKey,
            altKey: !!event.altKey,
            shiftKey: !!event.shiftKey,
            pressedKeyCount: pressedInputKeys.size
        })
    } else if (event.type === 'blur') {
        pressedInputKeys.clear()
    } else {
        Object.assign(detail, { button: event.button, pointerType: event.pointerType })
    }
    console.log('iwa:input-event:' + JSON.stringify(detail))
}

for (const type of ['keydown', 'keyup', 'pointerdown', 'auxclick', 'contextmenu', 'touchstart', 'blur']) {
    window.addEventListener(type, reportInputEvent, { capture: true, passive: true })
}

const scrollQuietMs = 300
let scrollEndTimer = null

function endScroll() {
    if (scrollEndTimer === null) {
        return
    }
    clearTimeout(scrollEndTimer)
    scrollEndTimer = null
    console.log('iwa:input-event:' + JSON.stringify({ tabId, type: 'scrollend' }))
}

function trackScroll(event) {
    if (!event.isTrusted) {
        return
    }
    const starting = scrollEndTimer === null
    clearTimeout(scrollEndTimer)
    scrollEndTimer = setTimeout(endScroll, scrollQuietMs)
    if (starting) {
        console.log('iwa:input-event:' + JSON.stringify({ tabId, type: 'scrollstart' }))
    }
}

window.addEventListener('wheel', trackScroll, { capture: true, passive: true })
window.addEventListener('scroll', trackScroll, { capture: true, passive: true })
window.addEventListener('pagehide', event => {
    if (event.isTrusted) {
        endScroll()
    }
})

window.addEventListener('focus', () => { 
    // console.log('####### 🎯 [FOCUS] Frame window received focus event | tabId:', tabId);
    console.log('iwa:focus');
}, false);

window.addEventListener('blur', () => { 
    // Check if focus moved to a child iframe - if so, don't report blur
    // Focus is still within this controlled frame's document tree
    setTimeout(() => {
        const activeEl = document.activeElement;
        const focusInChildFrame = activeEl && (activeEl.tagName === 'IFRAME' || activeEl.tagName === 'WEBVIEW');
        // console.log('####### 😴 [BLUR] Frame window received blur event | tabId:', tabId, '| activeElement:', activeEl?.tagName, '| focusInChildFrame:', focusInChildFrame);
        
        if (focusInChildFrame) {
            // console.log('####### 😴 [BLUR] Suppressed - focus moved to child iframe');
            return;
        }
        
        console.log('iwa:blur');
    }, 0);
}, false);

document.addEventListener('keyup', function(event) {
    if (!event.isTrusted) return;
    // Track command key state
    if (event.key === 'Meta' || event.key === 'Control') {
        console.log(`iwa:command-key-up:${tabId}`);
    }
}, { capture: true, passive: false });


// Track modifiers independently of the shared shortcut dispatcher.
document.addEventListener('keydown', function(event) {
    if (!event.isTrusted) return;
    // Track command key state
    if (event.metaKey || event.ctrlKey) {
        console.log(`iwa:command-key-down:${tabId}`);
    }
}, { capture: true, passive: false });

// Global mouse event listeners for controlled frame
// Capture on window before page handlers can stop the event from reaching document.
window.addEventListener('click', function(event) {
    if (!event.isTrusted) return;
    console.log(`iwa:click:${tabId}:` + JSON.stringify({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        detail: event.detail,
        isTopLevel: window === window.top
    }));
}, { capture: true, passive: true });

document.addEventListener('mousedown', function(event) {
    if (!event.isTrusted) return;
    // Track modifier key state with mousedown for link clicks
    // This ensures we capture cmd+click before navigation starts
    const hasModifier = event.metaKey || event.ctrlKey;
    console.log(`iwa:mousedown:${tabId}:${event.button}:${hasModifier ? 'mod' : ''}`);
}, { capture: true, passive: true });

document.addEventListener('mouseup', function(event) {
    if (!event.isTrusted) return;
    // console.log('🖱️ [CONTROLLED-FRAME] mouseup detected in tab ${tab.id}', {
    //     button: event.button,
    //     target: event.target?.tagName,
    //     clientX: event.clientX,
    //     clientY: event.clientY
    // });
    console.log(`iwa:mouseup:${tabId}`);
}, { capture: true, passive: true });



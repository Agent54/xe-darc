// The guest has no embedder WindowProxy until the embedder sends a message.
// Announce readiness first, then exchange the hello over a real MessagePort.
if (window === window.top) {
    let ipcPort = null

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
    })

    console.log(`iwa:ipc-ready:${tabId}`)
}

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



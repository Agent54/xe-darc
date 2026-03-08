if (import.meta?.hot) {
    import.meta.hot.on('vite:beforeFullReload', () => {
        throw '(skipping full reload)';
    })
}

if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    // Create the policy directly - if it already exists, the browser will throw an error
    window.trustedTypes.createPolicy('default', {
      createHTML: (input) => {
        // console.log('createHTML', input)
        return input // DOMPurify.sanitize(input)
      }, 
      createScript: (input) => { 
        console.log('createScript', input)
        return input
      },
      createScriptURL: (url) => { 
        console.log('trusted origin check', url)
        // if( url.startsWith('https://') || url.startsWith('http://') || url.startsWith('isolated-app://')) {
        return url
        // }
        // throw new Error('Untrusted script URL blocked')
      }
    })
  } catch (e) {
    // If the error is because the policy already exists, that's fine
    if (e.name === 'TypeError' && e.message.includes('already exists')) {
      console.log('Default trusted types policy already exists')
    } else {
      console.warn('Could not create default trusted types policy:', e)
    }
  }
}

document.addEventListener('touchmove', function (event) {
  console.log('touchmove', event)
  if (event.scale !== 1) { event.preventDefault() }
}, { passive: false })


document.addEventListener("wheel", e => {

  if (e.ctrlKey || e.metaKey) {

    // e.preventDefault()
    //   e.stopPropagation()
    //   e.stopImmediatePropagation()
    //   return false

    const gridViewOpen = data.ui.viewMode === 'tile'
    
    // Always prevent default zoom behavior when grid view is open
    if (gridViewOpen) {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      
      // Still dispatch events for grid view handling
      const zoomDirection = e.deltaY < 0 ? 'in' : 'out'
      
      if (zoomDirection === 'out') {
        window.dispatchEvent(new CustomEvent('darc-zoom-out-at-max-internal', {
          detail: { 
            source: 'app-shell-grid-view',
            currentScale: 1.0,
            direction: zoomDirection
          }
        }))
      } else if (zoomDirection === 'in') {
        window.dispatchEvent(new CustomEvent('darc-zoom-in', {
          detail: { 
            source: 'app-shell-grid-view',
            direction: zoomDirection
          }
        }))
      }
      return false
    }
    
    // Normal zoom handling when grid view is not open
    e.preventDefault()
    
    // Determine zoom direction based on deltaY
    const zoomDirection = e.deltaY < 0 ? 'in' : 'out'
    
    if (zoomDirection === 'out') {
      // Check if we're at minimum zoom using visualViewport scale
      const currentScale = window.visualViewport?.scale || 1.0
      
      if (currentScale <= 1.0) {        
        window.dispatchEvent(new CustomEvent('darc-zoom-out-at-max-internal', {
          detail: { 
            source: 'app-shell',
            currentScale: currentScale,
            direction: zoomDirection
          }
        }))
      }
    } else if (zoomDirection === 'in') {
      // Dispatch zoom in event for grid view closing
      window.dispatchEvent(new CustomEvent('darc-zoom-in', {
        detail: { 
          source: 'app-shell',
          direction: zoomDirection
        }
      }))
    }
  }
}, { passive: false })


window.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('gesturechange', e => e.preventDefault());
window.addEventListener('gestureend', e => e.preventDefault());

// Global Cmd+W / Ctrl+W interceptor to prevent window closing
// Global Cmd+R / Ctrl+R interceptor to prevent full page reload
document.addEventListener('keydown', function(event) {
  // Check for Cmd+W (Mac) or Ctrl+W (Windows/Linux)
  if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
    // Prevent the browser's default behavior (closing window/tab)
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    
    // Dispatch a custom event that the Svelte app can listen for
    window.dispatchEvent(new CustomEvent('darc-close-tab', {
      detail: { originalEvent: event }
    }))
    
    console.log('Intercepted Cmd+W/Ctrl+W - delegating to app')
    return false
  }
  
  // Check for Cmd+R (Mac) or Ctrl+R (Windows/Linux) or F5
  if (((event.metaKey || event.ctrlKey) && event.key === 'r') || event.key === 'F5') {
    // Prevent the browser's default behavior (reloading page)
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    
    // Dispatch a custom event that the Svelte app can listen for
    window.dispatchEvent(new CustomEvent('darc-reload-tab', {
      detail: { originalEvent: event }
    }))
    
    return false
  }
}, { capture: true, passive: false })

import { mount } from 'svelte'
import App from './App.svelte'
import data from './data.svelte.js'

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app

// start the service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(registration => {
    console.log('Service worker registered', registration)
  }).catch(error => {
    console.error('Service worker registration failed', error)
  })
}


if (typeof window !== 'undefined' && window.location.protocol === 'isolated-app:') {
  import(/* @vite-ignore */ `/${'app'}/test.js`).then(({default: test}) => test())
}
// isolated-app://kktqp5b4ad3rk7liu3s3svirby266incu7xsds2l56zwzm3op5aaaaac

// Test Dedicated Worker
const dedicatedWorker = new Worker('/test-dedicated-worker.js')
dedicatedWorker.onmessage = function(e) {
  console.log('Dedicated Worker says:', e.data)
}

// Test Shared Worker
if (typeof SharedWorker === 'undefined') {
  throw new Error('SharedWorker is required to assign darc window ids')
}

const sharedWorker = new SharedWorker('/test-shared-worker.js', { name: 'darc-shared-worker' })
const port = sharedWorker.port
const heartbeatMs = 2000
const connectAckTimeoutMs = 10000
const clientId = crypto?.randomUUID
  ? crypto.randomUUID()
  : `client-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

let windowId = null
let goodbyeSent = false
let connectAckReceived = false

function failWindowIdBootstrap(message, error) {
  if (error) {
    console.error(message, error)
  } else {
    console.error(message)
  }

  throw new Error(message)
}

function parseWindowId(value) {
  if (typeof value !== 'string') {
    return null
  }

  const parsed = value.trim()
  return parsed || null
}

function syncWindowIdToUrl(currentWindowId) {
  const parsedWindowId = parseWindowId(currentWindowId)
  if (!parsedWindowId) return

  const currentUrl = new URL(window.location.href)
  if (currentUrl.searchParams.get('darcWindowId') === parsedWindowId) return

  currentUrl.searchParams.set('darcWindowId', parsedWindowId)
  const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
  history.replaceState(history.state, '', nextUrl)
}

function setWindowIdFromWorker(nextWindowId) {
  const parsedWindowId = parseWindowId(nextWindowId)
  if (!parsedWindowId) {
    failWindowIdBootstrap('SharedWorker returned an empty darc window id')
  }

  if (windowId && windowId !== parsedWindowId) {
    failWindowIdBootstrap(`SharedWorker attempted to reassign immutable darc window id (${windowId} -> ${parsedWindowId})`)
  }

  windowId = parsedWindowId
  window.name = `darc-window-${windowId}`

  if (typeof window.resolveDarcWindowId !== 'function') {
    failWindowIdBootstrap('resolveDarcWindowId is missing during SharedWorker bootstrap')
  }

  window.resolveDarcWindowId(windowId)
  syncWindowIdToUrl(windowId)
}

const connectAckTimeout = setTimeout(() => {
  if (!connectAckReceived || !windowId) {
    failWindowIdBootstrap('SharedWorker failed to assign darc window id before timeout')
  }
}, connectAckTimeoutMs)

function getHintWindowId() {
  const params = new URLSearchParams(window.location.search)
  const urlHint = parseWindowId(params.get('darcWindowId'))
  if (urlHint) return urlHint

  if (typeof window.name === 'string' && window.name.startsWith('darc-window-')) {
    return parseWindowId(window.name.slice('darc-window-'.length))
  }

  return null
}

function buildWindowInfoPayload() {
  return {
    clientId,
    hintWindowId: getHintWindowId(),
    windowId,
    url: window.location.href,
    timestamp: Date.now(),
    devicePixelRatio: window.devicePixelRatio,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    outer: {
      width: window.outerWidth,
      height: window.outerHeight
    },
    placement: {
      x: window.screenX ?? window.screenLeft ?? 0,
      y: window.screenY ?? window.screenTop ?? 0
    },
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      availLeft: screen.availLeft ?? 0,
      availTop: screen.availTop ?? 0,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      orientation: {
        type: screen.orientation?.type,
        angle: screen.orientation?.angle
      }
    }
  }
}

async function getScreenDetailsPayload() {
  if (typeof window.getScreenDetails !== 'function') return null

  try {
    const details = await window.getScreenDetails()
    return {
      isExtended: !!details.isExtended,
      currentScreen: details.currentScreen ? {
        label: details.currentScreen.label || '',
        left: details.currentScreen.left,
        top: details.currentScreen.top,
        width: details.currentScreen.width,
        height: details.currentScreen.height,
        availLeft: details.currentScreen.availLeft,
        availTop: details.currentScreen.availTop,
        availWidth: details.currentScreen.availWidth,
        availHeight: details.currentScreen.availHeight,
        isPrimary: !!details.currentScreen.isPrimary,
        isInternal: !!details.currentScreen.isInternal
      } : null,
      screens: details.screens?.map(screenInfo => ({
        label: screenInfo.label || '',
        left: screenInfo.left,
        top: screenInfo.top,
        width: screenInfo.width,
        height: screenInfo.height,
        availLeft: screenInfo.availLeft,
        availTop: screenInfo.availTop,
        availWidth: screenInfo.availWidth,
        availHeight: screenInfo.availHeight,
        isPrimary: !!screenInfo.isPrimary,
        isInternal: !!screenInfo.isInternal
      })) || []
    }
  } catch (error) {
    return {
      error: error?.message || 'getScreenDetails failed'
    }
  }
}

async function sendConnect() {
  const payload = buildWindowInfoPayload()
  payload.screenDetails = await getScreenDetailsPayload()

  port.postMessage({
    type: 'CONNECT',
    payload
  })
}

function sendGoodbye(reason) {
  if (goodbyeSent) return
  goodbyeSent = true

  port.postMessage({
    type: 'GOODBYE',
    payload: {
      clientId,
      windowId,
      reason,
      timestamp: Date.now()
    }
  })
}

const FULL_SYNC_MS = 5000
let lastFullSyncAt = 0

function sendHeartbeat() {
  if (!windowId) return

  const now = Date.now()
  const needsFullSync = (now - lastFullSyncAt) >= FULL_SYNC_MS

  if (needsFullSync) {
    requestIdleCallback(() => {
      lastFullSyncAt = Date.now()
      const payload = buildWindowInfoPayload()
      payload.full = true
      port.postMessage({ type: 'HEARTBEAT', payload })
    })
  } else {
    port.postMessage({
      type: 'HEARTBEAT',
      payload: {
        clientId,
        windowId,
        timestamp: now,
        placement: {
          x: window.screenX ?? window.screenLeft ?? 0,
          y: window.screenY ?? window.screenTop ?? 0
        },
        outer: {
          width: window.outerWidth,
          height: window.outerHeight
        }
      }
    })
  }
}

port.onmessage = function(e) {
  const message = e.data
  if (!message || !message.type) return

  if (message.type === 'CONNECTED_ACK') {
    if (message.payload?.clientId && message.payload.clientId !== clientId) return

    connectAckReceived = true
    clearTimeout(connectAckTimeout)

    setWindowIdFromWorker(message.payload?.windowId)
    sendHeartbeat()
    return
  }

  if (message.payload?.windowId && message.payload.windowId !== windowId) {
    failWindowIdBootstrap(`SharedWorker attempted to mutate immutable darc window id after CONNECTED_ACK (${windowId} -> ${message.payload.windowId})`)
  }

  if (message.type !== 'HEARTBEAT_ACK') {
    console.log('Shared Worker event:', message)
  }
}

sharedWorker.onerror = (errorEvent) => {
  failWindowIdBootstrap('SharedWorker errored while assigning darc window id', errorEvent)
}

port.onmessageerror = (errorEvent) => {
  failWindowIdBootstrap('SharedWorker message channel error while assigning darc window id', errorEvent)
}

port.start()
sendConnect().catch(error => {
  failWindowIdBootstrap('Failed to send CONNECT message to SharedWorker', error)
})

sendHeartbeat()
const heartbeatInterval = setInterval(sendHeartbeat, heartbeatMs)

window.addEventListener('pagehide', () => {
  sendGoodbye('pagehide')
})

window.addEventListener('beforeunload', () => {
  sendGoodbye('beforeunload')
})

window.addEventListener('hashchange', () => {
  syncWindowIdToUrl(windowId)
})

window.addEventListener('popstate', () => {
  syncWindowIdToUrl(windowId)
})

window.addEventListener('unload', () => {
  clearTimeout(connectAckTimeout)
  clearInterval(heartbeatInterval)
})

console.log(window.location.href)

window.launchQueue.setConsumer((launchParams) => {
  console.log({launchParams})
})

// Shared Worker window presence tracker (connect/goodbye/heartbeat/disappear detection)
const HEARTBEAT_MS = 2000
const STALE_WINDOW_MS = HEARTBEAT_MS * 2
const CLOSE_GRACE_MS = 2000
const STALE_SCAN_MS = 1000
const windows = new Map()
const clientWindows = new Map()
const pendingRestore = new Map()
let activeWindowId = null
let restoreOwner = null
let startupHandled = false
let lastSavedSession = ''
let saveTask = Promise.resolve()

const sessionDB = new Promise((resolve, reject) => {
  const request = indexedDB.open('darc-window-sessions', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('session')
  request.onerror = () => reject(request.error)
  request.onsuccess = () => resolve(request.result)
}).catch(error => {
  console.warn('Window session storage is unavailable', error)
  return null
})

const sessionReady = sessionDB.then(db => new Promise((resolve, reject) => {
  if (!db) {
    resolve()
    return
  }
  const request = db.transaction('session').objectStore('session').get('windows')
  request.onerror = () => reject(request.error)
  request.onsuccess = () => {
    const saved = request.result
    if (Array.isArray(saved?.windows)) {
      for (const entry of saved.windows) {
        const windowId = parseId(entry?.windowId)
        if (windowId) {
          pendingRestore.set(windowId, { windowId, bounds: boundsFromPayload({ placement: entry.bounds, outer: entry.bounds }) })
        }
      }
      activeWindowId = parseId(saved.activeWindowId)
    }
    resolve()
  }
})).catch(error => console.warn('Failed to load window sessions', error))

function boundsFromPayload(payload) {
  const bounds = {
    x: payload.placement?.x,
    y: payload.placement?.y,
    width: payload.outer?.width,
    height: payload.outer?.height
  }
  if (Object.values(bounds).every(Number.isFinite) && bounds.width > 0 && bounds.height > 0) {
    return bounds
  }
  return null
}

function saveWindowSession() {
  const liveWindows = [...windows.values()].filter(state => state.status !== 'closed')
  // Keep the last complete set when every window is closing during app quit.
  if (!liveWindows.some(state => state.status === 'open')) {
    return
  }
  const saved = {
    activeWindowId,
    windows: [
      ...pendingRestore.values(),
      ...liveWindows.map(state => ({ windowId: state.windowId, bounds: boundsFromPayload(state.meta) }))
    ]
  }
  const serialized = JSON.stringify(saved)
  if (serialized === lastSavedSession) {
    return
  }
  lastSavedSession = serialized
  saveTask = saveTask.then(async () => {
    const db = await sessionDB
    if (!db) {
      return
    }
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('session', 'readwrite')
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
      transaction.objectStore('session').put(saved, 'windows')
    })
  }).catch(error => {
    lastSavedSession = ''
    console.warn('Failed to save window sessions', error)
  })
}

let workerAlive = true

function makeWindowId() {
  if (self.crypto?.randomUUID) return self.crypto.randomUUID()
  return `window-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function parseId(value) {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id || null
}

function resolvePayloadWindowId(payload = {}) {
  const directWindowId = parseId(payload.windowId)
  const clientId = parseId(payload.clientId)
  const assignedWindowId = clientWindows.get(clientId)
  if (assignedWindowId && (!directWindowId || directWindowId === assignedWindowId)) {
    return assignedWindowId
  }
  if (!assignedWindowId && directWindowId && clientId && windows.get(directWindowId)?.meta.clientId === clientId) {
    // A throttled/sleeping page may return after disappearance detection.
    clientWindows.set(clientId, directWindowId)
    return directWindowId
  }

  return null
}

function resolveConnectWindow(payload = {}) {
  const assignedWindowId = clientWindows.get(parseId(payload.clientId))
  if (assignedWindowId) {
    return { windowId: assignedWindowId, reused: true, reason: 'already-connected' }
  }
  const hintedWindowId = parseId(payload.hintWindowId)
    || parseId(payload.windowId)

  if (hintedWindowId && !['open', 'missing'].includes(windows.get(hintedWindowId)?.status)) {
    return {
      windowId: hintedWindowId,
      reused: true,
      reason: 'hint',
      bounds: pendingRestore.get(hintedWindowId)?.bounds
    }
  }

  if (!hintedWindowId && !payload.newWindow && pendingRestore.size > 0) {
    const saved = pendingRestore.get(activeWindowId) || pendingRestore.values().next().value
    return {
      ...saved,
      reused: true,
      reason: 'saved-session'
    }
  }

  return {
    windowId: makeWindowId(),
    reused: false,
    reason: 'new'
  }
}

function cleanupClientMappings(windowId) {
  clientWindows.forEach((mappedWindowId, clientId) => {
    if (mappedWindowId === windowId) {
      clientWindows.delete(clientId)
    }
  })
}

function getWindowState(windowId) {
  if (!windows.has(windowId)) {
    windows.set(windowId, {
      windowId,
      status: 'unknown',
      connectedAt: 0,
      lastSeenAt: 0,
      lastHeartbeatAt: 0,
      goodbyeAt: 0,
      closedAt: 0,
      closeReason: null,
      closeCandidateToken: 0,
      meta: {}
    })
  }

  return windows.get(windowId)
}

function scheduleCloseCandidate(windowId, reason) {
  const state = windows.get(windowId)
  if (!state) return

  state.closeCandidateToken += 1
  const decisionToken = state.closeCandidateToken

  setTimeout(() => {
    if (!workerAlive) return

    const latestState = windows.get(windowId)
    if (!latestState) return
    if (latestState.closeCandidateToken !== decisionToken) return

    const now = Date.now()
    const heartbeatAge = latestState.lastHeartbeatAt ? (now - latestState.lastHeartbeatAt) : Number.POSITIVE_INFINITY
    const hasGoodbye = !!latestState.goodbyeAt
    const stillMissing = hasGoodbye || heartbeatAge > STALE_WINDOW_MS

    if (!stillMissing) return

    if (!hasGoodbye) {
      // Background throttling and sleep are not proof that a window was closed.
      latestState.status = 'missing'
      return
    }

    latestState.status = 'closed'
    latestState.closedAt = now
    latestState.closeReason = hasGoodbye ? 'goodbye' : 'disappeared'
    cleanupClientMappings(windowId)
    saveWindowSession()
  }, CLOSE_GRACE_MS)
}

function markWindowOpen(windowId, patch = {}) {
  const now = Date.now()
  const state = getWindowState(windowId)

  state.status = 'open'
  state.lastSeenAt = now
  state.lastHeartbeatAt = now
  state.goodbyeAt = 0
  state.closedAt = 0
  state.closeReason = null
  state.meta = {
    ...state.meta,
    ...patch
  }
  state.closeCandidateToken += 1

  if (!state.connectedAt) {
    state.connectedAt = now
  }
}

async function handleConnect(port, payload = {}) {
  const clientId = parseId(payload.clientId) || makeWindowId()
  const restarting = windows.size > 0 && [...windows.values()].every(state => ['closing', 'closed'].includes(state.status))
  if (restarting && lastSavedSession) {
    const saved = JSON.parse(lastSavedSession)
    windows.clear()
    clientWindows.clear()
    pendingRestore.clear()
    for (const entry of saved.windows) {
      pendingRestore.set(entry.windowId, entry)
    }
    activeWindowId = saved.activeWindowId
    startupHandled = false
  }
  if (!startupHandled) {
    startupHandled = true
    restoreOwner = clientId
    for (const [windowId, saved] of pendingRestore) {
      const bounds = payload.savedWindowBounds?.[windowId]
      if (bounds && boundsFromPayload({ placement: bounds, outer: bounds })) {
        saved.bounds = bounds
      }
    }
  }
  const resolution = resolveConnectWindow({ ...payload, clientId })
  const windowId = resolution.windowId

  pendingRestore.delete(windowId)
  cleanupClientMappings(windowId)
  clientWindows.set(clientId, windowId)
  if (!clientWindows.has(restoreOwner)) {
    restoreOwner = clientId
  }

  markWindowOpen(windowId, {
    ...payload,
    clientId,
    ...(resolution.bounds ? {
      placement: { x: resolution.bounds.x, y: resolution.bounds.y },
      outer: { width: resolution.bounds.width, height: resolution.bounds.height }
    } : {})
  })
  activeWindowId ??= windowId
  saveWindowSession()
  await saveTask

  port.postMessage({
    type: 'CONNECTED_ACK',
    payload: {
      clientId,
      windowId,
      reused: resolution.reused,
      resolutionReason: resolution.reason,
      bounds: resolution.bounds,
      restoreSession: clientId === restoreOwner,
      timestamp: Date.now(),
      knownWindows: windows.size
    }
  })
}

function detectChanges(state, payload) {
  const changes = []
  const prev = state.meta || {}

  const prevPlacement = prev.placement || {}
  const nextPlacement = payload.placement || {}
  if (prevPlacement.x !== undefined && nextPlacement.x !== undefined) {
    const dx = Math.abs((prevPlacement.x || 0) - (nextPlacement.x || 0))
    const dy = Math.abs((prevPlacement.y || 0) - (nextPlacement.y || 0))
    if (dx > 5 || dy > 5) {
      changes.push({ kind: 'moved', from: prevPlacement, to: nextPlacement })
    }
  }

  const prevOuter = prev.outer || {}
  const nextOuter = payload.outer || {}
  if (prevOuter.width !== undefined && nextOuter.width !== undefined) {
    if (prevOuter.width !== nextOuter.width || prevOuter.height !== nextOuter.height) {
      changes.push({ kind: 'resized', from: prevOuter, to: nextOuter })
    }
  }

  return changes
}

function handleHeartbeat(payload = {}) {
  const windowId = resolvePayloadWindowId(payload)
  if (!windowId) return

  const clientId = parseId(payload.clientId)
  if (clientId) {
    clientWindows.set(clientId, windowId)
  }

  const state = getWindowState(windowId)
  const changes = detectChanges(state, payload)

  if (changes.length > 0) {
    console.log('window-change', windowId, changes)
  }

  state.lastSeenAt = Date.now()
  state.lastHeartbeatAt = Date.now()
  state.status = 'open'
  state.meta = {
    ...state.meta,
    ...payload
  }
  state.closeCandidateToken += 1
  saveWindowSession()
}

function handleGoodbye(payload = {}) {
  const windowId = resolvePayloadWindowId(payload)
  if (!windowId) return

  const clientId = parseId(payload.clientId)
  if (clientId) {
    clientWindows.set(clientId, windowId)
  }

  const state = getWindowState(windowId)
  state.goodbyeAt = Date.now()
  state.lastSeenAt = Date.now()
  state.closeReason = payload.reason || 'goodbye'
  state.status = 'closing'

  scheduleCloseCandidate(windowId, 'goodbye')
}

function handlePortMessage(port, message) {
  if (!message || typeof message !== 'object') return
  if (message.type !== 'HEARTBEAT') { console.log(message) }

  switch (message.type) {
    case 'CONNECT':
      return handleConnect(port, message.payload)
    case 'HEARTBEAT':
      handleHeartbeat(message.payload)
      break
    case 'GOODBYE':
      handleGoodbye(message.payload)
      break
    case 'FOCUS': {
      const windowId = resolvePayloadWindowId(message.payload)
      if (windowId) {
        activeWindowId = windowId
        saveWindowSession()
      }
      break
    }
    case 'RESTORE_WINDOWS':
      if (message.payload?.clientId === restoreOwner) {
        port.postMessage({ type: 'RESTORE_WINDOWS', payload: { windows: [...pendingRestore.values()] } })
      }
      break
    default:
      port.postMessage({
        type: 'UNHANDLED_MESSAGE_TYPE',
        payload: {
          type: message.type,
          timestamp: Date.now()
        }
      })
      break
  }
}

function scanForDisappearedWindows() {
  if (!workerAlive) return

  const now = Date.now()
  windows.forEach((state, windowId) => {
    if (state.status !== 'open') return

    const heartbeatAge = state.lastHeartbeatAt ? (now - state.lastHeartbeatAt) : Number.POSITIVE_INFINITY
    if (heartbeatAge <= STALE_WINDOW_MS) return

    scheduleCloseCandidate(windowId, 'heartbeat-timeout')
  })
}

sessionReady.then(() => setInterval(scanForDisappearedWindows, STALE_SCAN_MS))

let messageQueue = sessionReady

self.onconnect = function (event) {
  const port = event.ports[0]

  port.onmessage = function (messageEvent) {
    messageQueue = messageQueue.then(() => handlePortMessage(port, messageEvent.data)).catch(error => {
      console.error('Failed to handle window session message', error)
    })
  }

  port.start()
}

self.addEventListener('close', () => {
  workerAlive = false
})

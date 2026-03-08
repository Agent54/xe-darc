// Shared Worker window presence tracker (connect/goodbye/heartbeat/disappear detection)
const HEARTBEAT_MS = 2000
const STALE_WINDOW_MS = HEARTBEAT_MS * 2
const CLOSE_GRACE_MS = 2000
const STALE_SCAN_MS = 1000
const REOPEN_MATCH_MS = 30000
const REOPEN_POSITION_TOLERANCE = 80

const windows = new Map()
const clientWindows = new Map()

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
  if (directWindowId) return directWindowId

  const clientId = parseId(payload.clientId)
  if (clientId && clientWindows.has(clientId)) {
    return clientWindows.get(clientId)
  }

  return null
}

function placementsAreClose(previousPlacement, nextPlacement) {
  if (!previousPlacement || !nextPlacement) return true

  return Math.abs((previousPlacement.x || 0) - (nextPlacement.x || 0)) <= REOPEN_POSITION_TOLERANCE
    && Math.abs((previousPlacement.y || 0) - (nextPlacement.y || 0)) <= REOPEN_POSITION_TOLERANCE
}

function resolveConnectWindow(payload = {}) {
  const hintedWindowId = parseId(payload.hintWindowId)
    || parseId(payload.windowId)

  if (hintedWindowId) {
    if (windows.has(hintedWindowId)) {
      return {
        windowId: hintedWindowId,
        reused: true,
        reason: 'hint-existing'
      }
    }

    return {
      windowId: hintedWindowId,
      reused: false,
      reason: 'hint-new'
    }
  }

  const now = Date.now()
  const candidates = []

  windows.forEach(state => {
    if (state.status !== 'closed') return
    if (!state.closedAt || (now - state.closedAt) > REOPEN_MATCH_MS) return
    if (!state.meta?.url || !payload.url || state.meta.url !== payload.url) return
    if (!placementsAreClose(state.meta?.placement, payload.placement)) return

    candidates.push(state)
  })

  if (candidates.length > 0) {
    candidates.sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
    return {
      windowId: candidates[0].windowId,
      reused: true,
      reason: 'recent-match'
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

    latestState.status = 'closed'
    latestState.closedAt = now
    latestState.closeReason = hasGoodbye ? 'goodbye' : 'disappeared'
    cleanupClientMappings(windowId)
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

function handleConnect(port, payload = {}) {
  const clientId = parseId(payload.clientId) || makeWindowId()
  const resolution = resolveConnectWindow(payload)
  const windowId = resolution.windowId

  clientWindows.set(clientId, windowId)

  markWindowOpen(windowId, {
    ...payload,
    clientId
  })

  port.postMessage({
    type: 'CONNECTED_ACK',
    payload: {
      clientId,
      windowId,
      reused: resolution.reused,
      resolutionReason: resolution.reason,
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
      handleConnect(port, message.payload)
      break
    case 'HEARTBEAT':
      handleHeartbeat(message.payload)
      break
    case 'GOODBYE':
      handleGoodbye(message.payload)
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

setInterval(scanForDisappearedWindows, STALE_SCAN_MS)

self.onconnect = function (event) {
  const port = event.ports[0]

  port.onmessage = function (messageEvent) {
    handlePortMessage(port, messageEvent.data)
  }

  port.start()
}

self.addEventListener('close', () => {
  workerAlive = false
})

import { createMcpBrowserExecutor } from './mcp-browser-tools.js'

const storageKey = 'mcpConnections'
export const mcpBridgeKeyPrefix = 'mcpBridgeKey:'

export function createMcpConnections({ data, storage = localStorage, getWindowId = () => window.darcWindowId,
    fetchRequest = fetch, Socket = WebSocket, defaultBase = location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : 'https://localhost:5194' }) {
    const listeners = new Set()
    const bridges = new Map()
    let connections = []
    let running = false
    let error = ''
    let base = storage.getItem('mcpServerUrl') || defaultBase

    function load() {
        try { connections = JSON.parse(storage.getItem(storageKey) || '[]').filter(entry => entry.id && entry.endpoint && entry.windowId) } catch { connections = [] }
    }
    load()
    function snapshot() {
        return { base, error, connections: connections.map(entry => ({ ...entry,
            status: entry.windowId !== getWindowId() ? 'other-window' : bridges.get(entry.id)?.status || 'offline',
            error: bridges.get(entry.id)?.error || '' })) }
    }
    function publish() { for (const listener of listeners) { listener(snapshot()) } }
    function persist() { storage.setItem(storageKey, JSON.stringify(connections)); publish() }

    async function request(path, options) {
        const response = await fetchRequest(path, options)
        const result = await response.json()
        if (!response.ok) { throw new Error(result.error || `MCP worker returned ${response.status}`) }
        return result
    }

    function abortPending(bridge) {
        for (const controller of bridge.calls.values()) { controller.abort() }
        bridge.calls.clear()
    }

    function connect(entry) {
        if (!running || entry.windowId !== getWindowId() || bridges.has(entry.id)) { return }
        const key = storage.getItem(mcpBridgeKeyPrefix + entry.id)
        if (!key) { return }
        const bridge = { calls: new Map(), status: 'connecting', error: '', stopped: false, timer: null, socket: null, attempt: 0 }
        bridges.set(entry.id, bridge)
        const execute = createMcpBrowserExecutor({ data, getConnection: () => bridge.status === 'connected' && !bridge.stopped ? connections.find(item => item.id === entry.id) : null })
        function open() {
            if (bridge.stopped) { return }
            bridge.status = 'connecting'
            publish()
            const url = new URL(`/mcp/bridge/${entry.id}`, entry.endpoint)
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
            const socket = new Socket(url)
            bridge.socket = socket
            const heartbeat = setInterval(() => { if (socket.readyState === 1) { socket.send(JSON.stringify({ type: 'ping' })) } }, 25000)
            socket.onopen = () => socket.send(JSON.stringify({ type: 'authenticate', key }))
            socket.onmessage = async event => {
                let message
                try { message = JSON.parse(event.data) } catch { return }
                if (message.type === 'ready') {
                    bridge.status = 'connected'
                    bridge.error = ''
                    bridge.attempt = 0
                }
                if ((message.type === 'ready' || message.type === 'identity') && message.agent) {
                    const current = connections.find(item => item.id === entry.id)
                    if (current) { current.agent = message.agent; persist() }
                }
                if (message.type === 'cancel') { bridge.calls.get(message.id)?.abort() }
                if (message.type === 'call') {
                    const controller = new AbortController()
                    bridge.calls.set(message.id, controller)
                    try {
                        const result = await execute({ name: message.name, args: message.args, agent: message.agent, signal: controller.signal })
                        if (!controller.signal.aborted && socket.readyState === 1) { socket.send(JSON.stringify({ type: 'result', id: message.id, result })) }
                    } catch (error) {
                        if (socket.readyState === 1) { socket.send(JSON.stringify({ type: 'result', id: message.id, error: error.message })) }
                    } finally { bridge.calls.delete(message.id) }
                }
                publish()
            }
            socket.onerror = () => { bridge.error = 'MCP worker connection failed'; publish() }
            socket.onclose = event => {
                clearInterval(heartbeat)
                abortPending(bridge)
                bridge.status = 'offline'
                bridge.error = event.reason || 'MCP worker disconnected'
                publish()
                if (!bridge.stopped && running) { bridge.timer = setTimeout(open, Math.min(15000, 1000 * 2 ** bridge.attempt++)) }
            }
        }
        open()
    }

    function close(id) {
        const bridge = bridges.get(id)
        if (!bridge) { return }
        bridge.stopped = true
        clearTimeout(bridge.timer)
        abortPending(bridge)
        bridge.socket?.close()
        bridges.delete(id)
    }

    function sync() {
        load()
        for (const id of bridges.keys()) { if (!connections.some(entry => entry.id === id && entry.windowId === getWindowId())) { close(id) } }
        for (const entry of connections) { connect(entry) }
        publish()
    }

    async function control(entry, method, metadata) {
        const key = storage.getItem(mcpBridgeKeyPrefix + entry.id)
        return request(new URL(`/mcp/connections/${entry.id}`, entry.endpoint), {
            method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            ...(metadata ? { body: JSON.stringify(metadata) } : {})
        })
    }

    return {
        subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
        get state() { return snapshot() },
        start() { running = true; sync() },
        sync,
        stop() { running = false; for (const id of bridges.keys()) { close(id) }; publish() },
        setBase(value) {
            const url = new URL(value)
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) { throw new Error('Use the HTTP(S) origin of the workerd server') }
            base = url.origin
            storage.setItem('mcpServerUrl', base)
            publish()
        },
        async add(title, description) {
            const windowId = getWindowId()
            if (!windowId) { throw new Error('Browser window identity is not ready') }
            const result = await request(`${base}/mcp/connections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, description, windowId }) })
            const entry = { id: result.id, title: title.trim(), description: description.trim(), windowId, endpoint: `${base}/mcp/${result.id}` }
            storage.setItem(mcpBridgeKeyPrefix + entry.id, result.key)
            connections.push(entry)
            persist()
            connect(entry)
            return entry
        },
        async update(id, title, description) {
            const entry = connections.find(item => item.id === id)
            if (!entry) { return }
            await control(entry, 'PATCH', { title, description })
            Object.assign(entry, { title: title.trim(), description: description.trim() })
            persist()
        },
        async remove(id) {
            const entry = connections.find(item => item.id === id)
            if (!entry) { return }
            await control(entry, 'DELETE')
            close(id)
            await data.removeMcpPermissions(id)
            storage.removeItem(mcpBridgeKeyPrefix + id)
            connections = connections.filter(item => item.id !== id)
            persist()
        }
    }
}

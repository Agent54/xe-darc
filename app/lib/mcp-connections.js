import { createMcpBrowserExecutor } from './mcp-browser-tools.js'

const storageKey = 'mcpConnections'
export const mcpBridgeKeyPrefix = 'mcpBridgeKey:'

export function createMcpConnections({ data, storage = localStorage, getWindowId = () => window.darcWindowId,
    defaultBase = location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : 'https://localhost:5194' }) {
    const listeners = new Set()
    const bindings = new Set()
    let connections = []
    // Retain old endpoint origins: they are part of persisted permission document IDs.
    const base = storage.getItem('mcpServerUrl') || defaultBase

    function load() {
        try { connections = JSON.parse(storage.getItem(storageKey) || '[]').filter(entry => entry.id && entry.endpoint && entry.windowId) } catch { connections = [] }
    }
    load()
    function snapshot() {
        return { connections: connections.map(entry => ({ ...entry,
            status: entry.windowId !== getWindowId() ? 'other-window' : [...bindings].some(binding => binding.id === entry.id) ? 'connected' : 'ready' })) }
    }
    function publish() { for (const listener of listeners) { listener(snapshot()) } }
    function persist() { storage.setItem(storageKey, JSON.stringify(connections)); publish() }
    function close(binding) { binding.controller.abort(); bindings.delete(binding) }
    function sync() {
        load()
        for (const binding of bindings) {
            if (!connections.some(entry => entry.id === binding.id && entry.windowId === getWindowId())) { close(binding) }
        }
        publish()
    }
    function metadata(title, description) {
        if (!title?.trim() || title.length > 96 || !description?.trim() || description.length > 512) {
            throw new Error('A short title and identifying description are required')
        }
        return { title: title.trim(), description: description.trim() }
    }

    return {
        subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
        get state() { return snapshot() },
        start: sync, sync,
        stop() { for (const binding of bindings) { close(binding) }; publish() },
        async add(title, description) {
            const windowId = getWindowId()
            if (!windowId) { throw new Error('Browser window identity is not ready') }
            const id = crypto.randomUUID()
            const entry = { id, ...metadata(title, description), windowId, endpoint: `${base}/mcp/${id}` }
            connections.push(entry)
            persist()
            return entry
        },
        async update(id, title, description) {
            const entry = connections.find(item => item.id === id)
            if (!entry) { return }
            Object.assign(entry, metadata(title, description))
            persist()
        },
        async remove(id) {
            for (const binding of bindings) { if (binding.id === id) { close(binding) } }
            await data.removeMcpPermissions(id)
            storage.removeItem(mcpBridgeKeyPrefix + id)
            connections = connections.filter(item => item.id !== id)
            persist()
        },
        openAcp(id, agent) {
            sync()
            const entry = connections.find(item => item.id === id && item.windowId === getWindowId())
            if (!entry) { throw new Error('Select an MCP connection owned by this window') }
            const binding = { id, controller: new AbortController() }
            bindings.add(binding)
            const getConnection = () => !binding.controller.signal.aborted && connections.find(item => item.id === id && item.windowId === getWindowId())
            const execute = createMcpBrowserExecutor({ data, getConnection })
            publish()
            return {
                name: entry.title.replace(/[^A-Za-z0-9_-]/g, '_'), signal: binding.controller.signal,
                reportAgent(info) {
                    const current = getConnection()
                    if (current && typeof info?.name === 'string') {
                        current.agent = { name: info.name.slice(0, 128), version: typeof info.version === 'string' ? info.version.slice(0, 64) : '', headers: {} }
                        persist()
                    }
                },
                execute: request => execute({ ...request, agent: getConnection()?.agent || agent, signal: request.signal
                    ? AbortSignal.any([binding.controller.signal, request.signal]) : binding.controller.signal }),
                close() { close(binding); publish() }
            }
        }
    }
}

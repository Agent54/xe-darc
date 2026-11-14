import { createMcpBrowserExecutor } from './mcp-browser-tools.js'

const storageKey = 'mcpConnections'
export const mcpBridgeKeyPrefix = 'mcpBridgeKey:'
const proxyKeyPrefix = 'mcpProxyCredentials:'
const revocationsKey = 'mcpProxyRevocations'

export function createMcpConnections({ data, storage = localStorage, getWindowId = () => window.darcWindowId,
    defaultBase = location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : 'https://localhost:5194', fetcher = globalThis.fetch }) {
    const listeners = new Set()
    const bindings = new Set()
    let connections = []
    let revoking
    // Retain old endpoint origins: they are part of persisted permission document IDs.
    const base = storage.getItem('mcpServerUrl') || defaultBase

    function load() {
        try { connections = JSON.parse(storage.getItem(storageKey) || '[]').filter(entry => entry.id && entry.endpoint && entry.windowId) } catch { connections = [] }
        for (const entry of connections) {
            const credentials = saved(proxyKeyPrefix + entry.id, {})
            let changed = false
            for (const binding of Object.values(credentials)) {
                if (!binding.url || !URL.canParse(binding.url)) { continue }
                const url = new URL(binding.url)
                if (url.searchParams.has('token')) {
                    url.searchParams.delete('token')
                    binding.url = url.href
                    changed = true
                }
            }
            if (changed) { storage.setItem(proxyKeyPrefix + entry.id, JSON.stringify(credentials)) }
        }
    }
    load()
    function saved(key, fallback) {
        try { return JSON.parse(storage.getItem(key) || 'null') || fallback } catch { return fallback }
    }
    function snapshot() {
        return { connections: connections.map(entry => ({ ...entry,
            mcpUrl: saved(proxyKeyPrefix + entry.id, {})[entry.proxyEndpoint]?.url,
            status: entry.windowId !== getWindowId() ? 'other-window' : [...bindings].some(binding => binding.id === entry.id) ? 'connected' : entry.proxyEndpoint ? 'offline' : 'ready' })) }
    }
    function publish() { for (const listener of listeners) { listener(snapshot()) } }
    function persist() { storage.setItem(storageKey, JSON.stringify(connections)); publish() }
    function close(binding) { binding.controller.abort(); bindings.delete(binding) }
    function flushRevocations() {
        if (revoking) { return revoking }
        if (!saved(revocationsKey, []).length) { return Promise.resolve() }
        revoking = (async () => {
            for (const item of saved(revocationsKey, [])) {
                try {
                    const url = new URL(item.url)
                    url.search = ''
                    url.pathname += '/connection'
                    const response = await fetcher(url, { method: 'DELETE', headers: { Authorization: `Bearer ${item.key}` }, signal: AbortSignal.timeout(2000) })
                    await response.body?.cancel()
                    if (response.ok || response.status === 404) {
                        storage.setItem(revocationsKey, JSON.stringify(saved(revocationsKey, []).filter(other => other.url !== item.url || other.key !== item.key)))
                    }
                } catch { /* Keep offline removals for the next start or reconnect. */ }
            }
        })().finally(() => { revoking = null })
        return revoking
    }
    function sync() {
        load()
        for (const binding of bindings) {
            if (!connections.some(entry => entry.id === binding.id && entry.windowId === getWindowId())) { close(binding) }
        }
        publish()
        void flushRevocations()
    }
    function metadata(title, description = '') {
        if (typeof title !== 'string' || !title.trim() || title.length > 96 || typeof description !== 'string' || description.length > 512) {
            throw new Error('A title of up to 96 characters is required; the optional description can be up to 512 characters')
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
            const revoked = Object.values(saved(proxyKeyPrefix + id, {})).filter(item => item.url)
            storage.setItem(revocationsKey, JSON.stringify([...saved(revocationsKey, []), ...revoked]))
            storage.removeItem(proxyKeyPrefix + id)
            storage.removeItem(mcpBridgeKeyPrefix + id)
            connections = connections.filter(item => item.id !== id)
            persist()
            await revoking
            await flushRevocations()
        },
        openAcp(id, agent, endpoint = defaultBase) {
            sync()
            const entry = connections.find(item => item.id === id && item.windowId === getWindowId())
            if (!entry) { throw new Error('Select an MCP connection owned by this window') }
            const credentials = saved(proxyKeyPrefix + id, {})
            if (!credentials[endpoint]) {
                credentials[endpoint] = { key: crypto.randomUUID() + crypto.randomUUID() }
                storage.setItem(proxyKeyPrefix + id, JSON.stringify(credentials))
            }
            const binding = { id, controller: new AbortController() }
            bindings.add(binding)
            const getConnection = () => !binding.controller.signal.aborted && connections.find(item => item.id === id && item.windowId === getWindowId())
            const execute = createMcpBrowserExecutor({ data, getConnection })
            publish()
            return {
                name: entry.title.replace(/[^A-Za-z0-9_-]/g, '_'), signal: binding.controller.signal,
                proxyIdentity: { id, key: credentials[endpoint].key },
                setMcpUrl(value) {
                    if (!getConnection() || typeof value !== 'string') { return }
                    if (!URL.canParse(value)) { return }
                    const url = new URL(value)
                    if (!['http:', 'https:'].includes(url.protocol)) { return }
                    url.searchParams.delete('token')
                    // Credentials survive disconnects in private local storage, excluded from exports.
                    const current = saved(proxyKeyPrefix + id, {})
                    current[endpoint] = { ...credentials[endpoint], url: url.href }
                    storage.setItem(proxyKeyPrefix + id, JSON.stringify(current))
                    getConnection().proxyEndpoint = endpoint
                    persist()
                },
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

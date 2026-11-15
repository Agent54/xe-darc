const configKey = 'acpConnection'
const tokenKey = 'acpBearerToken'
const connectionsKey = 'mcpConnections'
const currentWindow = () => globalThis.window?.darcWindowId

function readJson(storage, key, fallback) {
    try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

function scopeEndpoint(id, storage) {
    const location = globalThis.location
    const base = storage?.getItem('mcpServerUrl') || (['http:', 'https:'].includes(location?.protocol) ? location.origin : 'https://localhost:5194')
    return `${base}/mcp/${id}`
}

// Keep the existing identity records and permission origins; ACP settings now belong to them.
export function readAcpConnections(storage = globalThis.localStorage, session = globalThis.sessionStorage, windowId = currentWindow()) {
    let entries = readJson(storage, connectionsKey, [])
    const legacy = readJson(storage, configKey, null)
    if (windowId && legacy?.endpoint) {
        let entry = entries.find(item => item.id === legacy.mcpConnectionId)
        if (!entry) {
            const id = legacy.mcpConnectionId || crypto.randomUUID()
            entry = { id, title: 'Agent connection', description: '', windowId, endpoint: scopeEndpoint(id, storage) }
            entries.push(entry)
        }
        entry.acpEndpoint ??= legacy.endpoint
        entry.cwd ??= legacy.cwd || '/'
        storage.setItem(connectionsKey, JSON.stringify(entries))
        storage.setItem(`selectedAcpConnection:${entry.windowId}`, entry.id)
        storage.removeItem(configKey)
        storage.removeItem(tokenKey)
        session?.removeItem(tokenKey)
    }
    return entries.filter(entry => entry.windowId === windowId).map(entry => ({
        id: entry.id, title: entry.title, description: entry.description || '', windowId: entry.windowId,
        endpoint: entry.acpEndpoint ?? entry.proxyEndpoint ?? '', cwd: entry.cwd || '/',
        mcpConnectionId: entry.id
    }))
}

export function selectAcpConnection(id, storage = globalThis.localStorage, session = globalThis.sessionStorage, windowId = currentWindow()) {
    if (!readAcpConnections(storage, session, windowId).some(entry => entry.id === id)) { throw new Error('Select a connection owned by this window') }
    storage.setItem(`selectedAcpConnection:${windowId}`, id)
}

export function removeAcpSettings(id, storage = globalThis.localStorage, windowId = currentWindow()) {
    storage.removeItem(`${tokenKey}:${id}`)
    if (storage.getItem(`selectedAcpConnection:${windowId}`) === id) { storage.removeItem(`selectedAcpConnection:${windowId}`) }
    storage.removeItem(`acpConversations:${windowId}:${id}`)
}

export function clearProviderSettings(storage = globalThis.localStorage) {
    if (!storage) {
        return
    }
    for (const key of Object.keys(storage)) {
        if (key.startsWith('aiToken_') || key === 'selectedAiProvider') {
            storage.removeItem(key)
        }
    }
}

export function readAcpModelPreference(endpoint, storage) {
    return storage?.getItem(`acpSelectedModel:${endpoint}`) ?? storage?.getItem('selectedModel')
}

export function saveAcpModelPreference(endpoint, model, storage) {
    storage?.setItem(`acpSelectedModel:${endpoint}`, model)
    storage?.removeItem('selectedModel')
}

export function readAcpSettings(storage = globalThis.localStorage, session = globalThis.sessionStorage, windowId = currentWindow()) {
    clearProviderSettings(storage)
    const connections = readAcpConnections(storage, session, windowId)
    const selected = storage?.getItem(`selectedAcpConnection:${windowId}`)
    const connection = connections.find(entry => entry.id === selected) || connections[0]
    if (connection) { return connection }
    let config = {}
    try {
        config = JSON.parse(storage?.getItem(configKey) || '{}') || {}
    } catch {
        config = {}
    }
    return { id: '', title: '', description: '', endpoint: config.endpoint || '', cwd: config.cwd || '/', mcpConnectionId: config.mcpConnectionId || '' }
}

export function validateAcpSettings(settings) {
    const endpoint = settings.endpoint.trim()
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
        throw new Error('Use an HTTP(S) ACP endpoint without embedded credentials or a fragment')
    }
    const cwd = settings.cwd.trim() || '/'
    if (!cwd.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(cwd)) {
        throw new Error('The working directory must be an absolute path on the agent host')
    }
    return { id: settings.id || '', title: settings.title || '', description: settings.description || '',
        endpoint: url.href, cwd, mcpConnectionId: settings.id || settings.mcpConnectionId || '' }
}

export function saveAcpSettings(settings, storage = globalThis.localStorage, session = globalThis.sessionStorage, windowId = currentWindow()) {
    if (!windowId) { throw new Error('Browser window identity is not ready') }
    const config = settings.endpoint.trim() ? validateAcpSettings(settings) : {
        id: settings.id || '', title: settings.title || '', description: settings.description || '',
        endpoint: '', cwd: settings.cwd.trim() || '/', mcpConnectionId: settings.id || settings.mcpConnectionId || '' }
    clearProviderSettings(storage)
    readAcpConnections(storage, session, windowId)
    const entries = readJson(storage, connectionsKey, [])
    const id = settings.id || settings.mcpConnectionId || crypto.randomUUID()
    const title = settings.title?.trim() || (config.endpoint ? new URL(config.endpoint).hostname : 'Agent connection')
    const description = settings.description?.trim() || ''
    if (title.length > 96 || description.length > 512) { throw new Error('Use a title of up to 96 characters and description of up to 512 characters') }
    let entry = entries.find(item => item.id === id)
    if (entry && entry.windowId !== windowId) { throw new Error('Select a connection owned by this window') }
    if (!entry) { entry = { id, windowId, endpoint: scopeEndpoint(id, storage) }; entries.push(entry) }
    Object.assign(entry, { title, description, acpEndpoint: config.endpoint, cwd: config.cwd })
    storage.setItem(connectionsKey, JSON.stringify(entries))
    storage.setItem(`selectedAcpConnection:${windowId}`, id)
    storage.removeItem(`${tokenKey}:${id}`)
    storage.removeItem(configKey)
    storage.removeItem(tokenKey)
    session?.removeItem(tokenKey)
    return { ...config, id, title, description, windowId, mcpConnectionId: id }
}

export function exportableStorage(storage = globalThis.localStorage) {
    return Object.fromEntries(Object.entries(storage).filter(([key]) => key !== tokenKey && !key.startsWith(`${tokenKey}:`) && !key.startsWith('acpConversations:') && key !== 'mcpProxyRevocations' && !key.startsWith('mcpProxyCredentials:') && !key.startsWith('mcpBridgeKey:') && !key.startsWith('aiToken_') && !['selectedAiProvider', 'selectedModel'].includes(key)))
}

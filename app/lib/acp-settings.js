const configKey = 'acpConnection'
const tokenKey = 'acpBearerToken'

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

export function readAcpSettings(storage = globalThis.localStorage, session = globalThis.sessionStorage) {
    clearProviderSettings(storage)
    let config = {}
    try {
        config = JSON.parse(storage?.getItem(configKey) || '{}') || {}
    } catch {
        config = {}
    }
    const token = storage?.getItem(tokenKey) ?? session?.getItem(tokenKey) ?? ''
    if (token) { storage?.setItem(tokenKey, token) }
    session?.removeItem(tokenKey)
    return { endpoint: config.endpoint || '', cwd: config.cwd || '/', token, mcpConnectionId: config.mcpConnectionId || '' }
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
    return { endpoint: url.href, cwd, token: settings.token.trim(), mcpConnectionId: settings.mcpConnectionId || '' }
}

export function saveAcpSettings(settings, storage = globalThis.localStorage, session = globalThis.sessionStorage) {
    const config = settings.endpoint.trim() ? validateAcpSettings(settings) : { endpoint: '', cwd: settings.cwd.trim() || '/', token: settings.token.trim(), mcpConnectionId: settings.mcpConnectionId || '' }
    clearProviderSettings(storage)
    storage.setItem(configKey, JSON.stringify({ endpoint: config.endpoint, cwd: config.cwd, mcpConnectionId: config.mcpConnectionId }))
    if (config.endpoint && config.token) {
        storage.setItem(tokenKey, config.token)
    } else {
        storage.removeItem(tokenKey)
    }
    session?.removeItem(tokenKey)
    return config
}

export function exportableStorage(storage = globalThis.localStorage) {
    return Object.fromEntries(Object.entries(storage).filter(([key]) => key !== tokenKey && !key.startsWith('acpConversations:') && key !== 'mcpProxyRevocations' && !key.startsWith('mcpProxyCredentials:') && !key.startsWith('mcpBridgeKey:') && !key.startsWith('aiToken_') && !['selectedAiProvider', 'selectedModel'].includes(key)))
}

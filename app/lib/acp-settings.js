const configKey = 'acpConnection'
const tokenKey = 'acpBearerToken'

export function clearProviderSettings(storage = globalThis.localStorage) {
    if (!storage) {
        return
    }
    for (const key of Object.keys(storage)) {
        if (key.startsWith('aiToken_') || ['selectedAiProvider', 'selectedModel'].includes(key)) {
            storage.removeItem(key)
        }
    }
}

export function readAcpSettings(storage = globalThis.localStorage, session = globalThis.sessionStorage) {
    clearProviderSettings(storage)
    let config = {}
    try {
        config = JSON.parse(storage?.getItem(configKey) || '{}') || {}
    } catch {
        config = {}
    }
    return { endpoint: config.endpoint || '', cwd: config.cwd || '/', token: session?.getItem(tokenKey) || '' }
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
    return { endpoint: url.href, cwd, token: settings.token.trim() }
}

export function saveAcpSettings(settings, storage = globalThis.localStorage, session = globalThis.sessionStorage) {
    const config = settings.endpoint.trim() ? validateAcpSettings(settings) : { endpoint: '', cwd: settings.cwd.trim() || '/', token: settings.token.trim() }
    clearProviderSettings(storage)
    storage.setItem(configKey, JSON.stringify({ endpoint: config.endpoint, cwd: config.cwd }))
    if (config.token) {
        session.setItem(tokenKey, config.token)
    } else {
        session.removeItem(tokenKey)
    }
    return config
}

export function exportableStorage(storage = globalThis.localStorage) {
    return Object.fromEntries(Object.entries(storage).filter(([key]) => key !== tokenKey && !key.startsWith('aiToken_') && !['selectedAiProvider', 'selectedModel'].includes(key)))
}

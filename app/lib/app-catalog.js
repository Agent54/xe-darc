const catalogAPI = 'https://api.github.com/repos/agent54/xe-appstore'
const catalogAssets = 'https://raw.githubusercontent.com/agent54/xe-appstore/main/'
const servicePath = /^catalog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/
const serviceCache = new Map()

function isWebURL(value) {
    try {
        const url = new URL(value)
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
    } catch {
        return false
    }
}

export function parseCatalogService(service, path, revision = '') {
    const match = path.match(servicePath)
    const requiredFields = ['id', 'name', 'description', 'iconUrl', 'type']
    if (!match || !service || requiredFields.some(field => typeof service[field] !== 'string' || !service[field].trim()) || service.id !== match[2]) {
        throw new Error(`Invalid catalog service: ${path}`)
    }
    const assetIcon = /^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(service.iconUrl)
    if (!assetIcon && !isWebURL(service.iconUrl)) {
        throw new Error(`Invalid catalog icon: ${path}`)
    }
    if (service.type === 'url') {
        if (!isWebURL(service.url)) {
            throw new Error(`Invalid catalog URL: ${path}`)
        }
    } else if (service.type === 'docker') {
        if (!isWebURL(service.githubUrl) || !/^https:\/\/github\.com\/[^/\s?#]+\/[^/\s?#]+\/?$/.test(service.githubUrl) ||
            typeof service.branch !== 'string' || !service.branch.trim() ||
            !['compose', 'dockerfile'].includes(service.pathType) ||
            typeof service.path !== 'string' || !service.path.trim() || service.path.startsWith('/') || service.path.split('/').includes('..') ||
            (service.checkoutPath !== undefined && (typeof service.checkoutPath !== 'string' || !service.checkoutPath.trim()))) {
            throw new Error(`Invalid catalog repository settings: ${path}`)
        }
    } else {
        throw new Error(`Unsupported catalog service type: ${path}`)
    }
    return {
        ...service,
        category: match[1],
        iconUrl: assetIcon ? `${catalogAssets}${service.iconUrl}?v=${encodeURIComponent(revision)}` : service.iconUrl
    }
}

async function catalogRequest(path, signal, raw = false) {
    const response = await fetch(`${catalogAPI}${path}`, {
        signal,
        cache: 'no-cache',
        headers: { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json' }
    })
    if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
            const reset = Number(response.headers.get('x-ratelimit-reset'))
            const retryAt = reset ? ` Try again after ${new Date(reset * 1000).toLocaleTimeString([], { hour12: false })}.` : ' Please try again later.'
            throw new Error(`GitHub is limiting catalog requests.${retryAt}`)
        }
        if (response.status === 404) {
            throw new Error('The app catalog is unavailable on GitHub.')
        }
        throw new Error(`GitHub could not load the catalog (${response.status}).`)
    }
    try {
        return await response.json()
    } catch (error) {
        if (signal.aborted) {
            throw error
        }
        throw new Error('GitHub returned invalid catalog JSON.')
    }
}

export async function loadAppCatalog({ signal } = {}) {
    const timeout = AbortSignal.timeout(20000)
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
    const tree = await catalogRequest('/git/trees/main?recursive=1', requestSignal)
    if (!Array.isArray(tree?.tree) || tree.truncated) {
        throw new Error('GitHub returned an incomplete app catalog.')
    }
    const files = tree.tree.filter(entry => entry.type === 'blob' && servicePath.test(entry.path))
    const apps = new Array(files.length)
    let nextFile = 0
    async function loadServices() {
        while (nextFile < files.length) {
            requestSignal.throwIfAborted()
            const index = nextFile++
            const file = files[index]
            let service = serviceCache.get(file.sha)
            if (!service) {
                service = await catalogRequest(`/git/blobs/${encodeURIComponent(file.sha)}`, requestSignal, true)
            }
            apps[index] = parseCatalogService(service, file.path, tree.sha)
            serviceCache.set(file.sha, service)
        }
    }
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, loadServices))
    requestSignal.throwIfAborted()
    const ids = new Set()
    for (const app of apps) {
        if (ids.has(app.id)) {
            throw new Error(`Duplicate app catalog ID: ${app.id}`)
        }
        ids.add(app.id)
    }
    const currentSHAs = new Set(files.map(file => file.sha))
    for (const sha of serviceCache.keys()) {
        if (!currentSHAs.has(sha)) {
            serviceCache.delete(sha)
        }
    }
    return apps.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
}

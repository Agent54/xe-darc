import { jsonSchemaToType } from '@ark/json-schema'

const catalogAPI = 'https://api.github.com/repos/agent54/xe-appstore'
const catalogAssets = 'https://raw.githubusercontent.com/agent54/xe-appstore/main/'
const servicePath = /^catalog\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/
const serviceCache = new Map()
let cachedSchema = null
const snapshotCache = new Map()

export function parseCatalogService(service, path, revision, serviceType) {
    const match = path.match(servicePath)
    if (!match) {
        throw new Error(`Invalid catalog service: ${path}`)
    }
    let validatedService
    try {
        validatedService = serviceType.assert(service)
    } catch (error) {
        throw new Error(`Invalid catalog service: ${path}: ${error.message}`, { cause: error })
    }
    if (validatedService.id !== match[2]) {
        throw new Error(`Catalog service ID does not match filename: ${path}`)
    }
    return {
        ...validatedService,
        category: match[1],
        iconUrl: validatedService.iconUrl.startsWith('assets/')
            ? `${catalogAssets}${validatedService.iconUrl}?v=${encodeURIComponent(revision)}`
            : validatedService.iconUrl
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

async function loadCatalogTree(revision, signal) {
    const tree = await catalogRequest(`/git/trees/${encodeURIComponent(revision)}?recursive=1`, signal)
    if (!Array.isArray(tree?.tree) || tree.truncated) {
        throw new Error('GitHub returned an incomplete app catalog.')
    }
    return tree
}

function catalogSignal(signal) {
    const timeout = AbortSignal.timeout(20000)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export async function loadAppCatalog({ signal } = {}) {
    const requestSignal = catalogSignal(signal)
    const tree = await loadCatalogTree('main', requestSignal)
    const schemaEntry = tree.tree.find(entry => entry.type === 'blob' && entry.path === 'catalog.schema.json')
    if (!schemaEntry?.sha) {
        throw new Error('GitHub returned an app catalog without its schema.')
    }
    if (cachedSchema?.sha !== schemaEntry.sha) {
        const schema = await catalogRequest(`/git/blobs/${encodeURIComponent(schemaEntry.sha)}`, requestSignal, true)
        cachedSchema = { sha: schemaEntry.sha, serviceType: jsonSchemaToType(schema) }
    }
    const serviceType = cachedSchema.serviceType
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
            apps[index] = {
                ...parseCatalogService(service, file.path, tree.sha, serviceType),
                catalogRevision: file.sha
            }
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

function catalogVersions(tree) {
    const versions = new Map()
    for (const entry of tree.tree) {
        const match = entry.type === 'blob' && entry.path.match(servicePath)
        if (match && entry.sha) {
            if (versions.has(match[2])) {
                throw new Error(`Duplicate app catalog ID: ${match[2]}`)
            }
            versions.set(match[2], entry.sha)
        }
    }
    return versions
}

function installedSnapshot(app) {
    if (!app.iconUrl?.startsWith(catalogAssets)) {
        return null
    }
    const revision = new URL(app.iconUrl).searchParams.get('v')
    return /^[a-f0-9]{40}$/.test(revision || '') ? revision : null
}

export async function loadCatalogUpdates(installedApps, { signal, catalogApps } = {}) {
    const installed = installedApps.filter(app => app.catalogId)
    if (!installed.length) {
        return {}
    }
    const requestSignal = catalogSignal(signal)
    const latest = catalogApps
        ? new Map(catalogApps.map(app => [app.id, app.catalogRevision]))
        : catalogVersions(await loadCatalogTree('main', requestSignal))
    const updates = {}
    const failedSnapshots = new Set()
    for (const app of installed) {
        requestSignal.throwIfAborted()
        const revision = latest.get(app.catalogId)
        if (!revision) {
            continue
        }
        let installedRevision = app.catalogRevision
        if (!installedRevision) {
            const snapshot = installedSnapshot(app)
            if (snapshot && !failedSnapshots.has(snapshot)) {
                try {
                    if (!snapshotCache.has(snapshot)) {
                        snapshotCache.set(snapshot, catalogVersions(await loadCatalogTree(snapshot, requestSignal)))
                    }
                    installedRevision = snapshotCache.get(snapshot).get(app.catalogId)
                } catch (error) {
                    requestSignal.throwIfAborted()
                    failedSnapshots.add(snapshot)
                    continue
                }
            }
        }
        if (installedRevision && installedRevision !== revision) {
            updates[app.id || app._id] = { catalogId: app.catalogId, installedRevision, catalogRevision: revision }
        }
    }
    return updates
}

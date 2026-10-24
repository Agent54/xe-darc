const composeAPIOrigins = ['https://compose-ui.localhost', 'https://compose-ui.localhost:5194']
let composeConnection = null

async function checkComposeOrigin(origin, signal) {
    const response = await fetch(`${origin}/v1.24/app-ports`, { signal })
    if (!response.ok) throw new Error(`Compose API returned ${response.status} at ${origin}`)
    const ports = await response.json()
    if (ports?.https !== Number(new URL(origin).port || 443) || !ports.publicHttpReady) {
        throw new Error(`Compose HTTPS port is unavailable at ${origin}`)
    }
    return { origin, ports }
}

async function getComposeConnection(signal) {
    if (composeConnection) return composeConnection
    let lastError
    for (const origin of composeAPIOrigins) {
        try {
            composeConnection = await checkComposeOrigin(origin, signal)
            return composeConnection
        } catch (error) {
            if (signal?.aborted) throw error
            lastError = error
        }
    }
    try {
        // The private listener only supplies the selected port when a custom pair is configured.
        const response = await fetch('http://127.0.0.1:8094/v1.24/app-ports', { signal })
        if (!response.ok) throw new Error(`Compose port discovery returned ${response.status}`)
        const ports = await response.json()
        if (!Number.isInteger(ports?.https) || ports.https < 1 || ports.https > 65535) {
            throw new Error('Compose port discovery returned an invalid HTTPS port')
        }
        const origin = `https://compose-ui.localhost${ports.https === 443 ? '' : `:${ports.https}`}`
        composeConnection = await checkComposeOrigin(origin, signal)
        return composeConnection
    } catch (error) {
        if (signal?.aborted) throw error
        lastError = error
    }
    throw new Error(`Xe Launcher Compose API is unavailable over HTTPS: ${lastError?.message || 'connection failed'}`)
}

export async function getComposeAppPorts({ signal } = {}) {
    if (composeConnection) {
        try {
            composeConnection = await checkComposeOrigin(composeConnection.origin, signal)
        } catch (error) {
            if (signal?.aborted) throw error
            composeConnection = null
        }
    }
    return (await getComposeConnection(signal)).ports
}

async function composeFetch(path, options = {}) {
    const { origin } = await getComposeConnection(options.signal)
    try {
        return await fetch(`${origin}${path}`, options)
    } catch (error) {
        if (!options.signal?.aborted) composeConnection = null
        throw error
    }
}

async function composeRequest(path, { signal } = {}) {
    const response = await composeFetch(path, { signal })
    const text = await response.text()
    let result = null
    try {
        result = text ? JSON.parse(text) : null
    } catch {
        result = null
    }

    if (!response.ok) {
        const error = new Error(result?.message || result?.error || text || `Compose request failed (${response.status})`)
        error.status = response.status
        throw error
    }
    return result
}

function projectVariants(project) {
    const files = String(project.ConfigFiles || project.configFiles || '')
        .split(',')
        .map(file => file.trim())
        .filter(Boolean)
    if (!files.length) return [{ configFiles: '', configPath: '' }]

    const grouped = new Map()
    for (const file of files) {
        const normalized = file.replaceAll('\\', '/')
        const directory = normalized.slice(0, normalized.lastIndexOf('/'))
        const current = grouped.get(directory) || []
        current.push(file)
        grouped.set(directory, current)
    }
    return [...grouped.values()].map(group => ({
        configFiles: group.join(','),
        configPath: group[0]
    }))
}

function isMissingComposeConfig(error) {
    return error.status === 404 ||
        (error.status >= 400 && /\bno such file or directory\b/i.test(error.message))
}

async function loadVariantContainers(encodedName, variant, signal) {
    const query = new URLSearchParams({ all: 'true' })
    if (variant.configFiles) query.set('path', variant.configFiles)
    try {
        return await composeRequest(`/v1.24/ps/${encodedName}?${query}`, { signal })
    } catch (error) {
        if (signal?.aborted || !variant.configFiles || !isMissingComposeConfig(error)) throw error
        // Older Compose backends still try to load the deleted files for /ps.
        // Retry by project, retaining only containers from this exact variant.
        const containers = await composeRequest(`/v1.24/ps/${encodedName}?all=true`, { signal })
        const files = variant.configFiles.split(',')
        return Array.isArray(containers) ? containers.filter(container => {
            const labels = container.Labels || container.labels || {}
            const recorded = String(labels['com.docker.compose.project.config_files'] || '')
                .split(',').map(file => file.trim())
            return files.every(file => recorded.includes(file))
        }) : []
    }
}

function configFromContainers(containers) {
    return { services: Object.fromEntries(containers.flatMap(container => {
        const name = container.Service || container.service
        const labels = container.Labels || container.labels || {}
        if (!name || String(labels['com.docker.compose.oneoff']).toLowerCase() === 'true') return []
        return [[name, {}]]
    })) }
}

async function loadProjectVariant(project, variant, signal) {
    const name = project.Name || project.name
    const query = new URLSearchParams({ format: 'json' })
    if (variant.configFiles) {
        query.set('path', variant.configFiles)
    }
    const encodedName = encodeURIComponent(name)
    const [config, containers] = await Promise.all([
        composeRequest(`/v1.24/config/${encodedName}?${query}`, { signal }).catch(error => {
            if (signal?.aborted || !isMissingComposeConfig(error)) throw error
            return null
        }),
        loadVariantContainers(encodedName, variant, signal)
    ])
    return {
        project: name,
        status: project.Status || project.status || '',
        watching: Boolean(project.Watching ?? project.watching),
        configFiles: variant.configFiles,
        configPath: variant.configPath,
        config: config || configFromContainers(Array.isArray(containers) ? containers : []),
        containers: Array.isArray(containers) ? containers : []
    }
}

export async function listComposeProjects({ signal } = {}) {
    const projects = await composeRequest('/v1.24/ls?all=true', { signal })
    if (!Array.isArray(projects)) {
        throw new Error('Compose returned an invalid project list')
    }
    return await Promise.all(projects.flatMap(project =>
        projectVariants(project).map(variant => loadProjectVariant(project, variant, signal))
    ))
}

export async function checkoutRepository({ url, path, branch, token, signal }) {
    const payload = { url: url.trim() }
    const checkoutPath = path?.trim()
    if (checkoutPath) {
        payload.path = checkoutPath
    }
    if (branch?.trim()) {
        payload.branch = branch.trim()
    }
    if (token?.trim()) {
        payload.token = token.trim()
    }

    const response = await composeFetch('/v1.24/repos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
    })
    const text = await response.text()
    let result = null
    try {
        result = text ? JSON.parse(text) : null
    } catch {
        result = null
    }

    if (!response.ok) {
        throw new Error(result?.message || result?.error || text || `Repository checkout failed (${response.status})`)
    }
    if (!result?.path) {
        throw new Error('Repository checkout returned an invalid response')
    }
    return result
}

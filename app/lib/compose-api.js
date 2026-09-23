const composeAPIOrigin = 'http://127.0.0.1:8094'

async function composeRequest(path, { signal } = {}) {
    const response = await fetch(`${composeAPIOrigin}${path}`, { signal })
    const text = await response.text()
    let result = null
    try {
        result = text ? JSON.parse(text) : null
    } catch {
        result = null
    }

    if (!response.ok) {
        throw new Error(result?.message || result?.error || text || `Compose request failed (${response.status})`)
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

async function loadProjectVariant(project, variant, signal) {
    const name = project.Name || project.name
    const query = new URLSearchParams({ format: 'json' })
    const psQuery = new URLSearchParams({ all: 'true' })
    if (variant.configFiles) {
        query.set('path', variant.configFiles)
        psQuery.set('path', variant.configFiles)
    }
    const encodedName = encodeURIComponent(name)
    const [config, containers] = await Promise.all([
        composeRequest(`/v1.24/config/${encodedName}?${query}`, { signal }),
        composeRequest(`/v1.24/ps/${encodedName}?${psQuery}`, { signal })
    ])
    return {
        project: name,
        status: project.Status || project.status || '',
        watching: Boolean(project.Watching ?? project.watching),
        configFiles: variant.configFiles,
        configPath: variant.configPath,
        config,
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

    const response = await fetch(`${composeAPIOrigin}/v1.24/repos/checkout`, {
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

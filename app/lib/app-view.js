export const appViewOptions = [
    { value: 'lastUsed', label: 'Last used' },
    { value: 'installedAt', label: 'Installed time' },
    { value: 'category', label: 'Category' },
    { value: 'type', label: 'Type' },
    { value: 'running', label: 'Running state' }
]

export function appTypeLabel(type) {
    return ({ docker: 'Docker', pwa: 'Webapp', webapp: 'Webapp', static: 'Static', weblink: 'Web link', url: 'Web link' })[type] || 'Other'
}

export function appTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value < 1e12 ? value * 1000 : value
    }
    const parsed = typeof value === 'string' ? Date.parse(value) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function isDockerRunning(status) {
    const state = String(status || '').toLowerCase()
    if (/\b(exited|stopped|dead|created|paused|restarting|removing|not running)\b/.test(state)) {
        return false
    }
    return /\b(running|up)\b/.test(state)
}

export function appMatchesURL(app, url) {
    const urls = [app.url, ...(app.endpoints || []).map(endpoint => endpoint.url)].filter(Boolean)
    return urls.some(candidate => {
        try {
            const target = new URL(candidate)
            const client = new URL(url)
            const path = target.pathname.replace(/\/+$/, '')
            return target.origin === client.origin && (!path || client.pathname === path || client.pathname.startsWith(`${path}/`))
        } catch {
            return false
        }
    })
}

export function appRuntime(app, clients = []) {
    const openClients = clients.filter(client => !client.closed)
    const awake = openClients.some(client => !client.hibernated)
    const hibernated = openClients.length > 0 && !awake
    const serverRunning = (app.containerStates || [app.status]).some(isDockerRunning)
    const running = app.type === 'docker' ? serverRunning && !hibernated : awake
    const clientStatus = hibernated ? 'Client hibernated' : awake ? 'Client active' : 'No open client'
    return {
        running,
        lastUsed: Math.max(appTimestamp(app.lastUsed), ...clients.map(client => appTimestamp(client.lastUsed))),
        runtimeLabel: `${running ? 'Running' : 'Not running'} · ${app.type === 'docker' ? `Docker ${serverRunning ? 'running' : 'not running'} · ` : ''}${clientStatus}`
    }
}

function dateGroup(timestamp, field, now) {
    if (!timestamp) {
        return { key: 'unknown', label: field === 'lastUsed' ? 'Never used' : 'Install time unknown', order: 4 }
    }
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    const today = date.getTime()
    date.setDate(date.getDate() - 7)
    const week = date.getTime()
    date.setDate(date.getDate() - 23)
    const month = date.getTime()
    if (timestamp >= today) {
        return { key: 'today', label: 'Today', order: 0 }
    }
    if (timestamp >= week) {
        return { key: 'week', label: 'Previous 7 days', order: 1 }
    }
    if (timestamp >= month) {
        return { key: 'month', label: 'Previous 30 days', order: 2 }
    }
    return { key: 'older', label: 'Older', order: 3 }
}

export function arrangeApps(apps, { sort = 'none', group = 'none', now = Date.now() } = {}) {
    const ordered = [...apps]
    if (sort !== 'none') {
        ordered.sort((a, b) => {
            if (sort === 'lastUsed' || sort === 'installedAt') {
                return appTimestamp(b[sort]) - appTimestamp(a[sort])
            }
            if (sort === 'running') {
                return Number(b.running) - Number(a.running)
            }
            const label = app => sort === 'type' ? appTypeLabel(app.type) : app.category || 'Uncategorized'
            return label(a).localeCompare(label(b))
        })
    }
    if (group === 'none') {
        return [{ key: 'all', label: '', apps: ordered }]
    }
    const groups = new Map()
    for (const app of ordered) {
        let descriptor
        if (group === 'lastUsed' || group === 'installedAt') {
            descriptor = dateGroup(appTimestamp(app[group]), group, now)
        } else if (group === 'running') {
            descriptor = { key: app.running ? 'running' : 'stopped', label: app.running ? 'Running' : 'Not running', order: app.running ? 0 : 1 }
        } else {
            const label = group === 'type' ? appTypeLabel(app.type) : app.category || 'Uncategorized'
            descriptor = { key: label, label, order: 0 }
        }
        const key = `${group}:${descriptor.key}`
        if (!groups.has(key)) {
            groups.set(key, { ...descriptor, key, apps: [] })
        }
        groups.get(key).apps.push(app)
    }
    return [...groups.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

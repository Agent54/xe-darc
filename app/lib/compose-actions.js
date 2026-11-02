export function composeContainer(container) {
    return {
        id: container.ID || container.Id || container.id,
        name: container.Name || container.name,
        state: String(container.State || container.state || 'unknown').toLowerCase()
    }
}

export function composeActionItems(app, container = null) {
    const states = container ? [container.state] : app.containers.map(container => container.state)
    const uncreated = states.length === 0
    const items = []
    if (uncreated || states.some(state => ['exited', 'created', 'unknown', 'stopped'].includes(state))) {
        items.push({ id: 'start', label: 'Start' })
    }
    if (states.some(state => ['running', 'paused', 'restarting'].includes(state))) {
        items.push({ id: 'stop', label: 'Stop' }, { id: 'restart', label: 'Restart' })
    }
    if (states.includes('running')) {
        items.push({ id: 'pause', label: 'Pause' })
    }
    if (states.length && states.every(state => state === 'paused')) {
        items.push({ id: 'unpause', label: 'Unpause' })
    }
    items.push(app.watching ? { id: 'stop-watch', label: 'Stop watching' } : { id: 'watch', label: 'Start watching' })
    if (uncreated) {
        items.push({ id: 'up-no-build', label: 'Start without rebuilding' })
    }
    items.push({ id: 'remove', label: 'Remove' })
    return items
}

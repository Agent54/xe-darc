import { permissionType } from './permissions.js'

export async function requestMcpPermission(data, { connection, agent, permission, target, parents = [], targets = [], signal, current }) {
    await data.permissionsReady
    signal?.throwIfAborted()
    const context = {
        url: connection.endpoint, partition: `mcp:${connection.id}`,
        subject: { kind: 'mcp', id: connection.id, title: connection.title, description: connection.description }, target, parents
    }
    context.current = () => current() && !signal?.aborted ? context : null
    if (!context.current()) { throw new Error('This MCP connection or browser target is no longer available') }
    let requestId
    const abort = () => { if (requestId) { data.cancelPermissionRequest(requestId) } }
    try {
        const granted = await new Promise(resolve => {
            const result = data.permissionRequest(`mcp:${connection.id}`, {
                permission, url: connection.endpoint, agent, permissionTargets: targets,
                explanation: `${connection.title} requests ${permission.replace('mcp-', '').replaceAll('-', ' ')}: ${target.label}`,
                settle: resolve
            }, context)
            requestId = result.requestId
            if (!result.pending) { resolve(result.granted) }
            signal?.addEventListener('abort', abort, { once: true })
            if (signal?.aborted) { abort() }
        })
        signal?.throwIfAborted()
        if (!granted || !context.current()) { throw new Error('MCP permission denied, cancelled, or expired') }
    } finally {
        signal?.removeEventListener('abort', abort)
    }
}

export function mcpPermissionResources(data, connectionId) {
    const history = Object.values(data.permissions).flatMap(type => Object.values(type.origins || {}).flatMap(origin => origin.requests || []))
        .filter(resource => resource.scope?.subject?.id === connectionId && resource.status !== 'ignored')
    const represented = new Set(history.map(resource => resource.ruleId))
    const saved = Object.values(data.permissionRules).filter(rule => rule.subject?.id === connectionId && !represented.has(rule._id)).map(rule => ({
        requestId: rule._id, ruleId: rule._id, type: permissionType(rule.permission), permission: rule.permission,
        scope: rule, subject: rule.subject, target: rule.target, url: rule.requestingOrigin,
        status: rule.decision === 'deny' ? 'denied' : 'granted', supported: true, lifetime: 'persistent', timestamp: rule.modified
    }))
    return [...history, ...saved].map(resource => {
        const rule = data.permissionRules[resource.ruleId]
        return { ...resource, status: resource.status === 'requested' ? 'requested' : rule ? rule.decision === 'deny' ? 'denied' : 'granted'
            : resource.lifetime === 'persistent' ? 'ignored' : resource.status }
    }).filter(resource => resource.status !== 'ignored')
}

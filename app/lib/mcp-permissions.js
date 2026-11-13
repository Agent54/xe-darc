import { permissionCardResources } from './permissions.js'

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
    return permissionCardResources(data.permissions, data.permissionRules, resource => resource.scope?.subject?.id === connectionId)
        .filter(resource => resource.status !== 'ignored')
}

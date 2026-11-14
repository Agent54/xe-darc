import * as acp from '@agentclientprotocol/sdk/unstable'
import type { Stream } from '@agentclientprotocol/sdk'
import { createMcpGateway } from './mcp-gateway.ts'

export function connectProxy(stream: Stream, stdio: Stream, gateway: ReturnType<typeof createMcpGateway>, options: {
    browserOnly?: { cwd: string; configure(url: string): void | Promise<void> }
} = {}) {
    let front: acp.AgentConnection
    let nativeMcp = false
    let httpMcp = false
    let agentInfo = { name: 'ACP agent', version: '' }
    const caller = new acp.McpOverAcpCaller()
    const exported = new Map<string, Awaited<ReturnType<typeof gateway.expose>>>()
    const backend = acp.client({ name: 'darc-acp-proxy' })
        .onRequest('*', ({ method, params, signal }) => front.client.request(method, params, { cancellationSignal: signal, stopWaitingOnCancel: true }))
        .onNotification('*', ({ method, params }) => front.client.notify(method, params))
        .connect(stdio)
    front = acp.agent()
        .onRequest(acp.methods.agent.initialize, async ({ params, signal }) => {
            const result = await backend.agent.request(acp.methods.agent.initialize, params, { cancellationSignal: signal, stopWaitingOnCancel: true })
            nativeMcp = !!result.agentCapabilities?.mcpCapabilities?.acp
            httpMcp = !!result.agentCapabilities?.mcpCapabilities?.http
            agentInfo = result.agentInfo || agentInfo
            return { ...result, _meta: { ...result._meta, 'darc/mcpPersistence': true }, agentCapabilities: { ...result.agentCapabilities,
                mcpCapabilities: { ...result.agentCapabilities?.mcpCapabilities, acp: nativeMcp || httpMcp } } }
        })
        .onRequest('*', async ({ method, params, signal }) => {
            const mcpUrls: Record<string, string> = {}
            if ((options.browserOnly || method === acp.methods.agent.session.new || method === acp.methods.agent.session.load) &&
                params && typeof params === 'object' && 'mcpServers' in params && Array.isArray(params.mcpServers)) {
                if (options.browserOnly && (params.mcpServers.length > 1 || params.mcpServers.some(server => !acp.isMcpServerAcp(server)))) {
                    throw acp.RequestError.invalidParams(undefined, 'This proxy accepts only the connected browser MCP server')
                }
                const { 'darc/connections': owners, ...meta } = ('_meta' in params ? params._meta || {} : {}) as Record<string, unknown>
                const identities = owners as Record<string, { id: string; key: string }> | undefined
                const mcpServers = []
                for (const server of params.mcpServers) {
                    if (!acp.isMcpServerAcp(server)) { mcpServers.push(server); continue }
                    if (!nativeMcp && !httpMcp) { throw new Error('This agent supports neither MCP-over-ACP nor HTTP MCP') }
                    const identity = identities?.[server.serverId]
                    if (!identity) {
                        throw acp.RequestError.invalidParams(undefined, 'Browser MCP requires its saved connection identity in darc/connections')
                    }
                    let endpoint = exported.get(server.serverId)
                    if (!endpoint) {
                        endpoint = await gateway.expose(front.client, caller, server, front.signal, agentInfo,
                            identity)
                        exported.set(server.serverId, endpoint)
                    }
                    mcpUrls[server.serverId] = endpoint.url
                    if (options.browserOnly) {
                        await options.browserOnly.configure(endpoint.url)
                        mcpServers.push({ ...endpoint.declaration, name: 'darc' })
                    } else {
                        mcpServers.push(nativeMcp ? server : endpoint.declaration)
                    }
                }
                // Owner credentials are for the proxy, never the downstream tool client.
                params = { ...params, mcpServers, _meta: meta }
            }
            if (options.browserOnly && params && typeof params === 'object') {
                // OpenCode must not load local project configuration or additional filesystem roots.
                params = { ...params, ...('cwd' in params ? { cwd: options.browserOnly.cwd } : {}),
                    ...('additionalDirectories' in params ? { additionalDirectories: [] } : {}) }
            }
            const result = await backend.agent.request(method, params, { cancellationSignal: signal, stopWaitingOnCancel: true })
            if (Object.keys(mcpUrls).length && result && typeof result === 'object') {
                return { ...result, _meta: { ...(result as { _meta?: object })._meta, 'darc/mcpUrls': mcpUrls } }
            }
            return result
        })
        .onNotification(acp.methods.agent.mcp.message, context => {
            if (exported.get(context.params.serverId)?.handleNotification(context)) { return }
            if (nativeMcp) { return backend.agent.notify(context.method, context.params) }
        })
        .onNotification('*', ({ method, params }) => backend.agent.notify(method, params))
        .connect(stream)
    void front.closed.then(() => backend.close())
    void backend.closed.then(() => front.close())
    return { closed: Promise.all([front.closed, backend.closed]).then(() => {}) }
}

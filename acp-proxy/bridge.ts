import * as acp from '@agentclientprotocol/sdk/unstable'
import type { Stream } from '@agentclientprotocol/sdk'
import { createMcpGateway } from './mcp-gateway.ts'

export function connectProxy(stream: Stream, stdio: Stream, gateway: ReturnType<typeof createMcpGateway>) {
    let front: acp.AgentConnection
    let nativeMcp = false
    let httpMcp = false
    let agentInfo = { name: 'ACP agent', version: '' }
    const caller = new acp.McpOverAcpCaller()
    const exported = new Map<string, ReturnType<typeof gateway.expose>>()
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
            return { ...result, agentCapabilities: { ...result.agentCapabilities,
                mcpCapabilities: { ...result.agentCapabilities?.mcpCapabilities, acp: nativeMcp || httpMcp } } }
        })
        .onRequest('*', async ({ method, params, signal }) => {
            if (!nativeMcp && params && typeof params === 'object' && 'mcpServers' in params && Array.isArray(params.mcpServers)) {
                const mcpServers = params.mcpServers.map(server => {
                    if (!acp.isMcpServerAcp(server)) { return server }
                    if (!httpMcp) { throw new Error('This agent supports neither MCP-over-ACP nor HTTP MCP') }
                    let endpoint = exported.get(server.serverId)
                    if (!endpoint) {
                        endpoint = gateway.expose(front.client, caller, server, front.signal, agentInfo)
                        exported.set(server.serverId, endpoint)
                    }
                    return endpoint
                })
                params = { ...params, mcpServers }
            }
            return backend.agent.request(method, params, { cancellationSignal: signal, stopWaitingOnCancel: true })
        })
        .onNotification(acp.methods.agent.mcp.message, context => {
            if (nativeMcp) { return backend.agent.notify(context.method, context.params) }
            caller.handleNotification(context)
        })
        .onNotification('*', ({ method, params }) => backend.agent.notify(method, params))
        .connect(stream)
    void front.closed.then(() => backend.close())
    void backend.closed.then(() => front.close())
    return { closed: Promise.all([front.closed, backend.closed]).then(() => {}) }
}

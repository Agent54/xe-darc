import * as acp from '@agentclientprotocol/sdk/unstable'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { timingSafeEqual } from 'node:crypto'
import { mcpTools } from '../app/lib/mcp-tool-defs.js'

// HTTP compatibility terminates here; browser execution and permissions stay on ACP.
export function createMcpGateway(origin: string) {
    const endpoints = new Map<string, { token: string; handler: ReturnType<typeof createMcpHandler> }>()
    return {
        expose(client: acp.AgentContext, caller: acp.McpOverAcpCaller, declaration: acp.McpServerAcpDeclaration,
            signal: AbortSignal, agentInfo: { name: string; version: string }) {
            signal.throwIfAborted()
            const path = `/mcp/${crypto.randomUUID()}`
            const token = crypto.randomUUID() + crypto.randomUUID()
            const handler = createMcpHandler(() => {
                const server = new McpServer({ name: 'darc-browser', version: '1.0.0' })
                for (const [name, definition] of Object.entries(mcpTools)) {
                    server.registerTool(name, definition, async (args, ctx) => {
                        const outcome = await caller.request(client, declaration.serverId, 'tools/call', {
                            name, arguments: args, _meta: { [acp.MCP_META_CLIENT_INFO]: agentInfo }
                        }, { signal: AbortSignal.any([signal, ctx.mcpReq.signal]) })
                        if ('error' in outcome) { throw new Error(outcome.error.message) }
                        return outcome.result as { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
                    })
                }
                return server
            }, { legacy: 'stateless', maxRequestBodySize: 1024 * 1024 })
            endpoints.set(path, { token, handler })
            signal.addEventListener('abort', () => { endpoints.delete(path); void handler.close() }, { once: true })
            return { type: 'http' as const, name: declaration.name, url: new URL(path, origin).href,
                headers: [{ name: 'Authorization', value: `Bearer ${token}` }] }
        },
        async fetch(request: Request) {
            const entry = endpoints.get(new URL(request.url).pathname)
            if (!entry) { return new Response('MCP endpoint unavailable', { status: 404 }) }
            const supplied = new TextEncoder().encode(request.headers.get('Authorization') || '')
            const expected = new TextEncoder().encode(`Bearer ${entry.token}`)
            if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
                return new Response('Invalid MCP credential', { status: 401 })
            }
            return entry.handler.fetch(request)
        }
    }
}

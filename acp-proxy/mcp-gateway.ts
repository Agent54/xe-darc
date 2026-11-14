import * as acp from '@agentclientprotocol/sdk/unstable'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { timingSafeEqual } from 'node:crypto'
import { mcpTools } from '../app/lib/mcp-tool-defs.js'
import type { McpRegistration, McpRegistry } from './mcp-store.ts'

async function keyHash(value: string) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

function matches(left: string, right: string) {
    const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right)
    return a.length === b.length && timingSafeEqual(a, b)
}

// HTTP compatibility terminates here; browser execution and permissions stay on ACP.
export function createMcpGateway(origin: string, registry?: McpRegistry) {
    const records = new Map((registry?.load() || []).map(record => [record.id, record]))
    const active = new Map<string, Set<{ handler: ReturnType<typeof createMcpHandler>; controller: AbortController }>>()
    function save(record: McpRegistration) {
        const next = new Map(records).set(record.id, record)
        registry?.save([...next.values()])
        records.set(record.id, record)
    }
    return {
        async expose(client: acp.AgentContext, caller: acp.McpOverAcpCaller, declaration: acp.McpServerAcpDeclaration,
            signal: AbortSignal, agentInfo: { name: string; version: string }, identity?: { id: string; key: string }) {
            if (identity !== undefined && (typeof identity?.id !== 'string' || !identity.id || identity.id.length > 256 ||
                typeof identity.key !== 'string' || identity.key.length < 32 || identity.key.length > 512)) {
                throw new Error('Invalid saved browser MCP credentials')
            }
            // Plain MCP-over-ACP declarations predate the optional saved-connection metadata.
            // Their server IDs belong to one ACP connection, so use a separate HTTP path as before.
            const id = identity?.id ?? crypto.randomUUID()
            const ownerKeyHash = identity ? await keyHash(identity.key) : undefined
            signal.throwIfAborted()
            let record = records.get(id)
            if (record) {
                if (record.deleted || !ownerKeyHash || !record.ownerKeyHash || !matches(ownerKeyHash, record.ownerKeyHash)) {
                    throw new Error('MCP connection removed or invalid owner credential')
                }
            } else {
                record = { id, path: `/mcp/${encodeURIComponent(id)}`, ...(ownerKeyHash ? { ownerKeyHash } : {}) }
                save(record)
            }
            const path = `/mcp/${encodeURIComponent(record.id)}`
            const controller = new AbortController()
            const lifetime = AbortSignal.any([signal, controller.signal])
            const pending = new Set<string>()
            const handler = createMcpHandler(() => {
                const server = new McpServer({ name: 'darc-browser', version: '1.0.0' })
                for (const [name, definition] of Object.entries(mcpTools)) {
                    server.registerTool(name, definition, async (args, ctx) => {
                        const requestId = crypto.randomUUID()
                        pending.add(requestId)
                        try {
                            const outcome = await caller.request(client, declaration.serverId, 'tools/call', {
                                name, arguments: args, _meta: { [acp.MCP_META_CLIENT_INFO]: agentInfo }
                            }, { requestId, signal: AbortSignal.any([lifetime, ctx.mcpReq.signal]) })
                            if ('error' in outcome) { throw new Error(outcome.error.message) }
                            return outcome.result as { content: Array<{ type: 'text'; text: string }>; isError?: boolean }
                        } finally { pending.delete(requestId) }
                    })
                }
                return server
            }, { legacy: 'stateless', maxRequestBodySize: 1024 * 1024 })
            const binding = { handler, controller }
            const bindings = active.get(record.id) || new Set()
            active.set(record.id, bindings)
            bindings.add(binding)
            lifetime.addEventListener('abort', () => {
                bindings.delete(binding)
                if (!bindings.size) { active.delete(record.id) }
                void handler.close()
            }, { once: true })
            const url = new URL(path, origin)
            const http = { type: 'http' as const, name: declaration.name, url: url.href, headers: [] }
            return { declaration: http, url: url.href,
                handleNotification(context: Parameters<typeof caller.handleNotification>[0]) {
                    if (!pending.has(context.params.requestId)) { return false }
                    caller.handleNotification(context)
                    return true
                } }
        },
        async fetch(request: Request) {
            const url = new URL(request.url)
            const control = url.pathname.endsWith('/connection')
            const path = control ? url.pathname.slice(0, -'/connection'.length) : url.pathname
            // Retain previously issued paths as aliases when upgrading to /mcp/<connection-id>.
            const entry = [...records.values()].find(record => record.path === path || `/mcp/${encodeURIComponent(record.id)}` === path)
            if (!entry || entry.deleted) { return new Response('MCP connection removed or not registered; connect Darc to this proxy', { status: 404 }) }
            if (control) {
                if (request.method !== 'DELETE') { return new Response(null, { status: 405 }) }
                const key = request.headers.get('Authorization')?.replace(/^Bearer /, '') || ''
                if (!entry.ownerKeyHash || !matches(await keyHash(key), entry.ownerKeyHash)) { return new Response('Invalid owner credential', { status: 401 }) }
                save({ ...entry, deleted: true })
                for (const binding of active.get(entry.id) || []) { binding.controller.abort() }
                return new Response(null, { status: 204 })
            }
            const binding = [...(active.get(entry.id) || [])].at(-1)
            if (!binding) { return new Response('Browser MCP connection is offline; reconnect Darc', { status: 503 }) }
            return binding.handler.fetch(request)
        }
    }
}

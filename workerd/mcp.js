import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import { mcpTools } from '../app/lib/mcp-tool-defs.js'

const limit = 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const identityHeaders = ['user-agent', 'mcp-client-name', 'mcp-client-version', 'x-agent-name', 'x-agent-version', 'x-agent-id', 'x-client-name', 'x-client-version']

export function mcpAgentIdentity(request, body) {
    const headers = Object.fromEntries(identityHeaders.flatMap(name => request.headers.get(name) ? [[name, request.headers.get(name).slice(0, 512)]] : []))
    const info = body?.params?._meta?.['io.modelcontextprotocol/clientInfo']
    const clientInfo = typeof info?.name === 'string' ? { name: info.name.slice(0, 128), version: typeof info.version === 'string' ? info.version.slice(0, 64) : '' } : null
    return {
        name: headers['x-agent-name'] || headers['mcp-client-name'] || headers['x-client-name'] || clientInfo?.name || headers['user-agent'] || 'Unidentified client',
        version: headers['x-agent-version'] || headers['mcp-client-version'] || headers['x-client-version'] || clientInfo?.version || '',
        headers, ...(clientInfo ? { clientInfo } : {}), lastSeen: Date.now()
    }
}

function json(value, status = 200) {
    return Response.json(value, { status })
}

function cors(response, request) {
    if (response.status === 101) { return response }
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*')
    headers.set('Vary', 'Origin')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, MCP-Protocol-Version, MCP-Method, MCP-Name, X-Agent-Name, X-Agent-Version, X-Agent-Id, X-Client-Name, X-Client-Version, MCP-Client-Name, MCP-Client-Version')
    headers.set('Access-Control-Expose-Headers', 'MCP-Protocol-Version')
    return new Response(response.body, { status: response.status, headers })
}

async function readJson(request) {
    const reader = request.body?.getReader()
    if (!reader) { throw new Error('A JSON body is required') }
    const chunks = []
    let size = 0
    for (;;) {
        const { value, done } = await reader.read()
        if (done) { break }
        size += value.byteLength
        if (size > limit) { reader.cancel().catch(() => {}); throw new Error('MCP request exceeds 1 MiB') }
        chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes))
}

function details(body) {
    if (typeof body?.title !== 'string' || !body.title.trim() || body.title.length > 96 ||
        typeof body.description !== 'string' || !body.description.trim() || body.description.length > 512) {
        throw new Error('A short title and identifying description are required')
    }
    return { title: body.title.trim(), description: body.description.trim() }
}

export async function routeMcp(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/mcp')) { return null }
    if (!env.MCP_CONNECTIONS) { return cors(json({ error: 'MCP worker binding is unavailable' }, 503), request) }
    if (request.method === 'OPTIONS') { return cors(new Response(null, { status: 204 }), request) }
    try {
        if (url.pathname === '/mcp/connections' && request.method === 'POST') {
            const body = await readJson(request)
            const metadata = details(body)
            if (typeof body.windowId !== 'string' || !body.windowId) { return cors(json({ error: 'A browser window identity is required' }, 400), request) }
            const id = crypto.randomUUID()
            const key = crypto.randomUUID() + crypto.randomUUID()
            const object = env.MCP_CONNECTIONS.get(env.MCP_CONNECTIONS.idFromName(id))
            const response = await object.fetch('http://mcp.internal/setup', { method: 'POST', body: JSON.stringify({ ...metadata, id, key, windowId: body.windowId }) })
            if (!response.ok) { throw new Error('Could not register the MCP connection') }
            return cors(json({ id, key }), request)
        }
        const match = url.pathname.match(/^\/mcp\/(?:(connections|bridge)\/)?([^/]+)$/)
        if (!match || !uuid.test(match[2])) { return cors(json({ error: 'Unknown MCP endpoint' }, 404), request) }
        const [, kind, id] = match
        const object = env.MCP_CONNECTIONS.get(env.MCP_CONNECTIONS.idFromName(id))
        const target = new URL(request.url)
        target.pathname = kind === 'connections' ? '/control' : kind === 'bridge' ? '/bridge' : '/mcp'
        return cors(await object.fetch(new Request(target, request)), request)
    } catch (error) {
        return cors(json({ error: error.message }, 400), request)
    }
}

export class McpConnection {
    constructor(state) {
        this.state = state
        this.config = null
        this.bridge = null
        this.pending = new Map()
        this.ready = state.storage.get('connection').then(config => { this.config = config })
        this.handler = createMcpHandler(({ requestInfo }) => {
            const server = new McpServer({ name: 'darc-browser', version: '1.0.0' })
            for (const [name, definition] of Object.entries(mcpTools)) {
                server.registerTool(name, definition, async (args, ctx) => {
                    try {
                        const agent = this.requestIdentities.get(requestInfo)
                        const result = await this.invoke(name, args, agent, ctx.mcpReq.signal)
                        const text = JSON.stringify(result)
                        if (text.length > limit * 4) { throw new Error('The MCP result is too large; read a smaller scope or use an XPath selector') }
                        return { content: [{ type: 'text', text }] }
                    } catch (error) {
                        return { isError: true, content: [{ type: 'text', text: error.message }] }
                    }
                })
            }
            return server
        }, { legacy: 'reject', maxRequestBodySize: limit })
        this.requestIdentities = new WeakMap()
    }

    async fetch(request) {
        await this.ready
        const path = new URL(request.url).pathname
        if (path === '/setup' && request.method === 'POST') {
            if (this.config) { return json({ error: 'Connection already exists' }, 409) }
            this.config = await readJson(request)
            await this.state.storage.put('connection', this.config)
            return json({ ok: true })
        }
        if (!this.config || this.config.deleted) { return json({ error: 'MCP connection does not exist' }, 404) }
        if (path === '/control') {
            if (request.headers.get('Authorization') !== `Bearer ${this.config.key}`) { return json({ error: 'Invalid browser control credential' }, 403) }
            if (request.method === 'PATCH') {
                Object.assign(this.config, details(await readJson(request)))
                await this.state.storage.put('connection', this.config)
                return json({ ok: true })
            }
            if (request.method === 'DELETE') {
                this.config.deleted = true
                await this.state.storage.put('connection', this.config)
                this.bridge?.close(1000, 'MCP connection removed')
                this.disconnect()
                return json({ ok: true })
            }
            return new Response(null, { status: 405 })
        }
        if (path === '/bridge') { return this.openBridge(request) }
        if (path !== '/mcp') { return new Response(null, { status: 404 }) }
        let body
        if (request.method === 'POST') {
            try { body = await readJson(request) } catch (error) { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } }, 400) }
        }
        const agent = mcpAgentIdentity(request, body)
        this.requestIdentities.set(request, agent)
        this.config.agent = agent
        this.bridge?.send(JSON.stringify({ type: 'identity', agent }))
        return this.handler.fetch(request, body === undefined ? undefined : { parsedBody: body })
    }

    openBridge(request) {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') { return new Response('WebSocket required', { status: 426 }) }
        const pair = new WebSocketPair()
        const [client, socket] = Object.values(pair)
        socket.accept()
        let authenticated = false
        const timer = setTimeout(() => { if (!authenticated) { socket.close(1008, 'Browser authentication required') } }, 5000)
        socket.addEventListener('message', event => {
            try {
                if (typeof event.data !== 'string' || event.data.length > limit * 5) { socket.close(1009, 'Invalid bridge message'); return }
                const message = JSON.parse(event.data)
                if (!authenticated) {
                    if (message.type !== 'authenticate' || message.key !== this.config.key) { socket.close(1008, 'Invalid browser control credential'); return }
                    if (this.bridge) { socket.close(1008, 'Another browser window owns this connection'); return }
                    authenticated = true
                    clearTimeout(timer)
                    this.bridge = socket
                    socket.send(JSON.stringify({ type: 'ready', agent: this.config.agent || null }))
                    return
                }
                if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong' })); return }
                if (message.type === 'result' && this.pending.has(message.id)) {
                    const pending = this.pending.get(message.id)
                    this.pending.delete(message.id)
                    pending.cleanup()
                    if (message.error) { pending.reject(new Error(message.error)) } else { pending.resolve(message.result) }
                }
            } catch { socket.close(1008, 'Invalid bridge message') }
        })
        const close = () => {
            clearTimeout(timer)
            if (this.bridge === socket) { this.disconnect() }
        }
        socket.addEventListener('close', close)
        socket.addEventListener('error', close)
        return new Response(null, { status: 101, webSocket: client })
    }

    disconnect() {
        this.bridge = null
        for (const pending of this.pending.values()) { pending.cleanup(); pending.reject(new Error('The browser window disconnected')) }
        this.pending.clear()
    }

    invoke(name, args, agent, signal) {
        if (!this.bridge) { return Promise.reject(new Error('Open the owning Darc window to use this MCP connection')) }
        if (this.pending.size >= 32) { return Promise.reject(new Error('Too many pending MCP requests')) }
        if (signal?.aborted) { return Promise.reject(new Error('MCP request cancelled')) }
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID()
            const cancel = () => {
                if (!this.pending.has(id)) { return }
                this.pending.delete(id)
                cleanup()
                this.bridge?.send(JSON.stringify({ type: 'cancel', id }))
                reject(new Error('MCP request cancelled or timed out'))
            }
            const timer = setTimeout(cancel, 65000)
            const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
            this.pending.set(id, { resolve, reject, cleanup })
            signal?.addEventListener('abort', cancel, { once: true })
            try { this.bridge.send(JSON.stringify({ type: 'call', id, name, args, agent })) } catch { cancel() }
        })
    }
}

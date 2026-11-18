import assert from 'node:assert/strict'
import * as acp from '@agentclientprotocol/sdk/unstable'
import { connectProxy } from '../acp-proxy/bridge.ts'
import { createMcpGateway } from '../acp-proxy/mcp-gateway.ts'
import { createBrowserServer } from '../app/lib/acp-browser-server.js'
import { createMcpConnections } from '../app/lib/mcp-connections.js'
import { mcpFixture } from './mcp-permissions.test.js'
import { mcpServerInstructions } from '../app/lib/mcp-tool-defs.js'

function pair() {
    const a = new TransformStream(), b = new TransformStream()
    return [{ readable: a.readable, writable: b.writable }, { readable: b.readable, writable: a.writable }]
}

async function waitFor(predicate) {
    for (let i = 0; i < 500; i++) {
        if (predicate()) { return }
        await new Promise(resolve => setTimeout(resolve, 5))
    }
    throw new Error('Timed out waiting for MCP permission')
}

for (const native of [true, false]) {
    Deno.test(`ACP proxy ${native ? 'native passthrough' : 'HTTP fallback'} requires saved connections and retains browser permissions and revocation`, async () => {
        const f = await mcpFixture()
        const storage = new Map([['mcpConnections', JSON.stringify([...f.connections.values()].map(entry => ({ ...entry, windowId: 'window' }))) ]])
        const manager = createMcpConnections({ data: f.data, getWindowId: () => 'window', defaultBase: 'https://darc.example',
            storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } })
        let gateway
        const http = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => gateway.fetch(request))
        gateway = createMcpGateway(`http://127.0.0.1:${http.addr.port}`)
        const [browserStream, frontStream] = pair()
        const [proxyStream, backendStream] = pair()
        const proxy = connectProxy(frontStream, proxyStream, gateway)
        const caller = new acp.McpOverAcpCaller({ clientInfo: { name: 'Test agent', version: '1' } })
        let declaration
        const backend = acp.agent()
            .onNotification(acp.methods.agent.mcp.message, caller.handleNotification)
            .onRequest(acp.methods.agent.initialize, () => ({ protocolVersion: 1, agentCapabilities: { mcpCapabilities: { acp: native, http: true } }, agentInfo: { name: 'Test agent', version: '1' } }))
            .onRequest(acp.methods.agent.session.new, ({ params }) => {
                assert.equal(params._meta?.['darc/connections'], undefined)
                declaration = params.mcpServers[0]; return { sessionId: 'test-session' }
            })
            .onRequest(acp.methods.agent.session.load, ({ params }) => {
                assert.equal(params._meta?.['darc/connections'], undefined)
                assert.deepEqual(params.mcpServers[0], declaration)
                return {}
            })
            .connect(backendStream)
        const provider = new acp.McpOverAcpProvider()
        let agentPermission
        const browser = acp.client()
            .onRequest(acp.methods.client.mcp.message, provider.handleRequest)
            .onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
                agentPermission = params
                return { outcome: { outcome: 'selected', optionId: 'opaque-deny' } }
            }).connect(browserStream)
        const browserServer = createBrowserServer({ connection: manager.openAcp('first', { name: 'Test agent', version: '1' }) })
        const registration = provider.registerServer(browser.agent, { name: browserServer.name, handler: browserServer.handler })
        browserServer.signal.addEventListener('abort', () => { void registration.dispose() }, { once: true })
        let serial = 0
        async function httpRpc(url, method, params = {}, signal, headers = {}) {
            const response = await fetch(url, { method: 'POST', signal, headers: {
                'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
                ...headers
            }, body: JSON.stringify({ jsonrpc: '2.0', id: ++serial, method, params }) })
            const text = await response.text()
            return response.headers.get('Content-Type')?.includes('text/event-stream')
                ? text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).find(message => 'result' in message || 'error' in message)
                : JSON.parse(text)
        }
        function rpc(method, params = {}, signal) {
            if (native) { return caller.request(backend.client, declaration.serverId, method, params, { signal }) }
            return httpRpc(declaration.url, method, params, signal, Object.fromEntries(declaration.headers.map(({ name, value }) => [name, value])))
        }
        try {
            const init = await browser.agent.request(acp.methods.agent.initialize, { protocolVersion: 1, clientCapabilities: {} })
            assert.equal(init.agentCapabilities.mcpCapabilities.acp, true)
            await assert.rejects(browser.agent.request(acp.methods.agent.session.new, {
                cwd: '/', mcpServers: [registration.declaration]
            }), /requires its saved connection identity/)
            const params = { cwd: '/', mcpServers: [registration.declaration],
                _meta: { 'darc/connections': { [registration.serverId]: browserServer.proxyIdentity } } }
            const session = await browser.agent.request(acp.methods.agent.session.new, params)
            const fullUrl = session._meta['darc/mcpUrls'][registration.serverId]
            assert.equal(new URL(fullUrl).pathname, '/mcp/first')
            browserServer.setMcpUrl(fullUrl)
            assert.equal(manager.state.connections.find(entry => entry.id === 'first').mcpUrl, fullUrl)
            assert.equal(new URL(fullUrl).search, '')
            await assert.rejects(browser.agent.request(acp.methods.agent.session.load, {
                cwd: '/', sessionId: 'test-session', mcpServers: [registration.declaration]
            }), /requires its saved connection identity/)
            const loaded = await browser.agent.request(acp.methods.agent.session.load, { ...params, sessionId: 'test-session' })
            assert.equal(loaded._meta['darc/mcpUrls'][registration.serverId], fullUrl)
            assert.equal((await httpRpc(fullUrl, 'tools/list')).result.tools.length, 6)
            // Same initialize request as the user's curl probe, with no separate credential.
            const initialized = (await httpRpc(fullUrl, 'initialize', { protocolVersion: '2025-06-18', capabilities: {},
                clientInfo: { name: 'probe', version: '0.0.1' } })).result
            assert.equal(initialized.protocolVersion, '2025-06-18')
            assert.equal(initialized.instructions, mcpServerInstructions)
            assert.equal(declaration.type, native ? 'acp' : 'http')
            const permission = { sessionId: 'test-session', toolCall: { toolCallId: 'external-tool', title: 'Agent action' },
                options: [{ optionId: 'opaque-deny', name: 'Reject', kind: 'reject_once' }] }
            assert.deepEqual(await backend.client.request(acp.methods.client.session.requestPermission, permission),
                { outcome: { outcome: 'selected', optionId: 'opaque-deny' } })
            assert.deepEqual(agentPermission, permission)
            if (!native) {
                assert.deepEqual(declaration.headers, [])
                assert.equal((await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Legacy agent', version: '1' } })).result.protocolVersion, '2025-11-25')
            }
            assert.equal((await rpc('tools/list')).result.tools.length, 6)
            const discovery = native ? await rpc('server/discover') : await httpRpc(fullUrl, 'server/discover', {
                _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                    'io.modelcontextprotocol/clientInfo': { name: 'probe', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} }
            }, undefined,
                { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'server/discover' })
            assert.equal(discovery.result?.instructions, mcpServerInstructions, JSON.stringify(discovery))
            const denied = rpc('tools/call', { name: 'readTabs', arguments: { tabIds: ['one'] } })
            await waitFor(() => f.pending().length === 1)
            const deniedRequest = f.pending()[0]
            await f.data.denyPermission(deniedRequest.requestId)
            assert.equal((await denied).result.isError, true)
            assert.equal(f.data.reads.length, 0)
            await f.store.reset(deniedRequest)
            const allowed = rpc('tools/call', { name: 'readTabs', arguments: { tabIds: ['one'] } })
            await waitFor(() => f.pending().length === 1)
            const request = f.pending()[0]
            assert.equal(request.subject.id, 'first')
            assert.equal(request.scope.requestingOrigin, 'https://darc.example')
            assert.equal(request.agent.name, 'Test agent')
            await f.data.allowPermission(request.requestId, 'always')
            assert.equal(JSON.parse((await allowed).result.content[0].text)[0].tabId, 'one')
            assert.equal((await rpc('tools/call', { name: 'readTabs', arguments: { tabIds: ['one'] } })).result.isError, undefined)
            assert.equal(JSON.parse((await httpRpc(fullUrl, 'tools/call', { name: 'readTabs', arguments: { tabIds: ['one'] } })).result.content[0].text)[0].tabId, 'one')
            const abort = new AbortController()
            const cancelled = rpc('tools/call', { name: 'readTabs', arguments: { tabIds: ['two'] } }, abort.signal).catch(error => error)
            await waitFor(() => f.pending().length === 1)
            abort.abort()
            await cancelled
            await waitFor(() => f.pending().length === 0)
            await manager.remove('first')
            assert.equal(Object.keys(f.data.permissionRules).length, 0)
            const revoked = await rpc('tools/call', { name: 'readTabs', arguments: { tabIds: ['one'] } }).catch(error => error)
            assert(revoked instanceof Error || revoked.error || revoked.result?.isError)
            const revokedUrl = await fetch(fullUrl)
            assert.equal(revokedUrl.status, 404)
            await revokedUrl.text()
            browser.close()
            // Closing a connection cancels its reader; the HTTP transport also closes its writer.
            await browserStream.writable.close()
            await proxy.closed
            const closed = await fetch(fullUrl)
            assert.equal(closed.status, 404)
            await closed.text()
        } finally {
            browser.close(); backend.close()
            await browserStream.writable.close().catch(() => {})
            await browserServer.close()
            await proxy.closed
            await http.shutdown()
        }
    })
}

Deno.test('browser-owned MCP URL survives reload and a stateless proxy restart; removal stays browser-owned', async () => {
    const f = await mcpFixture()
    const storage = new Map([['mcpConnections', JSON.stringify([{ ...f.connections.get('first'), windowId: 'window' }])]])
    let controlOffline = false
    const createManager = () => createMcpConnections({ data: f.data, getWindowId: () => 'window', defaultBase: 'https://darc.example',
        storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        fetcher: (...args) => { if (controlOffline) { throw new TypeError('Proxy unreachable') }; return fetch(...args) } })
    let manager = createManager()
    let gateway
    const http = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => gateway.fetch(request))
    const origin = `http://127.0.0.1:${http.addr.port}`
    gateway = createMcpGateway(origin)
    const runtimes = []
    async function attach() {
        const [browserStream, frontStream] = pair(), [proxyStream, backendStream] = pair()
        const proxy = connectProxy(frontStream, proxyStream, gateway)
        const backend = acp.agent()
            .onRequest(acp.methods.agent.initialize, () => ({ protocolVersion: 1, agentCapabilities: { mcpCapabilities: { http: true } } }))
            .onRequest(acp.methods.agent.session.new, ({ params }) => {
                assert.equal(params._meta?.['darc/connections'], undefined)
                return { sessionId: crypto.randomUUID() }
            }).connect(backendStream)
        const provider = new acp.McpOverAcpProvider()
        const browser = acp.client().onRequest(acp.methods.client.mcp.message, provider.handleRequest).connect(browserStream)
        const server = createBrowserServer({ connection: manager.openAcp('first', { name: 'Test agent' }, `${origin}/acp`) })
        const registration = provider.registerServer(browser.agent, { name: server.name, handler: server.handler })
        server.signal.addEventListener('abort', () => { void registration.dispose() }, { once: true })
        const runtime = { async close() {
            browser.close(); backend.close()
            await browserStream.writable.close().catch(() => {})
            await server.close()
            await proxy.closed
        } }
        runtimes.push(runtime)
        const initialized = await browser.agent.request(acp.methods.agent.initialize, { protocolVersion: 1, clientCapabilities: {} })
        assert.equal(initialized._meta['darc/mcpPersistence'], true)
        const session = await browser.agent.request(acp.methods.agent.session.new, { cwd: '/', mcpServers: [registration.declaration],
            _meta: { 'darc/connections': { [registration.serverId]: server.proxyIdentity } } })
        const url = session._meta['darc/mcpUrls'][registration.serverId]
        server.setMcpUrl(url)
        return { ...runtime, url, identity: server.proxyIdentity }
    }
    async function call(url, name, args = {}) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })
        const body = await response.text()
        return response.headers.get('Content-Type')?.includes('text/event-stream')
            ? body.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).find(message => message.result || message.error)
            : JSON.parse(body)
    }
    async function status(url, expected, options) {
        const response = await fetch(url, options)
        assert.equal(response.status, expected)
        await response.text()
    }
    try {
        const first = await attach()
        assert.equal(first.url, `${origin}/mcp/first`)
        const read = call(first.url, 'readTabs', { tabIds: ['one'] })
        await waitFor(() => f.pending().length === 1)
        await f.data.allowPermission(f.pending()[0].requestId, 'always')
        assert.equal(JSON.parse((await read).result.content[0].text)[0].tabId, 'one')
        await first.close()
        await status(first.url, 503)
        assert.equal(manager.state.connections[0].mcpUrl, first.url)
        assert.equal(manager.state.connections[0].status, 'offline')
        manager = createManager()
        // After restart the stateless proxy learns the saved identity from the browser again.
        gateway = createMcpGateway(origin)
        assert.equal(manager.state.connections[0].mcpUrl, first.url)
         await status(first.url, 503)
        const second = await attach()
        assert.equal(second.url, first.url)
        assert.deepEqual(second.identity, first.identity)
        assert.equal(JSON.parse((await call(first.url, 'readTabs', { tabIds: ['one'] })).result.content[0].text)[0].tabId, 'one')
        assert.equal(f.pending().length, 0)
        const control = new URL(first.url)
        control.search = ''; control.pathname += '/connection'
        await status(control, 401, { method: 'DELETE' })
        await assert.rejects(gateway.expose({}, new acp.McpOverAcpCaller(), { type: 'acp', name: 'impostor', serverId: 'fake' },
            new AbortController().signal, { name: 'impostor', version: '' }, { id: 'first', key: crypto.randomUUID() }), /invalid owner/)
        const pending = call(first.url, 'readTabs', { tabIds: ['two'] }).catch(error => error)
        await waitFor(() => f.pending().length === 1)
        await second.close()
        await pending
        await waitFor(() => f.pending().length === 0)
        assert.equal(f.data.reads.length, 2)
        controlOffline = true
        await manager.remove('first')
        assert.equal(manager.state.connections.length, 0)
        assert.equal(Object.keys(f.data.permissionRules).length, 0)
        assert.equal(storage.has('mcpProxyCredentials:first'), false)
        assert.equal(JSON.parse(storage.get('mcpProxyRevocations')).length, 1)
        controlOffline = false
        manager.start()
        await waitFor(() => JSON.parse(storage.get('mcpProxyRevocations')).length === 0)
        await status(first.url, 404)
         await assert.rejects(gateway.expose({}, new acp.McpOverAcpCaller(), { type: 'acp', name: 'old', serverId: 'fake' },
             new AbortController().signal, { name: 'old', version: '' }, first.identity), /removed/)
        gateway = createMcpGateway(origin)
        await status(first.url, 503)
        manager = createManager()
        assert.equal(manager.state.connections.length, 0)
        assert.throws(() => manager.openAcp('first', { name: 'Test agent' }, `${origin}/acp`), /owned by this window/)
    } finally {
        for (const runtime of runtimes) { await runtime.close() }
        await http.shutdown()
    }
})

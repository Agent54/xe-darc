import assert from 'node:assert/strict'
import * as acp from '@agentclientprotocol/sdk/unstable'
import { connectProxy } from '../acp-proxy/bridge.ts'
import { createMcpGateway } from '../acp-proxy/mcp-gateway.ts'
import { createBrowserServer } from '../app/lib/acp-browser-server.js'
import { createMcpConnections } from '../app/lib/mcp-connections.js'
import { mcpFixture } from './mcp-permissions.test.js'

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
    Deno.test(`ACP proxy ${native ? 'native passthrough' : 'HTTP fallback'} retains browser permissions and revocation`, async () => {
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
            .onRequest(acp.methods.agent.session.new, ({ params }) => { declaration = params.mcpServers[0]; return { sessionId: 'test-session' } })
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
        async function rpc(method, params = {}, signal) {
            if (native) { return caller.request(backend.client, declaration.serverId, method, params, { signal }) }
            const response = await fetch(declaration.url, { method: 'POST', signal, headers: {
                'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
                ...Object.fromEntries(declaration.headers.map(({ name, value }) => [name, value]))
            }, body: JSON.stringify({ jsonrpc: '2.0', id: ++serial, method, params }) })
            const text = await response.text()
            return response.headers.get('Content-Type')?.includes('text/event-stream')
                ? text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).find(message => 'result' in message || 'error' in message)
                : JSON.parse(text)
        }
        try {
            const init = await browser.agent.request(acp.methods.agent.initialize, { protocolVersion: 1, clientCapabilities: {} })
            assert.equal(init.agentCapabilities.mcpCapabilities.acp, true)
            await browser.agent.request(acp.methods.agent.session.new, { cwd: '/', mcpServers: [registration.declaration] })
            assert.equal(declaration.type, native ? 'acp' : 'http')
            const permission = { sessionId: 'test-session', toolCall: { toolCallId: 'external-tool', title: 'Agent action' },
                options: [{ optionId: 'opaque-deny', name: 'Reject', kind: 'reject_once' }] }
            assert.deepEqual(await backend.client.request(acp.methods.client.session.requestPermission, permission),
                { outcome: { outcome: 'selected', optionId: 'opaque-deny' } })
            assert.deepEqual(agentPermission, permission)
            if (!native) {
                const unauthorized = await fetch(declaration.url, { method: 'POST', body: '{}' })
                assert.equal(unauthorized.status, 401)
                await unauthorized.text()
                assert.equal((await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Legacy agent', version: '1' } })).result.protocolVersion, '2025-11-25')
            }
            assert.equal((await rpc('tools/list')).result.tools.length, 9)
            const denied = rpc('tools/call', { name: 'readTab', arguments: { tabId: 'one' } })
            await waitFor(() => f.pending().length === 1)
            const deniedRequest = f.pending()[0]
            await f.data.denyPermission(deniedRequest.requestId)
            assert.equal((await denied).result.isError, true)
            assert.equal(f.data.reads.length, 0)
            await f.store.reset(deniedRequest)
            const allowed = rpc('tools/call', { name: 'readTab', arguments: { tabId: 'one' } })
            await waitFor(() => f.pending().length === 1)
            const request = f.pending()[0]
            assert.equal(request.subject.id, 'first')
            assert.equal(request.scope.requestingOrigin, 'https://darc.example')
            assert.equal(request.agent.name, 'Test agent')
            await f.data.allowPermission(request.requestId, 'always')
            assert.equal(JSON.parse((await allowed).result.content[0].text).tabId, 'one')
            assert.equal((await rpc('tools/call', { name: 'readTab', arguments: { tabId: 'one' } })).result.isError, undefined)
            const abort = new AbortController()
            const cancelled = rpc('tools/call', { name: 'readTab', arguments: { tabId: 'two' } }, abort.signal).catch(error => error)
            await waitFor(() => f.pending().length === 1)
            abort.abort()
            await cancelled
            await waitFor(() => f.pending().length === 0)
            await manager.remove('first')
            assert.equal(Object.keys(f.data.permissionRules).length, 0)
            const revoked = await rpc('tools/call', { name: 'readTab', arguments: { tabId: 'one' } }).catch(error => error)
            assert(revoked instanceof Error || revoked.error || revoked.result?.isError)
            browser.close()
            // Closing a connection cancels its reader; the HTTP transport also closes its writer.
            await browserStream.writable.close()
            await proxy.closed
            if (!native) {
                const closed = await fetch(declaration.url)
                assert.equal(closed.status, 404)
                await closed.text()
            }
        } finally {
            browser.close(); backend.close()
            await browserStream.writable.close().catch(() => {})
            await browserServer.close()
            await proxy.closed
            await http.shutdown()
        }
    })
}

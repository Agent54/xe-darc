import assert from 'node:assert/strict'
import * as acp from '@agentclientprotocol/sdk/unstable'
import { createMcpGateway } from '../acp-proxy/mcp-gateway.ts'
import { createOpenCodeAgent, prepareOpenCode } from '../acp-proxy/opencode.ts'
import { createBrowserServer } from '../app/lib/acp-browser-server.js'

function pair() {
    const a = new TransformStream(), b = new TransformStream()
    return [{ readable: a.readable, writable: b.writable }, { readable: b.readable, writable: a.writable }]
}

Deno.test('OpenCode configuration uses repo-local paths and only the exact browser MCP endpoint', async () => {
    const directory = new URL(`../.cache/opencode-config-${crypto.randomUUID()}/`, import.meta.url)
    try {
        const runtime = prepareOpenCode(directory)
        const before = JSON.parse(await Deno.readTextFile(runtime.env.OPENCODE_CONFIG))
        assert.deepEqual(before.mcp.servers, {})
        const url = 'https://localhost:7331/mcp/browser-connection'
        runtime.configure(url)
        const config = JSON.parse(await Deno.readTextFile(runtime.env.OPENCODE_CONFIG))
        assert.deepEqual(config.mcp.servers, { darc: { type: 'remote', url, oauth: false, codemode: false } })
        assert.deepEqual(config.permissions, [
            { action: '*', resource: '*', effect: 'deny' }, { action: 'darc_*', resource: '*', effect: 'allow' }
        ])
        for (const action of ['skill.use', 'plugin.use', 'websearch.use']) {
            assert(config.policies.some(rule => rule.action === action && rule.resource === '*' && rule.effect === 'deny'))
        }
        assert.equal(config.default_agent, 'browser')
        for (const name of ['build', 'plan', 'general', 'explore']) { assert.equal(config.agents[name].disabled, true) }
        for (const name of ['XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'TMPDIR', 'OPENCODE_TEST_HOME', 'OPENCODE_DB']) {
            assert(runtime.env[name].startsWith(directory.pathname))
        }
        assert.equal(runtime.env.OPENCODE_CONFIG_PROJECT_DISABLE, 'true')
        assert.equal(runtime.env.OPENCODE_DISABLE_CLAUDE_CODE, 'true')
        assert.equal(runtime.env.OPENCODE_FILEWATCHER_DISABLE, 'true')
        assert.equal(prepareOpenCode(directory).env.OPENCODE_DB, runtime.env.OPENCODE_DB)
        assert.deepEqual(JSON.parse(await Deno.readTextFile(runtime.env.OPENCODE_CONFIG)).mcp.servers, {})
    } finally { await Deno.remove(directory, { recursive: true }).catch(() => {}) }
})

Deno.test('installed OpenCode starts only for one ACP connection and discovers the browser MCP server', async () => {
    const directory = new URL(`../.cache/opencode-acp-${crypto.randomUUID()}/`, import.meta.url)
    let gateway
    const requests = []
    const http = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async request => {
        if (request.method === 'POST') { requests.push(await request.clone().json()) }
        return gateway.fetch(request)
    })
    const origin = `http://127.0.0.1:${http.addr.port}`
    gateway = createMcpGateway(origin)
    const agent = createOpenCodeAgent(gateway, directory)
    assert.equal(agent.busy, false)
    await assert.rejects(Deno.stat(directory), Deno.errors.NotFound)
    const [browserStream, frontStream] = pair()
    const provider = new acp.McpOverAcpProvider()
    const browser = acp.client().onRequest(acp.methods.client.mcp.message, provider.handleRequest).connect(browserStream)
    const browserServer = createBrowserServer({ connection: {
        name: 'Browser', reportAgent() {}, close() {}, execute() { throw new Error('This test must not execute browser tools') }
    } })
    const registration = provider.registerServer(browser.agent, { name: browserServer.name, handler: browserServer.handler })
    let runtime
    const timeout = setTimeout(() => browser.close(new Error('OpenCode test timed out')), 90000)
    try {
        runtime = agent.connect(frontStream)
        assert.equal(agent.busy, true)
        assert.throws(() => agent.connect(pair()[0]), /already has an ACP client/)
        const initialized = await browser.agent.request(acp.methods.agent.initialize, { protocolVersion: 1, clientCapabilities: {} })
        assert.equal(initialized.agentCapabilities.mcpCapabilities.acp, true)
        await assert.rejects(browser.agent.request(acp.methods.agent.session.new, { cwd: '/',
            mcpServers: [{ type: 'http', name: 'darc', url: 'https://other.example/mcp', headers: [] }] }), /only the connected browser/)
        const session = await browser.agent.request(acp.methods.agent.session.new, {
            cwd: '/must-not-be-read', additionalDirectories: ['/must-not-be-read'], mcpServers: [registration.declaration],
            _meta: { 'darc/connections': { [registration.serverId]: { id: 'browser-connection', key: crypto.randomUUID() } } }
        })
        assert(session.sessionId)
        assert.equal(session._meta['darc/mcpUrls'][registration.serverId], `${origin}/mcp/browser-connection`)
        const config = JSON.parse(await Deno.readTextFile(new URL('config/opencode/opencode.json', directory)))
        assert.equal(config.mcp.servers.darc.url, `${origin}/mcp/browser-connection`)
        assert(requests.some(request => request.method === 'initialize'))
        assert(requests.some(request => request.method === 'tools/list'))
        assert(!requests.some(request => request.method === 'tools/call'))
        const mode = session.configOptions?.find(option => option.id === 'mode')
        assert.equal(mode?.currentValue, 'browser')
        console.log('Real OpenCode initialized and discovered the browser tools; no model prompt sent')
    } finally {
        clearTimeout(timeout)
        browser.close()
        await browserStream.writable.close().catch(() => {})
        await runtime?.closed
        await browserServer.close()
        assert.equal(agent.busy, false)
        await http.shutdown()
        await Deno.remove(directory, { recursive: true }).catch(() => {})
    }
})

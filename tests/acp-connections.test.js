import assert from 'node:assert/strict'
import { createAgentConnections } from '../app/lib/agent-connections.js'
import { createAgentClient } from '../app/lib/acp-client.js'
import { createBrowserServer } from '../app/lib/acp-browser-server.js'
import { createMcpConnections } from '../app/lib/mcp-connections.js'
import { readAcpConnections, exportableStorage } from '../app/lib/acp-settings.js'
import { memoryStorage, mockEndpoint, until } from './acp.test.js'
import { mcpFixture } from './mcp-permissions.test.js'

Deno.test('ACP profiles reuse MCP identities and grants, keep separate live sessions, and restore both after reload', async () => {
    const firstHost = await mockEndpoint(), secondHost = await mockEndpoint()
    const f = await mcpFixture()
    const oldIdentity = { ...f.connections.get('first'), windowId: 'window' }
    const storage = memoryStorage({
        mcpConnections: JSON.stringify([oldIdentity]),
        acpConnection: JSON.stringify({ endpoint: firstHost.endpoint, cwd: '/project', mcpConnectionId: 'first' }),
        acpBearerToken: 'first-secret',
        'acpConversations:window': JSON.stringify({ conversations: [{ id: 'old-chat', title: 'Existing chat', messages: [], sessionId: null }], activeConversationId: 'old-chat', queue: [], wantConnection: false })
    })
    const read = f.call('first', 'readTabs', { tabIds: ['one'] })
    await until(() => f.pending().length === 1)
    await f.data.allowPermission(f.pending()[0].requestId, 'always')
    await read
    const grants = Object.keys(f.data.permissionRules)
    const removed = []
    const mcp = createMcpConnections({ data: f.data, storage, getWindowId: () => 'window', defaultBase: 'https://darc.example',
        fetcher: request => { removed.push(String(request)); return Promise.resolve(new Response(null, { status: 204 })) } })
    const options = { storage, session: memoryStorage(), getWindowId: () => 'window', mcp,
        createClient: options => createAgentClient({ ...options, reconnectDelay: 10 }),
        createBrowserServer: (settings, agentInfo) => createBrowserServer({ connection: mcp.openAcp(settings.id, agentInfo, settings.endpoint) }) }
    let agents = createAgentConnections(options)
    try {
        agents.start()
        assert.equal(agents.state.connectionId, 'first')
        assert.equal(agents.state.activeConversationId, 'old-chat')
        assert.equal(storage.getItem('acpConnection'), null)
        assert.equal(storage.getItem('acpBearerToken'), null)
        assert.equal(readAcpConnections(storage, options.session, 'window')[0].token, undefined)
        assert.equal(JSON.parse(storage.getItem('mcpConnections'))[0].endpoint, oldIdentity.endpoint)
        assert.deepEqual(Object.keys(f.data.permissionRules), grants)
        await agents.submit('first conversation', {})
        const firstSession = agents.state.conversations[0].sessionId
        assert.equal(mcp.state.connections[0].mcpUrl, 'https://proxy.example/mcp/first')
        const access = mcp.openAcp('first', { name: 'First agent' }, firstHost.endpoint)
        try {
            assert.equal((await access.execute({ name: 'readTabs', args: { tabIds: ['one'] } }))[0].tabId, 'one')
            assert.equal(f.pending().length, 0)
        } finally { access.close() }

        const second = agents.saveConnection({ title: 'Second agent', description: '', endpoint: secondHost.endpoint, cwd: '/second' })
        assert.notEqual(second.id, 'first')
        assert.equal(second.id, second.mcpConnectionId)
        await agents.submit('second conversation', {})
        const secondSession = agents.state.conversations[0].sessionId
        assert.notEqual(secondSession, firstSession)
        assert(mcp.state.connections.every(entry => entry.status === 'connected'))
        assert.equal(mcp.state.connections.find(entry => entry.id === second.id).mcpUrl, `https://proxy.example/mcp/${second.id}`)
        assert(firstHost.headers.every(entry => entry.auth === null))
        assert(secondHost.headers.every(entry => entry.auth === null))
        assert(!JSON.stringify(exportableStorage(storage)).includes('secret'))
        agents.selectConnection('first')
        assert.equal(agents.state.status, 'connected')
        assert.equal(agents.state.conversations[0].sessionId, firstSession)
        assert(!agents.state.conversations.some(chat => chat.sessionId === secondSession))
        assert.equal(firstHost.loads.length, 0)
        assert.equal(firstHost.headers.filter(entry => entry.method === 'DELETE').length, 0)

        agents.suspend()
        agents = createAgentConnections(options)
        agents.start()
        await until(() => agents.state.status === 'connected' && secondHost.loads.length === 1)
        assert.equal(agents.state.conversations[0].sessionId, firstSession)
        assert(mcp.state.connections.every(entry => entry.status === 'connected'))
        agents.selectConnection(second.id)
        assert.equal(agents.state.conversations[0].sessionId, secondSession)
        assert.deepEqual(firstHost.prompts, ['first conversation'])
        assert.deepEqual(secondHost.prompts, ['second conversation'])
        await agents.removeConnection('first')
        assert.equal(agents.state.connectionId, second.id)
        assert.equal(agents.state.status, 'connected')
        assert.equal(storage.getItem('acpBearerToken:first'), null)
        assert.equal(storage.getItem('acpConversations:window:first'), null)
        assert.deepEqual(Object.keys(f.data.permissionRules), [])
        assert.equal(removed.length, 1)
        assert(removed[0].endsWith('/mcp/first/connection'))
        assert.deepEqual(readAcpConnections(storage, options.session, 'other-window'), [])
    } finally {
        agents.suspend()
        mcp.stop()
        await firstHost.close()
        await secondHost.close()
    }
})

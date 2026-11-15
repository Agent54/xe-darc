import assert from 'node:assert/strict'
import * as acp from '@agentclientprotocol/sdk/unstable'
import { AcpServer } from '@agentclientprotocol/sdk/experimental/server'
import { createAgentClient } from '../app/lib/acp-client.js'
import { createBrowserServer } from '../app/lib/acp-browser-server.js'
import { pageContentScript } from '../app/lib/page-content.js'
import { clearProviderSettings, readAcpModelPreference, readAcpSettings, saveAcpSettings, exportableStorage, validateAcpSettings } from '../app/lib/acp-settings.js'

export function memoryStorage(initial = {}) {
    const values = { ...initial }
    return Object.assign(values, {
        getItem: Object.assign(key => values[key] ?? null, {}),
        setItem(key, value) { values[key] = String(value) },
        removeItem(key) { delete values[key] }
    })
}

export function browserData() {
    const docs = {
        page: { id: 'page', type: 'tab', title: 'Original page', url: 'https://example.com', spaceId: 'space' },
        other: { id: 'other', type: 'tab', title: 'Other page', url: 'https://other.example', spaceId: 'other-space' }
    }
    return {
        docs, spaces: { space: {}, 'other-space': {} }, spaceMeta: { activeSpace: 'space', activeTabId: 'page' },
        reads: [], created: [],
        activateSpace(id) { this.spaceMeta.activeSpace = id },
        activate(id) { this.spaceMeta.activeTabId = id },
        async readPage(id, options) { this.reads.push({ id, options }); return 'Real page content' },
        async newTab(spaceId, options) {
            const tab = { id: `new-${this.created.length}`, type: 'tab', spaceId, ...options }
            this.created.push(tab)
            this.docs[tab.id] = tab
            return tab
        }
    }
}

export async function until(predicate, message = 'Condition timed out') {
    const deadline = Date.now() + 5000
    while (!predicate()) {
        if (Date.now() > deadline) { throw new Error(message) }
        await new Promise(resolve => setTimeout(resolve, 5))
    }
}

export async function mockEndpoint({ acpMcp = true, loadSession = true, beforeSessionResponse, afterFirstChunk, afterDocumentChunk } = {}) {
    const sessions = new Map()
    const sessionConfigs = new Map()
    const prompts = []
    const loads = []
    const calls = []
    const headers = []
    const pendingTurns = new Map()
    const releaseTurns = new Set()
    let lastClient = null
    const config = [
        { id: 'model', name: 'Agent model', category: 'model', type: 'select', currentValue: 'fast', options: [
            { group: 'recommended', name: 'Recommended', options: [{ value: 'fast', name: 'Claude Haiku' }, { value: 'deep', name: 'OpenAI O3' }] }
        ] },
        { id: 'fastMode', name: 'Fast mode', type: 'boolean', currentValue: false },
        { id: 'effort', name: 'Thinking effort', category: 'thought_level', type: 'select', currentValue: 'medium', options: [
            { value: 'medium', name: 'Medium' }, { value: 'high', name: 'High' }
        ] },
        { id: 'mode', name: 'Mode', category: 'mode', type: 'select', currentValue: 'ask', options: [
            { value: 'ask', name: 'Ask' }, { value: 'code', name: 'Code' }
        ] }
    ]
    const app = acp.agent({ name: 'mock-agent', version: '1' })
        .onRequest(acp.methods.agent.initialize, ({ params }) => {
            assert.equal(params.protocolVersion, 1)
            assert(!params.clientCapabilities.fs?.readTextFile)
            assert(!params.clientCapabilities.fs?.writeTextFile)
            assert(!params.clientCapabilities.terminal)
            assert.deepEqual(params.clientCapabilities.session.configOptions.boolean, {})
            return { protocolVersion: 1, agentCapabilities: { loadSession, mcpCapabilities: { acp: acpMcp } }, agentInfo: { name: 'Mock agent', version: '1' }, _meta: { 'darc/mcpPersistence': true } }
        })
        .onRequest(acp.methods.agent.session.new, async ({ params, client }) => {
            for (const server of params.mcpServers.filter(server => server.type === 'acp')) {
                const identity = params._meta['darc/connections'][server.serverId]
                assert.equal(typeof identity.id, 'string')
                assert.equal(typeof identity.key, 'string')
                const tools = await new acp.McpOverAcpCaller().request(client, server.serverId, 'tools/list')
                assert.equal(tools.result.tools.length, 9)
            }
            const sessionId = crypto.randomUUID()
            sessions.set(sessionId, params)
            sessionConfigs.set(sessionId, config)
            lastClient = client
            await beforeSessionResponse?.({ sessionId, client })
            return { sessionId, configOptions: config, _meta: { 'darc/mcpUrls': Object.fromEntries(params.mcpServers
                .filter(server => server.type === 'acp').map(server => [server.serverId, `https://proxy.example/mcp/${params._meta['darc/connections'][server.serverId].id}`])) } }
        })
        .onRequest(acp.methods.agent.session.load, async ({ params, client }) => {
            assert(sessions.has(params.sessionId))
            loads.push(params.sessionId)
            sessions.set(params.sessionId, params)
            lastClient = client
            await client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Replay should not duplicate' } } })
            return { configOptions: sessionConfigs.get(params.sessionId) }
        })
        .onRequest(acp.methods.agent.session.setConfigOption, ({ params }) => {
            const configOptions = sessionConfigs.get(params.sessionId).map(option =>
                option.id === params.configId ? { ...option, currentValue: params.value } : option
            )
            sessionConfigs.set(params.sessionId, configOptions)
            return { configOptions }
        })
        .onNotification(acp.methods.agent.session.cancel, ({ params }) => pendingTurns.get(params.sessionId)?.())
        .onRequest(acp.methods.agent.session.prompt, async ({ params, client }) => {
            const text = params.prompt.at(-1).text
            assert.deepEqual(params.prompt, [{ type: 'text', text }], 'Prompts must not inject browser context')
            prompts.push(text)
            const sessionId = params.sessionId
            const send = update => client.notify(acp.methods.client.session.update, { sessionId, update })
            if (text === 'wait' || text === 'ignore-cancel') {
                await new Promise(resolve => { releaseTurns.add(resolve); pendingTurns.set(sessionId, text === 'wait' ? resolve : () => {}) })
                pendingTurns.delete(sessionId)
                return { stopReason: 'cancelled' }
            }
            if (text === 'permission') {
                const result = await client.request(acp.methods.client.session.requestPermission, {
                    sessionId, toolCall: { toolCallId: 'permission-tool', title: 'Approve external tool' },
                    options: [{ optionId: 'opaque-deny-42', name: 'Reject', kind: 'reject_once' }, { optionId: 'opaque-allow-83', name: 'Proceed', kind: 'allow_once' }]
                })
                calls.push({ name: 'permission', result })
            }
            if (text === 'long reply') {
                await send({ sessionUpdate: 'agent_message_chunk', messageId: 'long-document', content: { type: 'text', text: '# Analysis\n\nA **' } })
                await afterFirstChunk?.(text)
                await send({ sessionUpdate: 'tool_call', toolCallId: 'document-tool', title: 'Gather document context', kind: 'read', status: 'completed' })
                const body = 'streamed reply**\n\n' + Array.from({ length: 17 }, (_, i) => `- Point ${i + 1}\n`).join('')
                await send({ sessionUpdate: 'agent_message_chunk', messageId: 'long-document', content: { type: 'text', text: body } })
                await afterDocumentChunk?.()
                await send({ sessionUpdate: 'agent_message_chunk', messageId: 'document-follow-up', content: { type: 'text', text: 'Separate reply' } })
                return { stopReason: 'end_turn', usage: { inputTokens: 120, outputTokens: 45, totalTokens: 165 } }
            }
            await send({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello **' } })
            await afterFirstChunk?.(text)
            await send({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ACP**' } })
            await send({ sessionUpdate: 'tool_call', toolCallId: 'status-tool', title: 'External tool', kind: 'other', status: 'in_progress', content: [] })
            await send({ sessionUpdate: 'tool_call_update', toolCallId: 'status-tool', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'Tool finished' } }] })
            await send({ sessionUpdate: 'plan', entries: [{ content: 'Connected', priority: 'medium', status: 'completed' }] })
            return { stopReason: 'end_turn' }
        })
    let transport = new AcpServer({ agent: app })
    const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async request => {
        headers.push({ method: request.method, auth: request.headers.get('Authorization') })
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: {
                'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Acp-Connection-Id, Acp-Session-Id'
            } })
        }
        const response = transport ? await transport.handleRequest(request) : new Response('Backend restarting', { status: 503 })
        const responseHeaders = new Headers(response.headers)
        responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*')
        responseHeaders.set('Access-Control-Allow-Credentials', 'true')
        responseHeaders.set('Access-Control-Expose-Headers', 'Acp-Connection-Id, Acp-Session-Id')
        return new Response(response.body, { status: response.status, headers: responseHeaders })
    })
    return {
        endpoint: `http://127.0.0.1:${server.addr.port}/acp`, prompts, calls, sessions, headers, loads,
        async stopBackend() {
            const closing = transport?.close()
            transport = null
            for (const release of releaseTurns) { release() }
            releaseTurns.clear()
            await closing
        },
        restartBackend() { transport = new AcpServer({ agent: app }) },
        async close() { await this.stopBackend(); await server.shutdown() },
        async notify(sessionId, update) { await lastClient.notify(acp.methods.client.session.update, { sessionId, update }) }
    }
}

async function run() {
    globalThis.window = { darcWindowId: 'acp-test-window' }
    const local = memoryStorage({ selectedAiProvider: 'anthropic', aiToken_anthropic: 'old-secret', selectedModel: 'old-model' })
    const session = memoryStorage()
    clearProviderSettings(local)
    assert.equal(local.getItem('aiToken_anthropic'), null)
    assert.equal(local.getItem('selectedModel'), 'old-model')
    const saved = saveAcpSettings({ endpoint: 'https://agent.example/acp', cwd: '/project' }, local, session)
    local.setItem(`acpBearerToken:${saved.id}`, 'unused-secret')
    assert.equal(readAcpSettings(local, session).token, undefined)
    assert.equal(readAcpSettings(local, memoryStorage()).token, undefined)
    assert.equal(session.getItem('acpBearerToken'), null)
    assert(!JSON.stringify(exportableStorage(local)).includes('secret'))
    local.setItem('mcpBridgeKey:connection', 'private-browser-secret')
    assert(!JSON.stringify(exportableStorage(local)).includes('private-browser-secret'))
    local.setItem('mcpProxyCredentials:connection', '{"key":"owner-secret","url":"https://proxy/mcp/id?token=tool-secret"}')
    local.setItem('mcpProxyRevocations', '[{"key":"owner-secret"}]')
    local.setItem('acpConversations:window', '{"messages":["private-conversation-secret"]}')
    assert(!JSON.stringify(exportableStorage(local)).includes('secret'))
    const migrated = memoryStorage()
    const oldSession = memoryStorage({ acpBearerToken: 'legacy-token' })
    assert.equal(readAcpSettings(migrated, oldSession).token, undefined)
    assert.equal(readAcpSettings(migrated, memoryStorage()).token, undefined)
    saveAcpSettings({ endpoint: '', cwd: '/' }, migrated, oldSession)
    assert.equal(oldSession.getItem('acpBearerToken'), null)
    assert.throws(() => validateAcpSettings({ endpoint: 'ws://agent.example', cwd: '/' }))
    assert.throws(() => validateAcpSettings({ endpoint: 'https://user:secret@agent.example', cwd: '/' }))
    assert.throws(() => validateAcpSettings({ endpoint: 'https://agent.example', cwd: 'relative' }))

    const script = pageContentScript({ selector: '//p[contains(., "quoted")]' })
    assert(script.includes('document.evaluate'))
    new Function(script)

    const host = await mockEndpoint()
    const browserUrls = []
    const clientOptions = {
        getSettings: () => ({ endpoint: host.endpoint, cwd: '/project', token: 'connection-secret', mcpConnectionId: 'identity' }),
        createBrowserServer: () => createBrowserServer({ connection: { name: 'darc', proxyIdentity: { id: 'identity', key: 'owner-key' }, reportAgent() {}, close() {}, setMcpUrl: url => browserUrls.push(url), execute() { throw new Error('Unexpected tool call') } } }),
        modelStorage: local,
        setupTimeout: 2000, cancelTimeout: 100
    }
    const client = createAgentClient(clientOptions)
    try {
        client.configure()
        assert.equal(client.state.queuePaused, false)
        await client.connect()
        assert.equal(client.state.agentName, 'Mock agent')
        await Promise.all([client.prepareConversation(), client.submit('hello')])
        assert.equal(host.sessions.size, 1)
        const chatId = client.state.activeConversationId
        const chat = () => client.state.conversations.find(chat => chat.id === chatId)
        assert.equal(chat().messages.find(message => message.role === 'assistant').content, 'Hello **ACP**')
        assert.equal(chat().messages.find(message => message.toolCallId === 'status-tool').status, 'completed')
        assert.equal(chat().plan[0].status, 'completed')
        assert(host.headers.every(header => header.auth === null))
        assert.equal([...host.sessions.values()][0].cwd, '/project')
        assert.equal([...host.sessions.values()][0].mcpServers[0].type, 'acp')
        assert.deepEqual(browserUrls, ['https://proxy.example/mcp/identity'])
        assert.equal(chat().configOptions[0].currentValue, 'fast')
        await client.setConfig('model', 'deep')
        assert.equal(chat().configOptions[0].currentValue, 'deep')
        assert.equal(readAcpModelPreference(host.endpoint, local), 'deep')
        assert.equal(readAcpModelPreference('https://other-agent.example/acp', local), null)

        const permission = client.submit('permission')
        await until(() => client.state.approvals.length > 0)
        client.answer(client.state.approvals[0].id, 'opaque-allow-83')
        await permission
        assert.equal(host.calls.at(-1).result.outcome.optionId, 'opaque-allow-83')
        assert.equal(chat().messages.find(message => message.role === 'approval').status, 'approved')
        assert.equal(client.state.approvals.length, 0)

        const waiting = client.submit('wait')
        await until(() => host.prompts.at(-1) === 'wait')
        const queued = client.submit('queued')
        assert.equal(client.state.queue.length, 1)
        await new Promise(resolve => setTimeout(resolve, 20))
        assert.equal(host.prompts.at(-1), 'wait')
        client.stop()
        await waiting
        await queued
        assert.equal(client.state.queuePaused, true)
        await client.resumeQueue()
        assert.equal(host.prompts.at(-1), 'queued')

        const before = chat().messages.length
        client.disconnect()
        await client.submit('after reconnect')
        assert(!chat().messages.some(message => message.content.includes('Replay should not duplicate')))
        assert(chat().messages.length > before)

        const lost = client.submit('wait')
        await until(() => host.prompts.at(-1) === 'wait')
        client.disconnect()
        await lost
        const count = host.prompts.length
        await client.connect()
        assert.equal(host.prompts.length, count)

        const restarted = createAgentClient(clientOptions)
        try {
            await restarted.submit('first prompt after restart')
            const [newChat] = restarted.state.conversations
            assert.equal(newChat.configOptions[0].currentValue, 'deep')
            assert.equal(newChat.messages.find(message => message.role === 'assistant').model, 'deep')
        } finally {
            restarted.disconnect()
        }
    } finally {
        client.disconnect()
        await host.close()
    }

    const recoverable = await mockEndpoint()
    const conversations = memoryStorage()
    const options = { ...clientOptions, conversationStorage: conversations, getConversationKey: () => 'acpConversations:window',
        getSettings: () => ({ endpoint: recoverable.endpoint, cwd: '/project', mcpConnectionId: 'identity' }),
        reconnectDelay: 10 }
    let recovering = createAgentClient(options)
    try {
        await recovering.submit('keep this conversation')
        await recovering.setConfig('model', 'deep')
        const original = recovering.state.conversations[0]
        const interrupted = recovering.submit('wait')
        await until(() => recoverable.prompts.at(-1) === 'wait')
        await recovering.submit('keep this queued')
        await recoverable.stopBackend()
        await interrupted
        await until(() => recovering.state.status !== 'connected')
        const requests = recoverable.headers.length
        await until(() => recoverable.headers.length > requests, 'The browser did not retry the unavailable backend')
        recoverable.restartBackend()
        await until(() => recovering.state.status === 'connected')
        assert(recoverable.loads.includes(original.sessionId))
        assert.equal(recoverable.sessions.size, 1)
        assert.deepEqual(recoverable.prompts, ['keep this conversation', 'wait'])
        assert.equal(recovering.state.queuePaused, true)
        assert.equal(recovering.state.queue[0].text, 'keep this queued')
        assert(!recovering.state.conversations[0].messages.some(message => message.content.includes('Replay should not duplicate')))
        assert.equal(recovering.state.conversations[0].configOptions[0].currentValue, 'deep')

        recovering.suspend()
        const saved = JSON.parse(conversations.getItem('acpConversations:window'))
        assert.equal(saved.wantConnection, true)
        assert.equal(saved.conversations[0].sessionId, original.sessionId)
        const loads = recoverable.loads.length
        recovering = createAgentClient(options)
        recovering.start()
        assert.equal(recovering.state.activeConversationId, original.id)
        await until(() => recovering.state.status === 'connected')
        assert.equal(recoverable.loads.length, loads + 1)
        assert.equal(recoverable.sessions.size, 1)
        assert.equal(recovering.state.conversations[0].sessionId, original.sessionId)
        assert.equal(recovering.state.queuePaused, true)
        assert.deepEqual(recoverable.prompts, ['keep this conversation', 'wait'])
        await recovering.resumeQueue()
        assert.equal(recoverable.prompts.at(-1), 'keep this queued')
        recovering.disconnect()
        assert.equal(JSON.parse(conversations.getItem('acpConversations:window')).wantConnection, false)
        const disconnected = createAgentClient(options)
        disconnected.start()
        assert.equal(disconnected.state.status, 'disconnected')
        assert.equal(disconnected.state.conversations[0].sessionId, original.sessionId)
        disconnected.disconnect()
        const otherWindow = createAgentClient({ ...options, getConversationKey: () => 'acpConversations:other-window' })
        otherWindow.start()
        assert.equal(otherWindow.state.conversations.length, 0)
        assert.equal(otherWindow.state.connectionRequested, false)
        otherWindow.disconnect()
    } finally {
        recovering.disconnect()
        await recoverable.close()
    }

    const limited = await mockEndpoint({ acpMcp: false, loadSession: false })
    const legacy = memoryStorage({ selectedModel: 'deep' })
    const limitedClient = createAgentClient({ getSettings: () => ({ id: 'chat-only', endpoint: limited.endpoint, cwd: '/' }), modelStorage: legacy,
        createBrowserServer() { throw new Error('An agent without MCP support must still be able to chat') } })
    try {
        await limitedClient.submit('chat only')
        assert.deepEqual([...limited.sessions.values()][0].mcpServers, [])
        assert.equal(limitedClient.state.conversations[0].configOptions[0].currentValue, 'deep')
        assert.equal(legacy.getItem('selectedModel'), null)
        assert.equal(readAcpModelPreference(limited.endpoint, legacy), 'deep')
        limitedClient.disconnect()
        await limitedClient.submit('cannot resume')
        assert(limitedClient.state.error.includes('Start a new conversation'))
        assert.equal(limited.prompts.length, 1)
    } finally {
        limitedClient.disconnect()
        await limited.close()
    }
    console.log('ACP HTTP, MCP-over-ACP, permissions, browser persistence, backend restart recovery, queue, and cancellation tests passed')
}

if (import.meta.main) {
    await run()
}

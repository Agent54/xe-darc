import assert from 'node:assert/strict'
import * as acp from '@agentclientprotocol/sdk/unstable'
import { AcpServer } from '@agentclientprotocol/sdk/experimental/server'
import { createAgentClient } from '../app/lib/acp-client.js'
import { createBrowserServer } from '../app/lib/acp-browser-server.js'
import { captureAgentContext, prepareBrowserTool } from '../app/lib/agent-browser-tools.js'
import { pageContentScript } from '../app/lib/page-content.js'
import { clearProviderSettings, readAcpSettings, saveAcpSettings, exportableStorage, validateAcpSettings } from '../app/lib/acp-settings.js'

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

export async function mockEndpoint({ browserTools = true, loadSession = true } = {}) {
    const sessions = new Map()
    const prompts = []
    const calls = []
    const headers = []
    const caller = new acp.McpOverAcpCaller({ clientInfo: { name: 'mock-agent', version: '1' } })
    const pendingTurns = new Map()
    const releaseTurns = new Set()
    let lastClient = null
    const config = [{ id: 'model', name: 'Agent model', type: 'select', currentValue: 'fast', options: [{ value: 'fast', name: 'Fast' }, { value: 'deep', name: 'Deep' }] }]
    const app = acp.agent({ name: 'mock-agent', version: '1' })
        .onNotification(acp.methods.agent.mcp.message, caller.handleNotification)
        .onRequest(acp.methods.agent.initialize, ({ params }) => {
            assert.equal(params.protocolVersion, 1)
            assert(!params.clientCapabilities.fs?.readTextFile)
            assert(!params.clientCapabilities.fs?.writeTextFile)
            assert(!params.clientCapabilities.terminal)
            return { protocolVersion: 1, agentCapabilities: { loadSession, mcpCapabilities: { acp: browserTools } }, agentInfo: { name: 'Mock agent', version: '1' } }
        })
        .onRequest(acp.methods.agent.session.new, ({ params, client }) => {
            const sessionId = crypto.randomUUID()
            sessions.set(sessionId, params)
            lastClient = client
            return { sessionId, configOptions: config }
        })
        .onRequest(acp.methods.agent.session.load, async ({ params, client }) => {
            assert(sessions.has(params.sessionId))
            sessions.set(params.sessionId, params)
            lastClient = client
            await client.notify(acp.methods.client.session.update, { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Replay should not duplicate' } } })
            return { configOptions: config }
        })
        .onRequest(acp.methods.agent.session.setConfigOption, ({ params }) => ({ configOptions: config.map(option => ({ ...option, currentValue: params.value })) }))
        .onNotification(acp.methods.agent.session.cancel, ({ params }) => pendingTurns.get(params.sessionId)?.())
        .onRequest(acp.methods.agent.session.prompt, async ({ params, client }) => {
            const text = params.prompt.at(-1).text
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
            if (text.startsWith('tool:')) {
                const [name, args] = JSON.parse(text.slice(5))
                const declaration = sessions.get(sessionId).mcpServers[0]
                const result = await caller.request(client, declaration.serverId, 'tools/call', { name, arguments: args })
                calls.push({ name, result })
            }
            if (text === 'discover') {
                const declaration = sessions.get(sessionId).mcpServers[0]
                const result = await caller.request(client, declaration.serverId, 'tools/list', {})
                calls.push({ name: 'discover', result })
            }
            await send({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello ' } })
            await send({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '**ACP**' } })
            await send({ sessionUpdate: 'tool_call', toolCallId: 'status-tool', title: 'External tool', kind: 'other', status: 'in_progress', content: [] })
            await send({ sessionUpdate: 'tool_call_update', toolCallId: 'status-tool', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'Tool finished' } }] })
            await send({ sessionUpdate: 'plan', entries: [{ content: 'Connected', priority: 'medium', status: 'completed' }] })
            return { stopReason: 'end_turn' }
        })
    const transport = new AcpServer({ agent: app })
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
        const response = await transport.handleRequest(request)
        const responseHeaders = new Headers(response.headers)
        responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*')
        responseHeaders.set('Access-Control-Allow-Credentials', 'true')
        responseHeaders.set('Access-Control-Expose-Headers', 'Acp-Connection-Id, Acp-Session-Id')
        return new Response(response.body, { status: response.status, headers: responseHeaders })
    })
    return {
        endpoint: `http://127.0.0.1:${server.addr.port}/acp`, prompts, calls, sessions, headers,
        async close() { for (const release of releaseTurns) { release() }; await transport.close(); await server.shutdown() },
        async notify(sessionId, update) { await lastClient.notify(acp.methods.client.session.update, { sessionId, update }) }
    }
}

async function run() {
    const local = memoryStorage({ selectedAiProvider: 'anthropic', aiToken_anthropic: 'old-secret', selectedModel: 'old-model' })
    const session = memoryStorage()
    clearProviderSettings(local)
    assert.equal(local.getItem('aiToken_anthropic'), null)
    saveAcpSettings({ endpoint: 'https://agent.example/acp', cwd: '/project', token: 'connection-secret' }, local, session)
    assert.equal(readAcpSettings(local, session).token, 'connection-secret')
    assert(!JSON.stringify(exportableStorage(local)).includes('secret'))
    assert.throws(() => validateAcpSettings({ endpoint: 'ws://agent.example', cwd: '/', token: '' }))
    assert.throws(() => validateAcpSettings({ endpoint: 'https://user:secret@agent.example', cwd: '/', token: '' }))
    assert.throws(() => validateAcpSettings({ endpoint: 'https://agent.example', cwd: 'relative', token: '' }))

    const data = browserData()
    const context = captureAgentContext(data)
    assert.deepEqual(context.tabs.map(tab => tab.id), ['page'])
    assert.throws(() => prepareBrowserTool(data, context, 'readPageContent', { tabId: 'other' }), /outside/)
    const read = prepareBrowserTool(data, context, 'readPageContent')
    data.docs.page.url = 'https://changed.example'
    await assert.rejects(read.execute(), /navigated/)
    data.docs.page.url = context.tabs[0].url
    assert.throws(() => prepareBrowserTool(data, context, 'openNewTab', { url: 'javascript:alert(1)' }), /HTTP/)
    const script = pageContentScript({ selector: '//p[contains(., "quoted")]' })
    assert(script.includes('document.evaluate'))
    new Function(script)

    const host = await mockEndpoint()
    const client = createAgentClient({
        getSettings: () => ({ endpoint: host.endpoint, cwd: '/project', token: 'connection-secret' }),
        createBrowserServer: options => createBrowserServer({ data, ...options }),
        setupTimeout: 2000, cancelTimeout: 100
    })
    try {
        await client.connect()
        assert.equal(client.state.browserTools, true)
        assert.equal(client.state.agentName, 'Mock agent')
        await client.submit('hello', context)
        const chatId = client.state.activeConversationId
        const chat = () => client.state.conversations.find(chat => chat.id === chatId)
        assert.equal(chat().messages.find(message => message.role === 'assistant').content, 'Hello **ACP**')
        assert.equal(chat().messages.find(message => message.toolCallId === 'status-tool').status, 'completed')
        assert.equal(chat().plan[0].status, 'completed')
        assert(host.headers.every(header => header.auth === 'Bearer connection-secret'))
        assert.equal([...host.sessions.values()][0].cwd, '/project')
        await client.setConfig('model', 'deep')
        assert.equal(chat().configOptions[0].currentValue, 'deep')

        const permission = client.submit('permission', context)
        await until(() => client.state.approvals.length > 0)
        client.answer(client.state.approvals[0].id, 'opaque-allow-83')
        await permission
        assert.equal(host.calls.at(-1).result.outcome.optionId, 'opaque-allow-83')

        await client.submit('discover', context)
        assert.deepEqual(host.calls.at(-1).result.result.tools.map(tool => tool.name).sort(), ['displayHtml', 'listTabs', 'openNewTab', 'readPageContent'])
        await client.submit('tool:["listTabs",{}]', context)
        assert.equal(JSON.parse(host.calls.at(-1).result.result.content[0].text)[0].id, 'page')

        for (const [name, args] of [['readPageContent', { selector: '//p', textOnly: false }], ['openNewTab', { url: 'https://new.example' }], ['displayHtml', { html: '<h1>Created</h1>', title: 'Created page' }]]) {
            const turn = client.submit(`tool:${JSON.stringify([name, args])}`, context)
            await until(() => client.state.approvals.length > 0, `Missing approval for ${name}`)
            data.spaceMeta.activeTabId = 'other'
            data.spaceMeta.activeSpace = 'other-space'
            client.answer(client.state.approvals[0].id, 'allow')
            await turn
            assert.equal(host.calls.at(-1).result.result.isError, undefined)
        }
        assert.equal(data.reads[0].id, 'page')
        assert.equal(data.reads[0].options.selector, '//p')
        assert.equal(data.created.length, 2)
        assert(data.created.every(tab => tab.spaceId === 'space' && tab.shouldFocus))
        assert(data.created[1].url.startsWith('data:text/html'))

        const denied = client.submit('tool:["openNewTab",{}]', context)
        await until(() => client.state.approvals.length > 0)
        client.answer(client.state.approvals[0].id, 'deny')
        await denied
        assert.equal(data.created.length, 2)
        assert.equal(host.calls.at(-1).result.result.isError, true)

        const stale = client.submit('tool:["readPageContent",{}]', context)
        await until(() => client.state.approvals.length > 0)
        data.docs.page.url = 'https://navigated.example'
        client.answer(client.state.approvals[0].id, 'allow')
        await stale
        assert.equal(data.reads.length, 1)
        assert.equal(host.calls.at(-1).result.result.isError, true)
        data.docs.page.url = context.tabs[0].url

        const cancelledApproval = client.submit('tool:["displayHtml",{"html":"<p>Do not create</p>"}]', context)
        await until(() => client.state.approvals.length > 0)
        client.stop()
        await cancelledApproval
        assert.equal(data.created.length, 2)
        assert.equal(client.state.approvals.length, 0)
        await client.resumeQueue()

        const waiting = client.submit('wait', context)
        await until(() => host.prompts.at(-1) === 'wait')
        const queued = client.submit('queued', context)
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
        await client.submit('after reconnect', context)
        assert(!chat().messages.some(message => message.content.includes('Replay should not duplicate')))
        assert(chat().messages.length > before)

        const lost = client.submit('wait', context)
        await until(() => host.prompts.at(-1) === 'wait')
        client.disconnect()
        await lost
        const count = host.prompts.length
        await client.connect()
        assert.equal(host.prompts.length, count)
    } finally {
        client.disconnect()
        await host.close()
    }

    const limited = await mockEndpoint({ browserTools: false, loadSession: false })
    const limitedClient = createAgentClient({ getSettings: () => ({ endpoint: limited.endpoint, cwd: '/', token: '' }) })
    try {
        await limitedClient.submit('chat only', context)
        assert.equal(limitedClient.state.browserTools, false)
        assert.deepEqual([...limited.sessions.values()][0].mcpServers, [])
        limitedClient.disconnect()
        await limitedClient.submit('cannot resume', context)
        assert(limitedClient.state.error.includes('Start a new conversation'))
        assert.equal(limited.prompts.length, 1)
    } finally {
        limitedClient.disconnect()
        await limited.close()
    }
    console.log('ACP HTTP, permissions, browser tools, queue, cancellation, settings, and reconnect tests passed')
}

if (import.meta.main) {
    await run()
}

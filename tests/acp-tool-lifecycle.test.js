import assert from 'node:assert/strict'
import * as acp from '@agentclientprotocol/sdk/unstable'
import { mockEndpoint, until } from './acp.test.js'
import { createAgentClient } from '../app/lib/acp-client.js'
import { createBrowserServer } from '../app/lib/acp-browser-server.js'
import { toolPhase } from '../app/lib/agent-tool-display.js'

Deno.test('MCP execution updates the announced ACP card through waiting, running, and completion', async () => {
    const prepared = Promise.withResolvers(), permission = Promise.withResolvers(), finished = Promise.withResolvers()
    const host = await mockEndpoint({ onPrompt: async ({ send, session, client }) => {
        await send({ sessionUpdate: 'tool_call', toolCallId: 'html', title: 'darc_displayHtml', kind: 'other', status: 'pending' })
        await prepared.promise
        const args = { spaceId: 'space', html: '<p>Hello</p>' }
        await send({ sessionUpdate: 'tool_call_update', toolCallId: 'html', status: 'in_progress', rawInput: args })
        const outcome = await new acp.McpOverAcpCaller().request(client, session.mcpServers[0].serverId, 'tools/call', { name: 'displayHtml', arguments: args })
        assert(!outcome.result.isError)
        await send({ sessionUpdate: 'tool_call_update', toolCallId: 'html', status: 'completed', content: outcome.result.content.map(content => ({ type: 'content', content })) })
        return { stopReason: 'end_turn' }
    } })
    const client = createAgentClient({
        getSettings: () => ({ endpoint: host.endpoint, cwd: '/project', mcpConnectionId: 'identity' }),
        createBrowserServer: (_settings, _agent, onToolCall) => createBrowserServer({ onToolCall, connection: {
            name: 'darc', proxyIdentity: { id: 'identity', key: 'owner-key' }, reportAgent() {}, close() {},
            async execute({ onPhase }) {
                onPhase('waiting')
                await permission.promise
                onPhase('running')
                await finished.promise
                return { tabId: 'new-tab', opened: true }
            }
        } })
    })
    const messages = () => client.state.conversations[0]?.messages || []
    const phase = () => {
        const message = messages().find(message => message.toolCallId === 'html')
        return message && toolPhase(message)
    }
    try {
        const turn = client.submit('html')
        await until(() => phase() === 'preparing')
        prepared.resolve()
        await until(() => phase() === 'waiting')
        assert.equal(messages().filter(message => message.role === 'tool').length, 1)
        permission.resolve()
        await until(() => phase() === 'running')
        finished.resolve()
        await turn
        assert.equal(phase(), 'completed')
        const message = messages().find(message => message.toolCallId === 'html')
        assert.deepEqual(message.rawOutput, { tabId: 'new-tab', opened: true })
        assert.equal(message.toolContent[0].content.type, 'text')
    } finally {
        prepared.resolve(); permission.resolve(); finished.resolve()
        client.disconnect()
        await host.close()
    }
})

Deno.test('stopping a browser permission request cancels its card without executing the tool', async () => {
    const host = await mockEndpoint({ onPrompt: async ({ send, session, client }) => {
        await send({ sessionUpdate: 'tool_call', toolCallId: 'waiting', title: 'darc_listSpaces', kind: 'other', status: 'in_progress', rawInput: {} })
        await new acp.McpOverAcpCaller().request(client, session.mcpServers[0].serverId, 'tools/call', { name: 'listSpaces', arguments: {} })
        return { stopReason: 'cancelled' }
    } })
    let executed = false
    const client = createAgentClient({
        getSettings: () => ({ endpoint: host.endpoint, cwd: '/project', mcpConnectionId: 'identity' }),
        createBrowserServer: (_settings, _agent, onToolCall) => createBrowserServer({ onToolCall, connection: {
            name: 'darc', proxyIdentity: { id: 'identity', key: 'owner-key' }, reportAgent() {}, close() {},
            async execute({ onPhase, signal }) {
                onPhase('waiting')
                await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
                executed = true
                return []
            }
        } })
    })
    const message = () => client.state.conversations[0]?.messages.find(item => item.toolCallId === 'waiting')
    try {
        const turn = client.submit('cancel')
        await until(() => message()?.browserPhase === 'waiting')
        client.stop()
        await turn
        assert.equal(toolPhase(message()), 'cancelled')
        assert.equal(executed, false)
    } finally {
        client.disconnect()
        await host.close()
    }
})

import assert from 'node:assert/strict'
import { createAgentConnections } from '../app/lib/agent-connections.js'
import { memoryStorage, mockEndpoint, until } from './acp.test.js'

const scope = (key, tabs = []) => ({ key, tabKeys: tabs.map(id => `tab:${id}`) })
const bindingsKey = 'acpConversations:window:tabGroups'
const options = (storage = memoryStorage(), windowId = 'window') => ({
    storage, session: memoryStorage(), getWindowId: () => windowId, mcp: { sync() {} }
})
const exchange = agent => agent.addLocalExchange('hello', { role: 'assistant', content: 'reply' })

Deno.test('tab sessions bind on interaction, share groups, reuse empty chats and restore after reopening', async () => {
    const config = options()
    let agent = createAgentConnections(config)
    const saved = () => JSON.parse(config.storage.getItem(bindingsKey) || '{}')
    try {
        agent.setConversationScope(scope('tab:one', ['one']))
        agent.setConversationScope(scope('tab:two', ['two']))
        assert.equal(agent.state.activeConversationId, null)
        assert.equal(config.storage.getItem(bindingsKey), null)
        agent.setConversationScope(scope('tab:one', ['one']))
        await exchange(agent)
        const first = agent.state.activeConversationId
        assert.equal(saved()['tab:one'].conversationId, first)

        agent.setConversationScope(scope('group:group', ['one', 'new']))
        assert.equal(agent.state.activeConversationId, first, 'Adding a tab promotes the singleton binding to the group')
        assert.equal(saved()['group:group'].conversationId, first)
        assert.equal(saved()['tab:one'], undefined)
        agent.setConversationScope(scope('group:group', ['new', 'one']))
        assert.equal(agent.state.activeConversationId, first)

        agent.setConversationScope(scope('tab:two', ['two']))
        const empty = agent.state.activeConversationId
        assert.notEqual(empty, first)
        assert.equal(agent.state.conversations.find(chat => chat.id === empty).messages.length, 0)
        agent.setConversationScope(scope('tab:three', ['three']))
        agent.setConversationScope(scope(null))
        agent.setConversationScope(scope('tab:two', ['two']))
        assert.equal(agent.state.activeConversationId, empty, 'Unbound tabs reuse the empty conversation')
        assert.equal(agent.state.conversations.length, 2)
        assert.deepEqual(Object.keys(saved()), ['group:group'])
        agent.pauseQueue()
        await agent.submit('queued on two')
        assert.equal(saved()['tab:two'].conversationId, empty, 'Queueing is an interaction even before messages appear')
        agent.setConversationScope(scope('tab:three', ['three']))
        assert.notEqual(agent.state.activeConversationId, empty, 'A queued conversation is not empty')
        agent.setConversationScope(scope('group:group', ['new']))
        assert.equal(agent.state.activeConversationId, first, 'The group survives closing its original tab')

        agent.setConversationScope(null)
        const before = config.storage.getItem(bindingsKey)
        agent.newConversation()
        await exchange(agent)
        assert.equal(config.storage.getItem(bindingsKey), before, 'Closed-sidebar activity never changes group bindings')
        agent.setConversationScope(scope('group:group', ['new']))
        assert.equal(agent.state.activeConversationId, first)

        agent.suspend()
        agent = createAgentConnections(config)
        agent.setConversationScope(scope('tab:two', ['two']))
        assert.equal(agent.state.activeConversationId, empty)
        assert.equal(agent.state.queue[0].conversationId, empty)
        agent.setConversationScope(scope('group:group', ['new']))
        assert.equal(agent.state.activeConversationId, first)
        agent.selectConversation(empty)
        assert.equal(saved()['group:group'].conversationId, empty, 'Explicit history selection belongs to the current group')
        const otherWindow = createAgentConnections(options(config.storage, 'other-window'))
        otherWindow.setConversationScope(scope('group:group', ['new']))
        assert.equal(otherWindow.state.activeConversationId, null)
        otherWindow.suspend()
    } finally { agent.suspend() }
})

Deno.test('tab session restoration includes the harness and leaves unused model sessions unbound', async () => {
    const config = options()
    const agent = createAgentConnections(config)
    try {
        const first = agent.saveConnection({ title: 'First', endpoint: 'http://127.0.0.1/first', cwd: '/', token: '' })
        agent.setConversationScope(scope('tab:one', ['one']))
        await exchange(agent)
        const firstChat = agent.state.activeConversationId
        const second = agent.saveConnection({ title: 'Second', endpoint: 'http://127.0.0.1/second', cwd: '/', token: '' })
        agent.setConversationScope(scope('tab:two', ['two']))
        await exchange(agent)
        const secondChat = agent.state.activeConversationId
        agent.setConversationScope(scope('tab:one', ['one']))
        assert.equal(agent.state.connectionId, first.id)
        assert.equal(agent.state.activeConversationId, firstChat)
        agent.selectConnection(second.id)
        assert.notEqual(agent.state.activeConversationId, secondChat, 'Changing harnesses cannot bring another group’s used chat')
        assert.equal(agent.state.conversations[0].messages.length, 0)
        agent.selectConnection(first.id)
        assert.equal(agent.state.activeConversationId, firstChat)
        agent.setConversationScope(scope('tab:two', ['two']))
        assert.equal(agent.state.connectionId, second.id)
        assert.equal(agent.state.activeConversationId, secondChat)
        agent.newConversation()
        agent.selectConversation(agent.state.activeConversationId)
        assert.equal(JSON.parse(config.storage.getItem(bindingsKey))['tab:two'].conversationId, secondChat,
            'Creating or selecting an unused empty chat does not save an empty binding')
    } finally { agent.suspend() }
})

Deno.test('switching groups during session setup or a turn preserves prompt and queue ownership', async () => {
    const setup = Promise.withResolvers()
    const host = await mockEndpoint({ beforeSessionResponse: () => setup.promise })
    const agent = createAgentConnections(options())
    try {
        agent.saveConnection({ title: 'Agent', endpoint: host.endpoint, cwd: '/', token: '' })
        agent.setConversationScope(scope('tab:one', ['one']))
        const firstTurn = agent.submit('hello one')
        const first = agent.state.activeConversationId
        await until(() => host.sessions.size === 1)
        assert.equal(agent.state.processingConversationId, first)
        assert.equal(agent.state.conversations[0].messages.length, 0)
        agent.setConversationScope(scope('tab:two', ['two']))
        const second = agent.state.activeConversationId
        assert.notEqual(second, first, 'An in-flight prompt is not an empty session during setup')
        await agent.submit('hello two')
        assert.equal(agent.state.queue[0].conversationId, second)
        agent.setConversationScope(scope('tab:one', ['one']))
        assert.equal(agent.state.activeConversationId, first, 'Used sessions can be restored while another turn runs')
        setup.resolve()
        await firstTurn
        assert.deepEqual(host.prompts, ['hello one', 'hello two'])
        for (const [id, text] of [[first, 'hello one'], [second, 'hello two']]) {
            const chat = agent.state.conversations.find(chat => chat.id === id)
            assert.deepEqual(chat.messages.filter(message => message.role === 'user').map(message => message.content), [text])
            assert(chat.messages.some(message => message.role === 'assistant'))
        }
        assert.equal(agent.state.activeConversationId, first, 'Background completion does not switch the displayed chat')
    } finally {
        setup.resolve()
        agent.suspend()
        await host.close()
    }
})

Deno.test('a prepared empty ACP session is reused without saving tab bindings or opening more remote sessions', async () => {
    const host = await mockEndpoint()
    const config = options()
    const agent = createAgentConnections(config)
    try {
        agent.saveConnection({ title: 'Agent', endpoint: host.endpoint, cwd: '/', token: '' })
        agent.setConversationScope(scope('tab:one', ['one']))
        await agent.prepareConversation()
        const empty = agent.state.activeConversationId
        agent.setConversationScope(scope('tab:two', ['two']))
        agent.setConversationScope(scope('tab:three', ['three']))
        assert.equal(agent.state.activeConversationId, empty)
        assert.equal(host.sessions.size, 1)
        assert.equal(config.storage.getItem(bindingsKey), null)
        await agent.submit('first interaction')
        assert.deepEqual(Object.keys(JSON.parse(config.storage.getItem(bindingsKey))), ['tab:three'])
        agent.setConversationScope(scope('tab:one', ['one']))
        assert.notEqual(agent.state.activeConversationId, empty)
        assert.equal(agent.state.conversations[0].sessionId, null)
        assert.equal(host.sessions.size, 1, 'Switching tabs creates only a local draft until interaction')
    } finally {
        agent.suspend()
        await host.close()
    }
})

import assert from 'node:assert/strict'
import * as acp from '@agentclientprotocol/sdk/unstable'
import { createAgentClient } from '../app/lib/acp-client.js'

const options = [
    { optionId: 'deny-this-call', name: 'Reject', kind: 'reject_once' },
    { optionId: 'allow-this-call', name: 'Allow once', kind: 'allow_once' },
    { optionId: '', name: 'Always allow', kind: 'allow_always' }
]
const permission = sessionId => ({ sessionId, toolCall: {
    toolCallId: 'agent-tool', title: 'Read project files', kind: 'read', status: 'pending', rawInput: { path: '/project' }
}, options })

async function until(predicate) {
    const deadline = Date.now() + 2000
    while (!predicate()) {
        if (Date.now() > deadline) { throw new Error('Permission did not reach the conversation') }
        await new Promise(resolve => setTimeout(resolve, 5))
    }
}

function fixture({ permissionDuringSetup = false } = {}) {
    const toAgent = new TransformStream(), toClient = new TransformStream()
    const stream = { readable: toClient.readable, writable: toAgent.writable }
    const replies = []
    const backend = acp.agent()
        .onRequest(acp.methods.agent.initialize, () => ({ protocolVersion: 1, agentCapabilities: {} }))
        .onRequest(acp.methods.agent.session.new, async ({ client }) => {
            if (permissionDuringSetup) {
                replies.push(await client.request(acp.methods.client.session.requestPermission, permission('session')))
            }
            return { sessionId: 'session' }
        })
        .onRequest(acp.methods.agent.session.prompt, async ({ client }) => {
            replies.push(await client.request(acp.methods.client.session.requestPermission, permission('session')))
            return { stopReason: 'end_turn' }
        })
        .onNotification(acp.methods.agent.session.cancel, () => {})
        .connect({ readable: toAgent.readable, writable: toClient.writable })
    const client = createAgentClient({
        getSettings: () => ({ endpoint: 'https://agent.example/acp', cwd: '/', token: '' }),
        createStream: () => stream, setupTimeout: 100, cancelTimeout: 100
    })
    return { client, backend, replies, async close() {
        client.disconnect()
        backend.close()
        await backend.closed
        await Promise.allSettled([toAgent.writable.close(), toClient.writable.close()])
    } }
}

Deno.test('agent permission before session/new returns appears in its conversation and waits for the user', async () => {
    const f = fixture({ permissionDuringSetup: true })
    const preparing = f.client.prepareConversation()
    void preparing.catch(() => {})
    try {
        await until(() => f.client.state.approvals.length === 1)
        const approval = f.client.state.approvals[0]
        const chat = () => f.client.state.conversations[0]
        assert.equal(chat().sessionId, null)
        assert.equal(approval.conversationId, chat().id)
        assert.deepEqual(chat().messages[0].options, options)
        assert.equal(chat().messages[0].status, 'pending')
        // Waiting for a decision must not consume the connection/setup timeout.
        await new Promise(resolve => setTimeout(resolve, 200))
        assert.equal(f.client.state.status, 'connected')
        f.client.answer(approval.id, 'invented-option')
        assert.equal(f.client.state.approvals.length, 1)
        f.client.answer(approval.id, 'deny-this-call')
        await preparing
        assert.deepEqual(f.replies, [{ outcome: { outcome: 'selected', optionId: 'deny-this-call' } }])
        assert.equal(chat().sessionId, 'session')
        assert.equal(chat().messages[0].status, 'denied')
        assert.equal(f.client.state.approvals.length, 0)
    } finally { await f.close(); await preparing.catch(() => {}) }
})

Deno.test('conversation permission choices return exact agent IDs and Stop cancels the pending prompt', async () => {
    const f = fixture()
    try {
        await f.client.prepareConversation()
        const sending = f.client.submit('permission', {})
        await until(() => f.client.state.approvals.length === 1)
        f.client.answer(f.client.state.approvals[0].id, '')
        await sending
        assert.deepEqual(f.replies[0], { outcome: { outcome: 'selected', optionId: '' } })
        assert.equal(f.client.state.conversations[0].messages.find(message => message.role === 'approval').status, 'approved')
        const stopping = f.client.submit('permission', {})
        await until(() => f.client.state.approvals.length === 1)
        f.client.stop()
        await stopping
        assert.deepEqual(f.replies[1], { outcome: { outcome: 'cancelled' } })
        assert.equal(f.client.state.approvals.length, 0)
        assert.equal(f.client.state.conversations[0].messages.findLast(message => message.role === 'approval').status, 'cancelled')
    } finally { await f.close() }
})

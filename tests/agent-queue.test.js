import assert from 'node:assert/strict'
import { createAgentClient } from '../app/lib/acp-client.js'
import { readAgentAttachment } from '../app/lib/agent-attachments.js'
import { memoryStorage, mockEndpoint } from './acp.test.js'

Deno.test('Reordering queued messages preserves attachments, paused state and persisted execution order', async () => {
    const host = await mockEndpoint()
    const storage = memoryStorage()
    const options = { getSettings: () => ({ endpoint: host.endpoint, cwd: '/project', token: '' }), conversationStorage: storage }
    let client = createAgentClient(options)
    try {
        client.start()
        client.pauseQueue()
        const attachment = await readAgentAttachment(new File(['context'], 'notes.txt', { type: 'text/plain' }))
        await client.submit('first')
        await client.submit('second', { attachments: [attachment] })
        await client.submit('third')
        const [first, second, third] = client.state.queue
        await client.toggleQueued(third.id)
        client.moveQueued(third.id, first.id)
        client.moveQueued(second.id, first.id)
        assert.deepEqual(client.state.queue.map(item => item.text), ['third', 'second', 'first'])
        assert.equal(client.state.queue[0].paused, true)
        assert.deepEqual(client.state.queue[1].attachments, [attachment])
        client.moveQueued('missing', first.id)
        client.moveQueued(first.id, 'missing')
        client.moveQueued(first.id, first.id)
        assert.deepEqual(client.state.queue.map(item => item.text), ['third', 'second', 'first'])
        client.moveQueued(third.id)
        assert.deepEqual(client.state.queue.map(item => item.text), ['second', 'first', 'third'])
        client.suspend()
        client = createAgentClient(options)
        client.start()
        assert.deepEqual(client.state.queue.map(item => item.id), [second.id, first.id, third.id])
        await client.resumeQueue()
        assert.deepEqual(host.prompts, ['second', 'first'])
        assert.deepEqual(host.promptBlocks[0][0], attachment.content)
        await client.toggleQueued(third.id)
        assert.deepEqual(host.prompts, ['second', 'first', 'third'])
    } finally {
        client.disconnect()
        await host.close()
    }
})

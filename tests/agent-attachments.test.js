import assert from 'node:assert/strict'
import { createAgentClient } from '../app/lib/acp-client.js'
import { readAgentAttachment } from '../app/lib/agent-attachments.js'
import { memoryStorage, mockEndpoint, until } from './acp.test.js'

Deno.test('Image, PDF, text and binary attachments reach ACP intact, including attachment-only queued messages after reload', async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71, 0, 255])
    const pdf = '%PDF-1.7\nAttachment context\n%%EOF'
    const files = [
        new File([imageBytes], 'image.png', { type: 'image/png' }),
        new File([pdf], 'report.pdf', { type: 'application/pdf' }),
        new File(['Résumé 中文'], 'notes.txt', { type: 'text/plain' }),
        new File([new Uint8Array([0, 1, 255])], 'data.bin')
    ]
    const attachments = await Promise.all(files.map(readAgentAttachment))
    assert.equal(attachments[0].content.data, btoa(String.fromCharCode(...imageBytes)))
    assert.equal(atob(attachments[1].content.resource.blob), pdf)
    assert.equal(attachments[2].content.resource.text, 'Résumé 中文')
    assert.equal(attachments[3].content.resource.mimeType, 'application/octet-stream')
    const host = await mockEndpoint()
    const storage = memoryStorage()
    const options = { getSettings: () => ({ endpoint: host.endpoint, cwd: '/project', token: '' }), conversationStorage: storage }
    let client = createAgentClient(options)
    try {
        client.start()
        client.pauseQueue()
        await client.submit('', { attachments })
        client.suspend()
        client = createAgentClient(options)
        client.start()
        assert.deepEqual(client.state.queue[0].attachments, attachments)
        await client.resumeQueue()
        assert.deepEqual(host.promptBlocks[0], attachments.map(file => file.content))
        const message = client.state.conversations[0].messages.find(message => message.role === 'user')
        assert.deepEqual(message.attachments.map(file => file.name), files.map(file => file.name))
        assert(message.attachments.every(file => !('content' in file)), 'Sent history should not duplicate file payloads')
        assert.equal(client.state.conversations[0].title, 'image.png')
        await client.submit('Read these files', { attachments: [attachments[1]] })
        assert.deepEqual(host.promptBlocks[1], [attachments[1].content, { type: 'text', text: 'Read these files' }])
    } finally {
        client.disconnect()
        await host.close()
    }
})

Deno.test('Unsupported attachments are retained in a paused queue and never sent as text substitutes', async () => {
    const host = await mockEndpoint({ promptCapabilities: {} })
    const client = createAgentClient({ getSettings: () => ({ endpoint: host.endpoint, cwd: '/project', token: '' }) })
    try {
        const attachment = await readAgentAttachment(new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' }))
        await client.submit('Read this', { attachments: [attachment] })
        assert.match(client.state.error, /does not support embedded files: report.pdf/)
        assert.equal(host.promptBlocks.length, 0)
        assert.equal(client.state.queuePaused, true)
        assert.deepEqual(client.state.queue[0].attachments, [attachment])
    } finally {
        client.disconnect()
        await host.close()
    }
})

Deno.test('Stopping during session setup preserves unsent attachments for resuming', async () => {
    const setup = Promise.withResolvers()
    const host = await mockEndpoint({ beforeSessionResponse: () => setup.promise })
    const client = createAgentClient({ getSettings: () => ({ endpoint: host.endpoint, cwd: '/project', token: '' }) })
    try {
        const attachment = await readAgentAttachment(new File(['context'], 'notes.txt', { type: 'text/plain' }))
        const pending = client.submit('', { attachments: [attachment] })
        await until(() => host.sessions.size === 1)
        client.stop()
        setup.resolve()
        await pending
        assert.equal(host.promptBlocks.length, 0)
        assert.deepEqual(client.state.queue[0].attachments, [attachment])
        await client.resumeQueue()
        assert.deepEqual(host.promptBlocks[0], [attachment.content])
    } finally {
        setup.resolve()
        client.disconnect()
        await host.close()
    }
})

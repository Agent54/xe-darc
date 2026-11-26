import assert from 'node:assert/strict'
import { get } from 'svelte/store'
import { createAgentActivity } from '../app/lib/agent-activity.js'
import { mcpFixture } from './mcp-permissions.test.js'
import { until } from './acp.test.js'

Deno.test('MCP glow covers authorized targets, overlapping connections, cancellation and errors', async () => {
    const activity = createAgentActivity()
    const f = await mcpFixture({ activity })
    const firstRead = Promise.withResolvers()
    const secondRead = Promise.withResolvers()
    let reads = 0
    f.data.readPage = () => ++reads === 1 ? firstRead.promise : secondRead.promise
    const first = f.call('first', 'readTabs', { tabIds: ['one'] })
    assert.equal(get(activity.pulses), 1)
    assert.equal(get(activity.access).tabs.size, 0, 'Pending permission is not actual access')
    await until(() => f.pending().length === 1)
    await f.data.allowPermission(f.pending()[0].requestId, 'session')
    await until(() => reads === 1)
    assert.deepEqual([...get(activity.access).tabs], ['one'])
    assert.deepEqual([...get(activity.access).spaces], ['space'])
    const controller = new AbortController()
    const second = f.call('second', 'readTabs', { tabIds: ['one'] }, controller.signal)
    const cancelled = assert.rejects(second, /abort/i)
    await until(() => f.pending().length === 1)
    await f.data.allowPermission(f.pending()[0].requestId)
    await until(() => reads === 2)
    assert.equal(get(activity.access).calls, 2)
    firstRead.resolve('First read')
    await first
    assert.deepEqual([...get(activity.access).tabs], ['one'], 'One completed call cannot clear another call’s glow')
    controller.abort()
    assert.equal(get(activity.access).tabs.size, 0, 'Abort clears glow immediately even if a page read is still settling')
    secondRead.resolve('Late result')
    await cancelled
    assert.equal(get(activity.access).calls, 0)

    const denied = f.call('second', 'readTabs', { tabIds: ['three'] })
    const rejection = assert.rejects(denied, /denied/)
    await until(() => f.pending().length === 1)
    await f.data.denyPermission(f.pending()[0].requestId)
    await rejection
    assert.equal(get(activity.access).tabs.size, 0)
    f.data.readPage = () => { throw new Error('Read failed') }
    await assert.rejects(f.call('first', 'readTabs', { tabIds: ['one'] }), /Read failed/)
    assert.equal(get(activity.access).calls, 0)
})

Deno.test('Bulk reads highlight only their selected tabs and space for the whole call', async () => {
    const activity = createAgentActivity()
    const f = await mcpFixture({ activity })
    const read = Promise.withResolvers()
    f.data.readPage = () => read.promise
    const pending = f.call('first', 'readTabs', { spaceIds: ['space'] })
    await until(() => f.pending().length === 1)
    await f.data.allowPermission(f.pending()[0].requestId)
    await until(() => get(activity.access).tabs.size === 2)
    assert.deepEqual([...get(activity.access).tabs].sort(), ['one', 'two'])
    assert.deepEqual([...get(activity.access).spaces], ['space'])
    read.resolve('Content')
    await pending
    assert.equal(get(activity.access).tabs.size, 0)
    assert.equal(get(activity.access).spaces.size, 0)
    assert.equal(get(activity.access).calls, 0)
})

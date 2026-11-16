import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { mcpFixture } from './mcp-permissions.test.js'
import { until } from './acp.test.js'

const source = `<script>${await Deno.readTextFile(new URL('../app/data.svelte.js', import.meta.url))}</script>`
const declaration = parse(source).instance.content.body
    .flatMap(statement => statement.declarations || [])
    .find(declaration => declaration.id.name === 'permissionStore')
const callback = declaration.init.arguments[0].properties.find(property => property.key.name === 'onDenied').value
const createDenialHandler = new Function('frames', 'docs', 'ledIndicators', `return (${source.slice(callback.start, callback.end)})`)

Deno.test('prompted MCP denials and saved deny rules flash the blocked-request light', async () => {
    const frames = { one: { frame: {}, committedUrl: 'https://one.example', requestActivity: { allowed: 2, blocked: 3 } } }
    const lights = { blockedRequest: 0 }
    const f = await mcpFixture({ onDenied: createDenialHandler(frames, {}, lights) })
    const rejected = assert.rejects(f.call('first', 'readTab', { tabId: 'one' }), /denied/)
    await until(() => f.pending().length === 1)
    assert.equal(lights.blockedRequest, 0, 'Waiting for permission is not a denial')
    await f.data.denyPermission(f.pending()[0].requestId)
    await rejected
    assert.ok(lights.blockedRequest > 0)
    lights.blockedRequest = 0
    await assert.rejects(f.call('first', 'readTab', { tabId: 'one' }), /denied/)
    assert.ok(lights.blockedRequest > 0, 'Saved deny rules also flash red')
    assert.equal(f.pending().length, 0)
    assert.deepEqual(frames.one.requestActivity, { allowed: 2, blocked: 3 }, 'MCP denials do not count as page requests')
    assert.equal(f.data.reads.length, 0)
})

Deno.test('MCP grants and cancellations do not flash the blocked-request light', async () => {
    const lights = { blockedRequest: 0 }
    const f = await mcpFixture({ onDenied: createDenialHandler({}, {}, lights) })
    const allowed = f.call('first', 'listSpaces')
    await until(() => f.pending().length === 1)
    await f.data.allowPermission(f.pending()[0].requestId)
    await allowed
    assert.equal(lights.blockedRequest, 0)
    const ignored = assert.rejects(f.call('first', 'listSpaces'), /cancelled/)
    await until(() => f.pending().length === 1)
    f.data.cancelPermissionRequest(f.pending()[0].requestId)
    await ignored
    assert.equal(lights.blockedRequest, 0)
    const controller = new AbortController()
    const aborted = assert.rejects(f.call('first', 'listSpaces', {}, controller.signal), /abort/i)
    await until(() => f.pending().length === 1)
    controller.abort()
    await aborted
    assert.equal(lights.blockedRequest, 0)
})

Deno.test('page permission denials still flash and count only for the current frame and URL', () => {
    const frame = {}
    const frames = { one: { frame, committedUrl: 'https://one.example' } }
    const lights = { blockedRequest: 0 }
    const onDenied = createDenialHandler(frames, {}, lights)
    onDenied('one', { frame, url: 'https://one.example' })
    assert.ok(lights.blockedRequest > 0)
    assert.equal(frames.one.requestActivity.blocked, 1)
    lights.blockedRequest = 0
    onDenied('one', { frame: {}, url: 'https://one.example' })
    onDenied('one', { frame, url: 'https://old.example' })
    onDenied('missing', { frame, url: 'https://one.example' })
    assert.equal(lights.blockedRequest, 0)
    assert.equal(frames.one.requestActivity.blocked, 1)
})

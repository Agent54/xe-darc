import assert from 'node:assert/strict'
import { createPermissionStore, getPendingPermissionRequests, permissionTargetKey } from '../app/lib/permissions.js'
import { createMcpBrowserExecutor } from '../app/lib/mcp-browser-tools.js'
import { getTabGroups } from '../app/lib/tab-groups.js'

export async function mcpFixture() {
    const records = new Map()
    const permissions = {}, rules = {}, state = { status: 'loading', error: null }
    const db = {
        async allDocs({ startkey, endkey }) { return { rows: [...records.values()].filter(doc => !doc._deleted && doc._id >= startkey && doc._id <= endkey).map(doc => ({ doc })) } },
        async get(id) { if (!records.has(id) || records.get(id)._deleted) { throw { status: 404 } }; return structuredClone(records.get(id)) },
        async bulkDocs() { return [] }
    }
    const store = createPermissionStore({ db, permissions, rules, state, instanceId: 'instance', getWindowId: () => 'window', getContext: () => null,
        putDocument: async doc => { const rev = `${Number.parseInt(records.get(doc._id)?._rev || '0') + 1}-test`; records.set(doc._id, { ...doc, _rev: rev }); return { rev } } })
    await store.ready
    const docs = {
        one: { id: 'one', type: 'tab', title: 'One', url: 'https://one.example', spaceId: 'space', tabGroupId: 'group', order: 1 },
        two: { id: 'two', type: 'tab', title: 'Two', url: 'https://two.example', spaceId: 'space', tabGroupId: 'group', order: 1 },
        three: { id: 'three', type: 'tab', title: 'Three', url: 'https://three.example', spaceId: 'other', order: 2 }
    }
    const data = {
        docs, spaces: { space: { name: 'Project' }, other: { name: 'Other' } }, spaceMeta: { activeSpace: 'space', activeTabId: 'one' },
        permissions, permissionRules: rules, permissionState: state, permissionsReady: store.ready, reads: [], created: [],
        permissionRequest: (id, request, context) => store.request(id, request, context),
        allowPermission: (id, lifetime = 'once', target) => store.resolve(id, 'allow', lifetime === 'always' ? 'persistent' : lifetime === 'session' ? 'session' : 'once', target),
        denyPermission: id => store.resolve(id, 'deny'), cancelPermissionRequest: id => store.cancelRequest(id), removeMcpPermissions: id => store.removeSubject(id),
        getTabGroups: spaceId => getTabGroups(Object.values(docs).filter(tab => tab.spaceId === spaceId)),
        async readPage(id, options) { this.reads.push({ id, options }); return `Page content: ${id}` },
        async newTab(spaceId, options) {
            const tab = { id: crypto.randomUUID(), type: 'tab', spaceId, ...options, tabGroupId: docs[options.groupTabId]?.tabGroupId }
            docs[tab.id] = tab
            this.created.push(tab)
            return tab
        },
        activateSpace(id) { this.spaceMeta.activeSpace = id }, activate(id) { this.spaceMeta.activeTabId = id }
    }
    const connections = new Map(['first', 'second'].map(id => [id, { id, title: `${id} agent`, description: `Agent ${id}`, endpoint: `https://darc.example/mcp/${id}` }]))
    const executors = new Map([...connections.keys()].map(id => [id, createMcpBrowserExecutor({ data, getConnection: () => connections.get(id) })]))
    return { data, store, records, connections, pending: () => getPendingPermissionRequests(permissions, 'window'),
        call: (id, name, args = {}, signal) => executors.get(id)({ name, args, signal, agent: { name: 'Same reported agent', headers: { 'user-agent': 'Pi test' } } }) }
}

async function pending(fixture, count = 1) {
    for (let i = 0; i < 100; i++) {
        if (fixture.pending().length === count) { return fixture.pending() }
        await new Promise(resolve => setTimeout(resolve, 1))
    }
    throw new Error(`Expected ${count} pending MCP permission requests`)
}

Deno.test('new MCP identities have no grants; header labels do not share persistent permissions', async () => {
    const f = await mcpFixture()
    const first = f.call('first', 'listSpaces')
    const [request] = await pending(f)
    assert.equal(request.subject.id, 'first')
    assert.equal(request.agent.headers['user-agent'], 'Pi test')
    assert.equal(request.scope.partition, 'mcp:first')
    await f.data.allowPermission(request.requestId, 'always')
    assert.equal((await first).length, 2)
    assert.equal((await f.call('first', 'listSpaces')).length, 2)
    const second = f.call('second', 'listSpaces')
    const [other] = await pending(f)
    assert.equal(other.subject.id, 'second')
    await f.data.denyPermission(other.requestId)
    await assert.rejects(second, /denied/)
    assert.equal(Object.keys(f.data.permissionRules).length, 2)
})

Deno.test('list, read, space, and tab group scopes are independent; once permits only its own call', async () => {
    const f = await mcpFixture()
    const a = f.call('first', 'listSpaceTabs', { spaceId: 'space' })
    const [firstRequest] = await pending(f)
    const b = f.call('first', 'listSpaceTabs', { spaceId: 'space' })
    const requests = await pending(f, 2)
    const secondRequest = requests.find(request => request.requestId !== firstRequest.requestId)
    await f.data.allowPermission(secondRequest.requestId)
    assert.equal((await b).length, 2)
    assert.equal(f.pending().length, 1)
    await f.data.denyPermission(firstRequest.requestId)
    await assert.rejects(a, /denied/)
    const read = f.call('first', 'readTab', { tabId: 'one' })
    const [readRequest] = await pending(f)
    assert.equal(readRequest.type, 'mcp-read-tabs')
    assert.equal(readRequest.scope.target.kind, 'tab')
    assert.equal(f.data.reads.length, 0)
    await f.data.allowPermission(readRequest.requestId)
    assert.equal((await read).content, 'Page content: one')
    assert.equal(f.data.reads[0].options.textOnly, false)
})

Deno.test('read grants can expand to a tab group, never an unrelated space or another identity', async () => {
    const f = await mcpFixture()
    const read = f.call('first', 'readTab', { tabId: 'one' })
    const [request] = await pending(f)
    const group = request.permissionTargets.find(option => option.target.kind === 'tabgroup')
    await f.data.allowPermission(request.requestId, 'session', permissionTargetKey(group.target))
    await read
    assert.equal((await f.call('first', 'readTab', { tabId: 'two' })).content, 'Page content: two')
    const outside = f.call('first', 'readTab', { tabId: 'three' })
    const [outsideRequest] = await pending(f)
    await f.data.denyPermission(outsideRequest.requestId)
    await assert.rejects(outside, /denied/)
    const other = f.call('second', 'readTab', { tabId: 'two' })
    const [otherRequest] = await pending(f)
    await f.data.denyPermission(otherRequest.requestId)
    await assert.rejects(other, /denied/)
    assert.equal(f.data.reads.length, 2)
})

Deno.test('space read grants cover member tabs; revocation removes remembered and window grants', async () => {
    const f = await mcpFixture()
    const read = f.call('first', 'readSpaceTabs', { spaceId: 'space' })
    const [request] = await pending(f)
    await f.data.allowPermission(request.requestId, 'always')
    assert.equal((await read).length, 2)
    assert(f.data.reads.every(read => read.options.textOnly === false))
    await f.call('first', 'readTabGroupTabs', { spaceId: 'space', tabGroupId: 'group:group' })
    assert(f.data.reads.every(read => read.options.textOnly === false))
    await f.call('first', 'readTab', { tabId: 'two', textOnly: true })
    assert.equal(f.data.reads.at(-1).options.textOnly, true)
    await f.data.removeMcpPermissions('first')
    assert.equal(Object.keys(f.data.permissionRules).length, 0)
    const again = f.call('first', 'readTab', { tabId: 'two' })
    const [againRequest] = await pending(f)
    await f.data.denyPermission(againRequest.requestId)
    await assert.rejects(again, /denied/)
})

Deno.test('open-tab permission targets the specified group and never follows the currently active space', async () => {
    const f = await mcpFixture()
    const call = f.call('first', 'openTab', { spaceId: 'space', tabGroupId: 'group:group', url: 'https://new.example' })
    const [request] = await pending(f)
    assert.equal(request.target.kind, 'tabgroup')
    assert.equal(f.data.created.length, 0)
    f.data.spaceMeta.activeSpace = 'other'
    await f.data.allowPermission(request.requestId)
    const result = await call
    assert.equal(result.spaceId, 'space')
    assert.equal(f.data.created[0].groupTabId, 'one')
    const html = f.call('first', 'displayHtml', { spaceId: 'other', html: '<h1>Page</h1>' })
    const [htmlRequest] = await pending(f)
    await f.data.denyPermission(htmlRequest.requestId)
    await assert.rejects(html, /denied/)
    assert.equal(f.data.created.length, 1)
})

Deno.test('cancelled requests and stale browser targets never execute after approval', async () => {
    const f = await mcpFixture()
    const controller = new AbortController()
    const read = f.call('first', 'readTab', { tabId: 'one' }, controller.signal)
    const [request] = await pending(f)
    f.data.docs.one.url = 'https://navigated.example'
    assert.equal(await f.data.allowPermission(request.requestId), false)
    controller.abort()
    await assert.rejects(read)
    assert.equal(f.pending().length, 0)
    assert.equal(f.data.reads.length, 0)
    assert.equal(await f.data.allowPermission(request.requestId), false)
})

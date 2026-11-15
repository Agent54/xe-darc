import assert from 'node:assert/strict'
import { createPermissionStore, getPendingPermissionRequests, permissionTargetKey } from '../app/lib/permissions.js'
import { createMcpBrowserExecutor } from '../app/lib/mcp-browser-tools.js'
import { getTabGroups } from '../app/lib/tab-groups.js'
import { mcpTools, mcpServerInstructions } from '../app/lib/mcp-tool-defs.js'

export async function mcpFixture({ activity, onDenied } = {}) {
    const records = new Map()
    const permissions = {}, rules = {}, state = { status: 'loading', error: null }
    const db = {
        async allDocs({ startkey, endkey }) { return { rows: [...records.values()].filter(doc => !doc._deleted && doc._id >= startkey && doc._id <= endkey).map(doc => ({ doc })) } },
        async get(id) { if (!records.has(id) || records.get(id)._deleted) { throw { status: 404 } }; return structuredClone(records.get(id)) },
        async bulkDocs() { return [] }
    }
    const store = createPermissionStore({ db, permissions, rules, state, onDenied, instanceId: 'instance', getWindowId: () => 'window', getContext: () => null,
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
        getCurrentGroupTabId() { return this.spaceMeta.activeTabId },
        getGroupActiveTab(group, spaceId) {
            const selectedId = this.spaces[spaceId].activeTabsOrder?.find(id => group.tabs.some(tab => tab.id === id))
            return group.tabs.find(tab => tab.id === selectedId) || group.tabs[0]
        },
        async readPage(id, options) { this.reads.push({ id, options }); return `Page content: ${id}` },
        async newTab(spaceId, options) {
            const anchor = docs[options.groupTabId]
            if (anchor && !anchor.tabGroupId) anchor.tabGroupId = crypto.randomUUID()
            const tab = { id: crypto.randomUUID(), type: 'tab', spaceId, ...options, tabGroupId: anchor?.tabGroupId || options.newTabGroupId }
            docs[tab.id] = tab
            this.created.push(tab)
            if (options.shouldFocus && spaceId === this.spaceMeta.activeSpace) this.activate(tab.id)
            return tab
        },
        activateSpace(id) { this.spaceMeta.activeSpace = id },
        activate(id) {
            this.spaceMeta.activeTabId = id
            const space = this.spaces[this.spaceMeta.activeSpace]
            space.activeTabsOrder = [id, ...(space.activeTabsOrder || []).filter(entry => entry !== id)]
        }
    }
    const connections = new Map(['first', 'second'].map(id => [id, { id, title: `${id} agent`, description: `Agent ${id}`, endpoint: `https://darc.example/mcp/${id}` }]))
    const executors = new Map([...connections.keys()].map(id => [id, createMcpBrowserExecutor({ data, getConnection: () => connections.get(id), activity })]))
    return { data, store, records, connections, pending: () => getPendingPermissionRequests(permissions, 'window'),
        call: (id, name, args = {}, signal, onPhase) => executors.get(id)({ name, args, signal, onPhase, agent: { name: 'Same reported agent', headers: { 'user-agent': 'Pi test' } } }) }
}

async function pending(fixture, count = 1) {
    for (let i = 0; i < 100; i++) {
        if (fixture.pending().length === count) { return fixture.pending() }
        await new Promise(resolve => setTimeout(resolve, 1))
    }
    throw new Error(`Expected ${count} pending MCP permission requests`)
}

Deno.test('consolidated browser tools advertise minimal scopes and return only space metadata', async () => {
    assert.deepEqual(Object.keys(mcpTools).sort(), ['activateTab', 'displayHtml', 'listSpaces', 'listTabs', 'openTab', 'readTabs'])
    assert.match(mcpServerInstructions, /smallest scope/)
    assert.match(mcpServerInstructions, /research.*background:true/)
    assert.match(mcpServerInstructions, /foreground only when showing/)
    for (const definition of Object.values(mcpTools)) assert(!definition.description.includes('Always use the smallest scope'))
    const f = await mcpFixture()
    f.data.spaces.space.tabs = [f.data.docs.one]
    f.data.spaces.space.privateSetting = 'must not be exposed'
    const result = f.call('first', 'listSpaces', { currentOnly: true })
    const [request] = await pending(f)
    assert.equal(request.target.kind, 'space')
    assert.equal(request.target.id, 'space')
    f.data.activateSpace('other')
    await f.data.allowPermission(request.requestId)
    assert.deepEqual(await result, [{ spaceId: 'space', title: 'Project', isActiveSpace: false }])
})

Deno.test('current tab list means the focused tab group, never all tabs in its space', async () => {
    const f = await mcpFixture()
    f.data.docs.four = { id: 'four', type: 'tab', spaceId: 'space', url: 'https://four.example' }
    for (const name of ['listTabs', 'readTabs']) {
        const current = f.call('first', name)
        const [tabRequest] = await pending(f)
        assert.equal(tabRequest.target.kind, 'tab')
        assert.equal(tabRequest.target.id, 'one')
        await f.data.allowPermission(tabRequest.requestId)
        assert.deepEqual((await current).map(tab => tab.tabId), ['one'])
        const group = f.call('first', name, { current: 'tabList' })
        const [groupRequest] = await pending(f)
        assert.equal(groupRequest.target.kind, 'tabgroup')
        f.data.spaceMeta.activeTabId = 'four'
        await f.data.allowPermission(groupRequest.requestId)
        assert.deepEqual((await group).map(tab => tab.tabId).sort(), ['one', 'two'])
        f.data.spaceMeta.activeTabId = 'one'
    }
    f.data.docs.pin = { id: 'pin', type: 'tab', spaceId: 'space', pinned: true, pinScope: 'space' }
    f.data.spaceMeta.activeTabId = 'pin'
    await assert.rejects(f.call('first', 'listTabs', { current: 'tabList' }), /does not belong/)
    assert.equal(f.pending().length, 0)
})

Deno.test('multi-tab reads authorize every requested tab before reading and deduplicate IDs', async () => {
    const f = await mcpFixture()
    const phases = []
    const read = f.call('first', 'readTabs', { tabIds: ['one', 'three', 'one'], textOnly: true, selector: '//main' }, undefined, phase => phases.push(phase))
    const [first] = await pending(f)
    assert.equal(first.target.id, 'one')
    await f.data.allowPermission(first.requestId)
    const [second] = await pending(f)
    assert.equal(second.target.id, 'three')
    assert.equal(f.data.reads.length, 0)
    assert(!phases.includes('running'))
    await f.data.allowPermission(second.requestId)
    assert.deepEqual((await read).map(tab => tab.tabId), ['one', 'three'])
    assert.equal(f.data.reads.length, 2)
    assert(f.data.reads.every(read => read.options.textOnly && read.options.selector === '//main'))
    assert.equal(phases.at(-1), 'running')
    const denied = f.call('second', 'readTabs', { tabIds: ['one', 'three'] })
    await f.data.allowPermission((await pending(f))[0].requestId)
    await f.data.denyPermission((await pending(f))[0].requestId)
    await assert.rejects(denied, /denied/)
    assert.equal(f.data.reads.length, 2)
})

Deno.test('multiple spaces use individual scopes and all spaces require an explicit wildcard', async () => {
    for (const name of ['listTabs', 'readTabs']) {
        const f = await mcpFixture()
        const selected = f.call('first', name, { spaceIds: ['other', 'space'] })
        for (const spaceId of ['other', 'space']) {
            const [request] = await pending(f)
            assert.equal(request.target.kind, 'space')
            assert.equal(request.target.id, spaceId)
            await f.data.allowPermission(request.requestId)
        }
        assert.equal((await selected).length, 3)
        const all = f.call('first', name, { spaceIds: '*' })
        const [request] = await pending(f)
        assert.equal(request.target.kind, 'all')
        await f.data.allowPermission(request.requestId)
        assert.equal((await all).length, 3)
    }
})

Deno.test('invalid, conflicting, and removed tool scopes fail without requesting access', async () => {
    const f = await mcpFixture()
    for (const [name, args] of [
        ['listSpaces', { spaceIds: '*' }], ['listTabs', { spaceId: 'space' }],
        ['listTabs', { current: 'tab', spaceIds: '*' }], ['listTabs', { spaceIds: [] }],
        ['listTabs', { spaceIds: ['*'] }], ['listTabs', { spaceIds: ['missing'] }],
        ['listTabs', { current: 'tabList', tabGroupId: 'group:group' }],
        ['listTabs', { spaceIds: ['space', 'other'], tabGroupId: 'group:group' }],
        ['readTabs', { tabIds: [] }], ['readTabs', { tabIds: ['one'], spaceIds: '*' }],
        ['readTabs', { tabIds: ['one', 'missing'] }],
        ['readTab', { tabId: 'one' }], ['readSpaceTabs', { spaceId: 'space' }]
    ]) await assert.rejects(f.call('first', name, args), undefined, `${name} ${JSON.stringify(args)}`)
    assert.equal(f.pending().length, 0)
    assert.equal(f.data.reads.length, 0)
})

Deno.test('browser results distinguish focused tabs, current groups, and selections in inactive groups', async () => {
    const f = await mcpFixture()
    f.data.docs.four = { id: 'four', type: 'tab', title: 'Four', url: 'https://four.example', spaceId: 'space', order: 3 }
    f.data.activate('two')
    const allowCall = async (name, args = {}) => {
        const call = f.call('first', name, args)
        const [request] = await pending(f)
        await f.data.allowPermission(request.requestId)
        return call
    }
    const flags = tab => [tab.isActiveSpace, tab.isActiveTabGroup, tab.isActiveTab, tab.isActiveInTabGroup]
    const spaces = await allowCall('listSpaces')
    assert.deepEqual(spaces.map(space => [space.spaceId, space.isActiveSpace]), [['space', true], ['other', false]])
    const tabs = await allowCall('listTabs', { spaceIds: '*' })
    assert.deepEqual(Object.fromEntries(tabs.map(tab => [tab.tabId, flags(tab)])), {
        one: [true, true, false, false], two: [true, true, true, true],
        three: [false, false, false, true], four: [true, false, false, true]
    })
    for (const [name, args] of [
        ['listTabs', { spaceIds: ['space'] }],
        ['listTabs', { spaceIds: ['space'], tabGroupId: 'group:group' }],
        ['readTabs', { spaceIds: ['space'] }],
        ['readTabs', { spaceIds: ['space'], tabGroupId: 'group:group' }]
    ]) {
        const results = await allowCall(name, args)
        assert.deepEqual(flags(results.find(tab => tab.tabId === 'two')), [true, true, true, true], name)
        assert.deepEqual(flags(results.find(tab => tab.tabId === 'one')), [true, true, false, false], name)
    }
    assert.deepEqual(flags((await allowCall('readTabs', { tabIds: ['three'] }))[0]), [false, false, false, true])
    for (const [name, args] of [
        ['openTab', { spaceId: 'space', tabGroupId: 'group:group', url: 'https://new.example' }],
        ['displayHtml', { spaceId: 'space', html: '<p>Hello</p>' }]
    ]) {
        const result = await allowCall(name, args)
        assert.deepEqual(flags(result), [true, true, true, true], name)
        if (name === 'displayHtml') assert.equal(Object.hasOwn(result, 'url'), false)
    }
})

Deno.test('browser markers use current state after permission and preserve the group when a side pin has focus', async () => {
    const f = await mcpFixture()
    f.data.docs.pin = { id: 'pin', type: 'tab', pinned: true, pinScope: 'global', spaceId: 'other', url: 'https://pin.example' }
    const call = f.call('first', 'listTabs', { spaceIds: '*' })
    const [request] = await pending(f)
    f.data.activateSpace('other')
    f.data.activate('three')
    f.data.activate('pin')
    f.data.getCurrentGroupTabId = () => 'three'
    await f.data.allowPermission(request.requestId)
    const tabs = await call
    const three = tabs.find(tab => tab.tabId === 'three')
    assert.equal(three.isActiveSpace, true)
    assert.equal(three.isActiveTabGroup, true)
    assert.equal(three.isActiveTab, false)
    assert.equal(three.isActiveInTabGroup, true)
    const pin = tabs.find(tab => tab.tabId === 'pin')
    assert.equal(pin.isActiveTab, true)
    assert.equal(pin.tabGroupId, null)
    assert.equal(pin.isActiveTabGroup, false)
    assert.equal(pin.isActiveInTabGroup, false)
    assert.equal(tabs.find(tab => tab.tabId === 'one').isActiveSpace, false)
})

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

Deno.test('browser tool phases track real pending permission and skip waiting for remembered grants', async () => {
    const f = await mcpFixture()
    const phases = []
    const call = () => f.call('first', 'listSpaces', {}, undefined, phase => phases.push(phase))
    const first = call()
    const [request] = await pending(f)
    assert.deepEqual(phases, ['waiting'])
    await f.data.allowPermission(request.requestId, 'always')
    await first
    assert.deepEqual(phases, ['waiting', 'running'])
    phases.length = 0
    await call()
    assert.deepEqual(phases, ['running'])
    const denied = f.call('second', 'listSpaces', {}, undefined, phase => phases.push(phase))
    const [denyRequest] = await pending(f)
    await f.data.denyPermission(denyRequest.requestId)
    await assert.rejects(denied, /denied/)
    assert.deepEqual(phases, ['running', 'waiting', 'denied'])
})

Deno.test('list, read, space, and tab group scopes are independent; once permits only its own call', async () => {
    const f = await mcpFixture()
    const a = f.call('first', 'listTabs', { spaceIds: ['space'] })
    const [firstRequest] = await pending(f)
    const b = f.call('first', 'listTabs', { spaceIds: ['space'] })
    const requests = await pending(f, 2)
    const secondRequest = requests.find(request => request.requestId !== firstRequest.requestId)
    await f.data.allowPermission(secondRequest.requestId)
    assert.equal((await b).length, 2)
    assert.equal(f.pending().length, 1)
    await f.data.denyPermission(firstRequest.requestId)
    await assert.rejects(a, /denied/)
    const read = f.call('first', 'readTabs', { tabIds: ['one'] })
    const [readRequest] = await pending(f)
    assert.equal(readRequest.type, 'mcp-read-tabs')
    assert.equal(readRequest.scope.target.kind, 'tab')
    assert.equal(f.data.reads.length, 0)
    await f.data.allowPermission(readRequest.requestId)
    assert.equal((await read)[0].content, 'Page content: one')
    assert.equal(f.data.reads[0].options.textOnly, false)
})

Deno.test('read grants can expand to a tab group, never an unrelated space or another identity', async () => {
    const f = await mcpFixture()
    const read = f.call('first', 'readTabs', { tabIds: ['one'] })
    const [request] = await pending(f)
    const group = request.permissionTargets.find(option => option.target.kind === 'tabgroup')
    await f.data.allowPermission(request.requestId, 'session', permissionTargetKey(group.target))
    await read
    assert.equal((await f.call('first', 'readTabs', { tabIds: ['two'] }))[0].content, 'Page content: two')
    const outside = f.call('first', 'readTabs', { tabIds: ['three'] })
    const [outsideRequest] = await pending(f)
    await f.data.denyPermission(outsideRequest.requestId)
    await assert.rejects(outside, /denied/)
    const other = f.call('second', 'readTabs', { tabIds: ['two'] })
    const [otherRequest] = await pending(f)
    await f.data.denyPermission(otherRequest.requestId)
    await assert.rejects(other, /denied/)
    assert.equal(f.data.reads.length, 2)
})

Deno.test('space read grants cover member tabs; revocation removes remembered and window grants', async () => {
    const f = await mcpFixture()
    const read = f.call('first', 'readTabs', { spaceIds: ['space'] })
    const [request] = await pending(f)
    await f.data.allowPermission(request.requestId, 'always')
    assert.equal((await read).length, 2)
    assert(f.data.reads.every(read => read.options.textOnly === false))
    await f.call('first', 'readTabs', { spaceIds: ['space'], tabGroupId: 'group:group' })
    assert(f.data.reads.every(read => read.options.textOnly === false))
    await f.call('first', 'readTabs', { tabIds: ['two'], textOnly: true })
    assert.equal(f.data.reads.at(-1).options.textOnly, true)
    await f.data.removeMcpPermissions('first')
    assert.equal(Object.keys(f.data.permissionRules).length, 0)
    const again = f.call('first', 'readTabs', { tabIds: ['two'] })
    const [againRequest] = await pending(f)
    await f.data.denyPermission(againRequest.requestId)
    await assert.rejects(again, /denied/)
})

Deno.test('foreground opening targets the current group and rejects focus changes during approval', async () => {
    const f = await mcpFixture()
    const controller = new AbortController()
    const call = f.call('first', 'openTab', { spaceId: 'space', tabGroupId: 'group:group', url: 'https://new.example' }, controller.signal)
    const [request] = await pending(f)
    assert.equal(request.target.kind, 'tabgroup')
    assert.deepEqual(request.toolCall, { name: 'openTab', arguments: { spaceId: 'space', tabGroupId: 'group:group', url: 'https://new.example', background: false } })
    assert.equal(f.data.created.length, 0)
    f.data.spaceMeta.activeSpace = 'other'
    assert.equal(await f.data.allowPermission(request.requestId), false)
    controller.abort()
    await assert.rejects(call)
    assert.equal(f.data.created.length, 0)
    f.data.spaceMeta.activeTabId = 'three'
    const html = f.call('first', 'displayHtml', { spaceId: 'other', html: '<h1>Page</h1>' })
    const [htmlRequest] = await pending(f)
    assert.deepEqual(htmlRequest.toolCall, { name: 'displayHtml', arguments: { spaceId: 'other', html: '<h1>Page</h1>', background: false } })
    await f.data.denyPermission(htmlRequest.requestId)
    await assert.rejects(html, /denied/)
    assert.equal(f.data.created.length, 0)
    assert([...f.records.values()].every(record => !('toolCall' in record)), 'tool parameters belong to requests, not remembered permission rules')
})

Deno.test('foreground opens stay in the current group and background opens share a separate agent group', async () => {
    const f = await mcpFixture()
    const foreground = f.call('first', 'openTab', { url: 'https://foreground.example' })
    const [foregroundRequest] = await pending(f)
    assert.equal(foregroundRequest.target.id, 'group:group')
    await f.data.allowPermission(foregroundRequest.requestId)
    const frontTab = await foreground
    assert.equal(frontTab.background, false)
    assert.equal(frontTab.tabGroupId, 'group:group')
    assert.equal(f.data.spaceMeta.activeTabId, frontTab.tabId)
    const background = f.call('first', 'displayHtml', { background: true, html: '<p>Background</p>' })
    const [backgroundRequest] = await pending(f)
    assert.equal(backgroundRequest.target.kind, 'tabgroup')
    assert.notEqual(backgroundRequest.target.id, 'group:group')
    assert.match(backgroundRequest.target.label, /background/)
    await f.data.allowPermission(backgroundRequest.requestId, 'always')
    const firstTab = await background
    assert.equal(firstTab.background, true)
    assert.equal(f.data.created.at(-1).shouldFocus, false)
    assert.equal(f.data.spaceMeta.activeTabId, frontTab.tabId)
    const nextTab = await f.call('first', 'openTab', { background: true, tabGroupId: firstTab.tabGroupId, url: 'https://background.example' })
    assert.equal(f.data.docs[firstTab.tabId].tabGroupId, f.data.docs[nextTab.tabId].tabGroupId)
    assert.notEqual(f.data.docs[nextTab.tabId].tabGroupId, 'group')
    assert.equal(f.data.spaceMeta.activeTabId, frontTab.tabId)
    assert.equal(f.pending().length, 0)
    await assert.rejects(f.call('first', 'openTab', { background: true, tabGroupId: 'group:group' }), /agent-created/)
    await assert.rejects(f.call('first', 'openTab', { tabGroupId: nextTab.tabGroupId }), /current tab group/)
    await assert.rejects(f.call('first', 'displayHtml', { spaceId: 'other', html: '<p>Wrong space</p>' }), /current space/)
    await assert.rejects(f.call('second', 'openTab', { background: true, tabGroupId: nextTab.tabGroupId }), /agent-created/)
    assert.equal(f.data.created.length, 3)
})

Deno.test('simultaneous background opens use one group without changing the active tab or space', async () => {
    const f = await mcpFixture()
    const calls = [
        f.call('first', 'openTab', { spaceId: 'other', background: true, url: 'https://one.example' }),
        f.call('first', 'displayHtml', { spaceId: 'other', background: true, html: '<p>Two</p>' })
    ]
    const requests = await pending(f, 2)
    assert.equal(requests[0].target.id, requests[1].target.id)
    for (const request of requests) await f.data.allowPermission(request.requestId)
    const results = await Promise.all(calls)
    assert.equal(f.data.docs[results[0].tabId].tabGroupId, f.data.docs[results[1].tabId].tabGroupId)
    assert(f.data.created.every(tab => tab.shouldFocus === false))
    assert.deepEqual(f.data.spaceMeta, { activeSpace: 'space', activeTabId: 'one' })
})

Deno.test('activateTab requires its own permission and focuses the requested tab and space', async () => {
    const f = await mcpFixture()
    const read = f.call('first', 'readTabs', { tabIds: ['three'] })
    await f.data.allowPermission((await pending(f))[0].requestId, 'always')
    await read
    const activation = f.call('first', 'activateTab', { tabId: 'three' })
    const [request] = await pending(f)
    assert.equal(request.type, 'mcp-activate-tab')
    assert.equal(request.target.kind, 'tab')
    assert.equal(request.target.id, 'three')
    assert.deepEqual(f.data.spaceMeta, { activeSpace: 'space', activeTabId: 'one' })
    await f.data.allowPermission(request.requestId, 'always')
    const result = await activation
    assert.equal(result.tabId, 'three')
    assert.equal(result.isActiveSpace, true)
    assert.equal(result.isActiveTabGroup, true)
    assert.equal(result.isActiveTab, true)
    assert.equal(result.isActiveInTabGroup, true)
    assert.equal(Object.hasOwn(result, 'content'), false)
    assert.equal(f.data.reads.length, 1)
    assert.equal(f.data.created.length, 0)
    f.data.spaceMeta = { activeSpace: 'space', activeTabId: 'one' }
    const denied = f.call('second', 'activateTab', { tabId: 'three' })
    await f.data.denyPermission((await pending(f))[0].requestId)
    await assert.rejects(denied, /denied/)
    assert.deepEqual(f.data.spaceMeta, { activeSpace: 'space', activeTabId: 'one' })
    await f.call('first', 'activateTab', { tabId: 'three' })
    assert.equal(f.pending().length, 0)
    assert.equal(f.data.spaceMeta.activeTabId, 'three')
})

Deno.test('activateTab rejects missing or changed tabs and cancellation never changes focus', async () => {
    const f = await mcpFixture()
    await assert.rejects(f.call('first', 'activateTab', { tabId: 'missing' }), /not open/)
    assert.equal(f.pending().length, 0)
    for (const change of [() => { f.data.docs.three.spaceId = 'space' }, () => { f.data.docs.three.closed = true }, () => {}]) {
        f.data.docs.three.spaceId = 'other'
        f.data.docs.three.closed = false
        const controller = new AbortController()
        const activation = f.call('first', 'activateTab', { tabId: 'three' }, controller.signal)
        const [request] = await pending(f)
        change()
        if (f.data.docs.three.spaceId !== 'other' || f.data.docs.three.closed) assert.equal(await f.data.allowPermission(request.requestId), false)
        controller.abort()
        await assert.rejects(activation)
        assert.deepEqual(f.data.spaceMeta, { activeSpace: 'space', activeTabId: 'one' })
        assert.equal(f.pending().length, 0)
    }
})

Deno.test('cancelled requests and stale browser targets never execute after approval', async () => {
    const f = await mcpFixture()
    const controller = new AbortController()
    const read = f.call('first', 'readTabs', { tabIds: ['one'] }, controller.signal)
    const [request] = await pending(f)
    f.data.docs.one.url = 'https://navigated.example'
    assert.equal(await f.data.allowPermission(request.requestId), false)
    controller.abort()
    await assert.rejects(read)
    assert.equal(f.pending().length, 0)
    assert.equal(f.data.reads.length, 0)
    assert.equal(await f.data.allowPermission(request.requestId), false)
})

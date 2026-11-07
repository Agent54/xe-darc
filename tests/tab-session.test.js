import assert from 'node:assert/strict'
import vm from 'node:vm'
import { compileModule, parse } from 'svelte/compiler'
import { getWindowSessionHints, getWindowSessionStartup, rememberWindowBounds, fitWindowBounds, openWindowSession } from '../app/lib/window-session.js'
import * as tabGroups from '../app/lib/tab-groups.js'
import * as tabActivity from '../app/lib/tab-activity.js'
import * as documentSort from '../app/lib/document-sort.js'
import * as frameLifecycle from '../app/lib/frame-lifecycle.js'
import * as svelteServer from 'svelte/internal/server'
import * as svelteClient from 'svelte/internal/client'
import { createTabHistorySwitcher } from '../app/lib/tab-activation-history.js'

function compileStore(generate) {
    return compileModule(
        Deno.readTextFileSync(new URL('../app/data.svelte.js', import.meta.url)),
        { generate, filename: 'data.svelte.js' }
    ).js.code
        .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
        .replaceAll('import.meta.hot', 'false')
        .replace('export default data;', '({ data, refresh });')
}

const source = compileStore('server')
const clientSource = compileStore('client')
const appTabState = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
    .match(/^    let currentGroupTabId[\s\S]*?(?=    let unpinnedTabCount)/m)[0]
const readTopTabsSource = compileModule(`${appTabState}\nexport function readTabs () { return unpinnedTabs }`, { generate: 'client' }).js.code
    .replace(/^import .*$/gm, '')
    .replace('export function readTabs', 'function readTabs') + '\nreadTabs'

const hovercardTabState = Deno.readTextFileSync(new URL('../app/components/TabHoverCard.svelte', import.meta.url))
    .match(/^    const tab = \$derived\(.*$/m)[0]
const readHovercardSource = compileModule(`
    export function createHovercardReader () {
        ${hovercardTabState}
        return () => ({ screenshot: tab.screenshot, digest: tab._attachments?.screenshot?.digest })
    }
`, { generate: 'client' }).js.code.replace(/^import .*$/gm, '').replace(/^export /gm, '')

const defaultSpace = 'darc:space_default'
const otherSpace = 'darc:space_other'
const appSource = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
const dropHandler = parse(appSource).instance.content.body.find(node => node.type === 'ExpressionStatement' && node.expression.callee?.name === 'onDrop').expression.arguments[0]
const handleDrop = data => new Function('data', `return ${appSource.slice(dropHandler.start, dropHandler.end)}`)(data)
const contextMenuSource = Deno.readTextFileSync(new URL('../app/components/TabContextMenu.svelte', import.meta.url))
const spaceMoveHandler = parse(contextMenuSource).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'moveToSpace')
function moveFromSpaceMenu(data, tab, isGroup = false) {
    return new Function('data', 'menu', 'isGroup', 'sourceSpaceId', 'onHide',
        `${contextMenuSource.slice(spaceMoveHandler.start, spaceMoveHandler.end)}; return moveToSpace`)(data, { tab }, isGroup, tab.spaceId, () => {})(otherSpace)
}
const workerSource = Deno.readTextFileSync(new URL('../public/test-shared-worker.js', import.meta.url))
const appsSource = Deno.readTextFileSync(new URL('../app/components/Apps.svelte', import.meta.url))
const addAppHandler = parse(appsSource).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'addApp')
function appInstaller(data, refresh = async () => []) {
    return new Function('data', 'refresh', `
        const exampleApps = [], composeError = ''
        ${appsSource.slice(addAppHandler.start, addAppHandler.end)}
        return { addApp, exampleApps }
    `)(data, refresh)
}

function localStorageFor(storage) {
    return {
        get length() { return storage.size },
        key: index => Array.from(storage.keys())[index] ?? null,
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value)
    }
}

function sharedWorker(database = new Map()) {
    const timers = []
    let now = 1000000
    const indexedDB = {
        open() {
            const request = {}
            request.result = {
                transaction() {
                    const transaction = {
                        objectStore() {
                            return {
                                get(key) {
                                    const read = {}
                                    queueMicrotask(() => {
                                        read.result = structuredClone(database.get(key))
                                        read.onsuccess()
                                    })
                                    return read
                                },
                                put(value, key) {
                                    database.set(key, structuredClone(value))
                                    queueMicrotask(() => transaction.oncomplete())
                                }
                            }
                        }
                    }
                    return transaction
                }
            }
            queueMicrotask(() => request.onsuccess())
            return request
        }
    }
    const api = vm.runInNewContext(workerSource + '\nconst testApi = { handlePortMessage, sessionReady, scanForDisappearedWindows, flush: () => saveTask }\ntestApi', {
        self: { crypto, addEventListener() {} },
        indexedDB,
        Date: { now: () => now },
        console: { log() {}, warn(...args) { throw new Error(args.join(' ')) } },
        setInterval() {},
        setTimeout(fn) { timers.push(fn) }
    })
    return {
        async message(type, payload) {
            await api.sessionReady
            let response
            await api.handlePortMessage({ postMessage(message) { response = message } }, { type, payload })
            await api.flush()
            return response?.payload
        },
        async closeTimers() {
            for (const timer of timers.splice(0)) {
                timer()
            }
            await api.flush()
        },
        elapse(ms) {
            now += ms
            api.scanForDisappearedWindows()
        },
        database
    }
}

async function launch(storage, worker, { url = 'https://darc.example/', name = '', bounds = { x: 30, y: 40, width: 1000, height: 800 }, clientId = crypto.randomUUID() } = {}) {
    const localStorage = localStorageFor(storage)
    const result = await worker.message('CONNECT', {
        clientId,
        url,
        placement: { x: bounds.x, y: bounds.y },
        outer: { width: bounds.width, height: bounds.height },
        ...getWindowSessionHints(url, name),
        ...getWindowSessionStartup(localStorage)
    })
    rememberWindowBounds(result.windowId, result.bounds || bounds, localStorage)
    return result.windowId
}

function tab(id, spaceId = defaultSpace, extra = {}) {
    return { _id: id, _rev: '1-test', type: 'tab', spaceId, order: 1, url: 'https://example.com', ...extra }
}

function session({ tabs, history = [], activeSpace = defaultSpace, windowId = 'window-1', storage = new Map(), delayedWindowId = false, runtime = 'server', frameEnvironment = {} }) {
    if (!storage.has(`activeSpaceId:${windowId}`)) {
        storage.set(`activeSpaceId:${windowId}`, activeSpace)
    }
    if (!storage.has(`tabActiveHistory:${windowId}:${activeSpace}`)) {
        storage.set(`tabActiveHistory:${windowId}:${activeSpace}`, JSON.stringify(history))
    }
    const records = [defaultSpace, otherSpace].map(_id => documentSort.withDocumentSort({ _id, type: 'space', spaceId: _id }))
    records.push(...structuredClone(tabs).map(documentSort.withDocumentSort))
    const queries = []
    const indexes = []
    const writes = []
    const changeListeners = new Map()
    const db = {
        get: async id => {
            const record = records.find(doc => doc._id === id)
            if (!record) {
                throw { status: 404 }
            }
            return structuredClone(record)
        },
        bulkDocs: () => new Promise(() => {}),
        allDocs: async () => ({ rows: structuredClone(records.map(doc => ({ id: doc._id, doc }))) }),
        createIndex: async definition => { indexes.push(definition); return { result: 'created' } },
        changes: () => ({ on(event, callback) { changeListeners.set(event, callback); return this } }),
        find: async query => {
            queries.push(query)
            const result = records.filter(doc => {
                return doc.archive !== 'deleted' && (typeof query.selector.spaceId !== 'string' || doc.spaceId === query.selector.spaceId)
            })
            return { docs: structuredClone(query.fields ? result.map(({ _id }) => ({ _id })) : result) }
        },
        put: async doc => {
            writes.push(doc)
            const index = records.findIndex(record => record._id === doc._id)
            if (index === -1) {
                records.push(structuredClone(doc))
            } else {
                records[index] = structuredClone(doc)
            }
            return { id: doc._id, rev: '2-test' }
        }
    }
    function PouchDB() { return db }
    PouchDB.plugin = () => {}
    const window = { darcWindowId: delayedWindowId ? null : windowId }
    const context = {
        PouchDB,
        $: runtime === 'client' ? svelteClient : svelteServer,
        ...tabGroups,
        ...tabActivity,
        ...documentSort,
        ...frameLifecycle,
        findPlugin: {},
        bootstrap: [],
        testData: [],
        permissionTypes: [],
        projectColors: [{}, {}, {}, { color: '#000' }],
        throttle: fn => fn,
        tick: () => Promise.resolve(),
        window,
        document: { getElementById() { return null } },
        localStorage: localStorageFor(storage),
        crypto,
        console: { log() {}, warn() {}, error(...args) { throw new Error(args.join(' ')) } },
        setInterval() {},
        ...frameEnvironment
    }
    // Svelte only proxies objects created in its own realm.
    const { data, refresh } = runtime === 'client'
        ? new Function(...Object.keys(context), clientSource.replace('({ data, refresh });', 'return { data, refresh }'))(...Object.values(context))
        : vm.runInNewContext(source, context)
    return { data, refresh, window, storage, queries, indexes, writes, db, emitChange: (doc, { normalizeSort = true } = {}) => changeListeners.get('change')({ id: doc._id, doc: normalizeSort ? documentSort.withDocumentSort(doc) : doc, seq: 1 }) }
}

Deno.test('stopping a tab cancels only its frame and clears its loading state', () => {
    const { data } = session({ tabs: [] })
    const stopped = []
    data.frames.target = { loading: true, frame: { stop: () => stopped.push('target') } }
    data.frames.other = { loading: true, frame: { stop: () => stopped.push('other') } }
    data.stopTab('target')
    assert.deepEqual(stopped, ['target'])
    assert.equal(data.frames.target.loading, false)
    assert.equal(data.frames.other.loading, true)
    data.stopTab('removed')
    data.frames.sleeping = { loading: false, frame: null }
    data.stopTab('sleeping')
    assert.equal(data.frames.sleeping.loading, false)
})

Deno.test('sidebar group placement leaves a live single-tab frame attached', async () => {
    const moves = []
    let ticks = 0
    const { data, refresh } = session({ tabs: [tab('one'), tab('two', defaultSpace, { order: 10 })],
        frameEnvironment: {
            document: { getElementById() { throw new Error('No parking needed') } },
            tick() { ticks++; return Promise.resolve() }
        }
    })
    await refresh()
    const wrapper = { isConnected: true }
    const frame = { parentNode: wrapper }
    data.frames.one = { frame, wrapper, attach: () => moves.push('attach') }
    await data.moveTab('one', { beforeTabId: 'two', scope: 'group' })
    assert.equal(frame.parentNode, wrapper)
    assert.deepEqual(moves, [])
    assert.equal(ticks, 0)
})

Deno.test('a frame reorder parks affected neighbors and restores through their current owners', async () => {
    const parked = []
    const attached = []
    const background = { moveBefore(frame) { parked.push(frame.id); frame.parentNode = background } }
    const { data, refresh } = session({ tabs: [
        tab('one', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('two', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1 }),
        tab('three', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 2 })
    ], frameEnvironment: { document: { getElementById: id => id === 'backgroundFrames' ? background : {} } } })
    await refresh()
    for (const id of ['one', 'two', 'three']) {
        const wrapper = { isConnected: true }
        const frame = { id, parentNode: wrapper }
        data.frames[id] = { frame, wrapper, attach() { attached.push(id); frame.parentNode = wrapper } }
    }
    await data.moveTab('one', { targetGroupTabId: 'two', beforeTabId: 'two', afterTabId: 'three' })
    assert.deepEqual(parked.sort(), ['one', 'two'])
    assert.deepEqual(attached.sort(), ['one', 'two'])
})

function mountFrame(data, id, attached) {
    const wrapper = { isConnected: true, moveBefore(frame) { attached.push(id); frame.parentNode = wrapper } }
    const frame = { id, isConnected: true, parentNode: wrapper }
    data.frames[id] = { frame }
    frameLifecycle.registerFrameWrapper(data, id, wrapper, { parentNode: wrapper }, () => {})
    return { frame, wrapper }
}

Deno.test('sparse frame reorders leave unchanged leading and trailing frames attached', async () => {
    const parked = []
    const attached = []
    const background = { moveBefore(frame) { parked.push(frame.id); frame.parentNode = background } }
    const ids = ['one', 'two', 'three', 'four']
    const { data, refresh } = session({ tabs: ids.map((id, index) =>
        tab(id, defaultSpace, { tabGroupId: 'group', tabGroupOrder: index + 1 })),
        frameEnvironment: { document: { getElementById: id => id === 'backgroundFrames' ? background : {} } }
    })
    await refresh()
    ids.forEach(id => mountFrame(data, id, attached))
    await data.moveTab('three', { targetGroupTabId: 'one', beforeTabId: 'one', afterTabId: 'two' })
    assert.deepEqual(parked, ['two', 'three'])
    assert.deepEqual(attached, ['two', 'three'])
    assert.equal(data.docs.two.tabGroupOrder, 2)
})

Deno.test('pinned frame reorders protect mixed-scope neighbors and skip no-op drops', async () => {
    const parked = []
    const attached = []
    let ticks = 0
    const background = { moveBefore(frame) { parked.push(frame.id); frame.parentNode = background } }
    const { data, refresh } = session({ tabs: [
        tab('parent', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('group-pin', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1, pinned: 'left', pinScope: 'group', pinOrder: 0 }),
        tab('space-pin', defaultSpace, { pinned: 'left', pinScope: 'space', pinOrder: 1 }),
        tab('tail', defaultSpace, { pinned: 'left', pinScope: 'space', pinOrder: 3 }),
        tab('global-pin', otherSpace, { pinned: 'left', pinScope: 'global', pinOrder: -100 }),
        tab('right-pin', defaultSpace, { pinned: 'right', pinScope: 'space', pinOrder: 0 })
    ], history: ['parent'], frameEnvironment: {
        document: { getElementById: id => id === 'backgroundFrames' ? background : {} },
        tick() { ticks++; return Promise.resolve() }
    } })
    await refresh()
    for (const id of ['parent', 'group-pin', 'space-pin', 'tail', 'global-pin', 'right-pin']) {
        mountFrame(data, id, attached)
    }
    const drop = { scope: 'pinned', beforeTabId: 'space-pin', afterTabId: 'tail' }
    await data.moveTab('group-pin', drop)
    assert.deepEqual(parked, ['group-pin', 'space-pin'])
    assert.deepEqual(attached, parked)
    assert.equal(ticks, 1)
    await data.moveTab('group-pin', drop)
    assert.equal(ticks, 1)
    assert.equal(parked.length, 2)
})

Deno.test('pin transfers restore through the new wrapper and cancel stale or closed frames', async () => {
    for (const change of ['new-wrapper', 'replaced', 'closed', 'space']) {
        const attached = []
        const ticks = []
        const background = { moveBefore(frame) { frame.parentNode = background } }
        const { data, refresh } = session({ tabs: [
            tab('parent'), tab('pin', defaultSpace, { pinned: 'left', pinScope: 'space', pinOrder: 0 })
        ], history: ['parent'], frameEnvironment: {
            document: { getElementById: id => id === 'backgroundFrames' ? background : {} },
            tick: () => new Promise(resolve => ticks.push(resolve))
        } })
        await refresh()
        const { frame } = mountFrame(data, 'pin', attached)
        const pending = data.pin({ tabId: 'pin', pinned: 'right' })
        assert.equal(frame.parentNode, background)
        assert.equal(ticks.length, 1)
        const destination = { isConnected: true, moveBefore(frame) { attached.push('destination'); frame.parentNode = destination } }
        if (change === 'new-wrapper') {
            frameLifecycle.registerFrameWrapper(data, 'pin', destination, { parentNode: destination }, () => {})
        } else if (change === 'replaced') {
            data.frames.pin.frame = { isConnected: true }
        } else if (change === 'closed') {
            data.docs.pin.archive = 'closed'
        } else {
            data.docs.pin.spaceId = otherSpace
        }
        ticks[0]()
        await pending
        assert.deepEqual(attached, change === 'new-wrapper' ? ['destination'] : [])
        assert.equal(frame.parentNode, change === 'new-wrapper' ? destination : background)
        assert.equal(ticks.length, 1)
    }
})

Deno.test('dragged creation controls persist items at the dropped position, including below an existing spacer', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('spacer', otherSpace, { type: 'divider', order: 30 }),
        tab('first', otherSpace, { order: 10 }), tab('second', otherSpace, { order: 20 }), tab('source')
    ], runtime: 'client' })
    await refresh()
    const drop = handleDrop(data)
    for (const itemType of ['divider', 'tab']) {
        const existingIds = new Set(Object.keys(data.docs))
        await drop({ type: 'create', itemType, dropType: 'reorder', sourceSpaceId: defaultSpace,
            targetSpaceId: otherSpace, targetZone: 'sidebar', beforeTabId: 'first', afterTabId: 'second', targetGroupTabId: null })
        const created = Object.values(data.docs).find(item => !existingIds.has(item.id) && item.type === itemType)
        assert.ok(created)
        assert.equal(created.order, 15)
        assert.equal(created.spaceId, otherSpace)
        assert.equal((await db.get(created.id)).order, 15)
        if (itemType === 'tab') {
            assert.equal(data.spaceMeta.activeSpace, otherSpace)
            assert.equal(data.spaceMeta.activeTabId, created.id)
        }
    }
    assert.equal(data.addDivider(otherSpace), null, 'clicking the spacer control still avoids duplicate leading spacers')
})

Deno.test('dragged new tabs can join groups and dragged items respect activity ordering', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('first', defaultSpace, { order: 10, lastActivityAt: 300 }),
        tab('second', defaultSpace, { order: 20, lastActivityAt: 100 })
    ], runtime: 'client' })
    await refresh()
    const drop = handleDrop(data)
    const existingIds = new Set(Object.keys(data.docs))
    await drop({ type: 'create', itemType: 'tab', dropType: 'reorder', sourceSpaceId: defaultSpace,
        targetSpaceId: defaultSpace, targetZone: 'sidebar', targetGroupTabId: 'first' })
    const createdTab = Object.values(data.docs).find(item => item.type === 'tab' && !existingIds.has(item.id))
    assert.deepEqual(data.getTabGroup('first').tabs.map(item => item.id), ['first', createdTab.id])
    assert.equal((await db.get(createdTab.id)).tabGroupId, data.docs.first.tabGroupId)
    data.toggleTabActivityMode()
    await drop({ type: 'create', itemType: 'divider', dropType: 'reorder', sourceSpaceId: defaultSpace,
        targetSpaceId: defaultSpace, targetZone: 'sidebar', beforeTabId: 'first', afterTabId: 'second' })
    const divider = Object.values(data.docs).find(item => item.type === 'divider')
    assert.equal((await db.get(divider.id)).lastActivityAt, 200)
})

Deno.test('explicit activity persists independently of tab visits and ordinary order', async () => {
    const { data, refresh, db, storage, writes } = session({ tabs: [tab('one', defaultSpace, { order: 0 }), tab('two', defaultSpace, { order: 10 })], runtime: 'client' })
    await refresh()
    data.activate('two')
    assert.equal(data.docs.two.lastActivityAt, undefined)
    await data.bumpTabActivity('two')
    assert.equal(writes.length, 0)
    data.toggleTabActivityMode()
    assert.equal(storage.get('tabActivityMode'), 'true')
    const bump = data.bumpTabActivity('two')
    assert.ok(data.docs.two.lastActivityAt > 0)
    await bump
    const firstActivity = data.docs.two.lastActivityAt
    await data.bumpTabActivity('one')
    assert.ok(data.docs.one.lastActivityAt > firstActivity)
    assert.equal((await db.get('two')).lastActivityAt, firstActivity)
    assert.equal((await db.get('two')).sort, -firstActivity)
    assert.deepEqual(data.spaces[defaultSpace].tabs.map(tab => tab.order), [0, 10])
    data.toggleTabActivityMode()
    const restarted = session({ tabs: [await db.get('one'), await db.get('two')], storage, runtime: 'client' })
    await restarted.refresh()
    assert.equal(restarted.data.ui.tabActivityMode, false)
    assert.equal(restarted.data.docs.two.lastActivityAt, firstActivity)
    assert.deepEqual(restarted.data.spaces[defaultSpace].tabs.map(tab => tab.id), ['one', 'two'])
})

Deno.test('replicated updates with stale sort fields are repaired before they reach the Mango query', async () => {
    const { data, refresh, db, emitChange } = session({ tabs: [tab('one', defaultSpace, { order: 100, lastActivityAt: 200 })], runtime: 'client' })
    await refresh()
    const incoming = { ...await db.get('one'), lastActivityAt: 500, sort: -200 }
    await emitChange(incoming, { normalizeSort: false })
    const persisted = await db.get('one')
    assert.equal(persisted.sort, -500)
    assert.equal(persisted.order, 100)
    await emitChange(persisted)
    assert.equal(data.docs.one.lastActivityAt, 500)
    assert.equal(data.docs.one.sort, -500)
})

Deno.test('activity reordering persists fractional activity ranks without changing ordinary order', async () => {
    const { data, refresh, db, storage } = session({ tabs: [
        tab('one', defaultSpace, { order: 10, lastActivityAt: 300 }),
        tab('two', defaultSpace, { order: 100 }),
        tab('moving', defaultSpace, { order: 50, lastActivityAt: 500 })
    ], runtime: 'client' })
    await refresh()
    data.toggleTabActivityMode()
    await data.moveTab('moving', { beforeTabId: 'one', afterTabId: 'two', activityMode: true })
    assert.equal(data.docs.moving.lastActivityAt, 200)
    assert.equal((await db.get('moving')).lastActivityAt, 200)
    assert.equal((await db.get('moving')).sort, -200)
    assert.equal(data.docs.moving.order, 50)
    await data.moveTab('moving', { afterTabId: 'one', activityMode: true })
    assert.equal(data.docs.moving.lastActivityAt, 301)
    await data.moveTab('moving', { beforeTabId: 'two', activityMode: true })
    assert.equal(data.docs.moving.lastActivityAt, 99)
    const restarted = session({ tabs: await Promise.all(['one', 'two', 'moving'].map(id => db.get(id))), storage, runtime: 'client' })
    await restarted.refresh()
    assert.equal(restarted.data.docs.moving.lastActivityAt, 99)
    assert.equal(restarted.data.docs.moving.order, 50)
})

Deno.test('top group tabs keep traditional ordering through activity toggles, bumps and member reorders', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('one', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 0, lastActivityAt: 100 }),
        tab('two', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 1, lastActivityAt: 10000 }),
        tab('three', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 2, lastActivityAt: 500 })
    ], history: ['one'], runtime: 'client' })
    await refresh()
    const readTabs = new Function('$', 'data', 'closed', readTopTabsSource.replace(/\nreadTabs$/, '\nreturn readTabs'))(svelteClient, data, svelteClient.proxy({}))
    assert.deepEqual(readTabs().map(tab => tab.id), ['one', 'two', 'three'])
    data.toggleTabActivityMode()
    await data.bumpTabActivity('three')
    assert.deepEqual(readTabs().map(tab => tab.id), ['one', 'two', 'three'])
    // Title-bar drops use traditional member placement even while the sidebar toggle is on.
    await data.moveTab('three', { targetGroupTabId: 'one', afterTabId: 'one' })
    assert.deepEqual(readTabs().map(tab => tab.id), ['three', 'one', 'two'])
    assert.equal((await db.get('three')).tabGroupOrder, 0)
    data.toggleTabActivityMode()
    assert.deepEqual(readTabs().map(tab => tab.id), ['three', 'one', 'two'])
})

Deno.test('sidebar member drags persist activity ranks while title-bar member order stays independent', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('one', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 0, lastActivityAt: 100 }),
        tab('two', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 1, lastActivityAt: 300 }),
        tab('three', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 2, lastActivityAt: 500 })
    ], history: ['one'], runtime: 'client' })
    await refresh()
    const readTabs = new Function('$', 'data', 'closed', readTopTabsSource.replace(/\nreadTabs$/, '\nreturn readTabs'))(svelteClient, data, svelteClient.proxy({}))
    const sidebarIds = () => tabActivity.getActivityGroupTabs(data.getTabGroup('one').tabs, data.docs, data.ui.tabActivityMode).map(tab => tab.id)
    data.toggleTabActivityMode()
    assert.deepEqual(sidebarIds(), ['three', 'two', 'one'])
    await data.moveTab('one', { targetGroupTabId: 'two', beforeTabId: 'three', afterTabId: 'two', activityMode: true })
    assert.equal((await db.get('one')).lastActivityAt, 400)
    assert.equal((await db.get('one')).tabGroupOrder, 0)
    assert.deepEqual(sidebarIds(), ['three', 'one', 'two'])
    assert.deepEqual(readTabs().map(tab => tab.id), ['one', 'two', 'three'])
    await data.moveTab('three', { targetGroupTabId: 'one', beforeTabId: 'two', activityMode: true })
    assert.equal((await db.get('three')).lastActivityAt, 299)
    assert.deepEqual(sidebarIds(), ['one', 'two', 'three'])
    assert.deepEqual(readTabs().map(tab => tab.id), ['one', 'two', 'three'])
    data.toggleTabActivityMode()
    assert.deepEqual(sidebarIds(), ['three', 'two', 'one'])
})

Deno.test('activity group drops between untouched members use their traditional member ranks', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('one', defaultSpace, { order: 1000, tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('two', defaultSpace, { order: 1000, tabGroupId: 'group', tabGroupOrder: 1 }),
        tab('incoming', defaultSpace, { order: 2000 })
    ], history: ['one'], runtime: 'client' })
    await refresh()
    data.toggleTabActivityMode()
    await data.moveTab('incoming', { targetGroupTabId: 'one', beforeTabId: 'two', afterTabId: 'one', activityMode: true })
    const group = data.getTabGroup('one')
    assert.deepEqual(group.tabs.map(tab => tab.id), ['one', 'two', 'incoming'])
    assert.deepEqual(tabActivity.getActivityGroupTabs(group.tabs, data.docs, true).map(tab => tab.id), ['two', 'incoming', 'one'])
    assert.equal((await db.get('incoming')).lastActivityAt, 0.5)
    assert.equal((await db.get('incoming')).order, 1000)
})

Deno.test('activity sidebar joins preserve existing title-bar order and append incoming members', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('one', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 0, lastActivityAt: 100 }),
        tab('two', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 5, lastActivityAt: 300 }),
        tab('incoming', defaultSpace, { order: 20, lastActivityAt: 500 })
    ], history: ['one'], runtime: 'client' })
    await refresh()
    data.toggleTabActivityMode()
    await data.moveTab('incoming', { targetGroupTabId: 'one', beforeTabId: 'two', afterTabId: 'one', activityMode: true })
    const group = data.getTabGroup('one')
    assert.deepEqual(group.tabs.map(tab => tab.id), ['one', 'two', 'incoming'])
    assert.deepEqual(tabActivity.getActivityGroupTabs(group.tabs, data.docs, true).map(tab => tab.id), ['two', 'incoming', 'one'])
    assert.equal((await db.get('incoming')).tabGroupOrder, 6)
    assert.equal((await db.get('two')).tabGroupOrder, 5)
})

Deno.test('moves outside the sidebar keep traditional ranks while the activity toggle is on', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('before', defaultSpace, { order: 100, lastActivityAt: 900 }),
        tab('after', defaultSpace, { order: 200, lastActivityAt: 300 }),
        tab('moving', defaultSpace, { order: 10, lastActivityAt: 20 })
    ], runtime: 'client' })
    await refresh()
    data.toggleTabActivityMode()
    await data.moveTab('moving', { beforeTabId: 'before', afterTabId: 'after' })
    assert.equal((await db.get('moving')).order, 150)
    assert.equal(data.docs.moving.lastActivityAt, 150)
})

Deno.test('ordinary order changes raise older activity but preserve a newer timestamp', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('before', defaultSpace, { order: 100 }), tab('after', defaultSpace, { order: 200 }),
        tab('older', defaultSpace, { order: 10, lastActivityAt: 20 }),
        tab('newer', defaultSpace, { order: 20, lastActivityAt: 500 }),
        tab('missing', defaultSpace, { order: 30 })
    ], runtime: 'client' })
    await refresh()
    for (const id of ['older', 'newer', 'missing']) {
        await data.moveTab(id, { beforeTabId: 'before', afterTabId: 'after' })
        assert.equal(data.docs[id].order, 150)
        assert.equal((await db.get(id)).lastActivityAt, id === 'newer' ? 500 : 150)
    }
})

Deno.test('activity group and spacer drops use neighboring group timestamps and keep ordinary ranks', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('one', defaultSpace, { order: 10, tabGroupId: 'moving', tabGroupOrder: 0, lastActivityAt: 500 }),
        tab('two', defaultSpace, { order: 10, tabGroupId: 'moving', tabGroupOrder: 1 }),
        tab('neighbor-one', defaultSpace, { order: 20, tabGroupId: 'neighbor', lastActivityAt: 50 }),
        tab('neighbor-two', defaultSpace, { order: 20, tabGroupId: 'neighbor', lastActivityAt: 300 }),
        tab('fallback', defaultSpace, { order: 100 }),
        tab('spacer', defaultSpace, { type: 'divider', order: 40 })
    ], runtime: 'client' })
    await refresh()
    data.toggleTabActivityMode()
    await data.moveTab('one', { beforeTabId: 'neighbor-one', afterTabId: 'fallback', scope: 'group', activityMode: true })
    for (const id of ['one', 'two']) {
        assert.equal((await db.get(id)).lastActivityAt, 200)
        assert.equal(data.docs[id].order, 10)
    }
    await data.moveTab('spacer', { beforeTabId: 'neighbor-one', afterTabId: 'one', activityMode: true })
    assert.equal((await db.get('spacer')).lastActivityAt, 250)
    assert.equal(data.docs.spacer.order, 40)
})

Deno.test('bump to top precedes existing activity, manual and member ranks', async () => {
    const future = Date.now() + 1000000
    const { data, refresh } = session({ tabs: [tab('one'), tab('future', defaultSpace, { order: future })], runtime: 'client' })
    await refresh()
    data.toggleTabActivityMode()
    await data.bumpTabActivity('one')
    assert.ok(data.docs.one.lastActivityAt > future)
})

Deno.test('a partial refresh at startup still restores the active tab from the complete session', async () => {
    const { data, refresh, queries, indexes, writes } = session({
        tabs: [tab('first'), tab('last-active'), tab('other', otherSpace)],
        history: [{ id: 'last-active', activatedAt: 100 }, { id: 'first', activatedAt: 50 }]
    })

    await refresh(otherSpace)

    assert.equal(data.spaceMeta.activeTabId, 'last-active')
    assert.deepEqual(Array.from(data.spaces[defaultSpace].tabs, tab => tab.id), ['first', 'last-active'])
    assert.equal(typeof queries[0].selector.spaceId, 'object')
    assert.equal(queries[0].limit, 4000)
    assert.equal(queries[0].fields, undefined)
    assert.deepEqual(Array.from(indexes[0].index.fields), ['archive', 'spaceId', 'type', 'sort'])
    assert.deepEqual(JSON.parse(JSON.stringify(queries[0].sort)), [{ archive: 'asc' }, { spaceId: 'asc' }, { type: 'asc' }, { sort: 'asc' }])
    assert.equal(writes.length, 0)
})

Deno.test('startup waits for the window identity and uses that window’s saved space and history', async () => {
    const storage = new Map([
        [`tabActiveHistory:another-window:${otherSpace}`, JSON.stringify(['other-first'])]
    ])
    const { data, refresh, window, queries } = session({
        tabs: [tab('first'), tab('other-first', otherSpace), tab('other-last', otherSpace)],
        history: ['other-last', 'other-first'],
        activeSpace: otherSpace,
        storage,
        delayedWindowId: true
    })

    const loading = refresh()
    assert.equal(queries.length, 0)
    window.resolveDarcWindowId('window-1')
    await loading

    assert.equal(data.spaceMeta.activeSpace, otherSpace)
    assert.equal(data.spaceMeta.activeTabId, 'other-last')
})

Deno.test('restart preserves the existing non-pinned tab selection when a sidepin was active', async () => {
    const { data, refresh } = session({
        tabs: [tab('first'), tab('pinned', defaultSpace, { pinned: 'left' })],
        history: [{ id: 'pinned', activatedAt: 100 }, { id: 'first', activatedAt: 50 }]
    })

    await refresh()

    assert.equal(data.spaceMeta.activeTabId, 'first')
    assert.equal(data.getLastActiveNonPinnedTabId(), 'first')
})

Deno.test('restore skips closed, moved, preview and non-tab history entries', async () => {
    const { data, refresh } = session({
        tabs: [
            tab('first'), tab('closed', defaultSpace, { archive: 'closed' }),
            tab('moved', otherSpace), tab('preview', defaultSpace, { preview: true }),
            tab('divider', defaultSpace, { type: 'divider' }), tab('last-valid')
        ],
        history: ['missing', 'closed', 'moved', 'preview', 'divider', 'last-valid']
    })

    await refresh()

    assert.equal(data.spaceMeta.activeTabId, 'last-valid')
})

Deno.test('the exported last-active non-pinned helper respects space scope and returns null without a valid tab', async () => {
    const { data, refresh } = session({
        tabs: [tab('first'), tab('last'), tab('pinned', defaultSpace, { pinned: 'left' }), tab('other', otherSpace)],
        history: [{ id: 'last', activatedAt: 100 }, { id: 'first', activatedAt: 50 }]
    })
    await refresh()

    assert.equal(typeof data.getLastActiveNonPinnedTabId, 'function')
    assert.equal(data.getLastActiveNonPinnedTabId(), 'last')
    assert.equal(data.getLastActiveNonPinnedTabId(null), 'last')
    data.spaces[otherSpace].activeTabsOrder = [{ id: 'other', activatedAt: 100 }]
    assert.equal(data.getLastActiveNonPinnedTabId(otherSpace), 'other')

    data.spaces[defaultSpace].activeTabsOrder = [{ id: 'missing' }, { id: 'pinned' }, { id: 'other' }]
    assert.equal(data.getLastActiveNonPinnedTabId(), null)
})

Deno.test('without valid history restore selects the first open tab in display order', async () => {
    const { data, refresh } = session({
        tabs: [
            tab('closed', defaultSpace, { archive: 'closed', order: -2 }),
            tab('preview', defaultSpace, { preview: true, order: -1 }),
            tab('later', defaultSpace, { order: 20 }), tab('first', defaultSpace, { order: 10 })
        ],
        history: ['missing', 'closed']
    })

    await refresh()

    assert.equal(data.spaceMeta.activeTabId, 'first')
})

Deno.test('activation survives another restart and later partial refreshes preserve it', async () => {
    const tabs = [tab('first'), tab('last'), tab('other', otherSpace)]
    const initial = session({ tabs, history: ['last', 'first'] })
    await initial.refresh()
    initial.data.activate('first')
    await Promise.resolve()

    const restarted = session({ tabs, storage: initial.storage })
    await restarted.refresh()
    assert.equal(restarted.data.spaceMeta.activeTabId, 'first')

    restarted.data.activate('last')
    await restarted.refresh(otherSpace)
    assert.equal(restarted.data.spaceMeta.activeTabId, 'last')
    assert.deepEqual(Array.from(restarted.queries[1].fields), ['_id'])
    assert.equal(restarted.queries[1].selector.spaceId, otherSpace)
})

Deno.test('each activation has transient scroll intent, including repeated selections and previous-tab navigation', async () => {
    const { data, refresh, writes } = session({ tabs: [tab('one'), tab('two')], history: ['one', 'two'], runtime: 'client' })
    await refresh()
    data.activate('two', { source: 'scroll' })
    const scrollActivation = data.ui.tabActivation
    assert.equal(scrollActivation.source, 'scroll')
    assert.equal(scrollActivation.tabId, 'two')
    data.activate('two')
    assert.notEqual(data.ui.tabActivation, scrollActivation)
    assert.equal(data.ui.tabActivation.source, 'navigation')
    data.activate('two', { source: 'scroll' })
    assert.equal(data.previous(), true)
    assert.equal(data.spaceMeta.activeTabId, 'one')
    assert.equal(data.ui.tabActivation.tabId, 'one')
    assert.equal(data.ui.tabActivation.source, 'navigation')
    assert.equal(writes.length, 0)
})

Deno.test('held Ctrl+Tab follows older activation entries while fresh quick switches retain previous-tab behavior', async () => {
    const { data, refresh } = session({ tabs: [tab('one'), tab('two'), tab('three')], history: ['one', 'two', 'three', 'two'] })
    await refresh()
    let state
    const switcher = createTabHistorySwitcher(data, value => { state = value }, { schedule: () => 1, cancel() {} })
    switcher.previous()
    assert.equal(data.spaceMeta.activeTabId, 'two')
    const entries = state.entries
    switcher.previous()
    assert.equal(data.spaceMeta.activeTabId, 'three')
    switcher.previous()
    assert.equal(data.spaceMeta.activeTabId, 'two')
    assert.equal(state.entries, entries)
    switcher.finish()
    switcher.previous()
    assert.equal(data.spaceMeta.activeTabId, 'three')
    switcher.finish()
})

Deno.test('quitting the app and launching its base URL restores the same window, space and active tab', async () => {
    const storage = new Map()
    const database = new Map()
    const windowId = await launch(storage, sharedWorker(database))
    const tabs = [tab('first'), tab('other-first', otherSpace), tab('last-active', otherSpace)]
    const initial = session({ tabs, activeSpace: otherSpace, windowId, storage })
    await initial.refresh()
    initial.data.activate('last-active')
    await Promise.resolve()

    // A full quit destroys both the page (including URL/name) and the SharedWorker.
    const resumedId = await launch(storage, sharedWorker(database))
    const reopened = session({ tabs, windowId: resumedId, storage })
    await reopened.refresh()

    assert.equal(resumedId, windowId)
    assert.equal(reopened.data.spaceMeta.activeSpace, otherSpace)
    assert.equal(reopened.data.spaceMeta.activeTabId, 'last-active')
})

Deno.test('opening a second window does not reuse a live window’s session', async () => {
    const storage = new Map()
    const worker = sharedWorker()
    const firstId = await launch(storage, worker)
    const secondId = await launch(storage, worker)

    assert.notEqual(secondId, firstId)
})

Deno.test('reload keeps its explicit window identity even when another window was last active', async () => {
    const storage = new Map()
    const worker = sharedWorker()
    const firstClient = 'first-client'
    const firstId = await launch(storage, worker, { clientId: firstClient })
    await launch(storage, worker)
    await worker.message('GOODBYE', { clientId: firstClient, windowId: firstId })

    assert.equal(await launch(storage, worker, { url: `https://darc.example/?darcWindowId=${firstId}`, clientId: 'reloaded-client' }), firstId)
    await worker.message('GOODBYE', { clientId: 'reloaded-client', windowId: firstId })
    assert.equal(await launch(storage, worker, { name: `darc-window-${firstId}` }), firstId)
})

Deno.test('the New Window shortcut does not resume a previous window after a full quit', async () => {
    const storage = new Map()
    const database = new Map()
    const firstId = await launch(storage, sharedWorker(database))

    assert.notEqual(await launch(storage, sharedWorker(database), { url: 'https://darc.example/#new' }), firstId)
})

Deno.test('new windows ignore histories left by older versions instead of guessing a window ID', async () => {
    const storage = new Map([
        [`tabActiveHistory:old-window:${defaultSpace}`, JSON.stringify([{ id: 'old-tab', activatedAt: 100 }])],
        ['activeSpaceId:old-window', otherSpace]
    ])
    const worker = sharedWorker()
    const windowId = await launch(storage, worker, { clientId: 'current-page' })
    assert.notEqual(windowId, 'old-window')
    assert.equal((await worker.message('RESTORE_WINDOWS', { clientId: 'current-page' })).windows.length, 0)
    assert.deepEqual(worker.database.get('windows').windows.map(saved => saved.windowId), [windowId])
})

Deno.test('a full quit restores two windows with separate histories and their exact saved bounds', async () => {
    const storage = new Map()
    const database = new Map()
    const original = sharedWorker(database)
    const left = { x: -1400, y: 50, width: 1200, height: 900 }
    const right = { x: 120, y: 80, width: 1000, height: 700 }
    const firstId = await launch(storage, original, { bounds: left, clientId: 'left' })
    const secondId = await launch(storage, original, { bounds: right, clientId: 'right' })
    const tabs = [tab('first'), tab('second'), tab('third')]
    const first = session({ tabs, windowId: firstId, storage })
    const second = session({ tabs, windowId: secondId, storage })
    await first.refresh()
    await second.refresh()
    first.data.activate('second')
    second.data.activate('third')
    await Promise.resolve()
    await original.message('FOCUS', { clientId: 'right', windowId: secondId })
    await original.message('GOODBYE', { clientId: 'left', windowId: firstId })
    await original.message('GOODBYE', { clientId: 'right', windowId: secondId })
    await original.closeTimers()
    assert.equal(database.get('windows').windows.length, 2)

    const restarted = sharedWorker(database)
    const mainId = await launch(storage, restarted, { clientId: 'main' })
    assert.equal(mainId, secondId)
    const plan = await restarted.message('RESTORE_WINDOWS', { clientId: 'main' })
    assert.deepEqual(structuredClone(plan.windows), [{ windowId: firstId, bounds: left }])
    const childId = await launch(storage, restarted, { url: `https://darc.example/?darcWindowId=${firstId}`, clientId: 'child' })
    assert.equal(childId, firstId)
    assert.equal((await restarted.message('RESTORE_WINDOWS', { clientId: 'child' })), undefined)
    assert.equal((await restarted.message('RESTORE_WINDOWS', { clientId: 'main' })).windows.length, 0)

    for (const [windowId, expectedTab, bounds] of [[firstId, 'second', left], [secondId, 'third', right]]) {
        const restored = session({ tabs, windowId, storage })
        await restored.refresh()
        assert.equal(restored.data.spaceMeta.activeTabId, expectedTab)
        assert.deepEqual(database.get('windows').windows.find(saved => saved.windowId === windowId).bounds, bounds)
    }
})

Deno.test('a window closed while another stays open is removed from the next startup set', async () => {
    const storage = new Map()
    const worker = sharedWorker()
    const firstId = await launch(storage, worker, { clientId: 'first' })
    const secondId = await launch(storage, worker, { clientId: 'second' })
    await worker.message('GOODBYE', { clientId: 'first', windowId: firstId })
    await worker.closeTimers()

    assert.deepEqual(worker.database.get('windows').windows.map(saved => saved.windowId), [secondId])
})

Deno.test('reopening the app before its SharedWorker exits restores the same complete set', async () => {
    const storage = new Map()
    const worker = sharedWorker()
    const firstId = await launch(storage, worker, { clientId: 'first' })
    const secondId = await launch(storage, worker, { clientId: 'second' })
    await worker.message('GOODBYE', { clientId: 'first', windowId: firstId })
    await worker.message('GOODBYE', { clientId: 'second', windowId: secondId })

    assert.equal(await launch(storage, worker, { clientId: 'reopened' }), firstId)
    assert.deepEqual(Array.from((await worker.message('RESTORE_WINDOWS', { clientId: 'reopened' })).windows, saved => saved.windowId), [secondId])
    // Timers queued by the old pages must not close the newly restored windows.
    await worker.closeTimers()
    assert.equal(worker.database.get('windows').windows.length, 2)
})

Deno.test('duplicate identity hints cannot share a live window session, and stale pages cannot change its replacement', async () => {
    const storage = new Map()
    const worker = sharedWorker()
    const firstId = await launch(storage, worker, { clientId: 'old' })
    const duplicateId = await launch(storage, worker, { url: `https://darc.example/?darcWindowId=${firstId}` })
    assert.notEqual(duplicateId, firstId)

    await worker.message('GOODBYE', { clientId: 'old', windowId: firstId })
    await launch(storage, worker, { url: `https://darc.example/?darcWindowId=${firstId}`, clientId: 'replacement' })
    await worker.message('HEARTBEAT', { clientId: 'old', windowId: firstId, placement: { x: 9999, y: 9999 }, outer: { width: 200, height: 200 } })
    assert.equal(worker.database.get('windows').windows.find(saved => saved.windowId === firstId).bounds.x, 30)
})

Deno.test('a window returning after sleep keeps its ID and resumes saving its bounds', async () => {
    const storage = new Map()
    const worker = sharedWorker()
    const windowId = await launch(storage, worker, { clientId: 'sleeping' })
    worker.elapse(10000)
    await worker.closeTimers()
    await worker.message('HEARTBEAT', { clientId: 'sleeping', windowId, placement: { x: 100, y: 50 }, outer: { width: 900, height: 800 } })

    assert.deepEqual(worker.database.get('windows').windows, [{ windowId, bounds: { x: 100, y: 50, width: 900, height: 800 } }])
})

Deno.test('final synchronous bounds survive worker shutdown before another heartbeat', async () => {
    const storage = new Map()
    const worker = sharedWorker()
    const windowId = await launch(storage, worker)
    const finalBounds = { x: 200, y: 100, width: 800, height: 600 }
    rememberWindowBounds(windowId, finalBounds, localStorageFor(storage))
    const restarted = sharedWorker(worker.database)
    await launch(storage, restarted)

    assert.deepEqual(worker.database.get('windows').windows[0].bounds, finalBounds)
})

Deno.test('group additions append members without moving the group and space additions still open first', async () => {
    const { data, refresh, writes } = session({ tabs: [tab('before', defaultSpace, { order: 0 }), tab('anchor', defaultSpace, { order: 10 }), tab('after', defaultSpace, { order: 20 })], history: ['anchor'] })
    await refresh()
    const first = await data.newGroupTab(defaultSpace, { shouldFocus: true })
    const second = await data.newGroupTab(defaultSpace, { shouldFocus: true })
    const group = data.getTabGroup('anchor')
    assert.deepEqual(Array.from(group.tabs, tab => tab.id), ['anchor', first.id, second.id])
    assert.equal(group.order, 10)
    assert.equal(first.tabGroupId, second.tabGroupId)
    const standalone = await data.newTab(defaultSpace)
    assert.equal(tabActivity.getActivitySidebarItems(data.getSidebarItems(), data.docs, false)[0].tabs[0].id, standalone.id)
    assert.equal(standalone.tabGroupId, null)
    assert.equal(writes.every(write => write.type === 'tab'), true)
    assert.equal(writes.some(write => write._id === 'anchor' && write.tabGroupId === first.tabGroupId), true)
})

Deno.test('adding from a pinned pane retains the previously active group', async () => {
    const { data, refresh } = session({ tabs: [tab('anchor'), tab('pin', defaultSpace, { pinned: 'left' })], history: ['anchor'] })
    await refresh()
    data.activate('pin')
    const added = await data.newGroupTab(defaultSpace)
    assert.equal(data.getTabGroup('anchor').tabs.some(tab => tab.id === added.id), true)
})

Deno.test('new tab position applies immediately and persists group order across refresh and restart', async () => {
    for (const runtime of ['server', 'client']) {
        const { data, refresh, storage, db } = session({
            tabs: ['one', 'two', 'three'].map((id, index) => tab(id, defaultSpace, { tabGroupId: 'group', tabGroupOrder: index })),
            history: ['two'], runtime
        })
        await refresh()
        const appended = await data.newGroupTab(defaultSpace)
        assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two', 'three', appended.id])

        storage.set('newTabPosition', 'next')
        const first = await data.newGroupTab(defaultSpace, { url: 'https://first.example/', opener: 'two' })
        const second = await data.newTab(defaultSpace, { url: 'https://second.example/', opener: 'two', groupTabId: 'two' })
        const expected = ['one', 'two', second.id, first.id, 'three', appended.id]
        assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), expected)
        assert.equal(data.spaceMeta.activeTabId, 'two')
        await refresh()
        assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), expected)

        const records = (await db.allDocs()).rows.map(row => row.doc).filter(doc => doc.type === 'tab')
        const restarted = session({ tabs: records, storage, runtime })
        await restarted.refresh()
        assert.deepEqual(Array.from(restarted.data.getTabGroup('one').tabs, tab => tab.id), expected)
        const focused = await restarted.data.newGroupTab(defaultSpace, { shouldFocus: true })
        assert.deepEqual(Array.from(restarted.data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two', focused.id, second.id, first.id, 'three', appended.id])
        assert.equal(restarted.data.spaceMeta.activeTabId, focused.id)

        storage.set('newTabPosition', 'right')
        const last = await restarted.data.newGroupTab(defaultSpace)
        assert.equal(restarted.data.getTabGroup('one').tabs.at(-1).id, last.id)
    }
})

Deno.test('next-to-current placement uses the remembered group from a space pin and keeps standalone tabs separate', async () => {
    const { data, refresh } = session({
        tabs: [
            ...['one', 'two'].map((id, index) => tab(id, defaultSpace, { tabGroupId: 'group', tabGroupOrder: index })),
            tab('pin', defaultSpace, { pinned: 'left', pinScope: 'space' })
        ], history: ['one'], storage: new Map([['newTabPosition', 'next']])
    })
    await refresh()
    data.activate('pin')
    const added = await data.newGroupTab(defaultSpace)
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', added.id, 'two'])
    assert.equal(data.spaceMeta.activeTabId, 'pin')
    const standalone = await data.newTab(defaultSpace)
    assert.equal(standalone.tabGroupId, null)
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', added.id, 'two'])
})

Deno.test('top tabs react immediately to repeated group additions and saved revisions in the client runtime', async () => {
    const { data, refresh } = session({ tabs: [tab('anchor'), tab('outside')], history: ['anchor'], runtime: 'client' })
    await refresh()
    const readTabs = new Function('$', 'data', 'closed', readTopTabsSource.replace(/\nreadTabs$/, '\nreturn readTabs'))(svelteClient, data, svelteClient.proxy({}))
    assert.deepEqual(Array.from(readTabs(), tab => tab.id), ['anchor'])

    const expected = ['anchor']
    for (let index = 0; index < 3; index++) {
        const adding = data.newGroupTab(defaultSpace, { shouldFocus: true })
        assert.equal(data.getTabGroup('anchor').tabs.length, expected.length + 1)
        const pending = readTabs()
        assert.equal(pending.length, expected.length + 1)
        const newId = pending.at(-1).id
        // Read before persistence resolves so Svelte tracks the initially missing revision.
        assert.equal(pending.at(-1)._rev, undefined)
        const saved = await adding
        expected.push(newId)
        assert.deepEqual(Array.from(readTabs(), tab => tab.id), expected)
        assert.equal(saved._rev, '2-test')
        assert.equal(readTabs().every(tab => tab._rev), true)
        assert.equal(data.docs[newId]._rev, readTabs().at(-1)._rev)
    }

    data.activate('outside')
    assert.deepEqual(Array.from(readTabs(), tab => tab.id), ['outside'])
    data.activate('anchor')
    assert.deepEqual(Array.from(readTabs(), tab => tab.id), expected)
})

Deno.test('new tabs activate and show their buttons before the first async boundary', async () => {
    const { data, refresh, db } = session({ tabs: [tab('anchor')], history: ['anchor'], runtime: 'client' })
    await refresh()
    const readTabs = new Function('$', 'data', 'closed', readTopTabsSource.replace(/\nreadTabs$/, '\nreturn readTabs'))(svelteClient, data, svelteClient.proxy({}))
    const put = db.put
    let finishCreation
    db.put = doc => doc._id === 'anchor' ? put(doc) : new Promise(resolve => {
        finishCreation = () => resolve(put(doc))
    })

    const creating = data.newGroupTab(defaultSpace, { shouldFocus: true })
    const newId = readTabs().at(-1).id
    assert.notEqual(newId, 'anchor')
    assert.equal(data.spaceMeta.activeTabId, newId)
    assert.equal(data.ui.tabActivation.tabId, newId)
    assert.equal(data.docs[newId].url, 'about:newtab')
    assert.ok(data.docs[newId].created > 0)
    assert.equal(data.isTabHibernated(newId), false)
    finishCreation()
    await creating
    assert.equal((await db.get(newId)).created, data.docs[newId].created)
})

Deno.test('new tab navigation publishes URL and loading state while storage and the frame are unavailable', async () => {
    const { data, refresh, db } = session({ tabs: [tab('new', defaultSpace, { url: 'about:newtab', title: 'New Tab' })], runtime: 'client' })
    await refresh()
    const get = db.get
    let releaseRead
    db.get = id => new Promise(resolve => { releaseRead = () => resolve(get(id)) })
    const url = 'https://search.example/?q=hello'
    const navigating = data.navigate('new', url)
    assert.equal(data.docs.new.url, url)
    assert.equal(data.spaces[defaultSpace].tabs.find(tab => tab.id === 'new').url, url)
    assert.equal(data.docs.new.title, url)
    assert.equal(data.docs.new.favicon, null)
    assert.equal(data.frames.new.loading, true)
    assert.equal(data.frames.new.pendingLoad, true)
    assert.equal(data.frames.new.initialLoad, true)
    assert.deepEqual(data.frames.new.directNavigation.urls, [url])
    assert.equal(data.isTabHibernated('new'), false)
    await Promise.resolve()
    await Promise.resolve()
    releaseRead()
    await navigating
    assert.equal((await get('new')).url, url)
})

Deno.test('navigation before tab creation finishes saves the destination after creation', async () => {
    const { data, refresh, db } = session({ tabs: [tab('anchor')], history: ['anchor'], runtime: 'client' })
    await refresh()
    const put = db.put
    let finishCreation
    db.put = doc => doc._id === 'anchor' || finishCreation ? put(doc) : new Promise(resolve => {
        finishCreation = () => resolve(put(doc))
    })
    const creating = data.newGroupTab(defaultSpace, { shouldFocus: true })
    const id = data.spaceMeta.activeTabId
    const navigating = data.navigate(id, 'https://search.example/results')
    assert.equal(data.docs[id].url, 'https://search.example/results')
    finishCreation()
    await Promise.all([creating, navigating])
    assert.equal((await db.get(id)).url, 'https://search.example/results')
})

Deno.test('rapid navigation uses the existing frame and keeps the latest destination through an older change event', async () => {
    const { data, refresh, db, emitChange } = session({ tabs: [tab('page')], runtime: 'client' })
    await refresh()
    const navigations = []
    const frame = svelteClient.proxy({ set src(url) {
        assert.deepEqual(data.frames.page.directNavigation.urls, [url])
        navigations.push(url)
    } })
    data.frames.page = { frame }
    const first = data.navigate('page', 'https://first.example/')
    const second = data.navigate('page', 'https://second.example/')
    emitChange(tab('page', defaultSpace, { url: 'https://first.example/' }))
    assert.equal(data.docs.page.url, 'https://second.example/')
    assert.equal(data.frames.page.frame, frame)
    assert.equal(data.frames.page.pendingLoad, false)
    assert.deepEqual(navigations, ['https://first.example/', 'https://second.example/'])
    await Promise.all([first, second])
    assert.equal((await db.get('page')).url, 'https://second.example/')
})

Deno.test('fresh web tabs stay pending until frame creation and hibernation still clears that intent', async () => {
    const { data, refresh } = session({ tabs: [tab('anchor')], runtime: 'client' })
    await refresh()
    const creating = data.newTab(defaultSpace, { url: 'https://example.com/', shouldFocus: true })
    const pending = data.spaces[defaultSpace].tabs.find(tab => tab.id !== 'anchor')
    assert.equal(data.isTabHibernated(pending.id), false)
    assert.equal(data.frames[pending.id].pendingLoad, true)
    assert.equal(data.frames[pending.id].loading, true)
    await creating
    data.hibernate(pending.id, true)
    assert.equal(data.isTabHibernated(pending.id), true)
    await data.navigate(pending.id, 'https://example.com/next')
    assert.equal(data.frames[pending.id].forceHibernated, false)
    assert.equal(data.isTabHibernated(pending.id), false)
    await data.navigate(pending.id, 'about:newtab')
    assert.equal(data.frames[pending.id].directNavigation, null)
    assert.equal(data.frames[pending.id].pendingLoad, false)
    assert.equal(data.frames[pending.id].loading, false)
    assert.equal(data.docs[pending.id].title, 'New Tab')
    const background = await data.newTab(defaultSpace, { url: 'https://background.example/' })
    assert.equal(data.isTabHibernated(background.id), true)
    assert.equal(data.frames[background.id].pendingLoad, false)
    assert.equal(data.frames[background.id].loading, false)
})

Deno.test('metadata from an older page cannot overwrite a newer navigation or replacement frame', async () => {
    const source = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
        .match(/    async function updateTabMeta\(tab\) \{[\s\S]*?(?=\/\/ Content script)/)[0]
    for (const change of ['none', 'navigation', 'redirect', 'replacement']) {
        const tab = { id: 'page', url: 'https://example.com/' }
        let finishTitle
        const frame = { src: tab.url, executeScript: () => new Promise(resolve => { finishTitle = resolve }) }
        const updates = []
        const data = { docs: { page: tab }, frames: { page: { frame } }, updateTab: (...args) => updates.push(args) }
        const updateMeta = new Function('data', 'isNewTabUrl', 'isTabHistoryUrl', `${source}\nreturn updateTabMeta`)(data, () => false, () => false)
        const updating = updateMeta(tab)
        if (change === 'navigation') {
            tab.url = 'https://next.example/'
        } else if (change === 'redirect') {
            frame.src = 'https://redirect.example/'
        } else if (change === 'replacement') {
            data.frames.page.frame = { src: tab.url }
        }
        finishTitle(['Old page title'])
        await updating
        assert.equal(updates.length, change === 'none' ? 1 : 0, change)
    }
})

Deno.test('standalone and group hovercards refresh attachment digests from screenshot captures without rebuilding sidebar tab lists', async () => {
    for (const tabGroupId of [null, 'group']) {
        const { data, refresh, db, writes, emitChange } = session({
            tabs: [tab('one', defaultSpace, { tabGroupId, screenshot: 'attachment://one/screenshot', _attachments: { screenshot: { digest: 'old' } } }),
                tab('two', defaultSpace, { tabGroupId })],
            history: ['one'], runtime: 'client'
        })
        await refresh()
        const sidebarSnapshot = data.getTabGroup('one').tabs.find(tab => tab.id === 'one')
        const createReader = new Function('$', 'data', 'previewTab', `${readHovercardSource}\nreturn createHovercardReader`)(svelteClient, data, sidebarSnapshot)
        const read = createReader()
        assert.equal(read().digest, 'old')
        data.frames.one = { frame: { captureVisibleRegion: async () => 'data:image/png;base64,bmV3' } }
        await data.captureScreenshot('one')
        const saved = await db.get('one')
        assert.ok(writes.at(-1)._attachments.screenshot.data instanceof Blob)
        // Pouch publishes a new document with the same attachment URL and a new digest.
        await emitChange({ ...saved, _rev: '2-new', _attachments: { screenshot: { digest: 'new', stub: true } } })
        assert.equal(sidebarSnapshot._attachments.screenshot.digest, 'old')
        assert.deepEqual(read(), { screenshot: 'attachment://one/screenshot', digest: 'new' })
        await emitChange({ ...data.docs.one, _rev: '3-new', _attachments: { screenshot: { digest: 'newer', stub: true } } })
        assert.equal(read().digest, 'newer')
        await emitChange({ ...data.docs.one, _rev: '4-cleared', screenshot: null, _attachments: {} })
        assert.deepEqual(read(), { screenshot: null, digest: undefined })
    }
})

Deno.test('all group views preview the active neighbors and retain them when another group is selected', async () => {
    const { data, refresh } = session({
        tabs: [...['one', 'two', 'three', 'four', 'five'].map((id, index) => tab(id, defaultSpace, { title: id, tabGroupId: 'group', tabGroupOrder: index })), tab('outside')],
        history: ['three', 'outside', 'one'], runtime: 'client'
    })
    await refresh()
    const preview = group => Array.from(group.previewTabs, tab => tab.id)
    assert.deepEqual(preview(data.getTabGroup('three')), ['two', 'three', 'four'])
    data.activate('five')
    assert.deepEqual(preview(data.getSidebarItems().find(group => group.tabGroupId)), ['three', 'four', 'five'])
    data.activate('outside')
    const group = data.getTabGroups().find(group => group.tabGroupId)
    assert.deepEqual(preview(group), ['three', 'four', 'five'])
    assert.equal(group.title, 'one')
})

Deno.test('group metadata is optional, persists separately and restores without becoming a sidebar item', async () => {
    const initial = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group' }), tab('two', defaultSpace, { tabGroupId: 'group' })], runtime: 'client' })
    await initial.refresh()
    assert.equal(initial.writes.length, 0)
    assert.equal(initial.data.getTabGroup('one').metadata, null)
    const saving = initial.data.updateTabGroup('group', { name: '  Research  ', color: '#aabbcc', emoji: '🧪', favicon: 'https://example.com/icon.png' })
    assert.equal(initial.data.getTabGroup('one').name, 'Research')
    await saving
    const saved = initial.writes.find(doc => doc.type === 'tabgroup')
    assert.equal(saved._id, tabGroups.tabGroupMetadataId('group'))
    assert.equal(saved.tabGroupId, 'group')
    assert.equal(saved.name, 'Research')
    assert.equal(saved.color, '#aabbcc')
    assert.equal(saved.emoji, '🧪')
    assert.equal(saved.favicon, 'https://example.com/icon.png')
    const restarted = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group' }), tab('two', defaultSpace, { tabGroupId: 'group' }), saved], runtime: 'client' })
    await restarted.refresh()
    assert.equal(restarted.data.getTabGroup('one').title, 'Research')
    assert.equal(restarted.data.getTabGroup('one').metadata.emoji, '🧪')
    assert.equal(restarted.data.getSidebarItems().length, 1)
    assert.equal(restarted.data.spaces[defaultSpace].tabs.every(tab => tab.type === 'tab'), true)
    await restarted.data.updateTabGroup('group', { name: null })
    assert.equal(restarted.data.getTabGroup('one').name, null)
    assert.equal(restarted.data.getTabGroup('one').metadata.color, '#aabbcc')
    assert.equal(restarted.data.getTabGroup('one').title, 'https://example.com')
    await restarted.data.updateTabGroup('group', { emoji: '🌱', favicon: null })
    assert.equal(restarted.data.getTabGroup('one').name, null)
    assert.equal(restarted.data.getTabGroup('one').metadata.emoji, '🌱')
    assert.equal(restarted.data.getTabGroup('one').metadata.favicon, null)
    await restarted.data.updateTabGroup('group', { emoji: null, favicon: null })
    assert.equal(restarted.data.getTabGroup('one').metadata.emoji, null)
    assert.deepEqual(Array.from(restarted.data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two'])
})

Deno.test('merging groups combines only custom names and keeps the destination icon', async () => {
    for (const crossSpace of [false, true]) {
        for (const [sourceName, targetName, expected] of [['Source', 'Target', 'Target + Source'], ['Source', null, 'Source'], [null, 'Target', 'Target'], [null, null, null]]) {
            const targetSpace = crossSpace ? otherSpace : defaultSpace
            const { data, refresh, db } = session({ tabs: [
                tab('one', defaultSpace, { tabGroupId: 'source' }), tab('two', defaultSpace, { tabGroupId: 'source' }),
                tab('three', targetSpace, { tabGroupId: 'target' }), tab('four', targetSpace, { tabGroupId: 'target' })
            ], runtime: 'client' })
            await refresh()
            await data.updateTabGroup('source', { name: sourceName, emoji: '🧪', favicon: 'source.png' })
            await data.updateTabGroup('target', { name: targetName, emoji: '🌱', favicon: 'target.png' }, targetSpace)
            await data.moveTab('one', { scope: 'group', targetSpaceId: targetSpace, targetGroupTabId: 'three' })
            const group = data.getTabGroup('three', targetSpace)
            assert.equal(group.name, expected)
            assert.equal(group.tabs.length, 4)
            assert.equal(group.metadata.emoji, '🌱')
            assert.equal(group.metadata.favicon, 'target.png')
            assert.equal((await db.get(tabGroups.tabGroupMetadataId('target'))).name, expected)
        }
    }
})

Deno.test('group merges without a destination override keep automatic icons, including self drops', async () => {
    const { data, refresh } = session({ tabs: [
        ...['one', 'two'].map(id => tab(id, defaultSpace, { tabGroupId: 'source' })),
        ...['three', 'four'].map(id => tab(id, defaultSpace, { tabGroupId: 'target' }))
    ], runtime: 'client' })
    await refresh()
    await data.updateTabGroup('source', { name: 'Source', emoji: '🧪' })
    await data.moveTab('one', { scope: 'group', targetGroupTabId: 'three' })
    assert.equal(data.getTabGroup('three').name, 'Source')
    assert.equal(data.getTabGroup('three').metadata.emoji, undefined)
    await data.moveTab('one', { scope: 'group', targetGroupTabId: 'three' })
    assert.equal(data.getTabGroup('three').name, 'Source')
})

Deno.test('individual overrides persist through navigation, grouping and restart and can be cleared', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one'), tab('two'), tab('three')], runtime: 'client' })
    await refresh()
    await data.updateTabOverrides('one', { titleOverride: '  Custom  ', emojiOverride: '🧪', faviconOverride: 'custom.png' })
    assert.equal(data.getTabGroup('one').title, 'Custom')
    await data.updateTab('one', { title: 'New page title', favicon: 'page.png', url: 'https://other.example' })
    await data.moveTab('one', { targetGroupTabId: 'two' })
    assert.equal(data.docs.one.titleOverride, 'Custom')
    assert.equal(data.docs.one.title, 'New page title')
    await data.updateTabOverrides('one', { titleOverride: 'Grouped title' })
    assert.equal(data.docs.two.titleOverride, undefined)
    const restarted = session({ tabs: [await db.get('one'), await db.get('two'), await db.get('three')], runtime: 'client' })
    await restarted.refresh()
    assert.equal(restarted.data.docs.one.titleOverride, 'Grouped title')
    assert.equal(restarted.data.docs.one.emojiOverride, '🧪')
    await restarted.data.updateTabOverrides('one', { titleOverride: null, emojiOverride: null, faviconOverride: null })
    await restarted.data.moveTab('one', {})
    assert.equal(restarted.data.getTabGroup('one').title, 'New page title')
    assert.equal((await restarted.db.get('one')).faviconOverride, null)
})

Deno.test('group metadata creation retries conflicts without losing concurrent customizations', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group' }), tab('two', defaultSpace, { tabGroupId: 'group' })] })
    await refresh()
    const put = db.put
    let conflict = true
    db.put = async doc => {
        if (doc.type === 'tabgroup' && conflict) {
            conflict = false
            await put({ ...doc, name: 'Remote', color: '#123456', _rev: '2-remote' })
            throw { status: 409 }
        }
        return put(doc)
    }
    const first = data.updateTabGroup('group', { name: 'First' })
    const latest = data.updateTabGroup('group', { name: 'Latest' })
    await Promise.all([first, latest])
    const saved = await db.get(tabGroups.tabGroupMetadataId('group'))
    assert.equal(saved.name, 'Latest')
    assert.equal(saved.color, '#123456')
})

Deno.test('clicking the active tile tab stays in its group and preserves space history', async () => {
    const { data, refresh } = session({ tabs: [
        tab('one', defaultSpace, { tabGroupId: 'group' }),
        tab('two', defaultSpace, { tabGroupId: 'group' }),
        tab('pin', defaultSpace, { tabGroupId: 'group', pinned: 'left', pinScope: 'group' }),
        tab('closed', defaultSpace, { tabGroupId: 'group', archive: 'closed' }),
        tab('outside')
    ], history: ['two', 'outside', 'pin', 'closed', 'missing', 'two', 'one'] })
    await refresh()
    const activationSource = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
        .match(/    async function activateTab \(tab, index\) \{[\s\S]*?\n    \}/)[0]
    const activateTileTab = new Function('data', 'tick', 'setTimeout', `
        let isChangingTabs = false, tabChangeFromScroll = false
        function activateWindowFocus () {}
        ${activationSource}
        return activateTab
    `)(data, () => Promise.resolve(), () => {})
    await activateTileTab(data.docs.two)
    assert.equal(data.spaceMeta.activeTabId, 'one')
    await activateTileTab(data.docs.one)
    assert.equal(data.spaceMeta.activeTabId, 'two')
    assert.ok(data.spaces[defaultSpace].activeTabsOrder.some(entry => entry.id === 'outside'))
    assert.equal(data.previous(), true)
    assert.equal(data.spaceMeta.activeTabId, 'one')
})

Deno.test('group history with no eligible sibling leaves the active tab and space history intact', async () => {
    for (const grouped of [false, true]) {
        const { data, refresh } = session({ tabs: [
            tab('current', defaultSpace, grouped ? { tabGroupId: 'group' } : {}),
            tab('unvisited', defaultSpace, { tabGroupId: 'group' }),
            tab('outside')
        ], history: ['current', 'outside', 'missing', 'current'] })
        await refresh()
        const history = JSON.stringify(data.spaces[defaultSpace].activeTabsOrder)
        assert.equal(data.previous({ withinGroup: true }), false)
        assert.equal(data.spaceMeta.activeTabId, 'current')
        assert.equal(JSON.stringify(data.spaces[defaultSpace].activeTabsOrder), history)
        assert.equal(data.previous(), true)
        assert.equal(data.spaceMeta.activeTabId, 'outside')
    }
})

Deno.test('clicking a group uses normal sidebar activation history and returns to its most recent tab', async () => {
    const { data, refresh } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group' }), tab('two', defaultSpace, { tabGroupId: 'group' }), tab('outside')], history: ['two', 'outside', 'one'] })
    await refresh()
    const activationSource = Deno.readTextFileSync(new URL('../app/components/TabSidebar.svelte', import.meta.url))
        .match(/    function activateTab\(tabId, spaceId\) \{[\s\S]*?\n    \}/)[0]
    const activateSidebarTab = new Function('data', 'multiSpaceMode', 'tabDrag', 'exitMultiSpaceMode', `${activationSource}\nreturn activateTab`)(data, false, {}, () => {})
    const activateGroup = () => activateSidebarTab(data.getGroupActiveTab(data.getTabGroup('one')).id, defaultSpace)
    activateGroup()
    assert.equal(data.spaceMeta.activeTabId, 'outside')
    activateGroup()
    assert.equal(data.spaceMeta.activeTabId, 'two')
})

Deno.test('closing empty new tabs discards them across refresh and restart', async () => {
    for (const url of ['about:newtab', 'about:blank']) {
        const { data, refresh, writes } = session({ tabs: [tab('empty', defaultSpace, { url }), tab('page')], history: ['empty', 'page'] })
        await refresh()
        if (url === 'about:blank') {
            data.frames.empty = { frame: { canGoBack: () => false, canGoForward: () => false } }
        }
        await data.closeTab(defaultSpace, 'empty')
        assert.equal(data.spaceMeta.closedTabs.length, 0)
        assert.equal(data.spaceMeta.activeTabId, 'page')
        const saved = writes.findLast(doc => doc._id === 'empty')
        assert.equal(saved.archive, 'deleted')
        assert.equal(saved.deleted, true)
        await refresh()
        assert.equal(data.spaceMeta.closedTabs.length, 0)
        const restarted = session({ tabs: [saved, tab('page')] })
        await restarted.refresh()
        assert.equal(restarted.data.spaceMeta.closedTabs.length, 0)
        assert.deepEqual(Array.from(restarted.data.spaces[defaultSpace].tabs, tab => tab.id), ['page'])
    }
})

Deno.test('closing the last empty new tab creates a replacement without a closed tab entry', async () => {
    const { data, refresh } = session({ tabs: [tab('empty', defaultSpace, { url: 'about:newtab' })], history: ['empty'] })
    await refresh()
    await data.closeTab(defaultSpace, 'empty')
    assert.equal(data.spaceMeta.closedTabs.length, 0)
    const [replacement] = data.spaces[defaultSpace].tabs
    assert.notEqual(replacement.id, 'empty')
    assert.equal(replacement.url, 'about:newtab')
    assert.equal(data.spaceMeta.activeTabId, replacement.id)
})

Deno.test('closing the last center tab replaces it in its group while keeping sidepins visible', async () => {
    for (const activePin of [false, true]) {
        const { data, refresh, db } = session({ tabs: [
            tab('center', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }),
            tab('pin', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1, pinned: 'left', pinScope: 'group' }),
            tab('outside')
        ], history: ['center', 'outside'], runtime: 'client' })
        await refresh()
        if (activePin) {
            data.activate('pin')
        }
        const readTabs = new Function('$', 'data', 'closed', readTopTabsSource.replace(/\nreadTabs$/, '\nreturn readTabs'))(svelteClient, data, svelteClient.proxy({}))
        const closing = data.closeTab(defaultSpace, 'center')
        const [replacement] = readTabs()
        assert.ok(replacement)
        assert.equal(replacement.url, 'about:newtab')
        assert.equal(replacement.tabGroupId, 'group')
        assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['pin'])
        await closing
        assert.equal(data.spaceMeta.activeTabId, replacement.id)
        assert.equal((await db.get(replacement.id)).tabGroupId, 'group')
        await refresh()
        assert.deepEqual(Array.from(readTabs(), tab => tab.id), [replacement.id])
    }
})

Deno.test('closing the last center tab with space pins creates a selected replacement', async () => {
    const { data, refresh } = session({ tabs: [tab('center'), tab('pin', defaultSpace, { pinned: 'right' })], history: ['center', 'pin'] })
    await refresh()
    await data.closeTab(defaultSpace, 'center')
    const replacement = data.spaces[defaultSpace].tabs.find(tab => !tab.pinned)
    assert.ok(replacement)
    assert.equal(replacement.url, 'about:newtab')
    assert.equal(data.spaceMeta.activeTabId, replacement.id)
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['pin'])
})

Deno.test('refresh repairs a space containing only space pins and non-tab entries', async () => {
    const { data, refresh } = session({ tabs: [
        tab('pin', defaultSpace, { pinned: 'left' }), tab('divider', defaultSpace, { type: 'divider' }),
        tab('preview', defaultSpace, { preview: true }), tab('lightbox', defaultSpace, { lightbox: true })
    ], history: ['pin'] })
    await refresh()
    const replacement = data.spaces[defaultSpace].tabs.find(tab => tab.type === 'tab' && !tab.pinned)
    assert.ok(replacement)
    assert.equal(replacement.url, 'about:newtab')
    assert.equal(data.spaceMeta.activeTabId, replacement.id)
    await refresh()
    assert.equal(data.spaces[defaultSpace].tabs.filter(tab => tab.type === 'tab' && !tab.pinned).length, 1)
})

Deno.test('activating a space with open tabs and no valid selection restores an existing tab', async () => {
    const { data, refresh } = session({ tabs: [tab('center'), tab('destination', otherSpace)], history: ['center'] })
    await refresh()
    data.activateSpace(otherSpace)
    assert.equal(data.spaceMeta.activeTabId, 'destination')
})

Deno.test('a pending replacement cannot take focus after switching spaces or closing it', async () => {
    for (const action of ['switch', 'close']) {
        const { data, refresh } = session({ tabs: [tab('center'), tab('destination', otherSpace)], history: ['center'], runtime: 'client' })
        await refresh()
        const closing = data.closeTab(defaultSpace, 'center')
        const replacement = data.spaces[defaultSpace].tabs[0]
        if (action === 'switch') {
            data.activateSpace(otherSpace)
            await closing
            assert.equal(data.spaceMeta.activeTabId, 'destination')
        } else {
            const closingReplacement = data.closeTab(defaultSpace, replacement.id)
            await Promise.all([closing, closingReplacement])
            assert.notEqual(data.spaceMeta.activeTabId, replacement.id)
            assert.equal(data.docs[data.spaceMeta.activeTabId].archive, undefined)
        }
    }
})

Deno.test('closing a background group center creates its replacement without changing selection', async () => {
    const { data, refresh } = session({ tabs: [
        tab('center', defaultSpace, { tabGroupId: 'group' }),
        tab('pin', defaultSpace, { tabGroupId: 'group', pinned: 'left', pinScope: 'group' }), tab('outside')
    ], history: ['outside', 'center'] })
    await refresh()
    await data.closeTab(defaultSpace, 'center')
    assert.equal(data.spaceMeta.activeTabId, 'outside')
    const replacement = data.getTabGroup('pin').tabs.find(tab => !tab.pinned)
    assert.ok(replacement)
    assert.equal(replacement.url, 'about:newtab')
})

Deno.test('closing new tab pages with back or forward history and regular pages keeps them restorable', async () => {
    for (const [url, back, forward] of [
        ['about:newtab', true, false],
        ['about:blank', false, true],
        ['https://example.com', false, false]
    ]) {
        const { data, refresh, writes } = session({ tabs: [tab('closing', defaultSpace, { url }), tab('page')] })
        await refresh()
        data.frames.closing = { frame: { canGoBack: () => back, canGoForward: () => forward } }
        await data.closeTab(defaultSpace, 'closing')
        assert.equal(data.spaceMeta.closedTabs.some(tab => tab.id === 'closing'), true)
        assert.equal(writes.findLast(doc => doc._id === 'closing').archive, 'closed')
        assert.ok(data.docs.closing.closedAt > 0)
        assert.equal(writes.findLast(doc => doc._id === 'closing').closedAt, data.docs.closing.closedAt)
        await data.restoreClosedTab('closing')
        assert.equal(data.spaces[defaultSpace].tabs.some(tab => tab.id === 'closing'), true)
    }
})

Deno.test('closing and restoring a group member preserves membership and selects a sibling', async () => {
    const { data, refresh } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1 }), tab('two', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 2 }), tab('outside')], history: ['two', 'outside', 'one'] })
    await refresh()
    await data.closeTab(defaultSpace, 'two')
    assert.equal(data.spaceMeta.activeTabId, 'one')
    assert.equal(data.getTabGroup('one').tabs.length, 1)
    assert.equal(data.getTabGroup('one').id, 'tab:one')
    assert.equal(data.getTabGroup('one').tabGroupId, null)
    await data.restoreClosedTab('two')
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two'])
    assert.equal(data.getTabGroup('one').tabGroupId, 'group')
    assert.equal(data.spaceMeta.activeTabId, 'two')
})

Deno.test('adding to a collapsed singleton retains membership when its closed sibling is restored', async () => {
    const { data, refresh } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }), tab('two', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1 })], history: ['one'], runtime: 'client' })
    await refresh()
    const closing = data.closeTab(defaultSpace, 'two')
    assert.equal(data.getTabGroup('one').tabGroupId, null)
    assert.equal(data.getSidebarItems()[0].id, 'tab:one')
    await closing
    const added = await data.newGroupTab(defaultSpace)
    assert.equal(added.tabGroupId, 'group')
    await data.restoreClosedTab('two')
    assert.equal(data.getTabGroup('one').tabs.length, 3)
    assert.equal(data.getTabGroup('one').tabs.some(tab => tab.id === 'two'), true)
})

Deno.test('moving a lightbox to a tab appends to its parent group and preserves background focus', async () => {
    const { data, refresh, writes } = session({
        tabs: [
            tab('parent', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 0 }),
            tab('sibling', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 1 }),
            tab('outside', defaultSpace, { order: 0 }),
            tab('lightbox', defaultSpace, { opener: 'parent', lightbox: true })
        ], history: ['parent'], runtime: 'client'
    })
    await refresh()
    const promotion = data.promoteLightboxToTab('lightbox', 'parent', { focus: false })
    assert.deepEqual(Array.from(data.getTabGroup('parent').tabs, tab => tab.id), ['parent', 'sibling', 'lightbox'])
    assert.equal(data.getTabGroups().length, 2)
    assert.equal(data.spaceMeta.activeTabId, 'parent')
    assert.equal(data.previews.parent.lightbox, null)
    assert.equal(data.previews.parent.tabs.some(tab => tab.id === 'lightbox'), false)
    await promotion
    const saved = writes.filter(tab => tab._id === 'lightbox').at(-1)
    assert.equal(saved.tabGroupId, 'group')
    assert.equal(saved.order, 10)
    assert.equal(saved.lightbox, false)
    assert.equal(saved.preview, false)
    assert.equal(saved.archive, undefined)
})

Deno.test('lightbox visibility updates immediately when creating one without a database refresh', async () => {
    const { data, refresh } = session({ tabs: [tab('parent')], history: ['parent'], runtime: 'client' })
    await refresh()
    const creating = data.newTab(defaultSpace, { opener: 'parent', lightbox: true, url: 'https://other.example/' })
    const lightbox = Object.values(data.docs).find(tab => tab.lightbox)
    assert.equal(data.previews.parent?.lightbox, lightbox.id)
    assert.equal(data.previews.parent.tabs.length, 1)
    assert.equal(data.spaceMeta.activeTabId, 'parent')
    await creating
    assert.equal(data.previews.parent.lightbox, lightbox.id)
    assert.deepEqual(Array.from(data.getTabGroup('parent').tabs, tab => tab.id), ['parent'])
})

Deno.test('lightbox visibility updates immediately when converting a hover preview', async () => {
    const { data, refresh } = session({ tabs: [tab('parent'), tab('preview', defaultSpace, { opener: 'parent', preview: true, archive: 'preview' })], history: ['parent'], runtime: 'client' })
    await refresh()
    const converting = data.updateTab('preview', { preview: false, lightbox: true })
    assert.equal(data.previews.parent?.lightbox, 'preview')
    await converting
    assert.equal(data.previews.parent.lightbox, 'preview')
    await data.closeTab(defaultSpace, 'preview')
    assert.equal(data.previews.parent.lightbox, null)
    assert.equal(data.previews.parent.tabs.length, 0)
})

Deno.test('lightbox visibility survives refreshing a different space', async () => {
    const { data, refresh } = session({ tabs: [tab('parent'), tab('lightbox', defaultSpace, { opener: 'parent', lightbox: true }), tab('other', otherSpace)], history: ['parent'], runtime: 'client' })
    await refresh()
    assert.equal(data.previews.parent.lightbox, 'lightbox')
    await refresh(otherSpace)
    assert.equal(data.previews.parent.lightbox, 'lightbox')
    assert.equal(data.previews.parent.tabs.length, 1)
})

Deno.test('moving a lightbox from a standalone tab creates a group with that tab', async () => {
    const { data, refresh } = session({ tabs: [tab('parent'), tab('outside'), tab('lightbox', defaultSpace, { opener: 'parent', lightbox: true })], history: ['parent'] })
    await refresh()
    await data.promoteLightboxToTab('lightbox', 'parent')
    assert.deepEqual(Array.from(data.getTabGroup('parent').tabs, tab => tab.id), ['parent', 'lightbox'])
    assert.equal(data.spaceMeta.activeTabId, 'lightbox')
    assert.equal(data.docs.parent.tabGroupId, data.docs.lightbox.tabGroupId)
    assert.equal(data.getTabGroups().length, 2)
})

Deno.test('expanding a lightbox replaces its parent within the same group', async () => {
    const { data, refresh } = session({
        tabs: [tab('parent', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }), tab('sibling', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1 }), tab('lightbox', defaultSpace, { opener: 'parent', lightbox: true })],
        history: ['parent']
    })
    await refresh()
    await data.promoteLightboxToTab('lightbox', 'parent', { closeParent: true })
    assert.deepEqual(Array.from(data.getTabGroup('sibling').tabs, tab => tab.id), ['sibling', 'lightbox'])
    assert.equal(data.getTabGroup('lightbox').tabGroupId, 'group')
    assert.equal(data.docs.parent.archive, 'closed')
    assert.equal(data.spaceMeta.activeTabId, 'lightbox')
})

Deno.test('moving a lightbox from a pinned pane uses the current non-pinned group', async () => {
    const { data, refresh } = session({ tabs: [tab('anchor'), tab('parent', defaultSpace, { pinned: 'left' }), tab('lightbox', defaultSpace, { opener: 'parent', lightbox: true })], history: ['anchor'] })
    await refresh()
    data.activate('parent')
    await data.promoteLightboxToTab('lightbox', 'parent')
    assert.deepEqual(Array.from(data.getTabGroup('anchor').tabs, tab => tab.id), ['anchor', 'lightbox'])
    assert.equal(data.docs.parent.pinned, 'left')
})

Deno.test('cross-space group moves update both lists, persistence and the source active selection', async () => {
    const { data, refresh, writes } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1 }), tab('two', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 2 }), tab('outside'), tab('destination', otherSpace)], history: ['two', 'one', 'outside'] })
    await refresh()
    await data.moveTab('one', { scope: 'group', targetSpaceId: otherSpace, beforeTabId: 'destination' })
    assert.deepEqual(Array.from(data.spaces[defaultSpace].tabs, tab => tab.id), ['outside'])
    assert.equal(data.spaceMeta.activeTabId, 'outside')
    assert.deepEqual(Array.from(data.getTabGroup('one', otherSpace).tabs, tab => tab.id), ['one', 'two'])
    assert.equal(writes.filter(write => write.spaceId === otherSpace).length, 2)
})

Deno.test('Move to Space puts tabs and groups first in both manual and activity order', async () => {
    for (const activityMode of [false, true]) {
        for (const isGroup of [false, true]) {
            const { data, refresh, db } = session({ tabs: [
                tab('one', defaultSpace, { order: 100, tabGroupId: 'group', tabGroupOrder: 1 }),
                tab('two', defaultSpace, { order: 100, tabGroupId: 'group', tabGroupOrder: 2 }),
                tab('outside'),
                tab('destination', otherSpace, { order: -50, lastActivityAt: Date.now() + 100000 }),
                tab('divider', otherSpace, { type: 'divider', order: -100, lastActivityAt: Date.now() + 200000 })
            ], history: ['one'], runtime: 'client' })
            await refresh()
            if (activityMode) {
                data.toggleTabActivityMode()
            }
            const menuTab = isGroup ? { ...data.getTabGroup('one'), type: 'tabgroup', spaceId: defaultSpace } : data.docs.one
            await moveFromSpaceMenu(data, menuTab, isGroup)
            const firstId = mode => tabActivity.getActivitySidebarItems(data.getSidebarItems(otherSpace), data.docs, mode)[0].tabs?.[0].id
            assert.equal(firstId(false), 'one')
            assert.equal(firstId(true), 'one')
            assert.equal((await db.get('one')).spaceId, otherSpace)
            assert.equal(data.docs.two.spaceId, isGroup ? otherSpace : defaultSpace)
            if (isGroup) {
                assert.deepEqual(Array.from(data.getTabGroup('one', otherSpace).tabs, tab => tab.id), ['one', 'two'])
            } else {
                assert.equal(data.docs.one.tabGroupId, null)
            }
            await refresh(otherSpace)
            assert.equal(firstId(false), 'one')
            assert.equal(firstId(true), 'one')
        }
    }
})

Deno.test('Move to Space keeps sidebar pins and appends them to their destination pin stack', async () => {
    for (const sidebarPinned of [true, 'fixed']) {
        const { data, refresh, db } = session({ tabs: [
            tab('moving', defaultSpace, { sidebarPinned, sidebarPinOrder: -100, tabGroupId: 'source' }),
            tab('sibling', defaultSpace, { tabGroupId: 'source' }),
            tab('first', otherSpace, { sidebarPinned, sidebarPinOrder: 10 }),
            tab('last', otherSpace, { sidebarPinned, sidebarPinOrder: 20 }),
            tab('normal', otherSpace)
        ], history: ['sibling'], runtime: 'client' })
        await refresh()
        await moveFromSpaceMenu(data, data.docs.moving)
        assert.equal(data.docs.moving.sidebarPinned, sidebarPinned)
        assert.equal(data.docs.moving.tabGroupId, null)
        assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[otherSpace].tabs, sidebarPinned === 'fixed').map(tab => tab.id), ['first', 'last', 'moving'])
        assert.equal((await db.get('moving')).sidebarPinned, sidebarPinned)
        await refresh(otherSpace)
        assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[otherSpace].tabs, sidebarPinned === 'fixed').map(tab => tab.id), ['first', 'last', 'moving'])
    }
})

Deno.test('Move to Space puts groups first while carrying their pins to the bottom of each pin stack', async () => {
    const { data, refresh } = session({ tabs: [
        tab('one', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('pin', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1, pinned: 'left', pinScope: 'group', pinOrder: -10 }),
        tab('saved', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 2, sidebarPinned: true, sidebarPinOrder: -10 }),
        tab('outside'),
        tab('destination', otherSpace, { order: -100 }),
        tab('existing-pin', otherSpace, { pinned: 'right', pinScope: 'space', pinOrder: 10 }),
        tab('existing-saved', otherSpace, { sidebarPinned: true, sidebarPinOrder: 10 })
    ], history: ['one'], runtime: 'client' })
    await refresh()
    await moveFromSpaceMenu(data, { ...data.getTabGroup('one'), type: 'tabgroup', spaceId: defaultSpace }, true)
    assert.equal(tabActivity.getActivitySidebarItems(data.getSidebarItems(otherSpace), data.docs, false)[0].tabs[0].id, 'one')
    assert.deepEqual(Array.from(data.getSidepins(otherSpace, 'one'), tab => tab.id), ['existing-pin', 'pin'])
    assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[otherSpace].tabs).map(tab => tab.id), ['existing-saved', 'saved'])
    assert.equal(data.docs.pin.pinScope, 'group')
    assert.equal(data.docs.saved.sidebarPinned, true)
})

Deno.test('Move to Space preserves individual sidepins and appends them after destination pins', async () => {
    for (const pinScope of ['space', 'group', undefined]) {
        const { data, refresh, db } = session({ tabs: [
            tab('moving', defaultSpace, { pinned: 'left', pinScope, pinOrder: -100, tabGroupId: 'source' }),
            tab('sibling', defaultSpace, { tabGroupId: 'source' }),
            tab('existing', otherSpace, { pinned: 'right', pinScope: 'space', pinOrder: 20 }),
            tab('normal', otherSpace)
        ], history: ['sibling'], runtime: 'client' })
        await refresh()
        await moveFromSpaceMenu(data, data.docs.moving)
        assert.equal(data.docs.moving.pinned, 'left')
        assert.equal(data.docs.moving.pinScope, pinScope || 'group')
        assert.deepEqual(Array.from(data.getSidepins(otherSpace, 'moving'), tab => tab.id), ['existing', 'moving'])
        assert.equal((await db.get('moving')).pinOrder, 21)
    }
})

Deno.test('ungrouping releases members in place and persists their order without changing selection or pins', async () => {
    const { data, refresh, db, writes } = session({ tabs: [
        tab('before', defaultSpace, { order: 0 }),
        tab('two', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 2 }),
        tab('one', defaultSpace, { order: 30, tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('pin', defaultSpace, { order: 10, tabGroupId: 'group', tabGroupOrder: 1, pinned: 'right', pinScope: 'group', pinOrder: 4 }),
        tab('divider', defaultSpace, { type: 'divider', order: 10 }),
        tab('other-one', defaultSpace, { order: 15, tabGroupId: 'other-group', tabGroupOrder: 1 }),
        tab('other-two', defaultSpace, { order: 15, tabGroupId: 'other-group', tabGroupOrder: 0 }),
        tab('after', defaultSpace, { order: 20 }),
        tab('closed', defaultSpace, { tabGroupId: 'group', archive: 'closed' })
    ], history: ['two', 'before', 'one', 'pin'], runtime: 'client' })
    await refresh()
    await data.updateTabGroup('group', { name: 'Research', color: '#123456', emoji: '🔎' })
    const history = JSON.stringify(data.spaces[defaultSpace].activeTabsOrder)
    const spaceOrder = Array.from(data.spaceMeta.spaceOrder)
    const expected = ['before', 'one', 'pin', 'two', 'divider', 'other-two', 'after']
    const sidebarIds = () => Array.from(data.getSidebarItems(), item => item.tabs?.[0].id || item.id)
    const ungrouping = data.ungroupTabGroup('two')
    assert.deepEqual(sidebarIds(), expected, 'ungrouping updates the view immediately, before persistence finishes')
    await ungrouping
    assert.deepEqual(Array.from(data.spaceMeta.spaceOrder), spaceOrder)
    assert.equal(data.spaceMeta.activeSpace, defaultSpace)
    assert.equal(data.spaceMeta.activeTabId, 'two')
    assert.equal(JSON.stringify(data.spaces[defaultSpace].activeTabsOrder), history)
    assert.equal(data.docs.pin.pinScope, 'group')
    assert.equal(data.docs.pin.pinned, 'right')
    assert.equal(data.docs.pin.pinOrder, 4)
    assert.equal(data.docs.closed.tabGroupId, 'group')
    assert.deepEqual(Array.from(data.getTabGroup('other-one').tabs, tab => tab.id), ['other-two', 'other-one'])
    for (const [index, id] of ['one', 'pin', 'two'].entries()) {
        const saved = await db.get(id)
        assert.equal(saved.spaceId, defaultSpace)
        assert.equal(saved.tabGroupId, null)
        assert.equal(saved.tabGroupOrder, null)
        assert.equal(saved.order, index + 1)
    }
    assert.equal((await db.get('divider')).order, 4)
    assert.equal(writes.some(doc => doc.type === 'tab' && doc.url === 'about:newtab'), false)
    await refresh()
    assert.equal(data.spaceMeta.activeTabId, 'two')
    assert.deepEqual(sidebarIds(), expected)
})

Deno.test('ungrouping an inactive group never activates its remembered tab or changes the current top tabs', async () => {
    for (const targetSpace of [defaultSpace, otherSpace]) {
        const storage = new Map([[`tabActiveHistory:window-1:${otherSpace}`, JSON.stringify(['inactive-two', 'inactive-one'])]])
        const { data, refresh } = session({ tabs: [
            tab('current-one', defaultSpace, { order: 10, tabGroupId: 'current', tabGroupOrder: 0 }),
            tab('current-two', defaultSpace, { order: 10, tabGroupId: 'current', tabGroupOrder: 1 }),
            tab('inactive-one', targetSpace, { order: 0, tabGroupId: 'inactive', tabGroupOrder: 0 }),
            tab('inactive-two', targetSpace, { order: 0, tabGroupId: 'inactive', tabGroupOrder: 1 })
        ], history: ['current-two', 'inactive-two', 'current-one', 'inactive-one'], storage, runtime: 'client' })
        await refresh()
        const readTabs = new Function('$', 'data', 'closed', readTopTabsSource.replace(/\nreadTabs$/, '\nreturn readTabs'))(svelteClient, data, svelteClient.proxy({}))
        const inactive = data.getTabGroup('inactive-one', targetSpace)
        assert.equal(data.getGroupActiveTab(inactive, targetSpace).id, 'inactive-two')
        const history = JSON.stringify(data.spaces[defaultSpace].activeTabsOrder)
        const targetHistory = JSON.stringify(data.spaces[targetSpace].activeTabsOrder)
        function assertSelectionUnchanged() {
            assert.equal(data.spaceMeta.activeSpace, defaultSpace)
            assert.equal(data.spaceMeta.activeTabId, 'current-two')
            assert.equal(data.getCurrentGroupTabId(), 'current-two')
            assert.equal(data.getTabGroup().tabGroupId, 'current')
            assert.deepEqual(Array.from(readTabs(), tab => tab.id), ['current-one', 'current-two'])
            assert.equal(JSON.stringify(data.spaces[defaultSpace].activeTabsOrder), history)
            assert.equal(JSON.stringify(data.spaces[targetSpace].activeTabsOrder), targetHistory)
        }
        assertSelectionUnchanged()
        const ungrouping = data.ungroupTabGroup('inactive-one', targetSpace)
        assertSelectionUnchanged()
        await ungrouping
        assertSelectionUnchanged()
        await refresh()
        assertSelectionUnchanged()
        assert.equal(data.getTabGroup('inactive-one', targetSpace).tabGroupId, null)
        assert.equal(data.getTabGroup('inactive-two', targetSpace).tabGroupId, null)
    }
})

Deno.test('ungrouping the only group creates no space or replacement and repeated calls are harmless', async () => {
    const { data, refresh, writes } = session({ tabs: [
        tab('one', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('two', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1 })
    ], history: ['two', 'one'] })
    await refresh()
    await data.ungroupTabGroup('one')
    assert.equal(data.spaceMeta.activeTabId, 'two')
    assert.deepEqual(Array.from(data.getSidebarItems(), item => item.tabs[0].id), ['one', 'two'])
    assert.equal(writes.length, 2)
    await data.ungroupTabGroup('one')
    await data.ungroupTabGroup('missing')
    await data.ungroupTabGroup('one', 'missing-space')
    assert.equal(writes.length, 2)
    await refresh()
    assert.deepEqual(Array.from(data.getSidebarItems(), item => item.tabs[0].id), ['one', 'two'])
})

Deno.test('closing a group includes its pins, preserves restorable membership and leaves unrelated tabs active', async () => {
    const { data, refresh, db } = session({ tabs: [
        tab('one', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('two', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1, pinned: 'left', pinScope: 'group' }),
        tab('outside')
    ], history: ['outside', 'two', 'one'] })
    await refresh()
    await data.closeTabGroup('one')
    assert.equal(data.spaceMeta.activeTabId, 'outside')
    assert.deepEqual(Array.from(data.spaces[defaultSpace].tabs, tab => tab.id), ['outside'])
    assert.deepEqual(Array.from(data.spaceMeta.closedTabs, tab => tab.id).sort(), ['one', 'two'])
    for (const id of ['one', 'two']) {
        const saved = await db.get(id)
        assert.equal(saved.archive, 'closed')
        assert.equal(saved.closed, true)
        assert.equal(saved.tabGroupId, 'group')
    }
    await data.restoreClosedTab('one')
    await data.restoreClosedTab('two')
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two'])
})

Deno.test('closing the only group creates one replacement and normal space creation still starts with one tab', async () => {
    const { data, refresh, writes } = session({ tabs: [
        tab('one', defaultSpace, { tabGroupId: 'group' }), tab('two', defaultSpace, { tabGroupId: 'group' })
    ], history: ['two', 'one'] })
    await refresh()
    await data.closeTabGroup('one')
    assert.equal(data.spaces[defaultSpace].tabs.length, 1)
    assert.equal(data.spaces[defaultSpace].tabs[0].id, data.spaceMeta.activeTabId)
    assert.equal(writes.filter(doc => doc.type === 'tab' && doc.url === 'about:newtab').length, 1)
    const space = await data.newSpace()
    assert.equal(space.tabs.length, 1)
    assert.equal(space.tabs[0].url, 'about:newtab')
    assert.equal(data.spaceMeta.spaceOrder.includes(space._id), true)
})

Deno.test('closing the only group with sidepins creates one standalone replacement', async () => {
    for (const pinFirst of [false, true]) {
        const { data, refresh, writes } = session({ tabs: [
            tab('center', defaultSpace, { tabGroupId: 'group', tabGroupOrder: pinFirst ? 1 : 0 }),
            tab('pin', defaultSpace, { tabGroupId: 'group', tabGroupOrder: pinFirst ? 0 : 1, pinned: 'right', pinScope: 'group' }),
            tab('space-pin', defaultSpace, { pinned: 'left' })
        ], history: ['center'] })
        await refresh()
        await data.closeTabGroup('center')
        const replacements = data.spaces[defaultSpace].tabs.filter(tab => !tab.pinned)
        assert.equal(replacements.length, 1)
        assert.equal(replacements[0].tabGroupId, null)
        assert.equal(data.spaceMeta.activeTabId, replacements[0].id)
        assert.equal(writes.filter(doc => doc.type === 'tab' && doc.url === 'about:newtab').length, 1)
        assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['space-pin'])
    }
})

Deno.test('adding a group member preserves the rank of a temporarily closed middle tab', async () => {
    const { data, refresh } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 0 }), tab('two', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 1 }), tab('three', defaultSpace, { tabGroupId: 'group', tabGroupOrder: 2 })], history: ['one'] })
    await refresh()
    await data.closeTab(defaultSpace, 'two')
    const added = await data.newGroupTab(defaultSpace)
    await data.restoreClosedTab('two')
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two', 'three', added.id])
})

Deno.test('pinning preserves membership and canvas scene saves never create group documents', async () => {
    const { data, refresh, writes } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'group' }), tab('two', defaultSpace, { tabGroupId: 'group' })] })
    await refresh()
    await data.pin({ tabId: 'two', pinned: 'right' })
    assert.equal(data.docs.two.tabGroupId, 'group')
    assert.equal(data.docs.two.pinScope, 'group')
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two'])
    await data.pin({ tabId: 'two', pinned: null })
    assert.equal(data.docs.two.tabGroupId, 'group')
    data.updateCanvasShapes(defaultSpace, [{ id: 'tab-group-frame:group', type: 'frame', customData: { virtualTabGroup: true } }])
    assert.equal(writes.every(write => write.type === 'tab'), true)
    assert.equal(data.spaces[defaultSpace].tabs.some(tab => tab.type === 'shape'), false)
})

Deno.test('group pins update top tabs immediately and unpin into their original member position', async () => {
    const { data, refresh, db } = session({
        tabs: ['one', 'two', 'three'].map((id, index) => tab(id, defaultSpace, { tabGroupId: 'group', tabGroupOrder: index })),
        history: ['two', 'one'], runtime: 'client'
    })
    await refresh()
    const readTabs = new Function('$', 'data', 'closed', readTopTabsSource.replace(/\nreadTabs$/, '\nreturn readTabs'))(svelteClient, data, svelteClient.proxy({}))
    assert.deepEqual(Array.from(readTabs(), tab => tab.id), ['one', 'two', 'three'])
    const pinning = data.pin({ tabId: 'two', pinned: 'left' })
    assert.deepEqual(Array.from(readTabs(), tab => tab.id), ['one', 'three'])
    assert.equal(data.spaceMeta.activeTabId, 'one')
    assert.equal(data.docs.two.tabGroupOrder, 1)
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['two'])
    await pinning
    await data.pin({ tabId: 'two', pinned: null })
    assert.deepEqual(Array.from(readTabs(), tab => tab.id), ['one', 'two', 'three'])
    assert.equal((await db.get('two')).tabGroupOrder, 1)
    assert.equal(data.getSidepins().length, 0)
})

Deno.test('pin scope is per tab, survives restart and can attach a space pin to the current group', async () => {
    const { data, refresh, db } = session({
        tabs: [tab('one', defaultSpace, { tabGroupId: 'a' }), tab('pin', defaultSpace, { tabGroupId: 'a' }),
            tab('other', defaultSpace, { tabGroupId: 'b' }), tab('other-pin', defaultSpace, { tabGroupId: 'b' })],
        history: ['one'], runtime: 'client'
    })
    await refresh()
    await data.pin({ tabId: 'pin', pinned: 'left' })
    await data.pin({ tabId: 'other-pin', pinned: 'right' })
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['pin'])
    data.activate('other')
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['other-pin'])
    await data.pin({ tabId: 'pin', pinned: 'left', scope: 'space' })
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id).sort(), ['other-pin', 'pin'])
    assert.equal(data.docs.pin.tabGroupId, 'a')
    assert.deepEqual(Array.from(data.getSpacePins(), tab => tab.id), ['pin'])
    await data.pin({ tabId: 'pin', pinned: 'left', scope: 'group' })
    assert.equal(data.docs.pin.tabGroupId, 'b')
    assert.equal(data.docs['other-pin'].pinScope, 'group')
    const restarted = session({ tabs: await Promise.all(['one', 'pin', 'other', 'other-pin'].map(id => db.get(id))), history: ['one'] })
    await restarted.refresh()
    assert.equal(restarted.data.getSidepins().length, 0)
    restarted.data.activate('other')
    assert.deepEqual(Array.from(restarted.data.getSidepins(), tab => tab.id).sort(), ['other-pin', 'pin'])
    await restarted.data.pin({ tabId: 'pin', pinned: null })
    assert.equal(restarted.data.getTabGroup('pin').tabs.some(tab => tab.id === 'other'), true)
})

Deno.test('pinning the only center tab immediately creates and selects a new tab in its group', async () => {
    const { data, refresh } = session({ tabs: [tab('solo'), tab('outside')], history: ['solo', 'outside'], runtime: 'client' })
    await refresh()
    const pinning = data.pin({ tabId: 'solo', pinned: 'right' })
    const added = data.docs[data.spaceMeta.activeTabId]
    assert.equal(added.url, 'about:newtab')
    assert.equal(data.getCurrentGroupTabId(), added.id)
    assert.equal(data.getLastActiveNonPinnedTabId(), added.id)
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['solo'])
    await pinning
    assert.equal(data.docs.solo.tabGroupId, added.tabGroupId)
    await data.pin({ tabId: added.id, pinned: 'left' })
    const next = data.docs[data.spaceMeta.activeTabId]
    assert.equal(next.url, 'about:newtab')
    assert.notEqual(next.id, added.id)
    assert.equal(next.tabGroupId, added.tabGroupId)
    assert.equal(data.getTabGroup(next.id).tabs.filter(tab => !tab.pinned).length, 1)
})

Deno.test('pinning a last group center tab preserves its group and background focus for every pin scope', async () => {
    for (const scope of ['group', 'space', 'global']) {
        for (const foreground of [true, false]) {
            const { data, refresh, db } = session({ tabs: [
                tab('center', defaultSpace, { tabGroupId: 'group' }),
                tab('pin', defaultSpace, { tabGroupId: 'group', pinned: 'left', pinScope: 'group' }),
                tab('outside')
            ], history: [foreground ? 'center' : 'outside'], runtime: 'client' })
            await refresh()
            const pinning = data.pin({ tabId: 'center', pinned: 'right', scope })
            const centers = data.getTabGroup('pin').tabs.filter(tab => !tab.pinned)
            assert.equal(centers.length, 1)
            const replacement = centers[0]
            assert.equal(replacement.url, 'about:newtab')
            assert.equal(replacement.tabGroupId, 'group')
            assert.equal(data.spaceMeta.activeTabId, foreground ? replacement.id : 'outside')
            await pinning
            assert.equal((await db.get(replacement.id)).tabGroupId, 'group')
            await data.pin({ tabId: 'center', pinned: 'left', scope })
            await refresh()
            assert.deepEqual(Array.from(data.getTabGroup('pin').tabs.filter(tab => !tab.pinned), tab => tab.id), [replacement.id])
        }
    }
})

Deno.test('activating a group pin selects its own group rather than the most recent other group', async () => {
    const { data, refresh } = session({
        tabs: [tab('center', defaultSpace, { tabGroupId: 'a' }), tab('pin', defaultSpace, { tabGroupId: 'a', pinned: 'left', pinScope: 'group' }), tab('other')],
        history: ['other'], runtime: 'client'
    })
    await refresh()
    data.activate('pin')
    assert.equal(data.getCurrentGroupTabId(), 'pin')
    assert.equal(data.getLastActiveNonPinnedTabId(), 'center')
    const readTabs = new Function('$', 'data', 'closed', readTopTabsSource.replace(/\nreadTabs$/, '\nreturn readTabs'))(svelteClient, data, svelteClient.proxy({}))
    assert.deepEqual(Array.from(readTabs(), tab => tab.id), ['center'])
})

Deno.test('reordering sidepins leaves tab and group positions unchanged', async () => {
    const { data, refresh, db } = session({
        tabs: ['one', 'two', 'three'].map((id, index) => tab(id, defaultSpace, { tabGroupId: 'group', order: 10, tabGroupOrder: index })),
        history: ['one']
    })
    await refresh()
    await data.pin({ tabId: 'two', pinned: 'left' })
    await data.pin({ tabId: 'three', pinned: 'left', afterTabId: 'two' })
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['three', 'two'])
    assert.equal(data.docs.three.order, 10)
    assert.equal(data.docs.three.tabGroupOrder, 2)
    await data.moveTab('three', { scope: 'pinned', beforeTabId: 'two' })
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['two', 'three'])
    await data.pin({ tabId: 'three', pinned: null })
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two', 'three'])
    assert.equal((await db.get('three')).order, 10)
})

Deno.test('moving a group to another space carries group pins while space pins stay in their space', async () => {
    const { data, refresh, db } = session({
        tabs: [tab('one', defaultSpace, { tabGroupId: 'group' }), tab('pin', defaultSpace, { tabGroupId: 'group', pinned: 'left', pinScope: 'group' }),
            tab('space-pin', defaultSpace, { tabGroupId: 'group', pinned: 'right', pinScope: 'space' }), tab('outside')],
        history: ['one']
    })
    await refresh()
    await data.moveTab('one', { scope: 'group', targetSpaceId: otherSpace })
    assert.equal(data.docs.pin.spaceId, otherSpace)
    assert.equal(data.docs.pin.pinned, 'left')
    assert.equal(data.docs.pin.pinScope, 'group')
    assert.equal(data.docs['space-pin'].spaceId, defaultSpace)
    data.activateSpace(otherSpace)
    data.activate('one')
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['pin'])
    assert.equal((await db.get('pin')).spaceId, otherSpace)
})

Deno.test('dragging from another space into a sidepin joins the destination group', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one'), tab('source', otherSpace)], history: ['one'] })
    await refresh()
    await data.pin({ tabId: 'source', pinned: 'right', targetSpaceId: defaultSpace, groupTabId: 'one' })
    assert.equal(data.docs.source.spaceId, defaultSpace)
    assert.equal(data.docs.source.pinScope, 'group')
    assert.equal(data.docs.source.tabGroupId, data.docs.one.tabGroupId)
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['source'])
    assert.equal((await db.get('source')).pinned, 'right')
})

Deno.test('older pins without recoverable membership remain space pins until scoped explicitly', async () => {
    const { data, refresh } = session({ tabs: [tab('one'), tab('legacy', defaultSpace, { pinned: 'left' })], history: ['one'] })
    await refresh()
    assert.equal(data.getPinScope(data.docs.legacy), 'space')
    assert.deepEqual(Array.from(data.getSpacePins(), tab => tab.id), ['legacy'])
    await data.pin({ tabId: 'legacy', pinned: 'left', scope: 'group' })
    assert.equal(data.docs.legacy.pinScope, 'group')
    assert.equal(data.docs.legacy.tabGroupId, data.docs.one.tabGroupId)
})

Deno.test('global pins persist across spaces and return to ordinary tabs when dragged out', async () => {
    const { data, refresh, db } = session({
        tabs: [tab('one'), tab('source'), tab('other', otherSpace)], history: ['one'], runtime: 'client'
    })
    await refresh()
    await data.pin({ tabId: 'source', pinned: 'left', scope: 'global' })
    assert.deepEqual(Array.from(data.spaceMeta.globalPins, tab => tab.id), ['source'])
    assert.deepEqual(Array.from(data.getSpacePins(), tab => tab.id), [])
    assert.deepEqual(Array.from(data.getSidepins(otherSpace), tab => tab.id), ['source'])
    assert.equal(data.getSidebarItems().some(item => item.tabs?.some(tab => tab.id === 'source')), false)
    assert.equal((await db.get('source')).pinScope, 'global')
    await refresh()
    assert.deepEqual(Array.from(data.spaceMeta.globalPins, tab => tab.id), ['source'])
    await data.moveTab('source', { targetSpaceId: otherSpace, afterTabId: 'other', targetGroupTabId: null })
    assert.equal(data.spaceMeta.globalPins.length, 0)
    assert.equal(data.docs.source.pinned, null)
    assert.equal(data.docs.source.pinScope, null)
    assert.equal(data.docs.source.spaceId, otherSpace)
    assert.equal((await db.get('source')).pinned, null)
})

Deno.test('installing URL and repository apps honors app pins and persists their launch URL and identity', async () => {
    for (const type of ['url', 'repo']) {
        for (const pinToAppPins of [true, false]) {
            const { data, refresh, db } = session({ tabs: [tab('normal')], history: ['normal'], runtime: 'client' })
            await refresh()
            const url = type === 'url' ? 'https://hello.example/' : 'https://web_hello--p8080.app.localhost'
            const installer = appInstaller(data, async () => [
                { configFiles: '/stacks/other/compose.yaml', endpoints: [{ url: 'https://wrong.example/' }] },
                { configFiles: '/stacks/examples/hello/compose.yaml', endpoints: [] },
                { configFiles: '/stacks/examples/hello/compose.yaml', endpoints: [{ url }] }
            ])
            const app = { name: 'Hello Docker', iconUrl: 'https://hello.example/icon.png', pinToAppPins,
                url: type === 'url' ? url : '', pathType: 'compose', path: './compose.yaml' }
            await installer.addApp({ type, app, checkout: type === 'repo' ? { path: 'examples/hello' } : undefined })
            assert.equal(data.spaceMeta.globalPins.length, Number(pinToAppPins))
            assert.equal(data.spaceMeta.activeTabId, 'normal', 'installing a pin must keep the current tab selected')
            assert.equal(installer.exampleApps.length, type === 'url' ? 1 : 0)
            if (pinToAppPins) {
                const [pin] = data.spaceMeta.globalPins
                const saved = await db.get(pin.id)
                assert.equal(saved.url, url)
                assert.equal(saved.pinned, 'normal')
                assert.equal(saved.pinScope, 'global')
                assert.equal(saved.titleOverride, app.name)
                assert.equal(saved.faviconOverride, app.iconUrl)
                await refresh()
                assert.deepEqual(Array.from(data.spaceMeta.globalPins, tab => tab.id), [pin.id])
                assert.deepEqual(Array.from(data.getSidepins(otherSpace), tab => tab.id), [], 'Normal app pins do not occupy sidepin panes')
                assert.equal(data.spaceMeta.globalPins[0].id, pin.id, 'app pins remain available in every space')
            }
        }
    }
})

Deno.test('repository installation waits for discovery and never pins a different checkout or an empty URL', async () => {
    const { data, refresh } = session({ tabs: [tab('normal')], history: ['normal'], runtime: 'client' })
    await refresh()
    let resolveRefresh
    const installer = appInstaller(data, () => new Promise(resolve => { resolveRefresh = resolve }))
    const installing = installer.addApp({ type: 'repo', app: { pinToAppPins: true, pathType: 'compose', path: 'compose.yaml' }, checkout: { path: 'hello' } })
    assert.equal(data.spaceMeta.globalPins.length, 0)
    resolveRefresh([{ configFiles: '/stacks/not-hello/compose.yaml', endpoints: [{ url: 'https://wrong.example/' }] }])
    await assert.rejects(installing, /no launch URL is available to pin/)
    assert.equal(data.spaceMeta.globalPins.length, 0)
    assert.equal(Object.values(data.docs).filter(doc => doc.type === 'tab').length, 1)
})

Deno.test('full pins default to Normal and open alone without joining or replacing the previous group', async () => {
    const { data, refresh, db, storage } = session({ tabs: [tab('one'), tab('two', defaultSpace, { tabGroupId: 'research', tabGroupOrder: 0 }), tab('three', defaultSpace, { tabGroupId: 'research', tabGroupOrder: 1 })], history: ['two'], runtime: 'client' })
    await refresh()
    await data.pin({ tabId: 'one', scope: 'global' })
    assert.equal(data.docs.one.pinned, 'normal')
    assert.equal(data.spaces[defaultSpace].tabs.filter(tab => tab.type === 'tab').length, 3)
    data.activate('one')
    assert.equal(data.getCurrentGroupTabId(), 'one')
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one'])
    assert.equal(data.getSidepins().some(tab => tab.id === 'one'), false)
    await data.moveTab('two', { targetGroupTabId: 'one' })
    assert.equal(data.docs.two.tabGroupId, 'research', 'a Normal pin stays isolated when another tab targets its header')
    await data.setPinMenuWidth('one', 612)
    const restarted = session({ tabs: await Promise.all(['one', 'two', 'three'].map(id => db.get(id))), storage, runtime: 'client' })
    await restarted.refresh()
    assert.equal(restarted.data.docs.one.pinned, 'normal')
    assert.equal(restarted.data.docs.one.pinMenuWidth, 612)
    assert.equal(restarted.data.spaceMeta.activeTabId, 'one')
    data.activate('two')
    assert.deepEqual(Array.from(data.getTabGroup('two').tabs, tab => tab.id), ['two', 'three'])
})

Deno.test('sidebar group pin transfers preserve membership, manual member order and persistence', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'research', tabGroupOrder: 0 }), tab('two', defaultSpace, { tabGroupId: 'research', tabGroupOrder: 1 }), tab('outside')], history: ['one'], runtime: 'client' })
    await refresh()
    data.ui.tabActivityMode = true
    await data.pinSidebarTab({ tabId: 'one', scope: 'group', fixed: true })
    assert.deepEqual(tabGroups.getSidebarPinnedItems(data.spaces[defaultSpace].tabs, true).map(item => item.tabs.map(tab => tab.id)), [['one', 'two']])
    assert.deepEqual(Array.from(data.getSidebarItems(), item => item.tabs[0].id), ['outside'])
    await data.pinSidebarTab({ tabId: 'one', scope: 'group' })
    assert.equal(data.docs.two.sidebarPinned, true)
    assert.equal(data.docs.two.tabGroupId, 'research')
    const child = await data.newTab(defaultSpace, { groupTabId: 'one' })
    assert.equal(child.sidebarPinned, true)
    assert.equal(child.tabGroupId, 'research')
    await data.pinSidebarTab({ tabId: 'one', pinned: false, scope: 'group' })
    assert.equal((await db.get('two')).sidebarPinned, null)
    assert.equal(data.getTabGroup('one').tabs.length, 3)
})

Deno.test('joining a fixed sidebar group pins the incoming member and moving it out detaches only that tab', async () => {
    const { data, refresh } = session({ tabs: [tab('one', defaultSpace, { tabGroupId: 'research' }), tab('two', defaultSpace, { tabGroupId: 'research' }), tab('outside')], history: ['one'], runtime: 'client' })
    await refresh()
    await data.pinSidebarTab({ tabId: 'one', scope: 'group', fixed: true })
    await data.pinSidebarTab({ tabId: 'outside', fixed: true, targetGroupTabId: 'one' })
    assert.equal(data.docs.outside.sidebarPinned, 'fixed')
    assert.equal(data.docs.outside.tabGroupId, 'research')
    await data.pinSidebarTab({ tabId: 'outside' })
    assert.equal(data.docs.outside.tabGroupId, null)
    assert.equal(data.docs.one.sidebarPinned, 'fixed')
    assert.equal(data.docs.two.tabGroupId, 'research')
    await data.pinSidebarTab({ tabId: 'two', pinned: false })
    assert.equal(data.docs.two.tabGroupId, null, 'unpinning one member detaches it instead of splitting a group across sections')
    assert.equal(data.docs.one.sidebarPinned, 'fixed')
})

Deno.test('title-bar member drops preserve pinned group location and traditional member order', async () => {
    const { data, refresh, db } = session({ tabs: ['one', 'two', 'three'].map((id, index) => tab(id, defaultSpace, { tabGroupId: 'research', tabGroupOrder: index })), history: ['one'], runtime: 'client' })
    await refresh()
    await data.pinSidebarTab({ tabId: 'one', scope: 'group', fixed: true })
    data.ui.tabActivityMode = true
    await handleDrop(data)({ type: 'reorder', tabId: 'three', targetGroupTabId: 'one', afterTabId: 'one', targetSpaceId: defaultSpace, targetZone: 'topbar' })
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['three', 'one', 'two'])
    for (const id of ['one', 'two', 'three']) assert.equal((await db.get(id)).sidebarPinned, 'fixed')
})

Deno.test('sidebar pin order persists independently and new tabs always enter the normal section', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one'), tab('two'), tab('normal')], history: ['one'], runtime: 'client' })
    await refresh()
    await data.pinSidebarTab({ tabId: 'one' })
    await data.pinSidebarTab({ tabId: 'two', afterTabId: 'one' })
    assert.equal(data.docs.one.pinned, null)
    assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[defaultSpace].tabs).map(tab => tab.id), ['two', 'one'])
    assert.deepEqual(Array.from(data.getSidebarItems(), item => item.tabs[0].id), ['normal'])
    const newTab = await data.newTab(defaultSpace)
    assert.equal(!!newTab.sidebarPinned, false)
    assert.equal(!!newTab.pinned, false)
    assert.equal(data.getSidebarItems().some(item => item.tabs?.some(tab => tab.id === newTab.id)), true)
    await refresh()
    assert.equal((await db.get('one')).sidebarPinned, true)
    assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[defaultSpace].tabs).map(tab => tab.id), ['two', 'one'])
    await data.pinSidebarTab({ tabId: 'two', pinned: false })
    assert.equal(data.getSidebarItems().some(item => item.tabs?.some(tab => tab.id === 'two')), true)
    await data.moveTab('one', { targetSpaceId: defaultSpace, targetGroupTabId: null, afterTabId: 'normal' })
    assert.equal(data.docs.one.sidebarPinned, null)
    assert.equal((await db.get('one')).sidebarPinned, null)
})

Deno.test('fixed sidebar drops persist, reorder, transfer spaces and move between both pin sections', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one'), tab('two'), tab('scrolling'), tab('other', otherSpace)], history: ['one'], runtime: 'client' })
    await refresh()
    await data.pinSidebarTab({ tabId: 'scrolling' })
    const drop = handleDrop(data)
    await drop({ type: 'pin', tabId: 'one', pinScope: 'sidebar-fixed', targetSpaceId: defaultSpace })
    await data.pinSidebarTab({ tabId: 'two', fixed: true, afterTabId: 'one' })
    await refresh()
    assert.equal((await db.get('one')).sidebarPinned, 'fixed')
    assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[defaultSpace].tabs, true).map(tab => tab.id), ['two', 'one'])
    assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[defaultSpace].tabs).map(tab => tab.id), ['scrolling'])
    await data.pinSidebarTab({ tabId: 'other', fixed: true, targetSpaceId: defaultSpace })
    assert.equal((await db.get('other')).spaceId, defaultSpace)
    assert.equal((await db.get('other')).sidebarPinned, 'fixed')
    await data.pinSidebarTab({ tabId: 'two' })
    assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[defaultSpace].tabs).map(tab => tab.id), ['scrolling', 'two'])
    await data.pinSidebarTab({ tabId: 'scrolling', fixed: true })
    assert.deepEqual(tabGroups.getSidebarPinnedTabs(data.spaces[defaultSpace].tabs, true).map(tab => tab.id), ['one', 'other', 'scrolling'])
    const created = await data.newTab(defaultSpace)
    assert.equal(!!created.sidebarPinned, false)
    await drop({ type: 'create', itemType: 'tab', dropType: 'pin', pinScope: 'sidebar-fixed', targetSpaceId: defaultSpace })
    assert.equal(data.docs[data.spaceMeta.activeTabId].sidebarPinned, 'fixed')
    await data.pinSidebarTab({ tabId: 'one', pinned: false })
    assert.equal((await db.get('one')).sidebarPinned, null)
    await data.pin({ tabId: 'other', pinned: 'left', scope: 'space' })
    assert.equal(data.docs.other.sidebarPinned, null)
})

Deno.test('new group tabs stay below the divider when their parent is pinned in the sidebar', async () => {
    const { data, refresh } = session({ tabs: [tab('one'), tab('other')], history: ['one'] })
    await refresh()
    await data.pinSidebarTab({ tabId: 'one' })
    const newTab = await data.newGroupTab(defaultSpace)
    assert.equal(!!newTab.sidebarPinned, false)
    assert.deepEqual(Array.from(data.getSidebarItems()).flatMap(item => Array.from(item.tabs || [], tab => tab.id)).includes('one'), false)
    assert.equal(data.getSidebarItems().some(item => item.tabs?.some(tab => tab.id === newTab.id)), true)
    assert.equal(data.getTabGroup('one').tabs.some(tab => tab.id === newTab.id), true)
})

Deno.test('sidebar pins transfer between spaces and app pinning clears the sidebar pin', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one'), tab('other', otherSpace)], history: ['one'] })
    await refresh()
    await data.pinSidebarTab({ tabId: 'other', targetSpaceId: defaultSpace })
    assert.equal(data.docs.other.spaceId, defaultSpace)
    assert.equal((await db.get('other')).sidebarPinned, true)
    await data.pin({ tabId: 'other', pinned: 'left', scope: 'global' })
    assert.equal(data.docs.other.sidebarPinned, null)
    assert.deepEqual(Array.from(data.spaceMeta.globalPins, tab => tab.id), ['other'])
    await data.pinSidebarTab({ tabId: 'other' })
    assert.equal(data.spaceMeta.globalPins.length, 0)
    assert.equal(data.docs.other.pinned, null)
    assert.equal(data.docs.other.sidebarPinned, true)
})

Deno.test('pin drops preserve order when switching between space and global scopes', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one'), tab('two'), tab('three', otherSpace)], history: ['one'] })
    await refresh()
    await data.pin({ tabId: 'two', pinned: 'right', scope: 'global' })
    await data.pin({ tabId: 'three', pinned: 'left', scope: 'global', afterTabId: 'two' })
    assert.deepEqual(Array.from(data.spaceMeta.globalPins, tab => tab.id), ['three', 'two'])
    await data.pin({ tabId: 'two', pinned: 'right', scope: 'global', afterTabId: 'three' })
    assert.deepEqual(Array.from(data.spaceMeta.globalPins, tab => tab.id), ['two', 'three'])
    await data.pin({ tabId: 'three', pinned: 'left', scope: 'space', targetSpaceId: defaultSpace })
    assert.deepEqual(Array.from(data.spaceMeta.globalPins, tab => tab.id), ['two'])
    assert.deepEqual(Array.from(data.getSpacePins(), tab => tab.id), ['three'])
    assert.equal(data.docs.three.spaceId, defaultSpace)
    assert.equal((await db.get('three')).pinScope, 'space')
    await data.pin({ tabId: 'two', pinned: 'right', scope: 'space', targetSpaceId: defaultSpace, afterTabId: 'three' })
    assert.deepEqual(Array.from(data.getSpacePins(), tab => tab.id), ['two', 'three'])
    await data.moveTab('two', { targetSpaceId: defaultSpace, targetGroupTabId: 'one' })
    assert.equal(data.docs.two.pinned, null)
    assert.deepEqual(Array.from(data.getTabGroup('one').tabs, tab => tab.id), ['one', 'two'])
})

Deno.test('restart keeps a pin-only group selected even when another group has center tabs', async () => {
    const { data, refresh } = session({
        tabs: [tab('pin', defaultSpace, { pinned: 'left', pinScope: 'group' }), tab('other')], history: ['pin', 'other']
    })
    await refresh()
    assert.equal(data.spaceMeta.activeTabId, 'pin')
    assert.equal(data.getCurrentGroupTabId(), 'pin')
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['pin'])
})

Deno.test('creating a sidepin defaults to group scope and respects its group anchor', async () => {
    const { data, refresh, db } = session({ tabs: [tab('one')], history: ['one'] })
    await refresh()
    const pin = await data.newTab(defaultSpace, { pinned: 'right', groupTabId: 'one' })
    assert.equal(data.docs[pin.id].pinScope, 'group')
    assert.equal(pin.tabGroupId, data.docs.one.tabGroupId)
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), [pin.id])
    assert.equal((await db.get(pin.id)).pinScope, 'group')
})

Deno.test('restore preserves positions on attached displays and fits windows from disconnected displays', () => {
    const primary = { availLeft: 0, availTop: 40, availWidth: 1920, availHeight: 1040 }
    const secondary = { availLeft: -1600, availTop: 0, availWidth: 1600, availHeight: 1000 }
    const saved = { x: -1500, y: 50, width: 1200, height: 900 }
    assert.deepEqual(fitWindowBounds(saved, [primary, secondary]), saved)
    const spanning = { x: -400, y: 60, width: 1800, height: 900 }
    assert.deepEqual(fitWindowBounds(spanning, [primary, secondary]), spanning)
    assert.deepEqual(fitWindowBounds(saved, [primary]), { x: 0, y: 50, width: 1200, height: 900 })
    assert.equal(fitWindowBounds({ x: 0, y: 0, width: -1, height: 800 }, [primary]), null)

    let opened
    openWindowSession({ location: { href: 'https://darc.example/?darcWindowId=parent#new' }, open(...args) { opened = args } }, { windowId: 'child', bounds: saved }, [primary, secondary])
    assert.deepEqual(opened, ['https://darc.example/?darcWindowId=child', 'darc-window-child', 'popup,left=-1500,top=50,width=1200,height=900'])
})

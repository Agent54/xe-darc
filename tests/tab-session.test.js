import assert from 'node:assert/strict'
import vm from 'node:vm'
import { compileModule } from 'svelte/compiler'
import { getWindowSessionHints, getWindowSessionStartup, rememberWindowBounds, fitWindowBounds, openWindowSession } from '../app/lib/window-session.js'
import * as tabGroups from '../app/lib/tab-groups.js'
import * as svelteServer from 'svelte/internal/server'
import * as svelteClient from 'svelte/internal/client'

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

const defaultSpace = 'darc:space_default'
const otherSpace = 'darc:space_other'
const workerSource = Deno.readTextFileSync(new URL('../public/test-shared-worker.js', import.meta.url))

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

function session({ tabs, history = [], activeSpace = defaultSpace, windowId = 'window-1', storage = new Map(), delayedWindowId = false, runtime = 'server' }) {
    if (!storage.has(`activeSpaceId:${windowId}`)) {
        storage.set(`activeSpaceId:${windowId}`, activeSpace)
    }
    if (!storage.has(`tabActiveHistory:${windowId}:${activeSpace}`)) {
        storage.set(`tabActiveHistory:${windowId}:${activeSpace}`, JSON.stringify(history))
    }
    const records = [defaultSpace, otherSpace].map(_id => ({ _id, type: 'space', spaceId: _id }))
    records.push(...structuredClone(tabs))
    const queries = []
    const writes = []
    const db = {
        get: async id => {
            const record = records.find(doc => doc._id === id)
            if (!record) {
                throw { status: 404 }
            }
            return structuredClone(record)
        },
        bulkDocs: () => new Promise(() => {}),
        changes: () => ({ on() { return this } }),
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
        setInterval() {}
    }
    // Svelte only proxies objects created in its own realm.
    const { data, refresh } = runtime === 'client'
        ? new Function(...Object.keys(context), clientSource.replace('({ data, refresh });', 'return { data, refresh }'))(...Object.values(context))
        : vm.runInNewContext(source, context)
    return { data, refresh, window, storage, queries, writes, db }
}

Deno.test('a partial refresh at startup still restores the active tab from the complete session', async () => {
    const { data, refresh, queries, writes } = session({
        tabs: [tab('first'), tab('last-active'), tab('other', otherSpace)],
        history: [{ id: 'last-active', activatedAt: 100 }, { id: 'first', activatedAt: 50 }]
    })

    await refresh(otherSpace)

    assert.equal(data.spaceMeta.activeTabId, 'last-active')
    assert.deepEqual(Array.from(data.spaces[defaultSpace].tabs, tab => tab.id), ['first', 'last-active'])
    assert.equal(typeof queries[0].selector.spaceId, 'object')
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
    assert.equal(data.getTabGroups()[0].tabs[0].id, standalone.id)
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

Deno.test('pinning the only center tab keeps its group selected and group additions still work', async () => {
    const { data, refresh } = session({ tabs: [tab('solo'), tab('outside')], history: ['solo', 'outside'], runtime: 'client' })
    await refresh()
    await data.pin({ tabId: 'solo', pinned: 'right' })
    assert.equal(data.spaceMeta.activeTabId, 'solo')
    assert.equal(data.getCurrentGroupTabId(), 'solo')
    assert.equal(data.getLastActiveNonPinnedTabId(), null)
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['solo'])
    const added = await data.newGroupTab(defaultSpace, { shouldFocus: true })
    assert.equal(data.docs.solo.tabGroupId, added.tabGroupId)
    assert.deepEqual(Array.from(data.getSidepins(), tab => tab.id), ['solo'])
    await data.pin({ tabId: added.id, pinned: 'left' })
    assert.equal(data.getCurrentGroupTabId(), added.id)
    assert.equal(data.getLastActiveNonPinnedTabId(), null)
    await data.pin({ tabId: 'solo', pinned: null })
    assert.equal(data.getLastActiveNonPinnedTabId(), 'solo')
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

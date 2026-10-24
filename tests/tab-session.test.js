import assert from 'node:assert/strict'
import vm from 'node:vm'
import { compileModule } from 'svelte/compiler'
import { getWindowSessionHints, getWindowSessionStartup, rememberWindowBounds, fitWindowBounds, openWindowSession } from '../app/lib/window-session.js'

const source = compileModule(
    Deno.readTextFileSync(new URL('../app/data.svelte.js', import.meta.url)),
    { generate: 'server', filename: 'data.svelte.js' }
).js.code
    .replace(/^import .*$/gm, '')
    .replaceAll('import.meta.hot', 'false')
    .replace('export default data;', '({ data, refresh });')

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

function session({ tabs, history = [], activeSpace = defaultSpace, windowId = 'window-1', storage = new Map(), delayedWindowId = false }) {
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
            return { id: doc._id, rev: '2-test' }
        }
    }
    function PouchDB() { return db }
    PouchDB.plugin = () => {}
    const window = { darcWindowId: delayedWindowId ? null : windowId }
    const { data, refresh } = vm.runInNewContext(source, {
        PouchDB,
        findPlugin: {},
        bootstrap: [],
        testData: [],
        permissionTypes: [],
        projectColors: [{}, {}, {}, { color: '#000' }],
        throttle: fn => fn,
        tick: () => Promise.resolve(),
        window,
        localStorage: localStorageFor(storage),
        crypto,
        console: { log() {}, warn() {}, error(...args) { throw new Error(args.join(' ')) } },
        setInterval() {}
    })
    return { data, refresh, window, storage, queries, writes }
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

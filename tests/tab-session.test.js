import assert from 'node:assert/strict'
import vm from 'node:vm'
import { compileModule } from 'svelte/compiler'

const source = compileModule(
    Deno.readTextFileSync(new URL('../app/data.svelte.js', import.meta.url)),
    { generate: 'server', filename: 'data.svelte.js' }
).js.code
    .replace(/^import .*$/gm, '')
    .replaceAll('import.meta.hot', 'false')
    .replace('export default data;', '({ data, refresh });')

const defaultSpace = 'darc:space_default'
const otherSpace = 'darc:space_other'

function tab(id, spaceId = defaultSpace, extra = {}) {
    return { _id: id, _rev: '1-test', type: 'tab', spaceId, order: 1, url: 'https://example.com', ...extra }
}

function session({ tabs, history = [], activeSpace = defaultSpace, windowId = 'window-1', storage = new Map(), delayedWindowId = false }) {
    storage.set(`activeSpaceId:${windowId}`, activeSpace)
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
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value)
        },
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

Deno.test('restart restores a pinned tab when it was last active', async () => {
    const { data, refresh } = session({
        tabs: [tab('first'), tab('pinned', defaultSpace, { pinned: 'left' })],
        history: [{ id: 'pinned', activatedAt: 100 }, { id: 'first', activatedAt: 50 }]
    })

    await refresh()

    assert.equal(data.spaceMeta.activeTabId, 'pinned')
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

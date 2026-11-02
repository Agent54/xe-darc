import assert from 'node:assert/strict'
import { compileModule } from 'svelte/compiler'
import * as svelteClient from 'svelte/internal/client'

// Run the component's actual state, restoration and persistence effect with the client runtime.
const sidebar = Deno.readTextFileSync(new URL('../app/components/TabSidebar.svelte', import.meta.url))
const expansion = sidebar.slice(sidebar.indexOf('    // Tab group expansion state'), sidebar.indexOf('    let groupResize'))
const source = compileModule(`
    export function create(window, localStorage) {
        ${expansion}
        return {
            load: loadTabGroupExpansion,
            toggle: handleTabGroupToggle,
            toggleAll: handleAllTabGroupsToggle,
            get state() { return { allGroupsExpanded, tabGroupExpansion: { ...tabGroupExpansion } } }
        }
    }
`, { generate: 'client', filename: 'tab-group-expansion.svelte.js' }).js.code
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
const create = new Function('$', 'onMount', 'console', `${source}\nreturn create`)(svelteClient, () => {}, { warn() {} })

function session(storage, id) {
    const identity = Promise.withResolvers()
    const window = { darcWindowId: null, darcWindowIdPromise: identity.promise }
    const reads = []
    const writes = []
    let api
    const destroy = svelteClient.effect_root(() => {
        api = create(window, {
            getItem(key) { reads.push(key); return storage.get(key) ?? null },
            setItem(key, value) { writes.push(key); storage.set(key, value) }
        })
    })
    svelteClient.flush()
    return {
        api, reads, writes, destroy,
        assign() { window.darcWindowId = id; identity.resolve(id) },
        change(update) { svelteClient.flush(() => update(api)) },
        async load() { await api.load(); svelteClient.flush() }
    }
}

Deno.test('group restoration waits for the window ID before reading or saving defaults', async () => {
    const saved = JSON.stringify({ allGroupsExpanded: true, tabGroupExpansion: { 'space:group:a': false } })
    const storage = new Map([['tabGroupExpansion:one', saved]])
    const h = session(storage, 'one')
    try {
        const loading = h.load()
        h.change(api => api.toggle('space:group:a', false))
        assert.deepEqual(h.reads, [])
        assert.deepEqual(h.writes, [])
        h.assign()
        svelteClient.flush()
        assert.deepEqual(h.writes, [])
        await loading
        assert.deepEqual(h.api.state, JSON.parse(saved))
        assert.equal(storage.get('tabGroupExpansion:one'), saved)
        assert.deepEqual(h.reads, ['tabGroupExpansion:one'])
    } finally { h.destroy() }
})

Deno.test('individual expansion and collapsed overrides survive reload independently per window and space', async () => {
    const storage = new Map()
    const expected = [
        ['one', { allGroupsExpanded: false, tabGroupExpansion: { 'space:group:a': true, 'other:group:a': false } }],
        ['two', { allGroupsExpanded: true, tabGroupExpansion: { 'space:group:a': false } }]
    ]
    for (const [id, state] of expected) {
        const h = session(storage, id)
        try {
            h.assign()
            await h.load()
            if (state.allGroupsExpanded) h.change(api => api.toggleAll())
            for (const [group, expanded] of Object.entries(state.tabGroupExpansion)) {
                h.change(api => api.toggle(group, !expanded))
            }
        } finally { h.destroy() }
    }
    for (const [id, state] of expected) {
        const h = session(storage, id)
        try {
            h.assign()
            await h.load()
            assert.deepEqual(h.api.state, state)
        } finally { h.destroy() }
    }
    assert.deepEqual([...storage.keys()], ['tabGroupExpansion:one', 'tabGroupExpansion:two'])
})

Deno.test('expand-all and collapse-all persist and clear individual overrides', async () => {
    const storage = new Map()
    const h = session(storage, 'one')
    try {
        h.assign()
        await h.load()
        for (const expanded of [true, false]) {
            h.change(api => api.toggle('space:group:a', expanded))
            h.change(api => api.toggleAll())
            assert.deepEqual(JSON.parse(storage.get('tabGroupExpansion:one')), {
                allGroupsExpanded: expanded, tabGroupExpansion: {}
            })
        }
    } finally { h.destroy() }
})

Deno.test('new windows ignore shared and other-window expansion preferences', async () => {
    const saved = JSON.stringify({ allGroupsExpanded: true, tabGroupExpansion: { 'space:group:a': true } })
    const storage = new Map([['tabGroupExpansion', saved], ['tabGroupExpansion:existing', saved]])
    const h = session(storage, 'new')
    try {
        h.assign()
        await h.load()
        assert.deepEqual(h.api.state, { allGroupsExpanded: false, tabGroupExpansion: {} })
        assert.equal(storage.get('tabGroupExpansion:existing'), saved)
        assert.equal(storage.get('tabGroupExpansion'), saved)
    } finally { h.destroy() }
})

Deno.test('invalid saved expansion uses defaults and only accepts boolean group overrides', async () => {
    for (const [saved, expected] of [
        ['{broken', { allGroupsExpanded: false, tabGroupExpansion: {} }],
        ['null', { allGroupsExpanded: false, tabGroupExpansion: {} }],
        ['{"allGroupsExpanded":"true","tabGroupExpansion":[]}', { allGroupsExpanded: false, tabGroupExpansion: {} }],
        ['{"allGroupsExpanded":true,"tabGroupExpansion":{"a":false,"b":true,"c":"false"}}', { allGroupsExpanded: true, tabGroupExpansion: { a: false, b: true } }]
    ]) {
        const storage = new Map([['tabGroupExpansion:one', saved]])
        const h = session(storage, 'one')
        try {
            h.assign()
            await h.load()
            assert.deepEqual(h.api.state, expected)
            h.change(api => api.toggle('new', false))
            assert.equal(JSON.parse(storage.get('tabGroupExpansion:one')).tabGroupExpansion.new, true)
        } finally { h.destroy() }
    }
})

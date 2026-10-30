import assert from 'node:assert/strict'
import vm from 'node:vm'
import { getSidebarItems } from '../app/lib/tab-groups.js'
import { tabActivityMap, ensureTabActivityView, getActivitySidebarItems } from '../app/lib/tab-activity.js'

const tab = (id, order, extra = {}) => ({ _id: id, id, type: 'tab', spaceId: 'space', order, ...extra })
const ids = items => items.map(item => item.id)
const display = (tabs, enabled = true, docs = {}, search) => getActivitySidebarItems(getSidebarItems(tabs), docs, enabled, search)

Deno.test('activity sorts groups by latest explicit timestamp and preserves ordinary order and member order', () => {
    const tabs = [tab('first', 0, { lastActiveAt: 99999 }), tab('older', 10, { lastActivityAt: 100 }),
        tab('group-first', 20, { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('group-last', 20, { tabGroupId: 'group', tabGroupOrder: 1, lastActivityAt: 200 }),
        { id: 'spacer', type: 'divider', order: 15 }, tab('last', 30)]
    const before = structuredClone(tabs)
    const items = display(tabs)
    assert.deepEqual(ids(items), ['group:group', 'tab:older', 'activity-divider', 'tab:first', 'spacer', 'tab:last'])
    assert.deepEqual(ids(items[0].tabs), ['group-first', 'group-last'])
    assert.deepEqual(ids(display(tabs, false)), ['tab:first', 'tab:older', 'spacer', 'group:group', 'tab:last'])
    assert.deepEqual(tabs, before)
})

Deno.test('activity divider exists only between visible sections and invalid timestamps count as ordinary tabs', () => {
    const tabs = [tab('first', 0, { lastActivityAt: 50 }), tab('second', 1, { lastActivityAt: 50 }),
        tab('ordinary', 2), tab('invalid', 3, { lastActivityAt: Infinity })]
    assert.deepEqual(ids(display(tabs)), ['tab:first', 'tab:second', 'activity-divider', 'tab:ordinary', 'tab:invalid'])
    assert.deepEqual(ids(display(tabs, true, {}, tab => tab.id === 'first')), ['tab:first'])
    assert.deepEqual(ids(display(tabs, true, {}, tab => tab.id === 'ordinary')), ['tab:ordinary'])
    assert.deepEqual(display([], true), [])
    assert.deepEqual(ids(display(tabs, true, { ordinary: { lastActivityAt: 100 } })),
        ['tab:ordinary', 'tab:first', 'tab:second', 'activity-divider', 'tab:invalid'])
})

Deno.test('serialized activity view prioritizes precise timestamps and excludes deleted or unscoped docs', () => {
    const rows = []
    const map = vm.runInNewContext(`(${tabActivityMap.toString()})`, { emit: key => rows.push(Array.from(key)) })
    for (const doc of [tab('first', 1), tab('recent', 1, { lastActivityAt: 1_800_000_000_001 }),
        tab('older', 1, { lastActivityAt: 1_800_000_000_000 }),
        tab('visit', 2, { lastActiveAt: 1_900_000_000_000 }),
        tab('invalid', 3, { lastActivityAt: NaN }),
        tab('deleted', 1, { archive: 'deleted', lastActivityAt: 999 }),
        tab('unscoped', 1, { spaceId: undefined })]) map(doc)
    assert.equal(rows.length, 5)
    assert.deepEqual(rows[1], ['space', '', 'tab', -1_800_000_000_001, 1])
    assert.equal(rows[1][3] < rows[2][3], true)
    assert.equal(rows[2][3] < rows[0][3], true)
    assert.equal(rows[3][3], 0)
    assert.equal(rows[4][3], 0)
})

Deno.test('activity view installation is idempotent and handles concurrent window creation', async () => {
    let saved
    let puts = 0
    const db = {
        async get() { if (!saved) throw { status: 404 }; return saved },
        async put(doc) { puts++; saved = doc; throw { status: 409 } }
    }
    await ensureTabActivityView(db)
    await ensureTabActivityView(db)
    assert.equal(puts, 1)
    assert.equal(saved.views.by_space.map, tabActivityMap.toString())
})

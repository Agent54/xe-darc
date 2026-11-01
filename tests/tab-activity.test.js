import assert from 'node:assert/strict'
import { getSidebarItems, planTabMove } from '../app/lib/tab-groups.js'
import { getActivitySidebarItems, getActivityGroupTabs, activityBetween, withOrderActivity } from '../app/lib/tab-activity.js'

const tab = (id, order, extra = {}) => ({ _id: id, id, type: 'tab', spaceId: 'space', order, ...extra })
const ids = items => items.map(item => item.id)
const display = (tabs, enabled = true, docs = {}, search) => getActivitySidebarItems(getSidebarItems(tabs), docs, enabled, search)

Deno.test('activity uses the latest effective group timestamp and preserves ordinary order and member order', () => {
    const tabs = [tab('first', 0, { lastActiveAt: 99999 }), tab('older', 10, { lastActivityAt: 100 }),
        tab('group-first', 20, { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('group-last', 20, { tabGroupId: 'group', tabGroupOrder: 1, lastActivityAt: 200 }),
        { id: 'spacer', type: 'divider', order: 15 }, tab('last', 30)]
    const before = structuredClone(tabs)
    const items = display(tabs)
    assert.deepEqual(ids(items), ['group:group', 'tab:older', 'tab:last', 'spacer', 'tab:first'])
    assert.deepEqual(ids(items[0].tabs), ['group-first', 'group-last'])
    assert.deepEqual(ids(display(tabs, false)), ['tab:first', 'tab:older', 'spacer', 'group:group', 'tab:last'])
    assert.deepEqual(tabs, before)
})

Deno.test('activity and order timestamps share one continuous list and explicit activity overrides order', () => {
    const tabs = [tab('first', 1000, { lastActivityAt: 50 }), tab('second', 1, { lastActivityAt: 50 }),
        tab('ordinary', 200), tab('invalid', 3, { lastActivityAt: Infinity })]
    assert.deepEqual(ids(display(tabs)), ['tab:ordinary', 'tab:first', 'tab:second', 'tab:invalid'])
    assert.deepEqual(ids(display(tabs, true, {}, tab => tab.id === 'first')), ['tab:first'])
    assert.deepEqual(ids(display(tabs, true, {}, tab => tab.id === 'ordinary')), ['tab:ordinary'])
    assert.deepEqual(display([], true), [])
    assert.deepEqual(ids(display(tabs, true, { ordinary: { lastActivityAt: 0, order: 200 } })),
        ['tab:first', 'tab:second', 'tab:invalid', 'tab:ordinary'])
    assert.equal(display(tabs).some(item => item.type === 'activity-divider'), false)
    assert.deepEqual(ids(display([tab('lower', 100, { lastActivityAt: -1 }), tab('zero', 100, { lastActivityAt: 0 })])), ['tab:zero', 'tab:lower'])
})

Deno.test('sidebar group members sort by activity or order without mutating traditional member order', () => {
    const tabs = [tab('one', 10, { tabGroupOrder: 0, lastActivityAt: 100 }),
        tab('two', 10, { tabGroupOrder: 1, lastActivityAt: 300 }),
        tab('three', 200, { tabGroupOrder: 2 })]
    assert.deepEqual(ids(getActivityGroupTabs(tabs, {}, true)), ['two', 'three', 'one'])
    assert.deepEqual(ids(tabs), ['one', 'two', 'three'])
    assert.equal(getActivityGroupTabs(tabs, {}, false), tabs)
    assert.deepEqual(ids(getActivityGroupTabs(tabs, { one: { lastActivityAt: 400 } }, true)), ['one', 'two', 'three'])
})

Deno.test('activity fractional indexing uses effective neighbor ranks and reverses the open ends', () => {
    const first = tab('first', 10, { lastActivityAt: 300 })
    const second = tab('second', 100)
    assert.equal(activityBetween(first, second), 200)
    assert.equal(activityBetween(null, first), 301)
    assert.equal(activityBetween(second, null), 99)
    assert.equal(activityBetween(tab('zero', 0), null), -1)
    const tabs = [first, second, tab('moving', 50, { lastActivityAt: 500 })]
    const [update] = planTabMove(tabs, tabs, 'moving', { targetSpaceId: 'space', beforeTabId: 'first', afterTabId: 'second', activityMode: true }, () => 'group')
    assert.equal(update.lastActivityAt, 200)
    assert.equal(Object.hasOwn(update, 'order'), false)
    assert.deepEqual(ids(display(tabs.map(tab => ({ ...tab, ...(tab.id === update.id ? update : {}) })))), ['tab:first', 'tab:moving', 'tab:second'])
})

Deno.test('activity group moves use the effective neighboring group rank and preserve every member order', () => {
    const tabs = [tab('one', 10, { tabGroupId: 'moving', tabGroupOrder: 0, lastActivityAt: 500 }),
        tab('two', 10, { tabGroupId: 'moving', tabGroupOrder: 1 }),
        tab('neighbor-one', 20, { tabGroupId: 'neighbor', lastActivityAt: 50 }),
        tab('neighbor-two', 20, { tabGroupId: 'neighbor', lastActivityAt: 300 }), tab('fallback', 100)]
    const updates = planTabMove(tabs, tabs, 'one', { targetSpaceId: 'space', beforeTabId: 'neighbor-one', afterTabId: 'fallback', scope: 'group', activityMode: true }, () => 'group')
    assert.deepEqual(updates.map(update => [update.id, update.lastActivityAt, update.tabGroupOrder, Object.hasOwn(update, 'order')]),
        [['one', 200, 0, false], ['two', 200, 1, false]])
})

Deno.test('changing ordinary order raises missing or older activity without lowering a newer timestamp', () => {
    assert.deepEqual(withOrderActivity(tab('old', 10, { lastActivityAt: 20 }), { order: 30 }), { order: 30, lastActivityAt: 30 })
    assert.deepEqual(withOrderActivity(tab('new', 10, { lastActivityAt: 40 }), { order: 30 }), { order: 30, lastActivityAt: 40 })
    assert.deepEqual(withOrderActivity(tab('missing', 10), { order: 0 }), { order: 0, lastActivityAt: 0 })
    assert.deepEqual(withOrderActivity(tab('same', 10, { lastActivityAt: 0 }), { order: 10 }), { order: 10, lastActivityAt: 10 })
    assert.deepEqual(withOrderActivity(tab('explicit', 20, { lastActivityAt: 500 }), { order: 10, lastActivityAt: 200 }), { order: 10, lastActivityAt: 200 })
    assert.deepEqual(withOrderActivity(tab('unchanged', 10, { lastActivityAt: 0 }), { lastActivityAt: -1 }), { lastActivityAt: -1 })
})

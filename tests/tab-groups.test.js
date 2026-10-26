import assert from 'node:assert/strict'
import { getTabGroups, getTabGroup, getTabGroupPreviewTabs, tabGroupMetadataId, getSidebarItems, planTabMove, addTabGroupFrames } from '../app/lib/tab-groups.js'

const tab = (id, order, extra = {}) => ({ id, type: 'tab', spaceId: 'space', order, title: id, ...extra })
const grouped = (id, rank, extra = {}) => tab(id, 10, { tabGroupId: 'research', tabGroupOrder: rank, ...extra })
const move = (items, id, options, targets = items) => planTabMove(items, targets, id, { targetSpaceId: 'space', ...options }, () => 'new-group')
const apply = (items, updates) => items.map(item => ({ ...item, ...updates.find(update => update.id === item.id) }))

Deno.test('standalone tabs each derive their own group and non-browsing entries never become members', () => {
    const items = [tab('one', 1), tab('two', 2), tab('pin', 3, { pinned: 'left' }), tab('preview', 4, { preview: true }),
        tab('closed', 5, { archive: 'closed' }), tab('lightbox', 6, { lightbox: true }), { id: 'divider', type: 'divider', order: 0 }]
    assert.deepEqual(getTabGroups(items).map(group => group.tabs.map(tab => tab.id)), [['one'], ['two']])
    assert.deepEqual(getSidebarItems(items).map(item => item.id), ['divider', 'tab:one', 'tab:two'])
    assert.equal(getTabGroup(items, 'pin'), null)
})

Deno.test('group order and member order are independent and remain stable when a member closes', () => {
    const items = [grouped('last', 3), tab('before', 5), grouped('first', 1), grouped('middle', 2), tab('after', 15)]
    assert.deepEqual(getTabGroups(items).map(group => group.tabs.map(tab => tab.id)), [['before'], ['first', 'middle', 'last'], ['after']])
    assert.equal(getTabGroup(items.filter(item => item.id !== 'first'), 'middle').order, 10)
    assert.equal(items[0].id, 'last')
})

Deno.test('one remaining member has the same view identity as a standalone tab everywhere', () => {
    const items = [grouped('one', 0), grouped('closed', 1, { archive: 'closed' }), grouped('pin', 2, { pinned: 'left' }), grouped('preview', 3, { preview: true })]
    const singleton = getTabGroups(items)[0]
    const standalone = getTabGroups([tab('one', 10)])[0]
    const view = group => ({ ...group, tabs: group.tabs.map(tab => tab.id), previewTabs: group.previewTabs.map(tab => tab.id) })
    assert.deepEqual(view(singleton), view(standalone))
    assert.equal(getSidebarItems(items)[0].tabGroupId, null)
    assert.equal(getTabGroup(items, 'one').id, standalone.id)
    assert.equal(addTabGroupFrames([{ id: 'one', x: 0, y: 0, width: 1000, height: 700 }], getTabGroups(items)).some(element => element.type === 'frame'), false)
    assert.equal(items[0].tabGroupId, 'research')
})

Deno.test('group previews center on the active tab and clamp to three adjacent tabs at either end', () => {
    const tabs = ['one', 'two', 'three', 'four', 'five'].map((id, index) => grouped(id, index))
    for (const [active, expected] of [
        ['one', ['one', 'two', 'three']],
        ['two', ['one', 'two', 'three']],
        ['three', ['two', 'three', 'four']],
        ['four', ['three', 'four', 'five']],
        ['five', ['three', 'four', 'five']]
    ]) {
        assert.deepEqual(getTabGroupPreviewTabs(tabs, active).map(tab => tab.id), expected)
        const group = getTabGroups(tabs, ['outside', active])[0]
        assert.deepEqual(group.previewTabs.map(tab => tab.id), expected)
        assert.equal(group.title, expected.join(' · '))
    }
    assert.deepEqual(getTabGroupPreviewTabs(tabs.slice(0, 2), 'two').map(tab => tab.id), ['one', 'two'])
    assert.deepEqual(getTabGroupPreviewTabs(tabs.slice(0, 1), 'one').map(tab => tab.id), ['one'])
})

Deno.test('a named group retains its preview tabs and a singleton still uses ordinary tab presentation', () => {
    const tabs = [grouped('one', 0), grouped('two', 1)]
    const metadata = { [tabGroupMetadataId('research')]: { name: 'Research', color: '#123456' } }
    const group = getTabGroups(tabs, ['two'], metadata)[0]
    assert.equal(group.name, 'Research')
    assert.equal(group.title, 'Research')
    assert.deepEqual(group.previewTabs.map(tab => tab.id), ['one', 'two'])
    const single = getTabGroups(tabs.slice(0, 1), [], metadata)[0]
    assert.equal(single.name, null)
    assert.equal(single.metadata, null)
    assert.equal(single.title, 'one')
})

Deno.test('dropping onto a standalone tab promotes both tabs into a shared virtual group', () => {
    const items = [tab('source', 1), tab('target', 20), tab('unrelated', 30)]
    const updates = move(items, 'source', { targetGroupTabId: 'target' })
    const result = apply(items, updates)
    assert.deepEqual(getTabGroups(result).map(group => group.tabs.map(tab => tab.id)), [['target', 'source'], ['unrelated']])
    assert.equal(result[0].tabGroupId, 'new-group')
    assert.equal(result[1].tabGroupId, 'new-group')
    assert.equal(result[0].order, 20)
})

Deno.test('top-bar neighbors expressed in sidebar order insert at either end or between members', () => {
    const items = [grouped('one', 1), grouped('two', 2), grouped('three', 3), tab('outside', 40)]
    for (const [neighbors, expected] of [
        [{ beforeTabId: 'three' }, ['one', 'two', 'three', 'outside']],
        [{ afterTabId: 'one' }, ['outside', 'one', 'two', 'three']],
        [{ beforeTabId: 'one', afterTabId: 'two' }, ['one', 'outside', 'two', 'three']]
    ]) {
        const result = apply(items, move(items, 'outside', { targetGroupTabId: 'one', ...neighbors }))
        assert.deepEqual(getTabGroup(result, 'one').tabs.map(tab => tab.id), expected)
    }
})

Deno.test('reordering a group member preserves membership and its sidebar position', () => {
    const items = [grouped('one', 1), grouped('two', 2), grouped('three', 3)]
    const result = apply(items, move(items, 'one', { targetGroupTabId: 'two', beforeTabId: 'three' }))
    assert.deepEqual(getTabGroups(result)[0].tabs.map(tab => tab.id), ['two', 'three', 'one'])
    assert.equal(getTabGroups(result)[0].order, 10)
})

Deno.test('dropping a member between sidebar entries detaches only that member', () => {
    const items = [tab('before', 0), grouped('one', 1), grouped('two', 2), tab('after', 20)]
    const updates = move(items, 'two', { beforeTabId: 'one', afterTabId: 'after' })
    assert.equal(updates.length, 1)
    assert.equal(updates[0].tabGroupId, null)
    assert.equal(updates[0].order, 15)
    assert.equal(getTabGroup(apply(items, updates), 'one').tabGroupId, null)
    assert.equal(getTabGroup(apply(items, updates), 'one').id, 'tab:one')
    assert.equal(apply(items, updates).find(tab => tab.id === 'one').tabGroupId, 'research')
})

Deno.test('dragging a sidebar group reorders all members without changing their internal order', () => {
    const items = [tab('before', 0), grouped('one', 1), grouped('two', 2), tab('after', 20)]
    const result = apply(items, move(items, 'one', { scope: 'group', beforeTabId: 'after' }))
    assert.deepEqual(getTabGroups(result).map(group => group.tabs.map(tab => tab.id)), [['before'], ['after'], ['one', 'two']])
    assert.equal(result.find(tab => tab.id === 'one').order, result.find(tab => tab.id === 'two').order)
})

Deno.test('a whole group can merge into another group with strict member ordering', () => {
    const items = [grouped('one', 1), grouped('two', 2), tab('target', 20, { tabGroupId: 'destination', tabGroupOrder: 4 }),
        tab('end', 20, { tabGroupId: 'destination', tabGroupOrder: 5 })]
    const result = apply(items, move(items, 'one', { scope: 'group', targetGroupTabId: 'target', beforeTabId: 'target', afterTabId: 'end' }))
    assert.deepEqual(getTabGroups(result)[0].tabs.map(tab => tab.id), ['target', 'one', 'two', 'end'])
    assert.equal(getTabGroups(result).length, 1)
})

Deno.test('cross-space moves join only the destination group and place tabs beside its canvas members', () => {
    const source = [grouped('one', 1), grouped('two', 2)]
    const target = [tab('target', 20, { spaceId: 'other', canvas: { other: { x: 200, y: 300, width: 1000, height: 700 } } })]
    const updates = move(source, 'two', { targetSpaceId: 'other', targetGroupTabId: 'target' }, target)
    const moved = updates.find(update => update.id === 'two')
    assert.equal(moved.spaceId, 'other')
    assert.equal(moved.tabGroupId, 'new-group')
    assert.equal(moved.canvas.other.x, 1280)
    assert.equal(moved.canvas.other.y, 300)
    assert.equal(updates.some(update => update.id === 'one'), false)
})

Deno.test('canvas group frames enclose their members and disappear when no group remains', () => {
    const items = [grouped('one', 1), grouped('two', 2), tab('outside', 40)]
    const elements = [{ id: 'one', x: 100, y: 100, width: 1000, height: 700 }, { id: 'two', x: 1200, y: 100, width: 800, height: 700 },
        { id: 'outside', x: 3000, y: 100, width: 1000, height: 700 }]
    const result = addTabGroupFrames(structuredClone(elements), getTabGroups(items))
    const frame = result.find(element => element.type === 'frame')
    assert.equal(frame.customData.virtualTabGroup, true)
    assert.equal(frame.x, 68)
    assert.equal(frame.width, 1964)
    assert.equal(result.find(element => element.id === 'one').frameId, frame.id)
    assert.equal(result.find(element => element.id === 'outside').frameId, undefined)
    assert.equal(addTabGroupFrames(structuredClone(elements), getTabGroups(items.map(item => ({ ...item, tabGroupId: null })))).length, 3)
})

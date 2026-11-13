import assert from 'node:assert/strict'
import { getTabTitle } from '../app/lib/tab-title.js'
import { getTabGroups } from '../app/lib/tab-groups.js'

Deno.test('tab titles prefer custom names, page titles, then URLs', () => {
    const tab = { titleOverride: ' Custom name ', title: ' Page title ', url: 'https://example.com/path?q=1#section' }
    assert.equal(getTabTitle(tab), 'Custom name')
    assert.equal(getTabTitle({ ...tab, titleOverride: ' \n\t' }), 'Page title')
    for (const title of [undefined, null, '', ' \n\t']) {
        assert.equal(getTabTitle({ ...tab, titleOverride: null, title }), tab.url)
    }
    assert.equal(getTabTitle({ url: 'about:blank' }), 'about:blank')
    assert.equal(getTabTitle({ url: 'file:///notes.txt' }), 'file:///notes.txt')
    assert.equal(getTabTitle({ title: 'Untitled', url: tab.url }), 'Untitled')
    assert.equal(getTabTitle({ title: 'New Tab', url: 'about:newtab' }), 'New Tab')
    for (const tab of [undefined, null, {}, { titleOverride: ' ', title: '\n', url: ' ' }]) {
        assert.equal(getTabTitle(tab), '')
    }
})

Deno.test('group titles share the tab fallback and retain explicit group names', () => {
    const tabs = [
        { id: 'one', type: 'tab', tabGroupId: 'group', title: '', url: 'https://example.com/one' },
        { id: 'two', type: 'tab', tabGroupId: 'group', title: ' ', url: 'https://example.com/two' }
    ]
    assert.equal(getTabGroups(tabs, ['two'])[0].title, getTabTitle(tabs[1]))
    assert.equal(getTabGroups(tabs.slice(0, 1))[0].title, getTabTitle(tabs[0]))
    assert.equal(getTabGroups(tabs, [], { 'darc:tabgroup_group': { name: 'Research' } })[0].title, 'Research')
})

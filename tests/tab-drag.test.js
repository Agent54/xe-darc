import assert from 'node:assert/strict'
import vm from 'node:vm'
import { compileModule } from 'svelte/compiler'

const source = compileModule(Deno.readTextFileSync(new URL('../app/lib/tab-drag.svelte.js', import.meta.url)), { generate: 'server' }).js.code
    .replace(/^import .*$/gm, '')
    .replace(/^export \{[\s\S]*$/m, '({ tabDrag: state, startTabDrag: startPending, onDrop, onGroupExpand, cancelDrag })')

function element (id, x, y, width, height, dataset = {}, classes = []) {
    return {
        id, dataset, selectors: {}, parents: {}, scrollTop: 0, scrollLeft: 0, scrollWidth: width, clientWidth: width, scrollHeight: height, clientHeight: height,
        getBoundingClientRect: () => ({ left: x, top: y, right: x + width, bottom: y + height, width, height }),
        getAttribute(name) { return name === 'data-tab-id' ? id : name === 'data-space-id' ? dataset.spaceId : null },
        querySelector(selector) { return this.selectors[selector] || null },
        querySelectorAll(selector) { return this.selectors[selector] || [] },
        closest(selector) { return this.parents[selector] || null },
        classList: { contains: name => classes.includes(name) }
    }
}

function dragHarness ({ topbar = null, lists = [], pinLists = [] } = {}) {
    const listeners = new Map()
    const drops = []
    const expansions = []
    const timers = new Map()
    let now = 0
    let nextTimerId = 10
    let animationFrame
    const document = {
        body: { classList: { add() {}, remove() {} } },
        querySelector: selector => selector === '.tab-list.tabs' ? topbar : null,
        querySelectorAll: selector => selector === '[data-pin-scope]' ? pinLists : selector === '.tabs-list' ? lists : selector === '.tab-group-content' ? lists.flatMap(list => list.querySelectorAll(selector)) : []
    }
    const api = vm.runInNewContext(source, {
        document,
        window: { innerWidth: 1400, addEventListener(name, handler) { listeners.set(name, handler) }, removeEventListener(name) { listeners.delete(name) }, dispatchEvent() {} },
        requestAnimationFrame: callback => { animationFrame = callback; return 1 }, cancelAnimationFrame() {},
        setTimeout(callback, delay) { const id = nextTimerId++; timers.set(id, { callback, at: now + delay }); return id },
        clearTimeout(id) { timers.delete(id) }, CustomEvent: function () {}
    })
    api.onDrop(drop => drops.push(drop))
    api.onGroupExpand(group => expansions.push({ ...group }))
    return {
        ...api, drops, expansions,
        start(id, el, zone = 'sidebar', type = 'tab') {
            const rect = el.getBoundingClientRect()
            api.startTabDrag(id, el, zone, 'source-space', { button: 0, clientX: rect.left + 4, clientY: rect.top + 4 }, false, null, type)
        },
        move(x, y) { listeners.get('mousemove')({ clientX: x, clientY: y }) },
        frame() { animationFrame() },
        advance(ms) {
            now += ms
            for (const [id, timer] of timers) {
                if (timer.at <= now) { timers.delete(id); timer.callback() }
            }
        },
        release() { listeners.get('mouseup')({}) }
    }
}

function sidebar (children) {
    const list = element('', 0, 80, 250, 600)
    list.parents['.space-content'] = element('', 0, 80, 250, 600, { spaceId: 'target-space' })
    list.selectors[':scope > .tab-item-container, :scope > .tab-divider-item, :scope > .tab-group-wrapper'] = children
    return list
}

function pinList (scope, children = []) {
    const list = element('', 0, 0, 250, 80, { pinScope: scope })
    list.parents['.space-content'] = scope !== 'global' ? element('', 0, 0, 250, 680, { spaceId: 'target-space' }) : null
    list.selectors[':scope > [data-tab-id]'] = children
    list.selectors['.pin-drop-placeholder'] = element('', 4, 4, 36, 36)
    return list
}

Deno.test('the titled pinned section accepts empty drops and reorders vertically', () => {
    const list = pinList('sidebar')
    list.dataset.pinLayout = 'rows'
    list.selectors['.sidebar-pins-placeholder'] = element('', 4, 4, 242, 36)
    const harness = dragHarness({ pinLists: [list] })
    harness.start('source', element('source', 300, 100, 100, 36))
    harness.move(120, 20)
    assert.equal(harness.tabDrag.indicator.height, 2)
    assert.equal(harness.tabDrag.indicator.width, 242)
    harness.release()
    assert.equal(harness.drops[0].pinScope, 'sidebar')
    assert.equal(harness.drops[0].targetSpaceId, 'target-space')
    list.selectors[':scope > [data-tab-id]'] = [element('one', 4, 4, 242, 32), element('two', 4, 44, 242, 32)]
    harness.start('source', element('source', 300, 100, 100, 36))
    harness.move(120, 38)
    assert.equal(harness.tabDrag.indicator.height, 2)
    harness.release()
    assert.equal(harness.drops[1].beforeTabId, 'one')
    assert.equal(harness.drops[1].afterTabId, 'two')
})

Deno.test('tabs can enter empty space and global pin sections', () => {
    for (const scope of ['space', 'global']) {
        const harness = dragHarness({ pinLists: [pinList(scope)] })
        harness.start('source', element('source', 300, 100, 100, 36))
        harness.move(20, 20)
        assert.equal(harness.tabDrag.indicator.visible, true)
        assert.equal(harness.tabDrag.indicator.width, 2)
        harness.release()
        assert.equal(harness.drops[0].type, 'pin')
        assert.equal(harness.drops[0].pinScope, scope)
        assert.equal(harness.drops[0].targetSpaceId, scope === 'space' ? 'target-space' : undefined)
    }
})

Deno.test('wrapped pin grids insert between the correct neighbors', () => {
    const pins = [element('one', 4, 4, 36, 36), element('two', 45, 4, 36, 36), element('three', 4, 43, 36, 36), element('four', 45, 43, 36, 36)]
    const harness = dragHarness({ pinLists: [pinList('global', pins)] })
    harness.start('source', element('source', 300, 100, 100, 36))
    harness.move(5, 60)
    harness.release()
    assert.equal(harness.drops[0].beforeTabId, 'two')
    assert.equal(harness.drops[0].afterTabId, 'three')
    assert.equal(harness.drops[0].pinScope, 'global')
})

Deno.test('pins can reorder, leave pin sections, and cancel without a drop', () => {
    const pins = [element('one', 4, 4, 36, 36), element('two', 45, 4, 36, 36), element('three', 86, 4, 36, 36)]
    const harness = dragHarness({ pinLists: [pinList('space', pins)], lists: [sidebar([element('target', 0, 100, 250, 36)])] })
    harness.start('one', pins[0])
    harness.move(110, 20)
    harness.release()
    assert.equal(harness.drops[0].beforeTabId, 'three')
    harness.start('one', pins[0])
    harness.move(120, 102)
    harness.release()
    assert.equal(harness.drops[1].type, 'reorder')
    assert.equal(harness.drops[1].targetGroupTabId, null)
    harness.start('one', pins[0])
    harness.move(110, 20)
    harness.cancelDrag()
    assert.equal(harness.drops.length, 2)
})

Deno.test('dropping a pin back in its own position does nothing', () => {
    const pin = element('one', 4, 4, 36, 36)
    const harness = dragHarness({ pinLists: [pinList('space', [pin])] })
    harness.start('one', pin)
    harness.move(20, 20)
    harness.release()
    assert.equal(harness.drops.length, 0)
})

Deno.test('global pin targets exclude the app and search controls', () => {
    const list = pinList('global')
    list.selectors['.all-apps-tab'] = element('', 45, 4, 36, 36)
    const harness = dragHarness({ pinLists: [list] })
    harness.start('source', element('source', 300, 100, 100, 36))
    harness.move(60, 20)
    assert.equal(harness.tabDrag.dropTarget, null)
    harness.move(100, 20)
    assert.equal(harness.tabDrag.dropTarget.pinScope, 'global')
    harness.cancelDrag()
})

Deno.test('groups and dividers cannot enter pin sections', () => {
    for (const type of ['group', 'divider']) {
        const harness = dragHarness({ pinLists: [pinList('space')] })
        harness.start('source', element('source', 300, 100, 100, 36), 'sidebar', type)
        harness.move(20, 20)
        harness.release()
        assert.equal(harness.drops.some(drop => drop.type === 'pin'), false)
    }
})

Deno.test('sidebar-to-topbar drops preserve the same neighbor order as the sidebar', () => {
    const topbar = element('', 260, 0, 600, 40, { groupTabId: 'one', spaceId: 'target-space' })
    topbar.selectors[':scope > .tab-container:not(.pinned-tab-container)'] = [element('one', 260, 0, 100, 40), element('two', 365, 0, 100, 40), element('three', 470, 0, 100, 40)]
    const harness = dragHarness({ topbar })
    harness.start('outside', element('outside', 0, 100, 250, 36))
    harness.move(355, 20)
    harness.release()
    const drop = harness.drops[0]
    assert.equal(drop.targetGroupTabId, 'one')
    assert.equal(drop.beforeTabId, 'one')
    assert.equal(drop.afterTabId, 'two')
    assert.equal(drop.targetSpaceId, 'target-space')
})

Deno.test('topbar-to-sidebar edge drops detach individual tabs', () => {
    const list = sidebar([element('target', 0, 100, 250, 36)])
    const harness = dragHarness({ lists: [list] })
    harness.start('source', element('source', 300, 0, 100, 40), 'topbar')
    harness.move(120, 102)
    harness.release()
    assert.equal(harness.drops[0].targetGroupTabId, null)
    assert.equal(harness.drops[0].afterTabId, 'target')
    assert.equal(harness.drops[0].scope, 'tab')
})

Deno.test('joining a sidebar tab or group waits 700ms without resetting for pointer movement', () => {
    for (const type of ['tab', 'group']) {
        for (const target of [element('target', 0, 100, 250, 36), collapsedGroup()]) {
            const harness = dragHarness({ lists: [sidebar([target])] })
            harness.start('source', element('source', 300, 0, 100, 40), 'sidebar', type)
            harness.move(120, 118)
            assert.equal(harness.tabDrag.indicator.height, 2)
            assert.equal(harness.tabDrag.dropTarget.targetGroupTabId, null)
            harness.advance(699)
            harness.move(125, 119)
            assert.equal(harness.tabDrag.indicator.height, 2)
            harness.advance(1)
            assert.equal(harness.tabDrag.indicator.height, 36)
            harness.release()
            assert.equal(harness.drops[0].targetGroupTabId, target.id)
            assert.equal(harness.drops[0].scope, type)
        }
    }
})

Deno.test('releasing before the merge delay keeps a normal sidebar reorder', () => {
    const harness = dragHarness({ lists: [sidebar([element('target', 0, 100, 250, 36)])] })
    harness.start('source', element('source', 300, 0, 100, 40), 'topbar')
    harness.move(120, 118)
    harness.advance(699)
    harness.release()
    assert.equal(harness.drops[0].targetGroupTabId, null)
    assert.equal(harness.drops[0].afterTabId, 'target')
    harness.advance(1000)
    assert.equal(harness.tabDrag.active, false)
    assert.equal(harness.tabDrag.indicator.visible, false)
})

Deno.test('changing merge targets, returning to an edge and cancelling reset the delay', () => {
    const harness = dragHarness({ lists: [sidebar([element('first', 0, 100, 250, 36), element('second', 0, 150, 250, 36)])] })
    const source = element('source', 300, 0, 100, 40)
    harness.start('source', source, 'topbar')
    harness.move(120, 118)
    harness.advance(600)
    harness.move(120, 168)
    harness.advance(100)
    assert.equal(harness.tabDrag.dropTarget.targetGroupTabId, null)
    harness.advance(600)
    assert.equal(harness.tabDrag.dropTarget.targetGroupTabId, 'second')
    harness.move(120, 152)
    assert.equal(harness.tabDrag.dropTarget.targetGroupTabId, null)
    assert.equal(harness.tabDrag.indicator.height, 2)
    harness.move(120, 168)
    harness.advance(699)
    harness.cancelDrag()
    harness.start('source', source, 'topbar')
    harness.move(120, 168)
    harness.advance(1)
    assert.equal(harness.tabDrag.dropTarget.targetGroupTabId, null)
    harness.advance(699)
    assert.equal(harness.tabDrag.dropTarget.targetGroupTabId, 'second')
    harness.release()
    assert.equal(harness.drops.length, 1)
})

Deno.test('an expanded group accepts drops between its child tabs', () => {
    const wrapper = element('first', 0, 100, 250, 170, {}, ['tab-group-wrapper'])
    const content = element('', 8, 136, 234, 130, { groupTabId: 'first' })
    content.selectors[':scope > .tab-item-container'] = [element('first', 8, 140, 234, 36), element('second', 8, 180, 234, 36)]
    const list = sidebar([wrapper])
    list.selectors['.tab-group-content'] = [content]
    const harness = dragHarness({ lists: [list] })
    harness.start('source', element('source', 300, 0, 100, 40), 'topbar')
    harness.move(120, 175)
    harness.release()
    assert.equal(harness.drops[0].targetGroupTabId, 'first')
    assert.equal(harness.drops[0].beforeTabId, 'first')
    assert.equal(harness.drops[0].afterTabId, 'second')
})

Deno.test('spacers can move between expanded groups from either direction', () => {
    for (const sourceY of [84, 500]) {
        for (const pointerY of [273, 275]) {
            const first = element('first', 0, 100, 250, 170, {}, ['tab-group-wrapper', 'expanded'])
            const second = element('second', 0, 278, 250, 170, {}, ['tab-group-wrapper', 'expanded'])
            const spacer = element('spacer', 0, sourceY, 250, 8, {}, ['tab-divider-item'])
            const children = sourceY < 100 ? [spacer, first, second] : [first, second, spacer]
            const harness = dragHarness({ lists: [sidebar(children)] })
            harness.start('spacer', spacer, 'sidebar', 'divider')
            harness.move(120, pointerY)
            assert.equal(harness.tabDrag.indicator.visible, true)
            assert.equal(harness.tabDrag.indicator.y, 274)
            assert.equal(harness.tabDrag.indicator.height, 2)
            harness.release()
            assert.deepEqual({ ...harness.drops[0] }, {
                type: 'reorder', tabId: 'spacer', sourceSpaceId: 'source-space',
                beforeTabId: 'first', afterTabId: 'second', targetSpaceId: 'target-space'
            })
        }
    }
})

Deno.test('spacer drops over expanded children stay outside the group', () => {
    const wrapper = element('first', 0, 100, 250, 170, {}, ['tab-group-wrapper', 'expanded'])
    const content = element('', 8, 136, 234, 130, { groupTabId: 'first' })
    content.selectors[':scope > .tab-item-container'] = [element('first', 8, 140, 234, 36), element('second', 8, 180, 234, 36)]
    const spacer = element('spacer', 0, 300, 250, 8, {}, ['tab-divider-item'])
    const list = sidebar([wrapper, spacer])
    list.selectors['.tab-group-content'] = [content]
    const harness = dragHarness({ lists: [list] })
    harness.start('spacer', spacer, 'sidebar', 'divider')
    harness.move(120, 175)
    assert.equal(harness.tabDrag.indicator.y, 96)
    harness.release()
    assert.equal(harness.drops[0].beforeTabId, null)
    assert.equal(harness.drops[0].afterTabId, 'first')
    assert.equal(harness.drops[0].targetGroupTabId, undefined)

    harness.start('spacer', spacer, 'sidebar', 'divider')
    harness.move(120, 250)
    assert.equal(harness.tabDrag.indicator.visible, false)
    harness.release()
    assert.equal(harness.drops.length, 1)
})

Deno.test('group header drags preserve group scope and cancellation never commits a move', () => {
    const wrapper = element('first', 0, 100, 250, 170)
    wrapper.selectors['.tab-group'] = element('', 0, 100, 250, 36)
    const harness = dragHarness({ lists: [sidebar([element('target', 0, 300, 250, 36)])] })
    harness.start('first', wrapper, 'sidebar', 'group')
    harness.move(120, 302)
    assert.equal(harness.tabDrag.dragType, 'group')
    assert.equal(harness.tabDrag.tabEl, wrapper)
    assert.equal(harness.tabDrag.previewHeight, 36)
    harness.release()
    assert.equal(harness.drops[0].scope, 'group')
    harness.start('first', wrapper, 'sidebar', 'group')
    harness.move(120, 318)
    harness.cancelDrag()
    assert.equal(harness.drops.length, 1)
    assert.equal(harness.tabDrag.active, false)
})

Deno.test('dragging at a group edge scrolls its tabs before the outer sidebar', () => {
    const list = sidebar([])
    const content = element('', 8, 476, 234, 204, { groupTabId: 'first' })
    content.selectors[':scope > .tab-item-container'] = [element('first', 8, 480, 234, 36)]
    content.scrollHeight = 400
    list.scrollHeight = 1200
    list.selectors['.tab-group-content'] = [content]
    const harness = dragHarness({ lists: [list] })
    harness.start('source', element('source', 300, 0, 100, 40), 'topbar')
    harness.move(120, 675)
    harness.frame()
    assert.ok(content.scrollTop > 0)
    assert.equal(list.scrollTop, 0)

    content.scrollTop = content.scrollHeight - content.clientHeight
    harness.frame()
    assert.ok(list.scrollTop > 0)
    harness.cancelDrag()
})

function collapsedGroup(id = 'group') {
    const wrapper = element('first', 0, 100, 250, 36, { tabGroupId: id }, ['tab-group-wrapper'])
    wrapper.selectors[':scope > .tab-group'] = element('', 0, 100, 250, 36)
    return wrapper
}

Deno.test('a tab hovering over a collapsed group expands it after one second despite pointer movement', () => {
    for (const zone of ['topbar', 'sidebar']) {
        const harness = dragHarness({ lists: [sidebar([collapsedGroup()])] })
        harness.start('source', element('source', 300, 0, 100, 40), zone)
        harness.move(120, 118)
        harness.advance(600)
        harness.move(125, 119)
        harness.advance(399)
        assert.equal(harness.expansions.length, 0)
        harness.advance(1)
        assert.deepEqual(harness.expansions, [{ spaceId: 'target-space', tabGroupId: 'group' }])
        assert.equal(harness.drops.length, 0)
        harness.advance(1000)
        assert.equal(harness.expansions.length, 1)
        harness.cancelDrag()
    }
})

Deno.test('leaving a group resets the expansion delay and ending a drag cancels expansion', () => {
    for (const finish of ['release', 'cancelDrag']) {
        const harness = dragHarness({ lists: [sidebar([collapsedGroup()])] })
        harness.start('source', element('source', 300, 0, 100, 40), 'topbar')
        harness.move(120, 118)
        harness.advance(700)
        harness.move(120, 300)
        harness.advance(1000)
        assert.equal(harness.expansions.length, 0)
        harness.move(120, 118)
        harness.advance(999)
        assert.equal(harness.expansions.length, 0)
        harness[finish]()
        harness.advance(1)
        assert.equal(harness.expansions.length, 0)
    }
})

Deno.test('ordinary tabs and whole-group drags do not trigger hover expansion', () => {
    for (const [target, type] of [[element('single', 0, 100, 250, 36), 'tab'], [collapsedGroup(), 'group']]) {
        const harness = dragHarness({ lists: [sidebar([target])] })
        harness.start('source', element('source', 300, 0, 100, 40), 'sidebar', type)
        harness.move(120, 118)
        harness.advance(1000)
        assert.equal(harness.expansions.length, 0)
        harness.cancelDrag()
    }
})

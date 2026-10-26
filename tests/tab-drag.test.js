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

function dragHarness ({ topbar = null, lists = [] } = {}) {
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
        querySelectorAll: selector => selector === '.tabs-list' ? lists : selector === '.tab-group-content' ? lists.flatMap(list => list.querySelectorAll(selector)) : []
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

Deno.test('the center of a sidebar entry joins a group and uses a frame highlight', () => {
    const target = element('target', 0, 100, 250, 36)
    const harness = dragHarness({ lists: [sidebar([target])] })
    harness.start('source', element('source', 300, 0, 100, 40), 'topbar')
    harness.move(120, 118)
    assert.equal(harness.tabDrag.indicator.height, 36)
    harness.release()
    assert.equal(harness.drops[0].targetGroupTabId, 'target')
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

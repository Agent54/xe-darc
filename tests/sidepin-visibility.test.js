import assert from 'node:assert/strict'
import { compileModule, parse } from 'svelte/compiler'
import * as svelteClient from 'svelte/internal/client'
import { getSidepins, getGlobalPins, getPinScope } from '../app/lib/tab-groups.js'
import { resolveSidepinVisibility } from '../app/lib/sidepin-visibility.js'

// Exercise the actual App visibility state, including restoration and reactive membership changes.
const appSource = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
const persistPreference = parse(appSource).instance.content.body
    .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'persistSidebarPreference')
const visibilityState = appSource.match(/    let spaceSidepins[\s\S]*?(?=    \/\/ Calculate space taken)/)[0]
const source = compileModule(`
    export function observe (state, data, initialHidden) {
        let invisiblePins = $state(initialHidden)
        const sidebarStateLoaded = $derived(state.loaded)
        const tabs = $derived(state.tabs.filter(tab => tab.spaceId === state.spaceId))
        const closed = {}
        ${appSource.slice(persistPreference.start, persistPreference.end)}
        ${visibilityState}
        return {
            toggle: togglePinHidden,
            hidden: isPinHidden,
            visible: () => [...visibleLeftPinnedTabs, ...visibleRightPinnedTabs].map(tab => tab.id)
        }
    }
`, { generate: 'client', filename: 'sidepin-visibility.svelte.js' }).js.code
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')

const tab = (id, extra = {}) => ({ id, type: 'tab', spaceId: 'space', tabGroupId: 'a', ...extra })
const pin = (id, side = 'left', scope = 'group', extra = {}) => tab(id, { pinned: side, pinScope: scope, ...extra })
const pins = () => [
    tab('center-a'), tab('center-b', { tabGroupId: 'b' }),
    pin('left-a', true), pin('left-b'), pin('right-a', 'right'), pin('right-b', 'right'),
    pin('space-left-a', 'left', 'space'), pin('space-left-b', 'left', 'space'),
    pin('space-right', 'right', 'space'),
    pin('other-group-a', 'left', 'group', { tabGroupId: 'b' }),
    pin('other-group-b', 'left', 'group', { tabGroupId: 'b' })
]

function harness (initialHidden = {}, { loaded = true, tabs = pins() } = {}) {
    const state = svelteClient.proxy({ tabs, groupTabId: 'center-a', spaceId: 'space', loaded })
    const storage = new Map()
    const data = {
        getPinScope,
        spaceMeta: { get globalPins() { return getGlobalPins(state.tabs) } },
        getSidepins: () => [...getSidepins(state.tabs.filter(tab => tab.spaceId === state.spaceId), state.groupTabId), ...getGlobalPins(state.tabs)]
    }
    const observe = new Function('$', 'resolveSidepinVisibility', 'localStorage', 'window', `${source}\nreturn observe`)(
        svelteClient, resolveSidepinVisibility, { setItem: (key, value) => storage.set(key, value) },
        { darcWindowId: 'window-1' }
    )
    let api
    const destroy = svelteClient.effect_root(() => { api = observe(state, data, initialHidden) })
    svelteClient.flush()
    return {
        state, api, storage, destroy,
        change (update) { svelteClient.flush(() => update(state)) },
        toggle (id) { svelteClient.flush(() => api.toggle(id)) },
        visible () { return api.visible().sort() },
        saved () { return JSON.parse(storage.get('invisiblePins:window-1')) }
    }
}

Deno.test('global pins share visibility across their owning spaces and stay available on space switches', () => {
    const h = harness({}, { tabs: [tab('center-a'), pin('global-one', 'left', 'global'), pin('global-two', 'left', 'global', { spaceId: 'other' })] })
    try {
        assert.deepEqual(h.visible(), ['global-two'])
        h.toggle('global-one')
        assert.deepEqual(h.visible(), ['global-one'])
        h.change(state => { state.spaceId = 'other' })
        assert.deepEqual(h.visible(), ['global-one'])
    } finally {
        h.destroy()
    }
})

Deno.test('restoring multiple open pins allows one on each side for each scope', () => {
    const h = harness({}, { loaded: false })
    try {
        assert.equal(h.storage.size, 0)
        h.change(state => { state.loaded = true })
        assert.deepEqual(h.visible(), ['left-b', 'right-b', 'space-left-b', 'space-right'])
        assert.equal(h.saved()['left-a'], true, 'legacy true pins share the left side')
        assert.equal(h.saved()['other-group-a'], true)
        h.change(state => { state.groupTabId = 'center-b' })
        assert.deepEqual(h.visible(), ['other-group-b', 'space-left-b', 'space-right'])
    } finally { h.destroy() }
})

Deno.test('opening a pin closes only peers on the same side in the same scope', () => {
    const h = harness()
    try {
        h.toggle('left-a')
        assert.deepEqual(h.visible(), ['left-a', 'right-b', 'space-left-b', 'space-right'])
        assert.equal(h.api.hidden('left-b'), true)
        h.toggle('right-a')
        assert.deepEqual(h.visible(), ['left-a', 'right-a', 'space-left-b', 'space-right'])
        h.toggle('space-left-a')
        assert.deepEqual(h.visible(), ['left-a', 'right-a', 'space-left-a', 'space-right'])
        assert.equal(h.api.hidden('other-group-b'), false)
    } finally { h.destroy() }
})

for (const scope of ['space', 'global']) {
    for (const side of ['left', 'right']) {
        Deno.test(`sidebar clicks reveal collapsed ${scope} ${side} pins, including the active pin`, () => {
            const sidebarSource = Deno.readTextFileSync(new URL('../app/components/TabSidebar.svelte', import.meta.url))
            const activation = parse(sidebarSource).instance.content.body
                .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'activateTab')
            const sidebar = parse(appSource).html.children.find(node => node.name === 'TabSidebar')
            const reveal = sidebar.attributes.find(attribute => attribute.name === 'onRevealPinnedTab').value[0].expression
            for (const alreadyActive of [false, true]) {
                const id = 'selected-pin'
                const h = harness({ [id]: true }, { tabs: [...pins(),
                    pin('peer-pin', side, scope), pin(id, side, scope)] })
                try {
                    const onRevealPinnedTab = new Function('isPinHidden', 'togglePinHidden',
                        `return (${appSource.slice(reveal.start, reveal.end)})`)(h.api.hidden, h.api.toggle)
                    let previousCalls = 0
                    const data = {
                        docs: { [id]: { id, pinned: side } },
                        spaceMeta: { activeTabId: alreadyActive ? id : 'center-a' },
                        activateSpace: spaceId => { h.state.spaceId = spaceId },
                        activate: tabId => { data.spaceMeta.activeTabId = tabId },
                        previous: () => { previousCalls++ }
                    }
                    const activate = new Function('data', 'multiSpaceMode', 'onRevealPinnedTab',
                        `${sidebarSource.slice(activation.start, activation.end)}\nreturn activateTab`)(data, false, onRevealPinnedTab)
                    assert.equal(h.api.hidden(id), true)
                    svelteClient.flush(() => activate(id, 'space'))
                    assert.equal(data.spaceMeta.activeTabId, id)
                    assert.equal(h.api.hidden(id), false)
                    assert.equal(h.api.hidden('peer-pin'), true, 'opening the pin preserves slot exclusivity')
                    assert.equal(h.saved()[id], undefined, 'the revealed state is persisted')
                    const visible = h.visible()
                    svelteClient.flush(() => activate(id, 'space'))
                    assert.deepEqual(h.visible(), visible, 'clicking a visible pin keeps it open')
                    assert.equal(previousCalls, 0)
                } finally { h.destroy() }
            }
        })
    }
}

Deno.test('toggling the open pin closes its slot without opening a replacement and survives restart', () => {
    const h = harness()
    try {
        h.toggle('left-b')
        assert.deepEqual(h.visible(), ['right-b', 'space-left-b', 'space-right'])
        const restarted = harness(h.saved())
        try {
            assert.deepEqual(restarted.visible(), h.visible())
            restarted.toggle('left-b')
            assert.deepEqual(restarted.visible(), ['left-b', 'right-b', 'space-left-b', 'space-right'])
        } finally { restarted.destroy() }
    } finally { h.destroy() }
})

Deno.test('group and space switches preserve independent pin choices', () => {
    const h = harness({}, { tabs: [...pins(), tab('another-center', { spaceId: 'another' }),
        pin('another-left', 'left', 'space', { spaceId: 'another' })] })
    try {
        h.toggle('left-a')
        h.toggle('other-group-a')
        h.change(state => { state.groupTabId = 'center-b' })
        assert.deepEqual(h.visible(), ['other-group-a', 'space-left-b', 'space-right'])
        h.change(state => { state.spaceId = 'another'; state.groupTabId = 'another-center' })
        assert.deepEqual(h.visible(), ['another-left'])
        h.toggle('another-left')
        h.change(state => { state.spaceId = 'space'; state.groupTabId = 'center-a' })
        assert.deepEqual(h.visible(), ['left-a', 'right-b', 'space-left-b', 'space-right'])
        h.change(state => { state.groupTabId = 'center-b' })
        assert.deepEqual(h.visible(), ['other-group-a', 'space-left-b', 'space-right'])
    } finally { h.destroy() }
})

Deno.test('new pins and changes to side, scope and membership retain exclusivity', () => {
    const h = harness()
    try {
        h.change(state => { state.tabs.push(pin('new-left')) })
        assert.deepEqual(h.visible(), ['new-left', 'right-b', 'space-left-b', 'space-right'])
        h.change(state => { state.tabs.find(tab => tab.id === 'new-left').pinned = 'right' })
        assert.deepEqual(h.visible(), ['new-left', 'space-left-b', 'space-right'])
        h.change(state => { state.tabs.find(tab => tab.id === 'new-left').pinScope = 'space' })
        assert.deepEqual(h.visible(), ['new-left', 'space-left-b'])
        h.change(state => {
            Object.assign(state.tabs.find(tab => tab.id === 'new-left'), { pinScope: 'group', tabGroupId: 'b', pinned: 'left' })
            state.groupTabId = 'center-b'
        })
        assert.deepEqual(h.visible(), ['new-left', 'space-left-b'])
        h.change(state => { state.tabs.find(tab => tab.id === 'new-left').pinned = null })
        assert.deepEqual(h.visible(), ['space-left-b'])
    } finally { h.destroy() }
})

Deno.test('legacy pins and standalone group pins use separate visibility slots', () => {
    const tabs = [
        { id: 'legacy-a', spaceId: 'space', pinned: true },
        { id: 'legacy-b', spaceId: 'space', pinned: 'left' },
        pin('standalone-a', 'left', 'group', { tabGroupId: null }),
        pin('standalone-b', 'left', 'group', { tabGroupId: null }),
        pin('another-space', 'left', 'space', { spaceId: 'another' })
    ]
    assert.deepEqual(resolveSidepinVisibility(tabs, {}), { 'legacy-a': true })
    assert.deepEqual(resolveSidepinVisibility(tabs, { 'legacy-a': true }, 'legacy-a'), { 'legacy-b': true })
})

function elementsWithClass (node, className) {
    if (!node || typeof node !== 'object') return []
    const matches = node.type === 'Element' && node.attributes.some(attribute =>
        attribute.name === 'class' && attribute.value?.[0]?.data?.split(' ').includes(className)) ? [node] : []
    return matches.concat(Object.values(node).flatMap(value => Array.isArray(value)
        ? value.flatMap(child => elementsWithClass(child, className))
        : elementsWithClass(value, className)))
}

const pinElements = elementsWithClass(parse(appSource).html, 'pinned-tab-container')
Deno.test('both title-bar pin stacks show a divider only at scope boundaries', () => {
    const tabs = ['space', 'space', 'group', 'group'].map((scope, i) => pin(`pin-${i}`, 'left', scope))
    for (const element of pinElements) {
        const expression = element.attributes.find(attribute => attribute.name === 'pin-scope-start').expression
        const isBoundary = new Function('data', 'rightPinned', 'rightPinnedTabs', 'tabPinned', 'leftPinnedTabs', 'i',
            `return (${appSource.slice(expression.start, expression.end)})`)
        assert.deepEqual(tabs.map((tab, i) => isBoundary({ getPinScope }, tab, tabs, tab, tabs, i)), [false, false, true, false])
        assert.equal(isBoundary({ getPinScope }, tabs[2], [tabs[2]], tabs[2], [tabs[2]], 0), false)
    }
})

for (const side of ['left', 'right']) {
    Deno.test(`${side} toggle handles clicks and keyboard once while preserving drag initiation`, () => {
        const h = harness()
        try {
            const id = `${side}-b`
            const starts = [], queued = []
            let dragged = false
            const bindHandler = (element, name) => {
                const expression = element.attributes.find(attribute => attribute.name === name).value[0].expression
                return new Function('tab', 'data', 'startTabDrag', 'togglePinnedFrames', 'didDragOccurred',
                    'requestAnimationFrame', 'setActivateRafId', 'activateTab', 'i',
                    `return (${appSource.slice(expression.start, expression.end)})`)(
                    { id }, { spaceMeta: { activeTabId: 'center-a', activeSpace: 'space' } },
                    (...args) => starts.push(args), target => h.toggle(target), () => dragged,
                    callback => { queued.push(callback); return queued.length }, () => {},
                    () => { throw new Error('a toggle must not also activate the tab') }, 0
                )
            }
            const container = pinElements.find(element => {
                const handler = element.attributes.find(attribute => attribute.name === 'onmousedown').value[0].expression
                return appSource.slice(handler.start, handler.end).includes(`'${side}'`)
            })
            const button = elementsWithClass(container, 'pinned-toggle-btn')[0]
            bindHandler(container, 'onmousedown')({ button: 0, currentTarget: container })
            assert.equal(starts.length, 1)
            assert.equal(starts[0].at(-1), side)
            let stopped = false
            bindHandler(button, 'onclick')({ stopPropagation () { stopped = true } })
            queued.forEach(callback => callback())
            assert.equal(stopped, true)
            assert.equal(h.api.hidden(id), true)
            for (const key of ['Enter', ' ']) {
                stopped = false
                const event = { key, preventDefault () {}, stopPropagation () { stopped = true } }
                bindHandler(button, 'onkeydown')(event)
                if (!stopped) bindHandler(container, 'onkeydown')(event)
                assert.equal(stopped, true)
                assert.equal(h.api.hidden(id), key === ' ')
            }
            dragged = true
            bindHandler(button, 'onclick')({ stopPropagation () {} })
            assert.equal(h.api.hidden(id), true, 'a drag does not toggle the pin')
        } finally { h.destroy() }
    })
}

import assert from 'node:assert/strict'
import { compileModule, parse } from 'svelte/compiler'
import * as svelteClient from 'svelte/internal/client'
import { getFrameMoveIds, isLiveFrameTab, registerFrameWrapper } from '../app/lib/frame-lifecycle.js'
import { getTabGroups, planTabMove } from '../app/lib/tab-groups.js'

const frameSource = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const mountNode = parse(frameSource).instance.content.body
    .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'mountControlledFrame')
const mountSource = frameSource.slice(mountNode.start, mountNode.end)
const mountEffectNode = parse(frameSource).instance.content.body.find(node =>
    node.type === 'ExpressionStatement' && node.expression.callee?.name === '$effect' &&
    frameSource.slice(node.start, node.end).includes('mountControlledFrame'))
const mountEffect = mountEffectNode.expression.arguments[0]
const mountEffectSource = frameSource.slice(mountEffect.start, mountEffect.end)

// Exercise the installed reconciler rather than assuming it moves the dragged wrapper.
const eachSource = `<script>${Deno.readTextFileSync(new URL('../node_modules/svelte/src/internal/client/dom/blocks/each.js', import.meta.url))}</script>`
const eachFunctions = parse(eachSource).instance.content.body.filter(node =>
    node.type === 'FunctionDeclaration' && ['reconcile', 'move', 'link'].includes(node.id.name))
    .map(node => eachSource.slice(node.start, node.end)).join('\n')
const reconcile = new Function('get_next_sibling', 'pause_effects', `
    const EACH_IS_ANIMATED = 1, EACH_IS_CONTROLLED = 2, EFFECT_OFFSCREEN = 4, INERT = 8
    ${eachFunctions}
    return reconcile
`)(() => null, () => { throw new Error('Unexpected removal during reorder') })

function movedWrappers(before, after) {
    const moved = []
    const node = id => ({ id, before(other) { moved.push(other.id) } })
    const effects = before.map(id => {
        const element = node(id)
        return { f: 0, id, nodes: { start: element, end: element } }
    })
    effects.forEach((effect, index) => {
        effect.prev = effects[index - 1] || null
        effect.next = effects[index + 1] || null
    })
    reconcile({ effect: { first: effects[0], last: effects.at(-1) },
        items: new Map(effects.map(e => [e.id, { e }])), outrogroups: null }, after, node('anchor'), 0, id => id)
    return moved
}

function attachmentEffect() {
    const tab = { id: 'page', spaceId: 'space', url: 'https://search.example/?q=one' }
    const data = { docs: { page: tab }, permissionState: { status: 'ready' } }
    const wrapper = { isConnected: true }
    const anchor = { parentNode: wrapper }
    const ticks = []
    const mounted = []
    const effect = new Function('data', 'tab', 'tabId', 'frameWrapper', 'anchor', 'tick', 'untrack', 'mountControlledFrame', 'isLiveFrameTab', `
        const isNewTabUrl = url => url.startsWith('about:')
        const isTabHistoryUrl = () => false
        return ${mountEffectSource}
    `)(data, tab, tab.id, wrapper, anchor, () => new Promise(resolve => ticks.push(resolve)), fn => fn(),
        current => mounted.push(current.url), isLiveFrameTab)
    return { effect, tab, data, wrapper, anchor, ticks, mounted }
}

Deno.test('attachment waits until the pending Svelte flush completes', async () => {
    const h = attachmentEffect()
    h.effect()
    assert.deepEqual(h.mounted, [])
    h.ticks[0]()
    await Promise.resolve()
    assert.deepEqual(h.mounted, [h.tab.url])
})

Deno.test('guest mounting waits for persisted permission rules before starting navigation', () => {
    const h = attachmentEffect()
    h.data.permissionState.status = 'loading'
    h.effect()
    assert.equal(h.ticks.length, 0)
    h.data.permissionState.status = 'ready'
    h.effect()
    assert.equal(h.ticks.length, 1)
})

Deno.test('live previews mount while closed and deleted tabs cannot mount', async () => {
    for (const archive of ['preview', 'closed', 'deleted']) {
        const h = attachmentEffect()
        h.tab.archive = archive
        h.tab.preview = true
        h.effect()
        h.ticks[0]()
        await Promise.resolve()
        assert.equal(h.mounted.length, archive === 'preview' ? 1 : 0)
    }
})

Deno.test('superseded attachment effects cannot mount the previous navigation', async () => {
    const h = attachmentEffect()
    const cancel = h.effect()
    cancel()
    h.tab.url = 'https://search.example/?q=two'
    h.effect()
    h.ticks.forEach(resolve => resolve())
    await Promise.resolve()
    assert.deepEqual(h.mounted, ['https://search.example/?q=two'])
})

Deno.test('a pending attachment cannot reclaim a transferred tab or removed wrapper', async () => {
    for (const change of [
        h => { h.tab.spaceId = 'other' },
        h => { h.wrapper.isConnected = false },
        h => { h.anchor.parentNode = {} },
        h => { delete h.data.docs.page }
    ]) {
        const h = attachmentEffect()
        h.effect()
        change(h)
        h.ticks[0]()
        await Promise.resolve()
        assert.deepEqual(h.mounted, [])
    }
})

Deno.test('outgoing lightbox frame props remain readable after its preview reference is cleared', () => {
    const source = Deno.readTextFileSync(new URL('../app/components/Frame.svelte', import.meta.url))
    let component
    function visit(node) {
        if (!node || typeof node !== 'object') return
        if (node.type === 'InlineComponent' && node.name === 'ControlledFrame' &&
            node.attributes.some(attr => attr.name === 'class' && attr.value?.[0]?.data === 'lightbox-controlledframe')) {
            component = node
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit)
            else if (value && typeof value === 'object') visit(value)
        }
    }
    visit(parse(source).html)
    assert.ok(component)
    const expression = component.attributes.find(attr => attr.name === 'tabId').value[0].expression
    const readTabId = new Function('lightboxChild', `return (${source.slice(expression.start, expression.end)})`)
    const data = { docs: { lightbox: { id: 'lightbox' } }, previews: { parent: { lightbox: 'lightbox' } } }
    // Svelte props are getters; an outgoing component can read them during its global outro.
    const props = { get tabId() { return readTabId(data.docs[data.previews.parent.lightbox]) } }
    assert.equal(props.tabId, 'lightbox')
    data.previews.parent.lightbox = null
    assert.equal(props.tabId, undefined)
})

const tab = (id, extra = {}) => ({ id, type: 'tab', spaceId: 'space', order: 1, ...extra })

function frameMoves(items, updates) {
    const docs = Object.fromEntries(items.map(tab => [tab.id, tab]))
    const frames = Object.fromEntries(items.map(tab => {
        const wrapper = { isConnected: true }
        return [tab.id, { wrapper, frame: { parentNode: wrapper } }]
    }))
    return getFrameMoveIds({ docs, frames }, updates, getTabGroups(items))
}

function wrapper() {
    const node = {
        isConnected: true,
        moves: 0,
        inserts: 0,
        moveBefore(frame, anchor) {
            assert.equal(anchor.parentNode, node)
            node.moves++
            frame.parentNode = node
        },
        insertBefore(frame, anchor) {
            node.inserts++
            frame.isConnected = true
            frame.parentNode = node
        }
    }
    return node
}

function harness() {
    const frame = { isConnected: true, parentNode: {} }
    const data = { docs: { page: tab('page') }, frames: { page: { frame } } }
    const node = wrapper()
    const anchor = { parentNode: node }
    const registration = registerFrameWrapper(data, 'page', node, anchor, () => {})
    return { frame, data, node, anchor, registration }
}

Deno.test('sidebar rank and activity updates leave intact frame lists untouched', () => {
    const items = [tab('single'), tab('one', { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('two', { tabGroupId: 'group', tabGroupOrder: 1 })]
    for (const updates of [
        [{ id: 'single', order: 100 }],
        [{ id: 'one', order: 100 }, { id: 'two', order: 100 }],
        [{ id: 'one', lastActivityAt: 200 }]
    ]) {
        assert.equal(frameMoves(items, updates).size, 0)
    }
})

Deno.test('frame reorders protect affected neighbors without hiding unchanged ends', () => {
    const items = [tab('one', { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('two', { tabGroupId: 'group', tabGroupOrder: 1 }),
        tab('three', { tabGroupId: 'group', tabGroupOrder: 2 }), tab('other')]
    assert.deepEqual([...frameMoves(items, [{ id: 'one', tabGroupOrder: 3 }])], ['one', 'two', 'three'])
    assert.deepEqual([...frameMoves(items, [{ id: 'two', tabGroupOrder: 3 }])], ['two', 'three'])
    assert.deepEqual([...frameMoves(items, [{ id: 'one', tabGroupOrder: -1 }])], [])
})

Deno.test('normalizing sparse member ranks protects a neighbor whose numeric rank did not change', () => {
    const items = ['one', 'two', 'three', 'four'].map((id, index) => tab(id, { tabGroupId: 'group', tabGroupOrder: index + 1 }))
    const updates = planTabMove(items, items, 'three', {
        targetSpaceId: 'space', targetGroupTabId: 'one', beforeTabId: 'one', afterTabId: 'two'
    }, () => 'group')
    assert.equal(updates.find(update => update.id === 'two').tabGroupOrder, items[1].tabGroupOrder)
    assert.deepEqual([...frameMoves(items, updates)], ['two', 'three'])
})

Deno.test('parking covers actual Svelte wrapper moves across dense, sparse, and fractional member orders', () => {
    for (const rank of [index => index, index => index + 1, index => index / 2 + 0.25]) {
        const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => tab(id, { tabGroupId: 'group', tabGroupOrder: rank(index) }))
        for (const moving of items) {
            const remaining = items.filter(item => item !== moving)
            for (let index = 0; index <= remaining.length; index++) {
                const updates = planTabMove(items, items, moving.id, {
                    targetSpaceId: 'space', targetGroupTabId: remaining[0].id,
                    beforeTabId: remaining[index - 1]?.id, afterTabId: remaining[index]?.id
                }, () => 'group')
                const parked = frameMoves(items, updates)
                const after = getTabGroups(items.map(item => ({ ...item, ...updates.find(update => update.id === item.id) })))[0].tabs.map(item => item.id)
                for (const id of movedWrappers(items.map(item => item.id), after)) {
                    assert.ok(parked.has(id), `Svelte moved unprotected wrapper ${id}: ${after.join(',')}`)
                }
            }
        }
    }
})

Deno.test('same-group move planning does not regroup the entire destination space', () => {
    const items = ['one', 'two', 'three'].map((id, index) => tab(id, { tabGroupId: 'group', tabGroupOrder: index }))
    const group = getTabGroups(items)[0]
    const target = new Proxy(items, { get(items, key) {
        if (key === 'filter') {
            throw new Error('The resolved group already contains the required members')
        }
        return items[key]
    } })
    assert.equal(planTabMove(items, target, 'three', {
        targetSpaceId: 'space', targetGroupTabId: 'one', afterTabId: 'one'
    }, () => 'group', { sourceGroup: group, targetGroup: group }).length, 3)
})

Deno.test('space, membership and pin changes only park frames whose placement changed', () => {
    const items = [tab('one'), tab('two', { tabGroupId: 'group' }),
        tab('left', { pinned: 'left', pinScope: 'space', pinOrder: 0 }),
        tab('next', { pinned: 'left', pinScope: 'space', pinOrder: 1 })]
    assert.deepEqual([...frameMoves(items, [{ id: 'one', spaceId: 'other' }])], ['one'])
    assert.deepEqual([...frameMoves(items, [{ id: 'one', tabGroupId: 'group' }])], ['one'])
    assert.deepEqual([...frameMoves(items, [{ id: 'left', pinned: 'right' }])], ['left'])
    assert.deepEqual([...frameMoves(items, [{ id: 'left', pinOrder: 2 }])], ['left', 'next'])
})

Deno.test('space and group pins share ordering while global pins remain appended', () => {
    const items = [tab('group-pin', { tabGroupId: 'group', pinned: 'left', pinScope: 'group', pinOrder: 0 }),
        tab('space-pin', { pinned: 'left', pinScope: 'space', pinOrder: 1 }),
        tab('global-pin', { spaceId: 'other', pinned: 'left', pinScope: 'global', pinOrder: -100 })]
    assert.deepEqual([...frameMoves(items, [{ id: 'group-pin', pinOrder: 2 }])], ['group-pin', 'space-pin'])
    assert.deepEqual([...frameMoves(items, [{ id: 'global-pin', pinOrder: 100 }])], [])
})

Deno.test('activity-only updates do not inspect groups or enumerate frame state', () => {
    const docs = { page: tab('page') }
    const untouched = new Proxy({}, {
        get() { throw new Error('Activity changes do not need frame layout') },
        ownKeys() { throw new Error('Activity changes must not enumerate state') }
    })
    assert.equal(getFrameMoveIds({ docs, frames: untouched }, [{ id: 'page', lastActivityAt: 100 }], untouched).size, 0)
})

Deno.test('frame checks use resolved groups without scanning unrelated documents or frame entries', () => {
    const one = tab('one', { tabGroupId: 'group', tabGroupOrder: 0 })
    const two = tab('two', { tabGroupId: 'group', tabGroupOrder: 1 })
    Object.defineProperty(one, 'canvas', { enumerable: true, get() { throw new Error('Frame layout must not copy document payloads') } })
    const docs = new Proxy({ one, two }, {
        get(target, id) {
            assert.ok(id === 'one' || id === 'two', 'Only affected documents should be read')
            return target[id]
        },
        ownKeys() { throw new Error('Documents must not be enumerated') }
    })
    const wrapper = { isConnected: true }
    const frames = new Proxy({ one: { wrapper, frame: { parentNode: wrapper } } }, {
        ownKeys() { throw new Error('Center reorders must not enumerate frames') }
    })
    const moved = getFrameMoveIds({ docs, frames }, [{ id: 'one', tabGroupOrder: 2 }], [{ tabs: [one, two] }])
    assert.deepEqual([...moved], ['one'])
    assert.equal(getFrameMoveIds({ docs, frames: {} }, [{ id: 'one', tabGroupOrder: 2 }], [{ tabs: [one, two] }]).size, 0)
})

Deno.test('pin changes inspect mounted siblings without reading hibernated documents', () => {
    const docs = {
        left: tab('left', { pinned: 'left', pinScope: 'space', pinOrder: 0 }),
        next: tab('next', { pinned: 'left', pinScope: 'space', pinOrder: 1 }),
        get sleeping() { throw new Error('Hibernated documents are unrelated to mounted pin order') }
    }
    const frames = { sleeping: { frame: null } }
    for (const id of ['left', 'next']) {
        const wrapper = { isConnected: true }
        frames[id] = { wrapper, frame: { parentNode: wrapper } }
    }
    assert.deepEqual([...getFrameMoveIds({ docs, frames }, [{ id: 'left', pinned: 'right' }], [])], ['left'])
})

Deno.test('ready wrapper attaches a parked frame and repeated attachment is a no-op', () => {
    const h = harness()
    assert.equal(h.registration.attach(), true)
    assert.equal(h.frame.parentNode, h.node)
    assert.equal(h.node.moves, 1)
    assert.equal(h.registration.attach(), true)
    assert.equal(h.node.moves, 1)
    assert.equal(h.node.inserts, 0)
})

Deno.test('preview attachment remains eligible until the preview closes', () => {
    const h = harness()
    Object.assign(h.data.docs.page, { preview: true, archive: 'preview' })
    assert.equal(h.registration.attach(), true)
    h.data.docs.page.archive = 'closed'
    assert.equal(h.registration.attach(), false)
})

Deno.test('outer frame effects cannot overwrite native attachment ownership after metadata changes', () => {
    const source = Deno.readTextFileSync(new URL('../app/components/Frame.svelte', import.meta.url))
    const effect = parse(source).instance.content.body.find(node => node.type === 'ExpressionStatement' &&
        node.expression.callee?.name === '$effect' && source.slice(node.start, node.end).includes('data.frames[tab.id].wrapper = frameWrapper'))
    const code = compileModule(`export function mount(data, frameWrapper, controlledFrameSupported) {
        const tabId = 'page', observer = null
        const tab = $derived(data.docs[tabId])
        ${source.slice(effect.start, effect.end)}
    }`, { generate: 'client' }).js.code.replace(/^import .*$/gm, '').replace('export function mount', 'function mount')
    const mount = new Function('$', `${code}; return mount`)(svelteClient)
    const outer = Object.assign(Object.create({}), wrapper())
    const inner = Object.assign(Object.create({}), wrapper())
    const frame = Object.assign(Object.create({}), { isConnected: true, parentNode: inner })
    const data = svelteClient.proxy({ docs: { page: tab('page') }, frames: { page: { frame } } })
    const destroy = svelteClient.effect_root(() => mount(data, outer, true))
    try {
        svelteClient.flush()
        const registration = registerFrameWrapper(data, 'page', inner, { parentNode: inner }, () => {})
        data.docs.page = { ...data.docs.page, title: 'New metadata' }
        svelteClient.flush()
        data.docs.page.pinned = 'left'
        svelteClient.flush()
        assert.equal(data.frames.page.wrapper, inner)
        assert.equal(registration.attach(), true)
    } finally {
        destroy()
    }
})

Deno.test('reusing a wrapper for another tab parks the old frame and attaches the new owner', () => {
    const data = {
        docs: { first: tab('first', { url: 'https://first.example/' }), next: tab('next', { url: 'https://next.example/' }) },
        frames: { first: {}, next: {} }
    }
    const node = wrapper()
    const anchor = { parentNode: node }
    const background = wrapper()
    const backgroundAnchor = { parentNode: background }
    const cancelled = []
    const mount = new Function('data', 'registerFrameWrapper', 'document', 'frameScreenshots', `
        let frameRegistration = null, detached = false
        const setupMessageListener = () => {}, setupRequestHandler = () => {}
        const setupContentScripts = () => {}, setupContextMenu = () => {}
        const throttle = fn => fn
        const createControlledFrame = () => ({ isConnected: false, classList: { add() {} } })
        ${mountSource}
        return mountControlledFrame
    `)(data, registerFrameWrapper, {
        getElementById: id => id === 'backgroundFrames' ? background : backgroundAnchor
    }, { cancel: frame => cancelled.push(frame) })

    mount(data.docs.first, false, node, anchor)
    const first = data.frames.first.frame
    const oldAttach = data.frames.first.attach
    mount(data.docs.next, false, node, anchor)
    const next = data.frames.next.frame

    assert.equal(first.parentNode, background)
    assert.equal(next.parentNode, node)
    assert.equal(data.frames.first.wrapper, undefined)
    assert.equal(data.frames.next.wrapper, node)
    assert.equal(oldAttach(), false)
    assert.deepEqual(cancelled, [first])
    mount(data.docs.next, false, node, anchor)
    assert.equal(data.frames.next.frame, next)
    assert.equal(node.inserts, 2)
})

Deno.test('a newly mounted destination claims a waiting frame without timers', () => {
    const h = harness()
    h.node.isConnected = false
    assert.equal(h.registration.attach(), false)
    const destination = wrapper()
    const next = registerFrameWrapper(h.data, 'page', destination, { parentNode: destination }, () => {})
    assert.equal(next.attach(), true)
    assert.equal(h.frame.parentNode, destination)
    assert.equal(destination.moves, 1)
    assert.equal(h.registration.attach(), false)
})

Deno.test('new disconnected frames use initial insertion, not a state-preserving move', () => {
    const h = harness()
    h.frame.isConnected = false
    h.frame.parentNode = null
    assert.equal(h.registration.attach(), true)
    assert.equal(h.node.inserts, 1)
    assert.equal(h.node.moves, 0)
})

Deno.test('attachment failure preserves the live frame and its registration', () => {
    const h = harness()
    h.node.moveBefore = () => { throw new Error('Destination changed') }
    const report = console.error
    const errors = []
    console.error = (...args) => errors.push(args)
    try {
        assert.equal(h.registration.attach(), false)
    } finally {
        console.error = report
    }
    assert.equal(errors.length, 1)
    assert.equal(h.data.frames.page.frame, h.frame)
    assert.equal(h.registration.owns(), true)
})

Deno.test('old cleanup cannot clear a replacement wrapper or frame registration', () => {
    const h = harness()
    const destination = wrapper()
    const next = registerFrameWrapper(h.data, 'page', destination, { parentNode: destination }, () => {})
    h.registration.destroy()
    assert.equal(h.data.frames.page.wrapper, destination)
    assert.equal(next.owns(), true)
    h.data.frames.page = { frame: { isConnected: true } }
    next.destroy()
    assert.ok(h.data.frames.page.frame)
    assert.equal(next.attach(), false)
})

Deno.test('closed, removed, or transferred tabs cannot attach through an old wrapper', () => {
    for (const change of [
        h => { h.data.docs.page.archive = 'closed' },
        h => { delete h.data.docs.page },
        h => { h.data.docs.page.spaceId = 'other' },
        h => { delete h.data.frames.page },
        h => { h.anchor.parentNode = {} }
    ]) {
        const h = harness()
        change(h)
        assert.equal(h.registration.attach(), false)
        assert.equal(h.node.moves, 0)
    }
})

import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { getFrameMoveIds, registerFrameWrapper } from '../app/lib/frame-lifecycle.js'
import { getTabGroups } from '../app/lib/tab-groups.js'

const frameSource = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const mountNode = parse(frameSource).instance.content.body
    .find(node => node.type === 'FunctionDeclaration' && node.id.name === 'mountControlledFrame')
const mountSource = frameSource.slice(mountNode.start, mountNode.end)

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

Deno.test('a real frame reorder protects live siblings as well as the updated member', () => {
    const items = [tab('one', { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('two', { tabGroupId: 'group', tabGroupOrder: 1 }),
        tab('three', { tabGroupId: 'group', tabGroupOrder: 2 }), tab('other')]
    assert.deepEqual([...frameMoves(items, [{ id: 'one', tabGroupOrder: 3 }])].sort(), ['one', 'three', 'two'])
    assert.deepEqual([...frameMoves(items, [{ id: 'one', tabGroupOrder: -1 }])], [])
})

Deno.test('space, membership and pin panel changes require frame protection', () => {
    const items = [tab('one'), tab('two', { tabGroupId: 'group' }),
        tab('left', { pinned: 'left', pinScope: 'space', pinOrder: 0 }),
        tab('next', { pinned: 'left', pinScope: 'space', pinOrder: 1 })]
    assert.deepEqual([...frameMoves(items, [{ id: 'one', spaceId: 'other' }])], ['one'])
    assert.deepEqual([...frameMoves(items, [{ id: 'one', tabGroupId: 'group' }])].sort(), ['one', 'two'])
    assert.deepEqual([...frameMoves(items, [{ id: 'left', pinned: 'right' }])].sort(), ['left', 'next'])
    assert.deepEqual([...frameMoves(items, [{ id: 'left', pinOrder: 2 }])].sort(), ['left', 'next'])
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
    assert.deepEqual([...getFrameMoveIds({ docs, frames }, [{ id: 'left', pinOrder: 2 }], [])].sort(), ['left', 'next'])
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

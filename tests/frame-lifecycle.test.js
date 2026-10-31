import assert from 'node:assert/strict'
import { getFrameMoveIds, registerFrameWrapper } from '../app/lib/frame-lifecycle.js'

const tab = (id, extra = {}) => ({ id, type: 'tab', spaceId: 'space', order: 1, ...extra })

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
        assert.equal(getFrameMoveIds(items, updates).size, 0)
    }
})

Deno.test('a real frame reorder protects live siblings as well as the updated member', () => {
    const items = [tab('one', { tabGroupId: 'group', tabGroupOrder: 0 }),
        tab('two', { tabGroupId: 'group', tabGroupOrder: 1 }),
        tab('three', { tabGroupId: 'group', tabGroupOrder: 2 }), tab('other')]
    assert.deepEqual([...getFrameMoveIds(items, [{ id: 'one', tabGroupOrder: 3 }])].sort(), ['one', 'three', 'two'])
    assert.deepEqual([...getFrameMoveIds(items, [{ id: 'one', tabGroupOrder: -1 }])], [])
})

Deno.test('space, membership and pin panel changes require frame protection', () => {
    const items = [tab('one'), tab('two', { tabGroupId: 'group' }),
        tab('left', { pinned: 'left', pinScope: 'space', pinOrder: 0 }),
        tab('next', { pinned: 'left', pinScope: 'space', pinOrder: 1 })]
    assert.deepEqual([...getFrameMoveIds(items, [{ id: 'one', spaceId: 'other' }])], ['one'])
    assert.deepEqual([...getFrameMoveIds(items, [{ id: 'one', tabGroupId: 'group' }])].sort(), ['one', 'two'])
    assert.deepEqual([...getFrameMoveIds(items, [{ id: 'left', pinned: 'right' }])].sort(), ['left', 'next'])
    assert.deepEqual([...getFrameMoveIds(items, [{ id: 'left', pinOrder: 2 }])].sort(), ['left', 'next'])
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

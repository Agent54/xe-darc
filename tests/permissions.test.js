import assert from 'node:assert/strict'
import vm from 'node:vm'
import resourceTypes from '../app/lib/resourceTypes.js'
import { createPermissionStore, handleFramePermission, permissionDescriptor, permissionDocumentId, permissionScope, getPendingPermissionRequests } from '../app/lib/permissions.js'

function harness(records = new Map(), instanceId = 'installation') {
    const permissions = {}, rules = {}, state = { status: 'loading', error: null }
    const contexts = new Map(['one', 'two'].map(id => [id, { url: 'https://site.example/page', partition: 'persist:myapp', frame: {} }]))
    const writes = [], revocations = []
    let failWrite = false, conflicts = 0
    const db = {
        async allDocs({ startkey, endkey }) {
            return { rows: [...records.values()].filter(doc => !doc._deleted && doc._id >= startkey && doc._id <= endkey).map(doc => ({ doc: structuredClone(doc) })) }
        },
        async get(id) {
            const doc = records.get(id)
            if (!doc || doc._deleted) { throw { status: 404 } }
            return structuredClone(doc)
        },
        async put(doc) {
            if (failWrite) { throw { status: 500 } }
            if (conflicts-- > 0) { throw { status: 409 } }
            const old = records.get(doc._id)
            if (old && !(old._deleted && !doc._rev) && doc._rev !== old._rev) { throw { status: 409 } }
            const rev = `${Number(old?._rev?.split('-')[0] || 0) + 1}-test`
            records.set(doc._id, structuredClone({ ...doc, _rev: rev }))
            writes.push(structuredClone(doc))
            return { rev }
        }
    }
    const store = createPermissionStore({ db, putDocument: doc => db.put(doc), permissions, rules, state, instanceId,
        getWindowId: () => 'window', getContext: id => contexts.get(id), onRevoke: scope => revocations.push(scope) })
    return { store, records, permissions, rules, state, contexts, writes, revocations,
        resources: () => Object.values(permissions).flatMap(type => Object.values(type.origins || {}).flatMap(entry => entry.requests)),
        data: { permissionRequest: (id, input, context) => store.request(id, input, context) },
        failWrites() { failWrite = true }, conflictOnce() { conflicts = 1 } }
}

function native(h, { type = 'geolocation', tabId = 'one', nested = false, cancelable = !nested, url = 'https://site.example/page', ...details } = {}) {
    const actions = []
    const event = new Event('permissionrequest', { cancelable })
    let dispatching = true, settled = false
    function respond(receiver, action) {
        if (receiver !== controller || settled || (!dispatching && !event.defaultPrevented)) {
            actions.push('invalid-response')
        }
        settled = true
        actions.push(action)
    }
    const controller = Object.freeze({ url, allow() { respond(this, 'allow') },
        ...(nested ? { cancel() { respond(this, 'cancel') } } : { deny() { respond(this, 'deny') } }) })
    Object.assign(event, nested ? { permissionRequest: Object.freeze({ permission: type, request: controller, ...details }) }
        : { permission: type, url, request: controller, ...details })
    event.preventDefault = function () {
        Event.prototype.preventDefault.call(this)
        actions.push('defer')
    }
    assert.equal(handleFramePermission(h.data, tabId, event, h.contexts.get(tabId)), undefined)
    dispatching = false
    if (!settled && !event.defaultPrevented) {
        settled = true
        actions.push('default-deny')
    }
    return actions
}

Deno.test('motion sensor availability never requests access in the embedder', async () => {
    const sensor = { requestPermission() { throw new Error('Availability checks must not request permission') } }
    const available = vm.runInNewContext(`(${resourceTypes['motion-sensors'].availability.toString()})()`, {
        window: { DeviceOrientationEvent: sensor, DeviceMotionEvent: sensor }, DeviceOrientationEvent: sensor
    })
    assert.equal((await available).available, true)
    const unavailable = vm.runInNewContext(`(${resourceTypes['motion-sensors'].availability.toString()})()`, { window: {} })
    assert.equal((await unavailable).available, false)
})

Deno.test('pending permission notifications include previously seen requests and isolate the current window', () => {
    const request = (requestId, status, windowId, created, unseen = true) => ({ requestId, status, windowId, created, unseen })
    const first = request('first', 'requested', 'current', 1, false)
    const later = request('later', 'requested', 'current', 3)
    const permissions = {
        camera: { origins: { site: { requests: [later, request('allowed', 'granted', 'current', 0)] } } },
        geolocation: { origins: { site: { requests: [first, request('ignored', 'ignored', 'current', 2), request('other', 'requested', 'other', 0)] } } }
    }
    assert.deepEqual(getPendingPermissionRequests(permissions, 'current'), [first, later])
    first.status = 'denied'
    assert.deepEqual(getPendingPermissionRequests(permissions, 'current'), [later])
})

Deno.test('permanent grants and denials survive a new store; resets remove the saved rule', async () => {
    const h = harness()
    await h.store.ready
    native(h)
    const resource = h.resources()[0]
    await h.store.resolve(resource.requestId, 'allow')
    assert.equal(h.store.decision('geolocation', 'one'), 'allow')
    assert.equal(h.writes[0].type, 'permission')
    assert.deepEqual(h.writes[0].permission, { name: 'geolocation' })
    assert.equal('requests' in h.writes[0], false)
    const reopened = harness(h.records)
    await reopened.store.ready
    assert.equal(reopened.store.decision('geolocation', 'one'), 'allow')
    await reopened.store.setDecision('geolocation', 'one', 'deny')
    const denied = harness(h.records)
    await denied.store.ready
    assert.equal(denied.store.decision('geolocation', 'one'), 'deny')
    await denied.store.setDecision('geolocation', 'one', null)
    const reset = harness(h.records)
    await reset.store.ready
    assert.equal(reset.store.decision('geolocation', 'one'), 'ask')
    await reset.store.setDecision('geolocation', 'one', 'allow')
    assert.equal(reset.store.decision('geolocation', 'one'), 'allow')
})

Deno.test('one-time approval resolves only one native request and is not saved', async () => {
    const h = harness()
    await h.store.ready
    const first = native(h), second = native(h, { tabId: 'two' })
    await h.store.resolve(h.resources()[0].requestId, 'allow', 'once')
    assert.deepEqual(first, ['defer', 'allow'])
    assert.deepEqual(second, ['defer'])
    assert.equal(h.store.decision('geolocation', 'one'), 'ask')
    assert.equal(h.writes.length, 0)
    h.store.cancelFrame(h.contexts.get('two').frame)
    assert.deepEqual(second, ['defer', 'deny'])
})

Deno.test('synchronous event controllers get one frame-bound retry, consumed only once', async () => {
    for (const shape of [{ nested: true }, { nested: true, cancelable: true }, { cancelable: false }]) {
        const h = harness()
        await h.store.ready
        const denied = shape.nested ? 'cancel' : 'deny'
        const first = native(h, shape)
        assert.deepEqual(first, [denied])
        await h.store.resolve(h.resources()[0].requestId, 'allow', 'once')
        assert.deepEqual(first, [denied])
        assert.deepEqual(native(h, { ...shape, tabId: 'two' }), [denied])
        assert.deepEqual(native(h, shape), ['allow'])
        assert.deepEqual(native(h, shape), [denied])
        h.store.cancelFrame(h.contexts.get('one').frame)
    }
})

Deno.test('cached answers resolve synchronously on the request controller in both event shapes', async () => {
    for (const shape of [{}, { nested: true }, { cancelable: false }]) {
        const h = harness()
        await h.store.ready
        await h.store.setDecision('geolocation', 'one', 'allow')
        assert.deepEqual(native(h, shape), shape.nested || shape.cancelable === false ? ['allow'] : ['defer', 'allow'])
        await h.store.setDecision('geolocation', 'one', 'deny')
        const denied = shape.nested ? 'cancel' : 'deny'
        assert.deepEqual(native(h, shape), shape.nested || shape.cancelable === false ? [denied] : ['defer', denied])
        assert.equal(h.resources().length, 0)
    }
})

Deno.test('saving or ignoring a synchronous request never calls its expired controller again', async () => {
    for (const shape of [{ nested: true }, { cancelable: false }]) {
        for (const answer of ['allow', 'deny', 'ignore']) {
            const h = harness()
            await h.store.ready
            const actions = native(h, shape)
            const denied = shape.nested ? 'cancel' : 'deny'
            assert.deepEqual(actions, [denied])
            await h.store.resolve(h.resources()[0].requestId, answer)
            assert.deepEqual(actions, [denied])
            assert.deepEqual(native(h, shape), [answer === 'allow' ? 'allow' : denied])
            h.store.cancelFrame(h.contexts.get('one').frame)
        }
    }
})

Deno.test('unsupported and opaque-origin requests synchronously deny or cancel on their controller', async () => {
    for (const shape of [{}, { nested: true }]) {
        const h = harness()
        await h.store.ready
        const denied = shape.nested ? 'cancel' : 'deny'
        assert.deepEqual(native(h, { ...shape, type: 'futurePermission' }), [denied])
        assert.deepEqual(native(h, { ...shape, url: 'data:text/html,opaque' }), [denied])
        assert.equal(h.resources().every(resource => !resource.supported), true)
    }
})

Deno.test('one-time approval and dismissal target the selected request among repeated same-tab requests', async () => {
    const h = harness()
    await h.store.ready
    const first = native(h), second = native(h)
    assert.equal(h.resources().length, 2)
    await h.store.resolve(h.resources()[1].requestId, 'allow', 'once')
    assert.deepEqual(first, ['defer'])
    assert.deepEqual(second, ['defer', 'allow'])
    await h.store.resolve(h.resources()[0].requestId, 'ignore')
    assert.deepEqual(first, ['defer', 'deny'])
})

Deno.test('temporary session grants are not restored after reopening', async () => {
    const h = harness()
    await h.store.ready
    native(h)
    await h.store.resolve(h.resources()[0].requestId, 'allow', 'session')
    assert.equal(h.store.decision('geolocation', 'two'), 'allow')
    const reopened = harness(h.records)
    await reopened.store.ready
    assert.equal(reopened.store.decision('geolocation', 'one'), 'ask')
    assert.equal(h.writes.length, 0)
})

Deno.test('same-tab navigation choices persist without becoming native permission grants', async () => {
    const h = harness()
    await h.store.ready
    assert.equal(await h.store.setDecision('open-tab', 'one', 'same-tab'), true)
    assert.equal(await h.store.setDecision('geolocation', 'one', 'same-tab'), false)
    const reopened = harness(h.records)
    await reopened.store.ready
    assert.equal(reopened.store.decision('open-tab', 'one'), 'same-tab')
    assert.equal(reopened.store.decision('geolocation', 'one'), 'ask')
})

Deno.test('partition, embedding origin, requesting origin, and installation isolate grants', async () => {
    const h = harness()
    await h.store.ready
    await h.store.setDecision('geolocation', 'one', 'allow', 'https://widget.example')
    assert.equal(h.store.decision('geolocation', 'one', 'https://widget.example'), 'allow')
    assert.equal(h.store.decision('geolocation', 'one'), 'ask')
    h.contexts.get('two').partition = 'persist:other'
    assert.equal(h.store.decision('geolocation', 'two', 'https://widget.example'), 'ask')
    h.contexts.get('two').partition = 'persist:myapp'
    h.contexts.get('two').url = 'https://other.example/'
    assert.equal(h.store.decision('geolocation', 'two', 'https://widget.example'), 'ask')
    const other = harness(h.records, 'another-installation')
    await other.store.ready
    assert.equal(other.store.decision('geolocation', 'one', 'https://widget.example'), 'ask')
})

Deno.test('unknown and opaque-origin requests cannot be granted or pollute the registry', async () => {
    const h = harness()
    await h.store.ready
    for (const type of ['futurePermission', '__proto__', 'constructor', 'javascript', 'file-editing']) {
        assert.equal(h.store.request('one', { permission: type, url: 'https://site.example' }).granted, false)
    }
    h.store.request('one', { permission: 'geolocation', url: 'data:text/html,opaque' })
    for (const resource of h.resources()) {
        assert.equal(await h.store.resolve(resource.requestId, 'allow'), false)
    }
    assert.equal(Object.hasOwn(h.permissions, '__proto__'), false)
    assert.equal(h.writes.length, 0)
    assert.equal(permissionScope('installation', h.contexts.get('one'), 'data:text/html,opaque'), null)
})

Deno.test('media permissions remain separate and ambiguous media is denied', async () => {
    const h = harness()
    await h.store.ready
    const both = native(h, { type: 'media', mediaTypes: ['audio', 'video'] })
    assert.deepEqual(h.resources().map(item => item.type), ['microphone', 'camera'])
    await h.store.resolve(h.resources()[0].requestId, 'allow')
    assert.deepEqual(both, ['defer'])
    await h.store.resolve(h.resources()[1].requestId, 'deny')
    assert.deepEqual(both, ['defer', 'deny'])
    assert.equal(h.store.decision('microphone', 'one'), 'allow')
    assert.equal(h.store.decision('camera', 'one'), 'deny')
    assert.deepEqual(native(h, { type: 'media' }), ['deny'])
    assert.equal(h.resources().at(-1).supported, false)
})

Deno.test('downloads scope approval to the initiating site and resume their controller', async () => {
    const h = harness()
    await h.store.ready
    const actions = native(h, { type: 'download', url: 'blob:https://site.example/file' })
    const resource = h.resources()[0]
    assert.equal(resource.scope.requestingOrigin, 'https://site.example')
    await h.store.resolve(resource.requestId, 'allow')
    assert.deepEqual(actions, ['defer', 'allow'])
    assert.equal(resource.needsReload, false)
    assert.deepEqual(native(h, { type: 'download', url: 'https://cdn.example/file.zip' }), ['defer', 'allow'])
})

Deno.test('ignoring or cancelling a frame settles pending requests without a grant', async () => {
    for (const action of ['ignore', 'cancel']) {
        const h = harness()
        await h.store.ready
        const actions = native(h)
        if (action === 'ignore') {
            await h.store.resolve(h.resources()[0].requestId, 'ignore')
        } else {
            h.store.cancelFrame(h.contexts.get('one').frame)
        }
        assert.deepEqual(actions, ['defer', 'deny'])
        assert.equal(h.store.decision('geolocation', 'one'), 'ask')
        assert.equal(h.writes.length, 0)
    }
})

Deno.test('changed pages and replaced frame instances cannot receive old approvals', async () => {
    for (const change of ['url', 'frame']) {
        const h = harness()
        await h.store.ready
        const actions = native(h)
        h.contexts.set('one', { ...h.contexts.get('one'), [change]: change === 'url' ? 'https://other.example/' : {} })
        assert.equal(await h.store.resolve(h.resources()[0].requestId, 'allow'), false)
        h.store.cancelFrame(change === 'frame' ? {} : h.contexts.get('one').frame)
        await h.store.resolve(h.resources()[0].requestId, 'ignore')
        assert.equal(actions.includes('allow'), false)
    }
})

Deno.test('write failures never produce a durable grant; conflicts retry the intended decision', async () => {
    const h = harness()
    await h.store.ready
    const actions = native(h)
    h.failWrites()
    await assert.rejects(h.store.resolve(h.resources()[0].requestId, 'allow'))
    assert.equal(h.store.decision('geolocation', 'one'), 'ask')
    assert.deepEqual(actions, ['defer'])
    h.store.cancelFrame(h.contexts.get('one').frame)
    const retry = harness()
    await retry.store.ready
    retry.conflictOnce()
    assert.equal(await retry.store.setDecision('open-tab', 'one', 'allow'), true)
    assert.equal(retry.store.decision('open-tab', 'one'), 'allow')
})

Deno.test('malformed and conflicting saved rules never become grants', async () => {
    const h = harness()
    await h.store.ready
    const scope = permissionScope('installation', h.contexts.get('one'))
    const permission = permissionDescriptor('geolocation')
    const doc = { _id: permissionDocumentId(scope, permission), type: 'permission', schemaVersion: 1, ...scope, permission, decision: 'allow', lifetime: 'persistent' }
    for (const invalid of [{ ...doc, schemaVersion: 2 }, { ...doc, _conflicts: ['other'] }, { ...doc, requestingOrigin: 'null' }, { ...doc, permission: { name: 'unknown' } }]) {
        h.store.ingest(invalid)
        assert.equal(h.store.decision('geolocation', 'one'), 'ask')
    }
    h.store.ingest(doc)
    assert.equal(h.store.decision('geolocation', 'one'), 'allow')
    h.store.ingest({ _id: doc._id, _deleted: true })
    assert.equal(h.store.decision('geolocation', 'one'), 'ask')
})

Deno.test('delayed older changes cannot restore an allow after a denial or reset', async () => {
    const h = harness()
    await h.store.ready
    await h.store.setDecision('geolocation', 'one', 'allow')
    const allowed = structuredClone(Object.values(h.rules)[0])
    await h.store.setDecision('geolocation', 'one', 'deny')
    h.store.ingest(allowed)
    assert.equal(h.store.decision('geolocation', 'one'), 'deny')
    await h.store.setDecision('geolocation', 'one', null)
    h.store.ingest(allowed)
    assert.equal(h.store.decision('geolocation', 'one'), 'ask')
})

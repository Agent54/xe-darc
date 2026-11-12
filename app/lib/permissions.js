const nativeTypes = new Set(['geolocation', 'pointerLock', 'download', 'filesystem', 'fullscreen', 'hid', 'clipboardReadWrite', 'clipboardSanitizedWrite'])
const navigationTypes = new Set(['open-tab', 'navigate-off-origin'])

export function getPendingPermissionRequests(permissions, windowId) {
    return Object.values(permissions).flatMap(permission => Object.values(permission.origins || {}).flatMap(origin => origin.requests || []))
        .filter(request => request.status === 'requested' && request.windowId === windowId)
        .sort((a, b) => (a.created || 0) - (b.created || 0) || a.requestId.localeCompare(b.requestId))
}

function validDecision(permission, decision) {
    return ['allow', 'deny'].includes(decision) || (navigationTypes.has(permission?.name) && decision === 'same-tab')
}

export function permissionDescriptor(type) {
    if (type === 'camera' || type === 'microphone') {
        return { name: 'media', capability: type }
    }
    if (nativeTypes.has(type) || navigationTypes.has(type)) {
        return { name: type }
    }
    return null
}

export function permissionType(descriptor) {
    if (descriptor?.name === 'media' && ['camera', 'microphone'].includes(descriptor.capability)) {
        return descriptor.capability
    }
    const canonical = permissionDescriptor(descriptor?.name)
    return canonical?.name === descriptor?.name && !descriptor?.capability ? canonical.name : null
}

export function permissionOrigin(url) {
    try {
        const parsed = new URL(url)
        return ['https:', 'http:'].includes(parsed.protocol) && parsed.origin !== 'null' ? parsed.origin : null
    } catch {
        return null
    }
}

export function permissionScope(instanceId, context, url = context?.url) {
    const topLevelOrigin = permissionOrigin(context?.url)
    const requestingOrigin = permissionOrigin(url)
    if (!instanceId || !topLevelOrigin || !requestingOrigin) {
        return null
    }
    return { instanceId, partition: context.partition || 'persist:myapp', topLevelOrigin, requestingOrigin }
}

export function permissionDocumentId(scope, permission) {
    return 'darc:permission:' + [scope.instanceId, scope.partition, scope.topLevelOrigin, scope.requestingOrigin,
        permission.name, permission.capability || ''].map(encodeURIComponent).join(':')
}

export function normalizePermissionEvent(event, context) {
    const payload = event?.permissionRequest || event
    const controller = payload?.request
    const type = payload?.permission
    const url = type === 'download' ? context?.url : payload?.url || controller?.url || controller?.origin
    let types = [type]
    let error = null
    if (type === 'media') {
        types = []
        const mediaTypes = payload.mediaTypes || controller?.mediaTypes
        if (Array.isArray(mediaTypes) && mediaTypes.length && mediaTypes.every(value => ['audio', 'video', 'camera', 'microphone'].includes(value))) {
            types = [...new Set(mediaTypes.map(value => ['audio', 'microphone'].includes(value) ? 'microphone' : 'camera'))]
        } else if (mediaTypes === undefined) {
            if (payload.audio === true || controller?.audio === true) {
                types.push('microphone')
            }
            if (payload.video === true || controller?.video === true) {
                types.push('camera')
            }
        }
        if (!types.length) {
            error = 'This media request does not identify camera or microphone access. It cannot be allowed safely.'
        }
    } else if (!nativeTypes.has(type)) {
        error = 'No permission handler is implemented for this request.'
    }
    const deny = () => {
        if (typeof controller?.deny === 'function') {
            controller.deny()
        } else {
            controller?.cancel?.()
        }
    }
    return { types, type, url, controller, deny, error }
}

export function handleFramePermission(data, tabId, event, context) {
    const request = normalizePermissionEvent(event, context)
    if (request.error || !request.controller || !permissionOrigin(request.url)) {
        data.permissionRequest(tabId, { permission: request.type, url: request.url || context?.url, error: request.error || 'The request has no valid origin.' }, context)
        request.deny()
        return
    }
    // Chromium's flat event supports deferral; draft-style nested events need a synchronous answer.
    const deferred = !event.permissionRequest && event.cancelable === true && typeof event.preventDefault === 'function'
    if (deferred) {
        event.preventDefault()
    }
    let settled = false
    const settle = granted => {
        if (settled) {
            return
        }
        settled = true
        try {
            if (granted) {
                request.controller.allow()
            } else {
                request.deny()
            }
        } catch (error) {
            console.error('Could not resolve guest permission', error)
        }
    }
    try {
        const result = data.permissionRequest(tabId, {
            permission: request.type, types: request.types, url: request.url,
            settle: deferred ? settle : null
        }, context)
        if (result.granted || !deferred || !result.pending) {
            settle(result.granted)
        }
    } catch (error) {
        settle(false)
        console.error('Could not handle guest permission', error)
    }
}

export function createPermissionStore({ db, putDocument, permissions, rules, state, instanceId, getContext, getWindowId, onRevoke = () => {} }) {
    const prefix = `darc:permission:${encodeURIComponent(instanceId)}:`
    const transient = new Map()
    const requests = new Map()
    const groups = new Set()
    const writes = new Map()
    const changedDuringLoad = new Set()
    const conflictingRules = new Set()
    const revisions = new Map()
    state.saving = {}

    function ingest(doc) {
        if (!doc?._id?.startsWith('darc:permission:')) {
            return false
        }
        if (!doc._id.startsWith(prefix)) {
            return true
        }
        const generation = Number.parseInt(doc._rev, 10) || 0
        if (generation < (revisions.get(doc._id) || 0)) {
            return true
        }
        revisions.set(doc._id, generation)
        changedDuringLoad.add(doc._id)
        if (doc._conflicts?.length) {
            conflictingRules.add(doc._id)
        } else {
            conflictingRules.delete(doc._id)
        }
        if (state.status !== 'error') {
            state.error = conflictingRules.size ? 'A saved permission has conflicting decisions. Choose a new decision or reset it.' : null
        }
        const previous = transient.get(doc._id) || rules[doc._id]
        delete rules[doc._id]
        if (!doc._deleted && doc.type === 'permission' && doc.schemaVersion === 1 && doc.instanceId === instanceId &&
            permissionType(doc.permission) && validDecision(doc.permission, doc.decision) && doc.lifetime === 'persistent' &&
            !doc._conflicts?.length && permissionOrigin(doc.topLevelOrigin) === doc.topLevelOrigin &&
            permissionOrigin(doc.requestingOrigin) === doc.requestingOrigin && typeof doc.partition === 'string' &&
            permissionDocumentId(doc, doc.permission) === doc._id) {
            rules[doc._id] = doc
        }
        transient.delete(doc._id)
        const next = rules[doc._id]
        if ((previous?.decision === 'allow' && next?.decision !== 'allow') ||
            (next?.decision === 'deny' && previous?.decision !== 'deny')) {
            const revoked = previous || next
            onRevoke(revoked, revoked.permission)
        }
        queueMicrotask(settleGroups)
        return true
    }

    const ready = db.allDocs({ startkey: prefix, endkey: prefix + '\uffff', include_docs: true, conflicts: true }).then(result => {
        for (const { doc } of result.rows) {
            if (doc && !changedDuringLoad.has(doc._id)) {
                ingest(doc)
            }
        }
        state.status = 'ready'
    }).catch(error => {
        state.status = 'error'
        state.error = 'Could not load saved permission decisions.'
        console.error(state.error, error)
    })

    function scopeFor(tabId, url, context = getContext(tabId)) {
        return permissionScope(instanceId, context, url || context?.url)
    }

    function isCurrent(tabId, context) {
        const current = context?.current ? context.current() : getContext(tabId)
        return !!current && current.frame === context?.frame && current.url === context?.url &&
            (current.partition || 'persist:myapp') === (context?.partition || 'persist:myapp')
    }

    function decision(type, tabId, url, context = getContext(tabId), requestIds = []) {
        const descriptor = permissionDescriptor(type)
        const scope = scopeFor(tabId, url, context)
        if (state.status !== 'ready' || !descriptor || !scope) {
            return 'ask'
        }
        const id = permissionDocumentId(scope, descriptor)
        // A change-feed event may arrive before the save (including conflict cleanup) finishes.
        if (state.saving[id]) {
            return 'ask'
        }
        const temporary = transient.get(id)
        if (temporary?.lifetime === 'once') {
            if ((!temporary.deferred || requestIds.includes(temporary.requestId)) &&
                temporary.tabId === tabId && temporary.frame === context?.frame && temporary.url === context?.url && temporary.expires > Date.now()) {
                return 'allow'
            }
        } else if (temporary) {
            return temporary.decision
        }
        return rules[id]?.decision || 'ask'
    }

    function consume(types, tabId, url, context) {
        for (const type of types) {
            const scope = scopeFor(tabId, url, context)
            const id = permissionDocumentId(scope, permissionDescriptor(type))
            if (transient.get(id)?.lifetime === 'once') {
                transient.delete(id)
            }
        }
    }

    function finishGroup(group, granted, status = granted ? 'granted' : 'denied') {
        // Remove before invoking native callbacks, which can re-enter cancellation.
        groups.delete(group)
        clearTimeout(group.timer)
        for (const id of group.requestIds) {
            const resource = requests.get(id)?.resource
            if (!resource) {
                continue
            }
            const temporary = transient.get(resource.ruleId)
            if (temporary?.lifetime === 'once' && temporary.requestId === id) {
                transient.delete(resource.ruleId)
            }
            resource.status = status
            resource.unseen = false
            resource.needsReload = false
            if (rules[resource.ruleId]) {
                resource.lifetime = 'persistent'
            }
        }
        group.settle(granted)
    }

    function settleGroups() {
        for (const group of groups) {
            const valid = isCurrent(group.tabId, group.context)
            const decisions = group.types.map(type => {
                const scope = scopeFor(group.tabId, group.url, group.context)
                const temporary = scope && transient.get(permissionDocumentId(scope, permissionDescriptor(type)))
                if (temporary?.lifetime === 'once' && !group.requestIds.includes(temporary.requestId)) {
                    return 'ask'
                }
                return decision(type, group.tabId, group.url, group.context, group.requestIds)
            })
            if (!valid || decisions.includes('deny') || decisions.every(value => value === 'allow')) {
                const granted = valid && decisions.every(value => value === 'allow')
                if (granted) {
                    consume(group.types, group.tabId, group.url, group.context)
                }
                finishGroup(group, granted)
            }
        }
    }

    function request(tabId, input, suppliedContext) {
        const context = { ...(suppliedContext || getContext(tabId)) }
        if (!isCurrent(tabId, context)) {
            return { granted: false }
        }
        const scope = scopeFor(tabId, input.url, context)
        const types = input.types || [input.permission]
        const supported = !input.error && scope && types.length && types.every(type => permissionDescriptor(type))
        if (supported && types.every(type => decision(type, tabId, input.url, context) === 'allow')) {
            consume(types, tabId, input.url, context)
            return { granted: true }
        }
        if (supported && types.some(type => decision(type, tabId, input.url, context) === 'deny')) {
            return { granted: false }
        }
        let requestId
        const requestIds = []
        for (const type of supported ? types : [input.permission || 'unknown']) {
            if (supported && decision(type, tabId, input.url, context) === 'allow') {
                const temporary = transient.get(permissionDocumentId(scope, permissionDescriptor(type)))
                if (input.settle && temporary?.lifetime === 'once') {
                    temporary.deferred = true
                    requestIds.push(temporary.requestId)
                }
                continue
            }
            const registryType = permissionDescriptor(type) ? type : 'unsupported'
            if (!Object.hasOwn(permissions, registryType)) {
                permissions[registryType] = { name: registryType, icon: '', description: 'Unrecognized permission request' }
            }
            const descriptor = permissionDescriptor(type)
            const key = scope && descriptor ? permissionDocumentId(scope, descriptor) : 'unsupported'
            permissions[registryType].origins ??= {}
            const origins = permissions[registryType].origins
            origins[key] ??= { requests: [] }
            const entry = origins[key]
            const previous = !input.settle && entry.requests.find(item => item.type === type && item.status === 'requested' && item.tabId === tabId && item.url === input.url)
            if (previous) {
                requestId = previous.requestId
                requestIds.push(requestId)
                continue
            }
            entry.requests.push({
                requestId: crypto.randomUUID(), type, permission: descriptor, scope,
                url: input.url || context?.url || 'about:blank', tabId, status: 'requested', supported: !!supported,
                error: input.error || (!scope ? 'This origin cannot receive a remembered permission.' : !supported ? 'No permission handler is implemented.' : ''),
                timestamp: Date.now(), created: Date.now(), instanceId, windowId: getWindowId(), unseen: true,
                needsReload: !input.settle, explanation: input.explanation || '', requestType: 'foreground',
                ruleId: scope && descriptor ? key : null
            })
            const resource = entry.requests.at(-1)
            requests.set(resource.requestId, { resource, context })
            requestId = resource.requestId
            requestIds.push(requestId)
        }
        if (supported && input.settle) {
            const group = { tabId, types, url: input.url, context, settle: input.settle, requestIds }
            group.timer = setTimeout(() => {
                finishGroup(group, false, 'ignored')
                for (const id of requestIds) {
                    const resource = requests.get(id)?.resource
                    if (resource) {
                        resource.error = 'This request expired. Request access again.'
                    }
                }
            }, 60000)
            groups.add(group)
        }
        return { granted: false, pending: !!supported, requestId }
    }

    function save(scope, permission, value) {
        const id = permissionDocumentId(scope, permission)
        const previous = writes.get(id) || Promise.resolve()
        const task = previous.catch(() => {}).then(async () => {
            for (let attempt = 0; attempt < 5; attempt++) {
                let existing
                try {
                    existing = await db.get(id, { conflicts: true })
                } catch (error) {
                    if (error.status !== 404) {
                        throw error
                    }
                }
                if (value === null && !existing) {
                    transient.delete(id)
                    delete rules[id]
                    // A consumed one-time grant can still have an active native stream.
                    onRevoke(scope, permission)
                    return
                }
                const doc = value === null ? { _id: id, _rev: existing._rev, _deleted: true } : {
                    _id: id, ...(existing?._rev ? { _rev: existing._rev } : {}), type: 'permission', schemaVersion: 1,
                    ...scope, permission, decision: value, lifetime: 'persistent',
                    created: existing?.created || Date.now(), modified: Date.now(), sort: 0
                }
                try {
                    const result = await putDocument(doc)
                    if (existing?._conflicts?.length) {
                        const removed = await db.bulkDocs(existing._conflicts.map(rev => ({ _id: id, _rev: rev, _deleted: true })))
                        if (removed.some(item => item.error)) {
                            throw new Error('Could not resolve conflicting permission decisions.')
                        }
                    }
                    ingest({ ...doc, _rev: result.rev })
                    return
                } catch (error) {
                    if (error.status !== 409 || attempt === 4) {
                        throw error
                    }
                }
            }
        })
        writes.set(id, task)
        state.saving[id] = true
        task.finally(() => {
            if (writes.get(id) === task) {
                writes.delete(id)
                delete state.saving[id]
            }
        }).catch(() => {})
        return task
    }

    async function resolve(requestId, value, lifetime = 'persistent') {
        const pending = requests.get(requestId)
        const resource = pending?.resource
        if (!resource || pending.resolving || resource.status !== 'requested' || !['allow', 'deny', 'ignore'].includes(value) ||
            !['persistent', 'session', 'once'].includes(lifetime) || (value === 'allow' && (!resource.supported || state.status !== 'ready'))) {
            return false
        }
        if (value === 'allow' && !isCurrent(resource.tabId, pending.context)) {
            resource.error = 'The requesting page has changed. Request access again.'
            return false
        }
        if (value !== 'ignore' && resource.scope && resource.permission) {
            const id = permissionDocumentId(resource.scope, resource.permission)
            if (lifetime === 'persistent' || value === 'deny') {
                pending.resolving = true
                try {
                    await save(resource.scope, resource.permission, value)
                } finally {
                    pending.resolving = false
                }
                // Navigation, expiry or revocation can cancel the native request while saving.
                if (resource.status !== 'requested' || !isCurrent(resource.tabId, pending.context)) {
                    settleGroups()
                    return false
                }
            } else {
                transient.set(id, { ...resource.scope, permission: resource.permission, decision: value, lifetime, tabId: resource.tabId,
                    requestId, deferred: !resource.needsReload, frame: pending.context.frame, url: pending.context.url, expires: Date.now() + 60000 })
            }
        }
        resource.status = value === 'allow' ? 'granted' : value === 'deny' ? 'denied' : 'ignored'
        resource.lifetime = lifetime
        if (value !== 'allow') {
            resource.needsReload = false
        }
        resource.unseen = false
        resource.timestamp = Date.now()
        if (value === 'ignore') {
            for (const group of groups) {
                if (group.requestIds.includes(requestId)) {
                    finishGroup(group, false, 'ignored')
                }
            }
        }
        settleGroups()
        return true
    }

    async function setDecision(type, tabId, value, url) {
        const context = { ...getContext(tabId) }
        await ready
        const descriptor = permissionDescriptor(type)
        const scope = scopeFor(tabId, url, context)
        if (!isCurrent(tabId, context) || state.status !== 'ready' || !descriptor || !scope || (value !== null && !validDecision(descriptor, value))) {
            return false
        }
        await save(scope, descriptor, value)
        settleGroups()
        return true
    }

    async function reset(resource) {
        if (resource.scope && resource.permission && permissionType(resource.permission)) {
            for (const group of groups) {
                if (group.types.some(type => permissionDocumentId(scopeFor(group.tabId, group.url, group.context), permissionDescriptor(type)) === resource.ruleId)) {
                    finishGroup(group, false, 'ignored')
                }
            }
            await save(resource.scope, resource.permission, null)
            transient.delete(permissionDocumentId(resource.scope, resource.permission))
            for (const pending of requests.values()) {
                if (pending.resource.ruleId === resource.ruleId) {
                    pending.resource.status = 'ignored'
                    pending.resource.unseen = false
                }
            }
        }
        const current = getContext(resource.tabId)
        if (permissionOrigin(current?.url) === resource.scope?.topLevelOrigin && (current?.partition || 'persist:myapp') === resource.scope?.partition) {
            return request(resource.tabId, { permission: resource.type, url: resource.url })
        }
        return true
    }

    function cancelFrame(frame) {
        for (const group of groups) {
            if (group.context.frame === frame) {
                finishGroup(group, false, 'ignored')
            }
        }
        for (const [id, value] of transient) {
            if (value.lifetime === 'once' && value.frame === frame) {
                transient.delete(id)
            }
        }
        for (const { resource, context } of requests.values()) {
            if (context.frame === frame && resource.status === 'requested') {
                resource.status = 'ignored'
                resource.unseen = false
            }
        }
    }

    return { ready, ingest, request, resolve, decision, setDecision, cancelFrame, reset, prefix }
}

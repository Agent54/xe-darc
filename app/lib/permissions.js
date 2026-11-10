const nativeTypes = new Set(['geolocation', 'pointerLock', 'download', 'filesystem', 'fullscreen', 'hid', 'clipboardReadWrite', 'clipboardSanitizedWrite'])
const navigationTypes = new Set(['open-tab', 'navigate-off-origin'])
export const mcpPermissionTypes = new Set(['mcp-list-spaces', 'mcp-list-tabs', 'mcp-open-tab', 'mcp-read-tabs'])

export function permissionTargetKey(target) {
    return target ? [target.kind, target.spaceId || '', target.id || ''].map(encodeURIComponent).join(':') : ''
}

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
    if (nativeTypes.has(type) || navigationTypes.has(type) || mcpPermissionTypes.has(type)) {
        return { name: type }
    }
    return null
}

export function permissionType(descriptor) {
    if (descriptor?.name === 'media' && ['camera', 'microphone'].includes(descriptor.capability)) {
        return descriptor.capability
    }
    const canonical = permissionDescriptor(descriptor?.name)
    return canonical && canonical.name === descriptor?.name && !descriptor?.capability ? canonical.name : null
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
    return { instanceId, partition: context.partition || 'persist:myapp', topLevelOrigin, requestingOrigin,
        ...(context.subject ? { subject: context.subject, target: context.target } : {}) }
}

export function permissionDocumentId(scope, permission) {
    return 'darc:permission:' + [scope.instanceId, scope.partition, scope.topLevelOrigin, scope.requestingOrigin,
        permission.name, permission.capability || '', ...(scope.subject ? ['mcp', scope.subject.id, permissionTargetKey(scope.target)] : [])].map(encodeURIComponent).join(':')
}

export function normalizePermissionEvent(event, context) {
    const payload = event?.permissionRequest || event
    const controller = payload?.request
    const type = payload?.permission
    const url = type === 'download' ? context?.url : payload?.url || controller?.url || controller?.origin
    let types = [type]
    let error = null
    if (type === 'media') {
        const mediaTypes = payload.mediaTypes || controller?.mediaTypes
        if (Array.isArray(mediaTypes) && mediaTypes.length && mediaTypes.every(value => ['audio', 'video', 'camera', 'microphone'].includes(value))) {
            types = [...new Set(mediaTypes.map(value => ['audio', 'microphone'].includes(value) ? 'microphone' : 'camera'))]
        } else {
            types = []
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
    const result = data.permissionRequest(tabId, {
        permission: request.type, types: request.types, url: request.url,
        settle: deferred ? settle : null
    }, context)
    if (result.granted || !deferred || !result.pending) {
        settle(result.granted)
    }
}

export function createPermissionStore({ db, putDocument, permissions, rules, state, instanceId, getContext, getWindowId, onRevoke = () => {} }) {
    const prefix = `darc:permission:${encodeURIComponent(instanceId)}:`
    const seenByPermission = new Map()
    const permissionDocuments = new Map()
    let lastEventAt = 0
    const transient = new Map()
    const activeGrants = new Map()
    const requests = new Map()
    const groups = new Set()
    const writes = new Map()
    const changedDuringLoad = new Set()
    const conflictingRules = new Set()
    const revisions = new Map()

    function ingest(doc) {
        if (doc?.type === 'permission-seen') {
            return true
        }
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
        const validDocument = !doc._deleted && doc.type === 'permission' && doc.schemaVersion === 1 && doc.instanceId === instanceId &&
            permissionType(doc.permission) && doc.lifetime === 'persistent' &&
            !doc._conflicts?.length && permissionOrigin(doc.topLevelOrigin) === doc.topLevelOrigin &&
            permissionOrigin(doc.requestingOrigin) === doc.requestingOrigin && typeof doc.partition === 'string' &&
            (!mcpPermissionTypes.has(doc.permission.name) || (doc.subject?.kind === 'mcp' && typeof doc.subject.id === 'string' &&
                doc.partition === `mcp:${doc.subject.id}` && ['all', 'space', 'tabgroup', 'tab'].includes(doc.target?.kind))) &&
            permissionDocumentId(doc, doc.permission) === doc._id
        if (validDocument) {
            permissionDocuments.set(doc._id, doc)
        } else {
            permissionDocuments.delete(doc._id)
        }
        const oldRule = rules[doc._id]
        if (validDocument && Number.isFinite(doc.seenAt) && doc.seenAt > (seenByPermission.get(doc._id) || 0)) {
            seenByPermission.set(doc._id, doc.seenAt)
            for (const { resource } of requests.values()) {
                if (resource.ruleId === doc._id && resource.created <= doc.seenAt) {
                    resource.unseen = false
                }
            }
        }
        // Seen-only revisions must not revoke or replace temporary grants.
        if (validDocument && doc.decision === null && !oldRule) {
            return true
        }
        if (validDocument && oldRule && oldRule.decision === doc.decision && oldRule.modified === doc.modified) {
            rules[doc._id] = doc
            return true
        }
        const previous = transient.get(doc._id) || oldRule || activeGrants.get(doc._id)
        delete rules[doc._id]
        if (validDocument && validDecision(doc.permission, doc.decision)) {
            rules[doc._id] = doc
        }
        transient.delete(doc._id)
        if (previous?.decision === 'allow' && rules[doc._id]?.decision !== 'allow') {
            activeGrants.delete(doc._id)
            onRevoke(previous, previous.permission)
        }
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

    function eventTime() {
        lastEventAt = Math.max(performance.timeOrigin + performance.now(), lastEventAt + 0.001)
        return lastEventAt
    }

    async function markSeen(selected) {
        const seenAt = eventTime()
        const resources = selected
            ? [requests.get(selected.requestId)?.resource || selected]
            : Array.from(requests.values(), ({ resource }) => resource).filter(resource => resource.unseen && resource.created <= seenAt)
        const byPermission = new Map()
        for (const resource of resources) {
            if (resource.ruleId && resource.scope && resource.permission) {
                byPermission.set(resource.ruleId, resource)
            } else {
                resource.unseen = false
            }
        }
        if (!selected) {
            if (state.status === 'loading') {
                await ready
            }
            for (const [id, doc] of permissionDocuments) {
                if (!byPermission.has(id) && doc.created <= seenAt) {
                    byPermission.set(id, { scope: doc, permission: doc.permission })
                }
            }
        }
        const results = await Promise.allSettled([...byPermission.values()].map(resource => save(resource.scope, resource.permission, undefined, { seenAt })))
        const failed = results.some(result => result.status === 'rejected')
        state.seenError = failed ? 'Could not save when permissions were seen. Try again.' : null
        return !failed
    }

    function scopeFor(tabId, url, context = getContext(tabId)) {
        return permissionScope(instanceId, context, url || context?.url)
    }

    function decisionRecord(type, tabId, url, context = getContext(tabId), requestIds) {
        const descriptor = permissionDescriptor(type)
        if (state.status !== 'ready' || !descriptor) {
            return null
        }
        const contexts = context?.subject ? [context, ...(context.parents || []).map(target => ({ ...context, target }))] : [context]
        for (const candidate of contexts) {
            const scope = scopeFor(tabId, url, candidate)
            if (!scope) { continue }
            const id = permissionDocumentId(scope, descriptor)
            const temporary = transient.get(id)
            if (temporary?.lifetime === 'once') {
                if ((!requestIds || requestIds.includes(temporary.requestId)) && temporary.tabId === tabId && temporary.frame === context?.frame && temporary.url === context?.url && temporary.expires > Date.now()) {
                    return { id, scope, permission: descriptor, decision: 'allow' }
                }
            } else if (temporary || rules[id]) {
                return { id, scope, permission: descriptor, decision: (temporary || rules[id]).decision }
            }
        }
        return null
    }

    function decision(type, tabId, url, context = getContext(tabId)) {
        return decisionRecord(type, tabId, url, context)?.decision || 'ask'
    }

    function consume(decisions, context) {
        for (const { id, scope, permission } of decisions) {
            // Consuming an approval does not stop access already granted to a live page.
            if (context?.frame && !navigationTypes.has(permission.name)) {
                const active = activeGrants.get(id) || { ...scope, permission, decision: 'allow', frames: new Set() }
                active.frames.add(context.frame)
                activeGrants.set(id, active)
            }
            if (transient.get(id)?.lifetime === 'once') {
                transient.delete(id)
            }
        }
    }

    function settleGroups() {
        for (const group of groups) {
            const current = group.context.current ? group.context.current() : getContext(group.tabId)
            const valid = current?.frame === group.context.frame && current?.url === group.context.url &&
                (current?.partition || 'persist:myapp') === (group.context.partition || 'persist:myapp')
            const decisions = group.types.map(type => decisionRecord(type, group.tabId, group.url, group.context, group.requestIds))
            const granted = valid && decisions.every(record => record?.decision === 'allow')
            if (!valid || decisions.some(record => record?.decision === 'deny') || granted) {
                if (granted) {
                    consume(decisions, group.context)
                }
                group.settle(granted)
                for (const id of group.requestIds) {
                    const resource = requests.get(id)?.resource
                    if (resource?.status === 'requested') {
                        resource.status = granted ? 'granted' : 'denied'
                        resource.unseen = false
                        resource.needsReload = false
                        if (rules[resource.ruleId]) {
                            resource.lifetime = 'persistent'
                        }
                    }
                }
                clearTimeout(group.timer)
                groups.delete(group)
            }
        }
    }

    function request(tabId, input, suppliedContext) {
        const context = { ...(suppliedContext || getContext(tabId)) }
        const scope = scopeFor(tabId, input.url, context)
        const types = input.types || [input.permission]
        const supported = !input.error && scope && types.length && types.every(type => permissionDescriptor(type) &&
            (!mcpPermissionTypes.has(type) || (context.subject?.kind === 'mcp' && context.partition === `mcp:${context.subject.id}` && context.target)))
        const decisions = supported ? types.map(type => decisionRecord(type, tabId, input.url, context)) : []
        if (supported && decisions.every(record => record?.decision === 'allow')) {
            consume(decisions, context)
            return { granted: true }
        }
        if (decisions.some(record => record?.decision === 'deny')) {
            return { granted: false }
        }
        let requestId
        const requestIds = []
        const pendingTypes = supported ? types.filter((_, index) => decisions[index]?.decision !== 'allow') : [input.permission || 'unknown']
        for (const type of pendingTypes) {
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
                timestamp: Date.now(), created: eventTime(), instanceId, windowId: getWindowId(), unseen: true,
                needsReload: !input.settle, explanation: input.explanation || '', requestType: 'foreground',
                ruleId: scope && descriptor ? key : null,
                ...(context.subject ? { subject: context.subject, target: context.target,
                    permissionTargets: input.permissionTargets || [], requester: context.subject.title,
                    agent: input.agent } : {})
            })
            const resource = entry.requests.at(-1)
            requests.set(resource.requestId, { resource, context })
            if (resource.ruleId && !permissionDocuments.has(resource.ruleId) && !writes.has(resource.ruleId)) {
                void save(scope, descriptor, undefined, { created: resource.created }).catch(() => {
                    state.seenError = 'Could not register the permission request for other windows.'
                })
            }
            requestId = resource.requestId
            requestIds.push(requestId)
        }
        if (supported && input.settle) {
            const group = { tabId, types, url: input.url, context, settle: input.settle, requestIds }
            group.timer = setTimeout(() => {
                input.settle(false)
                for (const id of requestIds) {
                    const resource = requests.get(id)?.resource
                    if (resource?.status === 'requested') {
                        resource.status = 'ignored'
                        resource.unseen = false
                        resource.error = 'This request expired. Request access again.'
                    }
                }
                groups.delete(group)
            }, 60000)
            groups.add(group)
        }
        return { granted: false, pending: !!supported, requestId }
    }

    function save(scope, permission, value, { seenAt, created = Date.now() } = {}) {
        const id = permissionDocumentId(scope, permission)
        const seenOnly = value === undefined
        const previous = writes.get(id) || Promise.resolve()
        const task = previous.catch(() => {}).then(async () => {
            for (let attempt = 0; attempt < 5; attempt++) {
                let existing = permissionDocuments.get(id)
                if (!seenOnly || attempt > 0) {
                    try {
                        existing = await db.get(id, { conflicts: true })
                    } catch (error) {
                        if (error.status !== 404) {
                            throw error
                        }
                        existing = undefined
                    }
                }
                if (value === null && !existing) {
                    const previous = transient.get(id) || rules[id] || activeGrants.get(id)
                    transient.delete(id)
                    activeGrants.delete(id)
                    delete rules[id]
                    if (previous?.decision === 'allow') {
                        onRevoke(previous, permission)
                    }
                    return
                }
                if (seenOnly && seenAt === undefined && existing) {
                    ingest(existing)
                    return
                }
                if (seenOnly && scope._id === id && !existing) {
                    return
                }
                if (seenOnly && (attempt === 0 ? conflictingRules.has(id) : existing?._conflicts?.length)) {
                    throw new Error('Cannot mark a conflicting permission document seen.')
                }
                if (seenOnly && existing?.seenAt >= seenAt) {
                    ingest(existing)
                    return
                }
                const doc = value === null ? { _id: id, _rev: existing._rev, _deleted: true } : {
                    ...scope,
                    _id: id, ...(existing?._rev ? { _rev: existing._rev } : {}), type: 'permission', schemaVersion: 1,
                    permission, decision: value ?? null, lifetime: 'persistent',
                    created: existing?.created ?? created, modified: Date.now(), seenAt: existing?.seenAt ?? null, sort: 0
                }
                const update = seenOnly && seenAt !== undefined ? { ...(existing || doc), seenAt } : doc
                try {
                    const result = await putDocument(update)
                    if (existing?._conflicts?.length) {
                        const removed = await db.bulkDocs(existing._conflicts.map(rev => ({ _id: id, _rev: rev, _deleted: true })))
                        if (removed.some(item => item.error)) {
                            throw new Error('Could not resolve conflicting permission decisions.')
                        }
                    }
                    ingest({ ...update, _rev: result.rev })
                    return
                } catch (error) {
                    if (error.status !== 409 || attempt === 4) {
                        throw error
                    }
                }
            }
        })
        writes.set(id, task)
        task.finally(() => { if (writes.get(id) === task) { writes.delete(id) } }).catch(() => {})
        return task
    }

    async function resolve(requestId, value, lifetime = 'persistent', targetKey) {
        const pending = requests.get(requestId)
        const resource = pending?.resource
        if (!resource || resource.status !== 'requested' || !['allow', 'deny', 'ignore'].includes(value) ||
            !['persistent', 'session', 'once'].includes(lifetime) || (value === 'allow' && (!resource.supported || state.status !== 'ready'))) {
            return false
        }
        const current = pending.context.current ? pending.context.current() : getContext(resource.tabId)
        if (value === 'allow' && (current?.frame !== pending.context.frame || current?.url !== pending.context.url ||
            (current?.partition || 'persist:myapp') !== (pending.context.partition || 'persist:myapp'))) {
            resource.error = 'The requesting page has changed. Request access again.'
            return false
        }
        if (targetKey && permissionTargetKey(resource.scope?.target) !== targetKey) {
            const option = resource.permissionTargets?.find(option => permissionTargetKey(option.target) === targetKey)
            if (!option) { return false }
            resource.scope = { ...resource.scope, target: option.target }
            resource.target = option.target
            resource.ruleId = permissionDocumentId(resource.scope, resource.permission)
        }
        if (value !== 'ignore' && resource.scope && resource.permission) {
            const id = permissionDocumentId(resource.scope, resource.permission)
            if (lifetime === 'persistent' || value === 'deny') {
                await save(resource.scope, resource.permission, value)
            } else {
                transient.set(id, { ...resource.scope, permission: resource.permission, decision: value, lifetime, tabId: resource.tabId,
                    requestId, frame: pending.context.frame, url: pending.context.url, expires: Date.now() + 60000 })
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
                    group.settle(false)
                    clearTimeout(group.timer)
                    groups.delete(group)
                }
            }
        }
        settleGroups()
        return true
    }

    async function setDecision(type, tabId, value, url) {
        await ready
        const descriptor = permissionDescriptor(type)
        const scope = scopeFor(tabId, url)
        if (state.status !== 'ready' || !descriptor || !scope || (value !== null && !validDecision(descriptor, value))) {
            return false
        }
        await save(scope, descriptor, value)
        settleGroups()
        return true
    }

    async function reset(resource) {
        if (resource.scope && resource.permission && permissionType(resource.permission)) {
            await save(resource.scope, resource.permission, null)
            transient.delete(permissionDocumentId(resource.scope, resource.permission))
            for (const pending of requests.values()) {
                if (pending.resource.ruleId === resource.ruleId) {
                    pending.resource.status = 'ignored'
                    pending.resource.unseen = false
                }
            }
        }
        if (resource.scope?.subject) { return true }
        const current = getContext(resource.tabId)
        if (permissionOrigin(current?.url) === resource.scope?.topLevelOrigin && (current?.partition || 'persist:myapp') === resource.scope?.partition) {
            return request(resource.tabId, { permission: resource.type, url: resource.url })
        }
        return true
    }

    function cancelFrame(frame) {
        for (const [id, grant] of activeGrants) {
            grant.frames.delete(frame)
            if (!grant.frames.size) {
                activeGrants.delete(id)
            }
        }
        for (const group of groups) {
            if (group.context.frame === frame) {
                group.settle(false)
                clearTimeout(group.timer)
                groups.delete(group)
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

    function cancelRequest(requestId) {
        for (const group of groups) {
            if (group.requestIds.includes(requestId)) {
                group.settle(false)
                clearTimeout(group.timer)
                groups.delete(group)
                for (const id of group.requestIds) {
                    const resource = requests.get(id)?.resource
                    if (resource?.status === 'requested') {
                        resource.status = 'ignored'
                        resource.unseen = false
                    }
                }
            }
        }
    }

    async function removeSubject(subjectId) {
        for (const { resource } of requests.values()) {
            if (resource.scope?.subject?.id === subjectId) { cancelRequest(resource.requestId) }
        }
        for (const [id, rule] of transient) {
            if (rule.subject?.id === subjectId) { transient.delete(id) }
        }
        await ready
        for (const rule of Object.values(rules)) {
            if (rule.subject?.id === subjectId) { await save(rule, rule.permission, null) }
        }
    }

    return { ready, ingest, request, resolve, decision, setDecision, cancelFrame, cancelRequest, removeSubject, reset, markSeen, prefix }
}

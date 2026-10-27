import PouchDB from 'pouchdb-browser'
import findPlugin from 'pouchdb-find'
import bootstrap from './bootstrap.js'
import testData from './test-data.js'
import { throttle, origin } from './lib/utils.js'
import { tick } from 'svelte'
import { getTabGroups, getSidebarItems, getTabGroup, getPinScope, getSidepins, nextPinOrder, tabGroupMetadataId, planTabMove, groupCanvasPosition, orderBetween } from './lib/tab-groups.js'
// TODO: add user and session management
// import indexeddb from 'pouchdb-adapter-indexeddb'
// PouchDB.plugin(indexeddb)
import permissionTypes from './lib/resourceTypes.js'

import { colors as projectColors } from './lib/utils.js'

function parseWindowId(value) {
    if (typeof value !== 'string') {
        return null
    }

    const parsed = value.trim()
    return parsed || null
}

if (!window.darcWindowIdPromise || typeof window.resolveDarcWindowId !== 'function') {
    let resolveWindowIdPromise
    let windowIdPromiseResolved = false

    window.darcWindowIdPromise = new Promise(resolve => {
        resolveWindowIdPromise = resolve
    })

    window.resolveDarcWindowId = (nextWindowId) => {
        const parsedWindowId = parseWindowId(nextWindowId)
        if (!parsedWindowId) {
            return window.darcWindowId || null
        }

        const previousWindowId = window.darcWindowId || null

        if (previousWindowId && previousWindowId !== parsedWindowId) {
            throw new Error('darcWindowId is immutable and cannot be reassigned')
        }

        window.darcWindowId = parsedWindowId

        if (!windowIdPromiseResolved) {
            windowIdPromiseResolved = true
            resolveWindowIdPromise(parsedWindowId)
        }

        return parsedWindowId
    }
}

window.darcWindowId = parseWindowId(window.darcWindowId)

if (window.darcWindowId) {
    window.resolveDarcWindowId(window.darcWindowId)
}

if (typeof window.waitForDarcWindowId !== 'function') {
    window.waitForDarcWindowId = () => window.darcWindowIdPromise
}

function getActiveSpaceStorageKey(windowId = window.darcWindowId) {
    const parsedWindowId = parseWindowId(windowId)
    if (!parsedWindowId) return null

    return `activeSpaceId:${parsedWindowId}`
}

function persistActiveSpaceForWindow(spaceId, windowId = window.darcWindowId) {
    if (!spaceId) {
        return
    }

    const parsedWindowId = parseWindowId(windowId)
    if (!parsedWindowId) {
        window.darcWindowIdPromise.then(resolvedWindowId => {
            if (spaceMeta.activeSpace === spaceId) {
                persistActiveSpaceForWindow(spaceId, resolvedWindowId)
            }
        }).catch(error => {
            console.error('Failed to persist active space for window', error)
        })
        return
    }

    const storageKey = getActiveSpaceStorageKey(parsedWindowId)
    if (!storageKey) {
        return
    }

    if (localStorage.getItem(storageKey) !== spaceId) {
        localStorage.setItem(storageKey, spaceId)
    }
}

function getTabActiveHistoryStorageKey(spaceId, windowId = window.darcWindowId) {
    const parsedWindowId = parseWindowId(windowId)
    if (!parsedWindowId || !spaceId) {
        return null
    }

    return `tabActiveHistory:${parsedWindowId}:${spaceId}`
}

function getTabIdFromActiveHistoryEntry(entry) {
    if (typeof entry === 'string') {
        return entry.trim() || null
    }

    if (typeof entry?.id !== 'string') {
        return null
    }

    const tabId = entry.id.trim()
    return tabId || null
}

function getActivatedAtFromActiveHistoryEntry(entry) {
    if (typeof entry?.activatedAt === 'number' && Number.isFinite(entry.activatedAt) && entry.activatedAt > 0) {
        return entry.activatedAt
    }

    // Backward compatibility for already persisted shape.
    if (typeof entry?.lastActiveAt === 'number' && Number.isFinite(entry.lastActiveAt) && entry.lastActiveAt > 0) {
        return entry.lastActiveAt
    }

    return 0
}

function normalizeActiveHistoryEntries(rawEntries = []) {
    if (!Array.isArray(rawEntries)) {
        return []
    }

    const entries = []
    for (const entry of rawEntries) {
        const tabId = getTabIdFromActiveHistoryEntry(entry)
        if (!tabId) {
            continue
        }

        entries.push({
            id: tabId,
            activatedAt: getActivatedAtFromActiveHistoryEntry(entry)
        })
    }

    return entries
}

function getSpaceActiveHistoryEntries(spaceId = spaceMeta.activeSpace) {
    const space = spaces[spaceId]
    if (!space) {
        return []
    }

    // Read-only helper: never mutate state here because this can be called from $derived/template paths.
    return normalizeActiveHistoryEntries(space.activeTabsOrder)
}

function getTabGroupHistory(spaceId) {
    return [
        spaceId === spaceMeta.activeSpace ? spaceMeta.activeTabId : null,
        ...getSpaceActiveHistoryEntries(spaceId).map(getTabIdFromActiveHistoryEntry)
    ]
}

function readTabActiveHistoryEntries(spaceId, windowId = window.darcWindowId) {
    const storageKey = getTabActiveHistoryStorageKey(spaceId, windowId)
    if (!storageKey) {
        return []
    }

    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]')
        return normalizeActiveHistoryEntries(parsed)
    } catch {
        return []
    }
}

function writeTabActiveHistoryEntries(spaceId, windowId = window.darcWindowId) {
    const storageKey = getTabActiveHistoryStorageKey(spaceId, windowId)
    if (!storageKey) {
        return
    }

    const activeHistory = getSpaceActiveHistoryEntries(spaceId)
    const trimmed = activeHistory.length > 100 ? activeHistory.slice(0, 100) : activeHistory
    const entries = []
    for (const entry of trimmed) {
        const tabId = getTabIdFromActiveHistoryEntry(entry)
        if (!tabId) {
            continue
        }

        entries.push({
            id: tabId,
            activatedAt: getActivatedAtFromActiveHistoryEntry(entry)
        })
    }

    const serializedEntries = JSON.stringify(entries)
    if (localStorage.getItem(storageKey) !== serializedEntries) {
        localStorage.setItem(storageKey, serializedEntries)
    }
}

function persistTabActiveHistoryForSpace(spaceId) {
    if (!spaceId) {
        return
    }

    window.darcWindowIdPromise
        .then(windowId => {
            writeTabActiveHistoryEntries(spaceId, windowId)
        })
        .catch(error => {
            console.error('Failed to persist tab active history for window', error)
        })
}

function markTabActive(spaceId, tabId, activatedAt = Date.now(), recordIfAlreadyCurrent = false) {
    const space = spaces[spaceId]
    if (!space || !tabId) {
        return
    }

    const activeHistory = getSpaceActiveHistoryEntries(spaceId)
    const currentTabId = getTabIdFromActiveHistoryEntry(activeHistory[0])
    const currentActivatedAt = getActivatedAtFromActiveHistoryEntry(activeHistory[0])

    if (currentTabId !== tabId) {
        // Keep repeated visits in history; only suppress adjacent duplicates.
        space.activeTabsOrder = [{ id: tabId, activatedAt }, ...activeHistory]
        persistTabActiveHistoryForSpace(spaceId)
        return
    }

    // Upgrade legacy/blank timestamps on the active entry to keep UI labels stable.
    if (recordIfAlreadyCurrent || !currentActivatedAt) {
        space.activeTabsOrder = [
            { id: tabId, activatedAt: currentActivatedAt || activatedAt },
            ...activeHistory.slice(1)
        ]
        persistTabActiveHistoryForSpace(spaceId)
    }
}

window.darcInstanceId = localStorage.getItem('darcInstanceId')
if (!window.darcInstanceId) {
    window.darcInstanceId = crypto.randomUUID()
    localStorage.setItem('darcInstanceId', window.darcInstanceId)
}

let permissions = $state(permissionTypes)

PouchDB.plugin(findPlugin)
const db = new PouchDB('darc', { adapter: 'idb' })

const sortOrder = ['archive', 'spaceId', 'type', 'order']

const docs = $state({})
const origins = $state({})
const spaces = $state({
    'darc:space_inbox': {
        _id: 'darc:space_inbox',
        type: 'space',
        name: 'Inbox',
        title: 'Inbox',
        color: projectColors[3].color,
        tabs: [],
        order: Date.now() + 999999999,
        created: Date.now(),
        modified: Date.now(),
        glyph: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox"><path d="M22 12h-6l-2 2H8l-2-2H2"></path><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>'
    }
})
const activity = $state({})
const resources = $state({})
const frames = $state({})
let lastForceHibernateTime = 0
const previews = $state({})
const settings = $state({})
const ui = $state({ viewMode: 'default', tabActivation: null })
const desiredCanvasShapes = new Map()
const canvasShapeSaveTasks = new Map()
const canvasShapeStates = new Map()
const desiredDocumentUpdates = new Map()
const documentUpdateSaveTasks = new Map()
const tabCreationTasks = new Map()

function getCanvasShapeState(element, canvasOrder, files = {}) {
    return {
        version: element?.version,
        versionNonce: element?.versionNonce,
        index: element?.index,
        canvasOrder,
        fileDataURL: element?.fileId ? files[element.fileId]?.dataURL : null
    }
}

function rememberCanvasShapeState(shape) {
    if (shape?.type !== 'shape' || !shape.element) return
    canvasShapeStates.set(shape.id, getCanvasShapeState(shape.element, shape.canvasOrder, shape.files))
}

function canvasShapeStateMatches(first, second) {
    return first?.version === second?.version &&
        first?.versionNonce === second?.versionNonce &&
        first?.index === second?.index &&
        first?.canvasOrder === second?.canvasOrder &&
        first?.fileDataURL === second?.fileDataURL
}

function compareCanvasShapes(first, second) {
    if (!second) return 1

    const firstVersion = first?.element?.version || 0
    const secondVersion = second?.element?.version || 0
    if (firstVersion !== secondVersion) {
        return firstVersion - secondVersion
    }

    const firstNonce = first?.element?.versionNonce ?? Number.MAX_SAFE_INTEGER
    const secondNonce = second?.element?.versionNonce ?? Number.MAX_SAFE_INTEGER
    if (firstNonce !== secondNonce) {
        return secondNonce - firstNonce
    }

    const firstUpdated = first?.element?.updated || 0
    const secondUpdated = second?.element?.updated || 0
    if (firstUpdated !== secondUpdated) {
        return firstUpdated - secondUpdated
    }

    return (first?.modified || 0) - (second?.modified || 0)
}

function applyCanvasShape(shape) {
    if (shape?.type !== 'shape') return

    rememberCanvasShapeState(shape)
    docs[shape.id] = shape

    const space = spaces[shape.spaceId]
    if (!space) return

    const shapeIndex = space.tabs?.findIndex(item => item.id === shape.id) ?? -1
    if (shapeIndex === -1) {
        space.tabs = [...(space.tabs || []), shape].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    } else {
        space.tabs[shapeIndex] = shape
    }
}

async function persistCanvasShape(shapeId) {
    while (desiredCanvasShapes.has(shapeId)) {
        const shape = desiredCanvasShapes.get(shapeId)
        if (shape?.type !== 'shape') {
            desiredCanvasShapes.delete(shapeId)
            return
        }

        let currentShape = null

        try {
            currentShape = await db.get(shapeId)
        } catch (error) {
            if (error.status !== 404) {
                throw error
            }
        }

        if (currentShape && currentShape.type !== 'shape') {
            desiredCanvasShapes.delete(shapeId)
            return
        }

        if (currentShape && compareCanvasShapes(shape, currentShape) < 0) {
            if (desiredCanvasShapes.get(shapeId) === shape) {
                desiredCanvasShapes.delete(shapeId)
            }
            applyCanvasShape(currentShape)
            continue
        }

        try {
            const result = await db.put({
                ...shape,
                ...(currentShape?._rev ? { _rev: currentShape._rev } : {})
            })

            if (docs[shapeId]?.type === 'shape') {
                docs[shapeId]._rev = result.rev
            }

            if (desiredCanvasShapes.get(shapeId) === shape) {
                desiredCanvasShapes.delete(shapeId)
            }
        } catch (error) {
            if (error.status !== 409) {
                throw error
            }
        }
    }
}

function queueCanvasShapeSave(shape) {
    if (shape?.type !== 'shape') return

    const desiredShape = desiredCanvasShapes.get(shape.id)
    if (!desiredShape || compareCanvasShapes(shape, desiredShape) >= 0) {
        desiredCanvasShapes.set(shape.id, shape)
    }

    if (canvasShapeSaveTasks.has(shape.id)) return

    const saveTask = persistCanvasShape(shape.id)
        .catch(error => console.error('Failed to save canvas shape', error))
        .finally(() => {
            canvasShapeSaveTasks.delete(shape.id)
            if (desiredCanvasShapes.has(shape.id)) {
                queueCanvasShapeSave(desiredCanvasShapes.get(shape.id))
            }
        })

    canvasShapeSaveTasks.set(shape.id, saveTask)
}

function syncTabPreview(tab, previousOpener = tab.opener) {
    tab.id ??= tab._id
    for (const opener of new Set([previousOpener, tab.opener].filter(Boolean))) {
        const visible = tab.opener === opener && !tab._deleted && (!tab.archive || tab.archive === 'preview') && (tab.preview || tab.lightbox)
        if (!visible && !previews[opener]) {
            continue
        }
        previews[opener] ??= { lightbox: null, tabs: [] }
        const preview = previews[opener]
        const index = preview.tabs.findIndex(item => item.id === tab.id)
        if (visible) {
            if (index === -1) {
                preview.tabs.push(tab)
            } else {
                preview.tabs[index] = tab
            }
        } else if (index !== -1) {
            preview.tabs.splice(index, 1)
        }
        if (visible && tab.lightbox) {
            preview.lightbox = tab.id
        } else if (preview.lightbox === tab.id) {
            preview.lightbox = null
        }
    }
}

function applyDocumentUpdate(tabId, update) {
    const tab = docs[tabId]
    if (!['tab', 'tabgroup'].includes(tab?.type)) return false

    const previousOpener = tab.opener
    Object.assign(tab, update)
    if (tab.type === 'tabgroup') {
        return true
    }

    const spaceTab = spaces[tab.spaceId]?.tabs?.find(item => item.id === tabId)
    if (spaceTab && spaceTab !== tab && spaceTab.type === 'tab') {
        Object.assign(spaceTab, update)
    }

    if (['opener', 'preview', 'lightbox', 'archive', '_deleted'].some(key => Object.hasOwn(update, key))) {
        syncTabPreview(tab, previousOpener)
    }

    return true
}

async function persistDocumentUpdate(tabId) {
    await tabCreationTasks.get(tabId)
    while (desiredDocumentUpdates.has(tabId)) {
        const update = desiredDocumentUpdates.get(tabId)
        let currentTab

        try {
            currentTab = await db.get(tabId)
        } catch (error) {
            if (error.status === 404) {
                if (docs[tabId]?.type === 'tabgroup') {
                    currentTab = { ...docs[tabId], _rev: undefined }
                } else {
                    desiredDocumentUpdates.delete(tabId)
                    return
                }
            } else {
                throw error
            }
        }

        if (!['tab', 'tabgroup'].includes(currentTab.type)) {
            desiredDocumentUpdates.delete(tabId)
            return
        }

        try {
            const result = await db.put({
                ...currentTab,
                ...update,
                _rev: currentTab._rev
            })

            applyDocumentUpdate(tabId, { _rev: result.rev })

            if (desiredDocumentUpdates.get(tabId) === update) {
                desiredDocumentUpdates.delete(tabId)
            }
        } catch (error) {
            if (error.status !== 409) {
                throw error
            }
        }
    }
}

function queueDocumentUpdate(tabId, update) {
    if (!['tab', 'tabgroup'].includes(docs[tabId]?.type)) return Promise.resolve()

    const desiredUpdate = {
        ...(desiredDocumentUpdates.get(tabId) || {}),
        ...update
    }
    desiredDocumentUpdates.set(tabId, desiredUpdate)
    applyDocumentUpdate(tabId, update)

    if (documentUpdateSaveTasks.has(tabId)) {
        return documentUpdateSaveTasks.get(tabId)
    }

    const saveTask = persistDocumentUpdate(tabId)
        .catch(error => console.error('Failed to save document update', error))
        .finally(() => {
            documentUpdateSaveTasks.delete(tabId)
            if (desiredDocumentUpdates.has(tabId)) {
                queueDocumentUpdate(tabId, {})
            }
        })

    documentUpdateSaveTasks.set(tabId, saveTask)
    return saveTask
}

// LED indicator states for all frames - using timestamps to avoid events
const ledIndicators = $state({
    networkAccess: 0,
    blockedRequest: 0,
    mockedActivation: 0,
    permissionRequest: 0
})

const dividerCreationTasks = new Map()

function createDivider(spaceId) {
    const space = spaces[spaceId]
    if (!space || space.tabs?.[0]?.type === 'divider') return null

    space.tabs ??= []
    const firstItem = space.tabs[0]
    const _id = `darc:divider_${crypto.randomUUID()}`
    const divider = {
        _id,
        id: _id,
        type: 'divider',
        spaceId,
        order: firstItem ? (firstItem.order ?? Date.now()) - 1 : Date.now(),
        created: Date.now()
    }

    space.tabs.push(divider)
    space.tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    docs[_id] = divider

    const creation = db.put({ ...divider }).then(result => {
        divider._rev = result.rev
    }).catch(error => console.error('Failed to create divider:', error))
    dividerCreationTasks.set(_id, creation)
    creation.then(() => dividerCreationTasks.delete(_id))

    return divider
}

db.bulkDocs(bootstrap).then(async (res) => {
    db.createIndex({
        index: { fields: sortOrder }
    }).then(() => {
        refresh()
    })

    const docsToUpdate = []
    for (const doc of res) {
        if (doc.error && doc.error === 'conflict') {
            // Find the corresponding bootstrap document
            const bootstrapDoc = bootstrap.find(bdoc => bdoc._id === doc.id)
            if (bootstrapDoc) {
                try {
                    // Get the existing document from the database
                    const existingDoc = await db.get(doc.id)
                    
                    // Update the existing document with bootstrap data, keeping the _rev
                    const updatedDoc = {
                        ...bootstrapDoc,
                        _rev: existingDoc._rev
                    }
                    
                    docsToUpdate.push(updatedDoc)
                } catch (error) {
                    console.error('Failed to get existing doc for update:', doc.id, error)
                }
            }
        }
    }
    
    // Update all conflicting documents
    if (docsToUpdate.length > 0) {
        try {
            const updateRes = await db.bulkDocs(docsToUpdate)
            console.log('Updated bootstrap docs:', updateRes)
        } catch (error) {
            console.error('Failed to update bootstrap docs:', error)
        }
    }
})

const remote = localStorage.getItem('syncServerUrl')
const token = localStorage.getItem('syncServerToken')
if (remote) {
    const [username, password] = token.split(":")
    const replication = db.sync(remote, {
        live: true,
        retry: true,
        attachments: true,
        auth: {
            username,
            password
        }
    })
}

const spaceMeta = $state({
    activeSpace: 'darc:space_default',
    activeSpacesOrder: [], // Track order of active spaces for previous space switching
    spaceOrder: [],
    closedTabs: [],
    activeTabId: null,
    globalPins: [],
    config: {
        leftPinnedTabWidth: 400,
        rightPinnedTabWidth: 350,
        leftSidebarWidth: 320,
        rightSidebarWidth: 340,
        showLinkPreviews: true
    }
})

function loadActiveSpaceForWindow(windowId) {
    const parsedWindowId = parseWindowId(windowId)
    if (!parsedWindowId) {
        return
    }

    const scopedStorageKey = getActiveSpaceStorageKey(parsedWindowId)
    if (!scopedStorageKey) {
        return
    }

    const storedActiveSpace = localStorage.getItem(scopedStorageKey) || null

    if (storedActiveSpace && spaceMeta.activeSpace !== storedActiveSpace) {
        spaceMeta.activeSpace = storedActiveSpace
    }
}

window.darcWindowIdPromise
    .then(windowId => {
        loadActiveSpaceForWindow(windowId)
    })
    .catch(error => {
        console.error('Failed to load active space for window', error)
    })

// Cleanup frame instances
setInterval(() => {
    Object.entries(frames).sort((a, b) => b[1].active - a[1].active).forEach(([id, frameData], i) => {
        if (!frameData.frame || docs[id]?.pinned || spaceMeta.activeTabId === id) {
            return
        }

        if (frameData.active && ((Date.now() - frameData.active) > 172800000)) {
            console.log('hibernating > 2 days', frameData)
            hibernate(id)
        } else if (i > 40) {
            console.log('hibernating > 40', frameData)
            hibernate(id)
        }
    })
}, 900000)

let initialLoad = true
// TODO: disable leading ?
const refresh = throttle(async function (spaceId) {
    const resolvedWindowId = await window.darcWindowIdPromise.catch(() => null)
    if (resolvedWindowId) {
        loadActiveSpaceForWindow(resolvedWindowId)
    }

    // A change-feed refresh can run before bootstrap finishes. Restore from a complete session.
    if (initialLoad) {
        spaceId = undefined
    }

    // db.viewCleanup().then(function (result) {
    //    console.log('viewCleanup', result)
    //   }).catch(function (err) {
    //     console.log(err)
    //   })

    // const explain = await db.explain({
    //     selector: {
    //         archive: { $lt: 'deleted' },
    //         spaceId: spaceId ? spaceId : { $exists: true },
    //     },
    //     fields: initialLoad ? undefined : ['_id'],
    //     sort: sortOrder.map(key => ({ [key] : 'asc' })),
    //     limit: 4000
    // }).catch(err => console.error(err))
    // console.log('explain', explain)

    // console.time('qry')
    // console.timeLog('updt', 'exec refresh')
    const { docs: newDocs } = await db.find({
        selector: {
            archive: { $lt: 'deleted' },
            spaceId: spaceId ? spaceId : { $exists: true },
        },
        fields: initialLoad ? undefined : ['_id'],
        sort: sortOrder.map(key => ({ [key] : 'asc' })),
        limit: 4000
    }).catch(err => console.error(err))

    // console.timeEnd('qry')
    // console.log('qry', newDocs.length)

    // console.timeLog('updt', 'exec received docs')

    if (newDocs.length > 3000) {
        console.error('approaching max data size, needs paging and partition support now')
    }

    // console.log({ newDocs, docs })

    let activeTabIdExists = false

    // Build new tabs arrays to avoid clearing existing ones (prevents flicker)
    const newSpaceTabs = {}
    if (spaceId) {
        spaces[spaceId] ??= {}
        newSpaceTabs[spaceId] = []
    }
    const closedTabs = []

    for (const refreshDoc of newDocs) {
        let doc
        if (initialLoad) {
            docs[refreshDoc._id] = refreshDoc
            doc = refreshDoc 
        } else {
            doc = docs[refreshDoc._id]
        }

        if (!doc) { 
            console.warn('doc not found', refreshDoc)
            continue
        }

        if (doc.type === 'space') {
            const { activeTabsOrder: _ignoredActiveHistory, ...spaceDoc } = doc

            if (!spaceMeta.activeSpace) {
                spaceMeta.activeSpace = 'darc:space_default'
            }
            if (!spaces[doc._id]) {
                spaces[doc._id] = { ...spaceDoc, tabs: [] }
            } else {
                spaces[doc._id] = { ...spaces[doc._id], ...spaceDoc }
            }

            spaces[doc._id].activeTabsOrder ??= []
           
        } else if (doc.type === 'tab' || doc.type === 'divider' || doc.type === 'shape') {
            doc.id = doc._id // legacy compat, remove this later
            if (doc.type === 'tab') {
                syncTabPreview(docs[doc.id])
            }
            const isDivider = doc.type === 'divider'
            const isShape = doc.type === 'shape'

            if (initialLoad && isShape) {
                rememberCanvasShapeState(doc)
            }

            if (!spaces[doc.spaceId]) {
                spaces[doc.spaceId] = { _id: doc.spaceId, tabs: [] }
            }

            // Initialize new tabs array for this space if not already done
            if (!newSpaceTabs[doc.spaceId]) {
                newSpaceTabs[doc.spaceId] = []
            }

            if (doc.archive) {
                // console.log(doc)
                if (!isDivider && !isShape && doc.archive === 'closed') {
                    closedTabs.push(doc)
                }
                continue
            } else if (isDivider || isShape) {
                newSpaceTabs[doc.spaceId].push(doc)
            } else {
                if (doc.id === spaceMeta.activeTabId) {
                    activeTabIdExists = true
                }
                if (doc.preview || doc.lightbox) {
                    continue
                }
                newSpaceTabs[doc.spaceId].push(doc)
            }
        }
        //  else if (doc.type === 'activity') {
        //     activity[doc._id] = doc
        // } else if (doc.type === 'resource') {
        //     resources[doc._id] = doc
        // }
    }

    // Assign new tabs arrays to spaces (prevents flicker by avoiding intermediate empty state)
    for (const spaceId of Object.keys(newSpaceTabs)) {
        spaces[spaceId].tabs = newSpaceTabs[spaceId].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }

    console.log('setting active tab id b', { current : spaceMeta.activeTabId, title: docs[spaceMeta.activeTabId]?.title || '', activeTabIdExists, list :spaces[spaceMeta.activeSpace]?.activeTabsOrder })
    const shouldReconcileActiveTab = !spaceId || spaceId === spaceMeta.activeSpace
    if (shouldReconcileActiveTab && spaceMeta.activeTabId && !activeTabIdExists && spaces[spaceMeta.activeSpace]?.activeTabsOrder?.length > 0) {
        removedActiveTabId(spaceMeta.activeTabId)
    }

    spaceMeta.closedTabs = closedTabs.sort((a, b) => b.modified - a.modified)
    spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => (a.order || 2) - (b.order || 2)).map(space => space._id)
    
    if (initialLoad) {
        if (!spaces[spaceMeta.activeSpace]) {
            spaceMeta.activeSpace = spaceMeta.spaceOrder[0] || null
        }

        if (spaceMeta.activeSpace && spaceMeta.activeSpacesOrder.length === 0) {
            spaceMeta.activeSpacesOrder = [spaceMeta.activeSpace]
        }

        // Restore persisted tab active history/timestamps for each space.
        for (const spaceId of Object.keys(spaces)) {
            const entries = readTabActiveHistoryEntries(spaceId)
            spaces[spaceId].activeTabsOrder = entries
        }

        if (spaces[spaceMeta.activeSpace]) {
            const lastEntry = getSpaceActiveHistoryEntries(spaceMeta.activeSpace)[0]
            const lastTab = docs[getTabIdFromActiveHistoryEntry(lastEntry)]
            const lastGroupPin = lastTab?.pinned && getPinScope(lastTab) === 'group' && getTabGroup(spaces[spaceMeta.activeSpace].tabs, lastTab.id) ? lastTab.id : null
            const lastActiveTabId = getLastActiveNonPinnedTabId(spaceMeta.activeSpace) || lastGroupPin
            if (lastActiveTabId) {
                spaceMeta.activeTabId = lastActiveTabId
                markTabActive(spaceMeta.activeSpace, lastActiveTabId)
            }
        }
    }

    if (shouldReconcileActiveTab && !spaceMeta.activeTabId) {
        const openTabs = spaces[spaceMeta.activeSpace]?.tabs?.filter(tab => {
            return tab.type === 'tab' && !tab.archive && !tab.preview && !tab.lightbox
        }) || []
        const firstTab = openTabs.find(tab => !tab.pinned) || openTabs[0]
        if (firstTab) {
            activate(firstTab.id)
        }
    }

    initialLoad = false
    await ensureSpaceHasTab(spaceMeta.activeSpace, { shouldFocus: true })
    // console.timeEnd('updt')
}, 200)

function removedActiveTabId (previousActiveTabId, spaceId = spaceMeta.activeSpace, selectReplacement = spaceId === spaceMeta.activeSpace && spaceMeta.activeTabId === previousActiveTabId) {
    let previousIndex = 1
    const activeSpace = spaces[spaceId]

    if (!activeSpace) {
        return
    }

    const activeHistory = getSpaceActiveHistoryEntries(spaceId)
    if (activeHistory.length === 0) {
        return
    }

    activeSpace.activeTabsOrder = activeHistory.filter((entry, i) => {
        const tabId = getTabIdFromActiveHistoryEntry(entry)
        if (tabId === previousActiveTabId) {
            i > previousIndex && (previousIndex = i)
            return false
        }
        return true
    })

    if (!selectReplacement) {
        persistTabActiveHistoryForSpace(spaceId)
        return
    }

    const nextEntry = activeSpace.activeTabsOrder[previousIndex - 1]
    const nextTabId = getTabIdFromActiveHistoryEntry(nextEntry)
    console.log('setting active tab id b', {
        current: spaceMeta.activeTabId,
        currentTitle: docs[spaceMeta.activeTabId]?.title || '',
        next: nextTabId,
        nextTitle: docs[nextTabId]?.title || '',
        previousIndex,
        list: activeSpace.activeTabsOrder.map(entry => getTabIdFromActiveHistoryEntry(entry)).filter(Boolean)
    })
    
    spaceMeta.activeTabId = nextTabId
    if (nextTabId) {
        markTabActive(spaceId, nextTabId, Date.now(), true)
    } else {
        persistTabActiveHistoryForSpace(spaceId)
    }
}

let lastLocalSeq = null
let changes = []
let editingId = null
const changesFeed = db.changes({
live: true,
    since: 'now',
    include_docs: true,
    filter: doc => !doc._id.startsWith('_design/')
}).on('change', async change => {
    lastLocalSeq = change.seq

    // console.log('change', change)
    // console.timeLog('updt', 'change')
    // if (change.doc instanceof type.errors) {
    //     console.error(change.doc.summary, change.doc)
    //     return
    // }

    const oldDoc = docs[change.id]?._rev ? docs[change.id] : null
    changes = [change, ...changes]

    if (change.doc.type === 'shape') {
        const desiredShape = desiredCanvasShapes.get(change.id)
        const localShape = desiredShape || (oldDoc?.type === 'shape' ? oldDoc : null)
        if (localShape && compareCanvasShapes(localShape, change.doc) > 0) {
            const repairedShape = { ...localShape, _rev: change.doc._rev }
            applyCanvasShape(repairedShape)
            queueCanvasShapeSave(repairedShape)
            return
        }
        rememberCanvasShapeState(change.doc)
    }

    if (change.doc.type === 'tab' || change.doc.type === 'tabgroup') {
        const desiredUpdate = desiredDocumentUpdates.get(change.id)
        if (desiredUpdate) {
            applyDocumentUpdate(change.id, { ...change.doc, ...desiredUpdate })
            return
        }
    }

    if (change.doc.type === 'tabgroup') {
        docs[change.id] = change.doc
        return
    }

    if (editingId !== change.id) {
        docs[change.id] = change.doc
        if (change.doc.type === 'tab') {
            syncTabPreview(docs[change.id], oldDoc?.opener)
        }

        // fixme: deep comp
        for (const key of ['canvas', 'element', 'files', 'pinned', 'pinScope', 'pinOrder', 'tabGroupId', 'tabGroupOrder', ...sortOrder]) { // force reload until using docs store
            if (!oldDoc || (oldDoc[key] !== change.doc[key])) {
                if (change.doc.spaceId && change.doc.type !== 'space' && change.doc.type !== 'activity') {
                    console.log('refreshing', change.doc.spaceId)
                    refresh(oldDoc?.spaceId && oldDoc.spaceId !== change.doc.spaceId ? undefined : change.doc.spaceId)
                } else if (change.doc.type === 'space') {
                    const { activeTabsOrder: _ignoredActiveHistory, ...spaceDoc } = change.doc
                    spaces[change.doc._id] = { ...spaces[change.doc._id], ...spaceDoc }
                    spaces[change.doc._id].activeTabsOrder ??= []
                    spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => (a.order || 2) - (b.order || 2)).map(space => space._id)
                } else {
                    console.warn('unknown change', change)
                }
                break
            }        
        }
    }
})

function activate(tabId, { source = 'navigation', recordIfAlreadyCurrent = false } = {}) {
    // console.log('activate tab id ..', {tabId})

    spaceMeta.activeTabId = tabId
    // Transient UI state: each activation carries its own scroll intent.
    ui.tabActivation = { tabId, source }

    // console.timeLog('updt', 'activate')

    markTabActive(spaceMeta.activeSpace, tabId, Date.now(), recordIfAlreadyCurrent)

    if (frames[tabId]) {
        frames[tabId].active = Date.now()
    }  

    const tabDoc = docs[tabId]
    if (tabDoc) {
        return tabDoc || tabId // TODO: deprecate returning tab
    }
    
    return null
}

function ensureSpaceHasTab(spaceId, { shouldFocus = false, groupTabId } = {}) {
    const space = spaces[spaceId]
    if (!space) {
        return null
    }

    const items = groupTabId ? getTabGroup(space.tabs, groupTabId)?.tabs : space.tabs
    const openTabs = items?.filter(tab => {
        return tab.type === 'tab' && !tab.pinned && !tab.archive && !tab.preview && !tab.lightbox
    }) || []

    if (openTabs.length) {
        if (spaceMeta.activeSpace === spaceId && !space.tabs.some(tab =>
            tab.id === spaceMeta.activeTabId && tab.type === 'tab' && !tab.archive && !tab.preview && !tab.lightbox)) {
            activate(data.getGroupActiveTab({ tabs: openTabs }, spaceId).id)
        }
        return null
    }

    return data.newTab(spaceId, { shouldFocus, groupTabId: groupTabId || getCurrentGroupTabId(spaceId) })
}

function activateSpace(spaceId) {
    if (!spaces[spaceId]) {
        console.warn('activateSpace: space does not exist:', spaceId)
        return false
    }
    
    // Update activeSpacesOrder - move this space to front (like activeTabsOrder)
    spaceMeta.activeSpacesOrder = spaceMeta.activeSpacesOrder[0] === spaceId 
        ? spaceMeta.activeSpacesOrder 
        : [spaceId, ...spaceMeta.activeSpacesOrder.filter(id => id !== spaceId)]
    
    spaceMeta.activeSpace = spaceId
    persistActiveSpaceForWindow(spaceId)
    ensureSpaceHasTab(spaceId, { shouldFocus: true })
    
    return true
}

function getPreviousActiveSpace() {
    // Return the second space in activeSpacesOrder (the previous one)
    if (spaceMeta.activeSpacesOrder.length > 1) {
        return spaceMeta.activeSpacesOrder[1]
    }
    return null
}

function closeTab (spaceId, tabId, { createReplacement = true } = {}) {
    const tab = docs[tabId]

    if (!tab) {
        return
    }

    const frame = frames[tabId]?.frame
    const discard = (tab.url?.startsWith('about:newtab') || tab.url?.startsWith('about:blank')) &&
        !frame?.canGoBack?.() && !frame?.canGoForward?.()

    if (frames[tabId]) {
        frames[tabId].frame = null
    }

    const space = spaces[spaceId]
    const siblings = getTabGroup(space?.tabs, tabId)?.tabs.filter(tab => tab.id !== tabId) || []
    const currentGroupTabId = getCurrentGroupTabId(spaceId)
    const wasCurrentGroup = spaceMeta.activeSpace === spaceId &&
        [tab, ...siblings].some(member => member.id === currentGroupTabId)
    if (space?.tabs) {
        space.tabs = space.tabs.filter(openTab => openTab.id !== tabId)
    }
    const wasActive = spaceMeta.activeSpace === spaceId && spaceMeta.activeTabId === tabId
    removedActiveTabId(tabId, spaceId, wasActive)

    if (wasActive && siblings.length) {
        activate(data.getGroupActiveTab({ tabs: siblings }, spaceId).id)
    }

    if (wasActive && !space?.tabs?.some(openTab => openTab.id === spaceMeta.activeTabId)) {
        const nextTab = space?.tabs?.find(openTab => openTab.type === 'tab' && !openTab.archive && !openTab.preview && !openTab.lightbox)
        if (nextTab) {
            activate(nextTab.id)
        }
    }

    if (createReplacement) {
        if (!tab.pinned && !tab.preview && !tab.lightbox && siblings.length) {
            ensureSpaceHasTab(spaceId, { groupTabId: siblings[0].id, shouldFocus: wasCurrentGroup })
        }
        ensureSpaceHasTab(spaceId, { shouldFocus: spaceMeta.activeSpace === spaceId })
    }
   
    db.bulkDocs([
        ...(previews[tabId]?.tabs.map(prev => {
            if (frames[prev.id])  {
                frames[prev.id].frame = null
            }
            
            return {
                ...prev,
                closed: true, // legacy
                archive: 'closed',
                modified: Date.now()
            }
        }) || []),
        // {
        //     _id: `darc:activity_${crypto.randomUUID()}`,
        //     tabId: tab.id,
        //     spaceId: tab.spaceId,
        //     type: 'activity',
        //     archive: 'history',
        //     action: 'close',
        //     url: tab.url,
        //     title: tab.title,
        //     favicon: tab.favicon,
        //     created: Date.now()
        // }
    ])

    spaceMeta.closedTabs = [
        ...(discard ? [] : [tab]),
        ...spaceMeta.closedTabs.filter(item => item.id !== tabId)
    ]
    return queueDocumentUpdate(tabId, {
        closed: true, // legacy > make timestamp
        archive: discard ? 'deleted' : 'closed',
        ...(discard ? { deleted: true } : {}),
        modified: Date.now()
    })

    // const space = spaces[spaceId]
    // if (!space || !space.tabs) {
    //     return { success: false, wasLastTab: false }
    // }
    // const tabIndex = space.tabs.findIndex(tab => tab.id === tabId)
    // if (tabIndex === -1) {
    //     return { success: false, wasLastTab: false }
    // }
    // const tab = space.tabs[tabIndex]
    // const wasLastTab = space.tabs.length === 1
    // // Add to closed tabs before removing
    // closedTabs.push({
    //     ...tab,
    //     closedAt: Date.now(),
    //     spaceId // Ensure spaceId is preserved
    // })
    // space.tabs.splice(tabIndex, 1)
    // // If we closed the active tab, need to set a new active tab
    // if (spaceMeta.activeTabId === tabId) {
    //     if (space.tabs.length > 0) {
    //         // Set the next tab as active, or the previous one if this was the last
    //         const newActiveIndex = Math.min(tabIndex, space.tabs.length - 1)
    //         const newActiveTabId = space.tabs[newActiveIndex]?.id || space.tabs[0]?.id
    //         activate(newActiveTabId)
    //     } else {
    //         spaceMeta.activeTab = null
    //     }
    // }
    // return { success: true, wasLastTab }
}

const destroy = $effect.root(() => {
    // $effect(() => {
    //     console.log('--------',$state.snapshot(frames['darc:tab_a1f1673e-2811-40cb-a5f1-1c719723e244']).forceHibernated)
    // })

    return () => {
        // console.log('---- unsubscribing from changes feed ----')
        changesFeed.cancel()
    }
})

if (import.meta.hot) {
    import.meta.hot.accept((newModule) => {
        if (newModule) {
            destroy()
        }
    })
}

function loadSampleData () {
    db.bulkDocs(testData).then((res) => {
        console.log('sample data loaded', res)
        refresh()
    })
}

function hibernate (tabId, force = false) {
    // remove background frames from dom node parking
    const frame = frames[tabId]
    if (frame.frame) {
        frame.frame.remove()
    }
    frames[tabId].frame = null
    frames[tabId].pendingLoad = false
    frames[tabId].hibernated = Date.now()
    if (force) {
        frames[tabId].forceHibernated = true
        lastForceHibernateTime = Date.now()
        // console.log('hibernate set forceHibernated:', frames[tabId].forceHibernated)
    }
}

function unhibernate (tabId) {
    // Guard against immediate unhibernation after force-hibernate (event propagation)
    // console.log('### unhibernate', tabId)
    if (Date.now() - lastForceHibernateTime < 100) {
        return
    }
    if (!$state.snapshot(frames[tabId])) {
        frames[tabId] = {}
    }
    frames[tabId].hibernated = null
    frames[tabId].forceHibernated = false
    frames[tabId].pendingLoad = true
}

function isInternalPage (url) {
    return url?.startsWith('about:newtab') || url?.startsWith('about:blank') || url?.startsWith('about:tabhistory')
}

function isTabHibernated (tabId) {
    const tab = docs[tabId]
    if (isInternalPage(tab?.url)) return false
    return !frames[tabId]?.frame
}

// Helper function to resolve attachment URLs to blob URLs
const resolveAttachmentUrl = async (attachmentUrl) => {
    if (!attachmentUrl || !attachmentUrl.startsWith('attachment://')) {
        return attachmentUrl
    }
    
    try {
        const [docId, attachmentName] = attachmentUrl.replace('attachment://', '').split('/')
        const doc = await db.get(docId, { attachments: true })
        
        if (doc._attachments && doc._attachments[attachmentName]) {
            const attachment = doc._attachments[attachmentName]
            if (attachment.data instanceof Blob) {
                return URL.createObjectURL(attachment.data)
            }
            // If data is base64 string (from replication)
            if (typeof attachment.data === 'string') {
                const byteCharacters = atob(attachment.data)
                const byteNumbers = new Array(byteCharacters.length)
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i)
                }
                const byteArray = new Uint8Array(byteNumbers)
                const blob = new Blob([byteArray], { type: attachment.content_type })
                return URL.createObjectURL(blob)
            }
        }
    } catch (error) {
        console.warn('Failed to resolve attachment URL:', attachmentUrl, error)
    }
    
    return null
}

// Cache for resolved attachment URLs - keyed by attachmentUrl + digest for invalidation
const attachmentUrlCache = new Map()

const getAttachmentUrl = async (attachmentUrl, digest) => {
    if (!attachmentUrl || !attachmentUrl.startsWith('attachment://')) {
        return attachmentUrl
    }
    
    // Use digest in cache key to invalidate when attachment changes
    const cacheKey = digest ? `${attachmentUrl}:${digest}` : attachmentUrl
    
    if (attachmentUrlCache.has(cacheKey)) {
        return attachmentUrlCache.get(cacheKey)
    }
    
    const resolvedUrl = await resolveAttachmentUrl(attachmentUrl)
    if (resolvedUrl) {
        // Revoke old blob URLs for this attachment to prevent memory leaks
        for (const [key, url] of attachmentUrlCache.entries()) {
            if (key.startsWith(attachmentUrl + ':') && key !== cacheKey) {
                URL.revokeObjectURL(url)
                attachmentUrlCache.delete(key)
            }
        }
        attachmentUrlCache.set(cacheKey, resolvedUrl)
    }
    
    return resolvedUrl
}

function getLastActiveNonPinnedTabId(spaceId) {
    spaceId ||= spaceMeta.activeSpace
    const activeHistory = getSpaceActiveHistoryEntries(spaceId)
    const active = docs[spaceMeta.activeTabId]?.spaceId === spaceId ? docs[spaceMeta.activeTabId] : docs[getTabIdFromActiveHistoryEntry(activeHistory[0])]
    const group = active?.pinned && active.spaceId === spaceId && getPinScope(active) === 'group' ? getTabGroup(spaces[spaceId]?.tabs, active.id) : null

    for (const entry of activeHistory) {
        const tabId = getTabIdFromActiveHistoryEntry(entry)
        if (!tabId) {
            continue
        }

        const tab = docs[tabId]
        if (tab?.type === 'tab' && tab.spaceId === spaceId && !tab.archive && !tab.preview && !tab.lightbox && !tab.pinned && (!group || group.tabs.some(member => member.id === tabId))) {
            return tabId
        }
    }

    return group?.tabs.find(tab => !tab.pinned)?.id || null
}

function getCurrentGroupTabId(spaceId = spaceMeta.activeSpace) {
    const items = spaces[spaceId]?.tabs || []
    const groups = getTabGroups(items)
    const members = new Set(groups.flatMap(group => group.tabs.map(tab => tab.id)))
    if (members.has(spaceMeta.activeTabId)) return spaceMeta.activeTabId
    return getLastActiveNonPinnedTabId(spaceId) ||
        getSpaceActiveHistoryEntries(spaceId).map(getTabIdFromActiveHistoryEntry).find(id => members.has(id)) ||
        groups[0]?.tabs[0]?.id || null
}

function getTabLastActiveAt(tabId, spaceId = spaceMeta.activeSpace) {
    if (!tabId || !spaceId) {
        return 0
    }

    const activeHistory = getSpaceActiveHistoryEntries(spaceId)
    let latestFromHistory = 0
    for (const entry of activeHistory) {
        if (getTabIdFromActiveHistoryEntry(entry) === tabId) {
            const activatedAt = getActivatedAtFromActiveHistoryEntry(entry)
            activatedAt > latestFromHistory && (latestFromHistory = activatedAt)
        }
    }

    if (latestFromHistory) {
        return latestFromHistory
    }

    return frames[tabId]?.active || 0
}

const data = {
    origins,
    spaceMeta,
    spaces,
    activity,
    getAttachmentUrl,
    resources,
    docs,
    frames,
    previews,
    settings,
    ledIndicators,
    permissions,

    ui,

    activate,
    activateSpace,
    getPreviousActiveSpace,
    getLastActiveNonPinnedTabId,
    getCurrentGroupTabId,
    getPinScope,
    getSidepins: (spaceId = spaceMeta.activeSpace, groupTabId = getCurrentGroupTabId(spaceId)) => getSidepins(spaces[spaceId]?.tabs, groupTabId),
    getSpacePins: (spaceId = spaceMeta.activeSpace) => getSidepins(spaces[spaceId]?.tabs, null),
    getTabLastActiveAt,
    getTabGroups: (spaceId = spaceMeta.activeSpace) => getTabGroups(spaces[spaceId]?.tabs, getTabGroupHistory(spaceId), docs),
    getSidebarItems: (spaceId = spaceMeta.activeSpace) => getSidebarItems(spaces[spaceId]?.tabs, getTabGroupHistory(spaceId), docs),
    getTabGroup: (tabId = spaceMeta.activeTabId, spaceId = spaceMeta.activeSpace) => getTabGroup(spaces[spaceId]?.tabs, tabId, getTabGroupHistory(spaceId), docs),
    updateTabGroup: (tabGroupId, properties, spaceId = spaceMeta.activeSpace) => {
        const _id = tabGroupMetadataId(tabGroupId)
        if (!tabGroupId || !spaces[spaceId]) return Promise.resolve()
        const update = Object.fromEntries(['name', 'color', 'favicon', 'emoji']
            .filter(key => Object.hasOwn(properties, key))
            .map(key => [key, typeof properties[key] === 'string' ? properties[key].trim() || null : null]))
        if (!Object.keys(update).length) return Promise.resolve()
        if (!docs[_id] && Object.values(update).every(value => value === null)) return Promise.resolve()
        docs[_id] ??= { _id, type: 'tabgroup', tabGroupId, spaceId, created: Date.now() }
        return queueDocumentUpdate(_id, { ...update, modified: Date.now() })
    },
    getGroupActiveTab: (group, spaceId = spaceMeta.activeSpace) => {
        const history = spaces[spaceId]?.activeTabsOrder || []
        for (const entry of history) {
            const tab = group.tabs.find(tab => tab.id === getTabIdFromActiveHistoryEntry(entry))
            if (tab) {
                return tab
            }
        }
        return group.tabs[0]
    },
    closeTabGroup: (tabId, spaceId = docs[tabId]?.spaceId) => {
        const group = data.getTabGroup(tabId, spaceId)
        if (!group) return Promise.resolve()
        const closing = group.tabs.map(tab => closeTab(spaceId, tab.id, { createReplacement: false }))
        const replacement = ensureSpaceHasTab(spaceId, { shouldFocus: spaceMeta.activeSpace === spaceId })
        return Promise.all([...closing, replacement])
    },
    convertTabGroupToSpace: async (tabId, spaceId = docs[tabId]?.spaceId) => {
        const group = data.getTabGroup(tabId, spaceId)
        if (!group) return null
        const selectedTab = data.getGroupActiveTab(group, spaceId)
        const memberIds = new Set(group.tabs.map(tab => tab.id))
        const history = getSpaceActiveHistoryEntries(spaceId).filter(entry => memberIds.has(getTabIdFromActiveHistoryEntry(entry)))
        const space = await data.newSpace({
            name: group.title,
            color: group.metadata?.color || spaces[spaceId].color,
            glyph: group.metadata?.emoji,
            createTab: false
        })
        await data.moveTab(group.tabs[0].id, { scope: 'group', targetSpaceId: space._id })
        await Promise.all(group.tabs.map((tab, index) => queueDocumentUpdate(tab.id, {
            tabGroupId: null, tabGroupOrder: null, order: index,
            ...(tab.pinned ? { pinScope: 'space' } : {})
        })))
        spaces[space._id].tabs.sort((a, b) => a.order - b.order)
        spaces[space._id].activeTabsOrder = history
        persistTabActiveHistoryForSpace(space._id)
        activateSpace(space._id)
        activate(selectedTab.id)
        return spaces[space._id]
    },
    newGroupTab: (spaceId = spaceMeta.activeSpace, options = {}) => {
        const tabId = options.groupTabId || getCurrentGroupTabId(spaceId)
        return data.newTab(spaceId, { ...options, groupTabId: tabId })
    },
    loadSampleData,

    restoreClosedTab: (tabId) => {
        const tab = docs[tabId]
        if (!tab || !spaces[tab.spaceId]) return

        const restoring = queueDocumentUpdate(tabId, {
            // TODO: handle previews and tab groups
            // ...(previews[tabId]?.tabs.map(prev => {
            //     if (frames[prev.id])  {
            //         frames[prev.id].frame = null
            //     }
                
            //     return {
            //         ...prev,
            //         closed: false, // legacy
            //         archive: null,
            //         modified: Date.now()
            //     }
            // }) || []),
            closed: false,
            archive: null,
            modified: Date.now()
        })

        const space = spaces[tab.spaceId]
        if (!space.tabs.some(item => item.id === tabId)) {
            space.tabs.push(tab)
            space.tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        }
        spaceMeta.closedTabs = spaceMeta.closedTabs.filter(item => item.id !== tabId)
        activateSpace(tab.spaceId)
        activate(tabId)
        return restoring
    },

    readPage: async (tabId, { textOnly = false } = {}) => {
        const frame = frames[tabId]

        if (!frame?.frame) {
            return 'Error: frame not active'
        }

        const result = await frame.frame.executeScript({code: textOnly ? 'document.body.innerText' : 'document.body.innerHTML'})

        return result[0]
    },


    // TODO: this is not reliable, move to ipc scoped method
    disableZoomForAllFrames: () => {
        // console.log('🔍 [ZOOM-CONTROL] disabling zoom for all frames')
        Object.values(frames).forEach(frameData => {
            // console.log('frameData', frameData)
            if (frameData?.frame?.executeScript) {
                try {   
                    setTimeout(() => {
                        frameData.frame.executeScript({
                            code: 'window.darcZoomControl?.disable()'
                        }).catch(err => {
                            console.log('Failed to disable zoom for frame:', err)
                        })
                    }, 200)
                } catch (err) {
                    console.log('Failed to disable zoom for frame:', err)
                }
            }
        })
    },

    enableZoomForAllFrames: () => {
        Object.values(frames).forEach(frameData => {
            if (frameData?.frame?.executeScript) {
                try {   
                    frameData.frame.executeScript({
                        code: 'window.darcZoomControl?.enable()'
                    }).catch(err => {
                        console.log('Failed to enable zoom for frame:', err)
                    })
                } catch (err) {
                    console.log('Failed to enable zoom for frame:', err)
                }
            }
        })
    },

    hibernateOthers: (keepTabId) => {
        for (const tabId of Object.keys(frames)) {
            if (!docs[tabId].pinned && tabId !== keepTabId) {
                frames[tabId].frame = null
                frames[tabId].hibernated = Date.now()
            }
        }
    },

    hibernate,
    unhibernate,
    isInternalPage,
    isTabHibernated,

    previous: () => {
        const activeSpace = spaces[spaceMeta.activeSpace]
        if (!activeSpace) {
            return false // No previous tab available
        }

        const activeHistory = getSpaceActiveHistoryEntries(spaceMeta.activeSpace)
        if (activeHistory.length < 2) {
            return false // No previous tab available
        }
        
        // Remove the current tab (at index 0) from the order
        const currentEntry = activeHistory.shift()
        const currentTabId = getTabIdFromActiveHistoryEntry(currentEntry)
        
        // Pop pinned, invalid, or duplicate-of-current tabs until we find a different valid tab
        let previousTabId = null
        let previousTab = null
        
        while (activeHistory.length > 0) {
            const tabId = getTabIdFromActiveHistoryEntry(activeHistory[0])
            if (!tabId) {
                activeHistory.shift()
                continue
            }

            const tab = activeSpace.tabs?.find(t => t.id === tabId)
            
            // If tab doesn't exist, pop it and continue
            if (!tab) {
                activeHistory.shift()
                continue
            }
            
            // If tab is pinned, pop it and continue
            if (docs[tabId]?.pinned) {
                activeHistory.shift()
                continue
            }
            
            // If same tab as the one we just removed, skip it
            if (tabId === currentTabId) {
                activeHistory.shift()
                continue
            }
            
            // Found a different valid non-pinned tab
            previousTabId = tabId
            previousTab = tab
            break
        }
        
        if (!previousTabId) {
            // No non-pinned previous tab found
            if (currentEntry) {
                activeSpace.activeTabsOrder = [currentEntry, ...activeHistory]
                persistTabActiveHistoryForSpace(spaceMeta.activeSpace)
            }
            return false
        }
        
        // Set the previous tab as active
        activate(previousTab.id, { recordIfAlreadyCurrent: true })
        
        return true
    },

    newSpace: async ({ name = 'Space ' + (Object.keys(spaces).length + 1), color = projectColors[Object.keys(spaces).length % projectColors.length].color, glyph, createTab = true } = {}) => {
        const _id = `darc:space_${crypto.randomUUID()}`
        const space = {
            _id,
            spaceId: _id,
            type: 'space',
            order: Date.now(),
            created: Date.now(),
            color,
            ...(glyph ? { glyph } : {}),
            name
        }

        await db.put(space)
        spaces[_id] = { ...space, tabs: [], activeTabsOrder: [] }
        spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => (a.order || 2) - (b.order || 2)).map(space => space._id)
        if (createTab) await data.newTab(_id)

        await db.put({
            _id: `darc:activity_${crypto.randomUUID()}`,
            type: 'activity',
            archive: 'history',
            action: 'space_create',
            spaceId: _id,
            name,
            created: Date.now()
        })
        return spaces[_id]
    },

    deleteSpace: (spaceId) => {
        delete spaces[spaceId]
        spaceMeta.spaceOrder = spaceMeta.spaceOrder.filter(id => id !== spaceId)
        if (spaceMeta.activeSpace === spaceId) {
            spaceMeta.activeSpace = spaceMeta.spaceOrder[0] || null
            persistActiveSpaceForWindow(spaceMeta.activeSpace)
            ensureSpaceHasTab(spaceMeta.activeSpace, { shouldFocus: true })
        }
    },

    editSpace: (spaceId, data) => {
        spaces[spaceId] = data
    },

    updateSpace: (spaceId, updates) => {
        const space = spaces[spaceId]
        if (!space) return
        const updated = { ...space, ...updates }
        spaces[spaceId] = updated
        db.put(updated)
    },

    pin({ tabId, pinned, scope, groupTabId, beforeTabId, afterTabId, targetSpaceId }) {
        const tab = docs[tabId]
        if (tab?.type !== 'tab') return Promise.resolve()
        if (!pinned) return queueDocumentUpdate(tabId, { pinned: null, pinScope: null, pinOrder: null })

        const pinScope = scope || (tab.pinned ? getPinScope(tab) : 'group')
        if (targetSpaceId && targetSpaceId !== tab.spaceId) {
            if (!spaces[targetSpaceId]) return Promise.resolve()
            const moving = data.moveTab(tabId, { targetSpaceId, targetGroupTabId: groupTabId })
            const pinning = data.pin({ tabId, pinned, scope: pinScope, groupTabId, beforeTabId, afterTabId })
            return Promise.all([moving, pinning])
        }
        const items = spaces[tab.spaceId]?.tabs || []
        const anchor = groupTabId || (tab.pinned && getPinScope(tab) === 'space' ? getCurrentGroupTabId(tab.spaceId) : tabId)
        const group = pinScope === 'group' ? getTabGroup(items, anchor) : null
        const saves = []
        let membership = {}
        if (group && !group.tabs.some(member => member.id === tabId) && (!tab.tabGroupId || tab.tabGroupId !== group.tabs[0].tabGroupId)) {
            const updates = planTabMove(items, items, tabId, { targetSpaceId: tab.spaceId, targetGroupTabId: anchor }, () => crypto.randomUUID())
            for (const { id, ...update } of updates) {
                if (id === tabId) membership = update
                else saves.push(queueDocumentUpdate(id, update))
            }
        }
        const pinOrder = beforeTabId || afterTabId
            ? orderBetween(docs[beforeTabId], docs[afterTabId], 'pinOrder')
            : tab.pinOrder ?? (tab.pinned ? tab.order ?? 0 : nextPinOrder(items))
        saves.push(queueDocumentUpdate(tabId, { ...membership, pinned: pinned === true ? 'left' : pinned, pinScope, pinOrder }))

        if (spaceMeta.activeSpace === tab.spaceId && spaceMeta.activeTabId === tabId) {
            const candidates = (pinScope === 'group' ? getTabGroup(items, tabId)?.tabs || [] : items)
                .filter(member => member.type === 'tab' && !member.pinned && !member.archive && !member.preview && !member.lightbox)
            const replacement = data.getGroupActiveTab({ tabs: candidates }, tab.spaceId)
            if (replacement) activate(replacement.id)
        }
        return Promise.all(saves)
    },

    navigate(tabId, url) {
        const tab = docs[tabId]
        const frame = frames[tabId]

        // TODO: central dataside favicon handling and title invalidation

        if (frame.frame) {
            frame.frame.src = url
        }

        db.put({
            ...tab,
            url
        })

        // db.put({d
        //     _id: `darc:activity_${crypto.randomUUID()}`,
        //     type: 'activity',
        //     archive: 'history',
        //     action: 'visit',
        //     tabId: tab.id,
        //     spaceId: tab.spaceId,
        //     url,
        //     title: url.split('/').pop(),
        //     favicon: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`,
        //     created: Date.now()
        // })
    },

    addDivider: createDivider,

    removeDivider: (dividerId) => {
        const divider = docs[dividerId]
        if (!divider || divider.type !== 'divider') return

        const space = spaces[divider.spaceId]
        if (space?.tabs) {
            space.tabs = space.tabs.filter(item => item.id !== dividerId)
        }

        const persistRemoval = () => db.put({
            ...(docs[dividerId] || divider),
            archive: 'deleted',
            modified: Date.now()
        })
        const creation = dividerCreationTasks.get(dividerId)
        const removal = creation ? creation.then(persistRemoval) : persistRemoval()
        removal.catch(error => console.error('Failed to remove divider:', error))
    },
    
    newTab: async (spaceId, { url, title, opener, preview, lightbox, shouldFocus, pinned, pinScope = 'group', groupTabId } = {}) => {
        // console.time('updt')
        const _id = `darc:tab_${crypto.randomUUID()}`
        const firstItem = spaces[spaceId]?.tabs?.[0]
        const isGroupMember = !preview && !lightbox && (!pinned || pinScope === 'group')
        const group = isGroupMember ? getTabGroup(spaces[spaceId]?.tabs, groupTabId) : null
        const tabGroupId = group ? group.tabs[0].tabGroupId || crypto.randomUUID() : null
        const canvasPosition = group ? groupCanvasPosition(group.tabs, spaceId) : null
        if (group) {
            for (const [index, member] of group.tabs.entries()) {
                queueDocumentUpdate(member.id, { tabGroupId, order: group.order, tabGroupOrder: member.tabGroupOrder ?? index })
            }
        }

        const tab = {
            _id,
            id: _id,
            type: 'tab',
            spaceId,
            favicon: url ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64` : undefined,
            url: url || 'about:newtab',
            title: url ? title : 'New Tab',
            order: group ? group.order : isGroupMember && firstItem ? (firstItem.order ?? Date.now()) - 1 : Date.now(),
            tabGroupId,
            tabGroupOrder: group ? Math.max(...group.tabs.map((member, index) => member.tabGroupOrder ?? index)) + 1 : null,
            ...(canvasPosition ? { canvas: { [spaceId]: canvasPosition } } : {}),
            opener,
            preview: !!preview,
            archive: preview ? 'preview' : undefined,
            lightbox: !!lightbox,
            pinned,
            ...(pinned ? { pinScope, pinOrder: nextPinOrder(spaces[spaceId].tabs) } : {})
        }

        if (!spaces[spaceId].tabs?.length) {
            spaces[spaceId].tabs = []
        }

        if (!preview && !lightbox) {
            spaces[spaceId].tabs.push(tab)
            spaces[spaceId].tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        }
        
        docs[tab._id] = tab
        syncTabPreview(docs[tab._id])
        const creation = db.put(tab).then(result => {
            applyDocumentUpdate(tab.id, { _rev: result.rev })
        }).finally(() => tabCreationTasks.delete(tab.id))
        tabCreationTasks.set(tab.id, creation)

        if (!$state.snapshot(frames[tab.id])) {
            frames[tab.id] = {}
        }
       
        frames[tab.id].initialLoad = true

        if (shouldFocus && !preview && !lightbox) {
            await tick()
            if (spaceMeta.activeSpace === spaceId && !docs[_id].archive) {
                activate(_id)
            }
        }

        await creation
        return docs[_id]
    },

    updateCanvasShapes: (spaceId, elements, files = {}) => {
        const space = spaces[spaceId]
        if (!space) return

        const changedShapes = []
        const now = Date.now()

        for (const [canvasOrder, element] of elements.entries()) {
            if (element.customData?.virtualTabGroup || element.id.startsWith('tab-group-frame:')) {
                continue
            }
            if (docs[element.id]?.type === 'tab') {
                continue
            }

            const storedShape = desiredCanvasShapes.get(element.id) || (
                docs[element.id]?.type === 'shape'
                    ? docs[element.id]
                    : space.tabs?.find(item => item.id === element.id && item.type === 'shape')
            )

            const shapeFiles = { ...(storedShape?.files || {}) }
            const file = element.fileId ? files[element.fileId] : null
            const fileChanged = file && file.dataURL !== shapeFiles[element.fileId]?.dataURL
            if (file) {
                shapeFiles[element.fileId] = file
            }

            const shapeState = getCanvasShapeState(element, canvasOrder, shapeFiles)
            const storedState = canvasShapeStates.get(element.id) || (
                storedShape?.element
                    ? getCanvasShapeState(storedShape.element, storedShape.canvasOrder, storedShape.files)
                    : null
            )
            canvasShapeStates.set(element.id, shapeState)

            if (canvasShapeStateMatches(storedState, shapeState) && !fileChanged) {
                continue
            }

            const shape = {
                ...storedShape,
                _id: element.id,
                id: element.id,
                type: 'shape',
                spaceId,
                archive: null,
                order: Number.MAX_SAFE_INTEGER,
                canvasOrder,
                element,
                files: shapeFiles,
                created: storedShape?.created || now,
                modified: now
            }

            docs[shape.id] = shape
            changedShapes.push(shape)
        }

        if (changedShapes.length === 0) return

        const changedById = new Map(changedShapes.map(shape => [shape.id, shape]))
        const nextTabs = (space.tabs || []).map(item => changedById.get(item.id) || item)
        for (const shape of changedShapes) {
            if (!nextTabs.some(item => item.id === shape.id)) {
                nextTabs.push(shape)
            }
        }
        space.tabs = nextTabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

        changedShapes.forEach(queueCanvasShapeSave)
    },

    updateTab: async (tabId, { canvas, lightbox, preview, screenshot, favicon, title, url } = {}) => {
        const tab = docs[tabId]
        if (tab?.type !== 'tab') return
       
        let newProps = {}
        if (canvas) {
            canvas = { ...(tab.canvas || {}), ...canvas }
            newProps.canvas = canvas
        }

        if (typeof favicon !== 'undefined' && favicon !== tab.favicon) {
            newProps.favicon = favicon
        }
        if (typeof title !== 'undefined' && title !== tab.title) {
            newProps.title = title
        }
        if (typeof url !== 'undefined' && url !== tab.url) {
            newProps.url = url
        }

        if (typeof lightbox !== 'undefined') {
            newProps.lightbox = lightbox
        }
        if (typeof preview !== 'undefined') {
            newProps.preview = preview
            if (preview) {
                newProps.archive = 'preview'
            } else {
                newProps.archive = undefined
            }
        } 
    
        if (typeof screenshot !== 'undefined') {
            if (screenshot && screenshot.startsWith('data:')) {
                const [header, base64Data] = screenshot.split(',')
                const mime = header.match(/:(.*?);/)?.[1] || 'image/png'
                const binary = atob(base64Data)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                const blob = new Blob([bytes], { type: mime })
                
                // Store as PouchDB attachment
                newProps._attachments = {
                    ...(tab._attachments || {}),
                    screenshot: {
                        content_type: blob.type || 'image/png',
                        data: blob
                    }
                }
                
                
                // Set screenshot property to attachment URL path
                newProps.screenshot = `attachment://${tabId}/screenshot`
            } else if (screenshot === null || screenshot === undefined) {
                // Remove screenshot attachment if being cleared
                if (tab._attachments?.screenshot) {
                    newProps._attachments = { ...tab._attachments }
                    delete newProps._attachments.screenshot
                    if (Object.keys(newProps._attachments).length === 0) {
                        newProps._attachments = undefined
                    }
                }
                newProps.screenshot = screenshot
            } else {
                // External URL or already processed attachment URL
                newProps.screenshot = screenshot
            }
        }

        if (Object.keys(newProps).length > 0) {
            await queueDocumentUpdate(tabId, newProps)
        }
    },

    promoteLightboxToTab: (lightboxId, parentId, { focus = true, toPreview = false, closeParent = false } = {}) => {
        const lbTab = docs[lightboxId]
        const parentTab = docs[parentId]
        if (!lbTab || !parentTab || !spaces[lbTab.spaceId] || !spaces[parentTab.spaceId]) {
            return
        }

        if (toPreview) {
            lbTab.lightbox = false
            lbTab.preview = true
            if (previews[parentId]) {
                previews[parentId].lightbox = null
            }

            const frameData = frames[lightboxId]
            if (frameData) {
                frameData.promoting = true
                if (frameData.frame) {
                    const backgroundFrames = document.getElementById('backgroundFrames')
                    const anchorFrame = document.getElementById('anchorFrame')
                    if (backgroundFrames && anchorFrame) {
                        backgroundFrames.moveBefore(frameData.frame, anchorFrame)
                        delete frameData.wrapper
                    }
                }
            }

            db.put({ ...lbTab })
            return
        }

        const frameData = frames[lightboxId]
        if (frameData) {
            frameData.promoting = true
            if (frameData.frame) {
                const backgroundFrames = document.getElementById('backgroundFrames')
                const anchorFrame = document.getElementById('anchorFrame')
                if (backgroundFrames && anchorFrame) {
                    backgroundFrames.moveBefore(frameData.frame, anchorFrame)
                    delete frameData.wrapper
                }
            }
        }

        const promotion = queueDocumentUpdate(lightboxId, { lightbox: false, preview: false, archive: undefined })
        const spaceTabs = spaces[lbTab.spaceId].tabs
        if (!spaceTabs.some(tab => tab.id === lightboxId)) {
            spaceTabs.push(lbTab)
        }
        const groupTabId = getTabGroup(spaces[parentTab.spaceId].tabs, parentId) ? parentId : getLastActiveNonPinnedTabId(parentTab.spaceId)
        const move = data.moveTab(lightboxId, { targetSpaceId: parentTab.spaceId, targetGroupTabId: groupTabId })

        if (previews[parentId]) {
            previews[parentId].lightbox = null
            previews[parentId].tabs = previews[parentId].tabs.filter(t => t._id !== lightboxId)
        }

        const closing = closeParent ? closeTab(parentTab.spaceId, parentId) : null

        if (focus) {
            activate(lightboxId)
        }
        return Promise.all([promotion, move, closing])
    },

    permissionRequest: (tabId, event) => {
        if (typeof event?.permission !== 'string' || !event.permission.trim()) {
            console.warn('Permission request has no permission type', event)
            return { granted: false }
        }

        let origin
        try {
            origin = new URL(event.url).origin
        } catch {
            console.warn('Permission request has no valid URL', event)
            return { granted: false }
        }

        let permission = permissions[event.permission]

        if (!permission) {
            console.warn(`Unknown permission type: ${event.permission}`)
            permission = permissions[event.permission] = {
                name: event.permission,
                icon: '',
                description: `${event.permission} permission`
            }
        }

        permission.origins ??= {}
        permission.origins[origin] ??= {}
        permission.origins[origin].requests ??= []

        ledIndicators.permissionRequest = Date.now()

        setTimeout(() => {
            ledIndicators.permissionRequest = 0
        }, 1000)

        console.log('permissionRequest', event, permission)


        if (permission.origins[origin].permission === 'denied') {
            return { granted: false }
        }

        const granted = permission.origins[origin].permission === 'always' || permission.origins[origin].permission === 'ephemeral'

        if (granted) {
            const latestRequest = permission.origins[origin].requests.at(-1)
            if (latestRequest) {
                latestRequest.timestamp = Date.now()
            }
            return { granted }
        }

        const pendingRequest = permission.origins[origin].requests.at(-1)
        if (pendingRequest?.status === 'requested' && pendingRequest.windowId === window.darcWindowId) {
            pendingRequest.timestamp = Date.now()
            pendingRequest.url = event.url
            pendingRequest.tabId = tabId
            pendingRequest.requester = event.requester || pendingRequest.requester
            pendingRequest.explanation = event.explanation || pendingRequest.explanation
            pendingRequest.requestType = event.requestType || pendingRequest.requestType
            return { granted: false }
        }

        permission.origins[origin].requests.push({
            requestId: crypto.randomUUID(),
            type: event.permission,
            url: event.url,
            tabId: tabId,
            agentId: null,
            status: granted ? 'granted' : 'requested',
            timestamp: Date.now(),
            created: Date.now(),
            instanceId: window.darcInstanceId,
            windowId: window.darcWindowId,
            unseen: true,
            requester: event.requester,
            explanation: event.explanation || '',
            // status: resource.status || 'Requested',
            requestType: event.requestType || 'always' // foreground
        })

        return { granted }
    },

   
    clearUnseenResourceFlags: () => {
        for (const resourceKey of Object.keys(permissions)) {
            for (const origin of Object.keys(permissions[resourceKey].origins || {})) {
                const requests = permissions[resourceKey].origins[origin].requests || []
                requests.forEach(request => {
                    if (request.unseen) {
                        request.unseen = false
                    }
                })
            }
        }
    },

    clearNeedsReloadFlags: () => {
        for (const resourceKey of Object.keys(permissions)) {
            for (const origin of Object.keys(permissions[resourceKey].origins || {})) {
                const requests = permissions[resourceKey].origins[origin].requests || []
                requests.forEach(request => {
                    if (request.needsReload) {
                        request.needsReload = false
                    }
                })
            }
        }
    },

    clearTabErrors: (tabId) => {
        const tab = docs[tabId]
        if (!tab?.url) return
        const originValue = origin(tab.url)
        if (origins[originValue]) {
            origins[originValue].certificateError = null
            origins[originValue].networkError = null
        }
    },

    reloadTab: (tabId) => {
        const tab = docs[tabId]
        const frame = frames[tabId]?.frame
        if (!tab || !frame) return
        
        // Clear errors before reload
        const originValue = origin(tab.url)
        if (origins[originValue]) {
            origins[originValue].certificateError = null
            origins[originValue].networkError = null
        }
        
        // Set loading state
        if (frames[tabId]) {
            frames[tabId].loading = true
        }
        
        // Reload the frame
        if (typeof frame.reload === 'function') {
            frame.reload()
        } else {
            frame.src = tab.url
        }
        
        console.log(`🔄 Reload initiated for tab ${tabId}`)
    },

    reloadCurrentTab: () => {
        const currentTabId = spaceMeta.activeTabId
        if (currentTabId && frames[currentTabId]?.frame) {
            // Clear errors before reload
            const tab = docs[currentTabId]
            if (tab?.url) {
                const originValue = origin(tab.url)
                if (origins[originValue]) {
                    origins[originValue].certificateError = null
                    origins[originValue].networkError = null
                }
            }
            
            // Set loading state
            if (frames[currentTabId]) {
                frames[currentTabId].loading = true
            }
            
            frames[currentTabId].frame.reload()
            
            // Clear needsReload flags after reload
            for (const resourceKey of Object.keys(permissions)) {
                for (const originKey of Object.keys(permissions[resourceKey].origins || {})) {
                    const requests = permissions[resourceKey].origins[originKey].requests || []
                    requests.forEach(request => {
                        if (request.needsReload) {
                            request.needsReload = false
                        }
                    })
                }
            }
        }
    },

    allowPermission: (permissionType, origin, permission = 'always') => {
        const permissionObj = permissions[permissionType]
        console.log('allowPermission', permissionType, origin, permission, permissionObj)
        if (!permissionObj?.origins?.[origin]?.requests?.length) {
            return false
        }

        const request = permissionObj.origins[origin].requests.at(-1)
        if (request.status === 'requested') {
            request.status = 'granted'
            request.unseen = false
            request.needsReload = true
            request.timestamp = Date.now()
            
            if (permission === 'always') {
                permissionObj.origins[origin].permission = 'always'
            } else {
                permissionObj.origins[origin].permission = 'ephemeral'
            }
            
            return true
        }
        return false
    },

    denyPermission: (permissionType, origin) => {
        const permissionObj = permissions[permissionType]
        if (!permissionObj?.origins?.[origin]?.requests?.length) {
            return false
        }

        // Find the pending request for this permission type and origin
        const request = permissionObj.origins[origin].requests.at(-1)
        if (request.status === 'requested') {
            // Update the request status
            request.status = 'denied'
            request.unseen = false
            request.needsReload = true
            request.timestamp = Date.now()
            
            // Set the permission to denied for this origin
            permissionObj.origins[origin].permission = 'denied'
            
            return true
        }
        
        return false
    },

    ignorePermission: (permissionType, origin) => {
        const permissionObj = permissions[permissionType]
        if (!permissionObj?.origins?.[origin]?.requests?.length) {
            return false
        }

        const request = permissionObj.origins[origin].requests.at(-1)
        if (request.status === 'requested') {
            request.status = 'ignored'
            request.unseen = false
            request.timestamp = Date.now()
            return true
        }
        
        return false
    },

    changePermission: (permissionType, origin) => {
        const permissionObj = permissions[permissionType]
        if (!permissionObj?.origins?.[origin]?.requests?.length) {
            return false
        }

        const latestRequest = permissionObj.origins[origin].requests.at(-1)
        if (latestRequest.status !== 'requested') {
            latestRequest.status = 'requested'
            latestRequest.unseen = true
            latestRequest.needsReload = false
            latestRequest.timestamp = Date.now()
            
            // Clear the persistent permission setting
            permissionObj.origins[origin].permission = null
            
            return true
        }
        
        return false
    },

    isPermissionGranted: (permissionType, origin) => {
        const permissionObj = permissions[permissionType]
        if (!permissionObj?.origins?.[origin]) {
            return false
        }
        const permission = permissionObj.origins[origin].permission
        return permission === 'always' || permission === 'ephemeral'
    },

    isPermissionMocked: (permissionType, origin) => {
        const permissionObj = permissions[permissionType]
        if (!permissionObj?.origins?.[origin]?.requests?.length) {
            return false
        }
        const latestRequest = permissionObj.origins[origin].requests.at(-1)
        return latestRequest?.status === 'mocked'
    },

    closeTab,

    moveTab: (tabId, { beforeTabId, afterTabId, targetSpaceId, targetGroupTabId, scope = 'tab' }) => {
        const tabDoc = docs[tabId]
        if (!tabDoc) return

        if (tabDoc.type === 'tab' && scope === 'pinned') {
            return data.pin({ tabId, pinned: tabDoc.pinned || 'left', beforeTabId, afterTabId, targetSpaceId })
        }
        if (tabDoc.type === 'tab') {
            const sourceSpaceId = tabDoc.spaceId
            const destSpaceId = targetSpaceId || sourceSpaceId
            if (!spaces[destSpaceId]) return
            const updates = planTabMove(spaces[sourceSpaceId]?.tabs || [], spaces[destSpaceId].tabs || [], tabId,
                { beforeTabId, afterTabId, targetSpaceId: destSpaceId, targetGroupTabId, scope }, () => crypto.randomUUID())
            const saves = []
            for (const { id, ...update } of updates) {
                const member = docs[id]
                if (!member) continue
                if (Object.entries(update).every(([key, value]) => member[key] === value)) continue
                const frameData = frames[id]
                const controlledFrame = frameData?.frame
                const background = document.getElementById('backgroundFrames')
                const anchor = document.getElementById('anchorFrame')
                if (controlledFrame && background && anchor) {
                    background.moveBefore(controlledFrame, anchor)
                }
                if (update.spaceId && update.spaceId !== member.spaceId) {
                    if (frameData) {
                        frameData.promoting = true
                    }
                    if (frameData) {
                        delete frameData.wrapper
                    }
                    spaces[sourceSpaceId].tabs = spaces[sourceSpaceId].tabs.filter(item => item.id !== id)
                    spaces[destSpaceId].tabs.push(member)
                    removedActiveTabId(id, sourceSpaceId)
                }
                saves.push(queueDocumentUpdate(id, update))
                if (controlledFrame && (!update.spaceId || update.spaceId === sourceSpaceId)) {
                    tick().then(() => {
                        const wrapper = frames[id]?.wrapper
                        const frameAnchor = wrapper?.querySelector('.hidden')
                        if (frameAnchor) {
                            wrapper.moveBefore(controlledFrame, frameAnchor)
                        }
                    })
                }
            }
            for (const spaceId of new Set([sourceSpaceId, destSpaceId])) {
                spaces[spaceId].tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            }
            if (sourceSpaceId !== destSpaceId) {
                if (sourceSpaceId === spaceMeta.activeSpace && !spaces[sourceSpaceId].tabs.some(item => item.id === spaceMeta.activeTabId)) {
                    const replacement = getTabGroups(spaces[sourceSpaceId].tabs)[0]?.tabs[0]
                    if (replacement) {
                        activate(replacement.id)
                    }
                }
                ensureSpaceHasTab(sourceSpaceId, { shouldFocus: sourceSpaceId === spaceMeta.activeSpace })
            }
            return Promise.all(saves)
        }

        const sourceSpaceId = tabDoc.spaceId
        const tab = spaces[sourceSpaceId]?.tabs?.find(item => item.id === tabId) || tabDoc
        if (tab !== tabDoc) {
            Object.assign(tab, tabDoc)
            docs[tabId] = tab
        }
        const destSpaceId = targetSpaceId || sourceSpaceId
        const isSpaceMove = destSpaceId !== sourceSpaceId

        // Calculate new order
        const targetItems = spaces[destSpaceId]?.tabs
        const beforeTab = beforeTabId ? targetItems?.find(item => item.id === beforeTabId) || docs[beforeTabId] : null
        const afterTab = afterTabId ? targetItems?.find(item => item.id === afterTabId) || docs[afterTabId] : null
        let newOrder
        if (beforeTab && afterTab) {
            newOrder = (beforeTab.order + afterTab.order) / 2
        } else if (beforeTab) {
            newOrder = beforeTab.order + 1
        } else if (afterTab) {
            newOrder = afterTab.order - 1
        } else {
            newOrder = Date.now()
        }

        // Park ONLY the moved tab's controlledframe before Svelte reorders DOM
        const frameData = frames[tabId]
        const controlledFrame = frameData?.frame
        const savedWrapper = frameData?.wrapper
        if (controlledFrame) {
            const bgFrames = document.getElementById('backgroundFrames')
            const bgAnchor = document.getElementById('anchorFrame')
            if (bgFrames && bgAnchor) {
                bgFrames.moveBefore(controlledFrame, bgAnchor)
            }
        }

        tab.order = newOrder
        if (isSpaceMove) {
            // Cross-space: protect frame from destruction via onDestroy
            if (frameData) {
                frameData.promoting = true
                delete frameData.wrapper
            }

            tab.spaceId = destSpaceId

            const sourceTabs = spaces[sourceSpaceId]?.tabs
            if (sourceTabs) {
                const srcIdx = sourceTabs.findIndex(t => t.id === tabId)
                if (srcIdx !== -1) sourceTabs.splice(srcIdx, 1)
            }

            const destTabs = spaces[destSpaceId]?.tabs
            if (destTabs) {
                let insertIdx = destTabs.findIndex(t => t.order > newOrder)
                if (insertIdx === -1) insertIdx = destTabs.length
                destTabs.splice(insertIdx, 0, tab)
            }
        } else {
            // Same-space: sort in-place, never remove the item
            const spaceTabs = spaces[sourceSpaceId]?.tabs
            if (spaceTabs) {
                spaceTabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            }
        }

        // Re-attach the controlledframe after Svelte finishes moving the (now-empty) wrapper
        if (controlledFrame && !isSpaceMove) {
            tick().then(() => {
                const wrapper = frames[tabId]?.wrapper
                if (wrapper && controlledFrame) {
                    const anchor = wrapper.querySelector('.hidden')
                    if (anchor) {
                        wrapper.moveBefore(controlledFrame, anchor)
                    }
                }
            })
        }

        // Prevent change feed from triggering a redundant refresh
        editingId = tabId
        const creation = dividerCreationTasks.get(tabId)
        const persistMove = creation ? creation.then(() => db.put({ ...tab })) : db.put({ ...tab })

        persistMove.then((res) => {
            editingId = null
            if (res?.rev) tab._rev = res.rev
        }).catch(() => {
            editingId = null
        })
    },

    removeClosedTab: (tabId) => {
        const tab = spaceMeta.closedTabs.find(t => t.id === tabId)
        if (!tab) return
        spaceMeta.closedTabs = spaceMeta.closedTabs.filter(t => t.id !== tabId)
        const doc = { ...tab, deleted: true, archive: 'deleted', modified: Date.now() }
        db.put(doc).catch(err => console.error('Failed to delete closed tab:', err))
    },
    clearClosedTabs: () => {
        // Update each closed tab to be marked as deleted
        const docsToUpdate = spaceMeta.closedTabs.map(tab => ({
            ...tab,
            deleted: true,
            archive: 'deleted',
            modified: Date.now()
        }))

        spaceMeta.closedTabs = []
        
        if (docsToUpdate.length > 0) {
            db.bulkDocs(docsToUpdate).then((res) => {
                console.log('Closed tabs marked as deleted:', res)
            }).catch((err) => {
                console.error('Failed to delete closed tabs:', err)
            })
        }
        
        // Clear the closedTabs array
        // closedTabs = []
        // closedTabs.length = 0
    },

    previousSpace: () => {
        let newActiveSpace = null
        
        // First try activation history (activeSpacesOrder)
        if (spaceMeta.activeSpacesOrder?.length > 1) {
            // Find next valid space in history after current
            for (let i = 1; i < spaceMeta.activeSpacesOrder.length; i++) {
                const spaceId = spaceMeta.activeSpacesOrder[i]
                if (spaces[spaceId]) {
                    newActiveSpace = spaceId
                    break
                }
            }
        }
        
        // Fall back to spatial order if no history
        if (!newActiveSpace) {
            if (spaceMeta.spaceOrder.length <= 1) {
                return false
            }
            const currentIndex = spaceMeta.spaceOrder.indexOf(spaceMeta.activeSpace)
            if (currentIndex > 0) {
                const targetSpace = spaceMeta.spaceOrder[currentIndex - 1]
                if (spaces[targetSpace]) {
                    newActiveSpace = targetSpace
                }
            }
        }
        
        if (!newActiveSpace) {
            return false
        }
        
        activateSpace(newActiveSpace)
        
        // Restore the active tab for this space from its activeTabsOrder
        const newSpace = spaces[newActiveSpace]
        const newSpaceActiveHistory = getSpaceActiveHistoryEntries(newActiveSpace)
        if (newSpaceActiveHistory.length > 0) {
            // Find the first valid (non-closed, non-pinned) tab from the order
            let activated = false
            for (const entry of newSpaceActiveHistory) {
                const tabId = getTabIdFromActiveHistoryEntry(entry)
                if (!tabId) {
                    continue
                }

                const tab = docs[tabId]
                if (tab && !tab.archive && !tab.pinned) {
                    activate(tabId)
                    activated = true
                    break
                }
            }
            if (!activated && newSpace?.tabs?.length > 0) {
                const firstNonPinned = newSpace.tabs.find(t => t.type === 'tab' && !t.pinned)
                if (firstNonPinned) {
                    activate(firstNonPinned.id)
                } else {
                    spaceMeta.activeTabId = null
                }
            }
        } else if (newSpace?.tabs?.length > 0) {
            // Fallback: activate the first non-pinned tab in the space
            const firstNonPinned = newSpace.tabs.find(t => t.type === 'tab' && !t.pinned)
            if (firstNonPinned) {
                activate(firstNonPinned.id)
            } else {
                spaceMeta.activeTabId = null
            }
        } else {
            spaceMeta.activeTabId = null
        }
        
        return true
    },

    nextSpace: () => {
        let newActiveSpace = null
        
        // First try activation history - go forward means checking if we went back before
        // For forward navigation, we'd need a separate forward history stack
        // For now, fall back to spatial order for "next"
        
        // Use spatial order for next
        if (spaceMeta.spaceOrder.length <= 1) {
            return false
        }
        const currentIndex = spaceMeta.spaceOrder.indexOf(spaceMeta.activeSpace)
        if (currentIndex < spaceMeta.spaceOrder.length - 1) {
            const targetSpace = spaceMeta.spaceOrder[currentIndex + 1]
            if (spaces[targetSpace]) {
                newActiveSpace = targetSpace
            }
        }
        
        if (!newActiveSpace) {
            return false
        }
        
        activateSpace(newActiveSpace)
        
        // Restore the active tab for this space from its activeTabsOrder
        const newSpace = spaces[newActiveSpace]
        const newSpaceActiveHistory = getSpaceActiveHistoryEntries(newActiveSpace)
        if (newSpaceActiveHistory.length > 0) {
            // Find the first valid (non-closed, non-pinned) tab from the order
            let activated = false
            for (const entry of newSpaceActiveHistory) {
                const tabId = getTabIdFromActiveHistoryEntry(entry)
                if (!tabId) {
                    continue
                }

                const tab = docs[tabId]
                if (tab && !tab.archive && !tab.pinned) {
                    activate(tabId)
                    activated = true
                    break
                }
            }
            if (!activated && newSpace?.tabs?.length > 0) {
                const firstNonPinned = newSpace.tabs.find(t => t.type === 'tab' && !t.pinned)
                if (firstNonPinned) {
                    activate(firstNonPinned.id)
                } else {
                    spaceMeta.activeTabId = null
                }
            }
        } else if (newSpace?.tabs?.length > 0) {
            // Fallback: activate the first non-pinned tab in the space
            const firstNonPinned = newSpace.tabs.find(t => t.type === 'tab' && !t.pinned)
            if (firstNonPinned) {
                activate(firstNonPinned.id)
            } else {
                spaceMeta.activeTabId = null
            }
        } else {
            spaceMeta.activeTabId = null
        }
        
        return true
    },

    captureScreenshot: async (tabId) => {
        const frame = frames[tabId]?.frame
        if (!frame) {
            console.log('Frame not found for tab:', tabId)
            return null
        }

        if (typeof frame.captureVisibleRegion !== 'function') {
            console.log('captureVisibleRegion not available for tab:', tabId)
            return null
        }

        try {
            const screenshot = await frame.captureVisibleRegion({
                format: 'png',
                quality: 80
            })

            if (screenshot) {
                const tab = docs[tabId]
                if (tab) {
                    const [header, base64] = screenshot.split(',')
                    const mime = header.match(/:(.*?);/)?.[1] || 'image/png'
                    const binary = atob(base64)
                    const bytes = new Uint8Array(binary.length)
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                    const blob = new Blob([bytes], { type: mime })
                    
                    await db.put({
                        ...tab,
                        _attachments: {
                            ...(tab._attachments || {}),
                            screenshot: {
                                content_type: blob.type || 'image/png',
                                data: blob
                            }
                        },
                        screenshot: `attachment://${tabId}/screenshot`
                    })
                    
                    return screenshot
                }
            }
        } catch (err) {
            console.log('Error capturing screenshot:', err)
        }
        
        return null
    }
}

export default data

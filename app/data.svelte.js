import PouchDB from 'pouchdb-browser'
import findPlugin from 'pouchdb-find'
import bootstrap from './bootstrap.js'
import testData from './test-data.js'
import { throttle, origin } from './lib/utils.js'
import { tick } from 'svelte'
// TODO: add user and session management
// import indexeddb from 'pouchdb-adapter-indexeddb'
// PouchDB.plugin(indexeddb)
import permissionTypes from './lib/resourceTypes.js'

import { colors as projectColors } from './lib/utils.js'

window.darcWindowId = crypto.randomUUID()

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
const ui = $state({ viewMode: 'default' })

// LED indicator states for all frames - using timestamps to avoid events
const ledIndicators = $state({
    networkAccess: 0,
    blockedRequest: 0,
    mockedActivation: 0,
    permissionRequest: 0
})

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
    activeSpace: localStorage.getItem('activeSpaceId') || null,
    activeSpacesOrder: [], // Track order of active spaces for previous space switching
    spaceOrder: [],
    closedTabs: [],
    activeTabId: localStorage.getItem('activeTabId') || null, // FIXME: use _local/ persistent active tab array
    lastActiveNonPinnedTabId: null, // Track last non-pinned tab when a pinned tab is active
    globalPins: [],
    config: {
        leftPinnedTabWidth: 400,
        rightPinnedTabWidth: 350,
        leftSidebarWidth: 320,
        rightSidebarWidth: 340,
        showLinkPreviews: true
    }
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
    for (const previewTabId of Object.keys(previews)) {
        previews[previewTabId].lightbox = null
        previews[previewTabId].tabs = []
    }

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
            if (!spaceMeta.activeSpace) {
                spaceMeta.activeSpace = 'darc:space_default'
            }
            if (!spaces[doc._id]) {
                doc.tabs = []
                spaces[doc._id] = doc
            } else {
                spaces[doc._id] = { ...spaces[doc._id], ...doc }
            }
           
        } else if (doc.type === 'tab') {
            doc.id = doc._id // legacy compat, remove this later

            if (!spaceMeta.activeTabId && doc.spaceId === spaceMeta.activeSpace) {
                spaceMeta.activeTabId = doc.id
                console.log('setting active tab id a', spaceMeta.activeTabId)
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
                if (doc.archive === 'closed') {
                    closedTabs.push(doc)
                }
                continue
            } else {
                if (doc.id === spaceMeta.activeTabId) {
                    activeTabIdExists = true
                }
                if (doc.preview || doc.lightbox) {
                    previews[doc.opener] ??= { lightbox: null, tabs: [] }
                    previews[doc.opener].tabs.push(doc)
                    if (doc.lightbox) {
                        previews[doc.opener].lightbox = doc._id
                    }
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
        spaces[spaceId].tabs = newSpaceTabs[spaceId]
    }

    console.log('setting active tab id b', { current : spaceMeta.activeTabId, activeTabIdExists, list :spaces[spaceMeta.activeSpace]?.activeTabsOrder })
    if (spaceMeta.activeTabId && !activeTabIdExists && spaces[spaceMeta.activeSpace]?.activeTabsOrder?.length > 0) {
        removedActiveTabId(spaceMeta.activeTabId)
    }

    spaceMeta.closedTabs = closedTabs.sort((a, b) => b.modified - a.modified)
    spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => (a.order || 2) - (b.order || 2)).map(space => space._id)
    
    if (initialLoad) {
        if (spaceMeta.activeSpace && spaceMeta.activeSpacesOrder.length === 0) {
            spaceMeta.activeSpacesOrder = [spaceMeta.activeSpace]
        }
        if (spaceMeta.activeTabId && spaces[spaceMeta.activeSpace]) {
            spaces[spaceMeta.activeSpace].activeTabsOrder ??= []
            if (spaces[spaceMeta.activeSpace].activeTabsOrder.length === 0) {
                spaces[spaceMeta.activeSpace].activeTabsOrder = [spaceMeta.activeTabId]
            }
        }
    }
    
    initialLoad = false
    // console.timeEnd('updt')
}, 200)

function removedActiveTabId (previousActiveTabId) {
    let previousIndex = 1

    if (!spaces[spaceMeta.activeSpace].activeTabsOrder) {
        spaces[spaceMeta.activeSpace].activeTabsOrder = []
    }
    if (spaces[spaceMeta.activeSpace].activeTabsOrder.length === 0) {
        return
    }

    spaces[spaceMeta.activeSpace].activeTabsOrder = spaces[spaceMeta.activeSpace].activeTabsOrder.filter((id, i) => {
        if (id === previousActiveTabId) {
            i > previousIndex && (previousIndex = i)
            return false
        }
        return true
    })
    console.log('setting active tab id b', { current : spaceMeta.activeTabId, next : spaces[spaceMeta.activeSpace].activeTabsOrder[previousIndex - 1], previousIndex, list :spaces[spaceMeta.activeSpace].activeTabsOrder })
    
    const nextTabId = spaces[spaceMeta.activeSpace].activeTabsOrder[previousIndex - 1]
    const nextTab = docs[nextTabId]
    
    // Clear last active non-pinned tab if switching to a non-pinned tab
    if (nextTab && !nextTab.pinned) {
        spaceMeta.lastActiveNonPinnedTabId = null
    }
    
    spaceMeta.activeTabId = nextTabId
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
    if (editingId !== change.id) {
        docs[change.id] = change.doc

        // fixme: deep comp
        for (const key of ['canvas', 'pinned', ...sortOrder]) { // force reload until using docs store
            if (!oldDoc || (oldDoc[key] !== change.doc[key])) {
                if (change.doc.spaceId && change.doc.type !== 'space' && change.doc.type !== 'activity') {
                    console.log('refreshing', change.doc.spaceId)
                    refresh(change.doc.spaceId)
                } else if (change.doc.type === 'space') {
                    spaces[change.doc._id] = { ...spaces[change.doc._id], ...change.doc }
                    spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => (a.order || 2) - (b.order || 2)).map(space => space._id)
                } else {
                    console.warn('unknown change', change)
                }
                break
            }        
        }
    }
})

function activate(tabId) {   
    // console.log('activate tab id ..', {tabId})

    const newTab = docs[tabId]
    const currentTab = docs[spaceMeta.activeTabId]
    
    // Track last non-pinned tab when switching to a pinned tab
    if (newTab?.pinned) {
        if (currentTab && !currentTab.pinned) {
            spaceMeta.lastActiveNonPinnedTabId = spaceMeta.activeTabId
        }
    } else {
        // Switching to a non-pinned tab, clear the tracker
        spaceMeta.lastActiveNonPinnedTabId = null
    }

    spaceMeta.activeTabId = tabId

    // console.timeLog('updt', 'activate')

    const activeSpace = spaces[spaceMeta.activeSpace]

    activeSpace.activeTabsOrder ??= []
    
    // Add tab to front, removing any existing duplicates to keep history clean
    if (activeSpace.activeTabsOrder[0] !== tabId) {
        activeSpace.activeTabsOrder = [tabId, ...activeSpace.activeTabsOrder.filter(id => id !== tabId)]
    }

    if (frames[tabId]) {
        frames[tabId].active = Date.now()
    }  

    const tabDoc = docs[tabId]
    if (tabDoc) {
        return tabDoc || tabId // TODO: deprecate returning tab
    }
    
    return null
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
    localStorage.setItem('activeSpaceId', spaceId)
    
    return true
}

function getPreviousActiveSpace() {
    // Return the second space in activeSpacesOrder (the previous one)
    if (spaceMeta.activeSpacesOrder.length > 1) {
        return spaceMeta.activeSpacesOrder[1]
    }
    return null
}

function closeTab (spaceId, tabId) {
    const tab = docs[tabId]

    if (frames[tabId]) {
        frames[tabId].frame = null
    }

    removedActiveTabId(tabId)
   
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
        {
            ...tab,
            closed: true, // legacy > make timestamp
            archive: 'closed',
            modified: Date.now()
        },
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
    
    $effect(() => {
        if (!spaceMeta.activeSpace && Object.keys(spaces).length > 0) {
            // Set the first space as active
            // const firstSpaceId = Object.keys(spaces)[0]
            spaceMeta.activeSpace = 'darc:space_default'

           
            // FIXME: // Set the first tab of that space as active
            // const firstSpace = spaces[firstSpaceId]
            // if (firstSpace?.tabs?.length > 0) {
            //     spaceMeta.activeTab = firstSpace.tabs[0]
            // }
        }
    })

    // Save active space to localStorage whenever it changes
    $effect(() => {
        if (spaceMeta.activeSpace) {
            setTimeout(() => {
                localStorage.setItem('activeSpaceId', spaceMeta.activeSpace)
            }, 10)
        }
    })

    $effect(() => {
        if (spaceMeta.activeTabId) {
            setTimeout(() => {
                localStorage.setItem('activeTabId', spaceMeta.activeTabId)
            }, 10)
        }
    })

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

export default {
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
    loadSampleData,

    restoreClosedTab: (tabId) => {
        const tab = docs[tabId]
    
        db.bulkDocs([
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
            {
                ...tab,
                closed: false,
                archive: null,
                modified: Date.now()
            },
        ])

        activate(tabId)
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
            console.log('frameData', frameData)
            if (frameData?.frame?.executeScript) {
                try {   
                    console.log(frameData.frame.executeScript({
                        code: 'window.darcZoomControl?.disable()'
                    }).catch(err => {
                        console.log('Failed to disable zoom for frame:', err)
                    }))
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

    previous: () => {
        const activeSpace = spaces[spaceMeta.activeSpace]
        if (!activeSpace || !activeSpace.activeTabsOrder || activeSpace.activeTabsOrder.length < 2) {
            return false // No previous tab available
        }
        
        // Remove the current tab (at index 0) from the order
        activeSpace.activeTabsOrder.shift()
        
        // Pop pinned tabs and invalid tabs until we find a non-pinned tab
        let previousTabId = null
        let previousTab = null
        
        while (activeSpace.activeTabsOrder.length > 0) {
            const tabId = activeSpace.activeTabsOrder[0]
            const tab = activeSpace.tabs?.find(t => t.id === tabId)
            
            // If tab doesn't exist, pop it and continue
            if (!tab) {
                activeSpace.activeTabsOrder.shift()
                continue
            }
            
            // If tab is pinned, pop it and continue
            if (docs[tabId]?.pinned) {
                activeSpace.activeTabsOrder.shift()
                continue
            }
            
            // Found a non-pinned tab
            previousTabId = tabId
            previousTab = tab
            break
        }
        
        if (!previousTabId) {
            // No non-pinned previous tab found
            return false
        }
        
        // Clear last active non-pinned tab since we're switching to a non-pinned tab
        spaceMeta.lastActiveNonPinnedTabId = null
        
        // Set the previous tab as active
        spaceMeta.activeTabId = previousTab.id

        if (frames[previousTabId]) {
            frames[previousTabId].active = Date.now()
        }
        
        return true
    },

    newSpace: () => {
        const _id = `darc:space_${crypto.randomUUID()}`
        const space = {
            _id,
            spaceId: _id,
            type: 'space',
            order: Date.now(),
            created: Date.now(),
            color: projectColors[Object.keys(spaces).length % projectColors.length].color,
            name: 'Space ' + (Object.keys(spaces).length + 1)
        }

        db.put(space)

        db.put({
            _id: `darc:activity_${crypto.randomUUID()}`,
            type: 'activity',
            archive: 'history',
            action: 'space_create',
            spaceId: _id,
            name: 'Space ' + (Object.keys(spaces).length + 1),
            created: Date.now()
        })
    },

    deleteSpace: (spaceId) => {
        delete spaces[spaceId]
        spaceMeta.spaceOrder = spaceMeta.spaceOrder.filter(id => id !== spaceId)
        if (spaceMeta.activeSpace === spaceId) {
            spaceMeta.activeSpace = spaceMeta.spaceOrder[0] || null
        }
    },

    editSpace: (spaceId, data) => {
        spaces[spaceId] = data
    },

    pin({ tabId, pinned }) {
        const tab = docs[tabId]
        db.put({
            ...tab,
            pinned
        })
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
    
    newTab: async (spaceId, { url, title, opener, preview, lightbox, shouldFocus, pinned } = {}) => {
        // console.time('updt')
        const _id = `darc:tab_${crypto.randomUUID()}`

        const tab = {
            _id,
            id: _id,
            type: 'tab',
            spaceId,
            favicon: url ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64` : undefined,
            url: url || 'about:newtab',
            title: url ? title : 'New Tab',
            order: Date.now(),
            opener,
            preview: !!preview,
            archive: preview ? 'preview' : undefined,
            lightbox: !!lightbox,
            pinned
        }

        if (!spaces[spaceId].tabs?.length) {
            spaces[spaceId].tabs = []
        }

        if (!preview && !lightbox) {
            spaces[spaceId].tabs.push(tab)
        }
        
        docs[tab._id] = tab

        if (!$state.snapshot(frames[tab.id])) {
            frames[tab.id] = {}
        }
       
        frames[tab.id].initialLoad = true

        if (shouldFocus && !preview && !lightbox) {
            await tick()
            activate(_id)
        }

        db.put(tab)
        return tab
    },

    updateTab: async (tabId, { canvas, lightbox, preview, screenshot, favicon, title, url } = {}) => {
        const tab = docs[tabId]
       
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
                // Convert data URL to blob and store as attachment
                const response = await fetch(screenshot)
                const blob = await response.blob()
                
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
            await db.put({
                    ...tab,
                    ...newProps
                })
        }
    },

    permissionRequest: (tabId, event) => {
        let permission = permissions[event.permission]
        const origin = new URL(event.url).origin

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
            permission.origins[origin].requests.at(-1).timestamp = Date.now()
            return { granted }
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

        const latestRequest = permissionObj.origins[origin].requests.at(-1)
        if (latestRequest.status === 'requested') {
            latestRequest.status = 'granted'
            latestRequest.unseen = false
            latestRequest.needsReload = true
            latestRequest.timestamp = Date.now()
            
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

        // Find the latest request for this permission type and origin
        const latestRequest = permissionObj.origins[origin].requests.at(-1)
        if (latestRequest.status === 'requested') {
            // Update the request status
            latestRequest.status = 'denied'
            latestRequest.unseen = false
            latestRequest.needsReload = true
            latestRequest.timestamp = Date.now()
            
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

        const latestRequest = permissionObj.origins[origin].requests.at(-1)
        if (latestRequest.status === 'requested') {
            latestRequest.status = 'ignored'
            latestRequest.unseen = false
            latestRequest.timestamp = Date.now()
            
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
        if (newSpace?.activeTabsOrder?.length > 0) {
            // Find the first valid (non-closed, non-pinned) tab from the order
            let activated = false
            for (const tabId of newSpace.activeTabsOrder) {
                const tab = docs[tabId]
                if (tab && !tab.archive && !tab.pinned) {
                    activate(tabId)
                    activated = true
                    break
                }
            }
            if (!activated && newSpace?.tabs?.length > 0) {
                const firstNonPinned = newSpace.tabs.find(t => !t.pinned)
                if (firstNonPinned) {
                    activate(firstNonPinned.id)
                } else {
                    spaceMeta.activeTabId = null
                }
            }
        } else if (newSpace?.tabs?.length > 0) {
            // Fallback: activate the first non-pinned tab in the space
            const firstNonPinned = newSpace.tabs.find(t => !t.pinned)
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
        if (newSpace?.activeTabsOrder?.length > 0) {
            // Find the first valid (non-closed, non-pinned) tab from the order
            let activated = false
            for (const tabId of newSpace.activeTabsOrder) {
                const tab = docs[tabId]
                if (tab && !tab.archive && !tab.pinned) {
                    activate(tabId)
                    activated = true
                    break
                }
            }
            if (!activated && newSpace?.tabs?.length > 0) {
                const firstNonPinned = newSpace.tabs.find(t => !t.pinned)
                if (firstNonPinned) {
                    activate(firstNonPinned.id)
                } else {
                    spaceMeta.activeTabId = null
                }
            }
        } else if (newSpace?.tabs?.length > 0) {
            // Fallback: activate the first non-pinned tab in the space
            const firstNonPinned = newSpace.tabs.find(t => !t.pinned)
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
                    // Convert data URL to blob and store as attachment
                    const response = await fetch(screenshot)
                    const blob = await response.blob()
                    
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

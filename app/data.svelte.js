import PouchDB from 'pouchdb-browser'
import findPlugin from 'pouchdb-find'
import bootstrap from './bootstrap.js'
import testData from './test-data.js'
import { throttle } from './lib/utils.js'
// TODO: add user and session management
// import indexeddb from 'pouchdb-adapter-indexeddb'
// PouchDB.plugin(indexeddb)

import { colors as projectColors } from './lib/utils.js'

PouchDB.plugin(findPlugin)
const db = new PouchDB('darc', { adapter: 'idb' })

const sortOrder = ['archive', 'spaceId', 'type', 'order']

const docs = $state({})
const origins = $state({})
const spaces = $state({})
const activity = $state({})
const resources = $state({})
const frames = $state({})
const previews = $state({})
const settings = $state({})

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
    spaceOrder: [],
    closedTabs: [],
    activeTabId: localStorage.getItem('activeTabId') || null, // FIXME: use _local/ persistent active tab array
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
    const { docs: newDocs } = await db.find({
        selector: {
            archive: { $lt: 'deleted' },
            spaceId: spaceId ? spaceId : { $exists: true },
        },
        fields: initialLoad ? undefined : ['_id'],
        sort: sortOrder.map(key => ({ [key] : 'asc' })),
        limit: 4000
    }).catch(err => console.error(err))

    if (newDocs.length > 3000) {
        console.error('approaching max data size, needs paging and partition support now')
    }

    console.log({ newDocs, docs })

    let activeTabIdExists = false

    if (spaceId) {
        spaces[spaceId] ??= {}
        spaces[spaceId].tabs = []
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
                spaceMeta.activeSpace = doc._id
            }
            if (!spaces[doc._id]) {
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

            if (doc.id === spaceMeta.activeTabId) {
                activeTabIdExists = true
            }

            if (!spaces[doc.spaceId]) {
                spaces[doc.spaceId] = { _id: doc.spaceId, tabs: [] }
            }

            if (!spaces[doc.spaceId].tabs) {
                spaces[doc.spaceId].tabs = []
            }

            if (doc.archive) {
                // console.log(doc)
                if (doc.archive === 'closed') {
                    closedTabs.push(doc)
                }
                continue
            } else {
                if (doc.preview || doc.lightbox) {
                    previews[doc.opener] ??= { lightbox: null, tabs: [] }
                    previews[doc.opener].tabs.push(doc)
                    if (doc.lightbox) {
                        previews[doc.opener].lightbox = doc._id
                    }
                    continue
                }
                spaces[doc.spaceId].tabs.push(doc)
            }
        }
        //  else if (doc.type === 'activity') {
        //     activity[doc._id] = doc
        // } else if (doc.type === 'resource') {
        //     resources[doc._id] = doc
        // }
    }

    if (spaceMeta.activeTabId && !activeTabIdExists && spaces[spaceMeta.activeSpace]?.activeTabsOrder?.length > 0) {
        let previousIndex = 1
        spaces[spaceMeta.activeSpace].activeTabsOrder = spaces[spaceMeta.activeSpace].activeTabsOrder.filter((id, i) => {
            if (id === spaceMeta.activeTabId) {
                i > previousIndex && (previousIndex = i)
                return false
            }
            return true
        })
        spaceMeta.activeTabId = spaces[spaceMeta.activeSpace].activeTabsOrder[previousIndex - 1]
        console.log('setting active tab id b', spaceMeta.activeTabId)
    }

    spaceMeta.closedTabs = closedTabs.sort((a, b) => b.modified - a.modified)
    spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => (a.order || 2) - (b.order || 2)).map(space => space._id)
    
    initialLoad = false
}, 200)

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

    console.log('xxx change', change)
    // if (change.doc instanceof type.errors) {
    //     console.error(change.doc.summary, change.doc)
    //     return
    // }

    const oldDoc = docs[change.id]
    changes = [change, ...changes]
    if (editingId !== change.id) {
        docs[change.id] = change.doc

        // fixme: deep comp
        for (const key of ['canvas', 'pinned', ...sortOrder]) { // force reload until using docs store
            if (!oldDoc || (oldDoc[key] !== change.doc[key])) {
                if (change.doc.spaceId && change.doc.type !== 'space' && change.doc.type !== 'activity') {
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

    spaceMeta.activeTabId = tabId

    const activeSpace = spaces[spaceMeta.activeSpace]

    activeSpace.activeTabsOrder ??= []
    
    activeSpace.activeTabsOrder = activeSpace.activeTabsOrder[0] === tabId ? activeSpace.activeTabsOrder : [tabId, ...activeSpace.activeTabsOrder]

    if (frames[tabId]) {
        frames[tabId].active = Date.now()
    }  

    const tabDoc = docs[tabId]
    if (tabDoc) {
        return tabDoc || tabId // TODO: deprecate returning tab
    }
    
    return null
}

function closeTab (spaceId, tabId) {
    const tab = docs[tabId]

    frames[tabId].frame = null
   
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
    $effect(() => {
        if (!spaceMeta.activeSpace && Object.keys(spaces).length > 0) {
            // Set the first space as active
            const firstSpaceId = Object.keys(spaces)[0]
            spaceMeta.activeSpace = firstSpaceId

           
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
            localStorage.setItem('activeSpaceId', spaceMeta.activeSpace)
        }
    })

    $effect(() => {
        if (spaceMeta.activeTabId) {
            localStorage.setItem('activeTabId', spaceMeta.activeTabId)
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

function hibernate (tabId) {
    // remove background frames from dom node parking
    const frame = frames[tabId]
    if (frame.frame) {
        frame.frame.remove()
    }
    frames[tabId].frame = null
    frames[tabId].hibernated = Date.now()
}

export default {
    origins,
    spaceMeta,
    spaces,
    activity,
    resources,
    docs,
    frames,
    previews,
    settings,

    activate,
    loadSampleData,

    readPage: async (tabId) => {
        const frame = frames[tabId]

        if (!frame?.frame) {
            return 'Error: frame not active'
        }

        const result = await frame.frame.executeScript({code: 'document.body.innerHTML'})

        return result[0]
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

    previous: () => {
        const activeSpace = spaces[spaceMeta.activeSpace]
        if (!activeSpace || !activeSpace.activeTabsOrder || activeSpace.activeTabsOrder.length < 2) {
            return false // No previous tab available
        }
        
        // Get the previous tab ID (at index 1)
        const previousTabId = activeSpace.activeTabsOrder[1]
        
        // Find the tab to make sure it still exists
        const previousTab = activeSpace.tabs?.find(t => t.id === previousTabId)
        if (!previousTab) {
            // Previous tab doesn't exist anymore, clean up the order and try again
            activeSpace.activeTabsOrder = activeSpace.activeTabsOrder.filter(id => 
                activeSpace.tabs?.some(t => t.id === id)
            )
            return false
        }
        
        // Remove the current tab (at index 0) from the order
        activeSpace.activeTabsOrder.shift()
        
        // Set the previous tab as active
        spaceMeta.activeTabId = previousTab.id

        if (frames[previousTab]) {
            frames[previousTab].active = Date.now()
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

        if (frame.frame) {
            frame.frame.src = url
        } else {
            db.put({
                ...tab,
                url
            })
        }

        // db.put({
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
    
    newTab: (spaceId, { url, title, opener, preview, lightbox, shouldFocus } = {}) => {
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
            lightbox: !!lightbox
        }

        if (shouldFocus) {
            activate(_id)
        }

        db.put(tab)
        return tab
    },

    updateTab: (tabId, { canvas, lightbox, preview, screenshot, favicon, title, url } = {}) => {
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
            newProps.screenshot = screenshot

            // TODO: newProps._attachments ??= {}

            // newProps._attachments.screenshot = {
			// 	content_type: "image/png",
			// 	data: new Blob([yjs.encodeStateAsUpdate(winYDoc)], { type: 'image/png' })
			// }
        }

        if (Object.keys(newProps).length > 0) {
            db.put({
                    ...tab,
                    ...newProps
                })
        }
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
        if (spaceMeta.spaceOrder.length <= 1) {
            return false
        }
        
        const currentIndex = spaceMeta.spaceOrder.indexOf(spaceMeta.activeSpace)
        
        if (currentIndex > 0) {
            const newActiveSpace = spaceMeta.spaceOrder[currentIndex - 1]
            
            // Validate the space exists
            if (!spaces[newActiveSpace]) {
                console.warn('🔄 [DATA] previousSpace: target space does not exist:', newActiveSpace)
                return false
            }
            
            spaceMeta.activeSpace = newActiveSpace
            
            // Set the first tab of the new space as active
            const newSpace = spaces[newActiveSpace]
            if (newSpace?.tabs?.length > 0) {
                activate(newSpace.tabs[0].id)
            } else {
                spaceMeta.activeTabId = null
            }
            
            return true
        } else {
            return false
        }
    },

    nextSpace: () => {
        if (spaceMeta.spaceOrder.length <= 1) {
            return false
        }
        
        const currentIndex = spaceMeta.spaceOrder.indexOf(spaceMeta.activeSpace)
        
        if (currentIndex < spaceMeta.spaceOrder.length - 1) {
            const newActiveSpace = spaceMeta.spaceOrder[currentIndex + 1]
            
            // Validate the space exists
            if (!spaces[newActiveSpace]) {
                return false
            }
            
            spaceMeta.activeSpace = newActiveSpace
            
            // Set the first tab of the new space as active
            const newSpace = spaces[newActiveSpace]
            if (newSpace?.tabs?.length > 0) {
                activate(newSpace.tabs[0].id)
            } else {
                spaceMeta.activeTabId = null
            }
            
            return true
        } else {
            return false
        }
    }
}

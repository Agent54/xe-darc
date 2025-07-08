import PouchDB from 'pouchdb-browser'
import findPlugin from 'pouchdb-find'
import bootstrap from './bootstrap.js'
import testData from './test-data.js'
// TODO: add user and session management
// import indexeddb from 'pouchdb-adapter-indexeddb'
// PouchDB.plugin(indexeddb)

const projectColors = [
    { name: "Magenta", color: "#b800bb" },
    { name: "Yellow", color: "#ffc100" },
    { name: "Green Apple", color: "#71be00" },
    { name: "Turquoise", color: "#00a3d6" },
    { name: "Red", color: "#d82b00" },
    { name: "Grape", color: "#8100ea" },
    { name: "Orange", color: "#ce9f00" },
    { name: "Swamp Green", color: "#91a400" },
    { name: "Ice Blue", color: "#74a4d7" },
    { name: "Peach", color: "#e46642" },
    { name: "Violet", color: "#ba6eff" },
    { name: "Pea Green", color: "#6e7306" },
    { name: "Tan", color: "#908675" },
    { name: "Aquamarine", color: "#008c8d" },
    { name: "Maroon", color: "#ac3f65" },
    { name: "Light Gray", color: "#cccccc" },
    { name: "Medium Gray", color: "#818182" },
    { name: "Dark Gray", color: "#555555" },
    { name: "Ocean Blue", color: "#155f8b" },
    { name: "Pink", color: "#ee61f0" },
]


PouchDB.plugin(findPlugin)
const db = new PouchDB('darc', { adapter: 'idb' })

const sortOrder = ['archive', 'spaceId', 'type', 'order']

const docs = $state({})

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

const closedTabs = $state([])
const origins = $state({})
const spaces = $state({})
const globalPins = $state([])
const activity = $state({})
const resources = $state({})
const frames = {}


console.log('starting garbage collector')
// garbage collect instances that are not in the tabs array every 15 minutes
setInterval(() => {
    Object.entries(frames).forEach(instance => {
        console.log('inspecting for gb instance', instance)
    })
}, 900000)

const spaceMeta = $state({
    activeSpace: localStorage.getItem('activeSpace') || null,
    spaceOrder: [],
    activeTab: null,
    config: {
        leftPinnedTabWidth: 400,
        rightPinnedTabWidth: 350,
        leftSidebarWidth: 320,
        rightSidebarWidth: 320
    }
})

let initialLoad = true
async function refresh(spaceId) {
    const { docs: newDocs } = await db.find({
        selector: {
            archive: { $lt: 'deleted' },
            spaceId: spaceId ? spaceId : { $exists: true },
        },
        fields: initialLoad ? undefined : ['_id'],
        sort: sortOrder.map(key => ({ [key] : 'asc' }))
    }).catch(err => console.error(err))

    console.log({newDocs})

    if (spaceId) {
        spaces[spaceId] ??= {}
        spaces[spaceId].tabs = []
    }

    for (const refreshDoc of newDocs) {
        let doc
        if (initialLoad) {
            docs[refreshDoc._id] = refreshDoc
            doc = refreshDoc 
        } else {
            doc = docs[refreshDoc._id]
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
            if (!spaces[doc.spaceId]) {
                spaces[doc.spaceId] = { _id: doc.spaceId, tabs: [] }
            }

            if (!spaces[doc.spaceId].tabs) {
                spaces[doc.spaceId].tabs = []
            }

            if (doc.archive) {
                console.log(doc)
                if (doc.archive === 'closed') {
                    closedTabs.push(doc)
                }
            } else {
                spaces[doc.spaceId].tabs.push(doc)
            }
            

            if (!spaceMeta.activeTab && doc.spaceId === spaceMeta.activeSpace) {
                spaceMeta.activeTab = doc
            }
        }
        //  else if (doc.type === 'activity') {
        //     activity[doc._id] = doc
        // } else if (doc.type === 'resource') {
        //     resources[doc._id] = doc
        // }
    }

    sortSpaces()
    initialLoad = false
}

function sortSpaces () {
    spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => (a.order || 2) - (b.order || 2)).map(space => space._id)
}

let lastLocalSeq = null
let changes = []
let editingId = null
db.changes({
    live: true,
    since: 'now',
    include_docs: true,
    filter: doc => !doc._id.startsWith('_design/')
}).on('change', async change => {
    lastLocalSeq = change.seq

    // if (change.doc instanceof type.errors) {
    //     console.error(change.doc.summary, change.doc)
    //     return
    // }

    const oldDoc = docs[change.id]
    changes = [change, ...changes]
    if (editingId !== change.id) {
        docs[change.id] = change.doc

        for (const key of sortOrder) {
            if (!oldDoc || (oldDoc[key] !== change.doc[key])) {
                if (change.doc.spaceId && change.doc.type !== 'space') {
                    refresh(change.doc.spaceId)
                } else if (change.doc.type === 'space') {
                    spaces[change.doc._id] = { ...spaces[change.doc._id], ...change.doc }
                    sortSpaces()
                } else {
                    console.warn('unknown change', change)
                }
                break
            }        
        }
    }
})

// Define activate function separately so it can be used internally
function activate(tabId) {    
    // Find the tab and set shouldFocus if it's a new tab
    const activeSpace = spaces[spaceMeta.activeSpace]
    if (activeSpace && activeSpace.tabs) {
        const tab = activeSpace.tabs.find(t => t.id === tabId)

        activeSpace.activeTabsOrder ??= []
        activeSpace.activeTabsOrder = [tabId, ...activeSpace.activeTabsOrder]

        spaceMeta.activeTab = tab

        if (tab && tab.url === 'about:newtab') {
            tab.shouldFocus = true
        }
        return tab
    }
    
    return null
}

$effect.root(() => {
    $effect(() => {
        if (!spaceMeta.activeSpace && Object.keys(spaces).length > 0) {
            // Set the first space as active
            const firstSpaceId = Object.keys(spaces)[0]
            spaceMeta.activeSpace = firstSpaceId
            
            // Set the first tab of that space as active
            const firstSpace = spaces[firstSpaceId]
            if (firstSpace?.tabs?.length > 0) {
                spaceMeta.activeTab = firstSpace.tabs[0]
            }
        }
    })

    // Save active space to localStorage whenever it changes
    $effect(() => {
        if (spaceMeta.activeSpace) {
            localStorage.setItem('activeSpace', spaceMeta.activeSpace)
        }
    })
})

function loadSampleData () {
    db.bulkDocs(testData).then((res) => {
        console.log('sample data loaded', res)
        refresh()
    })
}

export default {
    origins,
    spaceMeta,
    closedTabs,
    globalPins,
    spaces,
    activity,
    resources,
    docs,
    frames,

    activate,
    loadSampleData,

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
        spaceMeta.activeTab = previousTab
        
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

    navigate(tabId, url) {
        const tab = docs[tabId]
        db.put({
            ...tab,
            url
        })
        db.put({
            _id: `darc:activity_${crypto.randomUUID()}`,
            type: 'activity',
            action: 'visit',
            tabId: tab.id,
            spaceId: tab.spaceId,
            url,
            title: url.split('/').pop(),
            favicon: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`,
            created: Date.now()
        })
    },
    
    newTab: (spaceId, {url, title} = {}) => {
        const _id = `darc:tab_${crypto.randomUUID()}`

        const tab = {
            _id,
            id: _id,
            type: 'tab',
            spaceId,
            favicon: url ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64` : undefined,
            url: url || 'about:newtab',
            title: url ? title : 'New Tab',
            order: Date.now()
        }
        
        db.put(tab)
    },

    closeTab: (spaceId, tabId) => {
        const tab = docs[tabId]
       
        db.put({
            ...tab,
            closed: true, // legacy
            archive: 'closed',
            frame: undefined,
            wrapper: undefined
        })

        db.put({
            _id: `darc:activity_${crypto.randomUUID()}`,
            tabId: tab.id,
            spaceId: tab.spaceId,
            type: 'activity',
            action: 'close',
            url: tab.url,
            title: tab.title,
            favicon: tab.favicon,
            created: Date.now()
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
        // if (spaceMeta.activeTab?.id === tabId) {
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
    },

    clearClosedTabs: () => {
        // Update each closed tab to be marked as deleted
        const docsToUpdate = closedTabs.map(tab => ({
            ...tab,
            deleted: true,
            archive: 'deleted'
        }))
        
        if (docsToUpdate.length > 0) {
            db.bulkDocs(docsToUpdate).then((res) => {
                console.log('Closed tabs marked as deleted:', res)
            }).catch((err) => {
                console.error('Failed to delete closed tabs:', err)
            })
        }
        
        // Clear the closedTabs array
        closedTabs.length = 0
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
                spaceMeta.activeTab = null
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
                spaceMeta.activeTab = null
            }
            
            return true
        } else {
            return false
        }
    }
}

import PouchDB from 'pouchdb-browser'
import findPlugin from 'pouchdb-find'
import bootstrap from './bootstrap.js'
// TODO: add user and session management

const db = new PouchDB.plugin(findPlugin)('darc')

db.bulkDocs(bootstrap).then(() => {
    // console.log('bootstrap done', res)
})

const sortOrder = ['archived', 'type', 'spaceId', 'order']

const closedTabs = $state([])
const origins = $state({})
const spaces = $state({})
const globalPins = $state([])
const activity = $state({})
const resources = $state({})

const spaceMeta = $state({
    activeSpace: '1',
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
async function refresh() {
    const { docs: newDocs } = await db.find({
        selector: {
            archived: { $lt: true },
            type: { $exists: true },
        },
        fields: initialLoad ? undefined : ['_id'],
        sort: sortOrder.map(key => ({ [key] : 'asc' }))
    })

    for (const doc of newDocs) {
        if (doc.type === 'space') {
            if (!spaceMeta.activeSpace) {
                spaceMeta.activeSpace = doc._id
            }
            spaces[doc._id] = doc
        } else if (doc.type === 'tab') {
            doc.id = doc._id // legacy compat, remove this later
            // if (!spaces[doc.spaceId]) {
            //     spaces[doc.spaceId] = { _id: doc.spaceId, tabs: [] }
            // }
            if (!spaces[doc.spaceId].tabs) {
                spaces[doc.spaceId].tabs = []
            }
            spaces[doc.spaceId].tabs.push(doc)
            if (!spaceMeta.activeTab && doc.spaceId === spaceMeta.activeSpace) {
                spaceMeta.activeTab = doc
            }
        } else if (doc.type === 'activity') {
            activity[doc._id] = doc
        } else if (doc.type === 'resource') {
            resources[doc._id] = doc
        }
    }

    spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => (a.order || 0) - (b.order || 0)).map(space => space._id)

    initialLoad = false
}

db.createIndex({
    index: { fields: sortOrder }
}).then(() => {
   refresh()
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
    // Initialize with sample data if no activeSpace is set
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
})

export default {
    origins,
    spaceMeta,
    closedTabs,
    globalPins,
    spaces,
    activity,
    resources,

    activate,

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
        const space = {
            _id: `space-${Date.now()}`,
            id: `space-${Date.now()}`, // legacy compat
            order: Object.keys(spaces).length,
            tabs: []
        }
        spaces[space._id] = space
        spaceMeta.spaceOrder.push(space._id)
        return space
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
    
    newTab: (spaceId) => {
        const _id = crypto.randomUUID()

        const tab = {
            _id,
            id: _id, // legacy compat
            spaceId,
            url: 'about:newtab',
            title: 'New Tab',
            order: spaces[spaceId]?.tabs?.length || 0
        }
        
        if (!spaces[spaceId]) {
            return null
        }

        if (!spaces[spaceId].tabs) {
            spaces[spaceId].tabs = []
        }

        spaces[spaceId].tabs.unshift(tab)
        
        return tab
    },

    closeTab: (spaceId, tabId) => {
        const space = spaces[spaceId]
        if (!space || !space.tabs) {
            return { success: false, wasLastTab: false }
        }
        
        const tabIndex = space.tabs.findIndex(tab => tab.id === tabId)
        if (tabIndex === -1) {
            return { success: false, wasLastTab: false }
        }
        
        const tab = space.tabs[tabIndex]
        const wasLastTab = space.tabs.length === 1
        
        // Add to closed tabs before removing
        closedTabs.push({
            ...tab,
            closedAt: Date.now(),
            spaceId // Ensure spaceId is preserved
        })
        
        // Remove from space
        space.tabs.splice(tabIndex, 1)
        
        // If we closed the active tab, need to set a new active tab
        if (spaceMeta.activeTab?.id === tabId) {
            if (space.tabs.length > 0) {
                // Set the next tab as active, or the previous one if this was the last
                const newActiveIndex = Math.min(tabIndex, space.tabs.length - 1)
                const newActiveTabId = space.tabs[newActiveIndex]?.id || space.tabs[0]?.id
                activate(newActiveTabId)
            } else {
                spaceMeta.activeTab = null
            }
        }
        
        return { success: true, wasLastTab }
    },

    clearClosedTabs: () => {
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

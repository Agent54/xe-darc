import PouchDB from 'pouchdb-browser'
import findPlugin from 'pouchdb-find'
import bootstrap from './bootstrap.js'
// TODO: add user and session management

const db = new PouchDB.plugin(findPlugin)('darc')

db.bulkDocs(bootstrap).then(() => {
    // console.log('bootstrap done', res)
})

const sortOrder = ['archived', 'type', 'spaceId', 'order']

const origins = $state({})
const spaces = $state({})
const activity = $state({})
const resources = $state({})

const spaceMeta = $state({
    activeSpace: null,
    spaceOrder: [],
    activeTab: null
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
            if (!spaces[doc.spaceId]) {
                spaces[doc.spaceId] = { _id: doc.spaceId, tabs: [] }
            }
            if (!spaces[doc.spaceId].tabs) {
                spaces[doc.spaceId].tabs = []
            }
            spaces[doc.spaceId].tabs.push(doc)
            if (!spaceMeta.activeTab && doc.spaceId === spaceMeta.activeSpace) {
                spaceMeta.activeTab = doc._id
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

export default {
    origins,
    spaceMeta,
    spaces,
    activity,
    resources,

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
        const tab = {
            _id: `tab-${Date.now()}`,
            id: `tab-${Date.now()}`, // legacy compat
            spaceId,
            order: spaces[spaceId]?.tabs?.length || 0,
        }
        if (!spaces[spaceId]) {
            return null
        }
        if (!spaces[spaceId].tabs) {
            spaces[spaceId].tabs = []
        }
        spaces[spaceId].tabs.push(tab)
        return tab
    },
    closeTab: (spaceId, tabId) => {
        const space = spaces[spaceId]
        if (space && space.tabs) {
            space.tabs = space.tabs.filter(tab => tab.id !== tabId)
        }
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
            return true
        } else {
            return false
        }
    },


}

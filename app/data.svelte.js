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
            if (!spaceMeta. activeSpace) {
                spaceMeta.activeSpace = doc._id
            }
            spaces[doc._id] = doc
        } else if (doc.type === 'tab') {
            doc.id = doc._id // legacy compat, remove this later
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

    spaceMeta.spaceOrder = Object.values(spaces).sort((a, b) => a.order - b.order).map(space => space.id)

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
    resources
}

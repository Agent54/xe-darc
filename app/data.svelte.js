import PouchDB from 'pouchdb-browser'
import findPlugin from 'pouchdb-find'
import bootstrap from './bootstrap.js'
// TODO: add user and session management

const db = new PouchDB.plugin(findPlugin)('darc')

db.bulkDocs(bootstrap).then(() => {
    // console.log('bootstrap done', res)
})

const sortOrder = ['archived', 'type', 'space', 'order']

const origins = $state({})
const spaces = $state({})
const activity = $state({})
const resources = $state({})

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

    console.log(newDocs)

    for (const doc of newDocs) {
        if (doc.type === 'space') {
            spaces[doc._id] = doc
        } else if (doc.type === 'tab') {
            spaces[doc.space].tabs.push(doc)
        } else if (doc.type === 'activity') {
            activity[doc._id] = doc
        } else if (doc.type === 'resource') {
            resources[doc._id] = doc
        }
    }

    initialLoad = false
}

db.createIndex({
    index: { fields: sortOrder }
}).then(() => {
   refresh()
})

export default {
    origins,
    spaces,
    activity,
    resources
}

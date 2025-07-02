import PouchDB from 'pouchdb-browser'
import findPlugin from 'pouchdb-find'
// TODO: add user and session management

const db = new PouchDB.plugin(findPlugin)('darc')

const sortOrder = ['archived', 'done', 'order']
let filter = $state('')
db.createIndex({
    index: { fields: sortOrder }
}).then(() => {
    filter = 'active'
})

db.allDocs({
    include_docs: true
}).then(({ rows }) => {
    console.log(rows)
})

const origins = $state({})
const spaces = $state({})
const tabs = $state({})
const activity = $state({})
const resources = $state({})

export default {
    origins,
    spaces,
    tabs,
    activity,
    resources
}

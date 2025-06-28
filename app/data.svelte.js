import PouchDB from 'pouchdb-browser'
    // TODO: add user and session management
    const db = new PouchDB('darc')
    db.allDocs({
        include_docs: true
    }).then(({rows}) => {
        console.log(rows)
    })

    export default {}
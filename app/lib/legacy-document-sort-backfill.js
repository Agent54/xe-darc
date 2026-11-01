import { withDocumentSort } from './document-sort.js'

// TODO: Remove this file and its startup import/call once all existing databases
// have been backfilled with persisted sort fields.
export async function backfillDocumentSort(db) {
    const { rows } = await db.allDocs({ include_docs: true })
    const updates = rows.flatMap(({ doc }) => {
        if (!doc || doc._deleted || typeof doc.spaceId !== 'string' || doc._id.startsWith('_design/')) return []
        const prepared = withDocumentSort(doc)
        return prepared.sort === doc.sort ? [] : [prepared]
    })
    if (!updates.length) return
    const results = await db.bulkDocs(updates)
    for (const result of results) {
        if (!result.error) continue
        if (result.status !== 409) throw Object.assign(new Error(result.message || result.error), result)
        // Another window may already have backfilled or edited this document.
        while (true) {
            let current
            try {
                current = await db.get(result.id)
            } catch (error) {
                if (error.status === 404) break
                throw error
            }
            const prepared = withDocumentSort(current)
            if (prepared.sort === current.sort) break
            try {
                await db.put(prepared)
                break
            } catch (error) {
                if (error.status !== 409) throw error
            }
        }
    }
}

import assert from 'node:assert/strict'
import { withDocumentSort } from '../app/lib/document-sort.js'
import { backfillDocumentSort } from '../app/lib/legacy-document-sort-backfill.js'

Deno.test('persisted document sort uses explicit activity before manual order and leaves source timestamps intact', () => {
    for (const [doc, expected] of [
        [{ order: 100 }, -100],
        [{ order: 100, lastActivityAt: 200 }, -200],
        [{ order: 100, lastActivityAt: 50 }, -50],
        [{ order: 100, lastActivityAt: 0 }, 0],
        [{ order: 100, lastActivityAt: NaN }, -100],
        [{ order: 100, lastActiveAt: 1000 }, -100],
        [{ order: 100, lastActivityAt: -1 }, 1],
        [{}, 0]
    ]) {
        const prepared = withDocumentSort(doc)
        assert.equal(prepared.sort, expected)
        assert.equal(prepared.order, doc.order)
        assert.equal(Object.hasOwn(doc, 'sort'), false)
    }
})

Deno.test('sort backfill is idempotent, skips design documents and retries concurrent updates against their latest timestamps', async () => {
    const records = new Map([
        ['old', { _id: 'old', spaceId: 'space', order: 100 }],
        ['concurrent', { _id: 'concurrent', spaceId: 'space', order: 10 }],
        ['ready', { _id: 'ready', spaceId: 'space', order: 20, sort: -20 }],
        ['_design/generic', { _id: '_design/generic', spaceId: 'space' }]
    ])
    const writes = []
    let bulkCount = 0
    const db = {
        async allDocs() { return { rows: [...records.values()].map(doc => ({ doc: structuredClone(doc) })) } },
        async bulkDocs(docs) {
            bulkCount++
            return docs.map(doc => {
                if (doc._id === 'concurrent') {
                    records.set(doc._id, { ...records.get(doc._id), lastActivityAt: 500, _rev: '2' })
                    return { id: doc._id, error: 'conflict', status: 409 }
                }
                records.set(doc._id, doc)
                writes.push(doc)
                return { id: doc._id, rev: '2' }
            })
        },
        async get(id) { return structuredClone(records.get(id)) },
        async put(doc) { records.set(doc._id, doc); writes.push(doc) }
    }
    await backfillDocumentSort(db)
    assert.equal(records.get('old').sort, -100)
    assert.equal(records.get('concurrent').sort, -500)
    assert.equal(records.get('concurrent')._rev, '2')
    assert.equal(writes.length, 2)
    await backfillDocumentSort(db)
    assert.equal(bulkCount, 1)
    assert.equal(writes.length, 2)
})

import assert from 'node:assert/strict'
import { withDocumentSort } from '../app/lib/document-sort.js'

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

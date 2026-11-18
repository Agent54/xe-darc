import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, rm } from 'node:fs/promises'
import puppeteer from 'puppeteer'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite'))('esbuild')
const root = new URL('../', import.meta.url).pathname
const { outputFiles } = await build({
    stdin: {
        resolveDir: root,
        contents: `
            import PouchDB from 'pouchdb-browser'
            import findPlugin from 'pouchdb-find'
            import { withDocumentSort } from './app/lib/document-sort.js'
            PouchDB.plugin(findPlugin)
            window.testActivityView = async () => {
                const db = new PouchDB('tab-activity-test-' + crypto.randomUUID())
                const tab = (id, order, extra = {}) => ({ _id: id, type: 'tab', spaceId: 'space', archive: '', order, ...extra })
                try {
                    await db.bulkDocs([
                        ...Array.from({ length: 4005 }, (_, i) => tab('ordinary-' + i, i)),
                        tab('older', 1900000000000, { lastActivityAt: 1800000000000 }),
                        tab('newer', 9001, { lastActivityAt: 1800000000001 }),
                        tab('tied', 9002, { lastActivityAt: 1800000000001 }),
                        tab('fallback-newest', 1800000000002),
                        tab('zzzz-newest', 0, { lastActivityAt: 1900000000000 }),
                        tab('closed', 0, { archive: 'closed', lastActivityAt: 2000000000000 }),
                        tab('other-space', 0, { spaceId: 'other', lastActivityAt: 1900000000000 }),
                        tab('deleted', 0, { archive: 'deleted', lastActivityAt: 1900000000000 })
                    ].map(withDocumentSort))
                    const sortOrder = ['archive', 'spaceId', 'type', 'sort']
                    await db.createIndex({ index: { fields: sortOrder } })
                    const options = {
                        selector: { archive: { $lt: 'deleted' }, spaceId: 'space' },
                        sort: sortOrder.map(field => ({ [field]: 'asc' })),
                        limit: 4000
                    }
                    const first = await db.find(options)
                    const bump = await db.get('ordinary-4004')
                    await db.put(withDocumentSort({ ...bump, lastActivityAt: 1950000000000 }))
                    const updated = await db.find(options)
                    const indexes = await db.getIndexes()
                    return {
                        first: first.docs.slice(0, 5).map(doc => doc._id),
                        count: first.docs.length,
                        scopedCount: (await db.find({ ...options, limit: 10000 })).docs.length,
                        genericIndex: indexes.indexes.some(index => JSON.stringify(index.def.fields.map(field => Object.keys(field)[0])) === JSON.stringify(sortOrder)),
                        persistedSort: first.docs.every(doc => doc.sort === withDocumentSort(doc).sort),
                        excluded: first.docs.every(doc => !['other-space', 'deleted', 'closed'].includes(doc._id)),
                        bumped: updated.docs[0]._id,
                        fieldsOnly: (await db.find({ ...options, fields: ['_id'], limit: 1 })).docs,
                        preservedOrder: (await db.get('ordinary-4004')).order
                    }
                } finally {
                    await db.destroy()
                }
            }
        `
    },
    bundle: true,
    minify: true,
    write: false,
    format: 'iife',
    platform: 'browser'
})

const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html')
    res.end(req.url === '/test.js' ? outputFiles[0].text : '<!doctype html><script src="/test.js"></script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = `${root}.cache/tab-activity-browser-${crypto.randomUUID()}`
await mkdir(profile, { recursive: true })
let browser
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: profile })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const result = await page.evaluate(() => window.testActivityView())
    assert.deepEqual(result, {
        first: ['zzzz-newest', 'fallback-newest', 'newer', 'tied', 'older'],
        count: 4000, scopedCount: 4011, genericIndex: true, persistedSort: true, excluded: true,
        fieldsOnly: [{ _id: 'ordinary-4004' }],
        bumped: 'ordinary-4004', preservedOrder: 4004
    })
    console.log('Chromium/PouchDB: persisted document sorts, generic Mango index, fields-only queries and selection before the 4,000-document limit pass')
} finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true })
}

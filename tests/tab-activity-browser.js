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
            import { ensureTabActivityView, getActivityGroupTabs } from './app/lib/tab-activity.js'
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
                        tab('other-space', 0, { spaceId: 'other', lastActivityAt: 1900000000000 }),
                        tab('deleted', 0, { archive: 'deleted', lastActivityAt: 1900000000000 })
                    ])
                    await Promise.all([ensureTabActivityView(db), ensureTabActivityView(db)])
                    const options = { key: 'space', reduce: false, include_docs: true }
                    const first = await db.query('tab-activity/by_space', { ...options, include_docs: true })
                    const bump = await db.get('ordinary-4004')
                    await db.put({ ...bump, lastActivityAt: 1900000000000 })
                    const updated = await db.query('tab-activity/by_space', options)
                    return {
                        first: getActivityGroupTabs(first.rows.map(row => ({ ...row.doc, id: row.id })), {}, true).slice(0, 5).map(tab => tab.id),
                        count: first.rows.length,
                        includesDocs: first.rows.every(row => row.doc?._id === row.id),
                        excluded: first.rows.every(row => row.id !== 'other-space' && row.id !== 'deleted'),
                        bumped: getActivityGroupTabs(updated.rows.map(row => ({ ...row.doc, id: row.id })), {}, true)[0].id,
                        allCount: (await db.query('tab-activity/by_space', { reduce: false })).rows.length,
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
        first: ['fallback-newest', 'newer', 'tied', 'older', 'ordinary-4004'],
        count: 4009, allCount: 4010, includesDocs: true, excluded: true,
        bumped: 'ordinary-4004', preservedOrder: 4004
    })
    console.log('Chromium/PouchDB: simple space lookup, uncapped fetch, scoped filtering and in-memory activity sorting pass')
} finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true })
}

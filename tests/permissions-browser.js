import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { compile, compileModule } from 'svelte/compiler'
import puppeteer from 'puppeteer'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite'))('esbuild')
const root = new URL('../', import.meta.url).pathname
const fixture = compileModule(`
    import PouchDB from 'pouchdb-browser'
    import definitions from './app/lib/resourceTypes.js'
    import { createPermissionStore, permissionDescriptor } from './app/lib/permissions.js'
    import { withDocumentSort } from './app/lib/document-sort.js'
    const permissions = $state(Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, { ...value }])))
    const rules = $state({}), state = $state({ status: 'loading', error: null })
    const docs = $state({ page: { id: 'page', type: 'tab', url: 'https://site.example/page' } })
    const frame = { reload() {} }
    const frames = { page: { frame } }
    const db = new PouchDB(new URL(location.href).searchParams.get('db'))
    const store = createPermissionStore({ db, permissions, rules, state, instanceId: 'browser-test',
        putDocument: doc => db.put(withDocumentSort(doc)), getWindowId: () => 'window',
        getContext: () => ({ url: docs.page.url, partition: 'persist:myapp', frame }) })
    const feed = db.changes({ live: true, since: 'now', include_docs: true, conflicts: true }).on('change', change => store.ingest(change.doc))
    window.darcWindowId = 'window'
    const data = {
        docs, frames, permissions, permissionRules: rules, permissionState: state,
        spaceMeta: { activeTabId: 'page' },
        permissionSupported: type => !!permissionDescriptor(type),
        permissionDecision: (type, id, url) => store.decision(type, id, url),
        setPermissionDecision: (type, id, value) => store.setDecision(type, id, value),
        permissionRequest: (id, input) => store.request(id, input),
        allowPermission: (id, lifetime) => store.resolve(id, 'allow', lifetime === 'always' ? 'persistent' : lifetime === 'until-app-close' ? 'session' : 'once'),
        denyPermission: id => store.resolve(id, 'deny'), ignorePermission: id => store.resolve(id, 'ignore'),
        changePermission: resource => store.reset(resource), clearUnseenResourceFlags() {}, reloadCurrentTab() {},
        navigate(id, url) { window.navigations.push({ id, url }) }
    }
    window.fixture = { data, store, db, feed }
    export default data
`, { generate: 'client', filename: 'permission-fixture.svelte.js' }).js.code

const { outputFiles } = await build({
    stdin: { resolveDir: root, contents: `
        import { mount, flushSync } from 'svelte'
        import ResourcesPanel from './app/components/ResourcesPanel.svelte'
        import LightboxHeader from './app/components/LightboxHeader.svelte'
        import data from 'fixture-data'
        await window.fixture.store.ready
        window.flushSync = flushSync
        window.promotions = 0; window.denials = 0
        window.navigations = []
        const header = document.createElement('div')
        header.style.cssText = 'position:fixed;left:24px;top:40px;width:550px'
        document.body.append(header)
        mount(LightboxHeader, { target: header, props: {
            tab: { id: 'popup', opener: 'page', title: 'Popup example', url: 'https://popup.example/' },
            onMoveToTab: () => window.promotions++, onClose: () => window.denials++
        } })
        mount(ResourcesPanel, { target: document.body, props: { onClose() {}, openSidebars: new Set(['resources']) } })
        flushSync()
        window.fixtureReady = true
    ` },
    plugins: [{ name: 'permission-fixture', setup(builder) {
        builder.onResolve({ filter: /^(fixture-data)$|data\.svelte(\.js)?$/ }, () => ({ path: 'fixture-data', namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, resolveDir: root }))
        builder.onLoad({ filter: /\.svelte$/ }, async args => ({
            contents: compile(await readFile(args.path, 'utf8'), { generate: 'client', filename: args.path, css: 'injected' }).js.code,
            resolveDir: args.path.slice(0, args.path.lastIndexOf('/'))
        }))
    } }],
    bundle: true, write: false, format: 'esm', platform: 'browser', conditions: ['browser'], logLevel: 'silent'
})

const server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url.startsWith('/test.js') ? 'text/javascript' : 'text/html')
    res.end(req.url.startsWith('/test.js') ? outputFiles[0].text : '<!doctype html><style>body{background:#171717;color:#ddd;font-family:system-ui}button{font:inherit;background:transparent;color:inherit;border:0}svg{width:16px;height:16px}.sidebar{position:fixed;right:0;top:0;bottom:0;width:350px;overflow:auto}.tooltip-wrapper{display:inline-flex}</style><script type="module" src="/test.js"></script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = `${root}.cache/permissions-browser-${crypto.randomUUID()}`
await mkdir(profile, { recursive: true })
let browser
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: profile })
    const page = await browser.newPage()
    await page.setViewport({ width: 1100, height: 800 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const url = `http://127.0.0.1:${server.address().port}/?db=permission-test-${crypto.randomUUID()}`
    await page.goto(url)
    await page.waitForFunction(() => window.fixtureReady)
    await page.focus('[aria-label="Link and popup settings"]')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.popup-settings-menu')
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Open in new tab')
    await page.keyboard.press('Escape')
    assert.equal(await page.$('.popup-settings-menu'), null)
    await page.locator('[aria-label="Link and popup settings"]').click()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('darc-controlled-frame-mousedown')))
    await page.waitForFunction(() => document.querySelector('.popup-settings-menu') === null)
    const choose = async label => {
        await page.bringToFront()
        await page.locator('[aria-label="Link and popup settings"]').click()
        if (label === 'Open in new tab') {
            await page.screenshot({ path: `${root}.cache/permission-menu.png` })
        }
        await page.locator(`.popup-settings-menu button::-p-text(${label})`).click()
    }
    await choose('Open in new tab')
    await page.waitForFunction(() => window.promotions === 1)
    const document = await page.evaluate(async () => (await window.fixture.db.allDocs({ include_docs: true })).rows[0].doc)
    assert.equal(document.type, 'permission')
    assert.deepEqual(document.permission, { name: 'open-tab' })
    assert.equal(document.decision, 'allow')
    assert.equal('requests' in document, false)
    const peer = await browser.newPage()
    await peer.goto(url)
    await peer.waitForFunction(() => window.fixtureReady && window.fixture.data.permissionDecision('open-tab', 'page') === 'allow', { polling: 100 })
    await choose('Navigate in the same tab')
    await page.waitForFunction(() => window.navigations.length === 1 && window.denials === 1)
    assert.deepEqual(await page.evaluate(() => window.navigations), [{ id: 'page', url: 'https://popup.example/' }])
    await peer.waitForFunction(() => window.fixture.data.permissionDecision('open-tab', 'page') === 'same-tab', { polling: 100 })
    await page.reload()
    await page.waitForFunction(() => window.fixtureReady)
    assert.equal(await page.evaluate(() => window.fixture.data.permissionDecision('open-tab', 'page')), 'same-tab')
    await page.locator('[aria-label="Link and popup settings"]').click()
    assert.equal(await page.$eval('.popup-settings-menu button::-p-text(Navigate in the same tab)', button => button.getAttribute('aria-checked')), 'true')
    await page.keyboard.press('Escape')
    await choose('Deny')
    await page.waitForFunction(() => window.denials === 1)
    await peer.waitForFunction(() => window.fixture.data.permissionDecision('open-tab', 'page') === 'deny', { polling: 100 })
    await choose('Open in lightbox')
    await peer.waitForFunction(() => window.fixture.data.permissionDecision('open-tab', 'page') === 'ask', { polling: 100 })
    await choose('Open in new tab')
    await page.waitForFunction(() => window.promotions === 1)
    await choose('Open in lightbox')
    await page.evaluate(() => window.fixture.data.permissionRequest('page', { permission: 'geolocation', url: 'https://site.example/page' }))
    const locationCard = '.resource-card[data-permission-type="geolocation"]'
    await page.locator(`${locationCard} .accept-btn.dropdown`).click()
    await page.locator(`${locationCard} button::-p-text(Always allow)`).click()
    await page.waitForFunction(() => window.fixture.data.permissionDecision('geolocation', 'page') === 'allow')
    await page.reload()
    await page.waitForFunction(() => window.fixtureReady)
    assert.equal(await page.evaluate(() => window.fixture.data.permissionDecision('geolocation', 'page')), 'allow')
    await page.evaluate(() => window.fixture.data.permissionRequest('page', { permission: 'futurePermission', url: 'https://site.example/page' }))
    const unknownCard = '.resource-card[data-permission-type="futurePermission"]'
    await page.waitForSelector(unknownCard)
    assert.equal(await page.$eval(`${unknownCard} .accept-btn.main`, button => button.disabled), true)
    assert.equal(await page.$eval(`${unknownCard} .action-btn.mock`, button => button.disabled), true)
    assert.equal(await page.$eval(`${unknownCard} .action-btn.mock`, button => getComputedStyle(button).color), 'rgb(153, 153, 153)')
    await page.locator(`${unknownCard} .action-btn.mock`).hover()
    await page.waitForSelector('[role="tooltip"]')
    assert.equal(await page.$eval('[role="tooltip"]', element => element.textContent), 'Not implemented yet')
    await page.screenshot({ path: `${root}.cache/permissions-ui.png` })
    const conflict = await page.evaluate(async () => {
        const { db, store } = window.fixture
        const rule = (await db.allDocs({ include_docs: true })).rows.map(row => row.doc).find(doc => doc.permission?.name === 'geolocation')
        await db.put({ ...rule, _rev: '1-ffffffffffffffffffffffffffffffff', decision: 'deny',
            _revisions: { start: 1, ids: ['ffffffffffffffffffffffffffffffff'] } }, { new_edits: false })
        store.ingest(await db.get(rule._id, { conflicts: true }))
        const before = store.decision('geolocation', 'page')
        await store.setDecision('geolocation', 'page', 'deny')
        const saved = await db.get(rule._id, { conflicts: true })
        return { before, after: store.decision('geolocation', 'page'), conflicts: saved._conflicts || [] }
    })
    assert.deepEqual(conflict, { before: 'ask', after: 'deny', conflicts: [] })
    assert.deepEqual(errors, [])
    await peer.close()
    console.log('Chromium/PouchDB: header settings, cross-window updates, reset, restart persistence, conflict resolution, blocked unknown grants and disabled Mock tooltip pass')
} finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true })
}

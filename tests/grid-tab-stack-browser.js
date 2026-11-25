import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { rollup } from 'rollup'
import { compile, compileModule } from 'svelte/compiler'
import puppeteer from 'puppeteer'

const root = new URL('../', import.meta.url).pathname
const require = createRequire(import.meta.url)
const modules = {
    entry: `
        import { mount, flushSync } from 'svelte'
        import GridView from './app/components/GridView.svelte'
        import data from 'fixture-data'
        window.data = data
        window.actions = []
        window.viewChanges = 0
        window.setActiveTab = id => flushSync(() => { data.spaceMeta.activeTabId = id })
        window.setGroupMetadata = (id, properties) => flushSync(() => {
            Object.assign(data.docs['darc:tabgroup_' + id], properties)
        })
        mount(GridView, { target: document.body, props: {
            onTabActivate: tab => window.actions.push(['activate', tab.id]),
            onTabClose: tab => window.actions.push(['close', tab.id]),
            onViewModeChange: () => { window.viewChanges++ },
            onSpaceSwitch: id => { data.spaceMeta.activeSpace = id }
        } })
    `,
    'fixture-data': compileModule(`
        import { getTabGroups, tabGroupMetadataId } from './app/lib/tab-groups.js'
        const tab = (id, title, tabGroupId, order, tabGroupOrder = 0) => ({
            id, title, type: 'tab', spaceId: 'work', tabGroupId, order, tabGroupOrder,
            url: 'https://example.com/' + id,
            favicon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#91a9bb"/></svg>',
            screenshot: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#15191c"/><text x="32" y="60" fill="#b7c1c8" font-size="22">' + title + '</text><path d="M32 96H540M32 128H490M32 160H520" stroke="#2c343a" stroke-width="8"/></svg>')
        })
        const research = ['Overview', 'Design notes', 'Components', 'Typography', 'Interaction patterns', 'Accessibility', 'Prototype', 'Review']
            .map((title, index) => tab('research-' + index, title, 'research', 1, index))
        const reading = ['Reading list', 'Saved article', 'Reference'].map((title, index) => tab('reading-' + index, title, 'reading', 2, index))
        const data = $state({
            docs: {}, frames: {}, origins: {},
            spaceMeta: { spaceOrder: ['work', 'personal'], activeSpace: 'work', activeTabId: 'research-6' },
            spaces: {
                work: { name: 'Work', color: '#91a9bb', activeTabsOrder: ['research-6'], tabs: [
                    ...research, ...reading, tab('outside', 'Project dashboard', null, 3)
                ] },
                personal: { name: 'Personal', color: '#b69e80', tabs: [tab('personal', 'Personal dashboard', null, 1)] }
            }
        })
        for (const space of Object.values(data.spaces)) for (const tab of space.tabs) data.docs[tab.id] = tab
        data.docs[tabGroupMetadataId('research')] = { name: 'Research', favicon: '<svg viewBox="0 0 16 16" data-custom-group-icon="research"><path d="M2 2h12v12H2z"/></svg>' }
        data.docs[tabGroupMetadataId('reading')] = { name: 'Reading', emoji: '📚' }
        data.getSpacePins = () => []
        data.getTabGroups = id => getTabGroups(data.spaces[id].tabs, [data.spaceMeta.activeTabId], data.docs)
        data.getGroupActiveTab = group => group.tabs.find(tab => tab.id === data.spaceMeta.activeTabId) || group.tabs[0]
        data.getAttachmentUrl = async src => src
        export default data
    `, { generate: 'client' }).js.code,
    'fixture-env': 'export const BROWSER = true, DEV = false, BUILD = false'
}

const bundle = await rollup({
    input: 'entry',
    onwarn(warning) {
        if (warning.code !== 'CIRCULAR_DEPENDENCY') throw new Error(warning.message)
    },
    plugins: [{
        name: 'grid-tab-stack-fixture',
        resolveId(source, importer) {
            if (source in modules) return source
            if (source === 'esm-env') return 'fixture-env'
            if (source.endsWith('/data.svelte.js')) return 'fixture-data'
            if (source === 'svelte') return require.resolve('svelte').replace('index-server.js', 'index-client.js')
            if (source.startsWith('.')) return resolve(importer?.startsWith('/') ? dirname(importer) : root, source)
            if (source === 'clsx') return createRequire(importer).resolve(source).replace(/\.js$/, '.mjs')
            return createRequire(importer?.startsWith('/') ? importer : import.meta.url).resolve(source)
        },
        load(id) {
            if (id in modules) return modules[id]
            const source = Deno.readTextFileSync(id)
            if (id.endsWith('.svelte')) return compile(source, { filename: id, generate: 'client', css: 'injected' }).js.code
            if (id.endsWith('.svelte.js')) return compileModule(source, { filename: id, generate: 'client' }).js.code
            return source
        }
    }]
})
const { output } = await bundle.generate({ format: 'es' })
await bundle.close()
const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
    if (new URL(request.url).pathname === '/fixture.js') {
        return new Response(output[0].code, { headers: { 'content-type': 'text/javascript' } })
    }
    return new Response(`<!doctype html><style>${Deno.readTextFileSync(`${root}app/menus.css`)}</style><style>*,::before,::after{box-sizing:border-box}body{margin:0;background:#000;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,sans-serif}</style><body><script type="module" src="/fixture.js"></script>`, {
        headers: { 'content-type': 'text/html' }
    })
})

let browser
const profile = `${root}.cache/grid-tab-stack-browser-${crypto.randomUUID()}`
const errors = []
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: profile })
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewport({ width: 1280, height: 900 })
    await page.goto(`http://127.0.0.1:${server.addr.port}`)
    await page.waitForSelector('[data-tab-id="research-6"] .attachment-image')
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.grid-view')), true, 'opening takes keyboard focus away from page content')
    assert.equal(await page.$('dialog[open], .inline-group'), null, 'groups remain inside the grid')
    assert.ok(await page.$('[aria-label="Research, 8 tabs"] [data-custom-group-icon="research"]'), 'the group displays its custom favicon')
    assert.equal(await page.$eval('[aria-label="Reading, 3 tabs"] .title-text', title => title.textContent), 'Reading', 'collapsed groups display their custom title')
    assert.equal(await page.$eval('[aria-label="Reading, 3 tabs"] .custom-group-icon', icon => icon.textContent), '📚')
    assert.equal(await page.$eval('[aria-label="Research, 8 tabs"]', group => getComputedStyle(group).gridColumn), 'auto')
    assert.equal(await page.$eval('[aria-label="Research, 8 tabs"] .stack-carousel', row => {
        const card = row.querySelector('.current').getBoundingClientRect()
        const viewport = row.getBoundingClientRect()
        const left = row.firstElementChild.getBoundingClientRect()
        const right = row.querySelector('[data-tab-id="research-7"]').getBoundingClientRect()
        return Math.abs((card.left + card.right) / 2 - (viewport.left + viewport.right) / 2) < 1 &&
            Math.abs((left.right - viewport.left) / left.width - .15) < .01 &&
            Math.abs((viewport.right - right.left) / right.width - .15) < .01
    }), true, 'the current member is centered with fifteen percent of each neighbor visible')
    assert.equal(await page.$$eval('[aria-label="Research, 8 tabs"] .carousel-card', cards => cards.length), 3, 'only the virtual window is mounted')
    await page.screenshot({ path: `${root}.cache/grid-tab-stack-desktop.png` })

    // Mouse down activates immediately, mouse up does not activate a second time.
    const preview = await page.$('[data-tab-id="research-6"]')
    const rect = await preview.boundingBox()
    await page.mouse.move(rect.x + 50, rect.y + 50)
    await page.mouse.down()
    assert.deepEqual(await page.evaluate(() => window.actions), [], 'the already active member only closes the grid')
    assert.equal(await page.evaluate(() => window.viewChanges), 1)
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.viewChanges), 1)
    await page.mouse.click(rect.x + 50, rect.y + 50, { button: 'right' })
    assert.equal(await page.evaluate(() => window.viewChanges), 1)
    await preview.focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => window.viewChanges), 2, 'keyboard activation is preserved')
    await page.keyboard.press('ArrowLeft')
    assert.equal(await page.evaluate(() => document.activeElement.dataset.tabId), 'research-5', 'arrow navigation transfers focus to the new centered member')
    await page.keyboard.press('Home')
    assert.equal(await page.evaluate(() => document.activeElement.dataset.tabId), 'research-0')
    await page.keyboard.press('End')
    assert.equal(await page.evaluate(() => document.activeElement.dataset.tabId), 'research-7')
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.actions), [['activate', 'research-7']])

    await page.mouse.move(0, 0)
    const groupBounds = await (await page.$('[aria-label="Research, 8 tabs"]')).boundingBox()
    await page.mouse.move(groupBounds.x + groupBounds.width * .4, groupBounds.y + 70)
    await page.waitForSelector('[aria-label="Research, 8 tabs"].scrubbing')
    const before = await page.$eval('[aria-label="Research, 8 tabs"] .current', card => card.getBoundingClientRect().left)
    await page.mouse.move(groupBounds.x + groupBounds.width * .41, groupBounds.y + 70)
    const after = await page.$eval('[aria-label="Research, 8 tabs"] .current', card => card.getBoundingClientRect().left)
    assert.ok(Math.abs(after - before) > 1, 'long-hover movement scrolls continuously within a member instead of paging')
    assert.equal(await page.$$eval('[aria-label="Research, 8 tabs"] .carousel-card', cards => cards.length), 3)

    await page.mouse.move(0, 0)
    await page.evaluate(() => window.setGroupMetadata('reading', { name: 'Saved reading', emoji: null, favicon: '<svg viewBox="0 0 16 16" data-custom-group-icon="reading"><circle cx="8" cy="8" r="6"/></svg>' }))
    assert.equal(await page.$eval('[aria-label="Saved reading, 3 tabs"] .title-text', title => title.textContent), 'Saved reading', 'metadata edits update an open grid')
    assert.ok(await page.$('[aria-label="Saved reading, 3 tabs"] .custom-group-icon [data-custom-group-icon="reading"]'))
    await page.evaluate(() => window.setGroupMetadata('reading', { name: null, favicon: null }))
    assert.equal(await page.$eval('[aria-label="Reading list, 3 tabs"] .title-text', title => title.textContent), 'Reading list', 'clearing a custom title restores the member title')
    assert.equal(await page.$('[aria-label="Reading list, 3 tabs"] .custom-group-icon'), null)
    await page.evaluate(() => window.setGroupMetadata('reading', { name: 'Reading', emoji: '📚' }))

    // Scope changes keep every group in the same grid flow.
    const scope = await (await page.$('.grid-scope-toggle')).boundingBox()
    await page.mouse.move(scope.x + 10, scope.y + 10)
    await page.mouse.down()
    assert.equal(await page.$eval('.grid-scope-toggle', button => button.getAttribute('aria-pressed')), 'true', 'scope switches on mousedown')
    await page.mouse.up()
    assert.equal(await page.$eval('.grid-scope-toggle', button => button.getAttribute('aria-pressed')), 'true', 'release never toggles twice')
    assert.equal(await page.$('dialog[open], .inline-group'), null)
    await page.click('.grid-scope-toggle')

    // The group containing the active tab follows changes while the grid is open.
    await page.evaluate(() => window.setActiveTab('reading-1'))
    await page.waitForSelector('[data-tab-id="reading-1"].current')
    assert.equal(await page.$('dialog[open], .inline-group'), null)
    await page.evaluate(() => window.setActiveTab('research-6'))
    await page.waitForSelector('[data-tab-id="research-6"].current .attachment-image')
    await page.setViewport({ width: 390, height: 844 })
    await page.waitForFunction(() => document.querySelector('.stack-carousel').clientWidth < 390)
    assert.equal(await page.$eval('.grid-tab-group', group => {
        const bounds = group.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= innerWidth && group.scrollWidth <= group.clientWidth
    }), true, 'the carousel fits a narrow viewport')
    await page.screenshot({ path: `${root}.cache/grid-tab-stack-mobile.png` })
    const changes = await page.evaluate(() => window.viewChanges)
    await (await page.$('[data-tab-id="research-6"].current')).focus()
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => window.viewChanges), changes + 1, 'Escape closes the grid from a focused tile')
    assert.deepEqual(errors, [])
    console.log('Grid groups: virtual carousel, centered current member, fifteen percent neighbors, continuous long-hover scrolling, mousedown, keyboard, metadata, scopes and mobile layout passed')
} finally {
    await browser?.close()
    await server.shutdown()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
}

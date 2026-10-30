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
        data.docs[tabGroupMetadataId('research')] = { name: 'Research' }
        data.docs[tabGroupMetadataId('reading')] = { name: 'Reading' }
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
    return new Response('<!doctype html><style>*,::before,::after{box-sizing:border-box}body{margin:0;background:#000;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,sans-serif}</style><body><script type="module" src="/fixture.js"></script>', {
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
    await page.waitForSelector('.inline-group [data-tab-id="research-6"] .attachment-image')
    assert.equal(await page.$('dialog[open]'), null, 'the active group opens inline without a modal')
    assert.equal(await page.$('.inline-group .collapse-button'), null, 'the current group cannot be collapsed')
    assert.equal(await page.$eval('.inline-group', group => getComputedStyle(group).gridColumn), '1 / -1')
    assert.equal(await page.$eval('.inline-tabs', row => {
        const card = row.querySelector('.active').getBoundingClientRect()
        const viewport = row.getBoundingClientRect()
        return row.scrollWidth > row.clientWidth && row.scrollLeft > 0 && card.left >= viewport.left && card.right <= viewport.right
    }), true, 'the active tab near the end is revealed inside the scrollable row')
    assert.ok(await page.$$eval('.inline-tabs .attachment-image', images => images.length < 8), 'offscreen screenshots remain lazy')

    await page.evaluate(() => { document.querySelector('.inline-tabs').scrollLeft = 0 })
    await page.waitForSelector('[data-tab-id="research-0"] .attachment-image')
    assert.equal(await page.$eval('.spaces-content', el => el.scrollLeft), 0, 'scrolling a group does not change spaces')
    await page.screenshot({ path: `${root}.cache/grid-tab-stack-desktop.png` })

    // Mouse down activates immediately, mouse up does not activate a second time.
    const preview = await page.$('[data-tab-id="research-0"] .card-preview')
    const rect = await preview.boundingBox()
    await page.mouse.move(rect.x + 50, rect.y + 50)
    await page.mouse.down()
    assert.deepEqual(await page.evaluate(() => window.actions), [['activate', 'research-0']])
    assert.equal(await page.evaluate(() => window.viewChanges), 1)
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.viewChanges), 1)
    await page.mouse.click(rect.x + 50, rect.y + 50, { button: 'right' })
    assert.equal(await page.evaluate(() => window.viewChanges), 1)
    await preview.focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => window.viewChanges), 2, 'keyboard activation is preserved')

    await page.hover('[aria-label="Reading, 3 tabs"]')
    await page.click('[aria-label="Expand Reading"]')
    await page.waitForSelector('[aria-label="Reading, 3 tabs"].inline-group')
    assert.equal(await page.$('dialog[open]'), null)
    await page.click('[aria-label="Collapse Reading"]')
    await page.waitForSelector('[aria-label="Expand Reading"]')
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Expand Reading', 'collapse restores keyboard focus')
    assert.equal(await page.evaluate(() => window.viewChanges), 2, 'expanding and collapsing never closes the overview')

    // Scope changes retain the modal behavior for All Spaces.
    await page.click('.grid-scope-toggle')
    await page.waitForFunction(() => !document.querySelector('.inline-group'))
    await page.hover('[aria-label="Research, 8 tabs"]')
    await page.click('[aria-label="Expand Research"]')
    await page.waitForSelector('dialog[open] [data-tab-id="research-6"] .attachment-image')
    assert.equal(await page.$eval('dialog[open]', dialog => document.activeElement === dialog), true, 'opening a group focuses the dialog instead of outlining Close')
    await page.$eval('dialog[open]', dialog => Promise.all(dialog.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: `${root}.cache/grid-tab-stack-modal.png` })
    await page.keyboard.press('Tab')
    assert.equal(await page.$eval('dialog[open] .dismiss-button', button => {
        const style = getComputedStyle(button)
        return document.activeElement === button && style.outlineStyle === 'solid' && style.borderRadius === '50%'
    }), true, 'Tab reaches Close with a visible round focus ring')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('dialog[open]'))
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Expand Research', 'Escape restores focus to the group opener')
    await page.keyboard.press('Enter')
    await page.waitForSelector('dialog[open]')
    assert.equal(await page.$eval('dialog[open]', dialog => document.activeElement === dialog), true, 'keyboard opening also starts focus on the dialog')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('dialog[open]'))
    await page.click('.grid-scope-toggle')
    await page.waitForSelector('.inline-group [data-tab-id="research-6"] .attachment-image')

    // The group containing the active tab follows changes while the grid is open.
    await page.evaluate(() => window.setActiveTab('reading-1'))
    await page.waitForSelector('[aria-label="Reading, 3 tabs"].inline-group .current-group-label')
    assert.equal(await page.$('[aria-label="Research, 8 tabs"].inline-group'), null)
    await page.evaluate(() => window.setActiveTab('research-6'))
    await page.waitForSelector('.inline-group [data-tab-id="research-6"] .attachment-image')
    await page.setViewport({ width: 390, height: 844 })
    await page.waitForFunction(() => document.querySelector('.inline-tabs').clientWidth < 390)
    assert.equal(await page.$eval('.inline-group', group => {
        const bounds = group.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= innerWidth && group.scrollWidth <= group.clientWidth
    }), true, 'the expanded group fits a narrow viewport')
    await page.$eval('.inline-tabs', row => { row.scrollLeft = row.scrollWidth })
    await page.waitForSelector('[data-tab-id="research-7"] .attachment-image')
    assert.equal(await page.$eval('.inline-tabs', row => {
        const card = row.lastElementChild.getBoundingClientRect()
        const viewport = row.getBoundingClientRect()
        return card.right <= viewport.right && card.left >= viewport.left
    }), true, 'the last card is fully reachable on a narrow screen')
    await page.screenshot({ path: `${root}.cache/grid-tab-stack-mobile.png` })
    assert.deepEqual(errors, [])
    console.log('Grid groups: inline rows, active group expansion, lazy scrolling, mousedown, keyboard, scope changes, modal fallback and mobile layout passed')
} finally {
    await browser?.close()
    await server.shutdown()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
}

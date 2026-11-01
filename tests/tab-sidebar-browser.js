import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, rm } from 'node:fs/promises'
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
        import TabSidebar from './app/components/TabSidebar.svelte'
        import TabDragIndicator from './app/components/TabDragIndicator.svelte'
        import data from 'fixture-data'
        import { onDrop, tabDrag } from './app/lib/tab-drag.svelte.js'
        window.data = data
        window.tabDrag = tabDrag
        window.activate = id => flushSync(() => data.activate(id))
        window.pin = (id, fixed) => flushSync(() => data.pinSidebarTab({ tabId: id, fixed }))
        window.unpin = id => flushSync(() => { data.docs[id].sidebarPinned = null })
        onDrop(event => {
            if (event.type === 'pin' && event.pinScope.startsWith('sidebar')) {
                data.pinSidebarTab({ ...event, fixed: event.pinScope === 'sidebar-fixed' })
            } else if (event.type === 'reorder') {
                data.docs[event.tabId].sidebarPinned = null
            }
        })
        mount(TabSidebar, { target: document.body, props: {
            tabSidebarVisible: true, customTabSidebarWidth: 280, showUrl: false
        } })
        mount(TabDragIndicator, { target: document.body })
    `,
    'fixture-data': compileModule(`
        import { getSidebarItems, getTabGroup, getSidebarPinnedTabs, orderBetween } from './app/lib/tab-groups.js'
        const tab = (id, order, extra = {}) => ({ id, order, type: 'tab', title: id,
            spaceId: 'work', url: 'about:blank', ...extra })
        const tabs = [tab('saved', -1, { sidebarPinned: true }),
            tab('left-app', -2, { pinned: 'left', pinScope: 'space' }),
            tab('right-app', -3, { pinned: 'right', pinScope: 'space' }),
            ...Array.from({ length: 35 }, (_, i) => tab('tab-' + i, i))]
        const data = $state({
            docs: {}, frames: {}, origins: {}, ui: { tabActivityMode: false },
            spaceMeta: { spaceOrder: ['work', 'personal'], activeSpace: 'work', activeTabId: 'tab-0', globalPins: [tab('global-app', 0, { pinned: 'left', pinScope: 'global' })], closedTabs: [] },
            spaces: {
                work: { name: 'Work', tabs, activeTabsOrder: ['tab-0'] },
                personal: { name: 'Personal', tabs: [tab('personal', 0, { spaceId: 'personal' })], activeTabsOrder: [] }
            }
        })
        for (const space of Object.values(data.spaces)) for (const tab of space.tabs) data.docs[tab.id] = tab
        data.getSpacePins = id => data.spaces[id].tabs.filter(tab => tab.pinned && tab.pinScope === 'space')
        data.isTabHibernated = () => false
        data.getSidebarItems = id => getSidebarItems(data.spaces[id].tabs)
        data.getTabGroup = (id, space = 'work') => getTabGroup(data.spaces[space].tabs, id)
        data.getGroupActiveTab = group => group.tabs.find(tab => tab.id === data.spaceMeta.activeTabId) || group.tabs[0]
        data.activateSpace = id => { data.spaceMeta.activeSpace = id }
        data.activate = id => { data.spaceMeta.activeTabId = id }
        data.previous = () => {}
        data.pinSidebarTab = ({ tabId, fixed, beforeTabId, afterTabId }) => {
            const tab = data.docs[tabId]
            const pins = getSidebarPinnedTabs(data.spaces[tab.spaceId].tabs, fixed)
            tab.sidebarPinOrder = beforeTabId || afterTabId
                ? orderBetween(data.docs[beforeTabId], data.docs[afterTabId], 'sidebarPinOrder')
                : Math.max(0, ...pins.map(tab => tab.sidebarPinOrder || 0)) + 1
            tab.sidebarPinned = fixed ? 'fixed' : true
        }
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
        name: 'tab-sidebar-fixture',
        resolveId(source, importer) {
            if (source in modules) return source
            if (source === 'esm-env') return 'fixture-env'
            if (source.endsWith('/data.svelte.js')) return 'fixture-data'
            if (source === 'svelte') return require.resolve('svelte').replace('index-server.js', 'index-client.js')
            if (source.startsWith('.')) return resolve(importer?.startsWith('/') ? dirname(importer) : root, source)
            if (source === 'clsx') return createRequire(importer).resolve(source).replace(/\.js$/, '.mjs')
            return createRequire(importer?.startsWith('/') ? importer : import.meta.url).resolve(source)
        },
        async load(id) {
            if (id in modules) return modules[id]
            const source = await readFile(id, 'utf8')
            if (id.endsWith('.svelte')) return compile(source, { filename: id, generate: 'client', css: 'injected' }).js.code
            if (id.endsWith('.svelte.js')) return compileModule(source, { filename: id, generate: 'client' }).js.code
            return source
        }
    }]
})
const { output } = await bundle.generate({ format: 'es' })
await bundle.close()
const menuStyles = await readFile(`${root}app/menus.css`, 'utf8')
const server = createServer((request, response) => {
    response.setHeader('Content-Type', request.url === '/fixture.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/fixture.js' ? output[0].code : `<!doctype html><style>${menuStyles}</style><style>
        *,::before,::after{box-sizing:border-box}body{margin:0;background:#111;color:#eee;font-family:system-ui}
        button{font:inherit;color:inherit}svg{width:20px;height:20px}.flex-1{flex:1;min-height:0}
    </style><body><script type="module" src="/fixture.js"></script>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

const profile = `${root}.cache/tab-sidebar-browser-${crypto.randomUUID()}`
let browser
const errors = []
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: profile })
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewport({ width: 1100, height: 800 })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.waitForSelector('.tabs-list [data-tab-id="tab-0"]')
    const space = '.space-content[data-space-id="work"]'
    const headerGeometry = () => page.evaluate(selector => [
        '.sidebar-header', '.spaces-container',
        selector + ' .space-title-container',
        selector + ' [data-tab-id="left-app"]',
        selector + ' [data-tab-id="right-app"]',
        selector + ' .new-tab-row'
    ].map(selector => {
        const r = document.querySelector(selector).getBoundingClientRect()
        return { top: r.top, bottom: r.bottom }
    }), space)
    const originalHeader = await headerGeometry()
    const title = `${space} .space-title-container`
    const waitForTitleOpacity = value => page.waitForFunction((selector, expected) =>
        Number(getComputedStyle(document.querySelector(selector)).opacity) === expected, {}, title, value)
    await page.mouse.move(900, 700)
    await waitForTitleOpacity(0)

    const tabBounds = await page.$eval(`${space} [data-tab-id="tab-3"]`, el => {
        const r = el.getBoundingClientRect()
        return { x: r.left + 30, y: r.top + r.height / 2 }
    })
    await page.mouse.move(tabBounds.x, tabBounds.y)
    await page.mouse.wheel({ deltaY: 120 })
    await page.waitForFunction(selector => document.querySelector(selector).scrollTop > 0, {}, space)
    assert.deepEqual(await headerGeometry(), originalHeader, 'wheel scrolling keeps the title, app pins, sidepins and upper sidebar fixed')
    assert.equal(await page.$eval(title, el => el.classList.contains('titles-visible')), false,
        'scrolling tabs down does not reveal space titles')
    await page.mouse.wheel({ deltaY: -120 })
    await page.waitForFunction(selector => document.querySelector(selector).scrollTop === 0, {}, space)
    assert.equal(await page.$eval(title, el => el.classList.contains('titles-visible')), false,
        'scrolling tabs up does not reveal space titles')
    await page.mouse.move(900, 700)

    await page.hover(title)
    await waitForTitleOpacity(1)
    await page.mouse.move(900, 700)
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.equal(await page.$eval(title, el => getComputedStyle(el).opacity), '1',
        'the title stays visible during the hover leave delay')
    await page.hover(title)
    await new Promise(resolve => setTimeout(resolve, 700))
    assert.equal(await page.$eval(title, el => getComputedStyle(el).opacity), '1',
        'hovering again cancels the pending hide')
    await page.mouse.move(900, 700)
    await waitForTitleOpacity(0)

    await page.$eval('.tab-content-container', el => { el.scrollLeft = el.clientWidth + 20 })
    await waitForTitleOpacity(1)
    await waitForTitleOpacity(0)
    await page.$eval('.tab-content-container', el => { el.scrollLeft = 0 })
    await waitForTitleOpacity(0)

    const fixed = `${space} [data-pin-scope="sidebar-fixed"]`
    const scrolling = `${space} [data-pin-scope="sidebar"]`
    const row = id => `${space} [data-tab-id="${id}"] .tab-item-main`
    const geometry = () => page.$eval(space, el => ({
        scrollTop: el.scrollTop, scrollHeight: el.scrollHeight,
        rows: ['.new-tab-row', '.pinned-tabs-divider', '.tabs-list'].map(selector => {
            const r = el.querySelector(selector).getBoundingClientRect()
            return { top: r.top, height: r.height }
        })
    }))
    assert.equal(await page.$('.sidebar-pins-placeholder, .pin-drop-placeholder'), null, 'empty sections have no placeholder text or cells')
    const drag = async (id, target, { cancel = false, label = null } = {}) => {
        const before = await geometry()
        const source = await page.$eval(row(id), el => {
            const r = el.getBoundingClientRect()
            return { x: r.left + 30, y: r.top + r.height / 2 }
        })
        await page.mouse.move(source.x, source.y)
        await page.mouse.down()
        await page.mouse.move(source.x + 8, source.y, { steps: 2 })
        await page.waitForSelector(fixed)
        assert.deepEqual(await geometry(), before, 'starting a drag does not move or resize the sidebar')
        const destination = await page.$eval(target, el => {
            const r = el.getBoundingClientRect()
            return { x: r.left + 80, y: r.top + Math.min(6, r.height / 2) }
        })
        await page.mouse.move(destination.x, destination.y, { steps: 4 })
        assert.deepEqual(await geometry(), before, 'showing the drop target does not move or resize the sidebar')
        if (label) {
            await page.waitForSelector('.tab-drag-indicator .pin-label')
            assert.equal(await page.$eval('.pin-label', el => el.textContent), label)
            assert.equal(await page.$eval('.tab-drag-indicator', el => getComputedStyle(el).position), 'fixed')
            assert.equal(await page.$eval('.tab-drag-indicator', el => el.getBoundingClientRect().height), 2)
        }
        if (cancel) await page.keyboard.press('Escape')
        await page.mouse.up()
        if (cancel) assert.deepEqual(await geometry(), before, 'cancelling a drag preserves the original layout')
    }
    await drag('tab-0', fixed, { cancel: true, label: 'Pin above New Tab' })
    assert.equal(await page.$('.tab-drag-indicator'), null)
    await drag('tab-0', fixed, { label: 'Pin above New Tab' })
    await page.waitForSelector(`${fixed} [data-tab-id="tab-0"]`)
    assert.equal(await page.$$eval(`${scrolling} [data-tab-id]`, tabs => tabs.length), 1)
    assert.equal(await page.$eval(`${space} .tabs-list`, el => !!el.querySelector('[data-tab-id="tab-0"]')), false)

    const pinnedHeader = await headerGeometry()
    await page.$eval(space, el => { el.scrollTop = 700 })
    await page.waitForFunction(selector => document.querySelector(selector).scrollTop >= 700, {}, space)
    assert.deepEqual(await headerGeometry(), pinnedHeader, 'the whole header stays fixed above the fixed pinned tabs')
    const layout = await page.$eval(space, el => {
        const bounds = el.getBoundingClientRect()
        const pin = el.querySelector('.fixed-sidebar-pins').getBoundingClientRect()
        const newTab = el.querySelector('.new-tab-row').getBoundingClientRect()
        const saved = el.querySelector('[data-pin-scope="sidebar"]').getBoundingClientRect()
        return { visible: pin.top >= bounds.top - 1 && pin.bottom <= newTab.top,
            newTabVisible: newTab.bottom <= bounds.bottom, savedScrolled: saved.bottom < bounds.top }
    })
    assert.deepEqual(layout, { visible: true, newTabVisible: true, savedScrolled: true })
    const before = await page.$eval(space, el => el.scrollTop)
    await page.evaluate(() => window.activate('tab-0'))
    await page.waitForFunction(() => document.querySelector('.fixed-sidebar-pins .active'))
    // Let the sidebar's delayed active-tab reveal run.
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(await page.$eval(space, el => el.scrollTop), before, 'activating a fixed pin preserves normal-list scroll')

    await page.evaluate(() => window.activate('tab-14'))
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(await page.$eval(`${space} [data-tab-id="tab-14"]`, el => {
        const header = el.closest('.space-content').querySelector('.space-sticky-tabs').getBoundingClientRect()
        return el.getBoundingClientRect().top >= header.bottom - 1
    }), true, 'activating an ordinary tab reveals it below the entire sticky header')

    await page.$eval(space, el => { el.scrollTop = 0 })
    await drag('tab-0', scrolling)
    await page.waitForSelector(`${scrolling} [data-tab-id="tab-0"]`)
    assert.equal(await page.$eval(fixed, el => el.getBoundingClientRect().height), 0, 'empty fixed section takes no layout space')
    await drag('saved', fixed)
    await page.waitForSelector(`${fixed} [data-tab-id="saved"]`)
    await page.evaluate(() => window.unpin('tab-0'))
    await drag('tab-1', scrolling, { cancel: true, label: 'Pin above divider' })
    await drag('tab-1', scrolling, { label: 'Pin above divider' })
    await page.waitForSelector(`${scrolling} [data-tab-id="tab-1"]`)
    for (let i = 1; i < 12; i++) await page.evaluate(id => window.pin(id, true), `tab-${i}`)
    assert.equal(await page.$eval(fixed, el => el.scrollHeight > el.clientHeight), true, 'many fixed pins scroll independently')
    await page.$eval(fixed, el => { el.scrollTop = el.scrollHeight })
    assert.equal(await page.$eval(space, el => el.scrollTop), 0)
    await page.screenshot({ path: `${root}.cache/tab-sidebar-fixed-pins.png` })
    for (const height of [800, 450]) {
        await page.setViewport({ width: 1100, height })
        await page.$eval(space, el => { el.scrollTop = 0 })
        const headerBeforeScroll = await headerGeometry()
        await page.$eval(space, el => { el.scrollTop = el.scrollHeight })
        assert.deepEqual(await headerGeometry(), headerBeforeScroll, 'all header elements stay in place at the bottom in both tall and short windows')
        assert.equal(await page.$eval(space, el => {
            const bounds = el.getBoundingClientRect()
            const header = el.querySelector('.space-sticky-tabs').getBoundingClientRect()
            return header.top >= bounds.top - 1 && header.bottom <= bounds.bottom
        }), true, 'fixed pins and New Tab remain visible at the bottom, including in short windows')
    }
    assert.deepEqual(errors, [])
    console.log('Tab sidebar: empty fixed drops, both sections, sticky scrolling, activation, transfers and pin overflow pass')
} finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
    await rm(profile, { recursive: true, force: true })
}

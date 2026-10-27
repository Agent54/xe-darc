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
        import Sidebar from './app/components/TabSidebar.svelte'
        import data from 'fixture-data'
        window.data = data
        window.flushSync = flushSync
        mount(Sidebar, { target: document.body, props: { showUrl: false, tabSidebarVisible: true } })
    `,
    'fixture-data': compileModule(`
        import { getSidebarItems, getTabGroup } from './app/lib/tab-groups.js'
        const tab = (id, favicon, extra = {}) => ({ id, title: id, url: 'https://example.com', type: 'tab', spaceId: 'space', favicon: location.origin + favicon, ...extra })
        const data = $state({
            docs: {}, frames: {}, origins: {}, menuActions: [],
            spaceMeta: {
                globalPins: [tab('pin-one', '/one.svg'), tab('pin-two', '/two.svg')],
                closedTabs: [tab('closed-one', '/one.svg'), tab('closed-missing', '/missing.svg'), tab('closed-two', '/two.svg')],
                spaceOrder: ['space'], activeSpace: 'space', activeTabId: null
            },
            spaces: { space: { name: 'Space', pinnedTabs: [], activeTabsOrder: ['outside', 'group-two'], tabs: [
                tab('group-missing', '/group-missing.svg', { tabGroupId: 'group', tabGroupOrder: 0, order: 1 }),
                tab('group-two', '/two.svg', { tabGroupId: 'group', tabGroupOrder: 1, order: 2 }),
                tab('outside', '/one.svg', { order: 3 }),
                ...Array.from({ length: 6 }, (_, index) => tab('group-tail-' + index, '/one.svg', { tabGroupId: 'group', tabGroupOrder: index + 2, order: 1 }))
            ] } }
        })
        for (const tab of [...data.spaces.space.tabs, ...data.spaceMeta.globalPins, ...data.spaceMeta.closedTabs]) data.docs[tab.id] = tab
        data.getSidebarItems = spaceId => getSidebarItems(data.spaces[spaceId].tabs, [], data.docs)
        data.getTabGroup = (tabId, spaceId) => getTabGroup(data.spaces[spaceId].tabs, tabId)
        data.getGroupActiveTab = group => data.spaces.space.activeTabsOrder.map(id => group.tabs.find(tab => tab.id === id)).find(Boolean) || group.tabs[0]
        data.convertTabGroupToSpace = (tabId, spaceId) => data.menuActions.push({ action: 'convert', tabId, spaceId })
        data.closeTabGroup = (tabId, spaceId) => data.menuActions.push({ action: 'close', tabId, spaceId })
        data.getSpacePins = spaceId => data.spaces[spaceId].pinnedTabs
        data.isTabHibernated = () => false
        data.removeClosedTab = id => { data.spaceMeta.closedTabs = data.spaceMeta.closedTabs.filter(tab => tab.id !== id) }
        export default data
    `, { generate: 'client' }).js.code,
    empty: 'export default function () {}',
    'fixture-env': 'export const BROWSER = true, DEV = false, BUILD = false'
}

const bundle = await rollup({
    input: 'entry',
    onwarn(warning) {
        if (warning.code !== 'CIRCULAR_DEPENDENCY') {
            throw new Error(warning.message)
        }
    },
    plugins: [{
        name: 'favicon-fixture',
        resolveId(source, importer) {
            if (source in modules) {
                return source
            }
            if (source === 'esm-env') {
                return 'fixture-env'
            }
            if (source.endsWith('/data.svelte.js')) {
                return 'fixture-data'
            }
            if (/\/(Tooltip|UrlRenderer|UrlBar)\.svelte$/.test(source)) {
                return 'empty'
            }
            if (source === 'svelte') {
                return require.resolve('svelte').replace('index-server.js', 'index-client.js')
            }
            if (source.startsWith('.')) {
                return resolve(importer?.startsWith('/') ? dirname(importer) : root, source)
            }
            if (source === 'clsx') {
                return createRequire(importer).resolve(source).replace(/\.js$/, '.mjs')
            }
            return createRequire(importer?.startsWith('/') ? importer : import.meta.url).resolve(source)
        },
        load(id) {
            if (id in modules) {
                return modules[id]
            }
            const source = Deno.readTextFileSync(id)
            if (id.endsWith('.svelte')) {
                return compile(source, { filename: id, generate: 'client', css: 'injected' }).js.code
            }
            if (id.endsWith('.svelte.js')) {
                return compileModule(source, { filename: id, generate: 'client' }).js.code
            }
            return source
        }
    }]
})
const { output } = await bundle.generate({ format: 'es' })
await bundle.close()
const requests = []
const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
    const path = new URL(request.url).pathname
    if (path === '/fixture.js') {
        return new Response(output[0].code, { headers: { 'content-type': 'text/javascript' } })
    }
    if (path.endsWith('.svg')) {
        requests.push(path)
        return new Response(path.includes('missing') ? '' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6"/></svg>', {
            status: path.includes('missing') ? 404 : 200,
            headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' }
        })
    }
    return new Response('<!doctype html><style>*, ::before, ::after { box-sizing: border-box; } :root { --tab-hover-background: #181818; --tab-hover-border: rgb(255 255 255 / 2.5%); --tab-group-tab-hover-background: #242424; } body { background: black; }</style><body><script type="module" src="/fixture.js"></script>', { headers: { 'content-type': 'text/html' } })
})

let browser
const profile = `${root}.cache/favicon-browser-${crypto.randomUUID()}`
const errors = []
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: profile })
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => {
        errors.push(error.message)
        console.error(error.message)
    })
    await page.goto(`http://127.0.0.1:${server.addr.port}`)
    await page.waitForFunction(() => document.querySelector('.closed-tab-item .fallback-favicon'))
    assert.deepEqual(errors, [])
    const hovercardLeft = async (trigger, grouped) => {
        await page.hover(trigger)
        await page.waitForFunction(grouped => {
            const preview = document.querySelector('.tab-hovercard-sidebar')
            return preview?.classList.contains('group-hovercards') === grouped && preview.querySelector('.hovercard-content') && preview.getAnimations().every(animation => animation.playState === 'finished')
        }, {}, grouped)
        return page.$eval('.hovercard-content', card => card.getBoundingClientRect().left)
    }
    const groupLeft = await hovercardLeft('.tab-group-main', true)
    const singleLeft = await hovercardLeft('.tabs-list > [data-tab-id="outside"]', false)
    assert.ok(Math.abs(groupLeft - singleLeft) < 0.5, `group and single hovercards must align: ${groupLeft} vs ${singleLeft}`)
    await page.mouse.move(600, 500)
    await page.evaluate(() => {
        window.closedRows = [...document.querySelectorAll('.closed-tab-item')]
        window.closedIcons = window.closedRows.map(row => row.querySelector('.favicon, .fallback-favicon'))
        window.groupIcons = [...document.querySelectorAll('.preview-favicon .favicon, .preview-favicon .fallback-favicon')]
        window.outsideIcon = document.querySelector('[data-tab-id="outside"] .favicon')
        window.flushSync(() => window.data.removeClosedTab('closed-one'))
    })
    await page.waitForNetworkIdle({ idleTime: 100 })
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.closed-tab-item')].map((row, i) => ({
        row: row === window.closedRows[i + 1],
        icon: row.querySelector('.favicon, .fallback-favicon') === window.closedIcons[i + 1]
    }))), [{ row: true, icon: true }, { row: true, icon: true }], 'removing a closed entry must preserve surviving rows and failed-icon state')

    assert.equal(await page.evaluate(() => {
        const icon = document.querySelectorAll('.pinned-tab .favicon')[1]
        window.flushSync(() => { window.data.spaceMeta.globalPins = window.data.spaceMeta.globalPins.slice(1) })
        return icon === document.querySelector('.pinned-tab .favicon')
    }), true, 'removing a global pin must preserve surviving favicons')

    assert.equal(await page.evaluate(() => {
        const OriginalURL = window.URL
        let parses = 0
        window.URL = new Proxy(OriginalURL, {
            construct(target, args) {
                parses++
                return Reflect.construct(target, args)
            }
        })
        try {
            window.flushSync(() => {
                window.data.docs.outside = { ...window.data.spaces.space.tabs[2], title: 'Updated title', canvas: { x: 100 } }
                window.data.frames.outside = { loading: true }
            })
            return parses
        } finally {
            window.URL = OriginalURL
        }
    }), 0, 'title, layout and loading changes must not reparse favicon URLs')
    assert.ok(await page.$('[data-tab-id="outside"] .favicon-loading-spinner'))

    for (const expanded of [true, false, true]) {
        await page.evaluate(() => {
            document.querySelector('.tab-group-toggle').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
            window.flushSync()
        })
        await page.waitForNetworkIdle({ idleTime: 100 })
        assert.equal(await page.$eval('.tab-group-scroll', el => !el.hidden), expanded)
        assert.equal(await page.evaluate(() => window.outsideIcon === document.querySelector('[data-tab-id="outside"] .favicon')), true)
        assert.equal(await page.evaluate(() => window.groupIcons.every((icon, i) => icon === document.querySelectorAll('.preview-favicon .favicon, .preview-favicon .fallback-favicon')[i])), true)
        if (expanded) {
            await page.waitForFunction(() => document.querySelector('[data-tab-id="group-missing"] .fallback-favicon'))
            assert.equal(await page.evaluate(() => {
                const icon = document.querySelector('[data-tab-id="group-missing"] .fallback-favicon')
                const same = !window.expandedIcon || window.expandedIcon === icon
                window.expandedIcon = icon
                return same
            }), true, 'reopening a group must preserve failed-icon state')
        }
    }
    for (const headerPart of ['.tab-group-main', '.tab-group-count', '.tab-group-toggle']) {
        await page.hover(headerPart)
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgb(36, 36, 36)')
        assert.equal(await page.$eval('.group-activation-target', row => row.dataset.tabId), 'group-two')
        assert.equal(await page.$eval('.tab-group-content > [data-tab-id="group-missing"]', row => getComputedStyle(row).backgroundColor), 'rgba(0, 0, 0, 0)')
    }
    await page.mouse.move(600, 500)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgba(0, 0, 0, 0)')
    await page.hover('.tab-group-main')
    await page.evaluate(() => window.flushSync(() => { window.data.spaces.space.activeTabsOrder = ['outside', 'group-missing'] }))
    await page.waitForFunction(() => document.querySelector('.group-activation-target').dataset.tabId === 'group-missing' && getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgb(36, 36, 36)')
    assert.equal(await page.$eval('.tab-group-content > [data-tab-id="group-two"]', row => getComputedStyle(row).backgroundColor), 'rgba(0, 0, 0, 0)')
    await page.mouse.move(600, 500)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgba(0, 0, 0, 0)')
    await page.focus('.tab-group-toggle')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgb(36, 36, 36)')
    await page.$eval('.tab-group-toggle', button => button.blur())
    for (const scrollTop of [0, 9999]) {
        await page.mouse.move(600, 500)
        const outerScrollTop = await page.evaluate(scrollTop => {
            window.flushSync(() => { window.data.spaces.space.activeTabsOrder = ['outside', scrollTop ? 'group-missing' : 'group-tail-5'] })
            document.querySelector('.tab-group-content').scrollTop = scrollTop
            return document.querySelector('.tabs-list').scrollTop
        }, scrollTop)
        await page.hover('.tab-group-main')
        await page.waitForFunction(() => {
            const content = document.querySelector('.tab-group-content').getBoundingClientRect()
            const target = document.querySelector('.group-activation-target').getBoundingClientRect()
            return target.top >= content.top && target.bottom <= content.bottom
        })
        assert.equal(await page.$eval('.tabs-list', list => list.scrollTop), outerScrollTop, 'revealing the remembered tab must only scroll inside its group')
    }
    for (const [label, action] of [['Convert to space', 'convert'], ['Close all', 'close']]) {
        for (const keyboard of [false, true]) {
            await page.$eval('.tab-group', header => header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 100 })))
            const item = await page.waitForSelector(`.context-menu button ::-p-text(${label})`)
            if (keyboard) {
                await item.focus()
                await page.keyboard.press('Enter')
            } else {
                await item.evaluate(button => button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 })))
            }
            await page.waitForSelector('.context-menu', { hidden: true })
            assert.deepEqual(await page.evaluate(() => ({ ...window.data.menuActions.at(-1) })), { action, tabId: 'group-missing', spaceId: 'space' })
        }
    }
    assert.equal(await page.evaluate(() => window.data.menuActions.length), 4, 'each menu selection must run once')
    assert.equal(requests.filter(path => path === '/missing.svg').length, 1, 'closed fallback must not retry its failed URL')
    assert.equal(requests.filter(path => path === '/group-missing.svg').length, 2, 'group preview and expanded row should each try once')

    await page.evaluate(() => window.flushSync(() => {
        window.data.docs.outside.favicon = location.origin + '/updated.svg'
        window.data.frames.outside.loading = false
    }))
    await page.waitForFunction(() => document.querySelector('[data-tab-id="outside"] .favicon')?.src.endsWith('/updated.svg'))
    await page.waitForNetworkIdle({ idleTime: 100 })
    assert.equal(requests.filter(path => path === '/updated.svg').length, 1, 'a changed favicon must still load')
    assert.equal(await page.$('[data-tab-id="outside"] .favicon-loading-spinner'), null)
    assert.deepEqual(errors, [])
    console.log('Chromium: group headers reveal their remembered tab without scrolling the sidebar; group menu actions support mouse release and keyboard; favicon regressions pass')
} finally {
    await browser?.close()
    await server.shutdown()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
}

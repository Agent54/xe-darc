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
        import { tabDrag } from './app/lib/tab-drag.svelte.js'
        import data from 'fixture-data'
        window.data = data
        window.flushSync = flushSync
        window.tabDrag = tabDrag
        mount(Sidebar, { target: document.body, props: {
            showUrl: false,
            get tabSidebarVisible() { return data.ui.sidebarVisible },
            get isDragEnabled() { return data.ui.dragEnabled },
            get customTabSidebarWidth() { return data.ui.sidebarWidth }
        } })
    `,
    'fixture-data': compileModule(`
        import { getSidebarItems, getTabGroup } from './app/lib/tab-groups.js'
        const tab = (id, favicon, extra = {}) => ({ id, title: id, url: 'https://example.com', type: 'tab', spaceId: 'space', favicon: location.origin + favicon, ...extra })
        const data = $state({
            docs: {}, frames: {}, origins: {}, menuActions: [],
            ui: { sidebarVisible: true, dragEnabled: true, sidebarWidth: 263 },
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
        data.ungroupTabGroup = (tabId, spaceId) => data.menuActions.push({ action: 'ungroup', tabId, spaceId })
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
    assert.deepEqual(await page.$eval('.sidebar-window-drag', strip => {
        const rect = strip.getBoundingClientRect()
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, region: getComputedStyle(strip).getPropertyValue('-webkit-app-region'), reachable: document.elementFromPoint(200, 17) === strip, clearsControls: document.querySelector('.search-toggle-tab').getBoundingClientRect().top >= rect.bottom }
    }), { left: 0, top: 0, width: 263, height: 35, region: 'drag', reachable: true, clearsControls: true }, 'the open sidebar must provide its own unobstructed title-bar drag strip')
    await page.evaluate(() => window.flushSync(() => { window.data.ui.dragEnabled = false; window.data.ui.sidebarWidth = 320 }))
    assert.equal(await page.$eval('.sidebar-window-drag', strip => getComputedStyle(strip).getPropertyValue('-webkit-app-region')), 'no-drag')
    assert.equal(await page.$eval('.sidebar-window-drag', strip => strip.getBoundingClientRect().width), 320)
    await page.evaluate(() => window.flushSync(() => { window.data.ui.dragEnabled = true; window.data.ui.sidebarWidth = 263 }))
    const hovercardLeft = async (trigger, grouped) => {
        await page.hover(trigger)
        await page.waitForFunction(grouped => {
            const preview = document.querySelector('.tab-hovercard-sidebar')
            return preview?.classList.contains('group-hovercards') === grouped && preview.querySelector('.hovercard-content') && preview.getAnimations().every(animation => animation.playState === 'finished')
        }, {}, grouped)
        return page.$eval('.hovercard-content', card => card.getBoundingClientRect().left)
    }
    const groupLeft = await hovercardLeft('.tab-group-main', true)
    assert.equal(await page.$$eval('.hovercard-content.active', cards => cards.length), 1, 'only the remembered group member receives a header capsule')
    assert.equal(await page.$eval('.hovercard-content.active .hovercard-title', title => title.textContent), 'group-two')
    assert.equal(await page.$eval('.hovercard-content.active .hovercard-info', header => getComputedStyle(header, '::before').backgroundColor), 'rgb(22, 22, 22)')
    assert.equal(await page.$eval('.hovercard-content.active .url-bar-container', urlBar => getComputedStyle(urlBar).backgroundColor), 'rgba(0, 0, 0, 0)', 'the title and URL share one capsule surface')
    await (await page.$('.tab-hovercard-sidebar')).screenshot({ path: `${root}.cache/tab-hovercard-capsule.png` })
    await page.hover('.hovercard-content.active .hovercard-title')
    await page.waitForSelector('.hovercard-content.active .url-bar-section.hover-expand-enabled')
    await page.hover('.hovercard-content.active .url-bar-url')
    await page.waitForSelector('.url-bar-wrapper:popover-open')
    await page.waitForFunction(() => {
        const stack = document.querySelector('.group-hovercards').getBoundingClientRect()
        const url = document.querySelector('.url-bar-wrapper:popover-open .url-bar-container').getBoundingClientRect()
        return url.right > stack.right + 40
    })
    assert.equal(await page.evaluate(() => {
        const stack = document.querySelector('.group-hovercards').getBoundingClientRect()
        const url = document.querySelector('.url-bar-wrapper:popover-open .url-bar-container').getBoundingClientRect()
        return !!document.elementFromPoint(stack.right + 30, url.top + 16)?.closest('.url-bar-wrapper:popover-open')
    }), true, 'the expanded URL bar must remain visible and interactive beyond the scrollable stack')
    await page.click('.url-bar-wrapper:popover-open .url-bar-url')
    await page.waitForFunction(() => document.activeElement?.classList.contains('url-bar-input'))
    const floatingTop = await page.$eval('.url-bar-wrapper:popover-open', bar => bar.getBoundingClientRect().top)
    await page.$eval('.group-hovercards', stack => { stack.scrollTop += 30 })
    await page.waitForFunction(top => Math.abs(document.querySelector('.url-bar-wrapper:popover-open').getBoundingClientRect().top - (top - 30)) < 1, {}, floatingTop)
    await page.evaluate(() => { document.body.style.background = '#242424' })
    await page.screenshot({ path: `${root}.cache/tab-group-floating-url.png` })
    await page.evaluate(() => { document.body.style.background = '' })
    await page.keyboard.press('Escape')
    await page.mouse.move(700, 550)
    await page.waitForSelector('.url-bar-wrapper:popover-open', { hidden: true })
    const singleLeft = await hovercardLeft('.tabs-list > [data-tab-id="outside"]', false)
    assert.ok(Math.abs(groupLeft - singleLeft) < 0.5, `group and single hovercards must align: ${groupLeft} vs ${singleLeft}`)
    const rowRight = await page.$eval('.tabs-list > [data-tab-id="outside"]', row => row.getBoundingClientRect().right)
    assert.ok(Math.abs(singleLeft - rowRight - 18) < 0.5, 'both preview types retain the original 10px gap plus the card inset')
    assert.equal(await page.$('.hovercard-content.active'), null)
    await page.evaluate(() => window.flushSync(() => { window.data.spaceMeta.activeTabId = 'outside' }))
    await page.waitForSelector('.hovercard-content.active')
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
    await page.mouse.move(600, 500)
    const borderPoint = await page.evaluate(() => {
        window.flushSync(() => { window.data.spaces.space.activeTabsOrder = ['outside', 'group-tail-5'] })
        document.querySelector('.tab-group-content').scrollTop = 0
        const wrapper = document.querySelector('.tab-group-wrapper')
        const rect = wrapper.getBoundingClientRect()
        for (let offset = 0; offset < rect.height; offset += 0.5) {
            for (const x of [rect.left, rect.left + 0.25, rect.right - 1, rect.right - 0.25]) {
                const y = rect.top + offset
                if (document.elementFromPoint(x, y) === wrapper) return { x, y }
            }
        }
        throw new Error('The fixture must have an exposed group border')
    })
    await page.mouse.move(borderPoint.x, borderPoint.y)
    const borderPreview = await page.evaluate(({ x, y }) => {
        const wrapper = document.querySelector('.tab-group-wrapper')
        const target = document.querySelector('.group-activation-target')
        const row = target.getBoundingClientRect()
        const content = document.querySelector('.tab-group-content').getBoundingClientRect()
        return {
            onBorder: document.elementFromPoint(x, y) === wrapper,
            visible: row.top >= content.top && row.bottom <= content.bottom,
            background: getComputedStyle(target).backgroundColor,
            transition: getComputedStyle(target).transitionDuration,
            frameBackground: getComputedStyle(wrapper).backgroundColor
        }
    }, borderPoint)
    assert.deepEqual(borderPreview, { onBorder: true, visible: true, background: 'rgb(36, 36, 36)', transition: '0s', frameBackground: 'rgb(16, 16, 16)' }, 'border entry must reveal and highlight the remembered tab immediately with the subdued frame')
    await page.hover('.tab-group-content > [data-tab-id="group-tail-4"]')
    assert.equal(await page.$eval('.group-activation-target', row => getComputedStyle(row).backgroundColor), 'rgba(0, 0, 0, 0)', 'browsing individual rows must clear the header activation preview immediately')
    await page.$eval('.tab-group', header => header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 100 })))
    await (await page.waitForSelector('.context-menu button ::-p-text(Rename…)')).click()
    await page.waitForFunction(() => document.activeElement?.id === 'tab-group-name')
    assert.deepEqual(await page.$eval('#tab-group-name', input => {
        const style = getComputedStyle(input)
        return { outline: style.outlineStyle, shadow: style.boxShadow, appearance: style.appearance, border: style.borderColor, background: style.backgroundColor }
    }), { outline: 'none', shadow: 'none', appearance: 'none', border: 'rgba(255, 255, 255, 0.02)', background: 'rgb(33, 33, 33)' }, 'the focused rename input uses a background change with a quiet border')
    await (await page.$('.context-menu')).screenshot({ path: `${root}.cache/group-rename-focus.png` })
    await page.$eval('#tab-group-name', input => input.blur())
    assert.deepEqual(await page.$eval('#tab-group-name', input => ({ background: getComputedStyle(input).backgroundColor, border: getComputedStyle(input).borderColor })), { background: 'rgb(21, 21, 21)', border: 'rgba(255, 255, 255, 0.02)' }, 'leaving the field restores only its background')
    await page.mouse.click(600, 500)
    for (const [label, action] of [['Ungroup', 'ungroup'], ['Close all', 'close']]) {
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
    await page.hover('.tabs-list > [data-tab-id="outside"] .tab-item-main')
    const dragStart = await page.$eval('.tabs-list > [data-tab-id="outside"] .tab-item-main', button => {
        const rect = button.getBoundingClientRect()
        return { x: rect.left + 20, y: rect.top + rect.height / 2 }
    })
    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.mouse.move(dragStart.x + 10, dragStart.y + 10)
    await page.waitForFunction(() => window.tabDrag.active)
    await page.hover('.new-tab-more-button')
    assert.equal(await page.$eval('.new-tab-button', button => button.matches(':hover')), false, 'new-tab controls must not hover during tab dragging')
    assert.equal(await page.$eval('.new-tab-hover-menu', menu => getComputedStyle(menu).visibility), 'hidden')
    await page.$eval('.tabs-list', list => { list.scrollTop = 0 })
    await page.waitForSelector('.add-spacer-preview')
    await page.hover('.add-spacer-preview')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.add-spacer-preview-line')).opacity === '0')
    assert.equal(await page.$eval('.add-spacer-preview', button => button.matches(':hover')), false, 'divider insertion must not hover during tab dragging')
    await page.mouse.up()
    await page.waitForFunction(() => !window.tabDrag.active)
    await page.hover('.add-spacer-preview')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.add-spacer-preview-line')).opacity === '1')

    await page.setViewport({ width: 800, height: 1000 })
    await page.evaluate(() => window.flushSync(() => {
        for (let index = 0; index < 2; index++) {
            const tab = { ...window.data.docs['group-two'], id: `resize-${index}`, title: `Resize ${index}`, tabGroupId: 'resize', tabGroupOrder: index, order: 20 + index }
            window.data.docs[tab.id] = tab
            window.data.spaces.space.tabs.push(tab)
        }
    }))
    await page.$eval('[data-tab-group-id="resize"] .tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    const groupContent = '[data-tab-group-id="group"] .tab-group-content'
    const resizeHandle = '[data-tab-group-id="group"] .tab-group-resize'
    await page.mouse.move(600, 500)
    assert.equal(await page.$eval(resizeHandle, button => getComputedStyle(button).opacity), '0', 'the resize grip stays hidden away from the bottom border')
    await page.hover('[data-tab-group-id="group"] .tab-group-main')
    assert.equal(await page.$eval(resizeHandle, button => getComputedStyle(button).opacity), '0', 'hovering the group header must not reveal the resize grip')
    assert.equal(await page.$eval('[data-tab-group-id="resize"] .tab-group-resize', button => getComputedStyle(button).display), 'none', 'a group without overflow must have no resize hit area')
    assert.equal(await page.$eval(resizeHandle, button => {
        const rect = button.getBoundingClientRect()
        const content = button.parentElement.querySelector('.tab-group-content').getBoundingClientRect()
        return rect.top >= content.bottom && getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'
    }), true, 'the transparent resize strip must sit below the tab content instead of covering the last row')
    const resizeGroup = async delta => {
        const point = await page.$eval(resizeHandle, button => {
            const rect = button.getBoundingClientRect()
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        })
        await page.mouse.move(point.x, point.y)
        assert.equal(await page.$eval(resizeHandle, button => getComputedStyle(button).opacity), '1', 'the bottom border reveals the resize grip')
        await page.mouse.down()
        await page.mouse.move(point.x, point.y + delta, { steps: 5 })
        assert.equal(await page.evaluate(() => window.tabDrag.active || window.tabDrag.pending), false, 'resizing must not start a tab drag')
        await page.mouse.up()
        await page.waitForFunction(() => !document.querySelector('.group-resizing'))
    }
    const initialHeight = await page.$eval(groupContent, content => content.clientHeight)
    await resizeGroup(80)
    assert.equal(await page.$eval(groupContent, content => content.clientHeight), initialHeight + 80, 'dragging the corner increases the expanded list height')
    assert.deepEqual(await page.$$eval('.tab-group-content', lists => lists.map(content => getComputedStyle(content).maxHeight)), ['286px', '286px'], 'all groups share the session height limit')
    assert.ok(await page.$eval('[data-tab-group-id="resize"] .tab-group-content', content => content.clientHeight < 286), 'short groups must retain their natural height')
    await resizeGroup(-120)
    await page.waitForFunction(() => document.querySelector('[data-tab-group-id="group"] .tab-group-scroll').dataset.scrollBottom === 'true')
    assert.equal(await page.$eval(groupContent, content => content.clientHeight), initialHeight - 40, 'shrinking restores inner overflow and its fade')
    await resizeGroup(-400)
    assert.equal(await page.$eval(groupContent, content => getComputedStyle(content).maxHeight), '86px', 'the resize limit must leave room for two rows')
    await page.focus(resizeHandle)
    await page.keyboard.press('Home')
    assert.equal(await page.$eval(groupContent, content => getComputedStyle(content).maxHeight), '206px', 'Home restores the original five-tab cap')
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.$eval(groupContent, content => getComputedStyle(content).maxHeight), '226px', 'the handle supports keyboard resizing')
    for (let i = 0; i < 2; i++) {
        await page.$eval('[data-tab-group-id="group"] .tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    }
    assert.equal(await page.$eval(groupContent, content => getComputedStyle(content).maxHeight), '226px', 'the session limit survives collapsing and reopening')
    await page.focus(resizeHandle)
    await page.keyboard.press('Home')
    await page.$eval(resizeHandle, button => button.blur())
    await page.evaluate(() => window.flushSync(() => {
        window.data.spaces.space.tabs = window.data.spaces.space.tabs.filter(tab => tab.tabGroupId !== 'resize')
    }))
    await page.setViewport({ width: 375, height: 800 })
    await hovercardLeft('.tab-group-main', true)
    assert.equal(await page.$eval('.tab-hovercard-sidebar', stack => {
        const rect = stack.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= window.innerWidth
    }), true, 'the capsule stack must still fit a narrow viewport')
    await page.evaluate(() => window.flushSync(() => { window.data.ui.sidebarVisible = false }))
    assert.equal(await page.$('.sidebar-window-drag'), null, 'hover-mode sidebars must not leave an invisible drag strip over the header')
    assert.deepEqual(errors, [])
    console.log('Chromium: shared group height resizes by corner and keyboard with inner overflow preserved; header previews, group menus and favicon regressions pass')
} finally {
    await browser?.close()
    await server.shutdown()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
}

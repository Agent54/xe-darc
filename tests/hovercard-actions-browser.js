import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { rollup } from 'rollup'
import { compile } from 'svelte/compiler'
import puppeteer from 'puppeteer'

const root = new URL('../', import.meta.url).pathname
const require = createRequire(import.meta.url)
const modules = {
    entry: `
        import { mount, unmount } from 'svelte'
        import TabHoverCard from './app/components/TabHoverCard.svelte'
        import TabContextMenu from './app/components/TabContextMenu.svelte'
        import ShortcutOverlay from './app/components/ShortcutOverlay.svelte'
        import { openTabDevTools } from './app/lib/tab-devtools.js'
        import data from 'fixture-data'
        import { shortcuts, createShortcutMatcher, createShortcutHandler } from './app/lib/shortcuts.js'
        window.actions = []
        window.shortcutActions = []
        window.data = data
        let menu = null
        window.menuHides = 0
        window.showMenu = (showDevTools = true, type = 'tab') => {
            if (menu) unmount(menu)
            menu = mount(TabContextMenu, { target: document.body, props: {
                menu: { visible: true, x: innerWidth - 270, y: 40, tab: type === 'tabgroup'
                    ? { type, spaceId: 'space', tabGroupId: 'group', tabs: [data.docs.single, data.docs.grouped] }
                    : { ...data.docs.single, type } },
                showDevTools,
                onHide: () => { window.menuHides++; unmount(menu); menu = null },
                onNavigateHistory: (id, direction) => window.actions.push([direction, id]),
                onReload: tab => window.actions.push(['reload', tab.id]),
                onSettings: () => window.actions.push(['settings', 'single'])
            } })
        }
        const cards = {}
        let overlay = null
        const handle = createShortcutHandler(createShortcutMatcher(shortcuts, true), id => {
            if (id === 'open-location') cards.single.focusLocation()
            else if (id === 'show-shortcuts') overlay ||= mount(ShortcutOverlay, { target: document.body })
            else if (id === 'hide-shortcuts') { if (overlay) unmount(overlay); overlay = null }
            else if (id === 'new-tab' || id === 'new-tab-group') window.shortcutActions.push(id)
            else return false
        })
        window.addEventListener('keydown', handle, true)
        window.addEventListener('keyup', handle.keyup, true)
        window.addEventListener('blur', handle.reset)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async url => window.actions.push(['copy', url]) } })
        for (const stacked of [false, true]) {
            const id = stacked ? 'grouped' : 'single'
            const target = document.createElement('div')
            target.id = id
            document.body.append(target)
            cards[id] = mount(TabHoverCard, { target, props: {
                tab: data.docs[id], stacked, showDevTools: true,
                onGoBack: () => window.actions.push(['back', id]),
                onGoForward: () => window.actions.push(['forward', id]),
                onReload: () => window.actions.push(['reload', id]),
                onCloseTab: () => window.actions.push(['close', id]),
                onDevTools: () => openTabDevTools(data, id),
                onSettings: () => window.actions.push(['settings', id])
            } })
        }
    `,
    'fixture-data': `
        const tab = id => ({ id, title: id, url: 'https://' + id + '.example/path', spaceId: 'space' })
        const frame = id => ({ setAudioMuted: muted => window.actions.push(['muted', id, muted]) })
        const data = {
            docs: { single: tab('single'), grouped: tab('grouped'), outside: tab('outside'), pinned: { ...tab('pinned'), pinned: 'left' } },
            frames: Object.fromEntries(['single', 'grouped', 'outside', 'pinned'].map(id => [id, { frame: frame(id) }])),
            spaces: { space: { name: 'Space' }, destination: { name: 'Destination' } }, ui: {},
            spaceMeta: { activeTabId: 'unrelated', activeSpace: 'other-space', spaceOrder: ['space', 'destination'] },
            isTabHibernated: () => false,
            closeTab: (space, id) => window.actions.push(['close', id]),
            navigate: (id, url) => window.actions.push(['navigate', id, url]),
            moveTab: (id, options) => window.actions.push(['move', id, options]),
            hibernate: (id, force) => { window.actions.push(['hibernate', id, force]); data.frames[id].frame = null },
            unhibernate: id => { window.actions.push(['wake', id]); data.frames[id].frame = frame(id) },
            newTab: async (space, tab) => window.actions.push(['devtools', space, tab])
        }
        export default data
    `,
    'fixture-cdp': `export async function cdpFetch () {
        return Response.json(['single', 'grouped'].map(id => ({
            title: id, url: 'https://' + id + '.example/path', devtoolsFrontendUrl: 'https://devtools.example/' + id
        })))
    }`,
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
        name: 'hovercard-actions-fixture',
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
            if (source.endsWith('/cdp.js')) {
                return 'fixture-cdp'
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
            return id.endsWith('.svelte') ? compile(source, { filename: id, generate: 'client', css: 'injected' }).js.code : source
        }
    }]
})
const { output } = await bundle.generate({ format: 'es' })
await bundle.close()
const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
    if (new URL(request.url).pathname === '/fixture.js') {
        return new Response(output[0].code, { headers: { 'content-type': 'text/javascript' } })
    }
    const menus = Deno.readTextFileSync(`${root}app/menus.css`)
    return new Response(`<!doctype html><style>${menus} *, ::before, ::after { box-sizing: border-box } body { background: #111; display: flex; gap: 40px; margin: 60px; color: white }</style><script type="module" src="/fixture.js"></script>`, { headers: { 'content-type': 'text/html' } })
})

let browser
const profile = `${root}.cache/hovercard-actions-${crypto.randomUUID()}`
const errors = []
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: profile })
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewport({ width: 1100, height: 700 })
    await page.goto(`http://127.0.0.1:${server.addr.port}`)

    for (const id of ['single', 'grouped']) {
        const prefix = `#${id}`
        const reveal = async () => {
            await page.hover(`${prefix} .hovercard-title`)
            await page.waitForSelector(`${prefix} .hover-expand-enabled`)
            await page.hover(`${prefix} .url-bar-url`)
            await page.waitForSelector(`${prefix} [aria-label="Back"]`, { visible: true })
        }
        await reveal()
        const gap = await page.$eval(`${prefix} .url-bar-controls`, controls => {
            const rect = controls.getBoundingClientRect()
            return { x: rect.left + 10, y: rect.top - 1 }
        })
        await page.mouse.move(gap.x, gap.y)
        await page.waitForFunction(prefix => document.querySelector(`${prefix} .url-bar-wrapper`).matches(':hover'), {}, prefix)
        assert.equal(await page.$eval(`${prefix} .url-bar-controls`, controls => getComputedStyle(controls).visibility), 'visible', 'crossing the gap retains the controls')
        const sizes = await page.$$eval(`${prefix} .url-bar-button`, buttons => buttons.map(button => ({ width: button.offsetWidth, height: button.offsetHeight })))
        assert.ok(sizes.every(size => size.width === 28 && size.height === 28), 'hovercard actions use compact menu-sized targets')
        assert.equal(await page.$eval(`${prefix} [aria-label="Close Tab"]`, button => {
            const style = getComputedStyle(button)
            return style.backgroundColor === 'rgba(0, 0, 0, 0)' && style.borderWidth === '0px'
        }), true, 'idle hovercard icons are borderless and have no individual boxes')

        for (const label of ['Back', 'Forward', 'Reload', 'Settings', 'Copy URL', 'Open Developer Tools', 'Close Tab']) {
            await reveal()
            await page.click(`${prefix} [aria-label="${label}"]`)
        }
        await page.waitForFunction(count => window.actions.length === count, {}, id === 'single' ? 7 : 14)
        assert.deepEqual(await page.evaluate(() => window.actions.slice(-7)), [
            ['back', id], ['forward', id], ['reload', id], ['settings', id], ['copy', `https://${id}.example/path`],
            ['devtools', 'space', { url: `https://devtools.example/${id}`, title: `DevTools - ${id}`, shouldFocus: true, pinned: 'right', groupTabId: id }],
            ['close', id]
        ])
    }

    for (const mode of ['left', 'right', 'keyboard']) {
        for (const [label, action] of [['Back', 'back'], ['Forward', 'forward'], ['Reload', 'reload'], ['Settings', 'settings'], ['Copy URL', 'copy'], ['Open Developer Tools', 'devtools'], ['Close Tab', 'close']]) {
            if (mode === 'right') {
                await page.mouse.move(10, 10)
                await page.mouse.down({ button: 'right' })
            }
            await page.evaluate(() => window.showMenu())
            const selector = `.context-menu .tab-actions [aria-label="${label}"]`
            await page.waitForSelector(selector)
            const before = await page.evaluate(() => ({ count: window.actions.length, hides: window.menuHides }))
            if (mode === 'keyboard') {
                await page.focus(selector)
                await page.keyboard.press(label === 'Close Tab' ? 'Space' : 'Enter')
            } else if (mode === 'right') {
                await page.hover(selector)
                await page.mouse.up({ button: 'right' })
            } else {
                await page.click(selector)
            }
            await page.waitForFunction(count => window.actions.length === count, {}, before.count + 1)
            assert.equal(await page.evaluate(() => window.menuHides), before.hides + 1, 'the action dismisses the menu once')
            const last = await page.evaluate(() => window.actions.at(-1))
            assert.equal(last[0], action)
            assert.equal(last[1], action === 'copy' ? 'https://single.example/path' : action === 'devtools' ? 'space' : 'single')
            if (action === 'devtools') assert.equal(last[2].groupTabId, 'single')
        }
    }
    await page.evaluate(() => window.showMenu())
    const hoverStyle = async label => {
        const selector = `.context-menu [aria-label="${label}"]`
        await page.hover(selector)
        await page.$eval(selector, button => Promise.all(button.getAnimations().map(animation => animation.finished)))
        return page.$eval(selector, button => {
            const style = getComputedStyle(button)
            return [style.color, style.backgroundColor, style.backgroundImage]
        })
    }
    assert.deepEqual(await hoverStyle('Close Tab'), await hoverStyle('Reload'), 'Close has the same neutral hover as other menu actions')
    assert.equal(await page.$$eval('.context-menu > button', buttons => buttons.filter(button => ['Rename…', 'Change icon…'].includes(button.textContent.trim())).every(button => button.querySelector('.context-menu-icon svg'))), true)
    assert.ok(await page.$('.move-space-menu > button .context-menu-icon svg'), 'Move to Space has an icon')
    assert.equal(await page.$$eval('.context-menu [aria-label="Reload"]', buttons => buttons.length), 1)
    assert.equal(await page.$$eval('.context-menu [aria-label="Close Tab"]', buttons => buttons.length), 1)
    const menuSizes = await page.$$eval('.context-menu .url-bar-button', buttons => buttons.map(button => ({ width: button.offsetWidth, height: button.offsetHeight })))
    assert.ok(menuSizes.every(size => size.width >= 28 && size.height === 28), 'menu actions retain compact menu sizing')
    await page.focus('#single .url-bar-url')
    await page.waitForSelector('#single [aria-label="Back"]', { visible: true })
    await page.$eval('#single .url-bar-controls', row => Promise.all(row.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: `${root}.cache/tab-actions-desktop.png` })
    await page.evaluate(() => window.showMenu(false))
    assert.equal(await page.$('.context-menu [aria-label="Open Developer Tools"]'), null, 'developer tools follows the mode setting')
    await page.evaluate(() => window.showMenu(false, 'divider'))
    assert.equal(await page.$('.context-menu .tab-actions'), null, 'spacers retain their dedicated menu')
    await page.click('.context-menu-scrim')

    // Releasing the held context-menu button selects a space without pressing inside the submenu.
    await page.mouse.move(10, 10)
    await page.mouse.down({ button: 'right' })
    await page.evaluate(() => window.showMenu())
    await page.hover('.move-space-menu > button')
    await page.waitForSelector('.move-space-submenu')
    assert.equal(await page.$eval('.move-space-submenu', menu => getComputedStyle(menu).transitionProperty), 'opacity', 'submenu positioning is never animated')
    await page.hover('.move-space-submenu button:not(:disabled)')
    await page.mouse.up({ button: 'right' })
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['move', 'single', { targetSpaceId: 'destination', scope: 'tab', placement: 'start', preservePins: true }])

    const selectGroupItem = async label => {
        await page.evaluate(() => window.showMenu(true, 'tabgroup'))
        const item = await page.waitForSelector(`.context-menu [role="menuitem"] ::-p-text(${label})`)
        await item.evaluate(element => element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 })))
        await page.waitForSelector('.context-menu', { hidden: true })
    }
    await page.evaluate(() => { window.data.docs.grouped.muted = true })
    await selectGroupItem('Mute Group')
    assert.deepEqual(await page.evaluate(() => window.actions.slice(-2)), [['muted', 'single', true], ['muted', 'grouped', true]])
    await selectGroupItem('Unmute Group')
    assert.deepEqual(await page.evaluate(() => window.actions.slice(-2)), [['muted', 'single', false], ['muted', 'grouped', false]])
    assert.equal(await page.evaluate(() => window.data.docs.outside.muted), undefined, 'group actions leave outside tabs unchanged')

    await page.evaluate(() => { window.data.docs.single.partition = 'persist:1'; window.data.docs.grouped.partition = 'persist:2'; window.showMenu(true, 'tabgroup') })
    const containerItem = await page.waitForSelector('.context-menu [role="menuitem"] ::-p-text(Container: Mixed)')
    await containerItem.hover()
    const partitionItem = await page.waitForSelector('.context-submenu-item ::-p-text(ephemeral:2)')
    await partitionItem.evaluate(element => element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 })))
    assert.deepEqual(await page.evaluate(() => ['single', 'grouped', 'outside'].map(id => window.data.docs[id].partition || 'default')), ['ephemeral:2', 'ephemeral:2', 'default'])

    await page.evaluate(() => { window.data.frames.grouped.frame = null; window.data.spaceMeta.activeTabId = 'single'; window.showMenu(true, 'tabgroup') })
    assert.ok(await page.waitForSelector('.context-menu [role="menuitem"] ::-p-text(Hibernate)'))
    const wake = await page.waitForSelector('.context-menu [role="menuitem"] ::-p-text(Unhibernate)')
    await wake.evaluate(element => element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 })))
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['wake', 'grouped'], 'mixed groups can wake only their sleeping members')
    await selectGroupItem('Hibernate others')
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['hibernate', 'outside', false])
    assert.equal(await page.evaluate(() => !!window.data.frames.single.frame && !!window.data.frames.grouped.frame && !!window.data.frames.pinned.frame), true, 'hibernate others preserves every group member and pinned tab')
    await selectGroupItem('Hibernate')
    assert.deepEqual(await page.evaluate(() => window.actions.slice(-2)), [['hibernate', 'single', true], ['hibernate', 'grouped', false]])
    await selectGroupItem('Unhibernate')
    assert.deepEqual(await page.evaluate(() => window.actions.slice(-2)), [['wake', 'single'], ['wake', 'grouped']])
    await page.evaluate(() => { window.data.spaceMeta.activeTabId = 'unrelated' })

    for (const id of ['single', 'grouped']) {
        await page.hover(`#${id} .hovercard-title`)
        await page.waitForSelector(`#${id} .hover-expand-enabled`)
        await page.click(`#${id} .url-bar-url`)
        const input = `#${id} [aria-label="Tab URL"]`
        await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), {}, input)
        await page.keyboard.type('https://edited.example/path?q=hello')
        assert.equal(await page.$eval(input, element => element.value), 'https://edited.example/path?q=hello', 'mouse-initiated URL edits retain focus and typed text')
        await page.keyboard.press('Enter')
        assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['navigate', id, 'https://edited.example/path?q=hello'])
        await page.waitForSelector(input, { hidden: true })
        await page.click(`#${id} .url-bar-url`)
        await page.waitForSelector(input)
        await page.keyboard.type('discard this edit')
        await page.keyboard.press('Escape')
        await page.waitForSelector(input, { hidden: true })
        assert.equal(await page.$eval(`#${id} .url-bar-url`, (element, tabId) => element.textContent.includes(`${tabId}.example`), id), true, 'Escape cancels editing')
    }

    await page.setViewport({ width: 320, height: 700 })
    await page.evaluate(() => { document.body.style.margin = '0'; document.querySelector('#grouped').style.display = 'none' })
    await page.hover('#single .hovercard-title')
    await page.waitForSelector('#single .hover-expand-enabled')
    await page.hover('#single .url-bar-url')
    await page.waitForSelector('#single [aria-label="Back"]', { visible: true })
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#single .url-bar-controls')).opacity === '1')
    const rowBounds = await page.$eval('#single .url-bar-controls', row => {
        const rect = row.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
    })
    assert.ok(rowBounds.left >= 0 && rowBounds.right <= 320, 'all hovercard controls fit a narrow viewport')
    await page.$eval('#single .url-bar-controls', row => Promise.all(row.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: `${root}.cache/tab-actions-mobile.png` })
    await page.setViewport({ width: 1100, height: 700 })
    const checkLocation = async () => {
        await page.waitForFunction(() => {
            const input = document.querySelector('#single [aria-label="Tab URL"]')
            return input && document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length
        })
        assert.equal(await page.$eval('#single [aria-label="Tab URL"]', input => input.value), 'https://single.example/path')
    }
    await page.keyboard.down('Meta')
    await page.keyboard.press('l')
    await page.keyboard.up('Meta')
    await checkLocation()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.down('Meta')
    await page.keyboard.press('l')
    await page.keyboard.up('Meta')
    await checkLocation()
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('#single [aria-label="Tab URL"]'))

    await page.keyboard.down('Meta')
    await page.keyboard.down('t')
    await page.keyboard.up('t')
    await page.keyboard.up('Meta')
    assert.deepEqual(await page.evaluate(() => window.shortcutActions), ['new-tab'])
    await page.keyboard.down('Meta')
    await page.keyboard.down('t')
    await page.waitForFunction(() => window.shortcutActions.includes('new-tab-group'))
    await page.keyboard.up('t')
    await page.keyboard.up('Meta')
    assert.deepEqual(await page.evaluate(() => window.shortcutActions), ['new-tab', 'new-tab-group'])

    await page.evaluate(() => {
        const input = document.createElement('input')
        input.id = 'focus-reference'
        document.body.append(input)
        input.focus()
    })
    await page.keyboard.down('Meta')
    await new Promise(resolve => setTimeout(resolve, 1800))
    assert.equal(await page.$('.shortcut-overlay'), null)
    await page.waitForSelector('.shortcut-overlay:popover-open')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'focus-reference', 'opening the reference must preserve typing focus')
    assert.equal(await page.$$eval('.shortcut-row', rows => rows.length), 15)
    assert.equal(await page.$eval('.hold-action', row => row.textContent.includes('New tab group')), true)
    await page.$eval('.shortcut-sheet', sheet => Promise.all(sheet.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: `${root}.cache/shortcut-overlay-desktop.png` })
    await page.keyboard.up('Meta')
    await page.waitForFunction(() => !document.querySelector('.shortcut-overlay'))

    await page.setViewport({ width: 390, height: 844 })
    await page.keyboard.down('Control')
    await page.waitForSelector('.shortcut-overlay:popover-open')
    const layout = await page.$eval('.shortcut-sheet', sheet => ({ width: sheet.clientWidth, content: sheet.scrollWidth }))
    assert.ok(layout.content <= layout.width, 'the mobile sheet must not overflow horizontally')
    await page.$eval('.shortcut-sheet', sheet => Promise.all(sheet.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: `${root}.cache/shortcut-overlay-mobile.png` })
    await page.$eval('.shortcut-sheet', sheet => { sheet.scrollTop = sheet.scrollHeight })
    assert.equal(await page.$eval('.shortcut-sheet', sheet => {
        const footer = sheet.querySelector('footer').getBoundingClientRect()
        return footer.bottom <= sheet.getBoundingClientRect().bottom
    }), true, 'all shortcuts and the footer remain reachable on a narrow screen')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.shortcut-overlay'))
    await page.keyboard.up('Control')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'focus-reference')
    assert.deepEqual(errors, [])
    console.log('Held-button menu selection, neutral borderless actions, group mute/hibernate/container actions, mouse URL editing, narrow rows and keyboard shortcuts pass')
} finally {
    await browser?.close()
    await server.shutdown()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
}

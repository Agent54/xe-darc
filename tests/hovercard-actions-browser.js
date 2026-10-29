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
        import ShortcutOverlay from './app/components/ShortcutOverlay.svelte'
        import { openTabDevTools } from './app/lib/tab-devtools.js'
        import data from 'fixture-data'
        import { shortcuts, createShortcutMatcher, createShortcutHandler } from './app/lib/shortcuts.js'
        window.actions = []
        window.shortcutActions = []
        window.data = data
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
        export default {
            docs: { single: tab('single'), grouped: tab('grouped') },
            frames: {}, spaces: { space: { name: 'Space' } },
            spaceMeta: { activeTabId: 'unrelated', activeSpace: 'other-space' },
            isTabHibernated: () => false,
            newTab: async (space, tab) => window.actions.push(['devtools', space, tab])
        }
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
    return new Response('<!doctype html><style>*, ::before, ::after { box-sizing: border-box } body { background: #111; display: flex; gap: 40px; margin: 60px; color: white }</style><script type="module" src="/fixture.js"></script>', { headers: { 'content-type': 'text/html' } })
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
    console.log('Hovercard controls, Cmd+L focus, held Cmd+T groups, two-second modifier help, focus preservation and mobile layout pass')
} finally {
    await browser?.close()
    await server.shutdown()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
}

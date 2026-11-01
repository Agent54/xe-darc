import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { rollup } from 'rollup'
import { compile, parse } from 'svelte/compiler'
import puppeteer from 'puppeteer'

const root = new URL('../', import.meta.url).pathname
const require = createRequire(import.meta.url)
const appSource = Deno.readTextFileSync(`${root}app/App.svelte`)
const keyHandler = parse(appSource).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'handleShortcutEscape')
const modules = {
    entry: `
        import { mount } from 'svelte'
        import Apps from './app/components/Apps.svelte'
        import { shortcuts, createShortcutMatcher, createShortcutHandler } from './app/lib/shortcuts.js'
        window.requests = []
        window.opened = []
        window.overlayClosed = false
        const tabDrag = { active: false }
        let shortcutOverviewVisible = false
        const helpMenu = null
        const showAppsOverlay = true
        const hovercardUrlBarExpanded = false, hoveredTab = null
        const closeAppsOverlay = () => { window.overlayClosed = true; window.apps.close() }
        ${appSource.slice(keyHandler.start, keyHandler.end)}
        window.addEventListener('keydown', createShortcutHandler(createShortcutMatcher(shortcuts, true), (id, event) => id === 'escape' && handleShortcutEscape(event)), true)
        const containers = [
            { ID: 'web-1', Name: 'demo-web-1', Service: 'web', State: 'running', Publishers: [{ TargetPort: 80, PublishedPort: 8080 }] },
            { ID: 'web-2', Name: 'demo-web-2', Service: 'web', State: 'exited', Publishers: [{ TargetPort: 80, PublishedPort: 8080 }] }
        ]
        window.fetch = async (input, options = {}) => {
            const path = new URL(input).pathname
            if (options.method) {
                window.requests.push({ path, method: options.method, body: options.body ? JSON.parse(options.body) : null })
                if (window.failAction) return Response.json({ message: 'Docker unavailable' }, { status: 503 })
                return Response.json({})
            }
            if (path.endsWith('/app-ports')) return Response.json({ https: 443, publicHttpReady: true })
            if (path.endsWith('/ls')) return Response.json([{ Name: 'demo', ConfigFiles: '/stacks/demo/compose.yaml' }])
            if (path.includes('/config/')) return Response.json({ services: { web: { ports: [{ target: 80, published: 8080 }] }, worker: {} } })
            return Response.json(containers)
        }
        window.apps = mount(Apps, { target: document.body })
    `,
    'fixture-data': `export default {
        docs: {}, spaceMeta: { activeSpace: 'space' },
        newTab: async (space, tab) => window.opened.push(tab)
    }`,
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
        name: 'apps-context-menu-fixture',
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
            if (source.endsWith('/AddAppModal.svelte')) {
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
    return new Response(`<!doctype html><style>${Deno.readTextFileSync(`${root}app/menus.css`)}</style><style>
        body { background: #111; color: white; font-family: system-ui; margin: 70px 20px; }
        .app-card { display: inline-block; vertical-align: top; width: 210px; padding: 10px; margin: 10px; border: 1px solid #444; border-radius: 10px; }
        .app-card-actions { display: flex; gap: 4px; }
        .app-port-links { display: flex; flex-direction: column; }
    </style><script type="module" src="/fixture.js"></script>`, { headers: { 'content-type': 'text/html' } })
})

let browser
const errors = []
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: `${root}.cache/apps-context-menu-browser-${crypto.randomUUID()}` })
    const page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewport({ width: 1100, height: 760 })
    await page.goto(`http://127.0.0.1:${server.addr.port}`)
    await page.waitForSelector('[aria-label="Actions for web"]')

    const openServiceMenu = async () => {
        await page.click('[aria-label="Actions for web"]')
        await page.waitForSelector('.app-context-menu')
        await page.hover('.app-context-menu > button')
        await page.waitForSelector('.app-docker-submenu')
    }
    const labels = () => page.$$eval('.app-docker-submenu button', buttons => buttons.map(button => button.textContent.trim()))

    await openServiceMenu()
    await page.evaluate(() => window.dispatchEvent(new Event('darc-dismiss-overlays')))
    await page.waitForFunction(() => !document.querySelector('.app-context-menu'))
    assert.equal(await page.$(':popover-open'), null, 'View changes close the app menu and its native popover')
    for (const kind of ['sort', 'group']) {
        await page.$eval(`[data-view-trigger="${kind}"]`, button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
        await page.waitForSelector(`#apps-${kind}-menu`)
        await page.evaluate(() => window.dispatchEvent(new Event('darc-dismiss-overlays')))
        await page.waitForFunction(() => !document.querySelector('.apps-view-menu'))
        assert.equal(await page.$eval(`[data-view-trigger="${kind}"]`, button => button.getAttribute('aria-expanded')), 'false')
    }

    await openServiceMenu()
    assert.deepEqual(await labels(), ['Start', 'Stop', 'Restart', 'Pause', 'Start watching', 'Remove'])
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Start')
    await page.keyboard.press('Escape')
    assert.equal(await page.$('.app-context-menu'), null)
    assert.equal(await page.evaluate(() => window.overlayClosed), false)
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Actions for web')

    await page.click('[aria-label="Open demo-web-2 on port 80"]', { button: 'right' })
    await page.hover('.app-context-menu > button')
    assert.deepEqual(await labels(), ['Start', 'Start watching', 'Remove'])
    assert.equal(await page.evaluate(() => window.opened.length), 0)
    await page.$eval('.app-docker-submenu button', button => button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 })))
    await page.waitForFunction(() => window.requests.length === 1 && !document.querySelector('.app-context-menu'))
    assert.deepEqual(await page.evaluate(() => window.requests[0]), {
        path: '/v1.24/start/demo/container', method: 'POST', body: { path: '/stacks/demo/compose.yaml', container: 'web-2' }
    })

    await page.click('[aria-label="Actions for worker"]')
    await page.hover('.app-context-menu > button')
    assert.deepEqual(await labels(), ['Start', 'Start watching', 'Start without rebuilding', 'Remove'])
    await page.mouse.click(5, 5)
    assert.equal(await page.$('.app-context-menu'), null)

    await openServiceMenu()
    const beforeRemove = await page.evaluate(() => window.requests.length)
    const dialogClosed = new Promise(resolve => page.once('dialog', async dialog => {
        assert.equal(dialog.message(), 'Remove service web containers?')
        await dialog.dismiss()
        resolve()
    }))
    await page.click('.app-docker-submenu button:last-child')
    await dialogClosed
    assert.equal(await page.evaluate(() => window.requests.length), beforeRemove)

    await page.evaluate(() => { window.failAction = true })
    await openServiceMenu()
    await page.click('.app-docker-submenu button')
    await page.waitForFunction(() => document.querySelector('.docker-action-status').textContent === 'Docker unavailable')

    await page.setViewport({ width: 430, height: 300 })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => {
        document.querySelector('[aria-label="Actions for worker"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 425, clientY: 295 }))
    })
    await page.hover('.app-context-menu > button')
    const bounds = await page.$$eval('.app-context-menu, .app-docker-submenu', nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect()
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    }))
    assert.ok(bounds.every(rect => rect.left >= 0 && rect.top >= 0 && rect.right <= 430 && rect.bottom <= 300), JSON.stringify(bounds))
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => window.overlayClosed), false)
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => window.overlayClosed), true)
    assert.deepEqual(errors, [])
    console.log('Apps Docker menus: service/container actions, keyboard, dismissal, errors and viewport bounds passed')
} finally {
    await browser?.close()
    await server.shutdown()
}

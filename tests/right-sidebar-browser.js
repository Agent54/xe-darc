import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { rollup } from 'rollup'
import { compile, parse } from 'svelte/compiler'
import puppeteer from 'puppeteer'

const root = new URL('../', import.meta.url).pathname
const require = createRequire(import.meta.url)
const source = Deno.readTextFileSync(`${root}app/App.svelte`)
const functions = new Set(['switchToSidebar', 'toggleSidebar', 'openAdditionalSidebar', 'closeSidebar', 'openSidebarMenu', 'openAppearanceMenu', 'handleSidebarMenuKey'])
const script = parse(source).instance.content.body
    .filter(node => node.type === 'FunctionDeclaration' && functions.has(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n')
const toolbar = source.slice(source.indexOf('<div class="sidebar-right"'), source.indexOf('    <div class="led-indicator-array"')) + '</div>'
const menu = source.slice(source.indexOf('{#if appearanceMenu}'), source.indexOf('<div class="drag-handle-bottom"'))
const panels = source.slice(source.indexOf('{#if openSidebars.size > 0}'), source.indexOf('{#if appsOverlayHasOpened}'))
const developerMenuStart = source.indexOf('{#snippet developerMenu(select)}')
const developerMenu = source.slice(developerMenuStart, source.indexOf('{/snippet}', developerMenuStart) + '{/snippet}'.length)
const types = { Resources: 'resources', Activity: 'activity', Settings: 'settings', UserMods: 'userMods', AgentSidebar: 'aiAgent', DevToolsSidebar: 'devTools' }
const fixture = `
    <script>
        import AppearanceContextMenu from './app/components/AppearanceContextMenu.svelte'
        import AppToolbarMenu from './app/components/AppToolbarMenu.svelte'
        ${Object.keys(types).map(name => `import ${name} from '${name}'`).join('\n')}
        let openSidebars = $state(new Set())
        const mainSidebar = $derived(openSidebars.values().next().value)
        let appearanceMenu = $state(null)
        let isSwitchingSidebars = false
        let agentEnabled = false
        const devModeEnabled = true, rightToolbarAutohide = false, headerPartOfMain = false
        const isWindowResizing = false, isResizingPinnedFrames = false, isResizingSidebar = false
        const prevOpenSidebars = new Set(), requestedResources = [], userMods = [], tabs = []
        const rightSidebarWidth = $derived(openSidebars.size * 340)
        const spaceTaken = 0
        const data = { clearUnseenResourceFlags() {}, ui: {}, docs: {}, spaceMeta: {}, getTabGroup() {} }
        const startResizeSidebar = () => {}, updateUserMods = () => {}, activateVoiceAgent = () => {}
        const hideContextMenu = () => {}, updateSidebarState = () => {}
        const openTestSuite = () => {}, openComposeUI = () => {}, openVSCodeWorkspace = () => {}
        function persistOpenSidebars() { window.savedSidebars = [...openSidebars] }
        ${script}
    </script>
    ${toolbar}
    ${developerMenu}
    ${menu}
    ${panels}
`
const modules = {
    entry: `import { mount } from 'svelte'; import Fixture from 'fixture'; mount(Fixture, { target: document.body })`,
    fixture: compile(fixture, { filename: 'fixture.svelte', generate: 'client', css: 'injected' }).js.code,
    'esm-env': 'export const BROWSER = true, DEV = false, BUILD = false',
    ...Object.fromEntries(Object.entries(types).map(([name, type]) => [name, compile(`
        <script>
            import RightSidebar from './app/components/RightSidebar.svelte'
            let props = $props()
        </script>
        <RightSidebar {...props} title="${name}" activeSidebar="${type}"
            switchToAgent={props.switchToAgent || props.switchToAIAgent}>
            <div data-view="${type}">${name}</div>
        </RightSidebar>
    `, { filename: `${name}.svelte`, generate: 'client', css: 'injected' }).js.code]))
}
const bundle = await rollup({
    input: 'entry',
    onwarn(warning) { if (warning.code !== 'CIRCULAR_DEPENDENCY') { throw new Error(warning.message) } },
    plugins: [{
        name: 'right-sidebar-fixture',
        resolveId(source, importer) {
            if (source in modules) { return source }
            if (source === 'svelte') { return require.resolve('svelte').replace('index-server.js', 'index-client.js') }
            if (source.startsWith('.')) { return resolve(importer?.startsWith('/') ? dirname(importer) : root, source) }
            if (source === 'clsx') { return createRequire(importer).resolve(source).replace(/\.js$/, '.mjs') }
            return createRequire(importer?.startsWith('/') ? importer : import.meta.url).resolve(source)
        },
        load(id) {
            if (id in modules) { return modules[id] }
            const text = Deno.readTextFileSync(id)
            return id.endsWith('.svelte') ? compile(text, { filename: id, generate: 'client', css: 'injected' }).js.code : text
        }
    }]
})
const { output } = await bundle.generate({ format: 'es' })
await bundle.close()
const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
    if (new URL(request.url).pathname === '/fixture.js') {
        return new Response(output[0].code, { headers: { 'content-type': 'text/javascript' } })
    }
    return new Response(`<style>${Deno.readTextFileSync(`${root}app/menus.css`)}
        body { background: #222; margin: 0 }
        .sidebar-right { position: fixed; right: 0; top: 0; z-index: 2 }
        .sidebar-button { width: 28px; height: 28px }
        .sidebar-button svg { width: 16px; height: 16px }
        .sidebar-container { display: flex; position: fixed; right: 0; top: 50px }
        .sidebar-panel { width: 340px; height: 500px }
    </style><script type="module" src="/fixture.js"></script>`, { headers: { 'content-type': 'text/html' } })
})
const profile = `${root}.cache/right-sidebar-${crypto.randomUUID()}`
const browser = await puppeteer.launch({ headless: true, userDataDir: profile })
try {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    await page.setViewport({ width: 1400, height: 800 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.addr.port}`)
    const button = type => `[data-sidebar="${type}"]`
    const views = () => page.$$eval('[data-view]', nodes => nodes.map(node => node.dataset.view))
    async function expectViews(expected) {
        await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-view]')].map(node => node.dataset.view)) === JSON.stringify(expected), {}, expected)
        assert.deepEqual(await views(), expected)
    }
    async function openMenu(type) {
        await page.click(button(type), { button: 'right' })
        await page.waitForSelector('[role="menu"]')
    }
    async function add(type) {
        await openMenu(type)
        await page.click('[data-menu-item="additional-sidebar"]')
    }
    await page.click(button('settings'))
    await expectViews(['settings'])
    assert.equal(await page.$('.sidebar-nav-buttons'), null)
    await page.click('button[aria-label="Developer"]')
    await page.click('.app-toolbar-menu-panel [data-menu-action]')
    await expectViews(['devTools'])
    await page.click(button('activity'))
    await expectViews(['activity'])
    await add('resources')
    await expectViews(['resources', 'activity'])
    assert.equal(await page.$$eval('.sidebar-nav-buttons', nodes => nodes.length), 2)
    assert.deepEqual(await page.$$eval('.sidebar-nav-button.active', nodes => nodes.map(node => node.getAttribute('aria-label'))), ['Resources', 'Activity'])
    await page.click('.sidebar-panel [aria-label="User Mods"]')
    await expectViews(['userMods', 'activity'])
    await page.click(button('settings'))
    await expectViews(['userMods', 'settings'])
    await page.click(button('userMods'))
    await expectViews(['settings', 'userMods'])
    await add('resources')
    await expectViews(['resources', 'settings', 'userMods'])
    await page.click('.sidebar-panel [aria-label="Dev Tools"]')
    await expectViews(['devTools', 'settings', 'userMods'])
    await page.click('.sidebar-panel [aria-label="Agent"]')
    await expectViews(['aiAgent', 'settings', 'userMods'])
    await page.focus('.sidebar-panel [aria-label="Activity"]')
    await page.keyboard.press('Enter')
    await expectViews(['activity', 'settings', 'userMods'])
    await openMenu('resources')
    await page.keyboard.press('Escape')
    assert.equal(await page.$('[role="menu"]'), null)
    assert.equal(await page.$eval(button('resources'), node => node === document.activeElement), true)
    await openMenu('resources')
    await page.mouse.click(20, 700)
    assert.equal(await page.$('[role="menu"]'), null)
    await page.focus(button('resources'))
    await page.keyboard.down('Shift')
    await page.keyboard.press('F10')
    await page.keyboard.up('Shift')
    await page.waitForSelector('[role="menu"]')
    await page.keyboard.press('Escape')
    await page.hover(button('resources'))
    await page.mouse.down({ button: 'right' })
    await page.waitForSelector('[role="menu"]')
    await page.keyboard.press('Escape')
    await page.mouse.up({ button: 'right' })
    assert.equal(await page.$('[role="menu"]'), null)
    await page.hover(button('resources'))
    await page.mouse.down({ button: 'right' })
    await page.waitForSelector('[role="menu"]')
    await page.hover('[data-menu-item="additional-sidebar"]')
    await page.mouse.up({ button: 'right' })
    await expectViews(['resources', 'activity', 'settings', 'userMods'])
    await page.click('.sidebar-panel .close-button')
    await page.hover(button('resources'))
    await page.mouse.down({ button: 'right' })
    await new Promise(resolve => setTimeout(resolve, 550))
    await page.mouse.up({ button: 'right' })
    assert.equal(await page.$('[role="menu"]'), null)
    await expectViews(['activity', 'settings', 'userMods'])
    await openMenu('resources')
    await page.keyboard.press('Enter')
    await expectViews(['resources', 'activity', 'settings', 'userMods'])
    assert.deepEqual(await page.evaluate(() => window.savedSidebars), ['userMods', 'settings', 'activity', 'resources'])
    while ((await views()).length > 1) {
        await page.click('.sidebar-panel .close-button')
    }
    assert.equal(await page.$('.sidebar-nav-buttons'), null)
    assert.deepEqual(errors, [])
    console.log('Right sidebar switching, ordering, headers, context menus, gestures, and keyboard checks passed')
} finally {
    await browser.close()
    await server.shutdown()
    await Deno.remove(profile, { recursive: true })
}

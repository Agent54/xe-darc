import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { rollup } from 'rollup'
import { compile } from 'svelte/compiler'
import puppeteer from 'puppeteer'

const root = new URL('../', import.meta.url).pathname
const require = createRequire(import.meta.url)
const app = Deno.readTextFileSync(`${root}app/App.svelte`)
compile(app, { filename: `${root}app/App.svelte`, generate: 'client' })
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)) + end.length)
const fixture = `<script>
    import AppToolbarMenu from './app/components/AppToolbarMenu.svelte'
    import HeaderOptionsMenu from './app/components/HeaderOptionsMenu.svelte'
    import AppearanceContextMenu from './app/components/AppearanceContextMenu.svelte'
    let statusLightsEnabled = $state(true), appearanceMenu = $state(null)
    let globalTabComplete = $state(true), devModeEnabled = $state(true)
    let showNavigationToolbar = $state(false), showSidebarUrl = $state(false)
    let tabSidebarVisible = $state(true), rightToolbarAutohide = $state(false)
    let secondScreenActive = $state(false), isFullscreen = $state(false)
    const focusModeEnabled = false, focusModeHovered = false, iwaVersion = 'test'
    let menuForceClose = $state(false)
    const closeMenuImmediately = () => {
        menuForceClose = true
        window.dispatchEvent(new Event('darc-dismiss-header-options'))
    }
    const record = action => window.actions.push(action)
    const data = { loadSampleData: () => record('sample'), spaceMeta: { activeSpace: 'space' }, newTab: () => record('logs') }
    const toggleSidebar = name => record(name)
    const openTestSuite = () => record('tests'), openComposeUI = () => record('compose'), openVSCodeWorkspace = () => record('code')
    const showShortcutOverview = () => record('shortcuts'), showGestureOverview = () => record('gestures')
    const toggleGlobalTabComplete = () => { globalTabComplete = !globalTabComplete; record('completion') }
    const toggleDevMode = () => { devModeEnabled = !devModeEnabled }
    const toggleShowNavigationToolbar = () => { showNavigationToolbar = !showNavigationToolbar }
    const toggleShowSidebarUrl = () => { showSidebarUrl = !showSidebarUrl }
    const toggleSidebarAutohide = () => { tabSidebarVisible = !tabSidebarVisible; rightToolbarAutohide = !rightToolbarAutohide }
    const toggleSecondScreen = () => { secondScreenActive = !secondScreenActive }
    const toggleFullscreen = () => { isFullscreen = !isFullscreen }
    const toggleStatusLights = () => { statusLightsEnabled = !statusLightsEnabled }
    const toggleRightToolbarAutohide = () => { rightToolbarAutohide = !rightToolbarAutohide }
    const toggleTabSidebar = () => { tabSidebarVisible = !tabSidebarVisible }
</script>
${section('{#snippet helpMenu()}', '{/snippet}\n\n    <HeaderOptionsMenu').replace(/\n\n    <HeaderOptionsMenu$/, '')}
<header>${section('<HeaderOptionsMenu label="Options"', '</HeaderOptionsMenu>')}</header>
${section('{#snippet developerMenu(select)}', '{/snippet}')}
<div class="developer-fixture">${section('<AppToolbarMenu label="Developer"', '</AppToolbarMenu>')}</div>
<button class="lights" oncontextmenu={event => { event.preventDefault(); event.stopPropagation(); appearanceMenu = { x: event.clientX, y: event.clientY, area: 'status-lights', target: event.currentTarget } }}>Status lights: {statusLightsEnabled}</button>
${section('{#if appearanceMenu}', '{/if}')}
`
const modules = {
    entry: `import { mount } from 'svelte'; import Fixture from 'fixture'; window.actions = []; mount(Fixture, { target: document.body })`,
    fixture: compile(fixture, { filename: `${root}tests/toolbar-fixture.svelte`, generate: 'client', css: 'injected' }).js.code,
    'esm-env': 'export const BROWSER = true, DEV = false, BUILD = false'
}
const bundle = await rollup({
    input: 'entry',
    onwarn(warning) { if (warning.code !== 'CIRCULAR_DEPENDENCY') { throw new Error(warning.message) } },
    plugins: [{
        name: 'toolbar-fixture',
        resolveId(source, importer) {
            if (source in modules) { return source }
            if (source === 'svelte') { return require.resolve('svelte').replace('index-server.js', 'index-client.js') }
            if (source.startsWith('.')) { return resolve(importer?.startsWith('/') ? dirname(importer) : root, source) }
            if (source === 'clsx') { return createRequire(importer).resolve(source).replace(/\.js$/, '.mjs') }
            return createRequire(importer?.startsWith('/') ? importer : import.meta.url).resolve(source)
        },
        load(id) {
            if (id in modules) { return modules[id] }
            const source = Deno.readTextFileSync(id)
            return id.endsWith('.svelte') ? compile(source, { filename: id, generate: 'client', css: 'injected' }).js.code : source
        }
    }]
})
const { output } = await bundle.generate({ format: 'es' })
await bundle.close()
const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
    if (new URL(request.url).pathname === '/fixture.js') { return new Response(output[0].code, { headers: { 'content-type': 'text/javascript' } }) }
    return new Response(`<style>${Deno.readTextFileSync(`${root}app/app.css`)}\n${Deno.readTextFileSync(`${root}app/menus.css`)}</style>
        <style>body { background: #151515; color: white; } svg { width: 16px; height: 16px; } .developer-fixture { position: fixed; right: 20px; top: 300px; } .lights { position: fixed; right: 20px; bottom: 20px; }</style>
        <script type="module" src="/fixture.js"></script>`, { headers: { 'content-type': 'text/html' } })
})
let browser
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: `${root}.cache/toolbar-menus-browser-${crypto.randomUUID()}` })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.setDefaultTimeout(5000)
    await page.setViewport({ width: 1000, height: 760 })
    await page.goto(`http://127.0.0.1:${server.addr.port}`)
    await page.waitForSelector('[aria-label="Options"]')
    await page.evaluate(() => {
        window.syntheticClicks = 0
        document.addEventListener('click', event => {
            if (event.detail === 0) { window.syntheticClicks++ }
        }, true)
    })
    const menu = label => `[role="menu"][aria-label="${label}"]`
    const trigger = label => `button[aria-label="${label}"]`
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
    for (const label of ['Developer']) {
        await page.hover(trigger(label))
        await page.mouse.down()
        await page.waitForSelector(menu(label))
        await page.mouse.up()
        assert.ok(await page.$(menu(label)), 'Short press leaves menu open')
        await page.keyboard.press('Escape')
        assert.equal(await page.$(menu(label)), null)
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), label)
        await page.mouse.down()
        await pause(550)
        await page.mouse.up()
        assert.equal(await page.$(menu(label)), null, 'Holding trigger dismisses')
        await page.mouse.down()
        await page.keyboard.press('Escape')
        await page.mouse.up()
        assert.equal(await page.$(menu(label)), null, 'Escape cancels trailing release')
        await page.click(trigger(label))
        await page.mouse.move(10, 200)
        await page.mouse.down()
        assert.equal(await page.$(menu(label)), null, 'Outside press dismisses')
        await page.mouse.up()
    }
    await page.hover(trigger('Developer'))
    await page.mouse.down()
    await page.hover(`${menu('Developer')} [data-menu-action]`)
    await page.mouse.up()
    assert.deepEqual(await page.evaluate(() => window.actions), ['devTools'], 'Drag release selects once')
    assert.equal(await page.$(menu('Developer')), null)
    await page.click(trigger('Developer'))
    assert.deepEqual(await page.$$eval(`${menu('Developer')} [data-menu-action]`, nodes => nodes.map(node => node.textContent.trim())), ['Dev Tools', 'Load Sample Data', 'Open Test Suite', 'Logs', 'Compose UI', 'Code'])
    await page.keyboard.press('Escape')
    await page.focus(trigger('Options'))
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Keyboard shortcuts')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    assert.deepEqual(await page.evaluate(() => window.actions), ['devTools', 'gestures'])
    assert.equal(await page.$eval(menu('Options'), node => node.classList.contains('menu-force-close')), true, 'Submenu action closes both header menus')
    await page.mouse.move(10, 200)
    await page.hover(trigger('Options'))
    await page.waitForSelector(menu('Options'), { visible: true })
    await page.hover(`${menu('Options')} [data-menu-action]`)
    await page.mouse.down()
    assert.deepEqual(await page.evaluate(() => window.actions), ['devTools', 'gestures', 'completion'], 'Later selection acts on mousedown')
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.actions.length), 3)
    await page.mouse.move(10, 200)
    await page.hover(trigger('Options'))
    await page.waitForSelector(menu('Options'), { visible: true })
    await page.hover(trigger('Help'))
    await page.mouse.down()
    await page.waitForSelector(menu('Help'), { visible: true })
    await page.hover(`${menu('Help')} [data-menu-action]`)
    await page.mouse.up()
    assert.deepEqual(await page.evaluate(() => window.actions), ['devTools', 'gestures', 'completion', 'shortcuts'], 'Help supports press-drag-release selection')
    await page.mouse.move(10, 200)
    await page.hover(trigger('Options'))
    await page.waitForSelector(menu('Options'), { visible: true })
    await page.mouse.down()
    assert.equal(await page.evaluate(() => window.actions.at(-1)), 'settings', 'Header Options opens Settings on mousedown')
    assert.equal(await page.$eval(menu('Options'), node => node.classList.contains('menu-force-close')), true)
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.actions.length), 5, 'Release does not run Settings again')
    for (const checked of ['true', 'false', 'true']) {
        await page.click('.lights', { button: 'right' })
        await page.waitForSelector('.appearance-context-menu')
        assert.equal(await page.$eval('.appearance-context-menu button', node => node.getAttribute('aria-checked')), checked)
        assert.equal(await page.$eval('.appearance-context-menu button span', node => node.textContent), 'Show Status Lights')
        await page.click('.appearance-context-menu button')
        assert.equal(await page.$('.appearance-context-menu'), null)
    }
    await page.mouse.move(10, 200)
    await page.hover(trigger('Options'))
    await page.waitForSelector(menu('Options'), { visible: true })
    await page.hover(trigger('Help'))
    await page.waitForSelector(menu('Help'), { visible: true })
    await page.click(trigger('Help'))
    assert.ok(await page.$(menu('Help')), 'Clicking a hovered submenu keeps it open')
    const bounds = await page.$$eval('.header-options-panel', nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
    assert.ok(bounds.every(rect => rect.left >= 0 && rect.right <= 1000 && rect.bottom <= 760))
    await page.waitForFunction(() => [...document.querySelectorAll('.header-options-panel')].every(node => getComputedStyle(node).opacity === '1'))
    await page.screenshot({ path: `${root}.cache/toolbar-menus.png` })
    await page.mouse.move(10, 200)
    await pause(150)
    assert.equal(await page.$eval(menu('Options'), node => getComputedStyle(node).visibility), 'visible', 'Header hover menu retains its close delay')
    await page.waitForSelector(menu('Options'), { hidden: true })
    await page.hover(trigger('Options'))
    await page.waitForSelector(menu('Options'), { visible: true })
    await page.$eval('header', node => node.classList.add('window-background'))
    await page.waitForSelector(menu('Options'), { hidden: true })
    assert.equal(await page.$eval(menu('Options'), node => getComputedStyle(node).visibility), 'hidden', 'Background windows suppress header hover menus')
    assert.equal(await page.evaluate(() => window.syntheticClicks), 0, 'Menu actions never dispatch synthetic click events')
    assert.deepEqual(errors, [])
    console.log('Toolbar menus: gestures, keyboard, Help submenu, developer actions and status-light toggling passed')
} finally {
    await browser?.close()
    await server.shutdown()
}

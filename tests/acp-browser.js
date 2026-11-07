import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { compile } from 'svelte/compiler'
import puppeteer from 'puppeteer'
import { mockEndpoint } from './acp.test.js'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite'))('esbuild')
const root = new URL('../', import.meta.url).pathname
const host = await mockEndpoint()
const fixture = compile(`
    <script>
        import AgentSidebar from './app/components/AgentSidebar.svelte'
        import AcpSettings from './app/components/AcpSettings.svelte'
        import data from 'fixture-data'
        let panel = $state('settings')
        const settings = () => { panel = 'settings' }
        window.showAgent = () => { panel = 'agent' }
        window.hideAgent = () => { panel = null }
        window.showSettings = settings
    </script>
    {#if panel === 'settings'}<div style="padding:20px"><AcpSettings /></div>{/if}
    {#if panel === 'agent'}<AgentSidebar onClose={() => { panel = null }} switchToSettings={settings} currentTab={data.docs.page} />{/if}
`, { filename: `${root}acp-fixture.svelte`, generate: 'client', css: 'injected' }).js.code

let browser
let server
try {
    const { outputFiles } = await build({
        stdin: { resolveDir: root, contents: `
            import { mount } from 'svelte'
            import Fixture from 'acp-fixture'
            import { agent, agentState } from './app/lib/agent.js'
            import data from 'fixture-data'
            import { pageContentScript } from './app/lib/page-content.js'
            window.agent = agent
            window.fixtureData = data
            window.pageContentScript = pageContentScript
            agentState.subscribe(state => { window.agentState = state })
            mount(Fixture, { target: document.querySelector('#app') })
        ` }, bundle: true, platform: 'browser', format: 'esm', write: false,
        conditions: ['browser'],
        plugins: [{ name: 'acp-browser-fixture', setup(build) {
            build.onResolve({ filter: /^acp-fixture$/ }, () => ({ path: 'fixture', namespace: 'fixture' }))
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, resolveDir: root }))
            build.onResolve({ filter: /(?:data\.svelte\.js|^fixture-data$)/ }, () => ({ path: 'data', namespace: 'fixture-data' }))
            build.onLoad({ filter: /.*/, namespace: 'fixture-data' }, () => ({ contents: `
                const data = {
                    docs: { page: { id: 'page', type: 'tab', title: 'Test page', url: 'https://example.com', spaceId: 'space' } },
                    spaces: { space: {} }, spaceMeta: { activeSpace: 'space', activeTabId: 'page' }, created: [], reads: [],
                    activateSpace(id) { this.spaceMeta.activeSpace = id }, activate(id) { this.spaceMeta.activeTabId = id },
                    async readPage(id, options) { this.reads.push({ id, options }); return 'Page text from browser fixture' },
                    async newTab(spaceId, options) {
                        const tab = { id: 'new-' + this.created.length, type: 'tab', spaceId, ...options }
                        this.created.push(tab); this.docs[tab.id] = tab; return tab
                    }
                }
                export default data
            ` }))
            build.onLoad({ filter: /\.svelte$/ }, async args => ({
                contents: compile(await Deno.readTextFile(args.path), { filename: args.path, generate: 'client', css: 'injected' }).js.code,
                loader: 'js'
            }))
        } }]
    })
    const bundle = outputFiles[0].text
    server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => new Response(
        new URL(request.url).pathname === '/entry.js' ? bundle : `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111;color:#ddd;font:13px sans-serif}#app{height:100vh;width:420px;margin:auto}.w-3{width:12px;height:12px}.w-4{width:16px;height:16px}svg{max-width:16px}</style></head><body><div id="app"></div><script type="module" src="/entry.js"></script></body></html>`,
        { headers: { 'Content-Type': new URL(request.url).pathname === '/entry.js' ? 'text/javascript' : 'text/html' } }
    ))
    browser = await puppeteer.launch({ headless: true, userDataDir: `${root}.cache/acp-chromium`, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setViewport({ width: 480, height: 850 })
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message) })
    await page.goto(`http://127.0.0.1:${server.addr.port}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    console.log('ACP settings mounted')
    await page.type('input[aria-label="ACP endpoint"]', host.endpoint)
    await page.type('input[aria-label="ACP bearer token"]', 'browser-token')
    const button = async label => {
        const buttons = await page.$$('button')
        for (const element of buttons) {
            if (await element.evaluate(node => node.textContent.trim()) === label) {
                await element.click()
                return
            }
        }
        throw new Error(`Button not found: ${label}`)
    }
    await button('Test connection')
    await page.waitForFunction(() => document.body.textContent.includes('Mock agent connected'))
    console.log('ACP connection tested')
    assert.equal(host.sessions.size, 0)
    await button('Save connection')
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('browser-token')), false)
    await page.evaluate(() => window.showAgent())
    await page.waitForSelector('textarea[aria-label="Message agent"]')
    const send = async text => {
        await page.type('textarea[aria-label="Message agent"]', text)
        await page.focus('textarea[aria-label="Message agent"]')
        await page.keyboard.press('Enter')
    }
    await send('hello')
    await page.waitForFunction(() => !window.agentState.processing && window.agentState.conversations[0]?.messages.length >= 3)
    console.log('ACP chat rendered')
    assert.equal(await page.$eval('.agent-markdown strong', node => node.textContent), 'ACP')
    await page.select('select[aria-label="Agent model"]', 'deep')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions[0].currentValue === 'deep')
    await page.evaluate(() => window.hideAgent())
    await page.waitForFunction(() => !document.querySelector('.agent-panel'))
    await page.evaluate(() => window.showAgent())
    await page.waitForSelector('.agent-markdown strong')
    assert.equal(host.sessions.size, 1)

    await send('tool:["displayHtml",{"html":"<h1>Created page</h1>","title":"Created page"}]')
    await page.waitForSelector('.agent-approval')
    assert.equal(await page.evaluate(() => window.fixtureData.created.length), 0)
    await button('Allow once')
    await page.waitForFunction(() => !window.agentState.processing && window.fixtureData.created.length === 1)
    assert.equal(await page.evaluate(() => window.fixtureData.created[0].spaceId), 'space')

    await send('permission')
    await page.waitForSelector('.agent-approval')
    await button('Proceed')
    await page.waitForFunction(() => !window.agentState.processing)
    assert.equal(host.calls.at(-1).result.outcome.optionId, 'opaque-allow-83')

    const result = await page.evaluate(() => {
        const doc = document.implementation.createHTMLDocument('Page read test')
        doc.body.innerHTML = '<main><p id="target">Selected text</p><p>Other text</p></main>'
        const run = options => new Function('document', 'XPathResult', `return ${window.pageContentScript(options)}`)(doc, XPathResult)
        return { text: run({ textOnly: true, selector: '//*[@id="target"]' }), html: run({ textOnly: false, selector: '//*[@id="target"]' }) }
    })
    assert.equal(result.text, 'Selected text')
    assert.equal(result.html, '<p id="target">Selected text</p>')

    await Deno.mkdir(`${root}.cache/acp`, { recursive: true })
    await page.screenshot({ path: `${root}.cache/acp/agent.png`, fullPage: true })
    await page.evaluate(() => window.showSettings())
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    assert.equal(await page.$eval('input[aria-label="ACP endpoint"]', node => node.value), host.endpoint)
    await page.screenshot({ path: `${root}.cache/acp/settings.png`, fullPage: true })
    assert.deepEqual(errors, [])
    console.log('ACP browser UI, HTTP CORS, settings, Markdown, config, sidebar lifecycle, approvals, HTML creation, and XPath tests passed')
} finally {
    await browser?.close()
    await server?.shutdown()
    await host.close()
}

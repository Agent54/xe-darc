import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { compile, parse } from 'svelte/compiler'
import puppeteer from 'puppeteer'
import { mockEndpoint } from './acp.test.js'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite'))('esbuild')
const root = new URL('../', import.meta.url).pathname
const app = parse(await Deno.readTextFile(`${root}app/App.svelte`), { modern: true })
const components = []
function collectComponents(node) {
    if (!node || typeof node !== 'object') { return }
    if (node.type === 'Component') { components.push(node) }
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) { value.forEach(collectComponents) } else { collectComponents(value) }
    }
}
collectComponents(app.fragment)
const sidebar = components.find(node => node.name === 'AgentSidebar')
assert.equal(sidebar.attributes.find(attribute => attribute.type === 'BindDirective' && attribute.name === 'conv')?.expression.name, 'agentEnabled')
assert(components.some(node => node.name === 'Agent'))
const releaseMarkdown = Promise.withResolvers()
const releaseDocument = Promise.withResolvers()
const finishDocument = Promise.withResolvers()
const host = await mockEndpoint({
    afterFirstChunk: text => {
        if (text === 'hello') { return releaseMarkdown.promise }
        if (text === 'long reply') { return releaseDocument.promise }
    },
    afterDocumentChunk: () => finishDocument.promise
})
const fixture = compile(`
    <script>
        import AgentSidebar from './app/components/AgentSidebar.svelte'
        import Agent from './app/components/Agent.svelte'
        import AcpSettings from './app/components/AcpSettings.svelte'
        import data from 'fixture-data'
        let panel = $state('settings')
        let voiceEnabled = $state(false)
        const settings = () => { panel = 'settings' }
        window.showAgent = () => { panel = 'agent' }
        window.hideAgent = () => { panel = null }
        window.showSettings = settings
    </script>
    <button aria-label="Voice Agent" aria-pressed={voiceEnabled} onmousedown={() => { voiceEnabled = !voiceEnabled }}>Voice Agent</button>
    {#if voiceEnabled}<Agent />{/if}
    {#if panel === 'settings'}<div style="padding:20px"><AcpSettings /></div>{/if}
    {#if panel === 'agent'}<AgentSidebar bind:conv={voiceEnabled} onClose={() => { panel = null }} switchToSettings={settings} currentTab={data.docs.page} />{/if}
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
            build.onResolve({ filter: /mcp-service\.js$/ }, () => ({ path: 'mcp-service', namespace: 'mcp-service' }))
            build.onLoad({ filter: /.*/, namespace: 'mcp-service' }, () => ({ contents: `
                import { readable } from 'svelte/store'
                export const mcp = { state: { connections: [] } }
                export const mcpState = readable(mcp.state)
            `, resolveDir: root }))
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
    const voiceRequests = []
    page.on('request', request => { if (/elevenlabs|agent_app/.test(request.url())) { voiceRequests.push(request.url()) } })
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message) })
    await page.goto(`http://127.0.0.1:${server.addr.port}`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    console.log('ACP settings mounted')
    const button = async label => {
        const buttons = await page.$$('button')
        for (const element of buttons) {
            if (await element.evaluate(node => node.textContent.trim()) === label) {
                await element.evaluate(node => node.scrollIntoView({ block: 'center' }))
                await element.click()
                return
            }
        }
        throw new Error(`Button not found: ${label}`)
    }
    const send = async text => {
        await page.type('textarea[aria-label="Message agent"]', text)
        await page.focus('textarea[aria-label="Message agent"]')
        await page.keyboard.press('Enter')
    }
    const clickInTranscript = async selector => {
        const element = await page.waitForSelector(selector)
        await element.evaluate(node => node.scrollIntoView({ block: 'center' }))
        await element.click()
    }
    const waitForVisibleDemo = async title => {
        await page.waitForFunction(expectedTitle => {
            const heading = [...document.querySelectorAll('.assistant-doc .agent-markdown.streaming h1')]
                .find(node => node.textContent === expectedTitle)
            if (!heading) { return false }
            const bounds = heading.getBoundingClientRect()
            const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
            return heading.contains(hit) && Number(getComputedStyle(heading.closest('.assistant-doc')).opacity) > 0.9
        }, { timeout: 4000 }, title)
    }

    await page.evaluate(() => window.showAgent())
    await page.waitForSelector('textarea[aria-label="Message agent"]')
    await send('cards')
    await page.waitForSelector('.agent-info-card')
    assert.equal(await page.$$eval('.agent-info-card', cards => cards.length), 23)
    assert.equal(await page.$$eval('.agent-info-card.denied', cards => cards.length), 3)
    await send('test')
    await page.waitForFunction(() => document.querySelector('.assistant-chat .agent-markdown')?.textContent.includes('Hello world! This is a test response.'))
    await send('doc')
    await waitForVisibleDemo('Comprehensive Analysis Report')
    const reportHeading = await page.$('.assistant-doc .agent-markdown.streaming h1')
    await Deno.mkdir(`${root}.cache/acp`, { recursive: true })
    await page.screenshot({ path: `${root}.cache/acp/demo-markdown-streaming.png` })
    await page.waitForSelector('.assistant-doc .agent-markdown.streaming table')
    assert.equal(await reportHeading.evaluate(node => node.isConnected), true)
    await page.waitForSelector('.assistant-doc .agent-markdown:not(.streaming) table')
    assert.match(await page.$eval('.assistant-doc .agent-markdown', node => node.textContent), /Report generated on/)
    await button('search')
    await waitForVisibleDemo('Test Document')
    await page.waitForFunction(() => document.querySelectorAll('.assistant-doc .agent-markdown:not(.streaming) pre code').length === 2)
    assert.equal(host.headers.length, 0)
    await button('New')
    await page.evaluate(() => window.showSettings())
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    await page.type('input[aria-label="ACP endpoint"]', host.endpoint)
    await page.type('input[aria-label="ACP bearer token"]', 'browser-token')

    await button('Test connection')
    await page.waitForFunction(() => document.body.textContent.includes('Mock agent connected'))
    console.log('ACP connection tested')
    assert.equal(host.sessions.size, 0)
    await button('Save connection')
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('browser-token')), false)
    await page.evaluate(() => window.showAgent())
    await page.waitForSelector('textarea[aria-label="Message agent"]')
    assert.deepEqual(await page.$$eval('.agent-quick-action', nodes => nodes.map(node => node.textContent).filter(text => ['search', 'ask', 'do', 'remember', 'see'].includes(text))), ['search', 'ask', 'do', 'remember', 'see'])
    await page.click('button[aria-label="Voice Input"]')
    await page.waitForSelector('[data-agent-host="acp"]')
    assert.equal(await page.$eval('button[aria-label="Voice Agent"]', node => node.getAttribute('aria-pressed')), 'true')
    await page.evaluate(() => window.hideAgent())
    await page.waitForFunction(() => !document.querySelector('.agent-panel'))
    assert(await page.$('[data-agent-host="acp"]'))
    await page.evaluate(() => window.showAgent())
    await page.waitForSelector('button[aria-label="Voice Input"][aria-pressed="true"]')
    await page.click('button[aria-label="Voice Agent"]')
    await page.waitForFunction(() => !document.querySelector('[data-agent-host="acp"]'))
    await button('ask')
    assert.equal(await page.$eval('textarea[aria-label="Message agent"]', node => node.value), 'ask about ')
    await page.$eval('textarea[aria-label="Message agent"]', node => { node.value = ''; node.dispatchEvent(new Event('input', { bubbles: true })) })
    await button('Connect')
    await page.waitForSelector('select[aria-label="Agent model"] optgroup[label="Recommended"]')
    assert.equal(host.sessions.size, 1)
    assert.equal(host.prompts.length, 0)
    await page.click('.agent-selector-row input[type="checkbox"]')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions.find(option => option.id === 'fastMode').currentValue === true)
    await page.select('select[aria-label="Agent model"]', 'deep')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions[0].currentValue === 'deep')
    await send('hello')
    await page.waitForFunction(() => document.querySelector('.assistant-chat .agent-markdown.streaming')?.textContent.includes('Hello'))
    assert.equal(await page.evaluate(() => window.agentState.processing), true)
    assert.equal(await page.$('.assistant-chat .agent-markdown strong'), null)
    await send('test')
    releaseMarkdown.resolve()
    await page.waitForFunction(() => !window.agentState.processing && window.agentState.conversations[0]?.messages.length >= 3)
    console.log('ACP chat rendered')
    assert.equal(await page.$eval('.agent-markdown strong', node => node.textContent), 'ACP')
    const openaiAvatar = '.assistant-chat .agent-avatar[title="OpenAI O3"]'
    assert.match(await page.$eval(`${openaiAvatar} path`, path => path.getAttribute('d')), /^M22\.282/)
    assert.match(await page.$eval('.agent-chat-message-time', node => node.textContent), /\d/)
    await Deno.mkdir(`${root}.cache/acp`, { recursive: true })
    await page.screenshot({ path: `${root}.cache/acp/restored-controls.png`, fullPage: true })
    await page.hover('.agent-markdown-message')
    await clickInTranscript('button[aria-label="Good response"]')
    await page.waitForFunction(() => window.agentState.conversations[0].messages.find(message => message.role === 'assistant').feedback === 'good')
    await clickInTranscript('button[aria-label="Edit displayed message"]')
    await page.$eval('.agent-edit-input', node => { node.value = 'Edited display'; node.dispatchEvent(new Event('input', { bubbles: true })) })
    await button('Save')
    assert.equal(await page.evaluate(() => window.agentState.conversations[0].messages[0].content), 'Edited display')
    await page.select('select[aria-label="Agent model"]', 'fast')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions[0].currentValue === 'fast')
    await page.evaluate(() => window.hideAgent())
    await page.waitForFunction(() => !document.querySelector('.agent-panel'))
    await page.evaluate(() => window.showAgent())
    await page.waitForSelector('.agent-markdown strong')
    assert.equal(host.sessions.size, 1)

    await send('permission')
    await page.waitForSelector('.agent-approval')
    await button('Proceed')
    await page.waitForFunction(() => !window.agentState.processing)
    assert.equal(host.calls.at(-1).result.outcome.optionId, 'opaque-allow-83')
    const claudeAvatar = '.assistant-chat .agent-avatar[title="Claude Haiku"]'
    assert.match(await page.$eval(`${claudeAvatar} path`, path => path.getAttribute('d')), /^m4\.714/)
    assert.equal(await page.$eval(`${claudeAvatar} .agent-avatar-title-overlay`, node => node.textContent.trim()), 'H')
    assert(await page.$(openaiAvatar))

    await send('wait')
    await page.waitForFunction(() => window.agentState.processing)
    await send('queued text')
    await clickInTranscript('.agent-message-text.editable')
    await page.$eval('.agent-edit-input', node => { node.value = 'edited queue'; node.dispatchEvent(new Event('input', { bubbles: true })) })
    await button('Save')
    assert.equal(await page.evaluate(() => window.agentState.queue[0].text), 'edited queue')
    await clickInTranscript('button[title="Pause this item"]')
    await page.waitForFunction(() => window.agentState.queue[0].paused)
    await clickInTranscript('button[title="Resume this item"]')
    await page.waitForFunction(() => !window.agentState.queue[0].paused)
    await page.click('button[aria-label="Stop Current Task"]')
    await page.waitForFunction(() => !window.agentState.processing)
    await page.click('button[aria-label="Resume Queue"]')
    await page.waitForFunction(() => !window.agentState.processing && window.agentState.queue.length === 0)
    assert.equal(host.prompts.at(-1), 'edited queue')

    const composerTravel = await page.evaluate(() => {
        const panel = document.querySelector('.agent-panel')
        const scroller = panel.closest('.sidebar-content')
        const composer = panel.querySelector('.agent-conversation-input')
        scroller.scrollTop = 0
        const bottom = composer.getBoundingClientRect().top
        scroller.scrollTop = scroller.scrollHeight
        return bottom - composer.getBoundingClientRect().top
    })
    assert(composerTravel > 100, `Composer only moved ${composerTravel}px when scrolling into the spacer`)

    await send('long reply')
    const heading = await page.waitForSelector('.assistant-chat .agent-markdown.streaming h1')
    assert.equal(await heading.evaluate(node => node.textContent), 'Analysis')
    releaseDocument.resolve()
    await page.waitForSelector('.assistant-doc .agent-markdown.streaming strong')
    assert.equal(await page.$eval('.assistant-doc .agent-markdown strong', node => node.textContent), 'streamed reply')
    assert.equal(await heading.evaluate(node => node.isConnected && !!node.closest('.assistant-doc')), true)
    finishDocument.resolve()
    await page.waitForFunction(() => !window.agentState.processing && document.querySelector('.agent-response-divider')?.textContent.includes('120 prompt • 45 completion'))
    assert.equal(await page.$('.assistant-doc .agent-markdown.streaming'), null)
    assert(await page.evaluate(() => [...document.querySelectorAll('.assistant-chat .agent-markdown')].some(node => node.textContent === 'Separate reply')))

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
    await page.select('select[aria-label="Agent model"]', 'deep')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions[0].currentValue === 'deep')
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    await page.evaluate(() => window.showAgent())
    await button('Connect')
    await page.waitForFunction(() => document.querySelector('select[aria-label="Agent model"]')?.value === 'deep')
    assert.equal(host.sessions.size, 2)
    await page.evaluate(() => window.showSettings())
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    assert.equal(await page.$eval('input[aria-label="ACP endpoint"]', node => node.value), host.endpoint)
    await page.screenshot({ path: `${root}.cache/acp/settings.png`, fullPage: true })
    assert.deepEqual(errors, [])
    assert.deepEqual(voiceRequests, [])
    console.log('Agent UI, local card and Markdown demos, incremental ACP Markdown, voice toggle, queue, configuration, approvals, and XPath passed')
} finally {
    releaseMarkdown.resolve()
    releaseDocument.resolve()
    finishDocument.resolve()
    await browser?.close()
    await server?.shutdown()
    await host.close()
}

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { compile, parse } from 'svelte/compiler'
import puppeteer from 'puppeteer'
import * as acp from '@agentclientprotocol/sdk/unstable'
import { mockEndpoint } from './acp.test.js'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite'))('esbuild')
const root = new URL('../', import.meta.url).pathname
const profile = `${root}.cache/acp-chromium-${crypto.randomUUID()}`
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
let setupPermissionAnswered = false
let setupPermission
const host = await mockEndpoint({
    beforeSessionResponse: ({ sessionId, client }) => {
        if (setupPermissionAnswered) { return }
        // HTTP opens the session stream once session/new returns; buffer the request immediately.
        setupPermission = client.request(acp.methods.client.session.requestPermission, {
            sessionId, toolCall: { toolCallId: 'setup-tool', title: 'Initialize external tools', status: 'pending' },
            options: [{ optionId: 'setup-allow', name: 'Allow setup', kind: 'allow_once' }, { optionId: 'setup-deny', name: 'Deny setup', kind: 'reject_once' }]
        }).then(response => {
            assert.deepEqual(response, { outcome: { outcome: 'selected', optionId: 'setup-allow' } })
            setupPermissionAnswered = true
        })
        void setupPermission.catch(() => {})
    },
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
        import RightSidebar from './app/components/RightSidebar.svelte'
        import data from 'fixture-data'
        let panel = $state('settings')
        let voiceEnabled = $state(false)
        let currentTab = $state(data.docs.page)
        let currentGroup = $state(null)
        const settings = () => { panel = 'settings' }
        window.showAgent = () => { panel = 'agent' }
        window.hideAgent = () => { panel = null }
        window.showSettings = settings
        window.setAgentTab = (tab, group = null) => { currentTab = tab; currentGroup = group }
    </script>
    <button aria-label="Voice Agent" aria-pressed={voiceEnabled} onmousedown={() => { voiceEnabled = !voiceEnabled }}>Voice Agent</button>
    {#if voiceEnabled}<Agent />{/if}
    {#if panel === 'settings'}<RightSidebar title="Settings" onClose={() => { panel = null }}><AcpSettings /></RightSidebar>{/if}
    {#if panel === 'agent'}<AgentSidebar bind:conv={voiceEnabled} onClose={() => { panel = null }} switchToSettings={settings} {currentTab} {currentGroup} />{/if}
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
                export const mcp = {
                    state: { connections: [] }, sync() {},
                    openAcp(id) { return { name: 'darc', proxyIdentity: { id: 'identity', key: 'owner-key' },
                        reportAgent() {}, close() {}, setMcpUrl() {}, execute() { throw new Error('Unexpected tool call') } } }
                }
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
        new URL(request.url).pathname === '/entry.js' ? bundle : `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#111;color:#ddd;font:13px sans-serif}#app{height:100vh;width:420px;max-width:100%;margin:auto}.w-3{width:12px;height:12px}.w-4{width:16px;height:16px}svg{max-width:16px}</style></head><body><div id="app"></div><script type="module" src="/entry.js"></script></body></html>`,
        { headers: { 'Content-Type': new URL(request.url).pathname === '/entry.js' ? 'text/javascript' : 'text/html' } }
    ))
    browser = await puppeteer.launch({ headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.evaluateOnNewDocument(() => {
        window.darcWindowId = 'acp-test-window'
        window.waitForDarcWindowId = () => Promise.resolve(window.darcWindowId)
        window.spokenReplies = []
        window.speechCancels = 0
        window.speechSynthesis.speak = utterance => window.spokenReplies.push(utterance)
        window.speechSynthesis.cancel = () => { window.speechCancels++ }
    })
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
    const openModelMenu = async () => {
        await page.click('.agent-model-trigger')
        await page.waitForSelector('.agent-model-menu:popover-open')
    }
    const selectModel = async value => {
        await openModelMenu()
        await page.click(`.model-choice[data-model-value="${value}"]`)
        await page.waitForFunction(value => document.querySelector('.agent-model-trigger').dataset.model === value, {}, value)
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
    await selectModel('elevenlabs-river-slow')
    assert.equal(await page.evaluate(() => localStorage.getItem('agentDemoModel')), 'elevenlabs-river-slow')
    // A stream must not fade already-visible content out again when it finishes.
    await page.evaluate(() => {
        window.nextMarkdown = Promise.withResolvers()
        window.finishMarkdown = Promise.withResolvers()
        window.markdownRun = window.agent.addLocalExchange('stream regression', {
            role: 'assistant-doc',
            chunks: (async function* () {
                yield '# Stable heading\n\nFirst '
                await window.nextMarkdown.promise
                yield '**streamed** text\n'
                await window.finishMarkdown.promise
            })()
        })
    })
    const stableHeading = await page.waitForSelector('.assistant-doc h1')
    await page.waitForFunction(() => document.querySelector('.assistant-doc h1').getAnimations().length === 0)
    await stableHeading.evaluate(node => {
        window.headingRestarts = 0
        node.addEventListener('animationstart', () => { window.headingRestarts++ })
        window.nextMarkdown.resolve()
    })
    await page.waitForSelector('.assistant-doc strong')
    assert.equal(await page.$eval('.assistant-doc strong', node => node.getAnimations({ subtree: true }).length > 0), true, 'New text should fade in')
    await page.evaluate(async () => {
        window.finishMarkdown.resolve()
        await window.markdownRun
        await new Promise(resolve => setTimeout(resolve, 100))
    })
    assert.equal(await page.evaluate(() => window.headingRestarts), 0, 'Completing a stream restarted the heading animation')
    assert.equal(await stableHeading.evaluate(node => node.isConnected && getComputedStyle(node).opacity === '1'), true)
    await page.evaluate(() => window.hideAgent())
    await page.waitForFunction(() => !document.querySelector('.agent-panel'))
    await page.evaluate(() => window.showAgent())
    await page.waitForSelector('.assistant-doc h1')
    assert.equal(await page.$eval('.agent-model-trigger', node => node.dataset.model), 'elevenlabs-river-slow')
    await page.evaluate(() => {
        window.releaseStoppedDemo = Promise.withResolvers()
        window.stoppedDemo = window.agent.addLocalExchange('stop demo', {
            role: 'assistant-doc', chunks: (async function* () {
                yield 'Before stopping'
                await window.releaseStoppedDemo.promise
                yield ' SHOULD NOT APPEAR'
            })()
        })
    })
    await page.waitForSelector('.agent-markdown.streaming')
    await page.click('button[aria-label="Stop Current Task"]')
    await page.evaluate(async () => { window.releaseStoppedDemo.resolve(); await window.stoppedDemo })
    assert.equal(await page.$('.agent-markdown.streaming'), null)
    assert.equal(await page.evaluate(() => document.body.textContent.includes('SHOULD NOT APPEAR')), false)
    await button('New')
    assert.equal(await page.$('select[aria-label="Browser context"]'), null)
    await send('cards')
    await page.waitForSelector('.agent-info-card')
    assert.equal(await page.$$eval('.agent-info-card', cards => cards.length), 23)
    assert.equal(await page.$$eval('.agent-info-card.denied', cards => cards.length), 3)
    await send('test')
    await page.waitForFunction(() => document.querySelector('.assistant-chat .agent-markdown')?.textContent.includes('Hello world! This is a test response.'))
    assert.equal(await page.$eval('.assistant-chat .agent-avatar-title-overlay', node => node.textContent.trim()), 'Rs')
    await send('doc')
    await waitForVisibleDemo('Comprehensive Analysis Report')
    const reportHeading = await page.$('.assistant-doc .agent-markdown.streaming h1')
    await page.waitForFunction(() => document.querySelector('.assistant-doc .agent-markdown.streaming h1').getAnimations({ subtree: true }).length === 0)
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
    const previousConversation = await page.evaluate(() => window.agentState.activeConversationId)
    await page.select('select[aria-label="Conversation"]', 'current')
    await page.waitForFunction(id => window.agentState.activeConversationId !== id, {}, previousConversation)
    assert.equal(await page.$('.agent-markdown-message'), null)
    await page.evaluate(() => window.showSettings())
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    await page.type('input[aria-label="ACP connection name"]', 'Browser agent')
    await page.type('input[aria-label="ACP endpoint"]', host.endpoint)
    assert.equal(await page.$('input[aria-label="ACP bearer token"]'), null)

    await button('Test connection')
    await page.waitForFunction(() => document.body.textContent.includes('Mock agent connected'))
    console.log('ACP connection tested')
    assert.equal(host.sessions.size, 0)
    await button('Save connection')
    await page.waitForSelector('button[aria-label="Edit Browser agent"]')
    assert.equal(await page.$('input[aria-label="ACP endpoint"]'), null)
    assert.equal(await page.$('[aria-label="Connection browser access"]'), null)
    await page.click('button[aria-label="Edit Browser agent"]')
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    assert.equal(await page.$('input[aria-label="ACP bearer token"]'), null)
    await page.keyboard.press('Escape')
    await page.waitForSelector('button[aria-label="Edit Browser agent"]')
    assert.equal(await page.evaluate(() => localStorage.getItem('acpBearerToken:' + localStorage.getItem('selectedAcpConnection:' + window.darcWindowId))), null)
    await page.evaluate(() => window.agent.start())
    assert.equal(await page.evaluate(() => sessionStorage.getItem('acpBearerToken')), null)
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
    const permissionAction = '.agent-approval .agent-permission-btn'
    await page.waitForSelector(permissionAction)
    assert.match(await page.$eval('.agent-approval', node => node.textContent), /Initialize external tools/)
    assert.equal(await page.evaluate(() => window.agentState.conversations[0].messages[0].status), 'pending')
    const setupButton = await page.$(permissionAction)
    await setupButton.focus()
    await page.keyboard.press('Enter')
    await setupPermission
    await page.waitForFunction(() => document.querySelector('.agent-model-trigger')?.dataset.model === 'fast')
    assert(setupPermissionAnswered)
    assert.equal(await page.$(permissionAction), null)
    assert.equal(host.sessions.size, 1)
    assert.equal(host.prompts.length, 0)
    const sessionId = await page.evaluate(() => window.agentState.conversations.find(chat => chat.id === window.agentState.activeConversationId).sessionId)
    await host.notify(sessionId, { sessionUpdate: 'available_commands_update', availableCommands: ['init', 'review', 'goal', 'compact'].map(name => ({ name, description: `${name} command` })) })
    await page.waitForFunction(() => window.agentState.conversations.some(chat => chat.commands.length === 4))
    const composer = 'textarea[aria-label="Message agent"]'
    const setDraft = async value => {
        await page.focus(composer)
        await page.$eval(composer, (node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })) }, value)
    }
    assert.equal(await page.$('.agent-command-completions'), null, 'commands must not appear above an empty composer')
    await setDraft('/')
    await page.waitForSelector('.agent-command-completion')
    assert.equal(await page.$$('.agent-command-completion').then(items => items.length), 4)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    assert.equal(await page.$eval(composer, node => node.value), '/review ')
    assert.equal(await page.$('.agent-command-completions'), null)
    assert.equal(host.prompts.length, 0, 'choosing a completion must not send the prompt')
    await setDraft('/co')
    await page.waitForSelector('.agent-command-completion')
    assert.equal(await page.$$('.agent-command-completion').then(items => items.length), 1)
    await page.keyboard.press('Tab')
    assert.equal(await page.$eval(composer, node => node.value), '/compact ')
    for (const draft of ['/ ', '/review argument', '/review\n', 'ordinary text /', '/unknown']) {
        await setDraft(draft)
        assert.equal(await page.$('.agent-command-completions'), null, `no command completions for ${JSON.stringify(draft)}`)
    }
    await setDraft('/g')
    await page.waitForSelector('.agent-command-completion')
    await page.click('.agent-command-completion')
    assert.equal(await page.$eval(composer, node => node.value), '/goal ')
    await setDraft('/')
    await page.keyboard.press('Escape')
    assert.equal(await page.$('.agent-command-completions'), null)
    await setDraft('/')
    await page.focus('.agent-model-trigger')
    assert.equal(await page.$('.agent-command-completions'), null, 'leaving the composer dismisses completions')
    await setDraft('')
    console.log('ACP slash completions: prefix filtering, whitespace suppression, keyboard and mouse insertion, Escape and blur pass')
    await openModelMenu()
    assert.equal(await page.$eval('.model-search input', node => node === document.activeElement), true)
    assert.equal(await page.$$eval('.model-choice', nodes => nodes.length), 2)
    assert.equal(await page.$eval('[data-model-value="fast"] .provider-glyph', node => node.title), 'Anthropic')
    assert.equal(await page.$eval('[data-model-value="deep"] .provider-glyph', node => node.title), 'OpenAI')
    await page.type('input[aria-label="Search models"]', 'o3')
    assert.equal(await page.$$eval('.model-choice', nodes => nodes.length), 1)
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.$eval('[data-model-value="deep"]', node => node === document.activeElement), true)
    await page.click('button[aria-label="Star OpenAI O3"]')
    await page.click('button[aria-label="Starred models"]')
    assert.equal(await page.$$eval('.model-choice', nodes => nodes.map(node => node.dataset.modelValue)).then(values => values.join()), 'deep')
    await page.click('button[aria-label="Starred models"]')
    await page.focus('input[aria-label="Search models"]')
    await page.keyboard.press('Escape')
    assert.equal(await page.$('.agent-model-menu'), null)
    assert.equal(await page.$eval('.agent-model-trigger', node => node === document.activeElement), true)
    for (const width of [760, 480, 320]) {
        await page.setViewport({ width, height: 850 })
        await openModelMenu()
        assert.equal(await page.$eval('.agent-model-menu', node => {
            const rect = node.getBoundingClientRect()
            return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && node.scrollWidth <= node.clientWidth
        }), true, 'Combined model menu fits the viewport')
        await page.screenshot({ path: `${root}.cache/acp/model-menu-${width}.png` })
        await page.keyboard.press('Escape')
    }
    await page.setViewport({ width: 480, height: 850 })
    const pressTrigger = async () => {
        const box = await page.$eval('.agent-model-trigger', node => { const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } })
        await page.mouse.move(box.x, box.y)
        await page.mouse.down()
        await page.waitForSelector('.agent-model-menu:popover-open')
    }
    await pressTrigger()
    await page.keyboard.press('Escape')
    await page.mouse.up()
    assert.equal(await page.$('.agent-model-menu'), null, 'Escape cancels the opening press')
    await pressTrigger()
    await new Promise(resolve => setTimeout(resolve, 550))
    await page.mouse.up()
    assert.equal(await page.$('.agent-model-menu'), null, 'Holding and releasing the trigger dismisses the menu')
    await pressTrigger()
    const modelBox = await page.$eval('[data-model-value="deep"]', node => { const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } })
    await page.mouse.move(modelBox.x, modelBox.y)
    await page.mouse.up()
    await page.waitForFunction(() => document.querySelector('.agent-model-trigger').dataset.model === 'deep')
    assert.equal(await page.$('.agent-model-menu'), null, 'Press-drag-release selects the targeted model')
    await openModelMenu()
    await page.mouse.click(1, 1)
    assert.equal(await page.$('.agent-model-menu'), null, 'Outside mousedown dismisses the menu')
    await openModelMenu()
    await page.keyboard.down('Control')
    await page.keyboard.press('1')
    await page.keyboard.up('Control')
    await page.waitForFunction(() => document.querySelector('.agent-model-trigger').dataset.model === 'fast')
    console.log('Model menu: search, stars, provider badges, responsive layout, keyboard shortcuts, drag selection, hold/Escape/outside dismissal pass')
    await page.click('.agent-config-control input[type="checkbox"]')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions.find(option => option.id === 'fastMode').currentValue === true)
    for (const width of [480, 320]) {
        await page.setViewport({ width, height: 850 })
        assert.equal(await page.$eval('.agent-chat-input-container', node => {
            const input = document.querySelector('textarea[aria-label="Message agent"]').getBoundingClientRect()
            return [...node.querySelectorAll('select')].every(select => {
                const rect = select.getBoundingClientRect()
                return rect.bottom <= input.top && rect.left >= 0 && rect.right <= innerWidth
            })
        }), true, 'Settings fit above the composer at narrow and wide sidebar widths')
    }
    await page.screenshot({ path: `${root}.cache/acp/composer-narrow.png` })
    await page.setViewport({ width: 480, height: 850 })
    await openModelMenu()
    await page.click('[data-effort-value="high"]')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions.find(option => option.id === 'effort').currentValue === 'high')
    await openModelMenu()
    await page.focus('select[aria-label="Agent"]')
    assert.equal(await page.$eval('select[aria-label="Agent"]', node => node === document.activeElement), true)
    await page.select('select[aria-label="Agent"]', 'code')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions.find(option => option.id === 'mode').currentValue === 'code')
    await page.keyboard.press('Escape')
    assert.equal(await page.$eval('.agent-model-trigger', node => node === document.activeElement), true)
    await selectModel('deep')
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
    await page.waitForFunction(() => [...document.querySelectorAll('.agent-markdown-message')].every(node => node.getAnimations({ subtree: true }).length === 0))
    await page.screenshot({ path: `${root}.cache/acp/restored-controls.png`, fullPage: true })
    await page.hover('.agent-markdown-message')
    await clickInTranscript('button[aria-label="Good response"]')
    await page.waitForFunction(() => window.agentState.conversations[0].messages.find(message => message.role === 'assistant').feedback === 'good')
    const editSelector = 'button[aria-label="Edit displayed message"]'
    await page.hover('textarea[aria-label="Message agent"]')
    await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector).parentElement).opacity === '0', {}, editSelector)
    assert.equal(await page.$eval(editSelector, node => node.closest('.agent-chat-message-content')), null, 'Edit belongs in the footer')
    await page.hover('.agent-chat-message.user')
    await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector).parentElement).opacity === '1', {}, editSelector)
    await clickInTranscript(editSelector)
    assert.equal(await page.$eval('.agent-edit-input', node => node === document.activeElement), true)
    await page.keyboard.press('Escape')
    assert.equal(await page.$('.agent-edit-input'), null)
    await page.hover('textarea[aria-label="Message agent"]')
    await page.focus(editSelector)
    await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector).parentElement).opacity === '1', {}, editSelector)
    await page.keyboard.press('Enter')
    await page.$eval('.agent-edit-input', node => { node.value = 'Edited display'; node.dispatchEvent(new Event('input', { bubbles: true })) })
    await button('Save')
    assert.equal(await page.evaluate(() => window.agentState.conversations[0].messages.find(message => message.role === 'user').content), 'Edited display')
    await selectModel('fast')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions[0].currentValue === 'fast')
    await page.evaluate(() => window.hideAgent())
    await page.waitForFunction(() => !document.querySelector('.agent-panel'))
    await page.evaluate(() => window.showAgent())
    await page.waitForSelector('.agent-markdown strong')
    assert.equal(host.sessions.size, 1)

    await send('permission')
    await page.waitForSelector(permissionAction)
    await button('Proceed')
    await page.waitForFunction(() => !window.agentState.processing)
    assert.equal(host.calls.at(-1).result.outcome.optionId, 'opaque-allow-83')
    const approvalCards = await page.$$('.agent-approval')
    const detailsButton = await approvalCards.at(-1).$('.agent-tool-expand')
    await detailsButton.click()
    assert.match(await approvalCards.at(-1).evaluate(card => card.textContent), /Proceed/)
    assert.equal(await page.$(permissionAction), null, 'Resolved approval stays in history without decision buttons')
    const claudeAvatar = '.assistant-chat .agent-avatar[title="Claude Haiku"]'
    assert.match(await page.$eval(`${claudeAvatar} path`, path => path.getAttribute('d')), /^m4\.714/)
    assert.equal(await page.$eval(`${claudeAvatar} .agent-avatar-title-overlay`, node => node.textContent.trim()), 'H')
    assert(await page.$(openaiAvatar))

    await send('wait')
    await page.waitForFunction(() => window.agentState.processing)
    await page.type(composer, 'queued text')
    await page.click('.agent-send-button')
    await page.waitForSelector('.agent-stop-button')
    await clickInTranscript('.agent-message-text.editable')
    await page.$eval('.agent-edit-input', node => { node.value = 'edited queue'; node.dispatchEvent(new Event('input', { bubbles: true })) })
    await button('Save')
    assert.equal(await page.evaluate(() => window.agentState.queue[0].text), 'edited queue')
    await clickInTranscript('button[title="Pause this item"]')
    await page.waitForFunction(() => window.agentState.queue[0].paused)
    await clickInTranscript('button[title="Resume this item"]')
    await page.waitForFunction(() => !window.agentState.queue[0].paused)
    await send('second queued')
    await send('third queued')
    const queuedIds = await page.evaluate(() => window.agentState.queue.map(item => item.id))
    await page.hover(composer)
    assert.equal(await page.$eval('.agent-queue-drag-handle', node => getComputedStyle(node).opacity), '0')
    await page.$eval('.queued', node => {
        const scroller = node.closest('.sidebar-content')
        const header = document.querySelector('.agent-sticky-header').getBoundingClientRect()
        scroller.scrollTop += node.getBoundingClientRect().top - header.bottom - 40
    })
    await page.hover('.queued .agent-chat-message-content')
    assert.equal(await page.$eval('.agent-queue-drag-handle', node => getComputedStyle(node).opacity), '1')
    const dragPoints = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.queued')]
        const handle = rows[2].querySelector('.agent-queue-drag-handle').getBoundingClientRect()
        const target = rows[0].getBoundingClientRect()
        return { from: { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, to: { x: target.right - 20, y: target.top + 3 } }
    })
    await page.mouse.move(dragPoints.from.x, dragPoints.from.y)
    await page.mouse.down()
    await page.mouse.move(dragPoints.to.x, dragPoints.to.y, { steps: 8 })
    await page.waitForSelector('.queue-drop-before')
    await page.keyboard.press('Escape')
    await page.mouse.up()
    assert.deepEqual(await page.evaluate(() => window.agentState.queue.map(item => item.id)), queuedIds, 'Escape cancels a pending reorder')
    assert.equal(await page.$('.queue-drop-before'), null)
    const dragQueue = async (from, to) => {
        await page.mouse.move(from.x, from.y)
        await page.mouse.down()
        await page.mouse.move(to.x, to.y, { steps: 8 })
        await page.mouse.up()
    }
    await dragQueue(dragPoints.from, { x: 2, y: dragPoints.from.y })
    assert.deepEqual(await page.evaluate(() => window.agentState.queue.map(item => item.id)), queuedIds, 'Dropping outside the queue leaves it unchanged')
    await dragQueue(dragPoints.from, dragPoints.to)
    await page.waitForFunction(id => window.agentState.queue[0].id === id, {}, queuedIds[2])
    assert.deepEqual(await page.$$eval('.queued', nodes => nodes.map(node => node.dataset.queueId)), [queuedIds[2], queuedIds[0], queuedIds[1]])
    assert.equal(await page.$('.agent-edit-input'), null, 'Dragging the handle must not open the message editor')
    const movedHandle = `[data-queue-id="${queuedIds[2]}"] .agent-queue-drag-handle`
    await page.focus(movedHandle)
    await page.keyboard.press('End')
    assert.deepEqual(await page.evaluate(() => window.agentState.queue.map(item => item.id)), queuedIds)
    assert.equal(await page.$eval(movedHandle, node => node === document.activeElement), true, 'Reordering preserves keyboard focus')
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowDown')
    assert.deepEqual(await page.evaluate(() => window.agentState.queue.map(item => item.id)), [queuedIds[0], queuedIds[2], queuedIds[1]])
    await page.keyboard.press('ArrowUp')
    await page.screenshot({ path: `${root}.cache/acp/queue-reorder.png` })
    await page.click('button[aria-label="Stop Current Task"]')
    await page.waitForFunction(() => !window.agentState.processing)
    await clickInTranscript('button[aria-label="Resume Queue"]')
    await page.waitForFunction(() => !window.agentState.processing && window.agentState.queue.length === 0)
    assert.deepEqual(host.prompts.slice(-3), ['third queued', 'edited queue', 'second queued'])
    console.log('Queued messages: hover handles, drag/drop, Escape/outside cancellation, keyboard reordering, focus preservation and actual send order pass')

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

    await send('timeline')
    await page.waitForFunction(() => !window.agentState.processing && [...document.querySelectorAll('.assistant-chat .agent-markdown')].some(node => node.textContent === 'Finished.'))
    const working = '[data-tool-call-id="timeline-tool"]'
    const workingId = await page.$eval(working, node => node.closest('.agent-working').dataset.workingId)
    const workingSelector = `.agent-working[data-working-id="${workingId}"]`
    assert.equal(await page.$eval(workingSelector, node => node.open), false)
    assert.equal(await page.$eval(workingSelector, node => node.querySelector('summary span').textContent), 'working')
    assert.equal(await page.$$eval(`${workingSelector} .agent-working-item`, nodes => nodes.length), 4)
    assert.deepEqual(await page.$$eval('.agent-chat-history > *', nodes => nodes.flatMap(node => {
        if (node.matches('.agent-working') && node.querySelector('[data-tool-call-id^="timeline-"]')) {
            return ['working']
        }
        const text = node.querySelector('.agent-markdown')?.textContent
        return ['Before the tools.', 'After the tools.', 'Finished.'].includes(text) ? [text] : []
    })), ['Before the tools.', 'working', 'After the tools.', 'working', 'Finished.'])
    await page.$eval(`${workingSelector} summary`, node => node.scrollIntoView({ block: 'center' }))
    const summary = await page.$(`${workingSelector} summary`)
    const summaryBox = await summary.boundingBox()
    await page.mouse.move(summaryBox.x + 20, summaryBox.y + summaryBox.height / 2)
    await page.mouse.down()
    assert.equal(await page.$eval(workingSelector, node => node.open), true, 'working expands on mousedown')
    await page.mouse.up()
    assert.equal(await page.$eval(workingSelector, node => node.open), true, 'the trailing click must not collapse it again')
    assert.equal(await page.$eval(`${working} .agent-tool-phase`, node => node.dataset.phase), 'completed')
    await clickInTranscript(`${working} .agent-tool-expand[aria-expanded="false"]`)
    assert.equal(await page.$eval(`${working} .agent-info-card-details .tool-value`, node => node.textContent.includes('/project')), true)
    assert.equal(await page.$$eval(`${workingSelector} .agent-working-thought`, nodes => nodes.map(node => node.textContent).join(' ')), 'Inspecting inputs. Checking the result.')
    const timestamps = await page.$$eval(`${workingSelector} .agent-working-item`, nodes => nodes.map(node => ({ id: node.dataset.messageId, timestamp: node.querySelector('time').dateTime, text: node.querySelector('time').textContent })))
    const storedTimes = await page.evaluate(ids => window.agentState.conversations.find(chat => chat.id === window.agentState.activeConversationId).messages.filter(message => ids.includes(message.id)).map(message => ({ id: message.id, timestamp: message.timestamp })), timestamps.map(item => item.id))
    assert.deepEqual(timestamps.map(({ id, timestamp }) => ({ id, timestamp })), storedTimes)
    assert(timestamps.every(item => /^\d{2}:\d{2}:\d{2}$/.test(item.text)))
    await host.notify(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 'timeline-tool', title: 'Updated inspection' })
    await page.waitForFunction(() => document.querySelector('[data-tool-call-id="timeline-tool"] .agent-working-header').textContent.includes('Updated inspection'))
    assert.equal(await page.$eval(workingSelector, node => node.open), true)
    assert.deepEqual(await page.$$eval(`${workingSelector} .agent-working-item time`, nodes => nodes.map(node => node.dateTime)), timestamps.map(item => item.timestamp))
    await summary.focus()
    await page.keyboard.press('Enter')
    assert.equal(await page.$eval(workingSelector, node => node.open), false)
    await page.keyboard.press('Space')
    assert.equal(await page.$eval(workingSelector, node => node.open), true)
    await page.screenshot({ path: `${root}.cache/acp/working-timeline.png` })
    console.log('Agent timeline: adjacent thinking/tools collapse in place, individual timestamps persist, updates stay ordered and mouse/keyboard expansion pass')

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
    await selectModel('deep')
    await page.waitForFunction(() => window.agentState.conversations[0].configOptions[0].currentValue === 'deep')
    const beforeReload = await page.evaluate(() => ({ active: window.agentState.activeConversationId,
        chats: window.agentState.conversations.map(chat => ({ id: chat.id, sessionId: chat.sessionId,
            messages: chat.messages.map(message => ({ id: message.id, content: message.content })) })) }))
    const sessionCount = host.sessions.size
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('button[aria-label="Edit Browser agent"]')
    assert.equal(await page.$('input[aria-label="ACP endpoint"]'), null)
    await page.evaluate(() => window.showAgent())
    await page.waitForFunction(() => window.agentState.status === 'connected')
    await page.waitForFunction(() => document.querySelector('.agent-model-trigger')?.dataset.model === 'deep')
    assert.equal(host.sessions.size, sessionCount)
    assert.deepEqual(await page.evaluate(() => ({ active: window.agentState.activeConversationId,
        chats: window.agentState.conversations.map(chat => ({ id: chat.id, sessionId: chat.sessionId,
            messages: chat.messages.map(message => ({ id: message.id, content: message.content })) })) })), beforeReload)
    assert(host.loads.includes(beforeReload.chats.find(chat => chat.id === beforeReload.active).sessionId))
    await openModelMenu()
    await page.click('button[aria-label="Starred models"]')
    assert.deepEqual(await page.$$eval('.model-choice', nodes => nodes.map(node => node.dataset.modelValue)), ['deep'], 'Starred models survive reload')
    await page.click('button[aria-label="Starred models"]')
    await page.keyboard.press('Escape')

    const headphones = 'button[aria-label="Read agent replies aloud"]'
    assert.equal(await page.$eval(headphones, node => node.getAttribute('aria-pressed')), 'false')
    assert.equal(await page.$eval('.agent-input-hint', node => node.textContent), 'use / # @ ! for special commands')
    assert.equal(await page.$eval(headphones, node => node.getBoundingClientRect().right <= document.querySelector('.agent-mic-button').getBoundingClientRect().left), true)
    await page.type(composer, 'draft')
    assert.equal(await page.$('.agent-input-hint'), null)
    await setDraft('')
    await page.focus(headphones)
    await page.keyboard.press('Enter')
    assert.equal(await page.$eval(headphones, node => node.getAttribute('aria-pressed')), 'true')
    assert.equal(await page.evaluate(() => window.spokenReplies.length), 0, 'enabling speech must not replay history')
    await page.evaluate(() => {
        window.finishSpeechReply = Promise.withResolvers()
        window.speechReply = window.agent.addLocalExchange('Read this reply', {
            role: 'assistant',
            chunks: (async function* () {
                yield '**First** '
                await window.finishSpeechReply.promise
                yield 'reply.'
            })()
        })
    })
    await page.waitForSelector('.agent-markdown.streaming strong')
    assert.equal(await page.evaluate(() => window.spokenReplies.length), 0, 'streaming updates must not read incomplete or duplicate replies')
    const stopPosition = await page.$eval('.agent-stop-button', node => node.getBoundingClientRect().right)
    assert.equal(await page.$('.agent-send-button'), null)
    await page.type(composer, 'draft')
    assert.equal(await page.$('.agent-stop-button'), null)
    assert.equal(await page.$eval('.agent-send-button:enabled', node => node.getBoundingClientRect().right), stopPosition)
    await setDraft('')
    await page.waitForSelector('.agent-stop-button')
    await page.evaluate(async () => { window.finishSpeechReply.resolve(); await window.speechReply })
    await page.waitForFunction(() => window.spokenReplies.length === 1)
    assert.equal(await page.evaluate(() => window.spokenReplies[0].text), 'First reply.')
    await page.evaluate(() => window.agent.addLocalExchange('Another request', { role: 'assistant-doc', content: 'Second reply.' }))
    await page.waitForFunction(() => window.spokenReplies.length === 2)
    assert.deepEqual(await page.evaluate(() => window.spokenReplies.map(reply => reply.text)), ['First reply.', 'Second reply.'])
    await page.click(headphones)
    assert.equal(await page.evaluate(() => window.speechCancels), 1, 'disabling speech cancels the current and queued replies')
    await page.evaluate(() => window.agent.addLocalExchange('Muted request', { role: 'assistant', content: 'Muted reply.' }))
    await page.click(headphones)
    assert.equal(await page.evaluate(() => window.spokenReplies.length), 2, 're-enabling must not read replies received while muted')
    await page.evaluate(() => window.agent.addLocalExchange('Read another', { role: 'assistant', content: 'Third reply.' }))
    await page.waitForFunction(() => window.spokenReplies.length === 3)
    await page.evaluate(() => window.spokenReplies.at(-1).onerror({ error: 'synthesis-failed' }))
    await page.waitForFunction(() => document.querySelector('[aria-label="Read agent replies aloud"]').getAttribute('aria-pressed') === 'false')
    assert.match(await page.$eval('.agent-error', node => node.textContent), /synthesis-failed/)
    await page.click(headphones)
    await page.evaluate(() => window.agent.addLocalExchange('Final request', { role: 'assistant', content: 'Final reply.' }))
    await page.waitForFunction(() => window.spokenReplies.length === 4)
    const cancelsBeforeClose = await page.evaluate(() => window.speechCancels)
    await page.evaluate(() => window.hideAgent())
    await page.waitForSelector('.agent-panel', { hidden: true })
    assert.equal(await page.evaluate(() => window.speechCancels), cancelsBeforeClose + 1)
    await page.evaluate(() => window.showAgent())
    await page.waitForSelector(headphones)
    assert.equal(await page.$eval(headphones, node => node.getAttribute('aria-pressed')), 'false')
    await page.screenshot({ path: `${root}.cache/acp/read-aloud-composer.png` })
    console.log('Read aloud: completed replies queue once, rendered Markdown, opt-in history boundary, stop/error/cleanup, headphone placement and placeholder hint pass')
    const firstHarness = await page.evaluate(() => ({ id: window.agentState.connectionId, chat: window.agentState.activeConversationId }))
    const secondHarness = await page.evaluate(endpoint => window.agent.saveConnection({ title: 'Pi', description: '', endpoint, cwd: '/second' }).id, host.endpoint)
    await openModelMenu()
    assert.equal(await page.$('.model-choice'), null, 'An unloaded harness must not offer demo models')
    await page.click('.load-models')
    await page.waitForFunction(() => document.querySelector('.agent-model-trigger').dataset.model === 'deep' && window.agentState.conversations[0]?.sessionId)
    await selectModel('fast')
    await openModelMenu()
    await page.click('button[aria-label="Star Claude Haiku"]')
    await page.click('button[aria-label="Starred models"]')
    assert.equal(await page.$$eval('.model-choice', nodes => nodes.length), 2)
    await page.click(`.model-choice[data-harness-id="${firstHarness.id}"]`)
    await page.waitForFunction(id => window.agentState.connectionId === id, {}, firstHarness.id)
    assert.equal(await page.evaluate(() => window.agentState.activeConversationId), firstHarness.chat, 'Selecting another harness preserves its active chat')
    assert.equal(await page.$eval('.agent-model-trigger', node => node.dataset.model), 'deep')
    await openModelMenu()
    await page.click(`.model-choice[data-harness-id="${secondHarness}"]`)
    await page.waitForFunction(id => window.agentState.connectionId === id && document.querySelector('.agent-model-trigger').dataset.model === 'fast', {}, secondHarness)
    await openModelMenu()
    await page.click('button[aria-label="Browser agent"]')
    await page.waitForFunction(id => window.agentState.connectionId === id, {}, firstHarness.id)
    assert.equal(await page.$eval('.agent-model-trigger', node => node.dataset.model), 'deep', 'Harnesses retain independent model choices')
    await page.keyboard.press('Escape')
    console.log('Model menu: unloaded harness discovery, cross-harness starred selection, rail switching and independent chat/model state pass')
    const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
    const pdfData = '%PDF-1.7\nBrowser attachment context\n%%EOF'
    await Deno.writeFile(`${root}.cache/acp/context.png`, Uint8Array.from(atob(imageData), char => char.charCodeAt(0)))
    await Deno.writeTextFile(`${root}.cache/acp/context.pdf`, pdfData)
    const [fileChooser] = await Promise.all([page.waitForFileChooser(), page.click('.agent-attachment-button')])
    await fileChooser.accept([`${root}.cache/acp/context.png`, `${root}.cache/acp/context.pdf`])
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Attached files"] .agent-attachment').length === 2 && !document.querySelector('.agent-send-button').disabled)
    assert.equal(await page.$eval('.agent-attachment-button', node => {
        const button = node.getBoundingClientRect()
        const input = document.querySelector('textarea[aria-label="Message agent"]').getBoundingClientRect()
        return button.left >= input.left && button.left < input.left + 15 && button.bottom <= input.bottom && button.top > input.top + input.height / 2
    }), true, 'Attachment button sits inside the bottom left of the input')
    assert.equal(await page.$eval('[aria-label="Attached files"] img', node => node.complete && node.naturalWidth > 0), true)
    await page.click('button[aria-label="Remove context.pdf"]')
    assert.equal(await page.$$eval('[aria-label="Attached files"] .agent-attachment', nodes => nodes.length), 1)
    await page.focus('.agent-attachment-button')
    const [keyboardChooser] = await Promise.all([page.waitForFileChooser(), page.keyboard.press('Enter')])
    await keyboardChooser.accept([`${root}.cache/acp/context.pdf`])
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="Attached files"] .agent-attachment').length === 2 && !document.querySelector('.agent-send-button').disabled)
    await page.screenshot({ path: `${root}.cache/acp/attachments.png` })
    const promptsBeforeAttachments = host.promptBlocks.length
    await send('Inspect attachments')
    await page.waitForFunction(() => !window.agentState.processing && document.querySelectorAll('.agent-chat-message.user .agent-attachment').length === 2)
    assert.equal(await page.$('[aria-label="Attached files"]'), null)
    assert.equal(host.promptBlocks.length, promptsBeforeAttachments + 1)
    const uploaded = host.promptBlocks.at(-1)
    assert.equal(uploaded[0].type, 'image')
    assert.equal(uploaded[0].data, imageData)
    assert.equal(uploaded[1].resource.mimeType, 'application/pdf')
    assert.equal(atob(uploaded[1].resource.blob), pdfData)
    assert.deepEqual(uploaded[2], { type: 'text', text: 'Inspect attachments' })
    const [attachmentOnlyChooser] = await Promise.all([page.waitForFileChooser(), page.click('.agent-attachment-button')])
    await attachmentOnlyChooser.accept([`${root}.cache/acp/context.pdf`])
    await page.waitForFunction(() => !document.querySelector('.agent-send-button').disabled)
    await page.click('.agent-send-button')
    await page.waitForFunction(() => !window.agentState.processing && document.querySelectorAll('.agent-chat-message.user .agent-attachment').length === 3)
    assert.equal(host.promptBlocks.at(-1).length, 1, 'A file can be sent without accompanying text')
    assert.equal(host.promptBlocks.at(-1)[0].type, 'resource')
    console.log('Attachments: mouse/keyboard picker, multiple files, image preview, remove/reselect, transmitted image/PDF bytes and file-only prompts pass')
    const pageChat = await page.evaluate(() => window.agentState.activeConversationId)
    const newTab = { id: 'new-group-member', tabGroupId: 'browser-group', spaceId: 'space' }
    const group = { id: 'group:browser-group', tabs: [{ id: 'page', tabGroupId: 'browser-group' }, newTab] }
    await page.evaluate(({ tab, group }) => window.setAgentTab(tab, group), { tab: newTab, group })
    await page.waitForFunction(() => JSON.parse(localStorage.getItem(`acpConversations:${window.darcWindowId}:tabGroups`))['group:browser-group'])
    assert.equal(await page.evaluate(() => window.agentState.activeConversationId), pageChat, 'A new group member retains the current chat')
    await page.evaluate(() => window.setAgentTab({ id: 'unbound', spaceId: 'space' }))
    await page.waitForFunction(id => window.agentState.activeConversationId !== id, {}, pageChat)
    const emptyChat = await page.evaluate(() => window.agentState.activeConversationId)
    assert.equal(await page.$('.agent-markdown-message'), null)
    await page.evaluate(() => window.setAgentTab({ id: 'another-unbound', spaceId: 'space' }))
    await page.evaluate(() => new Promise(requestAnimationFrame))
    assert.equal(await page.evaluate(() => window.agentState.activeConversationId), emptyChat)
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(`acpConversations:${window.darcWindowId}:tabGroups`))).some(key => key.includes('unbound'))), false)
    await send('This belongs to another tab')
    await page.waitForFunction(() => !window.agentState.processing && document.querySelector('.agent-markdown-message'))
    await page.evaluate(() => window.hideAgent())
    await page.waitForSelector('.agent-panel', { hidden: true })
    const closedState = await page.evaluate(() => ({ active: window.agentState.activeConversationId, count: window.agentState.conversations.length,
        bindings: localStorage.getItem(`acpConversations:${window.darcWindowId}:tabGroups`) }))
    await page.evaluate(({ tab, group }) => window.setAgentTab(tab, group), { tab: newTab, group })
    await page.evaluate(() => new Promise(requestAnimationFrame))
    assert.deepEqual(await page.evaluate(() => ({ active: window.agentState.activeConversationId, count: window.agentState.conversations.length,
        bindings: localStorage.getItem(`acpConversations:${window.darcWindowId}:tabGroups`) })), closedState, 'Tab changes do no session work while the sidebar is closed')
    await page.evaluate(() => window.showAgent())
    await page.waitForFunction(id => window.agentState.activeConversationId === id, {}, pageChat)
    assert.equal(await page.$$eval('.agent-chat-message.user .agent-attachment', nodes => nodes.length), 3)
    await page.evaluate(() => window.setAgentTab({ id: 'another-unbound', spaceId: 'space' }))
    await page.waitForFunction(id => window.agentState.activeConversationId === id, {}, emptyChat)
    assert.match(await page.$eval('.agent-chat-message.user', node => node.textContent), /This belongs to another tab/)
    console.log('Tab sessions: group promotion, empty reuse, interaction-only bindings, closed-sidebar inactivity and restoration pass')
    await page.evaluate(() => window.agent.disconnect())
    await page.waitForFunction(() => !window.agentState.connectionRequested)
    await page.evaluate(() => window.showSettings())
    await page.waitForSelector('button[aria-label="Edit Browser agent"]')
    await page.screenshot({ path: `${root}.cache/acp/settings-collapsed.png`, fullPage: true })
    await page.setViewport({ width: 320, height: 850 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${root}.cache/acp/settings-collapsed-narrow.png`, fullPage: true })
    await page.setViewport({ width: 480, height: 850 })
    await page.click('button[aria-label="Edit Browser agent"]')
    await page.waitForSelector('input[aria-label="ACP endpoint"]')
    assert.equal(await page.$eval('input[aria-label="ACP endpoint"]', node => node.value), host.endpoint)
    await page.screenshot({ path: `${root}.cache/acp/settings.png`, fullPage: true })
    assert.deepEqual(errors, [])
    assert.deepEqual(voiceRequests, [])
    console.log('Agent UI, Markdown streaming, browser-owned session recovery, voice toggle, queue, configuration, approvals, and XPath passed')
} finally {
    releaseMarkdown.resolve()
    releaseDocument.resolve()
    finishDocument.resolve()
    await browser?.close()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
    await server?.shutdown()
    await host.close()
}

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { compile, compileModule } from 'svelte/compiler'
import puppeteer from 'puppeteer'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite'))('esbuild')
const root = new URL('../', import.meta.url).pathname
const output = `${root}.cache/mcp-ui`
await Deno.mkdir(`${output}/tmp`, { recursive: true })
Deno.env.set('TMPDIR', `${output}/tmp`)
let browser
let server

try {
    const dataCode = compileModule(`
        import { createPermissionStore, permissionDescriptor } from './app/lib/permissions.js'
        import { getTabGroups } from './app/lib/tab-groups.js'
        const permissions = $state({}), rules = $state({}), state = $state({ status:'loading', error:null })
        const records = new Map()
        const db = {
            async allDocs() { return {rows:[]} },
            async get(id) { if (!records.has(id)) { throw {status:404} }; return records.get(id) },
            async bulkDocs() { return [] }
        }
        const store = createPermissionStore({db, permissions, rules, state, instanceId:'test', getContext:()=>null, getWindowId:()=> 'window',
            putDocument:async doc=>{const rev='1-test';records.set(doc._id,{...doc,_rev:rev});return {rev}}})
        const docs = $state({
            one:{id:'one',type:'tab',title:'Project page',url:'https://example.com',spaceId:'space',tabGroupId:'group',order:1},
            two:{id:'two',type:'tab',title:'Second page',url:'https://two.example',spaceId:'space',tabGroupId:'group',order:1}
        })
        const data = {
            docs, spaces:{space:{name:'Project'}},spaceMeta:{activeSpace:'space',activeTabId:'one'},
            permissions,permissionRules:rules,permissionState:state,permissionsReady:store.ready,reads:[],created:[],
            permissionRequest:(id,input,context)=>store.request(id,input,context),
            permissionSupported:type=>!!permissionDescriptor(type),
            allowPermission:(id,lifetime,target)=>store.resolve(id,'allow',lifetime==='always'?'persistent':lifetime==='until-app-close'?'session':'once',target),
            denyPermission:id=>store.resolve(id,'deny'),ignorePermission:id=>store.resolve(id,'ignore'),
            changePermission:resource=>store.reset(resource),cancelPermissionRequest:id=>store.cancelRequest(id),removeMcpPermissions:id=>store.removeSubject(id),
            markPermissionSeen:resource=>store.markSeen(resource),
            getTabGroups:spaceId=>getTabGroups(Object.values(docs).filter(tab=>tab.spaceId===spaceId)),
            async readPage(id,options){this.reads.push({id,options});return 'Real content for '+id},
            async newTab(spaceId,options){const tab={id:'new-'+this.created.length,type:'tab',spaceId,...options};this.created.push(tab);docs[tab.id]=tab;return tab},
            activateSpace(id){this.spaceMeta.activeSpace=id},activate(id){this.spaceMeta.activeTabId=id}
        }
        export default data
    `, { filename: `${root}mcp-data.svelte.js`, generate: 'client' }).js.code
    const fixture = compile(`
        <script>
            import McpConnections from './app/components/McpConnections.svelte'
            import PermissionToasts from './app/components/PermissionToasts.svelte'
        </script>
        <McpConnections />
        <PermissionToasts onOpenResources={()=>{}} />
    `, { filename: `${root}mcp-fixture.svelte`, generate: 'client', css: 'injected' }).js.code
    const { outputFiles } = await build({
        stdin: { resolveDir: root, contents: `
            import { mount } from 'svelte'
            import Fixture from 'fixture'
            import data from 'fixture-data'
            import { mcp, mcpState } from './app/lib/mcp-service.js'
            import * as acp from '@agentclientprotocol/sdk/unstable'
            import { createBrowserServer } from './app/lib/acp-browser-server.js'
            const runtimes = new Map()
            window.closeMcp = () => {
                for (const runtime of runtimes.values()) { runtime.peer.close(); runtime.remote.close(); runtime.backend.close() }
                runtimes.clear()
            }
            window.mcpCall = async (id, name, args) => {
                let runtime = runtimes.get(id)
                if (!runtime) {
                    const a = new TransformStream(), b = new TransformStream()
                    const provider = new acp.McpOverAcpProvider()
                    const caller = new acp.McpOverAcpCaller({ clientInfo: { name: 'Pi reported', version: 'test' } })
                    const peer = acp.client().onRequest(acp.methods.client.mcp.message, provider.handleRequest).connect({ readable: a.readable, writable: b.writable })
                    const remote = acp.agent().onNotification(acp.methods.agent.mcp.message, caller.handleNotification).connect({ readable: b.readable, writable: a.writable })
                    const backend = createBrowserServer({ connection: mcp.openAcp(id, { name: 'Pi reported' }) })
                    const binding = provider.registerServer(peer.agent, { name: backend.name, handler: backend.handler })
                    backend.signal.addEventListener('abort', () => binding.dispose(), { once: true })
                    runtime = { peer, remote, backend, binding, caller }
                    runtimes.set(id, runtime)
                }
                return runtime.caller.request(runtime.remote.client, runtime.binding.serverId, 'tools/call', { name, arguments: args })
            }
            window.mcp = mcp; window.mcpData = data
            mcpState.subscribe(state => {window.mcpState=state})
            mcp.start()
            mount(Fixture,{target:document.querySelector('#app')})
        ` }, bundle: true, platform: 'browser', format: 'esm', write: false, conditions: ['browser'],
        plugins: [{ name: 'mcp-fixture', setup(build) {
            build.onResolve({ filter: /^fixture$/ }, () => ({ path: 'fixture', namespace: 'fixture' }))
            build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, resolveDir: root }))
            build.onResolve({ filter: /(?:data\.svelte(?:\.js)?$|^fixture-data$)/ }, () => ({ path: 'data', namespace: 'data' }))
            build.onLoad({ filter: /.*/, namespace: 'data' }, () => ({ contents: dataCode, resolveDir: root }))
            build.onLoad({ filter: /\.svelte$/ }, async args => ({ contents: compile(await Deno.readTextFile(args.path), { filename: args.path, generate: 'client', css: 'injected' }).js.code }))
        } }]
    })
    server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
        const js = new URL(request.url).pathname === '/entry.js'
        return new Response(js ? outputFiles[0].text : '<!doctype html><html><head><style>body{margin:0;background:#111;color:#ddd;font:13px sans-serif}#app{padding:20px;max-width:500px;margin:auto}svg{max-width:16px}</style></head><body><div id="app"></div><script type="module" src="/entry.js"></script></body></html>', { headers: { 'Content-Type': js ? 'text/javascript' : 'text/html' } })
    })
    browser = await puppeteer.launch({ headless: true, userDataDir: `${output}/chromium`, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    await page.setViewport({ width: 1000, height: 950 })
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
    await page.evaluateOnNewDocument(() => {
        localStorage.clear()
        window.darcWindowId = 'window'
    })
    await page.goto(`http://127.0.0.1:${server.addr.port}`, { waitUntil: 'networkidle0' })
    const clickText = async (selector, text) => {
        const buttons = await page.$$(selector)
        for (const element of buttons) {
            if (await element.evaluate(node => node.textContent.trim()) === text) { await element.click(); return }
        }
        throw new Error(`Missing button: ${text}`)
    }
    const add = async title => {
        await clickText('button', 'Add new MCP connection')
        await page.type('input[aria-label="New MCP connection title"]', title)
        await page.type('textarea[aria-label="New MCP connection description"]', `${title} development agent`)
        await clickText('button', 'Create connection')
        await page.waitForFunction(title => window.mcpState.connections.some(entry => entry.title === title && entry.status === 'ready'), {}, title)
        return page.evaluate(title => window.mcpState.connections.find(entry => entry.title === title), title)
    }
    const first = await add('Pi project')
    const second = await add('Other agent')
    assert.notEqual(first.endpoint, second.endpoint)
    const rpc = (connection, name, args = {}) => page.evaluate(({ id, name, args }) => window.mcpCall(id, name, args), { id: connection.id, name, args })
    const firstSelector = `[data-mcp-connection-id="${first.id}"]`
    const secondSelector = `[data-mcp-connection-id="${second.id}"]`
    const listing = rpc(first, 'listSpaces')
    await page.waitForSelector(`${firstSelector} .resource-card.requested`)
    assert.equal(await page.$eval(`${firstSelector} .mcp-requester`, node => node.textContent.includes('Pi reported')), true)
    await clickText(`${firstSelector} button`, 'Allow once')
    assert.equal(JSON.parse((await listing).result.content[0].text)[0].spaceId, 'space')
    const read = rpc(first, 'readTab', { tabId: 'one' })
    await page.waitForSelector(`${firstSelector} select[aria-label="MCP permission scope"]`)
    await page.$eval(`${firstSelector} select[aria-label="MCP permission scope"]`, node => { node.value = [...node.options].find(option => option.textContent.includes('Tab group')).value; node.dispatchEvent(new Event('change', { bubbles: true })) })
    await clickText(`${firstSelector} .resource-card.requested button`, 'Allow once')
    assert.equal(JSON.parse((await read).result.content[0].text).tabId, 'one')
    const denied = rpc(second, 'readTab', { tabId: 'one' })
    await page.waitForSelector(`${secondSelector} .resource-card.requested`)
    await clickText(`${secondSelector} .resource-card.requested button`, 'Deny')
    assert.equal((await denied).result.isError, true)
    assert.equal(await page.evaluate(() => window.mcpData.reads.length), 1)
    const created = rpc(first, 'displayHtml', { spaceId: 'space', html: '<h1>Created by MCP</h1>', title: 'Created page' })
    await page.waitForSelector(`${firstSelector} .resource-card.requested`)
    await clickText(`${firstSelector} .resource-card.requested button`, 'Allow once')
    assert.equal(JSON.parse((await created).result.content[0].text).tabId, 'new-0')
    await page.waitForFunction(() => window.mcpState.connections.every(entry => entry.agent))
    await page.evaluate(() => window.mcp.stop())
    await page.waitForFunction(() => window.mcpState.connections.every(entry => entry.status === 'ready'))
    await page.evaluate(() => { window.closeMcp(); window.mcp.start() })
    await page.screenshot({ path: `${output}/connections.png`, fullPage: true })
    assert.deepEqual(errors, [])
    await clickText(`${secondSelector} button`, 'Remove')
    await page.waitForFunction(id => !window.mcpState.connections.some(entry => entry.id === id), {}, second.id)
    await page.evaluate(() => window.mcp.stop())
    console.log('MCP-over-ACP Settings, connection identities, existing permission prompts, scoped reads, isolation, HTML creation, and removal passed')
} finally {
    await browser?.close()
    await server?.shutdown()
}

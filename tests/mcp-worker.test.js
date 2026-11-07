import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('vite'))('esbuild')
const { Miniflare } = createRequire(require.resolve('wrangler'))('miniflare')
const root = new URL('../', import.meta.url).pathname
await Deno.mkdir(`${root}.cache/mcp-tests`, { recursive: true })
await Deno.mkdir(`${root}.cache/mcp-tests/tmp`, { recursive: true })
Deno.env.set('TMPDIR', `${root}.cache/mcp-tests/tmp`)
await build({ entryPoints: [`${root}workerd/worker.ts`], bundle: true, platform: 'browser', format: 'esm', outfile: `${root}.cache/mcp-tests/worker.js` })

const worker = new Miniflare({
    modules: true, scriptPath: `${root}.cache/mcp-tests/worker.js`, compatibilityDate: '2025-05-07',
    compatibilityFlags: ['nodejs_compat', 'nodejs_compat_populate_process_env'],
    durableObjects: { MCP_CONNECTIONS: { className: 'McpConnection', useSQLite: true } }
})

export async function responseBody(response) {
    const text = await response.text()
    if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
        return text.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).find(message => 'result' in message || 'error' in message)
    }
    return JSON.parse(text)
}

try {
    const create = () => worker.dispatchFetch('http://localhost/mcp/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Pi local', description: 'Test agent connection', windowId: 'window' }) }).then(response => response.json())
    const first = await create()
    const second = await create()
    assert(first.id && second.id && first.id !== second.id)
    assert(first.key && first.key !== second.key)
    const endpoint = `http://localhost/mcp/${first.id}`
    const protocolVersion = '2026-07-28'
    let serial = 0
    const rpc = async (method, params = {}, extra = {}) => {
        const response = await worker.dispatchFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': protocolVersion, 'Mcp-Method': method, ...(method === 'tools/call' ? { 'Mcp-Name': params.name } : {}), 'X-Agent-Name': 'Pi', 'X-Agent-Version': 'test', 'User-Agent': 'MCP-test', ...extra }, body: JSON.stringify({ jsonrpc: '2.0', id: ++serial, method, params: { ...params, _meta: { 'io.modelcontextprotocol/protocolVersion': protocolVersion, 'io.modelcontextprotocol/clientInfo': { name: 'Pi client', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {}, ...params._meta } } }) })
        assert.equal(response.headers.has('MCP-Session-Id'), false)
        return responseBody(response)
    }
    const discover = await rpc('server/discover')
    assert.deepEqual(discover.result?.supportedVersions, [protocolVersion], JSON.stringify(discover))
    const listed = await rpc('tools/list')
    assert.equal(listed.result.tools.length, 9)
    const legacy = await worker.dispatchFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++serial, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Old client', version: '1' } } }) })
    assert.equal(legacy.status, 400)
    assert.equal((await responseBody(legacy)).error.code, -32022)
    const mismatch = await rpc('tools/list', {}, { 'MCP-Protocol-Version': '2025-11-25' })
    assert.equal(mismatch.error.code, -32020)
    for (const method of ['GET', 'DELETE']) {
        const response = await worker.dispatchFetch(endpoint, { method })
        assert.equal(response.status, 405)
        assert.equal(response.headers.get('Allow'), 'POST')
        await response.text()
    }
    const offline = await rpc('tools/call', { name: 'listTabs', arguments: {} })
    assert.equal(offline.result.isError, true)
    assert.match(offline.result.content[0].text, /owning Darc window/)

    const response = await worker.dispatchFetch(`http://localhost/mcp/bridge/${first.id}`, { headers: { Upgrade: 'websocket' } })
    const socket = response.webSocket
    assert(socket)
    socket.accept()
    const messages = []
    let ready
    const connected = new Promise(resolve => { ready = resolve })
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data)
        messages.push(message)
        if (message.type === 'ready') { ready() }
        if (message.type === 'call') {
            socket.send(JSON.stringify({ type: 'result', id: message.id, result: [{ tabId: 'example', title: 'Approved browser response' }] }))
        }
    })
    socket.send(JSON.stringify({ type: 'authenticate', key: first.key }))
    await connected
    const call = await rpc('tools/call', { name: 'listTabs', arguments: {} })
    assert.equal(JSON.parse(call.result.content[0].text)[0].tabId, 'example')
    assert.equal(messages.find(message => message.type === 'call').agent.name, 'Pi')
    assert.equal(messages.find(message => message.type === 'call').agent.headers['user-agent'], 'MCP-test')
    await Promise.all(['Agent A', 'Agent B'].map(name => rpc('tools/call', { name: 'listTabs', arguments: {} }, { 'X-Agent-Name': name })))
    assert.deepEqual(messages.filter(message => message.type === 'call').slice(-2).map(message => message.agent.name).sort(), ['Agent A', 'Agent B'])
    await rpc('tools/call', { name: 'listTabs', arguments: {}, _meta: { 'io.modelcontextprotocol/clientInfo': undefined } }, { 'X-Agent-Name': '', 'X-Agent-Version': '' })
    const unidentified = messages.filter(message => message.type === 'call').at(-1).agent
    assert.equal(unidentified.name, 'MCP-test')
    assert.equal(unidentified.clientInfo, undefined)

    const unauthorized = await worker.dispatchFetch(`http://localhost/mcp/connections/${first.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer wrong' } })
    assert.equal(unauthorized.status, 403)
    await unauthorized.text()
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }))
    const remove = await worker.dispatchFetch(`http://localhost/mcp/connections/${first.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${first.key}` } })
    assert.equal(remove.status, 200)
    await remove.text()
    await closed
    const deleted = await worker.dispatchFetch(endpoint)
    assert.equal(deleted.status, 404)
    await deleted.text()
    console.log('Workerd MCP 2026-07-28 stateless discovery, no sessions, legacy rejection, header validation, tool relay, identity, control authentication, and revocation passed')
} finally {
    await worker.dispose()
}

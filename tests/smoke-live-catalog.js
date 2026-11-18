import assert from 'node:assert/strict'
import { loadAppCatalog } from '../app/lib/app-catalog.js'

const originalFetch = globalThis.fetch
const requests = []
globalThis.fetch = async (url, options = {}) => {
    requests.push(url)
    const response = await originalFetch(url, {
        ...options,
        headers: { ...options.headers, Origin: 'http://localhost:5193' }
    })
    if (String(url).startsWith('https://api.github.com/')) {
        assert.equal(response.headers.get('access-control-allow-origin'), '*')
    }
    return response
}

const apps = await loadAppCatalog()
assert.deepEqual(apps.map(app => app.id), ['excalidraw', 'darc-code', 'darc-dev'])
assert.equal(apps[1].branch, 'int')
assert.equal(apps[2].path, 'docker-compose.yaml')
assert.equal(requests.length, 5)
await loadAppCatalog()
assert.equal(requests.length, 6)

for (const app of apps) {
    const response = await originalFetch(app.iconUrl)
    assert.equal(response.status, 200, app.iconUrl)
    assert.ok(response.headers.get('content-type').startsWith('image/'))
    await response.arrayBuffer()
}
console.log('Live GitHub catalog: ArkType schema, 3 services, working icons, direct CORS, and SHA cache verified')

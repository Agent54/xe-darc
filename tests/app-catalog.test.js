import assert from 'node:assert/strict'
import { loadAppCatalog, parseCatalogService } from '../app/lib/app-catalog.js'

const webApp = {
    id: 'sketch',
    name: 'Sketch',
    description: 'A shared canvas.',
    iconUrl: 'assets/sketch.png',
    type: 'url',
    url: 'https://sketch.example'
}
const dockerApp = {
    id: 'workspace',
    name: 'Workspace',
    description: 'A Docker workspace.',
    iconUrl: 'https://example.com/icon.png',
    type: 'docker',
    githubUrl: 'https://github.com/agent54/workspace',
    branch: 'int',
    pathType: 'compose',
    path: 'docker-compose.yaml',
    checkoutPath: 'development/workspace'
}

function json(value, options) {
    return new Response(JSON.stringify(value), options)
}

async function withFetch(mock, run) {
    const original = globalThis.fetch
    globalThis.fetch = mock
    try {
        await run()
    } finally {
        globalThis.fetch = original
    }
}

Deno.test('loads category files from a single GitHub snapshot and preserves checkout settings', async () => {
    const requests = []
    await withFetch(async (url, options) => {
        requests.push({ url, options })
        if (url.endsWith('/git/trees/main?recursive=1')) {
            return json({ sha: 'snapshot-1', truncated: false, tree: [
                { type: 'blob', path: 'README.md', sha: 'readme' },
                { type: 'blob', path: 'catalog/development/workspace.json', sha: 'workspace-1' },
                { type: 'blob', path: 'catalog/design/sketch.json', sha: 'sketch-1' },
                { type: 'tree', path: 'catalog/design', sha: 'folder' }
            ] })
        }
        if (url.endsWith('/git/blobs/sketch-1')) {
            return json(webApp)
        }
        if (url.endsWith('/git/blobs/workspace-1')) {
            return json(dockerApp)
        }
        throw new Error(`Unexpected request: ${url}`)
    }, async () => {
        const apps = await loadAppCatalog()
        assert.deepEqual(apps.map(app => [app.id, app.category]), [['sketch', 'design'], ['workspace', 'development']])
        assert.equal(apps[0].iconUrl, 'https://raw.githubusercontent.com/agent54/xe-appstore/main/assets/sketch.png?v=snapshot-1')
        assert.equal(apps[1].branch, 'int')
        assert.equal(apps[1].path, 'docker-compose.yaml')
        assert.equal(apps[1].checkoutPath, 'development/workspace')
        assert.equal(requests.length, 3)
        assert.ok(requests.every(request => request.options.cache === 'no-cache'))
        assert.equal(requests[1].options.headers.Accept, 'application/vnd.github.raw+json')
        assert.ok(requests.every(request => !('Authorization' in request.options.headers)))
    })
})

Deno.test('reopening discovers additions, edits, moves and deletions while reusing unchanged blobs', async () => {
    let opening = 0
    const blobRequests = []
    await withFetch(async url => {
        if (url.endsWith('/git/trees/main?recursive=1')) {
            opening++
            const files = opening === 1
                ? [['design', 'sketch', 'refresh-sketch-1'], ['development', 'workspace', 'refresh-workspace-1']]
                : opening === 2
                ? [['design', 'sketch', 'refresh-sketch-2'], ['tools', 'workspace', 'refresh-workspace-1'], ['design', 'new-app', 'refresh-new-1']]
                : [['design', 'sketch', 'refresh-sketch-2']]
            return json({ sha: `refresh-${opening}`, truncated: false, tree: files.map(([category, id, sha]) => ({
                type: 'blob', path: `catalog/${category}/${id}.json`, sha
            })) })
        }
        blobRequests.push(url)
        if (url.endsWith('refresh-sketch-1')) {
            return json(webApp)
        }
        if (url.endsWith('refresh-sketch-2')) {
            return json({ ...webApp, name: 'Updated Sketch' })
        }
        if (url.endsWith('refresh-workspace-1')) {
            return json(dockerApp)
        }
        if (url.endsWith('refresh-new-1')) {
            return json({ ...webApp, id: 'new-app', name: 'New App' })
        }
        throw new Error(`Unexpected request: ${url}`)
    }, async () => {
        await loadAppCatalog()
        const second = await loadAppCatalog()
        assert.equal(second.find(app => app.id === 'sketch').name, 'Updated Sketch')
        assert.equal(second.find(app => app.id === 'workspace').category, 'tools')
        assert.ok(second.some(app => app.id === 'new-app'))
        assert.equal(blobRequests.length, 4)
        const third = await loadAppCatalog()
        assert.deepEqual(third.map(app => app.id), ['sketch'])
        assert.equal(blobRequests.length, 4)
        assert.equal(opening, 3)
    })
})

Deno.test('empty catalog returns no services', async () => {
    await withFetch(async () => json({ tree: [], truncated: false }), async () => {
        assert.deepEqual(await loadAppCatalog(), [])
    })
})

Deno.test('rejects truncated trees instead of showing a partial catalog', async () => {
    await withFetch(async () => json({ tree: [], truncated: true }), async () => {
        await assert.rejects(loadAppCatalog(), /incomplete app catalog/)
    })
})

Deno.test('invalid service files fail loading rather than entering the catalog', async () => {
    await withFetch(async url => url.includes('/git/trees/')
        ? json({ tree: [{ type: 'blob', path: 'catalog/design/sketch.json', sha: 'invalid-service' }] })
        : json({ ...webApp, url: 'javascript:alert(1)' }), async () => {
        await assert.rejects(loadAppCatalog(), /Invalid catalog URL/)
    })
})

Deno.test('duplicate IDs across categories are rejected', async () => {
    await withFetch(async url => url.includes('/git/trees/')
        ? json({ tree: [
            { type: 'blob', path: 'catalog/design/sketch.json', sha: 'duplicate-sketch' },
            { type: 'blob', path: 'catalog/tools/sketch.json', sha: 'duplicate-sketch' }
        ] })
        : json(webApp), async () => {
        await assert.rejects(loadAppCatalog(), /Duplicate app catalog ID/)
    })
})

Deno.test('reports GitHub rate limits with the reset time', async () => {
    await withFetch(async () => json({ message: 'rate limited' }, { status: 403, headers: { 'x-ratelimit-reset': '1800000000' } }), async () => {
        await assert.rejects(loadAppCatalog(), /GitHub is limiting catalog requests\. Try again after/)
    })
})

Deno.test('reports unavailable repository and malformed responses', async () => {
    await withFetch(async () => json({}, { status: 404 }), async () => {
        await assert.rejects(loadAppCatalog(), /catalog is unavailable on GitHub/)
    })
    await withFetch(async () => new Response('not json'), async () => {
        await assert.rejects(loadAppCatalog(), /invalid catalog JSON/)
    })
})

Deno.test('aborts in-flight catalog loading when the view closes', async () => {
    const controller = new AbortController()
    await withFetch((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        controller.abort()
    }), async () => {
        await assert.rejects(loadAppCatalog({ signal: controller.signal }), { name: 'AbortError' })
    })
})

Deno.test('parser derives categories from folders and rejects invalid configuration', () => {
    const app = parseCatalogService({ ...webApp, category: 'ignored' }, 'catalog/design/sketch.json')
    assert.equal(app.category, 'design')
    assert.throws(() => parseCatalogService(webApp, 'catalog/design/wrong-id.json'), /Invalid catalog service/)
    assert.throws(() => parseCatalogService({ ...webApp, iconUrl: 'assets/../secret.png' }, 'catalog/design/sketch.json'), /Invalid catalog icon/)
    assert.throws(() => parseCatalogService({ ...dockerApp, branch: 5 }, 'catalog/development/workspace.json'), /Invalid catalog repository settings/)
    assert.throws(() => parseCatalogService({ ...dockerApp, path: '../compose.yaml' }, 'catalog/development/workspace.json'), /Invalid catalog repository settings/)
    assert.throws(() => parseCatalogService({ ...webApp, type: 'unknown' }, 'catalog/design/sketch.json'), /Unsupported catalog service type/)
})

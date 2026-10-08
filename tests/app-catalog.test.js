import assert from 'node:assert/strict'
import { jsonSchemaToType } from '@ark/json-schema'
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
const common = {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    iconUrl: { type: 'string', pattern: '^(?:assets/[A-Za-z0-9_-]+\\.png|https://)' }
}
const serviceSchema = {
    oneOf: [
        {
            type: 'object', additionalProperties: false,
            properties: { ...common, type: { const: 'url' }, url: { type: 'string', pattern: '^https?://' } },
            required: ['id', 'name', 'description', 'iconUrl', 'type', 'url']
        },
        {
            type: 'object', additionalProperties: false,
            properties: {
                ...common,
                type: { const: 'docker' },
                githubUrl: { type: 'string', pattern: '^https://github\\.com/' },
                branch: { type: 'string' },
                pathType: { enum: ['compose', 'dockerfile', 'static'] },
                path: { type: 'string', pattern: '^(?!\\.\\.)[^\\\\]+$' },
                checkoutPath: { type: 'string' }
            },
            required: ['id', 'name', 'description', 'iconUrl', 'type', 'githubUrl', 'branch', 'pathType', 'path']
        }
    ]
}
const serviceType = jsonSchemaToType(serviceSchema)

function json(value, options) {
    return new Response(JSON.stringify(value), options)
}

function tree(entries, options = {}) {
    return json({
        sha: options.sha || 'test-snapshot',
        truncated: options.truncated || false,
        tree: [{ type: 'blob', path: 'catalog.schema.json', sha: options.schemaSHA || 'test-schema' }, ...entries]
    })
}

async function withFetch(mock, run) {
    const original = globalThis.fetch
    globalThis.fetch = (url, options) => url.endsWith('/git/blobs/test-schema')
        ? Promise.resolve(json(serviceSchema))
        : mock(url, options)
    try {
        await run()
    } finally {
        globalThis.fetch = original
    }
}

Deno.test('loads category files from a single GitHub snapshot and preserves checkout settings', async () => {
    const requests = []
    await withFetch((url, options) => {
        requests.push({ url, options })
        if (url.endsWith('/git/trees/main?recursive=1')) {
            return tree([
                { type: 'blob', path: 'README.md', sha: 'readme' },
                { type: 'blob', path: 'catalog/development/workspace.json', sha: 'workspace-1' },
                { type: 'blob', path: 'catalog/design/sketch.json', sha: 'sketch-1' },
                { type: 'tree', path: 'catalog/design', sha: 'folder' }
            ], { sha: 'snapshot-1' })
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
    await withFetch(url => {
        if (url.endsWith('/git/trees/main?recursive=1')) {
            opening++
            const files = opening === 1
                ? [['design', 'sketch', 'refresh-sketch-1'], ['development', 'workspace', 'refresh-workspace-1']]
                : opening === 2
                ? [['design', 'sketch', 'refresh-sketch-2'], ['tools', 'workspace', 'refresh-workspace-1'], ['design', 'new-app', 'refresh-new-1']]
                : [['design', 'sketch', 'refresh-sketch-2']]
            return tree(files.map(([category, id, sha]) => ({
                type: 'blob', path: `catalog/${category}/${id}.json`, sha
            })), { sha: `refresh-${opening}` })
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
    await withFetch(() => tree([]), async () => {
        assert.deepEqual(await loadAppCatalog(), [])
    })
})

Deno.test('a schema edit revalidates unchanged cached service blobs', async () => {
    let opening = 0
    let serviceFetches = 0
    await withFetch(url => {
        if (url.endsWith('/git/trees/main?recursive=1')) {
            opening++
            return tree([{ type: 'blob', path: 'catalog/design/sketch.json', sha: 'schema-change-sketch' }], {
                schemaSHA: opening === 1 ? 'schema-change-1' : 'schema-change-2'
            })
        }
        if (url.endsWith('/git/blobs/schema-change-1')) {
            return json(serviceSchema)
        }
        if (url.endsWith('/git/blobs/schema-change-2')) {
            const restricted = structuredClone(serviceSchema)
            restricted.oneOf[0].properties.url.pattern = '^https://another\\.example$'
            return json(restricted)
        }
        if (url.endsWith('/git/blobs/schema-change-sketch')) {
            serviceFetches++
            return json(webApp)
        }
        throw new Error(`Unexpected request: ${url}`)
    }, async () => {
        assert.equal((await loadAppCatalog())[0].id, 'sketch')
        await assert.rejects(loadAppCatalog(), /Invalid catalog service/)
        assert.equal(serviceFetches, 1)
    })
})

Deno.test('a catalog without its schema cannot load', async () => {
    await withFetch(() => json({ tree: [], truncated: false }), async () => {
        await assert.rejects(loadAppCatalog(), /without its schema/)
    })
})

Deno.test('rejects truncated trees instead of showing a partial catalog', async () => {
    await withFetch(() => tree([], { truncated: true }), async () => {
        await assert.rejects(loadAppCatalog(), /incomplete app catalog/)
    })
})

Deno.test('invalid service files fail loading rather than entering the catalog', async () => {
    await withFetch(url => url.includes('/git/trees/')
        ? tree([{ type: 'blob', path: 'catalog/design/sketch.json', sha: 'invalid-service' }])
        : json({ ...webApp, url: 'javascript:alert(1)' }), async () => {
        await assert.rejects(loadAppCatalog(), /Invalid catalog service/)
    })
})

Deno.test('duplicate IDs across categories are rejected', async () => {
    await withFetch(url => url.includes('/git/trees/')
        ? tree([
            { type: 'blob', path: 'catalog/design/sketch.json', sha: 'duplicate-sketch' },
            { type: 'blob', path: 'catalog/tools/sketch.json', sha: 'duplicate-sketch' }
        ])
        : json(webApp), async () => {
        await assert.rejects(loadAppCatalog(), /Duplicate app catalog ID/)
    })
})

Deno.test('reports GitHub rate limits with the reset time', async () => {
    await withFetch(() => json({ message: 'rate limited' }, { status: 403, headers: { 'x-ratelimit-reset': '1800000000' } }), async () => {
        await assert.rejects(loadAppCatalog(), /GitHub is limiting catalog requests\. Try again after/)
    })
})

Deno.test('reports unavailable repository and malformed responses', async () => {
    await withFetch(() => json({}, { status: 404 }), async () => {
        await assert.rejects(loadAppCatalog(), /catalog is unavailable on GitHub/)
    })
    await withFetch(() => new Response('not json'), async () => {
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

Deno.test('parser derives categories from folders and validates with the supplied ArkType schema', () => {
    const parse = (service, path = 'catalog/design/sketch.json') => parseCatalogService(service, path, 'test-revision', serviceType)
    const app = parse(webApp)
    assert.equal(app.category, 'design')
    assert.throws(() => parse(webApp, 'catalog/design/wrong-id.json'), /ID does not match filename/)
    assert.throws(() => parse({ ...webApp, iconUrl: 'assets/../secret.png' }), /Invalid catalog service/)
    assert.throws(() => parse({ ...dockerApp, branch: 5 }, 'catalog/development/workspace.json'), /Invalid catalog service/)
    assert.throws(() => parse({ ...dockerApp, path: '../compose.yaml' }, 'catalog/development/workspace.json'), /Invalid catalog service/)
    assert.throws(() => parse({ ...webApp, type: 'unknown' }), /Invalid catalog service/)
    assert.throws(() => parse({ ...webApp, category: 'ignored' }), /Invalid catalog service/)
})

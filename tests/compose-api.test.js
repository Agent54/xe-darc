import assert from 'node:assert/strict'
import { listComposeProjects } from '../app/lib/compose-api.js'

const deletedPath = '/Users/jan/Dev/xe/stacks/welcome-to-docker-compose/compose.yaml'
const missingFile = `open ${deletedPath}: no such file or directory`
const healthyPath = '/stacks/healthy/compose.yaml'

function container(service, path = deletedPath, options = {}) {
    return {
        ID: `${service}-1`, Name: `welcome-to-docker-compose-${service}-1`,
        Service: service, State: 'running',
        Labels: { 'com.docker.compose.project.config_files': path },
        Publishers: [{ TargetPort: 8080, PublishedPort: 8080, Protocol: 'tcp' }],
        ...options
    }
}

async function withCompose(respond, run) {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input, options) => {
        const url = new URL(input)
        if (url.pathname === '/v1.24/app-ports') {
            return Response.json({ https: 443, publicHttpReady: true })
        }
        return await respond(url, options)
    }
    try {
        await run()
    } finally {
        globalThis.fetch = originalFetch
    }
}

Deno.test('a deleted Compose file does not break the overview or hide other apps', async () => {
    const web = container('web')
    const oneoff = container('oneoff', deletedPath, {
        Labels: { 'com.docker.compose.project.config_files': deletedPath, 'com.docker.compose.oneoff': 'True' }
    })
    const worker = container('worker', healthyPath)
    await withCompose(url => {
        if (url.pathname === '/v1.24/ls') return Response.json([
            { Name: 'welcome-to-docker-compose', ConfigFiles: deletedPath },
            { Name: 'healthy', ConfigFiles: healthyPath }
        ])
        assert.equal(url.searchParams.get('path'), url.pathname.endsWith('/healthy') ? healthyPath : deletedPath)
        if (url.pathname === '/v1.24/config/welcome-to-docker-compose') {
            return Response.json({ message: missingFile }, { status: 500 })
        }
        if (url.pathname === '/v1.24/ps/welcome-to-docker-compose') return Response.json([web, oneoff])
        if (url.pathname === '/v1.24/config/healthy') return Response.json({ services: { worker: { ports: [{ target: 8080, published: '8080' }] } } })
        if (url.pathname === '/v1.24/ps/healthy') return Response.json([worker])
        throw new Error(`Unexpected request: ${url}`)
    }, async () => {
        const projects = await listComposeProjects()
        assert.equal(projects.length, 2)
        assert.deepEqual(projects[0].config.services, { web: {} })
        assert.equal(projects[0].configFiles, deletedPath)
        assert.deepEqual(projects[0].containers, [web, oneoff])
        assert.deepEqual(projects[1].config.services.worker.ports, [{ target: 8080, published: '8080' }])
    })
})

Deno.test('deleted project variants fall back to their own containers on older Compose backends', async () => {
    const override = '/Users/jan/Dev/xe/stacks/welcome-to-docker-compose/compose.override.yaml'
    const files = `${deletedPath},${override}`
    const web = container('web', files)
    const otherVariant = container('web', '/stacks/other/compose.yaml', { ID: 'other-web' })
    const missingOverride = container('web', deletedPath, { ID: 'different-override' })
    const requests = []
    await withCompose(url => {
        requests.push(url)
        if (url.pathname === '/v1.24/ls') return Response.json([{ Name: 'welcome-to-docker-compose', ConfigFiles: files }])
        if (url.pathname.startsWith('/v1.24/config/')) return Response.json({ message: missingFile }, { status: 404 })
        if (url.pathname.startsWith('/v1.24/ps/') && url.searchParams.has('path')) {
            return Response.json({ message: missingFile }, { status: 500 })
        }
        return Response.json([web, otherVariant, missingOverride, { Service: 'unknown', Labels: {} }])
    }, async () => {
        const [project] = await listComposeProjects()
        assert.deepEqual(project.containers, [web])
        assert.deepEqual(project.config.services, { web: {} })
        assert.equal(requests.filter(url => url.pathname.startsWith('/v1.24/ps/')).length, 2)
    })
})

Deno.test('a removed project with no remaining containers contributes no app cards', async () => {
    await withCompose(url => {
        if (url.pathname === '/v1.24/ls') return Response.json([{ Name: 'deleted', ConfigFiles: deletedPath }])
        if (url.pathname.startsWith('/v1.24/config/')) return Response.json({ message: missingFile }, { status: 500 })
        return Response.json([])
    }, async () => {
        const [project] = await listComposeProjects()
        assert.deepEqual(project.config.services, {})
        assert.deepEqual(project.containers, [])
    })
})

Deno.test('refresh uses a restored Compose file instead of caching the missing-file fallback', async () => {
    let restored = false
    await withCompose(url => {
        if (url.pathname === '/v1.24/ls') return Response.json([{ Name: 'demo', ConfigFiles: deletedPath }])
        if (url.pathname.startsWith('/v1.24/config/')) {
            return restored
                ? Response.json({ services: { web: { ports: [{ name: 'web', target: 8080, published: '8080' }] }, worker: {} } })
                : Response.json({ message: missingFile }, { status: 500 })
        }
        return Response.json([container('web')])
    }, async () => {
        assert.deepEqual((await listComposeProjects())[0].config.services, { web: {} })
        restored = true
        const [project] = await listComposeProjects()
        assert.deepEqual(Object.keys(project.config.services), ['web', 'worker'])
        assert.equal(project.config.services.web.ports[0].name, 'web')
    })
})

Deno.test('actual API and authorization failures remain errors', async () => {
    for (const status of [401, 403, 500, 503]) {
        await withCompose(url => {
            if (url.pathname === '/v1.24/ls') return Response.json([{ Name: 'demo', ConfigFiles: deletedPath }])
            if (url.pathname.startsWith('/v1.24/config/')) return Response.json({ message: 'Compose unavailable' }, { status })
            return Response.json([])
        }, async () => {
            await assert.rejects(listComposeProjects(), error => error.status === status && error.message === 'Compose unavailable')
        })
    }
})

Deno.test('canceling an overview refresh does not retry deleted-file requests', async () => {
    const controller = new AbortController()
    let psRequests = 0
    await withCompose((url, options) => {
        assert.equal(options.signal, controller.signal)
        if (url.pathname === '/v1.24/ls') return Response.json([{ Name: 'demo', ConfigFiles: deletedPath }])
        if (url.pathname.startsWith('/v1.24/config/')) return Response.json({ services: {} })
        psRequests++
        controller.abort()
        return Response.json({ message: missingFile }, { status: 500 })
    }, async () => {
        await assert.rejects(listComposeProjects({ signal: controller.signal }), /no such file or directory/)
        assert.equal(psRequests, 1)
    })
})

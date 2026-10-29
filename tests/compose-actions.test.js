import assert from 'node:assert/strict'
import { composeActionItems, composeContainer } from '../app/lib/compose-actions.js'
import { runComposeAction } from '../app/lib/compose-api.js'

const app = {
    name: 'web', project: 'demo/variant', configFiles: '/stacks/demo/compose.yaml,/stacks/demo/override.yaml',
    watching: false, containers: [{ id: 'web-1', name: 'demo-web-1', state: 'running' }]
}
const ids = (app, container) => composeActionItems(app, container).map(item => item.id)

Deno.test('Docker menus follow container states and offer uncreated service actions', () => {
    assert.deepEqual(ids(app), ['stop', 'restart', 'pause', 'watch', 'remove'])
    assert.deepEqual(ids({ ...app, watching: true }, { state: 'paused' }), ['stop', 'restart', 'unpause', 'stop-watch', 'remove'])
    assert.deepEqual(ids(app, { state: 'exited' }), ['start', 'watch', 'remove'])
    assert.deepEqual(ids({ ...app, containers: [] }), ['start', 'watch', 'up-no-build', 'remove'])
    assert.deepEqual(ids({ ...app, containers: [{ state: 'running' }, { state: 'exited' }] }), ['start', 'stop', 'restart', 'pause', 'watch', 'remove'])
    assert.deepEqual(ids(app, { state: 'restarting' }), ['stop', 'restart', 'watch', 'remove'])
    assert.deepEqual(composeContainer({ ID: 'id', Name: 'replica-2', State: 'Paused' }), { id: 'id', name: 'replica-2', state: 'paused' })
})

async function captureRequests(run, respond = () => Response.json({})) {
    const originalFetch = globalThis.fetch
    const requests = []
    globalThis.fetch = async (input, options = {}) => {
        const url = new URL(input)
        if (url.pathname === '/v1.24/app-ports') {
            return Response.json({ https: 443, publicHttpReady: true })
        }
        const request = { path: url.pathname, method: options.method, body: options.body ? JSON.parse(options.body) : null }
        requests.push(request)
        return respond(request)
    }
    try {
        await run(requests)
    } finally {
        globalThis.fetch = originalFetch
    }
}

Deno.test('starting a container targets its exact replica while service start targets the service', async () => {
    await captureRequests(async requests => {
        await runComposeAction('start', app, { id: 'replica-2' })
        await runComposeAction('start', app)
        assert.deepEqual(requests, [
            { path: '/v1.24/start/demo%2Fvariant/container', method: 'POST', body: { path: app.configFiles, container: 'replica-2' } },
            { path: '/v1.24/start/demo%2Fvariant', method: 'POST', body: { path: app.configFiles, services: ['web'], wait: false } }
        ])
    })
})

Deno.test('up actions preserve all variant files, service selection and watch mode', async () => {
    await captureRequests(async requests => {
        await runComposeAction('start', { ...app, containers: [] })
        await runComposeAction('restart', { ...app, watching: true }, app.containers[0])
        await runComposeAction('up-no-build', { ...app, containers: [] })
        await runComposeAction('watch', app)
        assert.deepEqual(requests.map(request => request.path), Array(4).fill('/v1.24/up'))
        assert.deepEqual(requests.map(request => [request.body.build, request.body.watch]), [[true, false], [true, true], [false, false], [true, true]])
        for (const request of requests) {
            assert.equal(request.method, 'POST')
            assert.equal(request.body.path, app.configFiles)
            assert.deepEqual(request.body.services, ['web'])
            assert.equal(request.body.removeOrphans, true)
        }
    })
})

Deno.test('stop and remove first stop watch, tolerate an absent watch and keep Compose UI service scope', async () => {
    for (const action of ['stop', 'remove']) {
        await captureRequests(async requests => {
            await runComposeAction(action, app, app.containers[0])
            assert.deepEqual(requests, [
                { path: '/v1.24/watch/demo%2Fvariant', method: 'DELETE', body: null },
                { path: `/v1.24/${action === 'remove' ? 'rm' : 'stop'}/demo%2Fvariant`, method: 'POST', body: {
                    path: app.configFiles, services: ['web'],
                    ...(action === 'remove' ? { force: true, stop: true } : { removeOrphans: true })
                } }
            ])
        }, request => Response.json({}, { status: request.method === 'DELETE' ? 404 : 200 }))
    }
})

Deno.test('a watch failure prevents stop/remove and preserves the API error', async () => {
    await captureRequests(async requests => {
        await assert.rejects(runComposeAction('remove', app), error => error.status === 503 && error.message === 'VM unavailable')
        assert.equal(requests.length, 1)
        assert.equal(requests[0].method, 'DELETE')
    }, () => Response.json({ message: 'VM unavailable' }, { status: 503 }))
})

Deno.test('pause, unpause and stop watching use the matching Compose routes', async () => {
    await captureRequests(async requests => {
        await runComposeAction('pause', app)
        await runComposeAction('unpause', app)
        await runComposeAction('stop-watch', app)
        assert.deepEqual(requests.map(request => [request.method, request.path]), [
            ['POST', '/v1.24/pause/demo%2Fvariant'],
            ['POST', '/v1.24/unpause/demo%2Fvariant'],
            ['DELETE', '/v1.24/watch/demo%2Fvariant']
        ])
        assert.deepEqual(requests[0].body, { path: app.configFiles, services: ['web'] })
    })
})

Deno.test('invalid actions and missing startup paths fail without issuing a mutation', async () => {
    await captureRequests(async requests => {
        await assert.rejects(runComposeAction('restart', { ...app, configFiles: '' }), /No Compose file path/)
        await assert.rejects(runComposeAction('invalid', app), /Unknown Docker action/)
        assert.equal(requests.length, 0)
    })
})

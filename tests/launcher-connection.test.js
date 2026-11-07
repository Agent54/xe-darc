import assert from 'node:assert/strict'
import { getComposeAppPorts, listComposeProjects, runComposeAction } from '../app/lib/compose-api.js'
import { cdpFetch } from '../app/lib/cdp.js'

const appPorts = () => Response.json({ https: 443, publicHttpReady: true })

function waitForAbort(signal) {
    return new Promise((resolve, reject) => {
        signal.throwIfAborted()
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
}

async function withFetch(fetch, run) {
    const original = globalThis.fetch
    globalThis.fetch = fetch
    try {
        await run()
    } finally {
        globalThis.fetch = original
    }
}

Deno.test('launcher discovery stops after 600 ms even if the first origin hangs', async () => {
    const requests = []
    await withFetch((url, { signal }) => {
        requests.push(url)
        return waitForAbort(signal)
    }, async () => {
        const start = performance.now()
        await assert.rejects(getComposeAppPorts(), { name: 'TimeoutError' })
        assert.ok(performance.now() - start >= 550)
        assert.equal(requests.length, 1, 'timeout stops discovery instead of starting more probes')
    })
})

Deno.test('closing Dev Tools cancels launcher discovery without trying fallback origins', async () => {
    const controller = new AbortController()
    let requests = 0
    await withFetch((url, { signal }) => {
        requests++
        const pending = waitForAbort(signal)
        controller.abort()
        return pending
    }, async () => {
        await assert.rejects(cdpFetch('/json/list', { signal: controller.signal }), { name: 'AbortError' })
        assert.equal(requests, 1)
    })
})

Deno.test('launcher discovery still uses fallback HTTPS ports after immediate connection failures', async () => {
    const requests = []
    await withFetch(url => {
        requests.push(url)
        if (new URL(url).port !== '5194') throw new TypeError('Failed to fetch')
        return Response.json({ https: 5194, publicHttpReady: true })
    }, async () => {
        assert.equal((await getComposeAppPorts()).https, 5194)
        assert.equal(requests.length, 2)
    })
})

Deno.test('Dev Tools context requests time out and recover after the launcher restarts', async () => {
    await withFetch((url, { signal }) => waitForAbort(signal), async () => {
        await assert.rejects(cdpFetch('/json/list'), { name: 'TimeoutError' })
    })
    await withFetch(url => new URL(url).pathname.endsWith('/app-ports') ? appPorts() : Response.json([]), async () => {
        assert.deepEqual(await (await cdpFetch('/json/list')).json(), [])
    })
})

Deno.test('Docker service listing times out when a previously connected launcher stops responding', async () => {
    await withFetch((url, { signal }) => waitForAbort(signal), async () => {
        await assert.rejects(listComposeProjects(), { name: 'TimeoutError' })
    })
})

Deno.test('Docker builds can take longer than the local connection timeout', async () => {
    await withFetch(async (url, options) => {
        if (new URL(url).pathname.endsWith('/app-ports')) return appPorts()
        await new Promise(resolve => setTimeout(resolve, 650))
        assert.equal(options.signal, undefined, 'the connection timeout does not apply to a build')
        return Response.json({ started: true })
    }, async () => {
        assert.deepEqual(await runComposeAction('start', {
            name: 'web', project: 'demo', configFiles: '/stacks/demo/compose.yaml', containers: []
        }), { started: true })
    })
})

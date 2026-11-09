import assert from 'node:assert/strict'
import { compile, parse } from 'svelte/compiler'

const source = Deno.readTextFileSync(new URL('../app/components/AddAppModal.svelte', import.meta.url))
const submitHandler = parse(source).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'submitApp')

function submission(type, onAdd) {
    let closes = 0
    const api = new Function('onAdd', 'handleClose', `
        const activeTab = ${JSON.stringify(type)}
        const appFormData = {
            name: 'Hello Docker', url: 'https://hello.example/', pinToAppPins: true,
            dataPartitions: ['current'], githubUrl: 'https://github.com/example/hello',
            pathType: 'compose', path: 'compose.yaml', githubToken: 'secret',
            branch: 'feature', checkoutPath: 'development/tools', openInMenu: true,
            catalogId: 'hello', catalogRevision: 'installed-catalog-revision',
            startOnBrowserStart: true, iconUrl: 'https://hello.example/icon.png'
        }
        let submissionState = 'idle', submitError = '', submissionController = null
        ${source.slice(submitHandler.start, submitHandler.end)}
        return {
            submitApp,
            cancel() { submissionController?.abort() },
            get state() { return { submissionState, submitError } }
        }
    `)(onAdd, () => { closes++ })
    return { ...api, get state() { return api.state }, get closes() { return closes } }
}

Deno.test('adding an app only submits its full configuration, waits for persistence and prevents duplicate saves', async () => {
    for (const type of ['url', 'repo']) {
        let resolveAdd, rejectAdd, payload
        const h = submission(type, value => {
            payload = value
            return new Promise((resolve, reject) => { resolveAdd = resolve; rejectAdd = reject })
        })
        const installing = h.submitApp()
        await Promise.resolve()
        assert.equal(h.state.submissionState, 'submitting')
        assert.equal(payload.app.pinToAppPins, true)
        assert.equal(payload.type, type)
        assert.equal(payload.app.githubToken, 'secret')
        assert.equal(payload.app.branch, 'feature')
        assert.equal(payload.app.checkoutPath, 'development/tools')
        assert.equal(payload.app.catalogRevision, 'installed-catalog-revision')
        assert.equal(payload.app.openInMenu, true)
        assert.equal(payload.app.startOnBrowserStart, true)
        assert.deepEqual(payload.app.dataPartitions, ['current'])
        assert.equal('checkout' in payload, false)
        assert.equal(h.closes, 0)
        await h.submitApp()
        rejectAdd(new Error('App could not be saved'))
        await installing
        assert.equal(h.state.submitError, 'App could not be saved')
        assert.equal(h.state.submissionState, 'idle')
        assert.equal(h.closes, 0)

        const retry = h.submitApp()
        await Promise.resolve()
        resolveAdd()
        await retry
        assert.equal(h.state.submitError, '')
        assert.equal(h.closes, 1)
    }
})

Deno.test('canceling an in-flight save does not close a later modal when saving finishes', async () => {
    for (const type of ['url', 'repo']) {
        let resolveAdd
        const h = submission(type, () => new Promise(resolve => { resolveAdd = resolve }))
        const installing = h.submitApp()
        await Promise.resolve()
        h.cancel()
        resolveAdd()
        await installing
        assert.equal(h.closes, 0)
        assert.equal(h.state.submitError, '')
    }
})

const dataSource = Deno.readTextFileSync(new URL('../app/data.svelte.js', import.meta.url))
const createAppSource = dataSource.slice(dataSource.indexOf('    newApp: async'), dataSource.indexOf('    toggleTabActivityMode:'))

Deno.test('new apps persist as app documents in the shared data store without tab or install side effects', async () => {
    const docs = {}
    const persisted = []
    const newApp = new Function('putDocument', 'docs', 'spaceMeta', `return ({ ${createAppSource} }).newApp`)(async doc => {
        persisted.push(JSON.parse(JSON.stringify(doc)))
        return { rev: '1-saved' }
    }, docs, { activeSpace: 'space' })
    for (const type of ['url', 'repo']) {
        const h = submission(type, newApp)
        await h.submitApp()
        const stored = persisted.at(-1)
        assert.equal(stored.type, 'app')
        assert.equal(stored.appType, type)
        assert.equal(stored.spaceId, 'space')
        assert.equal(stored.archive, '')
        assert.equal(stored.githubToken, 'secret')
        assert.equal(stored.catalogId, 'hello')
        assert.equal(stored.catalogRevision, 'installed-catalog-revision')
        assert.equal(docs[stored._id]._rev, '1-saved')
        assert.equal(h.closes, 1)
    }
    assert.equal(persisted.length, 2)
    assert.equal(Object.values(docs).every(doc => doc.type === 'app'), true)
})

Deno.test('a failed app document write leaves the store unchanged and the form open for retry', async () => {
    const docs = {}
    const newApp = new Function('putDocument', 'docs', 'spaceMeta', `return ({ ${createAppSource} }).newApp`)(async () => {
        throw new Error('Database unavailable')
    }, docs, { activeSpace: 'space' })
    const h = submission('repo', newApp)
    await h.submitApp()
    assert.deepEqual(docs, {})
    assert.equal(h.closes, 0)
    assert.equal(h.state.submitError, 'Database unavailable')
})

const appsSource = Deno.readTextFileSync(new URL('../app/components/Apps.svelte', import.meta.url))
const openHandler = parse(appsSource).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'openApp')
import { repositoryApps } from '../app/lib/app-records.js'

function opening({ localApps = [], installedApps = localApps, failCheckout = false, metadata = {} } = {}) {
    const calls = { checkouts: [], opened: [], refreshes: 0 }
    const open = new Function('refresh', 'checkoutRepository', 'repositoryApps', 'openURL', 'appMetadata', `
        const openingApps = {}
        let dockerMessage = '', composeError = ''
        const saveMetadata = () => {}
        ${appsSource.slice(openHandler.start, openHandler.end)}
        return { openApp, get message() { return dockerMessage } }
    `)(async () => ++calls.refreshes === 1 ? localApps : installedApps, async options => {
        calls.checkouts.push(options)
        if (failCheckout) throw new Error('Checkout failed')
        return { path: '/stacks/development/tools/hello' }
    }, repositoryApps, async (...args) => calls.opened.push(args), metadata)
    return { calls, metadata, ...open, get message() { return open.message } }
}

const repository = {
    id: 'saved', appType: 'repo', name: 'Hello', githubUrl: 'https://github.com/example/hello.git',
    checkoutPath: 'development/tools', branch: 'feature', githubToken: 'secret', pathType: 'compose', path: 'compose.yaml'
}
const service = { id: 'web', configFiles: '/stacks/development/tools/hello/compose.yaml', endpoints: [{ url: 'https://web_hello.app.localhost' }] }

Deno.test('opening an uninstalled repository checks out saved parameters and then opens the discovered app', async () => {
    const h = opening({ installedApps: [service] })
    await h.openApp(null, repository)
    assert.deepEqual(h.calls.checkouts, [{ url: repository.githubUrl, path: repository.checkoutPath, branch: 'feature', token: 'secret' }])
    assert.equal(h.calls.opened[0][1], service.endpoints[0].url)
    assert.equal(h.metadata.saved.repositoryPath, '/stacks/development/tools/hello')
})

Deno.test('opening an existing Compose setup never installs, including setups without published ports', async () => {
    for (const endpoints of [service.endpoints, []]) {
        const h = opening({ localApps: [{ ...service, endpoints }] })
        await h.openApp(null, repository)
        assert.equal(h.calls.checkouts.length, 0)
        assert.equal(h.calls.opened.length, endpoints.length ? 1 : 0)
    }
})

Deno.test('web links open directly and right mouse clicks have no install or opening side effects', async () => {
    const h = opening()
    await h.openApp(null, { id: 'url', name: 'Web', appType: 'url', url: 'https://example.com' })
    assert.equal(h.calls.refreshes, 0)
    assert.equal(h.calls.opened[0][1], 'https://example.com')
    await h.openApp({ type: 'mousedown', button: 2 }, repository)
    assert.equal(h.calls.checkouts.length, 0)
    assert.equal(h.calls.refreshes, 0)
})

Deno.test('failed installs surface an error and manual Compose setup does not clone again on every open', async () => {
    const failed = opening({ failCheckout: true })
    await failed.openApp(null, repository)
    assert.equal(failed.message, 'Checkout failed')
    assert.equal(failed.calls.opened.length, 0)
    assert.deepEqual(failed.metadata, {})

    const h = opening()
    const app = { ...repository, pathType: 'dockerfile' }
    await h.openApp(null, app)
    assert.match(h.message, /Add a Docker Compose file at .*\/docker-compose.yaml/)
    await h.openApp(null, app)
    assert.equal(h.calls.checkouts.length, 1)
    assert.equal(h.calls.opened.length, 0)
})

Deno.test('repeated open requests share one install and keyboard opening follows the same path', async () => {
    const h = opening({ installedApps: [service] })
    const keyHandler = parse(appsSource).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'handleOpenKey')
    const handleOpenKey = new Function('openApp', `${appsSource.slice(keyHandler.start, keyHandler.end)}; return handleOpenKey`)(h.openApp)
    handleOpenKey({ key: 'Enter', preventDefault() {}, stopPropagation() {} }, repository)
    await h.openApp(null, repository)
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(h.calls.checkouts.length, 1)
    assert.equal(h.calls.opened.length, 1)
})

Deno.test('opening saved pin settings creates the focused pinned tab only at open time', async () => {
    const handler = parse(appsSource).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'openURL')
    const calls = []
    const data = {
        spaceMeta: { activeSpace: 'space' },
        newTab: async (...args) => { calls.push(args); return { id: 'tab' } },
        updateTabOverrides: async (...args) => calls.push(args)
    }
    const openURL = new Function('data', `
        const appMetadata = {}
        const saveMetadata = () => {}, onClose = () => {}
        ${appsSource.slice(handler.start, handler.end)}
        return openURL
    `)(data)
    await openURL(null, 'https://example.com', 'Site', 'saved', { pinToAppPins: true, name: 'Site', iconUrl: 'icon.png' })
    assert.deepEqual(calls, [
        ['space', { url: 'https://example.com', title: 'Site', shouldFocus: true, pinned: 'normal', pinScope: 'global' }],
        ['tab', { titleOverride: 'Site', faviconOverride: 'icon.png' }]
    ])
})

Deno.test('saved app Docker actions retain actual service names and target a selected container only once', async () => {
    const handler = parse(appsSource).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'handleDockerAction')
    const calls = []
    const action = new Function('runComposeAction', `
        let contextMenu = null, dockerAction = null, dockerMessage = ''
        const refresh = async () => {}
        ${appsSource.slice(handler.start, handler.end)}
        return handleDockerAction
    `)(async (action, app, container) => calls.push({ name: app.name, container: container?.id }))
    const web = { name: 'web', containers: [{ id: 'web-1' }] }
    const worker = { name: 'worker', containers: [{ id: 'worker-1' }] }
    const app = { name: 'Custom app name', composeApps: [web, worker] }
    await action('start', app)
    assert.deepEqual(calls, [{ name: 'web', container: undefined }, { name: 'worker', container: undefined }])
    calls.length = 0
    await action('start', app, worker.containers[0])
    assert.deepEqual(calls, [{ name: 'worker', container: 'worker-1' }])
})

Deno.test('app installation components compile for the client', () => {
    for (const name of ['Apps', 'AddAppModal']) {
        const filename = new URL(`../app/components/${name}.svelte`, import.meta.url).pathname
        compile(Deno.readTextFileSync(filename), { filename, generate: 'client' })
    }
})

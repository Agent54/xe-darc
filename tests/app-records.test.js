import assert from 'node:assert/strict'
import { appSections, repositoryApps } from '../app/lib/app-records.js'

const app = {
    _id: 'saved-repo', type: 'app', appType: 'repo', name: 'My app',
    githubUrl: 'https://github.com/example/hello.git', checkoutPath: 'development/tools',
    pathType: 'compose', path: 'compose.yaml', iconUrl: 'custom.png', dataPartitions: ['work']
}
const service = {
    id: 'hello:web', name: 'web', type: 'docker', configFiles: '/stacks/development/tools/hello/compose.yaml',
    project: 'hello', endpoints: [{ url: 'https://web_hello.app.localhost' }],
    containers: [{ name: 'hello-web-1' }], containerStates: ['running'], installedAt: 100
}

Deno.test('saved documents produce one card each and only unmatched local apps appear in the computer section', () => {
    const docs = {
        [app._id]: app,
        url: { _id: 'url', type: 'app', appType: 'url', name: 'Site', url: 'https://example.com', pinToAppPins: true },
        tab: { _id: 'tab', type: 'tab', url: 'https://example.com' },
        deleted: { ...app, _id: 'deleted', _deleted: true },
        archived: { ...app, _id: 'archived', archive: 'deleted' }
    }
    const worker = { ...service, id: 'hello:worker', endpoints: [], containers: [], containerStates: ['exited'], installedAt: 200 }
    const other = { ...service, id: 'other', configFiles: '/stacks/other/compose.yaml' }
    const sections = appSections(docs, [service, worker, other])
    assert.deepEqual(sections.saved.map(app => app.id), ['saved-repo', 'url'])
    assert.deepEqual(sections.computer.map(app => app.id), ['other'])
    assert.equal(sections.saved[0].name, 'My app')
    assert.equal(sections.saved[0].iconUrl, 'custom.png')
    assert.equal(sections.saved[0].type, 'docker')
    assert.equal(sections.saved[0].hasComposeSetup, true)
    assert.deepEqual(sections.saved[0].containerStates, ['running', 'exited'])
    assert.deepEqual(sections.saved[0].dataPartitions, ['work'])
    assert.equal(sections.saved[0].installedAt, 100)
    assert.equal(sections.saved[1].pinToAppPins, true)

    const reloaded = appSections(JSON.parse(JSON.stringify(docs)), [])
    assert.deepEqual(reloaded.saved.map(app => app.id), ['saved-repo', 'url'])
    assert.equal(reloaded.saved[0].hasComposeSetup, false)
    assert.equal(reloaded.saved[1].url, 'https://example.com')
})

Deno.test('repository matching respects parent folders, explicit Compose paths, checkout results and path boundaries', () => {
    assert.deepEqual(repositoryApps(app, [service]), [service])
    for (const configFiles of ['/stacks/tools/hello/compose.yaml', '/stacks/development/tools/hello-other/compose.yaml', '/stacks/development/tools/hello/other.yaml']) {
        assert.deepEqual(repositoryApps(app, [{ ...service, configFiles }]), [])
    }
    const otherPath = { ...service, configFiles: '/custom/checkout/compose.yaml,/custom/checkout/override.yaml' }
    assert.deepEqual(repositoryApps(app, [otherPath], '/custom/checkout/'), [otherPath])
    assert.deepEqual(repositoryApps({ ...app, path: './compose.yaml' }, [service]), [service])
    assert.deepEqual(repositoryApps({ ...app, pathType: 'dockerfile', path: 'Dockerfile' }, [service]), [service])
    assert.deepEqual(repositoryApps({ ...app, appType: 'url' }, [service]), [])
})

Deno.test('saved apps without containers retain unknown install time and remain visible without a Launcher connection', () => {
    const sections = appSections({ [app._id]: app }, [{ ...service, installedAt: 0 }])
    assert.equal(sections.saved[0].installedAt, 0)
    assert.equal(appSections({ [app._id]: app }, []).saved[0].name, app.name)
})

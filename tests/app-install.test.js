import assert from 'node:assert/strict'
import { compile, parse } from 'svelte/compiler'

const source = Deno.readTextFileSync(new URL('../app/components/AddAppModal.svelte', import.meta.url))
const submitHandler = parse(source).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'submitApp')

function submission(type, onAdd) {
    const checkouts = []
    let closes = 0
    const api = new Function('onAdd', 'checkoutRepository', 'handleClose', `
        const activeTab = ${JSON.stringify(type)}
        const appFormData = {
            name: 'Hello Docker', url: 'https://hello.example/', pinToAppPins: true,
            dataPartitions: ['current'], githubUrl: 'https://github.com/example/hello',
            pathType: 'compose', path: 'compose.yaml', githubToken: 'secret'
        }
        let submissionState = 'idle', submitError = '', checkoutController = null, composeWarning = null
        ${source.slice(submitHandler.start, submitHandler.end)}
        return {
            submitApp,
            cancel() { checkoutController?.abort() },
            get state() { return { submissionState, submitError, composeWarning } }
        }
    `)(onAdd, async options => {
        checkouts.push(options)
        return { path: 'hello' }
    }, () => { closes++ })
    return { ...api, get state() { return api.state }, checkouts, get closes() { return closes } }
}

Deno.test('app installation waits for pin persistence, prevents duplicate submissions and surfaces handler errors', async () => {
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
        assert.equal('githubToken' in payload.app, false)
        assert.equal(h.closes, 0)
        await h.submitApp()
        assert.equal(h.checkouts.length, type === 'repo' ? 1 : 0)
        rejectAdd(new Error('Pin could not be saved'))
        await installing
        assert.equal(h.state.submitError, 'Pin could not be saved')
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

Deno.test('canceling an in-flight install does not close a later modal when saving finishes', async () => {
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

Deno.test('app installation components compile for the client', () => {
    for (const name of ['Apps', 'AddAppModal']) {
        const filename = new URL(`../app/components/${name}.svelte`, import.meta.url).pathname
        compile(Deno.readTextFileSync(filename), { filename, generate: 'client' })
    }
})

import assert from 'node:assert/strict'
import { compileModule } from 'svelte/compiler'
import * as client from 'svelte/internal/client'
import { createPermissionStore } from '../app/lib/permissions.js'

const source = compileModule(`
    const state = $state({ status: 'loading' }), rules = $state({})
    const frame = {}
    const store = createPermissionStore({
        db, putDocument: doc => db.put(doc), permissions: {}, rules, state, instanceId: 'test',
        getWindowId: () => 'window',
        getContext: () => ({ url: 'https://example.com', frame })
    })
    const decision = $derived(store.decision('geolocation', 'tab'))
    export function readDecision() { return decision }
`, { generate: 'client', filename: 'permission-reactivity.svelte.js' }).js.code
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')

Deno.test('derived permission decisions update after an in-flight save completes or fails', async () => {
    for (const fail of [false, true]) {
        const started = Promise.withResolvers(), finish = Promise.withResolvers()
        const db = {
            allDocs: async () => ({ rows: [] }),
            get: async () => { throw { status: 404 } },
            put: async doc => {
                if (!fail) {
                    store.ingest({ ...doc, _rev: '1-test' })
                }
                started.resolve()
                await finish.promise
                if (fail) {
                    throw new Error('Write failed')
                }
                return { rev: '1-test' }
            }
        }
        const { store, readDecision } = new Function('$', 'createPermissionStore', 'db',
            `${source}\nreturn { store, readDecision }`)(client, createPermissionStore, db)
        await store.ready
        assert.equal(readDecision(), 'ask')
        const saving = store.setDecision('geolocation', 'tab', 'allow')
        await started.promise
        assert.equal(readDecision(), 'ask')
        finish.resolve()
        if (fail) {
            await assert.rejects(saving)
        } else {
            await saving
        }
        assert.equal(readDecision(), fail ? 'ask' : 'allow')
    }
})

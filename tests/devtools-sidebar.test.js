import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'

const source = Deno.readTextFileSync(new URL('../app/components/DevToolsSidebar.svelte', import.meta.url))
const script = parse(source).instance.content.body
    .filter(node => node.type !== 'ImportDeclaration' &&
        !(node.type === 'VariableDeclaration' && node.declarations.some(declaration => declaration.id.type === 'ObjectPattern')))
    .map(node => source.slice(node.start, node.end)).join('\n')

function sidebarHarness() {
    const requests = []
    const intervals = new Map()
    const scrollContainer = { scrollTop: 240, scrollLeft: 0 }
    let cleanup
    const api = new Function('$state', 'onMount', 'tick', 'cdpFetch', 'setInterval', 'clearInterval', 'console', `
        ${script}
        contentElement = { parentElement: arguments[7] }
        return {
            refresh: fetchDevToolsData,
            toggle: toggleExpanded,
            get items() { return devToolsData },
            get expanded() { return [...expandedItems] },
            get loading() { return loading },
            get error() { return error }
        }
    `)(
        value => value,
        callback => { cleanup = callback() },
        // Simulate browser scroll anchoring during the DOM update.
        async () => { scrollContainer.scrollTop = 999; scrollContainer.scrollLeft = 99 },
        (path, options) => {
            const pending = Promise.withResolvers()
            requests.push({ path, ...options, ...pending })
            return pending.promise
        },
        (callback, delay) => { intervals.set(1, { callback, delay }); return 1 },
        id => intervals.delete(id),
        { error() {}, warn() {} },
        scrollContainer
    )
    return {
        api, requests, intervals, scrollContainer,
        poll: () => intervals.get(1).callback(),
        destroy: () => cleanup(),
        async respond(index, items, status = 200) {
            requests[index].resolve({ ok: status === 200, status, statusText: 'Unavailable', json: async () => items })
            await new Promise(resolve => setTimeout(resolve, 0))
        }
    }
}

Deno.test('Dev Tools polls every five seconds and preserves scroll and expansion choices on updates', async () => {
    const h = sidebarHarness()
    assert.equal(h.requests.length, 1, 'loads immediately on mount')
    assert.equal(h.requests[0].path, '/json/list')
    assert.equal(h.intervals.get(1).delay, 5000)
    await h.respond(0, [{ id: 'open' }, { id: 'closed' }, { id: 'removed' }])
    h.api.toggle('open')
    h.api.toggle('closed')

    const refresh = h.poll()
    assert.equal(h.api.loading, false, 'background refresh keeps the cards visible')
    h.api.toggle('closed')
    h.scrollContainer.scrollTop = 360
    h.scrollContainer.scrollLeft = 12
    const updated = [
        { id: 'open', title: 'Updated' },
        { id: 'closed' },
        { id: 'new', parentId: 'open' },
        { id: 'new', parentId: 'open' }
    ]
    await h.respond(1, updated)
    await refresh

    assert.deepEqual(h.api.items, updated.slice(0, 3))
    assert.deepEqual(h.api.expanded, ['open'], 'choices made during the request survive')
    assert.equal(h.scrollContainer.scrollTop, 360)
    assert.equal(h.scrollContainer.scrollLeft, 12)
    h.destroy()
})

Deno.test('Dev Tools retains contexts on background failure and recovers on the next poll', async () => {
    const h = sidebarHarness()
    await h.respond(0, [{ id: 'root' }])
    h.api.toggle('root')
    const previous = h.api.items
    const failed = h.poll()
    await h.respond(1, null, 503)
    await failed
    assert.equal(h.api.items, previous)
    assert.equal(h.api.error, null)
    assert.equal(h.api.loading, false)
    assert.deepEqual(h.api.expanded, ['root'])

    const recovered = h.poll()
    await h.respond(2, [{ id: 'root', title: 'Recovered' }])
    await recovered
    assert.equal(h.api.items[0].title, 'Recovered')
    h.destroy()
})

Deno.test('Dev Tools clears an initial connection error after a successful poll', async () => {
    const h = sidebarHarness()
    await h.respond(0, null, 503)
    assert.match(h.api.error, /503/)
    const recovered = h.poll()
    await h.respond(1, [{ id: 'root' }])
    await recovered
    assert.equal(h.api.error, null)
    assert.equal(h.api.loading, false)
    assert.equal(h.api.items.length, 1)
    h.destroy()
})

Deno.test('Dev Tools prevents overlapping requests and cancels polling when closed', async () => {
    const h = sidebarHarness()
    await h.poll()
    await h.api.refresh()
    assert.equal(h.requests.length, 1)
    h.destroy()
    assert.equal(h.intervals.size, 0)
    assert.equal(h.requests[0].signal.aborted, true)
    await h.respond(0, [{ id: 'late-response' }])
    assert.deepEqual(h.api.items, [])
    await h.api.refresh()
    assert.equal(h.requests.length, 1, 'late callbacks cannot restart refresh after closing')
})

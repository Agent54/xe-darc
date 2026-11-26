import assert from 'node:assert/strict'
import { scheduleBackgroundTabMetadata } from '../app/lib/background-tab-metadata.js'

function harness() {
    const callbacks = []
    const requests = []
    const saves = []
    const tab = { url: 'https://example.com/article', title: '' }
    const frame = {}
    const data = {
        docs: { page: tab }, frames: { page: frame }, spaceMeta: {},
        updateTab: (id, update) => saves.push(update)
    }
    let finishFetch
    scheduleBackgroundTabMetadata(data, 'page', {
        requestIdle: callback => callbacks.push(callback),
        fetchPage: (url, options) => {
            requests.push({ url, options })
            return new Promise(resolve => { finishFetch = resolve })
        },
        parse: (html, url) => {
            assert.equal(html, '<title>Article</title>')
            assert.equal(url, 'https://redirect.example/article')
            return { title: 'Article', screenshot: 'https://redirect.example/og.png' }
        }
    })
    return {
        data, tab, frame, saves, requests,
        idle: () => callbacks[0]?.(),
        respond: (options = {}) => finishFetch({
            ok: true, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
            url: 'https://redirect.example/article', text: async () => '<title>Article</title>', ...options
        })
    }
}

Deno.test('background HTML fetch begins only on idle and supplies the initial title and screenshot', async () => {
    const h = harness()
    assert.equal(h.requests.length, 0)
    const loading = h.idle()
    assert.equal(h.requests.length, 1)
    assert.equal(h.requests[0].url, h.tab.url)
    assert.equal(h.requests[0].options.credentials, 'omit')
    h.respond()
    await loading
    assert.deepEqual(h.saves, [{ title: 'Article', screenshot: 'https://redirect.example/og.png' }])
    assert.equal(h.frame.frame, undefined)
    assert.equal(h.tab.lastLoadedAt, undefined)
})

Deno.test('metadata skips tabs closed, navigated or opened before idle or during fetch', async () => {
    for (const change of [
        h => { h.tab.url = 'https://new.example/' },
        h => { h.tab.archive = 'closed' },
        h => { h.tab._deleted = true },
        h => { h.tab.lastLoadedAt = 123 },
        h => { h.frame.frame = {} },
        h => { h.frame.pendingLoad = true },
        h => { h.frame.hibernated = 123 },
        h => { h.data.spaceMeta.activeTabId = 'page' },
        h => { delete h.data.docs.page }
    ]) {
        const before = harness()
        change(before)
        await before.idle()
        assert.equal(before.requests.length, 0)

        const during = harness()
        const loading = during.idle()
        change(during)
        during.respond()
        await loading
        assert.deepEqual(during.saves, [])
    }
})

Deno.test('metadata preserves newer titles and screenshots', async () => {
    const h = harness()
    const loading = h.idle()
    h.tab.title = 'New title'
    h.tab.screenshot = 'attachment://page/screenshot'
    h.respond()
    await loading
    assert.deepEqual(h.saves, [])
})

Deno.test('failed or non-HTML responses leave an unopened tab available for navigation', async () => {
    for (const response of [
        { ok: false },
        { headers: new Headers({ 'content-type': 'application/pdf' }) },
        { text: async () => { throw new Error('Network failure') } }
    ]) {
        const h = harness()
        const loading = h.idle()
        h.respond(response)
        await loading
        assert.deepEqual(h.saves, [])
        assert.deepEqual(h.frame, {})
    }
})

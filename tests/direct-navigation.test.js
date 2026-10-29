import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { origin } from '../app/lib/utils.js'

const source = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const names = ['handleLoadStart', 'handleLoadStop', 'handleLoadAbort', 'setupRequestHandler', 'shouldUseLightboxForOffOrigin', 'wasRecentlyBlocked', 'markAsBlocked']
const handlers = parse(source).instance.content.body
    .filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n')

function navigationHarness(navigationSource = 'browser') {
    const listeners = {}
    const opened = []
    let stopped = 0
    const frame = {
        src: 'https://destination.example/',
        stop() { stopped++ },
        request: Object.fromEntries(['onBeforeRequest', 'onHeadersReceived', 'onAuthRequired', 'onBeforeRedirect', 'onResponseStarted', 'onCompleted', 'onErrorOccurred']
            .map(name => [name, { addListener(callback) { listeners[name] = callback } }]))
    }
    const tab = { id: 'page', url: 'https://original.example/', favicon: 'old' }
    const data = {
        frames: { page: { frame, navigationSource, loading: false } },
        origins: {},
        spaceMeta: { activeSpace: 'space' },
        isPermissionGranted: () => false,
        newTab: (space, options) => opened.push(options)
    }
    const noop = () => {}
    const api = new Function('data', 'tab', 'origin', 'window', 'console', 'setTimeout', `
        let hoveredLink = null, isCommandKeyDown = false
        const recentlyBlockedUrls = new Map(), BLOCK_DEDUP_TIMEOUT = 2000
        const instantlyCleanupGlobalPreview = () => {}, evaluateSecurityState = () => {}, updateTabMeta = () => {}
        const showNetworkAccess = () => {}, showBlockedRequest = () => {}, captureTabScreenshot = () => {}
        const isCertificateError = () => false, isNetworkError = () => false
        ${handlers}
        setupRequestHandler(data.frames.page.frame)
        return {
            start: event => handleLoadStart(tab, event),
            stop: () => handleLoadStop(tab),
            abort: event => handleLoadAbort(tab, event)
        }
    `)(data, tab, origin, { location: { origin: 'https://browser.example' } }, { log: noop }, noop)
    return {
        ...api, data, opened,
        get stopped() { return stopped },
        request(url, type = 'main_frame') {
            let prevented = false
            const result = listeners.onBeforeRequest({ url, type, preventDefault() { prevented = true } })
            return { ...result, prevented }
        }
    }
}

Deno.test('direct navigation and cross-origin redirects stay in the existing tab through both handlers', () => {
    const h = navigationHarness()
    for (const url of ['https://destination.example/', 'https://redirect.example/', 'https://final.example/']) {
        assert.deepEqual(h.request(url), { cancel: false, prevented: false })
        h.start({ isTopLevel: true, url })
    }
    assert.equal(h.opened.length, 0)
    assert.equal(h.stopped, 0)
    assert.equal(h.data.frames.page.navigationSource, 'browser')
})

Deno.test('completed and aborted direct loads restore off-origin lightboxes for subsequent page navigation', () => {
    for (const aborted of [false, true]) {
        const h = navigationHarness()
        h.start({ isTopLevel: true, url: 'https://destination.example/' })
        if (aborted) {
            h.abort({ isTopLevel: true, url: 'https://destination.example/', reason: 'ERR_ABORTED' })
        }
        h.stop()
        assert.equal(h.data.frames.page.navigationSource, null)
        assert.deepEqual(h.request('https://other.example/'), { cancel: true, prevented: true })
        h.start({ isTopLevel: true, url: 'https://other.example/' })
        assert.equal(h.opened.length, 1)
        assert.equal(h.opened[0].lightbox, true)
    }
})

Deno.test('loadstart fallback still opens a lightbox for page-initiated off-origin navigation', () => {
    const h = navigationHarness(null)
    h.start({ isTopLevel: false, url: 'https://subframe.example/' })
    assert.equal(h.opened.length, 0)
    h.start({ isTopLevel: true, url: 'https://other.example/' })
    assert.equal(h.stopped, 1)
    assert.equal(h.opened.length, 1)
    assert.equal(h.opened[0].lightbox, true)
})

Deno.test('direct navigation keeps ordinary request blocking active', () => {
    const h = navigationHarness()
    assert.deepEqual(h.request('https://www.google-analytics.com/collect', 'script'), { cancel: true, prevented: true })
})

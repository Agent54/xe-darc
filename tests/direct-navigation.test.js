import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { origin } from '../app/lib/utils.js'

const source = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const names = ['isDirectNavigation', 'handleLoadRedirect', 'handleLoadCommit', 'handleLoadStart', 'handleLoadStop', 'handleLoadAbort', 'handleNewWindow', 'updateTabMeta', 'setupRequestHandler', 'shouldUseLightboxForOffOrigin', 'wasRecentlyBlocked', 'markAsBlocked']
const handlers = parse(source).instance.content.body
    .filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n')

function navigationHarness({ direct = true, legacy = false, command = false } = {}) {
    const listeners = {}
    const opened = []
    let stopped = 0
    const frame = {
        src: 'https://original.example/',
        stop() { stopped++ },
        executeScript: async () => ['Page title'],
        request: legacy
            ? Object.fromEntries(['onBeforeRequest', 'onHeadersReceived', 'onAuthRequired', 'onBeforeRedirect', 'onResponseStarted', 'onCompleted', 'onErrorOccurred']
                .map(name => [name, { addListener(callback) { listeners[name.replace('on', '').toLowerCase()] = callback } }]))
            : { createWebRequestInterceptor(options) {
                const target = new EventTarget()
                return { addEventListener(name, callback) {
                    if (name === 'beforerequest') assert.equal(options.blocking, true)
                    target.addEventListener(name, callback)
                    listeners[name] = event => target.dispatchEvent(event)
                } }
            } }
    }
    const tab = { id: 'page', url: frame.src, favicon: 'old' }
    const data = {
        docs: { page: tab },
        frames: { page: {
            frame, committedUrl: frame.src, loading: false,
            directNavigation: direct ? { urls: ['https://destination.example/'], requestId: null } : null
        } },
        origins: {},
        spaceMeta: { activeSpace: 'space' },
        isPermissionGranted: () => false,
        getCurrentGroupTabId: () => 'current-group-tab',
        newTab: (space, options) => opened.push(options),
        updateTab: (id, update) => Object.assign(data.docs[id], update)
    }
    const noop = () => {}
    const api = new Function('data', 'tab', 'origin', 'window', 'console', 'setTimeout', `
        let hoveredLink = null, isCommandKeyDown = ${command}
        const recentlyBlockedUrls = new Map(), BLOCK_DEDUP_TIMEOUT = 2000
        const instantlyCleanupGlobalPreview = () => {}, evaluateSecurityState = () => {}
        const showNetworkAccess = () => {}, showBlockedRequest = () => {}, captureTabScreenshot = () => {}
        const isCertificateError = () => false, isNetworkError = () => false
        const isNewTabUrl = url => url?.startsWith('about:'), isTabHistoryUrl = () => false
        const handleOAuthPopup = () => { throw new Error('Unexpected OAuth popup') }
        ${handlers}
        setupRequestHandler(data.frames.page.frame)
        return {
            start: event => handleLoadStart(tab, event),
            commit: event => handleLoadCommit(tab, event),
            redirect: event => handleLoadRedirect(tab, event),
            newWindow: event => handleNewWindow(tab, event),
            stop: () => handleLoadStop(tab),
            abort: event => handleLoadAbort(tab, event)
        }
    `)(data, tab, origin, { location: { origin: 'https://browser.example' } }, { log: noop, error: noop }, noop)
    function requestEvent(name, url, { id = 'navigation', type = legacy ? 'main_frame' : 'main-frame', ...extra } = {}) {
        const event = legacy
            ? { url, requestId: id, type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, ...extra }
            : Object.assign(new Event(name, { cancelable: true }), {
                request: { url, id, type, method: 'GET' },
                ...(extra.redirectUrl ? { response: { redirectURL: extra.redirectUrl } } : extra)
            })
        const result = listeners[name](event)
        return { cancel: event.defaultPrevented || result?.cancel === true, prevented: event.defaultPrevented }
    }
    return {
        ...api, data, tab, frame, opened, requestEvent,
        get stopped() { return stopped },
        request: (url, options) => requestEvent('beforerequest', url, options),
        load(url, isTopLevel = true) { api.start(legacy ? { isTopLevel, url } : { loadInfo: { isTopLevel, url } }) },
        commitUrl(url, isTopLevel = true) { api.commit(legacy ? { isTopLevel, url } : { loadInfo: { isTopLevel, url } }) }
    }
}

for (const legacy of [false, true]) {
    const api = legacy ? 'legacy' : 'current'

    Deno.test(`${api} request API cancels off-origin navigation before opening one lightbox`, async () => {
        const h = navigationHarness({ direct: false, legacy })
        const original = h.tab.url
        assert.deepEqual(h.request('https://other.example/'), { cancel: true, prevented: true })
        h.load('https://other.example/')
        h.frame.src = 'https://other.example/'
        h.stop()
        await Promise.resolve()
        assert.equal(h.opened.length, 1)
        assert.equal(h.opened[0].lightbox, true)
        assert.equal(h.tab.url, original)
        assert.equal(h.data.frames.page.committedUrl, original)
    })

    Deno.test(`${api} direct navigation follows only its own server redirects`, async () => {
        const h = navigationHarness({ legacy })
        let previous = 'https://destination.example/'
        h.load(previous)
        assert.equal(h.request(previous).cancel, false)
        for (const url of ['https://redirect.example/', 'https://final.example/']) {
            h.requestEvent('beforeredirect', previous, { redirectUrl: url })
            assert.equal(h.request(url).cancel, false)
            h.load(url)
            previous = url
        }
        assert.equal(h.opened.length, 0)
        assert.equal(h.stopped, 0)
        h.frame.src = previous
        h.commitUrl(previous)
        await Promise.resolve()
        assert.equal(h.tab.url, previous)
        assert.equal(h.data.frames.page.directNavigation, null)
        assert.equal(h.request('https://other.example/', { id: 'next' }).cancel, true)
        assert.equal(h.opened[0].lightbox, true)
    })

    Deno.test(`${api} a pending direct load cannot exempt unrelated page navigations`, () => {
        const h = navigationHarness({ legacy })
        h.load('https://destination.example/')
        assert.equal(h.request('https://destination.example/').cancel, false)
        assert.equal(h.request('https://other.example/', { id: 'page-initiated' }).cancel, true)
        assert.equal(h.opened[0].lightbox, true)
        assert.equal(h.data.frames.page.directNavigation.requestId, 'navigation')
    })

    Deno.test(`${api} loadstart fallback handles nested events and never advances the parent URL`, async () => {
        const h = navigationHarness({ direct: false, legacy })
        h.load('https://subframe.example/', false)
        assert.equal(h.opened.length, 0)
        h.frame.src = 'https://other.example/'
        h.load(h.frame.src)
        assert.equal(h.stopped, 1)
        assert.equal(h.opened.length, 1)
        assert.equal(h.opened[0].lightbox, true)
        assert.equal(h.request(h.frame.src).cancel, true)
        h.stop()
        await Promise.resolve()
        assert.equal(h.tab.url, 'https://original.example/')
    })

    Deno.test(`${api} new-window links open lightboxes while command-clicks open background tabs`, () => {
        const h = navigationHarness({ legacy })
        for (const disposition of ['new_foreground_tab', 'new_background_tab']) {
            const info = { targetUrl: 'https://other.example/', windowOpenDisposition: disposition }
            h.newWindow(legacy ? info : { newWindow: info })
        }
        assert.equal(h.opened[0].url, 'https://other.example/')
        assert.equal(h.opened[0].lightbox, true)
        assert.equal(h.opened[0].groupTabId, undefined)
        assert.equal(h.opened[1].lightbox, false)
        assert.equal(h.opened[1].shouldFocus, false)
        assert.equal(h.opened[1].groupTabId, 'current-group-tab')
        assert.equal(h.tab.url, 'https://original.example/')
    })

    Deno.test(`${api} command-clicks use the current group for new windows and off-origin fallbacks`, () => {
        for (const navigation of ['new-window', 'request', 'loadstart']) {
            const h = navigationHarness({ direct: false, legacy, command: true })
            const url = 'https://other.example/'
            if (navigation === 'new-window') {
                const info = { targetUrl: url, windowOpenDisposition: 'new_foreground_tab' }
                h.newWindow(legacy ? info : { newWindow: info })
            } else if (navigation === 'request') {
                assert.equal(h.request(url).cancel, true)
            } else {
                h.load(url)
                assert.equal(h.stopped, 1)
            }
            assert.equal(h.opened.length, 1)
            assert.equal(h.opened[0].url, url)
            assert.equal(h.opened[0].groupTabId, 'current-group-tab')
            assert.equal(h.opened[0].lightbox, false)
            assert.equal(h.opened[0].shouldFocus, false)
            assert.equal(h.tab.url, 'https://original.example/')
        }
    })
}

Deno.test('load redirects extend the exemption when no web-request redirect event is available', () => {
    const h = navigationHarness()
    h.load('https://destination.example/')
    h.redirect({ loadRedirectInfo: { isTopLevel: true, oldUrl: 'https://destination.example/', newUrl: 'https://redirect.example/' } })
    h.load('https://redirect.example/')
    assert.equal(h.opened.length, 0)
    assert.equal(h.stopped, 0)
})

Deno.test('commit clears direct-navigation intent without waiting for slow subresources or loadstop', () => {
    const h = navigationHarness()
    h.commitUrl('https://destination.example/')
    assert.equal(h.data.frames.page.directNavigation, null)
    assert.equal(h.request('https://other.example/').cancel, true)
})

Deno.test('same-document commits clear URL-bar intent and subframe commits cannot change the parent', () => {
    const h = navigationHarness()
    h.commitUrl('https://subframe.example/', false)
    assert.equal(h.data.frames.page.committedUrl, 'https://original.example/')
    h.commitUrl('https://destination.example/#section')
    assert.equal(h.data.frames.page.directNavigation, null)
    assert.equal(h.request('https://other.example/').cancel, true)
})

Deno.test('old completion and abort events cannot clear a newer URL-bar navigation', () => {
    const h = navigationHarness()
    h.request('https://destination.example/', { id: 'old' })
    h.data.frames.page.directNavigation = { urls: ['https://new.example/'], requestId: null }
    h.requestEvent('completed', 'https://destination.example/', { id: 'old' })
    h.abort({ loadAbortInfo: { isTopLevel: true, url: 'https://destination.example/', reason: 'ERR_ABORTED' } })
    h.stop()
    assert.equal(h.request('https://new.example/', { id: 'new' }).cancel, false)
    h.abort({ loadAbortInfo: { isTopLevel: true, url: 'https://new.example/', reason: 'ERR_ABORTED' } })
    assert.equal(h.data.frames.page.directNavigation, null)
    assert.equal(h.request('https://other.example/').cancel, true)
})

Deno.test('direct navigation keeps tracker blocking and cross-origin subresources separate from navigation policy', () => {
    const h = navigationHarness()
    assert.equal(h.request('https://www.google-analytics.com/collect', { type: 'script' }).cancel, true)
    assert.equal(h.request('https://cdn.example/app.js', { type: 'script' }).cancel, false)
    assert.equal(h.opened.length, 0)
})

Deno.test('subframe redirects cannot extend the URL-bar exemption', () => {
    const h = navigationHarness()
    h.redirect({ loadRedirectInfo: { isTopLevel: false, oldUrl: 'https://destination.example/', newUrl: 'https://other.example/' } })
    assert.equal(h.request('https://other.example/').cancel, true)
})

Deno.test('same-origin page navigation stays in the parent while its off-origin redirect is blocked', () => {
    const h = navigationHarness({ direct: false })
    h.load('https://original.example/redirect')
    assert.equal(h.request('https://original.example/redirect').cancel, false)
    assert.equal(h.request('https://other.example/').cancel, true)
    assert.equal(h.opened[0].lightbox, true)
})

Deno.test('main-request completion and errors clear only their matching direct navigation', () => {
    for (const name of ['completed', 'erroroccurred']) {
        const h = navigationHarness()
        h.request('https://destination.example/')
        h.requestEvent(name, 'https://destination.example/', { error: 'net::ERR_BLOCKED_BY_CLIENT' })
        assert.equal(h.data.frames.page.directNavigation, null)
        assert.equal(h.request('https://other.example/', { id: 'next' }).cancel, true)
    }
})

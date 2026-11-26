import assert from 'node:assert/strict'
import { compile, compileModule } from 'svelte/compiler'
import * as server from 'svelte/internal/server'
import { render } from 'svelte/server'
import { getTabGroups, tabGroupMetadataId } from '../app/lib/tab-groups.js'
import { getTabTitle } from '../app/lib/tab-title.js'

const data = { docs: {}, frames: {}, origins: {} }

function component(name, dependencies = {}) {
    const source = Deno.readTextFileSync(new URL(`../app/components/${name}.svelte`, import.meta.url))
    const compiled = compile(source, { generate: 'server', filename: `${name}.svelte` }).js.code
        .replace(/^import .*$/gm, '')
        .replace('export default function', 'function')
    return new Function('$', 'data', 'getTabTitle', ...Object.keys(dependencies), `${compiled}\nreturn ${name}`)(server, data, getTabTitle, ...Object.values(dependencies))
}

const SecurityIndicator = component('SecurityIndicator', { origin: url => new URL(url).origin })
const Favicon = component('Favicon', { SecurityIndicator })
const LinkPreviewFavicon = component('LinkPreviewFavicon', { Favicon })
const previewSource = compileModule(Deno.readTextFileSync(new URL('../app/lib/tab-group-preview.svelte.js', import.meta.url)), { generate: 'server' }).js.code
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
const { getFaviconWindow, getDefaultGroupTabIndex } = new Function(`${previewSource}\nreturn { getFaviconWindow, getDefaultGroupTabIndex }`)()
const TabGroupPreview = component('TabGroupPreview', { Favicon, getFaviconWindow, getDefaultGroupTabIndex })
const LightboxHeader = component('LightboxHeader', {
    Favicon,
    UrlBar: () => {},
    Tooltip: () => {}
})

function faviconMarkup(Component, props) {
    const html = render(Component, { props }).body
    const favicon = html.match(/<span class="favicon-wrapper[\s\S]*?<\/span>/)
    assert.ok(favicon, 'renders the shared favicon wrapper')
    return favicon[0]
}

function lightboxFavicon(tab) {
    const props = { tab, showControls: false }
    const markup = faviconMarkup(LightboxHeader, props)
    assert.equal(markup, faviconMarkup(Favicon, { tab, showButton: false }))
    return markup
}

Deno.test('group drag previews render the group title and favicons without a hover controller', () => {
    const tabs = Array.from({ length: 4 }, (_, index) => ({
        id: `member-${index}`, type: 'tab', tabGroupId: 'group', tabGroupOrder: index,
        title: `Member ${index}`, url: 'about:blank'
    }))
    for (const metadata of [null, { name: 'Research', emoji: '🔎' }, { name: 'Work', favicon: 'data:image/png;base64,AA==' }]) {
        const docs = metadata ? { [tabGroupMetadataId('group')]: metadata } : {}
        const [group] = getTabGroups(tabs, [], docs)
        const html = render(TabGroupPreview, { props: { group, groupId: group.id, active: true, disabled: true } }).body
        assert.match(html, new RegExp(`>${metadata?.name || 'Member 0'}</span>`))
        assert.equal((html.match(/class="preview-favicon[\s"]/g) || []).length, metadata ? 2 : 3)
        if (metadata?.emoji) assert.match(html, /🔎/)
        if (metadata?.favicon) assert.match(html, /data:image\/png;base64,AA==/)
    }
})

Deno.test('lightbox shares fallback, new-tab, image and inline SVG favicons', () => {
    const tab = { id: 'favicon-tab', url: 'https://example.com', title: 'Example' }
    assert.match(lightboxFavicon(tab), /fallback-favicon/)
    assert.match(lightboxFavicon({ ...tab, url: 'about:newtab' }), /new-tab-icon/)
    assert.match(lightboxFavicon({ ...tab, url: 'about:blank' }), /new-tab-icon/)
    assert.match(lightboxFavicon({ ...tab, favicon: 'data:image/png;base64,AA==' }), /<img/)
    assert.match(lightboxFavicon({ ...tab, favicon: '<svg viewBox="0 0 24 24"><circle r="8" /></svg>' }), /<circle r="8"/)
})

Deno.test('individual icon overrides apply in every shared favicon display and reset to page icons', () => {
    const tab = { id: 'override-tab', url: 'about:newtab', favicon: 'data:image/png;base64,AA==' }
    for (const showButton of [true, false]) {
        const html = render(Favicon, { props: { tab: { ...tab, emojiOverride: '🧪' }, showButton } }).body
        assert.match(html, /🧪/)
        assert.doesNotMatch(html, /new-tab-icon/)
    }
    data.docs[tab.id] = { ...tab, url: 'https://new.example', faviconOverride: 'https://icons.example/icon.png?url=https://old.example' }
    assert.match(faviconMarkup(Favicon, { tab, showButton: false }), /<img/)
    data.docs[tab.id] = { ...tab, emojiOverride: null, faviconOverride: null }
    assert.match(faviconMarkup(Favicon, { tab, showButton: false }), /new-tab-icon/)
    delete data.docs[tab.id]
})

Deno.test('lightbox reads current document favicon and rejects stale domain icons', () => {
    const tab = { id: 'document-tab', url: 'https://old.example', favicon: 'data:image/png;base64,AA==' }
    data.docs[tab.id] = {
        url: 'https://new.example',
        favicon: 'https://t1.gstatic.com/faviconV2?url=https%3A%2F%2Fnew.example&size=16'
    }
    try {
        assert.match(lightboxFavicon(tab), /drop_404_icon=true/)
        data.docs[tab.id].url = 'https://other.example'
        assert.match(lightboxFavicon(tab), /fallback-favicon/)
    } finally {
        delete data.docs[tab.id]
    }
})

Deno.test('lightbox and tab bar share the frame loading indicator as frame state changes', () => {
    const tab = { id: 'loading-tab', url: 'https://example.com' }
    data.frames[tab.id] = { loading: true }
    try {
        assert.match(lightboxFavicon(tab), /aria-label="Loading page"/)
        assert.match(render(Favicon, { props: { tab } }).body, /favicon-loading-spinner/)
        data.frames[tab.id].loading = false
        assert.doesNotMatch(lightboxFavicon(tab), /favicon-loading-spinner/)
        data.frames[tab.id].loading = true
        assert.match(lightboxFavicon(tab), /favicon-loading-spinner/)
        delete data.frames[tab.id]
        assert.doesNotMatch(lightboxFavicon(tab), /favicon-loading-spinner/)
    } finally {
        delete data.frames[tab.id]
    }
})

Deno.test('lightbox uses the shared security indicator', () => {
    const tab = { id: 'security-tab', url: 'https://example.com' }
    data.origins['https://example.com'] = { certificateError: { text: 'Invalid certificate' } }
    try {
        assert.match(lightboxFavicon(tab), /security-indicator/)
        assert.match(lightboxFavicon(tab), /Invalid certificate/)
    } finally {
        delete data.origins['https://example.com']
    }
})

Deno.test('shared favicons show current audio and mute state in both display modes', () => {
    const tab = { id: 'audio-tab', url: 'https://example.com', audioPlaying: false }
    try {
        for (const showButton of [true, false]) {
            for (const size of ['normal', 'small']) {
                const markup = () => render(Favicon, { props: { tab, showButton, size } }).body
                data.docs[tab.id] = { ...tab, audioPlaying: true }
                assert.match(markup(), /aria-label="Playing audio"/)
                assert.match(markup(), /fallback-favicon/)
                data.docs[tab.id] = { ...tab, audioPlaying: true, muted: true }
                assert.match(markup(), /aria-label="Tab muted"/)
                assert.doesNotMatch(markup(), /aria-label="Playing audio"/)
                data.docs[tab.id].audioPlaying = false
                assert.match(markup(), /aria-label="Tab muted"/)
                data.docs[tab.id].muted = false
                assert.doesNotMatch(markup(), /favicon-audio-indicator/)
            }
        }
        delete data.docs[tab.id]
        assert.match(lightboxFavicon({ ...tab, audioPlaying: true }), /aria-label="Playing audio"/)
    } finally {
        delete data.docs[tab.id]
    }
})

Deno.test('link previews request only the encoded web origin and use shared favicon handling', () => {
    const html = render(LinkPreviewFavicon, { props: { url: 'https://example.com/path?q=one&size=999#section' } }).body
    const src = html.match(/<img src="([^"]+)"/)[1].replaceAll('&amp;', '&')
    const request = new URL(src)
    assert.equal(request.searchParams.get('url'), 'https://example.com')
    assert.equal(request.searchParams.get('size'), '16')
    assert.equal(request.searchParams.get('drop_404_icon'), 'true')
    assert.match(html, /favicon-wrapper/)
})

Deno.test('link previews avoid favicon requests for non-web and malformed links', () => {
    for (const url of ['', 'not a URL', 'mailto:jan@example.com', 'javascript:void(0)', 'file:///example.html', 'tel:123', 'about:blank']) {
        const html = render(LinkPreviewFavicon, { props: { url } }).body
        assert.doesNotMatch(html, /<img/)
        assert.match(html, /fallback-favicon|new-tab-icon/)
    }
})

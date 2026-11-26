import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('background-tab-metadata', async ({ page }) => {
    const parsed = await page.evaluate(() => {
        const parse = window.parseBackgroundTabMetadata
        return [
            parse('<title> An &amp; article </title><meta property="og:image" content="../og.png">', 'https://example.com/posts/article'),
            parse('<base href="/assets/"><meta property="og:title" content="OG title"><meta property="og:image" content="cover.png">', 'https://redirect.example/page'),
            parse('<title>Title only</title><meta property="og:image" content="javascript:alert(1)">', 'https://example.com/'),
            parse('<meta property="og:image" content="https://[invalid">', 'https://example.com/')
        ]
    })
    assert.deepEqual(parsed, [
        { title: 'An & article', screenshot: 'https://example.com/og.png' },
        { title: 'OG title', screenshot: 'https://redirect.example/assets/cover.png' },
        { title: 'Title only' },
        {}
    ])

    let htmlRequests = 0
    await page.setRequestInterception(true)
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/background-article') {
            htmlRequests++
            return request.respond({ status: 200, contentType: 'text/html', body: '<title>Fetched article</title><meta property="og:image" content="/og.svg">' })
        }
        return request.continue()
    })
    await page.evaluate(() => {
        const data = window.data
        data.spaceMeta.activeTabId = 'group-one'
        data.docs.outside.url = new URL('/background-article', location.href).href
        data.docs.outside.title = ''
        delete data.docs.outside.screenshot
        data.updateTab = async (id, update) => Object.assign(data.docs[id], update)
        window.scheduleBackgroundTabMetadata(data, 'outside', {
            requestIdle: callback => { window.metadataIdle = callback }
        })
    })
    assert.equal(htmlRequests, 0, 'creating a background tab must not fetch before idle')
    await page.evaluate(() => window.metadataIdle())
    assert.equal(htmlRequests, 1)
    assert.deepEqual(await page.evaluate(() => ({
        title: window.data.docs.outside.title,
        screenshot: window.data.docs.outside.screenshot,
        loaded: !!window.data.docs.outside.lastLoadedAt,
        liveFrame: !!window.data.frames.outside?.frame
    })), {
        title: 'Fetched article', screenshot: new URL('/og.svg', page.url()).href,
        loaded: false, liveFrame: false
    })
    await page.evaluate(() => window.mountTopbarHovercard())
    await page.waitForFunction(() => {
        const image = document.querySelector('#topbar-hovercard-fixture .hovercard-screenshot img')
        return image?.complete && image.naturalWidth > 0 && image.src.endsWith('/og.svg')
    })
    assert.equal(await page.$eval('#topbar-hovercard-fixture .hovercard-title', title => title.textContent), 'Fetched article')
    console.log('Idle HTML parsing supplies the initial hovercard title and OG preview without loading a live page')
}, `
    import { parseBackgroundTabMetadata, scheduleBackgroundTabMetadata } from './app/lib/background-tab-metadata.js'
    window.parseBackgroundTabMetadata = parseBackgroundTabMetadata
    window.scheduleBackgroundTabMetadata = scheduleBackgroundTabMetadata
`)

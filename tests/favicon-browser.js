import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('favicon', async ({ page, requests }) => {
    async function testAudioIndicators() {
        for (const id of ['outside', 'pin-two', 'group-two']) {
            await page.evaluate(id => window.flushSync(() => {
                window.data.docs[id] = { ...window.data.docs[id], audioPlaying: true }
            }), id)
            const selector = id === 'group-two' ? '.tab-group-main .favicon-audio-indicator' : `[data-tab-id="${id}"] .favicon-audio-indicator`
            await page.waitForSelector(selector)
            assert.equal(await page.$eval(selector, el => el.getAttribute('aria-label')), 'Playing audio')
            const geometry = await page.$eval(selector, el => {
                const icon = el.getBoundingClientRect()
                const wrapper = el.parentElement.getBoundingClientRect()
                return { icon: icon.toJSON(), wrapper: wrapper.toJSON() }
            })
            const { icon, wrapper } = geometry
            assert.ok(icon.width === 10 && icon.height === 10 && icon.left >= wrapper.left && icon.top >= wrapper.top && icon.right <= wrapper.right && icon.bottom <= wrapper.bottom,
                `${id}: audio overlay must fit inside favicon: ${JSON.stringify(geometry)}`)
            await page.evaluate(id => window.flushSync(() => { window.data.docs[id].muted = true }), id)
            assert.equal(await page.$eval(selector, el => el.getAttribute('aria-label')), 'Tab muted')
            await page.evaluate(id => window.flushSync(() => {
                window.data.docs[id].muted = false
                window.data.docs[id].audioPlaying = false
            }), id)
            assert.equal(await page.$(selector), null)
        }
    }
    if (Deno.args.includes('--audio-only')) {
        await testAudioIndicators()
        console.log('Chromium: audio favicon overlays, mute transitions and group sizing pass')
        return
    }

    const activityOrder = () => page.$$eval('.tabs-list > [data-tab-id]', rows => rows.map(row => row.dataset.tabId))
    const originalActivityOrder = await activityOrder()
    assert.deepEqual(await page.$eval('.activity-toggle', button => [button.offsetWidth, button.offsetHeight, button.getAttribute('aria-pressed')]), [20, 20, 'false'])
    await page.click('.activity-toggle')
    assert.deepEqual(await activityOrder(), originalActivityOrder, 'the activity toggle preserves ordering when no activity has been recorded')
    await page.click('.activity-toggle')
    await page.evaluate(() => window.flushSync(() => { window.data.docs.outside.lastActivityAt = 100 }))
    assert.deepEqual(await activityOrder(), originalActivityOrder, 'activity must not affect ordinary mode')
    await page.click('.activity-toggle')
    assert.equal(await page.$eval('.activity-toggle', button => button.getAttribute('aria-pressed')), 'true')
    assert.deepEqual(await activityOrder(), ['outside', 'group-missing'])
    await page.screenshot({ path: `${root}.cache/tab-activity-sorting.png` })
    await page.evaluate(() => window.flushSync(() => { window.data.ui.showUrl = true }))
    assert.equal(await page.$eval('.activity-toggle', button => {
        const rect = button.getBoundingClientRect()
        const url = document.querySelector('.sidebar-top-row .url-bar-container').getBoundingClientRect()
        return url.right < rect.left && button.contains(document.elementFromPoint(rect.left + 10, rect.top + 10))
    }), true, 'the URL bar and activity toggle remain reachable without overlapping')
    await page.screenshot({ path: `${root}.cache/tab-activity-url.png` })
    await page.evaluate(() => window.flushSync(() => { window.data.ui.showUrl = false }))
    assert.equal(await page.$('.activity-tabs-divider'), null, 'activity and fallback tabs have no divider')
    await page.evaluate(() => window.flushSync(() => { window.data.docs.outside.lastActivityAt = 0 }))
    assert.deepEqual(await activityOrder(), ['group-missing', 'outside'], 'a tab without activity uses its order timestamp in the same list')
    await page.click('.tab-group', { button: 'right' })
    await page.waitForSelector('.context-menu')
    await page.evaluate(() => [...document.querySelectorAll('.context-menu-item')].find(button => button.textContent.trim() === 'Bump to top').click())
    await page.waitForSelector('.context-menu', { hidden: true })
    assert.deepEqual(await activityOrder(), ['group-missing', 'outside'], 'bumping a group keeps its canonical sidebar anchor')
    await page.click('.tab-group-toggle')
    const sidebarMemberIds = () => page.$$eval('.tab-group-content > .tab-item-container', rows => rows.map(row => row.dataset.tabId))
    assert.equal((await sidebarMemberIds())[0], 'group-two', 'sidebar group members follow their explicit activity')
    assert.deepEqual(await page.evaluate(() => window.data.getTabGroup('group-two', 'space').tabs.slice(0, 2).map(tab => tab.id)), ['group-missing', 'group-two'], 'sidebar sorting leaves traditional title-bar data intact')
    await page.click('.activity-toggle')
    assert.equal((await sidebarMemberIds())[0], 'group-tail-5', 'disabling activity restores newest-first manual sidebar member order')
    await page.click('.tab-group-toggle')
    assert.deepEqual(await activityOrder(), originalActivityOrder, 'turning activity off restores the existing order')
    await page.click('[data-tab-id="outside"] .tab-item-main', { button: 'right' })
    await page.waitForSelector('.context-menu')
    assert.equal(await page.$$eval('.context-menu-item', items => items.some(item => item.textContent.trim() === 'Bump to top')), false)
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.flushSync(() => {
        delete window.data.docs.outside.lastActivityAt
        delete window.data.docs['group-two'].lastActivityAt
    }))
    console.log('Chromium: activity toggle, sorting, group bump and ordinary-order restoration pass')
    if (Deno.args.includes('--activity-only')) return

    await page.evaluate(() => {
        window.closedRows = [...document.querySelectorAll('.closed-tab-item')]
        window.closedIcons = window.closedRows.map(row => row.querySelector('.favicon, .fallback-favicon'))
        window.groupIcons = [...document.querySelectorAll('.preview-favicon .favicon, .preview-favicon .fallback-favicon')]
        window.outsideIcon = document.querySelector('[data-tab-id="outside"] .favicon')
        window.flushSync(() => window.data.removeClosedTab('closed-one'))
    })
    await page.waitForNetworkIdle({ idleTime: 100 })
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.closed-tab-item')].map((row, i) => ({
        row: row === window.closedRows[i + 1],
        icon: row.querySelector('.favicon, .fallback-favicon') === window.closedIcons[i + 1]
    }))), [{ row: true, icon: true }, { row: true, icon: true }], 'removing a closed entry must preserve surviving rows and failed-icon state')

    assert.equal(await page.evaluate(() => {
        const icon = document.querySelectorAll('.pinned-tab .favicon')[1]
        window.flushSync(() => { window.data.spaceMeta.globalPins = window.data.spaceMeta.globalPins.slice(1) })
        return icon === document.querySelector('.pinned-tab .favicon')
    }), true, 'removing a global pin must preserve surviving favicons')

    assert.equal(await page.evaluate(() => {
        const OriginalURL = window.URL
        let parses = 0
        window.URL = new Proxy(OriginalURL, {
            construct(target, args) {
                parses++
                return Reflect.construct(target, args)
            }
        })
        try {
            window.flushSync(() => {
                window.data.docs.outside = { ...window.data.spaces.space.tabs[2], title: 'Updated title', canvas: { x: 100 } }
                window.data.frames.outside = { loading: true }
            })
            return parses
        } finally {
            window.URL = OriginalURL
        }
    }), 0, 'title, layout and loading changes must not reparse favicon URLs')
    assert.ok(await page.$('[data-tab-id="outside"] .favicon-loading-spinner'))

    await testAudioIndicators()

    for (const expanded of [true, false, true]) {
        await page.evaluate(() => {
            document.querySelector('.tab-group-toggle').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
            window.flushSync()
        })
        await page.waitForNetworkIdle({ idleTime: 100 })
        assert.equal(await page.$eval('.tab-group-scroll', el => !el.hidden), expanded)
        assert.equal(await page.evaluate(() => window.outsideIcon === document.querySelector('[data-tab-id="outside"] .favicon')), true)
        assert.equal(await page.evaluate(() => window.groupIcons.every((icon, i) => icon === document.querySelectorAll('.preview-favicon .favicon, .preview-favicon .fallback-favicon')[i])), true)
        if (expanded) {
            await page.waitForFunction(() => document.querySelector('[data-tab-id="group-missing"] .fallback-favicon'))
            assert.equal(await page.evaluate(() => {
                const icon = document.querySelector('[data-tab-id="group-missing"] .fallback-favicon')
                const same = !window.expandedIcon || window.expandedIcon === icon
                window.expandedIcon = icon
                return same
            }), true, 'reopening a group must preserve failed-icon state')
        }
    }
    assert.equal(requests.filter(path => path === '/missing.svg').length, 1, 'closed fallback must not retry its failed URL')
    assert.equal(requests.filter(path => path === '/group-missing.svg').length, 2, 'group preview and expanded row should each try once')

    await page.evaluate(() => window.flushSync(() => {
        window.data.docs.outside.favicon = location.origin + '/updated.svg'
        window.data.frames.outside.loading = false
    }))
    await page.waitForFunction(() => document.querySelector('[data-tab-id="outside"] .favicon')?.src.endsWith('/updated.svg'))
    await page.waitForNetworkIdle({ idleTime: 100 })
    assert.equal(requests.filter(path => path === '/updated.svg').length, 1, 'a changed favicon must still load')
    assert.equal(await page.$('[data-tab-id="outside"] .favicon-loading-spinner'), null)

    const previewRequests = []
    await page.setRequestInterception(true)
    page.on('request', request => {
        const url = new URL(request.url())
        if (url.hostname === 't1.gstatic.com') {
            previewRequests.push(url.searchParams.get('url'))
            const missing = url.searchParams.get('url') === 'https://missing.example'
            request.respond({
                status: missing ? 404 : 200,
                contentType: 'image/svg+xml',
                body: missing ? '' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6"/></svg>'
            })
        } else {
            request.continue()
        }
    })
    await page.evaluate(() => {
        window.flushSync(() => { window.data.linkPreviewUrl = 'https://missing.example/path?a=1&size=999#section' })
        window.mountLinkPreview()
    })
    await page.waitForSelector('#link-preview-fixture .fallback-favicon')
    assert.equal(await page.$('#link-preview-fixture img'), null, 'a failed link favicon must show the globe instead of a broken image')
    assert.deepEqual(previewRequests, ['https://missing.example'])
    await page.evaluate(() => window.flushSync(() => { window.data.linkPreviewUrl = 'https://missing.example/another-path' }))
    assert.ok(await page.$('#link-preview-fixture .fallback-favicon'), 'another link on the same origin must keep the fallback')
    await page.evaluate(() => window.flushSync(() => { window.data.linkPreviewUrl = 'https://working.example/path?a=1&size=999#section' }))
    await page.waitForFunction(() => document.querySelector('#link-preview-fixture img')?.naturalWidth > 0)
    assert.deepEqual(previewRequests, ['https://missing.example', 'https://working.example'], 'a new origin must load its favicon after the previous one fails')
    assert.deepEqual(await page.$eval('#link-preview-fixture .link-preview-icon', icon => ({ width: icon.clientWidth, height: icon.clientHeight })), { width: 12, height: 12 })
    for (const url of ['mailto:jan@example.com', 'javascript:void(0)', 'not a URL']) {
        await page.evaluate(url => window.flushSync(() => { window.data.linkPreviewUrl = url }), url)
        assert.ok(await page.$('#link-preview-fixture .fallback-favicon'))
        assert.equal(await page.$('#link-preview-fixture img'), null)
    }
    assert.equal(previewRequests.length, 2, 'non-web links must not request a favicon')
    console.log('Chromium: favicon identity, fallback, URL updates, loading/audio overlays and link previews pass')
})

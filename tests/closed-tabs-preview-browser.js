import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('closed-tabs-preview', async ({ page }) => {
    const closedRows = () => page.$$eval('.closed-toast-row', rows => rows.map(row => row.dataset.tabId))
    const headings = () => page.$$eval('.tab-toast h2', rows => rows.map(row => row.textContent))
    const waitForDismissal = () => page.waitForSelector('.tab-toasts', { hidden: true })
    await page.setViewport({ width: 1280, height: 900 })
    await page.mouse.move(700, 500)
    assert.equal(await page.$('.tab-toasts'), null, 'loading closed history must not flash the toast')
    await page.evaluate(() => {
        window.previewFixtureClosedTabs = [...window.data.spaceMeta.closedTabs]
        window.closePreviewFixtureTab = (id, age = 0) => window.flushSync(() => {
            const tab = { id, title: id, type: 'tab', spaceId: 'space', url: 'https://example.com', closedAt: Date.now() - age }
            window.data.docs[id] = tab
            window.data.spaceMeta.closedTabs = [tab, ...window.data.spaceMeta.closedTabs.filter(tab => tab.id !== id)]
        })
        window.movePreviewFixtureTab = (id, spaceId = 'destination', count = 1) => window.flushSync(() => {
            const tabs = Array.from({ length: count }, (_, index) => ({
                id: `${id}-${index}`, title: `${id} tab ${index + 1}`, type: 'tab', spaceId, url: 'https://example.com'
            }))
            for (const tab of tabs) window.data.docs[tab.id] = tab
            window.data.spaceMeta.recentTabMoves = [{
                id: crypto.randomUUID(), targetSpaceId: spaceId, title: count > 1 ? id : null, tabs, movedAt: Date.now()
            }, ...window.data.spaceMeta.recentTabMoves]
        })
        // A freshly modified old entry must not qualify as a fresh close.
        window.flushSync(() => { window.data.spaceMeta.closedTabs[2].modified = Date.now() })
    })
    assert.equal(await page.$('.tab-toasts'), null)
    await page.evaluate(() => window.closePreviewFixtureTab('preview-first'))
    assert.deepEqual(await closedRows(), ['preview-first'], 'the toast must exclude older history')
    assert.deepEqual(await headings(), ['Recently closed tabs'])
    const countdown = () => page.$eval('.tab-toast .toast-countdown .remaining', ring => Number(ring.getAttribute('stroke-dashoffset')))
    assert.ok(await countdown() < 0.2, 'a fresh toast starts with a nearly full countdown ring')
    assert.equal(await page.$eval('.closed-tabs-content', el => el.classList.contains('expanded')), false, 'closing a tab must no longer expand the sidebar history')
    await new Promise(resolve => setTimeout(resolve, 600))
    assert.ok(await countdown() > 0.15, 'the ring drains toward dismissal')
    await page.evaluate(() => window.closePreviewFixtureTab('preview-second'))
    assert.deepEqual(await closedRows(), ['preview-second', 'preview-first'])
    await new Promise(resolve => setTimeout(resolve, 600))
    await page.evaluate(() => window.closePreviewFixtureTab('preview-second'))
    await new Promise(resolve => setTimeout(resolve, 2600))
    assert.ok(await page.$('.tab-toasts'), 'closing the same tab again must restart the three-second timer')
    await waitForDismissal()

    await page.evaluate(() => window.flushSync(() => {
        window.data.ui.sidebarVisible = false
        window.data.spaceMeta.closedTabs = []
    }))
    await new Promise(resolve => setTimeout(resolve, 650))
    await page.evaluate(() => window.closePreviewFixtureTab('preview-hidden'))
    assert.equal(await page.$eval('.sidebar-box', el => el.getBoundingClientRect().left < -100), true)
    assert.equal(await page.$eval('.tab-toasts', el => {
        const rect = el.getBoundingClientRect()
        return rect.left === 16 && rect.top === 16 && rect.right < innerWidth / 2
    }), true, 'the toast stays top-left independently of the hidden sidebar')
    assert.equal(await page.$eval('.closed-toast-row .tab-toast-item', row => {
        const rect = row.getBoundingClientRect()
        return row.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
    }), true, 'closed tabs must remain clickable with a hidden sidebar')
    await page.hover('.tab-toasts')
    const pausedCountdown = await countdown()
    await new Promise(resolve => setTimeout(resolve, 3300))
    assert.ok(await page.$('.tab-toasts'), 'hovering must pause dismissal')
    assert.equal(await countdown(), pausedCountdown, 'hovering freezes the countdown with dismissal')
    await page.mouse.move(700, 500)
    assert.ok(await countdown() < 0.2, 'leaving restarts the ring with the three-second hide timer')
    await page.focus('.closed-toast-row .tab-toast-item')
    await new Promise(resolve => setTimeout(resolve, 3300))
    assert.ok(await page.$('.tab-toasts'), 'keyboard focus must pause dismissal')
    await page.evaluate(() => document.activeElement.blur())
    await waitForDismissal()

    await page.evaluate(() => {
        window.flushSync(() => { window.data.spaceMeta.closedTabs = [] })
        window.closePreviewFixtureTab('preview-expiring', 9800)
        window.closePreviewFixtureTab('preview-current')
    })
    await page.waitForFunction(() => !document.querySelector('.closed-toast-row[data-tab-id="preview-expiring"]'))
    assert.deepEqual(await closedRows(), ['preview-current'], 'rows must expire at ten seconds while the toast remains open')
    await page.click('.tab-toast .dismiss')
    await waitForDismissal()

    await page.evaluate(() => {
        window.flushSync(() => {
            window.data.spaceMeta.closedTabs = []
            window.data.spaces.destination = { name: 'Research', tabs: [] }
            window.data.spaces.another = { name: 'Work', tabs: [] }
        })
        window.closePreviewFixtureTab('restore-me')
        window.movePreviewFixtureTab('Design references', 'destination', 3)
        window.movePreviewFixtureTab('Notes', 'another')
    })
    assert.deepEqual(await headings(), ['Moved to Work', 'Moved to Research', 'Recently closed tabs'], 'moved sections always precede closed tabs')
    assert.equal(await page.$eval('.tab-count', el => el.textContent), '3 tabs', 'a group move appears as one row with its count')
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.tab-toasts')).opacity) === 1)
    await page.screenshot({ path: `${root}.cache/tab-toasts-desktop.png` })
    await page.setViewport({ width: 320, height: 600 })
    assert.equal(await page.$eval('.tab-toasts', el => {
        const rect = el.getBoundingClientRect()
        return rect.left >= 16 && rect.right <= innerWidth - 16 && rect.bottom <= innerHeight
    }), true, 'the toast fits narrow viewports')
    await page.screenshot({ path: `${root}.cache/tab-toasts-mobile.png` })
    await page.evaluate(() => window.flushSync(() => { window.data.ui.toastHeader = true }))
    assert.equal(await page.$eval('.tab-toasts', el => el.getBoundingClientRect().top), 51, 'window controls retain their top inset')
    await page.setViewport({ width: 1280, height: 900 })
    await page.evaluate(() => { window.data.restoreClosedTab = id => {
        window.restoredPreviewTab = id
        window.data.removeClosedTab(id)
    } })
    await page.click('.closed-toast-row .tab-toast-item')
    assert.equal(await page.evaluate(() => window.restoredPreviewTab), 'restore-me')
    assert.equal(await page.$('.closed-section'), null)
    assert.ok(await page.$('.moved-section'), 'restoring a tab leaves the moved section available')
    await page.click('.moved-tab-item')
    assert.equal(await page.evaluate(() => window.data.spaceMeta.activeSpace), 'another')
    assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), 'Notes-0')
    await waitForDismissal()

    await page.evaluate(() => window.closePreviewFixtureTab('remove-me'))
    await page.hover('.closed-toast-row')
    await page.click('.closed-toast-row .remove')
    assert.equal(await page.evaluate(() => window.data.spaceMeta.closedTabs.some(tab => tab.id === 'remove-me')), false)
    await page.click('.tab-toast .dismiss')
    await waitForDismissal()
    await page.evaluate(() => window.closePreviewFixtureTab('escape-me'))
    await page.keyboard.press('Escape')
    await waitForDismissal()

    await page.evaluate(() => window.flushSync(() => {
        window.data.spaceMeta.recentTabMoves = []
        window.data.spaceMeta.closedTabs = window.previewFixtureClosedTabs
        window.data.ui.sidebarVisible = true
    }))
    await page.waitForFunction(() => document.querySelector('.closed-tabs-header').getBoundingClientRect().left >= 0)
    await page.hover('.closed-tabs-header')
    await page.waitForFunction(() => document.querySelector('.closed-tabs-content').classList.contains('expanded'))
    assert.ok(await page.$('.closed-tab-item[data-tab-id="closed-two"]'), 'the sidebar retains the full history on hover')
    console.log('Chromium: shared tab toasts, section ordering, expiry, hover/focus retention, restoration, dismissal and responsive placement pass')
}, `
    import TabToasts from './app/components/TabToasts.svelte'
    data.spaceMeta.recentTabMoves = []
    mount(TabToasts, { target: document.body, props: {
        get headerPartOfMain() { return !!data.ui.toastHeader }
    } })
`)

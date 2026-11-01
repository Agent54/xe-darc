import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('closed-tabs-preview', async ({ page }) => {
    assert.equal(await page.$eval('.closed-tabs-content', el => el.classList.contains('expanded')), false, 'loading closed history must not flash the preview')
    await page.evaluate(() => {
        window.previewFixtureClosedTabs = [...window.data.spaceMeta.closedTabs]
        window.closePreviewFixtureTab = (id, age = 0) => window.flushSync(() => {
            const tab = { id, title: id, type: 'tab', spaceId: 'space', url: 'https://example.com', closedAt: Date.now() - age }
            window.data.docs[id] = tab
            window.data.spaceMeta.closedTabs = [tab, ...window.data.spaceMeta.closedTabs.filter(tab => tab.id !== id)]
        })
        // A freshly modified old entry must not qualify as a fresh close.
        window.flushSync(() => { window.data.spaceMeta.closedTabs[2].modified = Date.now() })
    })
    assert.equal(await page.$eval('.closed-tabs-content', el => el.classList.contains('expanded')), false)
    await page.evaluate(() => window.closePreviewFixtureTab('preview-first'))
    assert.deepEqual(await page.$$eval('.closed-tab-item', rows => rows.map(row => row.dataset.tabId)), ['preview-first'], 'the automatic preview must exclude older history')
    await new Promise(resolve => setTimeout(resolve, 600))
    await page.evaluate(() => window.closePreviewFixtureTab('preview-second'))
    assert.deepEqual(await page.$$eval('.closed-tab-item', rows => rows.map(row => row.dataset.tabId)), ['preview-second', 'preview-first'])
    await new Promise(resolve => setTimeout(resolve, 600))
    assert.equal(await page.$eval('.closed-tabs-content', el => el.classList.contains('expanded')), true, 'another close must restart the one-second preview')
    await page.evaluate(() => window.closePreviewFixtureTab('preview-second'))
    await new Promise(resolve => setTimeout(resolve, 600))
    assert.equal(await page.$eval('.closed-tabs-content', el => el.classList.contains('expanded')), true, 'closing the same tab again must restart the timer even when the history length stays the same')
    await page.waitForFunction(() => !document.querySelector('.closed-tabs-content').classList.contains('expanded'))
    await page.evaluate(() => window.flushSync(() => { window.data.ui.sidebarVisible = false }))
    await page.mouse.move(700, 100)
    await new Promise(resolve => setTimeout(resolve, 650))
    await page.evaluate(() => {
        window.closePreviewFixtureTab('preview-expiring', 9800)
        window.closePreviewFixtureTab('preview-hidden')
    })
    assert.equal(await page.$eval('.sidebar-box', el => el.getBoundingClientRect().left < -100), true, 'the rest of the sidebar must remain tucked away')
    assert.equal(await page.$eval('.closed-tabs-content', el => {
        const rect = el.getBoundingClientRect()
        return rect.left >= 0 && rect.right > 200 && getComputedStyle(el).visibility === 'visible'
    }), true, 'the preview must be visible even with a hidden sidebar')
    await page.waitForFunction(() => !document.querySelector('.closed-tab-item[data-tab-id="preview-expiring"]'))
    assert.equal(await page.$eval('.closed-tabs-content', el => el.classList.contains('expanded')), true, 'rows must expire at ten seconds while the preview is still open')
    assert.equal(await page.$eval('.closed-tab-item[data-tab-id="preview-hidden"]', row => {
        const rect = row.getBoundingClientRect()
        return row.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
    }), true, 'the tucked-away sidebar preview must allow clicking a closed tab')
    await page.hover('.closed-tabs-header')
    await page.waitForFunction(() => document.querySelector('.closed-tab-item[data-tab-id="closed-two"]'))
    await page.waitForFunction(() => !document.querySelector('.sidebar-box').classList.contains('closed-tabs-preview'))
    assert.equal(await page.$eval('.closed-tabs-content', el => el.classList.contains('expanded')), true, 'hovering must keep the full history open after the preview expires')
    await page.mouse.move(700, 100)
    await page.waitForFunction(() => !document.querySelector('.closed-tabs-content').classList.contains('expanded'))
    await page.evaluate(() => window.flushSync(() => {
        window.data.spaceMeta.closedTabs = window.previewFixtureClosedTabs
        window.data.ui.sidebarVisible = true
    }))
    await new Promise(resolve => setTimeout(resolve, 250))
    console.log('Chromium: closed-tab preview filtering, expiry, hidden sidebar and hover retention pass')
})

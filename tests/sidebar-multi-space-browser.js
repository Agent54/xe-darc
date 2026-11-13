import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-multi-space', async ({ page }) => {
    await page.setViewport({ width: 1100, height: 600 })
    await page.evaluate(() => window.flushSync(() => {
        const data = window.data
        for (const spaceId of ['other', 'third']) {
            const tab = { ...data.docs.outside, id: `${spaceId}-tab`, title: `${spaceId} tab`, spaceId }
            data.docs[tab.id] = tab
            data.spaces[spaceId] = { name: spaceId, pinnedTabs: [], activeTabsOrder: [tab.id], tabs: [tab] }
            data.spaceMeta.spaceOrder.push(spaceId)
        }
        data.activate('outside')
    }))

    const expand = async () => {
        // Expansion is triggered by overscrolling past the first space's left edge.
        await page.$eval('.tab-content-container', list => {
            list.scrollLeft = 0
            list.dispatchEvent(new WheelEvent('wheel', { deltaX: -800, bubbles: true, cancelable: true }))
        })
        await page.waitForSelector('.tab-content-container.multi-space:not(.closing)')
    }
    const expectActiveSpaceVisible = async (spaceId, tabId) => {
        await page.waitForSelector('.tab-content-container:not(.multi-space)')
        await page.waitForFunction(spaceId => {
            const space = document.querySelector(`.space-content[data-space-id="${spaceId}"]`)
            const bounds = space.closest('.tab-content-container').getBoundingClientRect()
            const rect = space.getBoundingClientRect()
            return Math.abs(rect.left - bounds.left) <= 1 && rect.right <= bounds.right + 1
        }, {}, spaceId)
        // Include the deferred scroll after the closing animation.
        await new Promise(resolve => setTimeout(resolve, 100))
        assert.deepEqual(await page.evaluate(() => ({
            spaceId: window.data.spaceMeta.activeSpace,
            tabId: window.data.spaceMeta.activeTabId
        })), { spaceId, tabId })
        assert.equal(await page.$eval(`.space-content[data-space-id="${spaceId}"]`, space => {
            const bounds = space.closest('.tab-content-container').getBoundingClientRect()
            const rect = space.getBoundingClientRect()
            return Math.abs(rect.left - bounds.left) <= 1 && rect.right <= bounds.right + 1
        }), true, `the sidebar must reveal ${spaceId}`)
    }

    for (const width of [263, 320]) {
        await page.evaluate(width => window.flushSync(() => { window.data.ui.sidebarWidth = width }), width)
        await expand()
        await page.click('[data-tab-id="other-tab"] .tab-item-main')
        await expectActiveSpaceVisible('other', 'other-tab')

        await expand()
        await page.click('.space-item[data-space-id="third"]')
        await expectActiveSpaceVisible('third', 'third-tab')

        await expand()
        await page.click('.close-multi-space-button')
        await expectActiveSpaceVisible('third', 'third-tab')
    }

    // A sidebar click used to disconnect the space-order effect from activeSpace.
    // Gesture/history navigation must still work without an active-tab change.
    await page.click('.space-item[data-space-id="other"]')
    await expectActiveSpaceVisible('other', 'other-tab')
    await page.evaluate(() => window.flushSync(() => { window.data.spaceMeta.activeTabId = null }))
    for (const spaceId of ['third', 'space', 'other', 'third']) {
        await page.evaluate(spaceId => window.flushSync(() => { window.data.activateSpace(spaceId) }), spaceId)
        await expectActiveSpaceVisible(spaceId, null)
    }

    // Clearing search restores the active lane even when no tab is selected.
    await page.click('.search-toggle-tab')
    await page.type('.tab-search-input', 'other tab')
    await page.click('.tab-search-clear')
    await expectActiveSpaceVisible('third', null)

    // A space containing only a newly created tab must reveal just as reliably.
    await page.evaluate(() => window.flushSync(() => { window.data.spaces.third.tabs = [] }))
    await page.click('.space-content[data-space-id="third"] .new-tab-button')
    await expectActiveSpaceVisible('third', 'new-normal')
    for (const spaceId of ['other', 'third', 'space', 'third']) {
        await page.evaluate(spaceId => window.flushSync(() => { window.data.activateSpace(spaceId) }), spaceId)
        await expectActiveSpaceVisible(spaceId, 'new-normal')
    }

    await expand()
    await page.click('.close-multi-space-button')
    await page.evaluate(() => window.flushSync(() => { window.data.activateSpace('other') }))
    await expectActiveSpaceVisible('other', 'new-normal')

    await page.evaluate(() => window.flushSync(() => { window.data.spaceMeta.spaceOrder = ['third', 'space', 'other'] }))
    await expectActiveSpaceVisible('other', 'new-normal')
    await page.$eval('.tab-content-container', list => { list.scrollLeft = 0 })
    await page.evaluate(() => window.flushSync(() => { window.data.docs.outside.title = 'Updated title' }))
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(await page.$eval('.tab-content-container', list => list.scrollLeft), 0,
        'unrelated updates must preserve manual horizontal scrolling')

    console.log('Chromium: space navigation without tab changes, new-tab-only spaces, search, reordering and full-width closing pass')
})

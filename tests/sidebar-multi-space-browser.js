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
        }), true, `closing the expanded sidebar must reveal ${spaceId}`)
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
    console.log('Chromium: closing the full-width sidebar follows the selected tab or space at default and custom widths')
})

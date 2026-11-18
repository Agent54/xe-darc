import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-group-scroll', async ({ page }) => {
    await page.evaluate(() => window.flushSync(() => {
        const data = window.data
        const tabs = Array.from({ length: 24 }, (_, group) =>
            Array.from({ length: 8 }, (_, member) => ({
                ...data.docs.outside, id: `group-${group}-${member}`, title: `Tab ${group}-${member}`,
                tabGroupId: `group-${group}`, tabGroupOrder: member, order: group
            }))
        ).flat()
        tabs.push({ ...data.docs.outside, id: 'standalone', title: 'Standalone', order: 12.5 })
        data.spaces.space.tabs = tabs
        for (const tab of tabs) data.docs[tab.id] = tab
    }))

    const toggleAll = async () => {
        await page.click('.space-group-toggle')
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    }
    const activePosition = () => page.evaluate(() => {
        const list = document.querySelector('.space-tabs-sections')
        const tab = list.querySelector(`.tab-item-container[data-tab-id="${window.data.spaceMeta.activeTabId}"]`)
        const row = tab && !tab.closest('[hidden]') ? tab : list.querySelector('.tab-group.active')
        const bounds = list.getBoundingClientRect()
        return (row.getBoundingClientRect().top - bounds.top) / bounds.height
    })
    const positionActive = async relativeTop => {
        await page.evaluate(relativeTop => {
            const list = document.querySelector('.space-tabs-sections')
            const tab = list.querySelector(`.tab-item-container[data-tab-id="${window.data.spaceMeta.activeTabId}"]`)
            const row = tab && !tab.closest('[hidden]') ? tab : list.querySelector('.tab-group.active')
            const previousPosition = row.style.position
            row.style.position = 'relative'
            const inner = row.closest('.tab-group-content')
            if (inner) inner.scrollTop += row.getBoundingClientRect().top - inner.getBoundingClientRect().top - 20
            const bounds = list.getBoundingClientRect()
            list.scrollTop += row.getBoundingClientRect().top - bounds.top - relativeTop * bounds.height
            row.style.position = previousPosition
        }, relativeTop)
        const actual = await activePosition()
        assert.ok(Math.abs(actual - relativeTop) < 0.005,
            `the fixture must place ${await page.evaluate(() => window.data.spaceMeta.activeTabId)} at ${relativeTop}, got ${actual}`)
    }

    for (const height of [600, 360]) {
        await page.setViewport({ width: 800, height })
        for (const tabId of ['standalone', 'group-12-0', 'group-12-7']) {
            await page.evaluate(tabId => window.flushSync(() => { window.data.spaceMeta.activeTabId = tabId }), tabId)
            // Let the existing activation reveal finish before manually positioning the row.
            await new Promise(resolve => setTimeout(resolve, 100))
            for (const relativeTop of [0.25, 0.75]) {
                await positionActive(relativeTop)
                for (let count = 0; count < 4; count++) {
                    await toggleAll()
                    const actual = await activePosition()
                    assert.ok(Math.abs(actual - relativeTop) < 0.005,
                        `${tabId} must stay at ${relativeTop} of the visible ${height}px sidebar after toggle ${count}, got ${actual}`)
                    assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), tabId)
                }
            }
        }
    }

    // Clearing an individual override must preserve the active row, too.
    await page.$eval('[data-tab-group-id="group-12"] .tab-group-toggle', button =>
        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    await positionActive(0.75)
    await toggleAll()
    assert.ok(Math.abs(await activePosition() - 0.75) < 0.005, 'expand-all must preserve the active member of an already expanded group')
    await page.$eval('[data-tab-group-id="group-12"] .tab-group-toggle', button =>
        button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    await positionActive(0.75)
    await toggleAll()
    assert.ok(Math.abs(await activePosition() - 0.75) < 0.005, 'collapse-all must preserve the active header of an already collapsed group')

    await page.$eval('.space-tabs-sections', list => { list.scrollTop = 0 })
    await toggleAll()
    assert.equal(await page.$eval('.space-tabs-sections', list => list.scrollTop), 0, 'an offscreen active group must not pull the sidebar away from the current view')
    console.log('Chromium: expand/collapse all preserves the active tab or group position across repeated toggles and short windows')
})

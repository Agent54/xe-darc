import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-scroll', async ({ page }) => {
    await page.evaluate(() => window.flushSync(() => {
        const data = window.data
        const makeTab = (id, index) => ({ ...data.docs.outside, id, title: id, tabGroupId: null, order: 100 + index })
        data.spaceMeta.globalPins = Array.from({ length: 80 }, (_, index) => makeTab('global-' + index, index))
        data.spaces.space.pinnedTabs = Array.from({ length: 80 }, (_, index) => makeTab('app-' + index, index))
        const tabs = Array.from({ length: 60 }, (_, index) => makeTab('normal-' + index, index))
        data.spaces.space.tabs.push(...tabs)
        for (const tab of [...data.spaceMeta.globalPins, ...data.spaces.space.pinnedTabs, ...tabs]) data.docs[tab.id] = tab
    }))
    const buttonVisible = () => page.$eval('.new-tab-row', button => {
        const rect = button.getBoundingClientRect()
        const space = button.closest('.space-content').getBoundingClientRect()
        const closed = document.querySelector('.closed-tabs-header').getBoundingClientRect()
        return rect.top >= space.top - 1 && rect.bottom <= Math.min(space.bottom, closed.top) + 1 && rect.height >= 36
    })
    for (const height of [600, 360]) {
        await page.setViewport({ width: 800, height })
        await page.evaluate(() => window.flushSync(() => { window.data.ui.showUrl = true }))
        await page.$eval('.space-content', space => { space.scrollTop = 0 })
        assert.equal(await buttonVisible(), true, `New Tab must stay visible with the URL bar and crowded pins at ${height}px height`)
        await page.evaluate(() => window.flushSync(() => { window.data.ui.showUrl = false }))
        await page.$eval('.space-content', space => { space.scrollTop = 0 })
        assert.equal(await buttonVisible(), true, `New Tab must stay fully visible with crowded pins at ${height}px height`)
        for (const selector of ['[data-pin-scope="global"]', '[data-pin-scope="space"]']) {
            assert.equal(await page.$eval(selector, grid => grid.scrollHeight > grid.clientHeight), true, 'crowded app pins must scroll within a limited height')
            await page.$eval(selector, grid => { grid.scrollTop = grid.scrollHeight })
            assert.equal(await page.$eval(selector, grid => {
                const pin = grid.querySelector('[data-tab-id]:last-child').getBoundingClientRect()
                const bounds = grid.getBoundingClientRect()
                return pin.bottom <= bounds.bottom + 1 && pin.top >= bounds.top - 1
            }), true, 'the last app pin must remain reachable')
            assert.equal(await buttonVisible(), true)
        }
    }
    await page.setViewport({ width: 800, height: 600 })
    await page.$eval('.space-content', space => { space.scrollTop = 0 })
    assert.equal(await page.$eval('.new-tab-row', row => {
        const rect = row.getBoundingClientRect()
        const space = row.closest('.space-content').getBoundingClientRect()
        return Math.abs(rect.top + rect.height / 2 - space.top - space.height / 2) < 12
    }), true, 'crowded app pins should limit New Tab near the center rather than the bottom')
    await page.hover('.new-tab-button')
    await page.mouse.wheel({ deltaY: 500 })
    await page.waitForFunction(() => document.querySelector('.space-content').scrollTop > 0)
    assert.equal(await page.$eval('.new-tab-row', row => Math.abs(row.getBoundingClientRect().top - row.closest('.space-content').getBoundingClientRect().top) <= 1), true, 'New Tab must stick at the top when scrolling down')
    await page.$eval('.tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    await page.evaluate(() => window.flushSync(() => {
        window.data.spaces.space.activeTabsOrder = ['group-tail-5', 'outside']
        window.data.spaceMeta.activeTabId = 'group-tail-5'
    }))
    await page.waitForFunction(() => {
        const tab = document.querySelector('.tab-group-content [data-tab-id="group-tail-5"]')
        const row = tab?.getBoundingClientRect()
        const content = tab?.closest('.tab-group-content').getBoundingClientRect()
        return row && row.top >= content.top - 1 && row.bottom <= content.bottom + 1
    })
    assert.equal(await buttonVisible(), true, 'revealing a grouped tab must preserve the sticky New Tab button')
    await page.evaluate(() => window.flushSync(() => { window.data.spaceMeta.activeTabId = 'normal-59' }))
    await page.waitForFunction(() => {
        const row = document.querySelector('[data-tab-id="normal-59"]').getBoundingClientRect()
        const space = document.querySelector('.space-content').getBoundingClientRect()
        return row.bottom <= space.bottom + 1 && row.top >= document.querySelector('.new-tab-row').getBoundingClientRect().bottom
    })
    assert.equal(await buttonVisible(), true, 'revealing the active tab must keep New Tab visible')
    const previousScroll = await page.$eval('.space-content', space => space.scrollTop)
    await page.click('.new-tab-button')
    await page.waitForSelector('.tabs-list > [data-tab-id="new-normal"]')
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(await page.$eval('.space-content', space => space.scrollTop), previousScroll, 'creating a tab must preserve scroll when New Tab is already visible')
    assert.equal(await buttonVisible(), true)
    await page.$eval('.space-content', space => {
        space.querySelector('.new-tab-row').style.position = 'relative'
        space.scrollTop = space.scrollHeight
    })
    assert.equal(await buttonVisible(), false)
    await page.$eval('.tabs-list-bottom-spacer', spacer => spacer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    await page.waitForFunction(() => {
        const row = document.querySelector('.new-tab-row').getBoundingClientRect()
        const space = document.querySelector('.space-content').getBoundingClientRect()
        return Math.abs(row.top + row.height / 2 - space.top - space.height / 2) < 12
    })
    assert.equal(await buttonVisible(), true, 'an out-of-view New Tab area should be recovered at the center')
    await page.$eval('.new-tab-row', row => row.style.removeProperty('position'))
    await page.screenshot({ path: `${root}.cache/sidebar-new-tab-scroll.png` })
    console.log('Chromium: centered New Tab limit, no scrolling while visible, recovery only when out of view, crowded pins and short windows pass')
})

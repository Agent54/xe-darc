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
        await page.$eval('.space-tabs-sections', space => { space.scrollTop = 0 })
        assert.equal(await buttonVisible(), true, `New Tab must stay visible with the URL bar and crowded pins at ${height}px height`)
        await page.evaluate(() => window.flushSync(() => { window.data.ui.showUrl = false }))
        await page.$eval('.space-tabs-sections', space => { space.scrollTop = 0 })
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
    await page.$eval('.space-tabs-sections', space => { space.scrollTop = 0 })
    const headerGeometry = () => page.$$eval('.space-title-container, .space-sticky-tabs > [data-pin-scope="space"], .new-tab-row', elements => elements.map(el => {
        const rect = el.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom }
    }))
    const fixedHeader = await headerGeometry()
    const scrollPoint = await page.$eval('.space-tabs-sections', el => {
        const r = el.getBoundingClientRect()
        return { x: r.left + 40, y: r.top + r.height / 2 }
    })
    await page.mouse.move(scrollPoint.x, scrollPoint.y)
    await page.mouse.wheel({ deltaY: 500 })
    await page.waitForFunction(() => document.querySelector('.space-tabs-sections').scrollTop > 0)
    assert.deepEqual(await headerGeometry(), fixedHeader, 'scrolling the lower section leaves the complete header fixed')
    assert.equal(await page.$eval('.space-content', el => el.scrollTop), 0)
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
    const previousScroll = await page.$eval('.space-tabs-sections', space => space.scrollTop)
    await page.click('.new-tab-button')
    await page.waitForSelector('.tabs-list > [data-tab-id="new-normal"]')
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(await page.$eval('.space-tabs-sections', space => space.scrollTop), previousScroll, 'creating a tab must preserve scroll when New Tab is already visible')
    assert.equal(await buttonVisible(), true)
    await page.$eval('.space-tabs-sections', el => { el.scrollTop = el.scrollHeight })
    const beforeCreate = await page.$eval('.space-tabs-sections', el => el.scrollTop)
    await page.$eval('.tabs-list-bottom-spacer', spacer => spacer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    await page.waitForSelector('.tabs-list > [data-tab-id="new-normal-2"]')
    assert.equal(await page.$eval('.space-tabs-sections', el => el.scrollTop), beforeCreate)
    assert.equal(await buttonVisible(), true, 'New Tab stays visible even at the bottom of the list')
    for (const tabId of ['normal-59', 'group-tail-5']) {
        for (const clearMethod of ['button', 'Escape', 'Backspace']) {
            await page.evaluate(() => window.flushSync(() => { window.data.activate('outside') }))
            await page.click('.search-toggle-tab')
            await page.type('.tab-search-input', tabId)
            await page.click(`.tab-item-container[data-tab-id="${tabId}"] .tab-item-main`)
            await page.waitForFunction(tabId => window.data.spaceMeta.activeTabId === tabId, {}, tabId)
            if (clearMethod === 'button') {
                await page.click('.tab-search-clear')
            } else {
                await page.focus('.tab-search-input')
                if (clearMethod === 'Backspace') {
                    await page.$eval('.tab-search-input', input => input.select())
                }
                await page.keyboard.press(clearMethod)
            }
            await page.waitForFunction(tabId => {
                const tab = document.querySelector(`.tab-item-container[data-tab-id="${tabId}"]`)
                const row = tab?.getBoundingClientRect()
                const lists = [tab?.closest('.space-tabs-sections'), tab?.closest('.tab-group-content')].filter(Boolean)
                return !document.querySelector('.tab-content-container.searching') && row && lists.every(list => {
                    const bounds = list.getBoundingClientRect()
                    return row.top >= bounds.top - 1 && row.bottom <= bounds.bottom + 1
                })
            }, {}, tabId)
            assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), tabId, `${clearMethod} must reveal the selected tab without changing activation`)
            assert.equal(await buttonVisible(), true, 'clearing search preserves the sticky New Tab button')
            if (clearMethod === 'Backspace') {
                await page.keyboard.press('Escape')
            }
        }
    }
    await page.screenshot({ path: `${root}.cache/sidebar-new-tab-scroll.png` })
    console.log('Chromium: fixed header, independent tab scrolling, crowded pins, short windows, new-tab scroll preservation and active-tab reveal after clearing search pass')
})

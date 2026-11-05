import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('pin-modes', async ({ page }) => {
    await page.setViewport({ width: 1280, height: 900 })
    await page.evaluate(() => window.flushSync(() => {
        window.data.spaceMeta.activeTabId = 'outside'
        for (const pin of window.data.spaceMeta.globalPins) Object.assign(pin, { pinned: 'menu', pinScope: 'global' })
        for (const tab of window.data.spaces.space.tabs.filter(tab => tab.tabGroupId)) {
            tab.sidebarPinned = 'fixed'
            tab.sidebarPinOrder = 1
        }
        window.data.ui.tabActivityMode = true
    }))
    assert.ok(await page.$('.fixed-sidebar-pins .tab-group-wrapper'), 'a pinned group keeps its group header')
    assert.equal(await page.$('.tabs-list .tab-group-wrapper'), null, 'a pinned group leaves the normal list')
    await page.click('.fixed-sidebar-pins .tab-group-toggle')
    await page.waitForSelector('.fixed-sidebar-pins .tab-group-content')
    const memberIds = await page.$$eval('.fixed-sidebar-pins .tab-group-content [data-tab-id]', tabs => tabs.map(tab => tab.dataset.tabId))
    await page.evaluate(() => window.flushSync(() => {
        window.data.docs['group-missing'].lastActivityAt = Date.now() + 10000
    }))
    assert.deepEqual(await page.$$eval('.fixed-sidebar-pins .tab-group-content [data-tab-id]', tabs => tabs.map(tab => tab.dataset.tabId)), memberIds, 'pinned group members keep manual order in activity mode')
    await page.click('.fixed-sidebar-pins .tab-group-toggle')

    const group = await page.$eval('.fixed-sidebar-pins .tab-group-main', element => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left + 40, y: rect.top + rect.height / 2 }
    })
    const originalNewTabTop = await page.$eval('.new-tab-row', element => element.getBoundingClientRect().top)
    await page.mouse.move(group.x, group.y)
    await page.mouse.down()
    const divider = await page.$eval('.pinned-tabs-divider', element => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left + 40, y: rect.top }
    })
    await page.mouse.move(divider.x, divider.y, { steps: 5 })
    await page.waitForFunction(() => window.tabDrag.dropTarget?.pinScope === 'sidebar')
    assert.equal(await page.evaluate(() => window.tabDrag.dropTarget.scope), 'group')
    assert.equal(await page.evaluate(() => window.tabDrag.indicator.height), 2)
    assert.equal(await page.$eval('.new-tab-row', element => element.getBoundingClientRect().top), originalNewTabTop, 'dragging keeps neighboring geometry fixed')
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1).scope), 'group')
    await page.evaluate(() => window.flushSync(() => {
        for (const tab of window.data.spaces.space.tabs.filter(tab => tab.tabGroupId)) tab.sidebarPinned = true
    }))
    assert.ok(await page.$('.space-tabs-sections .sidebar-pinned-tabs .tab-group-wrapper'), 'moving the group to scrolling pins retains its header')
    assert.equal(await page.$('.fixed-sidebar-pins'), null)

    await page.focus('.pinned-tab[data-tab-id="pin-one"]')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.pin-menu')
    assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), 'outside')
    assert.equal(await page.$eval('.pin-menu', panel => {
        const rect = panel.getBoundingClientRect()
        const sidebar = document.querySelector('.sidebar-box').getBoundingClientRect()
        return Math.abs(rect.left - sidebar.right - 10) < 1 && rect.height < innerHeight && rect.top >= 20
    }), true, 'the webpage menu fits beside the sidebar with a hovercard gap')
    const handle = await page.$eval('.pin-menu-resize', button => {
        const rect = button.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + 50 }
    })
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x + 100, handle.y, { steps: 5 })
    await page.mouse.up()
    const savedWidth = await page.evaluate(() => window.data.docs['pin-one'].pinMenuWidth)
    assert.ok(savedWidth > 550)
    await page.screenshot({ path: `${root}.cache/pin-menu.png` })
    const title = await page.$eval('.pin-menu-test-title', element => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left + 40, y: rect.top + 16 }
    })
    await page.mouse.move(title.x, title.y)
    await page.mouse.down()
    await page.mouse.move(1200, 850)
    await page.mouse.up()
    assert.ok(await page.$('.pin-menu'), 'pressing inside and releasing outside does not dismiss the menu')
    await page.mouse.click(1200, 850)
    await page.waitForSelector('.pin-menu', { hidden: true })
    await page.click('.pinned-tab[data-tab-id="pin-one"]')
    await page.waitForSelector('.pin-menu')
    assert.equal(await page.$eval('.pin-menu', element => element.getBoundingClientRect().width), savedWidth)
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('darc-controlled-frame-mousedown', { detail: { tabId: 'pin-one' } }))
        window.dispatchEvent(new CustomEvent('darc-controlled-frame-mouseup', { detail: { tabId: 'outside' } }))
    })
    assert.ok(await page.$('.pin-menu'), 'a press in one guest and release in another does not count as an outside click')
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('darc-controlled-frame-mousedown', { detail: { tabId: 'outside' } }))
        window.dispatchEvent(new CustomEvent('darc-controlled-frame-mouseup', { detail: { tabId: 'outside' } }))
    })
    await page.waitForSelector('.pin-menu', { hidden: true })
    await page.click('.pinned-tab[data-tab-id="pin-one"]')
    await page.waitForSelector('.pin-menu')
    await page.click('.pinned-tab[data-tab-id="pin-two"]')
    assert.equal(await page.$eval('.pin-menu', element => element.getBoundingClientRect().width), 480, 'menu widths belong to individual pins')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.pin-menu', { hidden: true })

    await page.evaluate(() => window.flushSync(() => { window.data.docs['pin-one'].pinned = 'normal' }))
    await page.click('.pinned-tab[data-tab-id="pin-one"]')
    assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), 'pin-one')
    assert.equal(await page.$('.pin-menu'), null)
    await page.screenshot({ path: `${root}.cache/pin-modes.png` })
    console.log('Chromium: pinned group rendering/manual order, Normal activation, Menu placement, resizing, per-pin width and outside-click/Escape dismissal pass')
})

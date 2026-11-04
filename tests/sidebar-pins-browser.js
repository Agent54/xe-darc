import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-pins', async ({ page }) => {
    const beginPinDrag = async selector => {
        const source = await page.$eval(selector, el => {
            const r = el.getBoundingClientRect()
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        })
        await page.mouse.move(source.x, source.y)
        await page.mouse.down()
        await page.mouse.move(source.x + 8, source.y + 8)
        await page.waitForFunction(() => window.tabDrag.active)
    }
    const moveToPinTarget = async (selector, edge = false) => {
        const target = await page.$eval(selector, el => {
            const r = el.getBoundingClientRect()
            return { x: r.left + r.width / 2, y: r.top, height: r.height }
        })
        await page.mouse.move(target.x, target.y + (edge ? 2 : target.height / 2))
    }
    await beginPinDrag('[data-tab-id="outside"] .tab-item-main')
    await moveToPinTarget('.space-title-container[data-pin-scope="space"]')
    assert.equal(await page.evaluate(() => window.tabDrag.dropTarget?.pinScope), 'space')
    await page.mouse.up()
    assert.deepEqual(await page.evaluate(() => ({ type: window.pinDrops.at(-1).type, tabId: window.pinDrops.at(-1).tabId, space: window.pinDrops.at(-1).targetSpaceId })), { type: 'pin', tabId: 'outside', space: 'space' })

    await beginPinDrag('[data-tab-id="outside"] .tab-item-main')
    await moveToPinTarget('[data-pin-scope="global"] [data-tab-id="pin-two"]')
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1).pinScope), 'global')
    await page.evaluate(() => window.flushSync(() => {
        const tab = { ...window.data.docs.outside, id: 'space-pin', pinned: 'left', pinScope: 'space' }
        window.data.docs[tab.id] = tab
        window.data.spaces.space.pinnedTabs = [tab]
    }))
    await beginPinDrag('[data-pin-scope="space"] [data-tab-id="space-pin"]')
    await moveToPinTarget('[data-pin-scope="global"] [data-tab-id="pin-two"]')
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1).tabId), 'space-pin')
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1).pinScope), 'global')

    await beginPinDrag('[data-pin-scope="global"] [data-tab-id="pin-one"]')
    await moveToPinTarget('.tabs-list > [data-tab-id="outside"]', true)
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1).type), 'reorder')
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1).tabId), 'pin-one')
    await beginPinDrag('[data-pin-scope="space"] [data-tab-id="space-pin"]')
    await moveToPinTarget('.tabs-list > [data-tab-id="outside"]', true)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.pinDrops.length), 4)
    await page.evaluate(() => window.flushSync(() => {
        window.savedGlobalPins = window.data.spaceMeta.globalPins
        window.data.spaceMeta.globalPins = []
        window.data.spaces.space.pinnedTabs = []
    }))
    await beginPinDrag('[data-tab-id="outside"] .tab-item-main')
    const emptyGlobalTarget = await page.$eval('[data-pin-scope="global"] .all-apps-tab', el => {
        const r = el.getBoundingClientRect()
        return { x: r.right + 12, y: r.top + r.height / 2 }
    })
    await page.mouse.move(emptyGlobalTarget.x, emptyGlobalTarget.y)
    assert.equal(await page.evaluate(() => window.tabDrag.dropTarget?.pinScope), 'global')
    await page.mouse.up()
    await page.evaluate(() => window.flushSync(() => {
        window.data.spaceMeta.globalPins = window.savedGlobalPins
        window.data.spaceMeta.activeTabId = null
    }))
    await page.mouse.move(790, 590)
    assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), null, 'dragging pins must not activate them')
    await page.click('[data-pin-scope="global"] [data-tab-id="pin-one"]')
    await page.waitForFunction(() => window.data.spaceMeta.activeTabId === 'pin-one')
    await beginPinDrag('[data-tab-id="outside"] .tab-item-main')
    await moveToPinTarget('.pinned-tabs-divider[data-pin-scope="sidebar"]')
    assert.equal(await page.evaluate(() => window.tabDrag.dropTarget?.pinScope), 'sidebar')
    assert.equal(await page.evaluate(() => window.tabDrag.indicator.height), 2)
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1).pinScope), 'sidebar')
    await page.evaluate(() => window.flushSync(() => { window.data.docs.outside.sidebarPinned = true }))
    await page.waitForSelector('.sidebar-pinned-tabs [data-tab-id="outside"] .tab-title')
    assert.equal(await page.$eval('.sidebar-pinned-tabs .tab-title', title => title.textContent), 'outside')
    assert.equal(await page.$('.tabs-list [data-tab-id="outside"]'), null, 'sidebar pins must not also appear in normal tabs')
    assert.equal(await page.$eval('.pinned-tabs-divider', divider => {
        const newTab = document.querySelector('.new-tab-row').getBoundingClientRect()
        const pins = document.querySelector('.sidebar-pinned-tabs').getBoundingClientRect()
        const normal = document.querySelector('.tabs-list').getBoundingClientRect()
        const rect = divider.getBoundingClientRect()
        return newTab.bottom <= pins.top && pins.bottom <= rect.top && rect.bottom <= normal.top && !divider.querySelector('button') && !divider.hasAttribute('data-tab-id')
    }), true, 'the titled pinned section must sit below New Tab with a permanent divider above normal tabs')
    await page.click('.new-tab-button')
    await page.waitForSelector('.tabs-list > [data-tab-id="new-normal"]')
    assert.equal(await page.$('.sidebar-pinned-tabs [data-tab-id="new-normal"]'), null)
    await page.$eval('.space-tabs-sections', space => { space.scrollTop = 0 })
    await page.screenshot({ path: `${root}.cache/sidebar-pinned-tabs.png` })
    await page.$eval('.sidebar-pinned-tabs [data-tab-id="outside"]', el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 100 })))
    await (await page.waitForSelector('button ::-p-text(Unpin from Sidebar)')).click()
    assert.deepEqual(await page.evaluate(() => ({ ...window.data.menuActions.at(-1) })), { action: 'sidebar-pin', tabId: 'outside', pinned: false })
    await beginPinDrag('.sidebar-pinned-tabs [data-tab-id="outside"] .tab-item-main')
    await moveToPinTarget('.tabs-list > [data-tab-id="new-normal"]', true)
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1).type), 'reorder')
    await page.evaluate(() => window.flushSync(() => { window.data.docs.outside.sidebarPinned = null }))
    await page.waitForSelector('.tabs-list > [data-tab-id="outside"]')
    assert.ok(await page.$('.pinned-tabs-divider'), 'unpinning the last tab must retain the fixed divider')
    console.log('Chromium: drag into empty space/global pins, transfer space pins to global pins, drag out and Escape cancellation pass')
    console.log('Chromium: titled sidebar pins, fixed section ordering/divider, new-tab placement, context menu unpin and drag out pass')
})

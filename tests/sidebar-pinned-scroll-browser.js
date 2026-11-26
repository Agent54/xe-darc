import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-pinned-scroll', async ({ page }) => {
    const geometry = () => page.$eval('.space-tabs-sections', node => ({
        top: node.getBoundingClientRect().top,
        scroll: node.scrollTop,
        boundary: node.querySelector('.pinned-tabs-section').getBoundingClientRect().height,
        dividerBottom: node.querySelector('.pinned-tabs-divider').getBoundingClientRect().bottom,
        anchorTop: node.querySelector('.scrolling-pin-drop-anchor').getBoundingClientRect().top
    }))
    const wheel = deltaY => page.$eval('.space-tabs-sections', (node, deltaY) => {
        node.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
    }, deltaY)
    const expectMainOnly = async () => {
        await page.waitForFunction(() => {
            const node = document.querySelector('.space-tabs-sections')
            return Math.abs(node.scrollTop - node.querySelector('.pinned-tabs-section').getBoundingClientRect().height) < 1
        })
        const rect = await geometry()
        assert.equal(rect.dividerBottom, rect.top, 'the divider ends exactly outside the visible area')
        assert.equal(rect.anchorTop, rect.top, 'the empty pin target starts inside the visible area')
    }
    await expectMainOnly()
    // Even an empty, short list must have a reachable first-pin target at its limit.
    await page.$eval('.space-tabs-sections', node => { node.scrollTop = node.scrollHeight })
    await wheel(-10000)
    await expectMainOnly()
    const source = await page.$eval('[data-tab-id="outside"] .tab-item-main', node => {
        const r = node.getBoundingClientRect()
        return { x: r.left + 50, y: r.top + r.height / 2 }
    })
    await page.mouse.move(source.x, source.y)
    await page.mouse.down()
    await page.mouse.move(source.x + 10, source.y + 10)
    await page.waitForFunction(() => window.tabDrag.active)
    const target = await page.$eval('.scrolling-pin-drop-anchor', node => {
        const r = node.getBoundingClientRect()
        return { x: r.left + 50, y: r.top + 4 }
    })
    await page.mouse.move(target.x, target.y)
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(await page.evaluate(() => window.tabDrag.dropTarget?.pinScope), 'sidebar', JSON.stringify(await page.evaluate(() => ({
        drop: window.tabDrag.dropTarget,
        scroll: document.querySelector('.space-tabs-sections').scrollTop,
        anchor: document.querySelector('.scrolling-pin-drop-anchor').getBoundingClientRect().toJSON(),
        pointer: { x: window.tabDrag.mouseX, y: window.tabDrag.mouseY }
    }))))
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.pinDrops.at(-1)?.pinScope), 'sidebar')

    await page.evaluate(() => window.flushSync(() => {
        const data = window.data
        const pins = Array.from({ length: 4 }, (_, i) => ({ ...data.docs.outside, id: `sidebar-pin-${i}`, sidebarPinned: true, title: `Pinned ${i}` }))
        data.spaces.space.tabs.push(...pins)
        for (const tab of pins) data.docs[tab.id] = tab
        const pending = { ...data.docs['closed-one'], id: 'pending-one', archive: 'pending', wakeAt: Date.now() + 3600000 }
        data.docs[pending.id] = pending
        data.spaceMeta.pendingTabs = [pending]
    }))
    await expectMainOnly()
    await wheel(-100)
    await expectMainOnly()
    await wheel(-100)
    const stretch = await geometry()
    assert.ok(stretch.scroll < stretch.boundary && stretch.scroll > 0, 'pulling past activation shows spring resistance')
    await expectMainOnly()
    await wheel(-100)
    assert.equal((await geometry()).scroll, (await geometry()).boundary, 'separate small gestures must not accumulate')
    await wheel(-800)
    await page.waitForFunction(() => document.querySelector('.space-tabs-sections').scrollTop === 0)
    await page.hover('.pinned-tabs-divider')
    await page.waitForSelector('body > [role="tooltip"]')
    assert.equal(await page.$eval('body > [role="tooltip"]', node => node.textContent), 'Pinned and snoozed tabs')
    assert.equal(await page.$eval('.pinned-tabs-divider .tab-divider-line-only', node => getComputedStyle(node).backgroundColor), 'rgba(255, 255, 255, 0.1)')
    await page.screenshot({ path: `${root}.cache/sidebar-pinned-scroll-revealed.png` })
    await page.mouse.move(700, 500)
    await wheel(800)
    await expectMainOnly()
    await page.waitForSelector('body > [role="tooltip"]', { hidden: true })
    await page.screenshot({ path: `${root}.cache/sidebar-pinned-scroll-main.png` })

    await page.$eval('.tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    await page.$eval('.tab-group-content', node => { node.scrollTop = 60 })
    const innerPoint = await page.$eval('.tab-group-content', node => {
        const r = node.getBoundingClientRect()
        return { x: r.left + 40, y: r.top + 50, scroll: node.scrollTop }
    })
    await page.mouse.move(innerPoint.x, innerPoint.y)
    await page.mouse.wheel({ deltaY: -40 })
    await page.waitForFunction(before => document.querySelector('.tab-group-content').scrollTop < before, {}, innerPoint.scroll)
    await expectMainOnly()
    await page.setViewport({ width: 800, height: 360 })
    await expectMainOnly()
    await page.setViewport({ width: 800, height: 600 })

    // Keyboard/navigation reveals remain possible without passing the wheel gate.
    await page.evaluate(() => window.flushSync(() => { window.data.activate('sidebar-pin-0') }))
    await page.waitForFunction(() => {
        const row = document.querySelector('[data-tab-id="sidebar-pin-0"]').getBoundingClientRect()
        const bounds = document.querySelector('.space-tabs-sections').getBoundingClientRect()
        return row.top >= bounds.top && row.bottom <= bounds.bottom
    })
    console.log('Chromium: shared scroll tension, snap back, exact divider clipping, tooltip, empty pin drop and active-pin reveal pass')
})

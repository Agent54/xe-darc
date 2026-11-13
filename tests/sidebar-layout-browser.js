import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-layout', async ({ page }) => {
    assert.deepEqual(await page.$eval('.sidebar-window-drag', strip => {
        const rect = strip.getBoundingClientRect()
        const button = document.querySelector('.search-toggle-tab')
        const control = button.getBoundingClientRect()
        const header = document.querySelector('.sidebar-header')
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, region: getComputedStyle(strip).getPropertyValue('-webkit-app-region'), reachable: document.elementFromPoint(200, 4) === strip, sidebarTop: document.querySelector('.sidebar-box').getBoundingClientRect().top, controlsTop: control.top, controlsReachable: button.contains(document.elementFromPoint(control.left + control.width / 2, control.top + control.height / 2)), controlsRegion: getComputedStyle(button).getPropertyValue('-webkit-app-region'), headerRegion: getComputedStyle(header).getPropertyValue('-webkit-app-region'), headerReachable: header.contains(document.elementFromPoint(200, 24)) }
    }), { left: 0, top: 0, width: 263, height: 9, region: 'drag', reachable: true, sidebarTop: 9, controlsTop: 17, controlsReachable: true, controlsRegion: 'no-drag', headerRegion: 'drag', headerReachable: true }, 'the original sidebar layout must stay in place while existing header space remains draggable and controls stay reachable')
    await page.evaluate(() => window.flushSync(() => { window.data.ui.dragEnabled = false; window.data.ui.sidebarWidth = 320 }))
    assert.equal(await page.$eval('.sidebar-window-drag', strip => getComputedStyle(strip).getPropertyValue('-webkit-app-region')), 'no-drag')
    assert.equal(await page.$eval('.sidebar-header', header => getComputedStyle(header).getPropertyValue('-webkit-app-region')), 'no-drag')
    assert.equal(await page.$eval('.sidebar-window-drag', strip => strip.getBoundingClientRect().width), 320)
    await page.evaluate(() => window.flushSync(() => { window.data.ui.dragEnabled = true; window.data.ui.sidebarWidth = 263 }))
    console.log('Chromium: sidebar header layout, drag regions and controls pass')
})

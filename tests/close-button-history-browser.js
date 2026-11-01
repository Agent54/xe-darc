import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('close-button-history', async ({ page, errors }) => {
    const targets = [
        { row: '.tab-item-container[data-tab-id="outside"]', close: '.tab-close' },
        { row: '.closed-tab-item[data-tab-id="closed-two"]', close: '.closed-tab-remove' }
    ]
    for (const target of targets) {
        const prepare = async () => {
            await page.mouse.move(700, 100)
            await page.reload()
            await page.waitForSelector(target.row)
            if (target.close === '.closed-tab-remove') {
                await page.hover('.closed-tabs-header')
                await page.waitForFunction(() => {
                    const content = document.querySelector('.closed-tabs-content')
                    return content.classList.contains('expanded') && content.getAnimations().every(animation => animation.playState === 'finished')
                })
            }
        }
        await prepare()
        await page.hover(`${target.row} .tab-title`)
        await page.hover(`${target.row} ${target.close}`)
        await page.waitForSelector('.tab-hovercard-sidebar .history-section')
        assert.equal(await page.$eval('.tab-hovercard-sidebar .hovercard-title', el => el.textContent), target.close === '.tab-close' ? 'outside' : 'closed-two')

        await prepare()
        await page.hover(`${target.row} .tab-title`)
        await page.waitForSelector('.tab-hovercard-sidebar .hovercard-content')
        assert.equal(await page.$('.tab-hovercard-sidebar .history-section'), null, 'hovering a row alone keeps history collapsed')
        await page.hover(`${target.row} ${target.close}`)
        await new Promise(resolve => setTimeout(resolve, 100))
        await page.hover(`${target.row} .tab-title`)
        await new Promise(resolve => setTimeout(resolve, 350))
        assert.equal(await page.$('.tab-hovercard-sidebar .history-section'), null, 'leaving either close button cancels the reveal')
        await page.hover(`${target.row} ${target.close}`)
        await new Promise(resolve => setTimeout(resolve, 200))
        assert.equal(await page.$('.tab-hovercard-sidebar .history-section'), null, 'both warm close buttons wait 300 ms')
        await page.waitForSelector('.tab-hovercard-sidebar .history-section', { timeout: 500 })
        await page.hover(`${target.row} .tab-title`)
        assert.ok(await page.$('.tab-hovercard-sidebar .history-section'), 'revealed history stays open after leaving either close button')
    }
    assert.deepEqual(errors, [])
    console.log('Chromium: open and recently closed tab close buttons share initial history reveal, warm delay, cancellation and retention')
})

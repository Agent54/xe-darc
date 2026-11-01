import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('tab-creation', async ({ page, errors }) => {
    await new Promise(resolve => setTimeout(resolve, 300))
    const tabCount = () => page.evaluate(() => window.data.spaces.space.tabs.length)
    const initialCount = await tabCount()
    const point = selector => page.$eval(selector, el => {
        const rect = el.getBoundingClientRect()
        return { x: rect.left + rect.width / 3, y: rect.top + rect.height / 2 }
    })
    for (const [selector, itemType] of [['.new-tab-button', 'tab'], ['.add-spacer-preview', 'divider']]) {
        const source = await point(selector)
        await page.mouse.move(source.x, source.y)
        await page.mouse.down()
        assert.equal(await tabCount(), initialCount, 'pressing a creation control must wait for click or drop')
        await page.mouse.move(source.x + 8, source.y + 8)
        await page.waitForFunction(() => window.tabDrag.active && window.tabDrag.creating)
        const target = await page.$eval('.tabs-list > [data-tab-id="outside"]', el => {
            const rect = el.getBoundingClientRect()
            return { x: rect.left + rect.width / 2, y: rect.top + 2 }
        })
        await page.mouse.move(target.x, target.y, { steps: 8 })
        await page.waitForFunction(() => window.tabDrag.active && window.tabDrag.creating && window.tabDrag.indicator.visible)
        assert.equal(await tabCount(), initialCount, 'dragging must not create an item yet')
        await page.mouse.up()
        assert.deepEqual(await page.evaluate(() => {
            const drop = window.pinDrops.at(-1)
            return { type: drop.type, itemType: drop.itemType, afterTabId: drop.afterTabId, space: drop.targetSpaceId }
        }), { type: 'create', itemType, afterTabId: 'outside', space: 'space' })
        assert.equal(await tabCount(), initialCount, 'release must not also click the source control')
        await page.mouse.move(source.x, source.y)
        await page.mouse.down()
        await page.mouse.move(target.x, target.y, { steps: 8 })
        await page.keyboard.press('Escape')
        await page.mouse.up()
        assert.equal(await tabCount(), initialCount, 'cancelling must not create a tab')
    }
    assert.equal(await page.evaluate(() => window.pinDrops.length), 2)
    assert.equal(await page.evaluate(() => window.data.menuActions.length), 0, 'dragging and cancelling the spacer must not click it')
    await page.click('.add-spacer-preview')
    assert.equal(await page.evaluate(() => window.data.menuActions.filter(action => action.action === 'add-divider').length), 1)
    await page.focus('.add-spacer-preview')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    assert.equal(await page.evaluate(() => window.data.menuActions.filter(action => action.action === 'add-divider').length), 3)
    await page.click('.new-tab-button')
    assert.equal(await tabCount(), initialCount + 1)
    await page.focus('.new-tab-button')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    assert.equal(await tabCount(), initialCount + 3)
    assert.deepEqual(errors, [])
    console.log('Chromium: new-tab and spacer creation drags, deferred creation, cancellation, click suppression and keyboard creation pass')

    await page.hover('.tabs-list > [data-tab-id="outside"] .tab-item-main')
    const dragStart = await page.$eval('.tabs-list > [data-tab-id="outside"] .tab-item-main', button => {
        const rect = button.getBoundingClientRect()
        return { x: rect.left + 20, y: rect.top + rect.height / 2 }
    })
    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.mouse.move(dragStart.x + 10, dragStart.y + 10)
    await page.waitForFunction(() => window.tabDrag.active)
    await page.hover('.new-tab-more-button')
    assert.equal(await page.$eval('.new-tab-button', button => button.matches(':hover')), false, 'new-tab controls must not hover during tab dragging')
    assert.equal(await page.$eval('.new-tab-hover-menu', menu => getComputedStyle(menu).visibility), 'hidden')
    await page.$eval('.space-content', list => { list.scrollTop = 0 })
    await page.waitForSelector('.add-spacer-preview')
    await page.hover('.add-spacer-preview')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.add-spacer-preview-line')).opacity === '0')
    assert.equal(await page.$eval('.add-spacer-preview', button => button.matches(':hover')), false, 'divider insertion must not hover during tab dragging')
    await page.mouse.up()
    await page.waitForFunction(() => !window.tabDrag.active)
    await page.hover('.add-spacer-preview')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.add-spacer-preview-line')).opacity === '1')
})

import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-activation', async ({ page }) => {
    await page.evaluate(() => {
        window.activations = []
        const activate = window.data.activate
        window.data.activate = id => { window.activations.push(id); activate(id) }
        window.data.previous = () => window.activations.push('previous')
    })
    for (const [selector, tabId] of [
        ['.tab-group-main', 'group-two'],
        ['.tab-item-container[data-tab-id="outside"] .tab-item-main', 'outside']
    ]) {
        const reset = () => page.evaluate(() => window.flushSync(() => {
            window.data.spaceMeta.activeTabId = null
            window.activations = []
        }))
        await reset()
        const quickPress = await page.$eval(selector, button => {
            const rect = button.getBoundingClientRect()
            const options = { bubbles: true, button: 0, clientX: rect.left + 10, clientY: rect.top + 10 }
            button.dispatchEvent(new MouseEvent('mousedown', options))
            const beforeRelease = window.data.spaceMeta.activeTabId
            button.dispatchEvent(new MouseEvent('mouseup', options))
            const afterRelease = window.data.spaceMeta.activeTabId
            button.dispatchEvent(new MouseEvent('click', { ...options, detail: 1 }))
            return { beforeRelease, afterRelease, activations: [...window.activations] }
        })
        assert.deepEqual(quickPress, { beforeRelease: null, afterRelease: tabId, activations: [tabId] }, 'a quick mouseup activates synchronously, before click or the timer')
        await new Promise(resolve => setTimeout(resolve, 200))
        assert.deepEqual(await page.evaluate(() => window.activations), [tabId], 'the cancelled timer must not activate again')

        await reset()
        await page.hover(selector)
        await page.mouse.down()
        await page.waitForFunction(id => window.data.spaceMeta.activeTabId === id, {}, tabId)
        await page.mouse.up()
        assert.deepEqual(await page.evaluate(() => window.activations), [tabId], 'a held press activates once before release')

        for (const cancel of ['drag', 'escape']) {
            await reset()
            await page.$eval(selector, (button, cancel) => {
                const rect = button.getBoundingClientRect()
                const options = { bubbles: true, button: 0, clientX: rect.left + 10, clientY: rect.top + 10 }
                button.dispatchEvent(new MouseEvent('mousedown', options))
                if (cancel === 'drag') window.dispatchEvent(new MouseEvent('mousemove', { ...options, clientX: rect.left + 30 }))
                else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
                button.dispatchEvent(new MouseEvent('mouseup', options))
                button.dispatchEvent(new MouseEvent('click', { ...options, detail: 1 }))
            }, cancel)
            await new Promise(resolve => setTimeout(resolve, 200))
            assert.deepEqual(await page.evaluate(() => window.activations), [], `${cancel} cancels both release and delayed activation`)
        }

        await reset()
        const backgroundTab = tabId === 'outside' ? 'group-two' : 'outside'
        const dropsBefore = await page.evaluate(() => window.pinDrops.length)
        await page.$eval(selector, (button, backgroundTab) => {
            window.data.spaceMeta.activeTabId = backgroundTab
            const rect = button.getBoundingClientRect()
            const target = document.querySelector(backgroundTab === 'outside'
                ? '.tab-item-container[data-tab-id="outside"]' : '.tab-group-main').getBoundingClientRect()
            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: rect.left + 10, clientY: rect.top + 10 }))
            window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: target.left + 10, clientY: target.bottom - 1 }))
        }, backgroundTab)
        assert.equal(await page.evaluate(() => window.tabDrag.active), true, 'moving starts a real tab/group drag')
        await new Promise(resolve => setTimeout(resolve, 200))
        assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), backgroundTab, 'the original tab stays active beyond the activation delay while dragging')
        await page.$eval(selector, button => {
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
            button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }))
        })
        assert.equal(await page.evaluate(() => window.pinDrops.length), dropsBefore + 1, 'the background drag still completes its drop')
        assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), backgroundTab, 'dropping keeps the original tab active')
        assert.deepEqual(await page.evaluate(() => window.activations), [], 'neither the timer, mouseup nor trailing click activates a dragged tab/group')

        await reset()
        await page.focus(selector)
        await page.keyboard.press('Enter')
        assert.deepEqual(await page.evaluate(() => window.activations), [tabId], 'keyboard activation remains available')
    }
    await page.evaluate(() => {
        window.data.spaceMeta.activeTabId = null
        window.activations = []
        const group = document.querySelector('.tab-group-main')
        const tab = document.querySelector('.tab-item-container[data-tab-id="outside"] .tab-item-main')
        group.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
        tab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
    })
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.deepEqual(await page.evaluate(() => window.activations), ['outside'], 'a new press must not revive an Escape-cancelled timer')
    console.log('Chromium: tabs and groups activate by mouseup, held presses activate once, dragging/Escape cancel, and keyboard activation works')
})

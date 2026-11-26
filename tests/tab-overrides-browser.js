import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('tab-overrides', async ({ page, server }) => {
    await page.$eval('.tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    for (const tabId of ['outside', 'group-two']) {
        const row = `.tab-item-container[data-tab-id="${tabId}"]`
        const openMenu = async () => {
            await page.$eval(row, element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 100 })))
        }
        await openMenu()
        await (await page.waitForSelector('.context-menu button ::-p-text(Rename…)')).click()
        await page.waitForFunction(() => document.activeElement?.id === 'tab-group-name')
        await page.type('#tab-group-name', `Custom ${tabId}`)
        await page.keyboard.press('Enter')
        await page.waitForSelector('.context-menu', { hidden: true })
        assert.equal(await page.$eval(`${row} .tab-title`, el => el.textContent), `Custom ${tabId}`)
        await openMenu()
        await (await page.waitForSelector('.context-menu button ::-p-text(Change icon…)')).click()
        await page.waitForSelector('.emoji-grid')
        await page.click('.emoji-grid button[aria-label="Science experiments"]')
        await page.waitForSelector('.context-menu', { hidden: true })
        assert.equal(await page.$eval(`${row} .favicon-emoji`, el => el.textContent), '🧪')
        assert.equal(await page.evaluate(() => window.data.docs['group-missing'].emojiOverride), undefined, 'member edits must not change sibling tabs')
        await openMenu()
        await (await page.waitForSelector('.context-menu button ::-p-text(Change icon…)')).click()
        await page.type('#tab-icon-url', `http://127.0.0.1:${server.addr.port}/custom.svg`)
        await page.$eval('#tab-icon-url', input => input.form.requestSubmit())
        await page.waitForSelector('.context-menu', { hidden: true })
        await page.waitForFunction(selector => document.querySelector(selector)?.src.endsWith('/custom.svg'), {}, `${row} .favicon`)
        await openMenu()
        await (await page.waitForSelector('.context-menu button ::-p-text(Change icon…)')).click()
        await page.click('.reset-emoji')
        await page.waitForSelector('.context-menu', { hidden: true })
        assert.equal(await page.$(`${row} .favicon-emoji`), null)
        await openMenu()
        await (await page.waitForSelector('.context-menu button ::-p-text(Rename…)')).click()
        await (await page.waitForSelector('.context-menu button ::-p-text(Use page title)')).click()
        await page.waitForSelector('.context-menu', { hidden: true })
        assert.equal(await page.$eval(`${row} .tab-title`, el => el.textContent), tabId)
    }
    await page.$eval('.tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    console.log('Chromium: standalone and grouped tab title, emoji, image URL overrides and resets pass')
})

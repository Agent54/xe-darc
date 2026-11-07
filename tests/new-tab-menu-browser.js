import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('new-tab-menu', async ({ page, errors }) => {
    await page.evaluate(() => {
        window.clipboardText = '  localhost:3000/path  '
        window.clipboardReads = 0
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            async readText() {
                window.clipboardReads++
                if (window.clipboardDenied) throw new DOMException('Denied', 'NotAllowedError')
                return window.clipboardText
            }
        } })
    })
    const menu = '.new-tab-hover-menu.visible'
    const action = `${menu} > button`
    const open = async text => {
        await page.evaluate(value => { window.clipboardText = value }, text)
        await page.click('.new-tab-button', { button: 'right' })
        await page.waitForFunction(selector => {
            const button = document.querySelector(selector)
            return button && !button.disabled
        }, {}, action)
    }

    assert.equal(await page.evaluate(() => window.clipboardReads), 0, 'closed menus do not read the clipboard')
    await open('  localhost:3000/path  ')
    assert.equal(await page.$eval(action, el => el.textContent.trim()), 'New tab from "localhost:3000/path"')
    assert.equal(await page.evaluate(() => window.newTabRequests.length), 0, 'right-click does not create a tab')
    await page.evaluate(() => { window.clipboardText = 'different clipboard contents' })
    await page.click(action)
    assert.equal(await page.evaluate(() => window.newTabRequests.at(-1).options.url), 'http://localhost:3000/path')
    assert.equal(await page.$(menu), null, 'selection closes the menu')

    await page.evaluate(() => localStorage.setItem('defaultSearchEngine', 'kagi'))
    await open('hello world')
    assert.equal(await page.$eval(action, el => el.textContent.trim()), 'Search for "hello world"')
    await page.focus(action)
    await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => window.newTabRequests.at(-1).options.url), 'https://kagi.com/search?q=hello+world')

    await page.evaluate(() => {
        localStorage.setItem('defaultSearchEngine', 'custom')
        localStorage.setItem('customSearchUrl', 'https://search.example/?term=')
    })
    await open('some text & more')
    await page.click(action)
    assert.equal(await page.evaluate(() => window.newTabRequests.at(-1).options.url), 'https://search.example/?term=some%20text%20%26%20more')

    await open('https://example.com')
    await page.keyboard.press('Escape')
    assert.equal(await page.$(menu), null, 'Escape dismisses the context menu')
    await page.evaluate(() => { window.clipboardText = 'www.example.org' })
    await page.hover('.new-tab-more-button')
    await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('www.example.org'), {}, action)
    await page.click(action)
    assert.equal(await page.evaluate(() => window.newTabRequests.at(-1).options.url), 'http://www.example.org/')

    const longText = 'A long clipboard query with multiple words '.repeat(30)
    await open(longText)
    const layout = await page.$eval(menu, el => {
        const rect = el.getBoundingClientRect()
        const label = el.querySelector('.clipboard-label')
        return { left: rect.left, right: rect.right, viewport: innerWidth, truncated: label.scrollWidth > label.clientWidth }
    })
    assert.ok(layout.left >= 0 && layout.right <= layout.viewport, 'long clipboard contents keep the sidebar menu on screen')
    assert.equal(layout.truncated, true, 'long clipboard previews truncate')
    await page.keyboard.press('Escape')

    await open('https://example.com')
    await page.evaluate(() => { window.clipboardText = 'https://refreshed.example' })
    await page.click('.new-tab-button', { button: 'right' })
    await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('refreshed.example'), {}, action)
    await page.hover(`${menu} .has-submenu`)
    await page.click(`${menu} .new-tab-menu-submenu button`)
    assert.equal(await page.evaluate(() => window.data.docs[window.data.spaceMeta.activeTabId].partition), 'persist:1')

    for (const denied of [false, true]) {
        await page.evaluate(value => { window.clipboardText = ' \n '; window.clipboardDenied = value }, denied)
        await page.click('.new-tab-button', { button: 'right' })
        await page.waitForFunction((selector, label) => document.querySelector(selector)?.textContent.trim() === label,
            {}, action, denied ? 'Clipboard unavailable' : 'Clipboard is empty')
        assert.equal(await page.$eval(action, el => el.disabled), true)
        await page.keyboard.press('Escape')
    }
    assert.deepEqual(errors, [])
    console.log('Chromium: clipboard preview, URL/search navigation, snapshot selection, keyboard, hover refresh and unavailable clipboard pass')
}, `
    window.newTabRequests = []
    const createMenuTab = data.newTab
    data.newTab = async (spaceId, options) => {
        window.newTabRequests.push({ spaceId, options })
        return createMenuTab(spaceId, options)
    }
`)

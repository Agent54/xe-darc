import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-visibility', async ({ page }) => {
    const inbox = 'darc:space_inbox'
    const visible = selector => page.$eval(selector, element => getComputedStyle(element).visibility === 'visible')
    assert.equal(await visible('.spaces-list-wrapper'), false)
    assert.equal(await visible('.space-title'), false)
    await page.hover('.spaces-container')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.new-space-button')).opacity === '1')
    assert.equal(await page.$eval('.spaces-container', element => element.getBoundingClientRect().height > 0), true)

    await page.evaluate(inbox => window.flushSync(() => {
        window.data.spaces[inbox] = { _id: inbox, name: 'Inbox', tabs: [], pinnedTabs: [], activeTabsOrder: [] }
        window.data.spaceMeta.spaceOrder.unshift(inbox)
    }), inbox)
    assert.equal(await page.$(`.space-content[data-space-id="${inbox}"]`), null, 'empty Inbox must not occupy a lane')
    await page.evaluate(inbox => window.flushSync(() => {
        const tab = { id: 'inbox-new', type: 'tab', spaceId: inbox, url: 'about:newtab', title: 'New Tab' }
        window.data.docs[tab.id] = tab
        window.data.spaces[inbox].tabs.push(tab)
    }), inbox)
    assert.equal(await page.$(`.space-item[data-space-id="${inbox}"]`), null, 'a placeholder New Tab must not reveal Inbox')
    await page.evaluate(() => window.flushSync(() => { window.data.docs['inbox-new'].url = 'https://example.com/inbox' }))
    await page.waitForSelector(`.space-item[data-space-id="${inbox}"]`)
    assert.equal(await visible('.spaces-list-wrapper'), true)
    assert.equal(await visible('.space-title'), true)

    await page.evaluate(() => {
        window.contextEvents = []
        document.addEventListener('contextmenu', event => {
            setTimeout(() => window.contextEvents.push({ prevented: event.defaultPrevented, target: event.target.className }), 0)
        }, true)
    })
    for (const selector of [`.space-item[data-space-id="${inbox}"]`, '.space-title']) {
        const eventCount = await page.evaluate(() => window.contextEvents.length)
        await page.click(selector, { button: 'right' })
        await page.waitForFunction(count => window.contextEvents.length > count, {}, eventCount)
        const contextEvent = await page.evaluate(() => window.contextEvents.at(-1))
        assert.equal(contextEvent.prevented, true, `right-click on ${contextEvent.target} must suppress the native menu even when an overlay appears during the press`)
        await page.keyboard.press('Escape')
    }
    const beforeBackground = await page.evaluate(() => window.data.menuActions.filter(action => action.action === 'sidebar-context').length)
    assert.equal(beforeBackground, 0, 'space menus must not bubble to the sidebar appearance menu')
    assert.equal(await page.$eval('.sidebar-content', element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 400 }))), false)
    assert.equal(await page.evaluate(() => window.data.menuActions.at(-1).action), 'sidebar-context')

    for (const [selector, scope, tabId] of [
        ['.tabs-list > [data-tab-id="outside"]', 'tab', 'outside'],
        ['.tab-group', 'group', 'group-missing']
    ]) {
        await page.$eval(selector, element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 200 })))
        await page.hover('.move-space-menu')
        const newSpace = await page.waitForSelector('.move-space-submenu button ::-p-text(New Space)')
        await newSpace.evaluate(element => element.closest('button').focus())
        await page.keyboard.press('Enter')
        await page.waitForSelector('.context-menu', { hidden: true })
        assert.deepEqual(await page.evaluate(() => window.data.menuActions.filter(action => ['new-space', 'move'].includes(action.action)).slice(-2).map(action => ({ ...action }))), [
            { action: 'new-space', createTab: false },
            { action: 'move', tabId, targetSpaceId: 'created-space', scope, placement: 'start', preservePins: true }
        ])
        assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), tabId)
    }

    await page.evaluate(() => window.flushSync(() => {
        window.data.docs['inbox-new'].url = 'about:blank'
        window.data.spaceMeta.spaceOrder = ['darc:space_inbox']
    }))
    assert.equal(await page.$('.space-content'), null)
    await page.hover('.spaces-container')
    await page.click('.new-space-button')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.new-space-menu-dropdown.open')).opacity === '1')
    await page.click('.new-space-menu-dropdown.open .new-space-menu-item')
    assert.equal(await page.evaluate(() => window.data.menuActions.at(-1).action), 'new-space', 'the first user space must remain creatable with an empty Inbox')

    await page.addStyleTag({ content: Deno.readTextFileSync(`${root}app/app.css`) })
    await page.evaluate(() => {
        const toolbar = document.createElement('div')
        toolbar.className = 'sidebar-right'
        toolbar.innerHTML = '<button class="sidebar-button"><svg></svg></button>'
        document.body.append(toolbar)
    })
    await page.mouse.move(400, 300)
    assert.deepEqual(await page.$eval('.sidebar-right', element => ({ x: new DOMMatrix(getComputedStyle(element).transform).m41, opacity: getComputedStyle(element.querySelector('svg')).opacity })), { x: 0, opacity: '1' }, 'right toolbar must be fully visible by default')
    await page.$eval('.sidebar-right', element => element.classList.add('autohide'))
    await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.sidebar-right')).transform).m41 === 30)
    await page.$eval('.sidebar-right', element => element.classList.add('menu-open'))
    await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.sidebar-right')).transform).m41 === 0)
    console.log('Chromium: empty Inbox, single-space controls, native menu suppression, sidebar background menu, move to new space, and opt-in toolbar autohide pass')
}, `
    data.newSpace = async (options = {}) => {
        data.menuActions.push({ action: 'new-space', ...options })
        return { _id: 'created-space' }
    }
    data.moveTab = async (tabId, options) => data.menuActions.push({ action: 'move', tabId, ...options })
`)

import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'
import { sidebarMenuCloseDelay, sidebarMenuHoldDelay } from '../app/lib/sidebar-menu-timing.js'

await withSidebarFixture('archived-tabs-menu', async ({ page }) => {
    await page.setViewport({ width: 1000, height: 850 })
    const closed = '.closed-tabs-section:not(.pending-tabs-section)'
    const pending = '.pending-tabs-section'
    const expanded = selector => page.$eval(`${selector} .closed-tabs-content`, menu => menu.classList.contains('expanded'))
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

    for (const selector of [closed, pending]) {
        const header = `${selector} .closed-tabs-title`
        const arrow = `${selector} .archived-menu-arrow`
        await page.hover(header)
        await pause(sidebarMenuCloseDelay + 50)
        assert.equal(await expanded(selector), false, 'hovering the title must not open the menu')
        await page.mouse.down()
        assert.equal(await expanded(selector), true, 'the main trigger opens on mousedown')
        await page.mouse.up()
        assert.equal(await expanded(selector), true, 'a short press leaves the menu open')
        await page.keyboard.press('Escape')
        assert.equal(await expanded(selector), false)

        await page.hover(arrow)
        assert.equal(await expanded(selector), true, 'only the arrow opens on hover')
        await page.mouse.move(700, 500)
        await pause(100)
        assert.equal(await expanded(selector), true, 'leaving uses the sidebar close delay')
        await page.hover(header)
        await pause(sidebarMenuCloseDelay + 50)
        assert.equal(await expanded(selector), true, 're-entering cancels pending closure without needing the arrow')
        await page.mouse.move(700, 500)
        await page.waitForFunction(selector => !document.querySelector(`${selector} .closed-tabs-content`).classList.contains('expanded'), {}, selector)

        await page.hover(header)
        await page.mouse.down()
        await pause(sidebarMenuHoldDelay + 40)
        await page.mouse.up()
        assert.equal(await expanded(selector), false, 'a long press without selection dismisses')
        await page.mouse.down()
        await page.keyboard.press('Escape')
        await page.mouse.up()
        assert.equal(await expanded(selector), false, 'Escape cancels the press and trailing click')

        await page.focus(`${selector} .closed-tabs-header`)
        await page.keyboard.press('Enter')
        assert.equal(await expanded(selector), true, 'keyboard opening is preserved')
        await page.mouse.move(700, 500)
        await page.mouse.down()
        assert.equal(await expanded(selector), false, 'outside mousedown dismisses')
        await page.mouse.up()
    }

    await page.hover(`${closed} .archived-menu-arrow`)
    assert.deepEqual(await page.$$eval(`${closed} .archived-space-section`, sections => sections.map(section => section.getAttribute('aria-label'))), ['Closed in this space', 'Closed in other spaces'])
    assert.equal(await page.$$eval('[aria-label="Closed in this space"] .tab-space', labels => labels.length), 0)
    assert.equal(await page.$eval('[aria-label="Closed in other spaces"] .tab-space', label => label.textContent), 'Other')
    assert.equal(await page.$$eval(`${closed} .closed-tab-row`, rows => new Set(rows.map(row => row.dataset.archivedId)).size === rows.length), true, 'sections contain no duplicates')
    await page.waitForFunction(selector => getComputedStyle(document.querySelector(`${selector} .closed-tabs-content`)).opacity === '1' && getComputedStyle(document.querySelector('.pending-tabs-content')).opacity === '0', {}, closed)
    await page.screenshot({ path: `${root}.cache/archived-menu-closed.png` })

    for (const selector of [closed, pending]) {
        await page.hover(`${selector} .archived-menu-arrow`)
        const row = `${selector} .closed-tab-row:first-of-type`
        const before = await page.$eval(row, row => ({
            main: row.querySelector('.closed-tab-item').getBoundingClientRect().width,
            actions: row.querySelector('.archived-row-actions').getBoundingClientRect().width
        }))
        assert.equal(before.actions, 0, 'hidden action buttons reserve no space')
        await page.hover(row)
        const after = await page.$eval(row, row => ({
            main: row.querySelector('.closed-tab-item').getBoundingClientRect().width,
            actions: row.querySelector('.archived-row-actions').getBoundingClientRect().width,
            gap: row.getBoundingClientRect().right - row.querySelector('.archived-row-actions').getBoundingClientRect().right
        }))
        assert.ok(after.actions > 0 && after.main < before.main, 'revealing actions moves the title fade left')
        assert.ok(after.gap <= 5, 'actions sit at the right edge inside the row padding and border')
        assert.equal(await page.$eval(`${selector} .closed-tabs-list`, list => getComputedStyle(list).paddingLeft), '4px')
        const count = await page.$$eval(`${selector} .closed-tab-row`, rows => rows.length)
        await page.click(`${row} .closed-tab-remove`)
        await pause(sidebarMenuCloseDelay + 100)
        assert.equal(await expanded(selector), true, 'removing an item does not close the menu')
        assert.equal(await page.$$eval(`${selector} .closed-tab-row`, rows => rows.length), count - 1)
        await page.evaluate(() => window.dispatchEvent(new Event('darc-dismiss-hovercards')))
        await page.keyboard.press('Escape')
    }

    await page.hover(`${pending} .archived-menu-arrow`)
    assert.equal(await page.$eval(pending, section => {
        const header = section.querySelector('.closed-tabs-header').getBoundingClientRect()
        const menu = section.querySelector('.closed-tabs-content').getBoundingClientRect()
        return Math.abs(menu.top - (header.bottom - 6)) < 1
    }), true, 'the pending menu overlaps its trigger by six pixels')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.pending-tabs-content')).opacity === '1')
    await page.screenshot({ path: `${root}.cache/archived-menu-pending.png` })
    await page.keyboard.press('Escape')

    for (const selector of [closed, pending]) {
        await page.hover(`${selector} .closed-tabs-title`)
        await page.mouse.down()
        const row = `${selector} .closed-tab-item`
        const id = await page.$eval(row, button => button.dataset.tabId)
        await page.hover(row)
        await page.mouse.up()
        assert.equal(await expanded(selector), false, 'press-drag-release selects and dismisses')
        assert.equal(await page.evaluate(id => window.data.archiveActions.filter(action => action === id).length, id), 1, 'selection runs exactly once')
    }

    await page.hover(`${pending} .archived-menu-arrow`)
    await page.hover(`${pending} .closed-tab-row`)
    await page.click(`${pending} .closed-tab-remove`)
    await pause(sidebarMenuCloseDelay + 100)
    assert.equal(await expanded(pending), true, 'closing the last pending tab keeps the empty menu open')
    assert.equal(await page.$$eval(`${pending} .closed-tab-row`, rows => rows.length), 0)
    await page.keyboard.press('Escape')

    await page.hover(`${closed} .archived-menu-arrow`)
    const beforeClear = await page.evaluate(() => window.data.spaceMeta.closedTabs.length)
    await page.hover(`${closed} .archived-clear-all`)
    await page.mouse.down()
    await page.keyboard.press('Escape')
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.data.spaceMeta.closedTabs.length), beforeClear, 'Escape cancels a pressed clear action')
    await page.focus(`${closed} .closed-tabs-header`)
    await page.keyboard.press('Enter')
    await page.focus(`${closed} .archived-clear-all`)
    await page.keyboard.press('Enter')
    await pause(sidebarMenuCloseDelay + 100)
    assert.equal(await expanded(closed), true, 'clearing by keyboard retains the empty menu and focus')
    assert.equal(await page.evaluate(() => window.data.spaceMeta.closedTabs.length), 0)
    await page.keyboard.press('Escape')

    await page.evaluate(() => {
        window.data.refreshClosedTabs = async () => {
            await new Promise(resolve => { window.finishHistoryLoad = resolve })
            const tab = { ...window.data.docs['closed-two'], id: 'loaded-late', spaceId: 'other' }
            window.data.docs[tab.id] = tab
            window.data.spaceMeta.closedTabs.push(tab)
        }
    })
    await page.click(`${closed} .closed-tabs-title`)
    await page.waitForSelector(`${closed} [role="status"]`)
    await page.evaluate(() => window.finishHistoryLoad())
    await page.waitForSelector(`${closed} .closed-tab-item[data-tab-id="loaded-late"]`)
    await page.waitForSelector(`${closed} [role="status"]`, { hidden: true })
    await page.keyboard.press('Escape')
    await page.evaluate(() => { window.data.refreshClosedTabs = async () => { throw new Error('Storage unavailable') } })
    await page.click(`${closed} .closed-tabs-title`)
    await page.waitForSelector(`${closed} [role="alert"]`)
    assert.match(await page.$eval(`${closed} [role="alert"]`, element => element.textContent), /Storage unavailable/)
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.flushSync(() => {
        window.data.spaceMeta.closedTabs = []
        window.data.refreshClosedTabs = async () => {}
    }))
    await page.click(`${closed} .closed-tabs-title`)
    assert.equal(await expanded(closed), true, 'empty history remains accessible for a global refresh')
    console.log('Chromium: shared archived-menu triggers, gestures, retention, scope sections, action spacing and loading/error states pass')
}, `
    data.spaces.other = { name: 'Other', tabs: [], pinnedTabs: [], activeTabsOrder: [] }
    const archived = (id, spaceId, archive) => ({ id, title: id, spaceId, archive, type: 'tab', url: 'https://example.com', pending: archive === 'deferred' ? { reason: 'external', wakeAt: null } : null })
    data.spaceMeta.closedTabs.push(archived('other-closed', 'other', 'closed'))
    data.spaceMeta.pendingTabs = ['waiting-one', 'waiting-two', 'waiting-three'].map(id => archived(id, 'space', 'deferred'))
    for (const tab of [...data.spaceMeta.closedTabs, ...data.spaceMeta.pendingTabs]) data.docs[tab.id] = tab
    data.archiveActions = []
    data.restoreClosedTab = id => { data.archiveActions.push(id); data.removeClosedTab(id) }
    data.resumePendingTab = async id => { data.archiveActions.push(id); data.docs[id].archive = null; data.spaceMeta.pendingTabs = data.spaceMeta.pendingTabs.filter(tab => tab.id !== id) }
    data.closeTab = (spaceId, id) => { data.docs[id].archive = 'closed'; data.spaceMeta.pendingTabs = data.spaceMeta.pendingTabs.filter(tab => tab.id !== id) }
`)

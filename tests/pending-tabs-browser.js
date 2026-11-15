import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('pending-tabs', async ({ page }) => {
    async function clickMenu(label) {
        await page.waitForSelector('.context-menu')
        for (const button of await page.$$('.context-menu button')) {
            if (await button.evaluate(button => button.textContent.trim()) === label) { await button.click(); return }
        }
        throw new Error(`Missing menu action ${label}`)
    }
    await page.setViewport({ width: 1280, height: 900 })
    await page.waitForSelector('.pending-tabs-section')
    assert.equal(await page.$eval('.pending-tabs-section', section => {
        const scroll = section.closest('.space-tabs-sections')
        return !!scroll && section.nextElementSibling?.matches('.sidebar-pinned-tabs')
    }), true, 'Pending precedes the pins inside the scrolling area')
    await page.$eval('.space-tabs-sections', space => { space.scrollTop = 0 })
    await page.hover('.pending-tabs-section .closed-tabs-header')
    await page.waitForFunction(() => document.querySelector('.pending-tabs-content').classList.contains('expanded'))
    assert.equal(await page.$$eval('.pending-tabs-content .closed-tab-row', rows => rows.length), 2)
    assert.equal(await page.$('.pending-tabs-content [aria-expanded]'), null, 'pending groups cannot expand')
    const groupRow = '.pending-tab-row[data-tab-id="pending-one"]'
    const countdown = `${groupRow} .pending-tab-time`
    assert.equal(await page.$eval('.pending-tabs-content', menu => getComputedStyle(menu).transform), 'none')
    assert.equal(await page.$eval(countdown, time => time.parentElement.nextElementSibling.matches('.closed-tab-remove')), true)
    const initialRemaining = await page.$eval(countdown, el => el.textContent)
    await page.waitForFunction((selector, initial) => document.querySelector(selector).textContent !== initial, {}, countdown, initialRemaining)
    await page.hover(countdown)
    await page.waitForSelector('body > [role="tooltip"]')
    assert.match(await page.$eval('body > [role="tooltip"]', el => el.textContent), /^Wake at \d{1,2}\.\d{1,2}\.\d{4}, \d{2}:\d{2}$/)
    await page.click(`${groupRow} .closed-tab-item`, { button: 'right' })
    await page.waitForSelector('.pending-context-menu')
    assert.equal(await page.$eval('.pending-context-menu', menu => getComputedStyle(menu).animationName), 'none')
    assert.match(await page.$eval('.pending-context-menu', menu => menu.textContent), /Unsnooze group/)
    await clickMenu('Change snooze…')
    await page.waitForSelector('.context-submenu[aria-label="Change snooze…"]')
    assert.ok(await page.$('.pending-context-menu > button'), 'snooze opens beside the existing menu')
    assert.equal(await page.$('.group-editor-back'), null, 'snooze presets do not replace the menu with an editor')
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '1 hour')
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), '4 hours')
    await page.keyboard.press('Escape')
    assert.equal(await page.$('.context-submenu'), null)
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Change snooze…')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForSelector('.pending-context-menu', { hidden: true })
    assert.deepEqual(await page.evaluate(() => [...window.data.rescheduled]), ['pending-one', 'pending-two'])
    assert.match(await page.$eval(countdown, el => el.textContent), /^(4h|3h 59m)$/)
    await page.hover('.pending-tabs-content .closed-tab-item[data-tab-id="pending-one"]')
    await page.waitForSelector('.tab-hovercard-sidebar.group-hovercards')
    assert.equal(await page.$$eval('.tab-hovercard-sidebar .hovercard-content', cards => cards.length), 2)
    await page.screenshot({ path: `${root}.cache/pending-tabs-desktop.png` })
    await page.click(`${groupRow} .pending-tab-resume`)
    await page.waitForFunction(() => window.data.resumed?.length === 2)
    assert.deepEqual(await page.evaluate(() => [...window.data.resumed]), ['pending-one', 'pending-two'])
    const waitingRow = '.pending-tab-row[data-tab-id="waiting"] .closed-tab-item'
    await page.focus(waitingRow)
    await page.keyboard.down('Shift')
    await page.keyboard.press('F10')
    await page.keyboard.up('Shift')
    await page.waitForSelector('.pending-context-menu')
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Resume tab')
    await page.keyboard.press('Escape')
    await page.waitForSelector('.pending-context-menu', { hidden: true })
    assert.equal(await page.$eval(waitingRow, row => document.activeElement === row), true)
    await page.hover('.closed-tabs-section:not(.pending-tabs-section) .closed-tabs-header')
    await page.waitForFunction(() => document.querySelector('.closed-tabs-section:not(.pending-tabs-section) .closed-tabs-content').classList.contains('expanded'))
    assert.equal(await page.$$eval('.closed-tabs-section:not(.pending-tabs-section) .closed-tab-row', rows => rows.length), 4)
    await page.hover('.closed-tab-item[data-tab-id="closed-group-one"]')
    await page.waitForSelector('.tab-hovercard-sidebar.group-hovercards')
    assert.equal(await page.$('.closed-tabs-content .tab-group-toggle'), null)
    await page.click('.closed-tab-item[data-tab-id="closed-group-one"]')
    await page.waitForFunction(() => window.data.restored?.length === 2)

    await page.click('.tab-item-container[data-tab-id="outside"]', { button: 'right' })
    await page.$eval('.context-menu', menu => Promise.all(menu.getAnimations().map(animation => animation.finished)))
    await page.hover('.context-menu [aria-haspopup="menu"]')
    await page.waitForSelector('.context-submenu[aria-label="Snooze…"]')
    await page.screenshot({ path: `${root}.cache/tab-snooze-menu.png` })
    assert.equal(await page.$eval('.context-submenu[aria-label="Snooze…"]', submenu => {
        const rect = submenu.getBoundingClientRect()
        const parent = submenu.closest('.context-menu').getBoundingClientRect()
        return rect.left >= parent.right - 8 && rect.top >= 8 && rect.bottom <= innerHeight - 8
    }), true, 'hover opens a side submenu within the viewport')
    assert.equal(await page.$$eval('.context-submenu[aria-label="Snooze…"] button', buttons => buttons.every(button => button.querySelector('.context-menu-icon svg'))), true)
    await clickMenu('Snooze…')
    assert.match(await page.$eval('.context-menu', menu => menu.textContent), /1 hour.*4 hours.*Tomorrow morning.*Next week.*Custom/s)
    await clickMenu('Custom…')
    await page.select('#snooze-mode', 'absolute')
    await page.type('#snooze-date', '31.2.2099')
    await page.type('#snooze-clock', '09:30')
    await page.click('.snooze-form button[type="submit"]')
    await page.waitForSelector('.snooze-error')
    await page.$eval('#snooze-date', input => { input.value = '10.11.2099'; input.dispatchEvent(new Event('input', { bubbles: true })) })
    await page.click('.snooze-form button[type="submit"]')
    await page.waitForFunction(() => window.data.snoozes.length === 1)
    await page.waitForSelector('.context-menu', { hidden: true })
    assert.equal(await page.evaluate(() => window.data.snoozes[0].wakeAt), new Date(2099, 10, 10, 9, 30).getTime())
    await page.click('.tab-item-container[data-tab-id="outside"]', { button: 'right' })
    await clickMenu('Snooze…')
    await clickMenu('Custom…')
    await page.select('#snooze-mode', 'relative')
    await page.$eval('#snooze-amount', input => { input.value = '4'; input.dispatchEvent(new Event('input', { bubbles: true })) })
    await page.select('[aria-label="Duration unit"]', 'hours')
    const before = Date.now()
    await page.click('.snooze-form button[type="submit"]')
    await page.waitForFunction(() => window.data.snoozes.length === 2)
    await page.waitForSelector('.context-menu', { hidden: true })
    assert.ok(await page.evaluate(before => Math.abs(window.data.snoozes[1].wakeAt - before - 14400000) < 5000, before))
    await page.click('.tab-group-wrapper .tab-group', { button: 'right' })
    await clickMenu('Snooze…')
    await clickMenu('1 hour')
    await page.waitForFunction(() => window.data.snoozes.length === 3)
    await page.waitForSelector('.context-menu', { hidden: true })
    assert.equal(await page.evaluate(() => window.data.snoozes[2].scope), 'group')
    await page.mouse.move(700, 500)
    await page.waitForSelector('.tab-hovercard-sidebar', { hidden: true })
    await page.evaluate(() => window.flushSync(() => { window.data.docs.outside.resumedAt = Date.now(); window.data.docs.outside.resumedReason = 'snooze' }))
    await page.hover('.tab-item-container[data-tab-id="outside"] .favicon-resumed')
    await page.waitForSelector('body > [role="tooltip"]')
    assert.match(await page.$eval('body > [role="tooltip"]', tooltip => tooltip.textContent), /Returned from snooze on/)
    await page.mouse.move(700, 500)
    await page.waitForSelector('body > [role="tooltip"]', { hidden: true })
    await page.setViewport({ width: 320, height: 600 })
    await page.hover('.pending-tabs-section .closed-tabs-header')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.pending-tabs-content')).opacity === '1')
    await page.screenshot({ path: `${root}.cache/pending-tabs-mobile.png` })
    assert.equal(await page.$eval('.pending-tabs-section', el => el.getBoundingClientRect().right <= innerWidth), true)
    console.log('Chromium: Pending placement, whole-group hovercards/restoration, snooze presets, custom absolute/relative times and narrow layout pass')
}, `
    const archived = (id, group, extra = {}) => ({ id, type: 'tab', title: id, spaceId: 'space', url: 'https://example.com', tabGroupId: group, ...extra })
    const wakeAt = Date.now() + 45_000
    data.spaceMeta.pendingTabs = [
        archived('pending-one', 'pending-group', { archive: 'deferred', pending: { batchId: 'pending-group', wakeAt } }),
        archived('pending-two', 'pending-group', { archive: 'deferred', pending: { batchId: 'pending-group', wakeAt } }),
        archived('waiting', null, { archive: 'deferred', pending: { batchId: 'waiting', wakeAt: null, reason: 'external' } })
    ]
    data.spaceMeta.closedTabs.push(archived('closed-group-one', 'closed-group', { closedBatchId: 'closed-group', archive: 'closed' }), archived('closed-group-two', 'closed-group', { closedBatchId: 'closed-group', archive: 'closed' }))
    for (const tab of [...data.spaceMeta.pendingTabs, ...data.spaceMeta.closedTabs]) data.docs[tab.id] = tab
    data.spaces.space.tabs.find(tab => tab.id === 'outside').sidebarPinned = true
    data.spaces.space.tabs.push(archived('normal', null))
    data.resumed = []; data.restored = []; data.snoozes = []
    data.resumePendingTab = async id => { data.resumed.push(id); data.docs[id].archive = null; data.spaceMeta.pendingTabs = data.spaceMeta.pendingTabs.filter(tab => tab.id !== id) }
    data.restoreClosedItems = async ids => { data.restored = ids; data.spaceMeta.closedTabs = data.spaceMeta.closedTabs.filter(tab => !ids.includes(tab.id)) }
    data.snoozeTab = async (id, wakeAt, options) => { data.snoozes.push({ id, wakeAt, ...options }) }
    data.reschedulePendingTabs = async (ids, wakeAt, reason) => {
        for (const tab of data.spaceMeta.pendingTabs) {
            if (ids.includes(tab.id)) tab.pending = { ...tab.pending, wakeAt, reason }
        }
        data.rescheduled = ids
    }
`)

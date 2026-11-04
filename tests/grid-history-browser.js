import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('grid-history', async ({ page }) => {
    await page.setViewport({ width: 1200, height: 800 })
    await page.evaluate(() => window.startHistory())
    await page.keyboard.down('Control')
    await page.keyboard.press('Tab')
    assert.equal(await page.$('.grid-view'), null, 'quick switches keep the overview hidden')
    await page.keyboard.up('Control')
    await new Promise(resolve => setTimeout(resolve, 550))
    assert.equal(await page.$('.grid-view'), null, 'release cancels delayed display')

    await page.evaluate(() => { window.data.spaceMeta.activeTabId = 'outside' })
    await page.keyboard.down('Control')
    await page.keyboard.press('Tab')
    await page.waitForSelector('.activation-history-entry.selected')
    assert.equal(await page.$eval('[role="tab"][aria-selected="true"]', node => node.textContent.trim()), 'History')
    assert.equal(await page.$$eval('.activation-history-entry', nodes => nodes.length), 21)
    assert.equal(await page.$eval('.activation-history-entry.selected', node => node.dataset.historyIndex), '1')
    assert.equal(await page.$eval('.activation-history-entry .hovercard-content', node => node.classList.contains('history-beside')), true)
    assert.ok(await page.$('.activation-history-entry .history-section'), 'history sides are expanded immediately')
    await page.keyboard.press('Tab')
    assert.equal(await page.$eval('.activation-history-entry.selected', node => node.dataset.historyIndex), '2')
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
    await page.waitForFunction(() => {
        const rect = document.querySelector('.activation-history-entry.selected').getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= innerHeight
    })
    await page.screenshot({ path: '.cache/grid-history-wide.png' })
    await page.setViewport({ width: 420, height: 800 })
    await page.waitForFunction(() => !document.querySelector('.activation-history-entry .hovercard-content').classList.contains('history-beside'))
    assert.equal(await page.$eval('.activation-history', node => node.scrollWidth <= node.clientWidth), true)
    await page.screenshot({ path: '.cache/grid-history-narrow.png' })
    const selected = await page.evaluate(() => window.data.spaceMeta.activeTabId)
    await page.keyboard.up('Control')
    await page.waitForFunction(() => !document.querySelector('.grid-view'))
    assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), selected)
    assert.equal(await page.evaluate(() => localStorage.getItem('gridActiveView')), null, 'the temporary view preserves the grid preference')

    await page.evaluate(() => window.openHistory())
    await page.waitForSelector('.activation-history-entry')
    await page.click('.activation-history-entry .hovercard-title')
    await page.waitForFunction(() => !document.querySelector('.grid-view'))
}, `
    import GridView from './app/components/GridView.svelte'
    import { createTabHistorySwitcher } from './app/lib/tab-activation-history.js'
    import { createShortcutHandler, createShortcutMatcher, shortcuts } from './app/lib/shortcuts.js'
    let historyState = $state(null)
    let grid = null
    window.startHistory = () => {
        data.getTabGroups = () => []
        data.spaces.space.activeTabsOrder = Array.from({ length: 21 }, (_, index) => ({
            id: ['outside', 'group-two', 'group-missing'][index % 3], activatedAt: Date.now() - index * 60000
        }))
        data.spaceMeta.activeTabId = 'outside'
        data.previous = () => { data.activate(data.spaces.space.activeTabsOrder[1].id); return true }
        const switcher = createTabHistorySwitcher(data, state => {
            historyState = state
            if (state?.visible && !grid) grid = mount(GridView, { target: document.body, props: {
                get historySwitch() { return historyState },
                onViewModeChange: () => switcher.finish()
            } })
            if (!state && grid) { unmount(grid); grid = null }
        })
        const handler = createShortcutHandler(createShortcutMatcher(shortcuts, true), id => {
            if (id === 'previous-active-tab') switcher.previous()
            if (id === 'escape') switcher.finish()
        })
        window.addEventListener('keydown', handler, true)
        window.addEventListener('keyup', event => { handler.keyup(event); if (event.key === 'Control') switcher.finish() }, true)
    }
    window.openHistory = () => {
        localStorage.setItem('gridActiveView', 'history')
        grid = mount(GridView, { target: document.body, props: {
            onTabActivate: tab => data.activate(tab.id),
            onViewModeChange: () => { unmount(grid); grid = null }
        } })
    }
    import { unmount } from 'svelte'
`)

import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('tab-title', async ({ page }) => {
    await page.evaluate(() => window.flushSync(() => {
        for (const id of ['outside', 'group-missing', 'group-two', 'closed-one', 'pin-one']) {
            Object.assign(window.data.docs[id], { title: ' \n\t', titleOverride: '', url: `https://example.com/${id}` })
        }
        window.mountTitleFixtures()
    }))
    await page.$eval('.tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    await page.waitForSelector('.tab-item-container[data-tab-id="group-two"] .tab-title')
    for (const id of ['outside', 'group-two']) {
        assert.equal(await page.$eval(`.tab-item-container[data-tab-id="${id}"] .tab-title`, el => el.textContent), `https://example.com/${id}`)
    }
    assert.equal(await page.$eval('.closed-tab-item[data-tab-id="closed-one"] .tab-title', el => el.textContent), 'https://example.com/closed-one')
    assert.deepEqual(await page.$eval('.pinned-tab[data-tab-id="pin-one"]', el => [el.title, el.getAttribute('aria-label')]), ['https://example.com/pin-one', 'https://example.com/pin-one'])
    const readTitles = () => page.evaluate(() => ({
        lightbox: document.querySelector('#title-fixture .lightbox-title').textContent,
        hovercard: document.querySelector('#title-fixture .hovercard-title').textContent,
        hovercardLabel: document.querySelector('#title-fixture .hovercard-title').getAttribute('aria-label'),
        stack: document.querySelector('#title-fixture .stack-title .title-text').textContent,
        stackLabel: document.querySelector('#title-fixture .stack-title').getAttribute('aria-label'),
        member: document.querySelector('.tab-item-container[data-tab-id="group-two"] .tab-title').textContent
    }))
    for (const [update, expected] of [
        [{}, 'https://example.com/group-two'],
        [{ title: 'Page title' }, 'Page title'],
        [{ titleOverride: 'Custom title' }, 'Custom title'],
        [{ titleOverride: null, title: '' }, 'https://example.com/group-two'],
        [{ url: 'https://example.com/changed' }, 'https://example.com/changed'],
        [{ url: 'about:newtab', title: 'New Tab' }, 'New Tab'],
        [{ url: 'about:blank', title: 'New Tab' }, 'New Tab'],
        [{ titleOverride: 'Custom New Tab' }, 'Custom New Tab'],
        [{ titleOverride: null }, 'New Tab']
    ]) {
        await page.evaluate(update => window.flushSync(() => Object.assign(window.data.docs['group-two'], update)), update)
        assert.deepEqual(await readTitles(), {
            lightbox: expected, hovercard: expected, hovercardLabel: `Open ${expected}`,
            stack: expected, stackLabel: `Activate ${expected}. Use left and right arrows to browse tabs.`, member: expected
        })
    }
    assert.equal(await page.evaluate(() => window.data.frames['group-two']?.frame), undefined, 'internal new tabs must have their title without a native page frame')
    console.log('Chromium: URL fallback and reactive titles agree across lightbox, hovercard, group members, grid stack, closed tabs and pins')
}, `
    import LightboxHeader from './app/components/LightboxHeader.svelte'
    import GridTabStack from './app/components/GridTabStack.svelte'
    window.mountTitleFixtures = () => {
        const target = document.createElement('div')
        target.id = 'title-fixture'
        document.body.append(target)
        mount(LightboxHeader, { target, props: { get tab() { return data.docs['group-two'] } } })
        mount(TabHoverCard, { target, props: { get tab() { return data.docs['group-two'] }, showPreview: false } })
        mount(GridTabStack, { target, props: { get group() { return data.getTabGroup('group-two', 'space') }, activeTabId: 'group-two' } })
    }
`)

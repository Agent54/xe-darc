import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-hovercards', async ({ page }) => {
    const hovercardLeft = async (trigger, grouped) => {
        await page.hover(trigger)
        await page.waitForFunction(grouped => {
            const preview = document.querySelector('.tab-hovercard-sidebar')
            return preview?.classList.contains('group-hovercards') === grouped && preview.querySelector('.hovercard-content') && preview.getAnimations().every(animation => animation.playState === 'finished')
        }, {}, grouped)
        return page.$eval('.hovercard-content', card => card.getBoundingClientRect().left)
    }
    const crossHovercardGapSlowly = async trigger => {
        const gap = await page.$eval(trigger, element => {
            const anchor = (element.closest('.tab-group-wrapper') || element).getBoundingClientRect()
            const card = document.querySelector('.tab-hovercard-stack').getBoundingClientRect()
            return card.left >= anchor.right
                ? { start: anchor.right, end: card.left, y: (anchor.top + anchor.bottom) / 2 }
                : { start: card.right, end: anchor.left, y: (anchor.top + anchor.bottom) / 2 }
        })
        assert.ok(gap.end > gap.start, 'the visible hovercard spacing must be retained')
        const card = await page.$('.tab-hovercard-sidebar')
        for (const progress of [0.25, 0.5, 0.75]) {
            await page.mouse.move(gap.start + (gap.end - gap.start) * progress, gap.y)
            assert.equal(await page.evaluate(() => !!document.elementFromPoint(window.mouseX, window.mouseY)?.closest('.tab-hovercard-sidebar')), true, 'the transparent gap must receive native hover events')
            await page.waitForNetworkIdle({ idleTime: 400 })
            assert.equal(await page.evaluate(card => card === document.querySelector('.tab-hovercard-sidebar'), card), true, 'pausing in the gap must preserve the same hovercard beyond both dismissal timers')
        }
        await page.hover('.tab-hovercard-sidebar .hovercard-title')
        assert.equal(await page.evaluate(card => card === document.querySelector('.tab-hovercard-sidebar'), card), true)
        await card.dispose()
    }
    const groupLeft = await hovercardLeft('.tab-group-main', true)
    await crossHovercardGapSlowly('.tab-group-main')
    assert.equal(await page.$$eval('.hovercard-content.active', cards => cards.length), 1, 'only the remembered group member receives a brighter header')
    assert.equal(await page.$eval('.hovercard-content.active .hovercard-title', title => title.textContent), 'group-two')
    assert.deepEqual(await page.$eval('.hovercard-content.active .hovercard-info', header => ({
        background: getComputedStyle(header).backgroundColor,
        capsule: getComputedStyle(header, '::before').content,
        topBorder: getComputedStyle(header).borderTopWidth,
        bottomBorder: getComputedStyle(header).borderBottomWidth
    })), { background: 'rgb(16, 16, 16)', capsule: 'none', topBorder: '0px', bottomBorder: '1px' }, 'the active header keeps its subtle surface and the same preview divider as screenshot cards')
    await (await page.$('.tab-hovercard-sidebar')).screenshot({ path: `${root}.cache/tab-hovercard-header.png` })
    await page.hover('.hovercard-content.active .hovercard-title')
    await page.waitForSelector('.hovercard-content.active .url-bar-section.hover-expand-enabled')
    await page.hover('.hovercard-content.active .url-bar-url')
    await page.waitForSelector('.url-bar-wrapper:popover-open')
    assert.equal(await page.$eval('.url-bar-wrapper:popover-open .url-bar-container', bar => getComputedStyle(bar).backgroundColor), 'rgb(22, 22, 22)', 'a floating URL bar must have an opaque background immediately')
    await page.waitForFunction(() => {
        const stack = document.querySelector('.group-hovercards .tab-hovercard-stack').getBoundingClientRect()
        const url = document.querySelector('.url-bar-wrapper:popover-open .url-bar-container').getBoundingClientRect()
        return url.right > stack.right + 40
    })
    assert.equal(await page.evaluate(() => {
        const stack = document.querySelector('.group-hovercards .tab-hovercard-stack').getBoundingClientRect()
        const url = document.querySelector('.url-bar-wrapper:popover-open .url-bar-container').getBoundingClientRect()
        return !!document.elementFromPoint(stack.right + 30, url.top + 16)?.closest('.url-bar-wrapper:popover-open')
    }), true, 'the expanded URL bar must remain visible and interactive beyond the scrollable stack')
    await page.click('.url-bar-wrapper:popover-open .url-bar-url')
    await page.waitForFunction(() => document.activeElement?.classList.contains('url-bar-input'))
    await page.mouse.move(700, 550)
    assert.equal(await page.$eval('.url-bar-wrapper:popover-open .url-bar-container.expanded', bar => getComputedStyle(bar).backgroundColor), 'rgb(22, 22, 22)', 'the focused URL editor keeps its background when the pointer leaves')
    assert.equal(await page.$eval('.url-bar-wrapper:popover-open .url-bar-input', input => document.activeElement === input), true)
    const floatingTop = await page.$eval('.url-bar-wrapper:popover-open', bar => bar.getBoundingClientRect().top)
    await page.$eval('.group-hovercards .tab-hovercard-stack', stack => { stack.scrollTop += 30 })
    await page.waitForFunction(top => Math.abs(document.querySelector('.url-bar-wrapper:popover-open').getBoundingClientRect().top - (top - 30)) < 1, {}, floatingTop)
    await page.evaluate(() => { document.body.style.background = '#242424' })
    await page.screenshot({ path: `${root}.cache/tab-group-floating-url.png` })
    await page.evaluate(() => { document.body.style.background = '' })
    await page.keyboard.press('Escape')
    await page.mouse.move(700, 550)
    await page.waitForSelector('.url-bar-wrapper:popover-open', { hidden: true })
    const singleLeft = await hovercardLeft('.tabs-list > [data-tab-id="outside"]', false)
    await crossHovercardGapSlowly('.tabs-list > [data-tab-id="outside"]')
    assert.ok(Math.abs(groupLeft - singleLeft) < 0.5, `group and single hovercards must align: ${groupLeft} vs ${singleLeft}`)
    const rowRight = await page.$eval('.tabs-list > [data-tab-id="outside"]', row => row.getBoundingClientRect().right)
    assert.ok(Math.abs(singleLeft - rowRight - 18) < 0.5, 'both preview types retain the original 10px gap plus the card inset')
    assert.equal(await page.$('.hovercard-content.active'), null)
    await page.evaluate(() => window.flushSync(() => { window.data.spaceMeta.activeTabId = 'outside' }))
    await page.waitForSelector('.hovercard-content.active')
    await page.mouse.move(790, 590)
    await page.waitForSelector('.tab-hovercard-sidebar', { hidden: true })

    await page.setViewport({ width: 375, height: 800 })
    await hovercardLeft('.tab-group-main', true)
    assert.equal(await page.$eval('.tab-hovercard-sidebar', stack => {
        const rect = stack.getBoundingClientRect()
        return rect.left >= 0 && rect.right <= window.innerWidth
    }), true, 'the hovercard stack must still fit a narrow viewport')
    await page.evaluate(() => window.flushSync(() => { window.data.ui.sidebarVisible = false }))
    assert.equal(await page.$('.sidebar-window-drag'), null, 'hover-mode sidebars must not leave an invisible drag strip over the header')

    await page.setViewport({ width: 1200, height: 800 })
    await page.evaluate(() => window.flushSync(() => {
        window.data.ui.sidebarVisible = true
        window.data.docs.outside.screenshot = location.origin + '/one.svg'
    }))
    await hovercardLeft('.tabs-list > [data-tab-id="outside"]', false)
    await page.waitForFunction(() => document.querySelector('.tab-hovercard-sidebar .attachment-image')?.naturalWidth > 0)
    const screenshotBeforeHistory = await page.$eval('.tab-hovercard-sidebar .hovercard-screenshot', screenshot => {
        window.previewImage = screenshot.querySelector('img')
        window.previewImageLoads = 0
        window.previewImage.addEventListener('load', () => window.previewImageLoads++)
        return screenshot.getBoundingClientRect().toJSON()
    })
    await page.hover('.tab-hovercard-sidebar .hovercard-title')
    await page.waitForSelector('.tab-hovercard-sidebar .history-beside')
    const historyIsBesideScreenshot = () => {
        const card = document.querySelector('.tab-hovercard-sidebar .history-beside')
        const screenshot = card?.querySelector('.hovercard-screenshot')?.getBoundingClientRect()
        const history = card?.querySelector('.history-section')?.getBoundingClientRect()
        const bounds = card?.getBoundingClientRect()
        return screenshot && history && history.left >= screenshot.right && history.top < screenshot.bottom &&
            history.bottom <= bounds.bottom && bounds.right <= window.innerWidth - 10
    }
    await page.waitForFunction(historyIsBesideScreenshot)
    assert.deepEqual(await page.$eval('.tab-hovercard-sidebar .hovercard-screenshot', screenshot => screenshot.getBoundingClientRect().toJSON()), screenshotBeforeHistory, 'opening side history must preserve the screenshot position and dimensions')
    assert.equal(await page.evaluate(() => window.previewImage === document.querySelector('.tab-hovercard-sidebar .attachment-image') && window.previewImageLoads === 0), true, 'opening history must retain the decoded screenshot without reloading it')
    assert.equal(await page.$eval('.history-beside .history-list', list => list.scrollHeight > list.clientHeight), true, 'wide history must scroll within the preview height')
    await (await page.$('.tab-hovercard-sidebar')).screenshot({ path: `${root}.cache/sidebar-history-wide.png` })
    await page.evaluate(() => window.dispatchEvent(new Event('darc-dismiss-hovercards')))
    await page.setViewport({ width: 800, height: 800 })
    await hovercardLeft('.tabs-list > [data-tab-id="outside"]', false)
    await page.hover('.tab-hovercard-sidebar .hovercard-title')
    await page.waitForFunction(() => {
        const card = document.querySelector('.tab-hovercard-sidebar .hovercard-content')
        const screenshot = card?.querySelector('.hovercard-screenshot')?.getBoundingClientRect()
        const history = card?.querySelector('.history-section')?.getBoundingClientRect()
        return card && !card.classList.contains('history-beside') && history?.top >= screenshot?.bottom
    })
    await (await page.$('.tab-hovercard-sidebar')).screenshot({ path: `${root}.cache/sidebar-history-narrow.png` })
    await page.evaluate(() => window.dispatchEvent(new Event('darc-dismiss-hovercards')))
    await page.setViewport({ width: 1200, height: 800 })
    await hovercardLeft('.tabs-list > [data-tab-id="outside"]', false)
    await page.hover('.tab-hovercard-sidebar .hovercard-title')
    await page.waitForFunction(historyIsBesideScreenshot)
    await page.mouse.move(1100, 750)
    await page.evaluate(() => {
        window.dispatchEvent(new Event('darc-dismiss-hovercards'))
        window.flushSync(() => {
            window.data.docs['group-missing'].screenshot = location.origin + '/one.svg'
            window.data.docs['group-two'].screenshot = location.origin + '/two.svg'
            window.data.docs['group-tail-0'].lastActiveAt = Date.now() - 300000
        })
        window.previewGeometry = () => [...document.querySelectorAll('.group-hovercards .hovercard-info, .group-hovercards .hovercard-preview')].map(element => element.getBoundingClientRect().toJSON())
    })
    await hovercardLeft('.tab-group-main', true)
    await page.waitForFunction(() => [...document.querySelectorAll('.group-hovercards .attachment-image')].length === 2 && [...document.querySelectorAll('.group-hovercards .attachment-image')].every(image => image.naturalWidth > 0))
    assert.deepEqual(await page.$$eval('.group-hovercards .hovercard-preview', previews => [...new Set(previews.map(preview => `${preview.clientWidth}x${preview.clientHeight}`))]), ['318x180'], 'metadata panels must occupy the same preview area as screenshots')
    assert.equal(await page.$$eval('.group-hovercards .hovercard-metadata', panels => panels.some(metadata => metadata.textContent.includes('Not recorded'))), true, 'missing timestamps must be identified instead of invented')
    const groupGeometry = await page.evaluate(() => window.previewGeometry())
    const firstGroupCard = '.group-hovercards .hovercard-content:nth-child(1)'
    const secondGroupCard = '.group-hovercards .hovercard-content:nth-child(2)'
    await page.hover(`${firstGroupCard} .hovercard-title`)
    await page.waitForNetworkIdle({ idleTime: 400 })
    assert.equal(await page.$('.group-hovercards .history-section'), null, 'the first card must still wait before showing history')
    await page.waitForSelector('.group-hovercards .history-beside')
    assert.deepEqual(await page.evaluate(() => window.previewGeometry()), groupGeometry, 'opening group history must leave all preview headers and screenshots in place')
    await page.hover(`${secondGroupCard} .hovercard-title`)
    await page.waitForSelector(`${secondGroupCard} .history-section`, { timeout: 500 })
    assert.equal(await page.$$eval('.group-hovercards .history-section', sections => sections.length), 1, 'moving between cards must move the single history panel immediately')
    assert.deepEqual(await page.evaluate(() => window.previewGeometry()), groupGeometry, 'moving history to another card must preserve the stack layout')
    await (await page.$('.tab-hovercard-sidebar')).screenshot({ path: `${root}.cache/group-history-stable.png` })
    const metadataGroupCard = '.group-hovercards .hovercard-content:nth-child(3)'
    await page.hover(`${metadataGroupCard} .hovercard-title`)
    await page.waitForSelector(`${metadataGroupCard} .history-section`, { timeout: 500 })
    assert.deepEqual(await page.$eval(`${metadataGroupCard} .hovercard-metadata`, metadata => [...metadata.querySelectorAll('time')].map(time => time.dateTime)), await page.evaluate(() => [window.data.docs['group-tail-0'].created, window.data.docs['group-tail-0'].lastActiveAt].map(timestamp => new Date(timestamp).toISOString())), 'metadata must use the recorded opening and activity times')
    assert.deepEqual(await page.evaluate(() => window.previewGeometry()), groupGeometry, 'metadata previews must retain their geometry when side history opens')
    await (await page.$(metadataGroupCard)).screenshot({ path: `${root}.cache/tab-metadata-history.png` })
    await page.mouse.move(1100, 750)
    await page.waitForSelector('.tab-hovercard-sidebar', { hidden: true })
    await hovercardLeft('.tab-group-main', true)
    await page.hover(`${firstGroupCard} .hovercard-title`)
    await page.waitForNetworkIdle({ idleTime: 400 })
    assert.equal(await page.$('.group-hovercards .history-section'), null, 'closing the hovercards must restore the initial history delay')
    await page.waitForSelector(`${firstGroupCard} .history-section`)
    assert.equal(await page.$eval('.group-hovercards .tab-hovercard-stack', stack => {
        const wideCard = stack.querySelector('.history-beside').getBoundingClientRect()
        const otherCard = stack.querySelector('.hovercard-content:not(.history-beside)').getBoundingClientRect()
        const history = stack.querySelector('.history-section').getBoundingClientRect()
        return wideCard.width === 640 && otherCard.width === 320 && history.left > wideCard.left + 300 && stack.getBoundingClientRect().right <= window.innerWidth - 10
    }), true, 'group history expands only its own card into the second column')
    await page.evaluate(() => {
        window.dispatchEvent(new Event('darc-dismiss-hovercards'))
        document.querySelector('.sidebar-box').style.left = '900px'
    })
    await hovercardLeft('.tab-group-main', true)
    assert.equal(await page.evaluate(() => document.querySelector('.tab-hovercard-stack').getBoundingClientRect().right < document.querySelector('.tab-group-wrapper').getBoundingClientRect().left), true, 'the fixture must exercise a preview flipped to the left')
    await crossHovercardGapSlowly('.tab-group-main')
    await page.mouse.move(1100, 750)
    await page.waitForSelector('.tab-hovercard-sidebar', { hidden: true })
    await page.evaluate(() => {
        document.querySelector('.sidebar-box').style.removeProperty('left')
        window.dispatchEvent(new Event('darc-dismiss-hovercards'))
        window.mountTopbarHovercard()
    })
    await page.waitForSelector('#topbar-hovercard-fixture .history-section')
    assert.equal(await page.$eval('#topbar-hovercard-fixture .hovercard-content', card => {
        const screenshot = card.querySelector('.hovercard-screenshot').getBoundingClientRect()
        const history = card.querySelector('.history-section').getBoundingClientRect()
        return !card.classList.contains('history-beside') && card.offsetWidth === 320 && history.top >= screenshot.bottom
    }), true, 'top-bar hovercards keep history below the screenshot on wide windows')
    await page.evaluate(() => window.mountMetadataHovercard())
    await page.waitForSelector('#metadata-hovercard-fixture .history-section')
    assert.deepEqual(await page.$eval('#metadata-hovercard-fixture .hovercard-metadata', metadata => [...metadata.querySelectorAll('time')].map(time => time.dateTime)), await page.evaluate(() => [window.data.docs['closed-two'].created, window.data.docs['closed-two'].closedAt].map(timestamp => new Date(timestamp).toISOString())), 'closed metadata must prefer its recorded close time over later modifications')
    await page.setViewport({ width: 375, height: 800 })
    assert.equal(await page.$eval('#metadata-hovercard-fixture .hovercard-metadata', metadata => metadata.clientHeight === 180 && metadata.scrollWidth === metadata.clientWidth && metadata.textContent.includes('Closed')), true, 'closed-tab details must fit the same preview area on narrow screens')
    await (await page.$('#metadata-hovercard-fixture .hovercard-content')).screenshot({ path: `${root}.cache/closed-tab-metadata.png` })
    console.log('Chromium: sidebar hovercard placement, gaps, responsive history, screenshots and metadata pass')
})

import assert from 'node:assert/strict'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

await withSidebarFixture('sidebar-groups', async ({ page }) => {
    await page.$eval('.tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    for (const headerPart of ['.tab-group-main', '.tab-group-count', '.tab-group-toggle']) {
        await page.hover(headerPart)
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgb(24, 24, 24)')
        assert.equal(await page.$eval('.group-activation-target', row => row.dataset.tabId), 'group-two')
        assert.equal(await page.$eval('.tab-group-content > [data-tab-id="group-missing"]', row => getComputedStyle(row).backgroundColor), 'rgba(0, 0, 0, 0)')
    }
    await page.mouse.move(600, 500)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgba(0, 0, 0, 0)')
    await page.hover('.tab-group-main')
    await page.evaluate(() => window.flushSync(() => { window.data.spaces.space.activeTabsOrder = ['outside', 'group-missing'] }))
    await page.waitForFunction(() => document.querySelector('.group-activation-target').dataset.tabId === 'group-missing' && getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgb(24, 24, 24)')
    assert.equal(await page.$eval('.tab-group-content > [data-tab-id="group-two"]', row => getComputedStyle(row).backgroundColor), 'rgba(0, 0, 0, 0)')
    await page.mouse.move(600, 500)
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgba(0, 0, 0, 0)')
    await page.focus('.tab-group-toggle')
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.group-activation-target')).backgroundColor === 'rgb(24, 24, 24)')
    await page.$eval('.tab-group-toggle', button => button.blur())
    for (const scrollTop of [0, 9999]) {
        await page.mouse.move(600, 500)
        const outerScrollTop = await page.evaluate(scrollTop => {
            window.flushSync(() => { window.data.spaces.space.activeTabsOrder = ['outside', scrollTop ? 'group-missing' : 'group-tail-5'] })
            document.querySelector('.tab-group-content').scrollTop = scrollTop
            return document.querySelector('.space-tabs-sections').scrollTop
        }, scrollTop)
        await page.hover('.tab-group-main')
        await page.waitForFunction(() => {
            const content = document.querySelector('.tab-group-content').getBoundingClientRect()
            const target = document.querySelector('.group-activation-target').getBoundingClientRect()
            return target.top >= content.top && target.bottom <= content.bottom
        })
        assert.equal(await page.$eval('.space-tabs-sections', list => list.scrollTop), outerScrollTop, 'revealing the remembered tab must only scroll inside its group')
    }
    await page.mouse.move(600, 500)
    const borderPoint = await page.evaluate(() => {
        window.flushSync(() => { window.data.spaces.space.activeTabsOrder = ['outside', 'group-tail-5'] })
        document.querySelector('.tab-group-content').scrollTop = 0
        const wrapper = document.querySelector('.tab-group-wrapper')
        const rect = wrapper.getBoundingClientRect()
        for (let offset = 0; offset < rect.height; offset += 0.5) {
            for (const x of [rect.left, rect.left + 0.25, rect.right - 1, rect.right - 0.25]) {
                const y = rect.top + offset
                if (document.elementFromPoint(x, y) === wrapper) return { x, y }
            }
        }
        throw new Error('The fixture must have an exposed group border')
    })
    await page.mouse.move(borderPoint.x, borderPoint.y)
    const borderPreview = await page.evaluate(({ x, y }) => {
        const wrapper = document.querySelector('.tab-group-wrapper')
        const target = document.querySelector('.group-activation-target')
        const row = target.getBoundingClientRect()
        const content = document.querySelector('.tab-group-content').getBoundingClientRect()
        return {
            onBorder: document.elementFromPoint(x, y) === wrapper,
            visible: row.top >= content.top && row.bottom <= content.bottom,
            background: getComputedStyle(target).backgroundColor,
            transition: getComputedStyle(target).transitionDuration,
            frameBackground: getComputedStyle(wrapper).backgroundColor
        }
    }, borderPoint)
    assert.deepEqual(borderPreview, { onBorder: true, visible: true, background: 'rgb(24, 24, 24)', transition: '0s', frameBackground: 'rgb(16, 16, 16)' }, 'border entry must reveal and highlight the remembered tab immediately with the subdued frame')
    await page.hover('.tab-group-content > [data-tab-id="group-tail-4"]')
    assert.equal(await page.$eval('.group-activation-target', row => getComputedStyle(row).backgroundColor), 'rgba(0, 0, 0, 0)', 'browsing individual rows must clear the header activation preview immediately')
    await page.$eval('.tab-group', header => header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 100 })))
    await (await page.waitForSelector('.context-menu button ::-p-text(Rename…)')).click()
    await page.waitForFunction(() => document.activeElement?.id === 'tab-group-name')
    assert.deepEqual(await page.$eval('#tab-group-name', input => {
        const style = getComputedStyle(input)
        return { outline: style.outlineStyle, shadow: style.boxShadow, appearance: style.appearance, border: style.borderColor, background: style.backgroundColor }
    }), { outline: 'none', shadow: 'none', appearance: 'none', border: 'rgba(255, 255, 255, 0.02)', background: 'rgb(33, 33, 33)' }, 'the focused rename input uses a background change with a quiet border')
    await (await page.$('.context-menu')).screenshot({ path: `${root}.cache/group-rename-focus.png` })
    await page.$eval('#tab-group-name', input => input.blur())
    assert.deepEqual(await page.$eval('#tab-group-name', input => ({ background: getComputedStyle(input).backgroundColor, border: getComputedStyle(input).borderColor })), { background: 'rgb(21, 21, 21)', border: 'rgba(255, 255, 255, 0.02)' }, 'leaving the field restores only its background')
    await page.mouse.click(600, 500)
    for (const [label, action] of [['Ungroup', 'ungroup'], ['Close all', 'close']]) {
        for (const keyboard of [false, true]) {
            await page.$eval('.tab-group', header => header.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 100 })))
            const item = await page.waitForSelector(`.context-menu button ::-p-text(${label})`)
            if (keyboard) {
                await item.focus()
                await page.keyboard.press('Enter')
            } else {
                await item.evaluate(button => button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2 })))
            }
            await page.waitForSelector('.context-menu', { hidden: true })
            assert.deepEqual(await page.evaluate(() => ({ ...window.data.menuActions.at(-1) })), { action, tabId: 'group-missing', spaceId: 'space' })
        }
    }
    assert.equal(await page.evaluate(() => window.data.menuActions.length), 4, 'each menu selection must run once')

    await page.setViewport({ width: 800, height: 1000 })
    await page.evaluate(() => window.flushSync(() => {
        for (let index = 0; index < 2; index++) {
            const tab = { ...window.data.docs['group-two'], id: `resize-${index}`, title: `Resize ${index}`, tabGroupId: 'resize', tabGroupOrder: index, order: 20 + index }
            window.data.docs[tab.id] = tab
            window.data.spaces.space.tabs.push(tab)
        }
    }))
    await page.$eval('[data-tab-group-id="resize"] .tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    const groupContent = '[data-tab-group-id="group"] .tab-group-content'
    const resizeHandle = '[data-tab-group-id="group"] .tab-group-resize'
    await page.mouse.move(600, 500)
    assert.equal(await page.$eval(resizeHandle, button => getComputedStyle(button).opacity), '0', 'the resize grip stays hidden away from the bottom border')
    await page.hover('[data-tab-group-id="group"] .tab-group-main')
    assert.equal(await page.$eval(resizeHandle, button => getComputedStyle(button).opacity), '0', 'hovering the group header must not reveal the resize grip')
    assert.equal(await page.$eval('[data-tab-group-id="resize"] .tab-group-resize', button => getComputedStyle(button).display), 'none', 'a group without overflow must have no resize hit area')
    assert.equal(await page.$eval(resizeHandle, button => {
        const rect = button.getBoundingClientRect()
        const content = button.parentElement.querySelector('.tab-group-content').getBoundingClientRect()
        return rect.top >= content.bottom && getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'
    }), true, 'the transparent resize strip must sit below the tab content instead of covering the last row')
    const resizeGroup = async delta => {
        const point = await page.$eval(resizeHandle, button => {
            const rect = button.getBoundingClientRect()
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        })
        await page.mouse.move(point.x, point.y)
        assert.equal(await page.$eval(resizeHandle, button => getComputedStyle(button).opacity), '1', 'the bottom border reveals the resize grip')
        await page.mouse.down()
        await page.mouse.move(point.x, point.y + delta, { steps: 5 })
        assert.equal(await page.evaluate(() => window.tabDrag.active || window.tabDrag.pending), false, 'resizing must not start a tab drag')
        await page.mouse.up()
        await page.waitForFunction(() => !document.querySelector('.group-resizing'))
    }
    const initialHeight = await page.$eval(groupContent, content => content.clientHeight)
    await resizeGroup(80)
    assert.equal(await page.$eval(groupContent, content => content.clientHeight), initialHeight + 80, 'dragging the corner increases the expanded list height')
    assert.deepEqual(await page.$$eval('.tab-group-content', lists => lists.map(content => getComputedStyle(content).maxHeight)), ['286px', '286px'], 'all groups share the session height limit')
    assert.ok(await page.$eval('[data-tab-group-id="resize"] .tab-group-content', content => content.clientHeight < 286), 'short groups must retain their natural height')
    await resizeGroup(160)
    await page.waitForFunction(() => {
        const content = document.querySelector('[data-tab-group-id="group"] .tab-group-content')
        return content.scrollHeight <= content.clientHeight + 1 && content.parentElement.dataset.scrollTop === 'false' && content.parentElement.dataset.scrollBottom === 'false'
    })
    assert.equal(await page.$eval(resizeHandle, button => getComputedStyle(button).display), 'block', 'a height above the default must remain resizable after overflow disappears')
    await page.mouse.move(600, 500)
    assert.equal(await page.$eval(resizeHandle, button => getComputedStyle(button).opacity), '0', 'a custom height still reveals its grip only on bottom-border hover')
    await resizeGroup(-40)
    assert.equal(await page.$eval(groupContent, content => content.clientHeight), initialHeight + 80, 'a fully visible group can be dragged smaller again')
    await resizeGroup(-120)
    await page.waitForFunction(() => document.querySelector('[data-tab-group-id="group"] .tab-group-scroll').dataset.scrollBottom === 'true')
    assert.equal(await page.$eval(groupContent, content => content.clientHeight), initialHeight - 40, 'shrinking restores inner overflow and its fade')
    await resizeGroup(-400)
    assert.equal(await page.$eval(groupContent, content => getComputedStyle(content).maxHeight), '86px', 'the resize limit must leave room for two rows')
    await page.focus(resizeHandle)
    await page.keyboard.press('Home')
    assert.equal(await page.$eval(groupContent, content => getComputedStyle(content).maxHeight), '206px', 'Home restores the original five-tab cap')
    assert.equal(await page.$eval('[data-tab-group-id="resize"] .tab-group-resize', button => getComputedStyle(button).display), 'none', 'resetting to the default hides the handle again for groups without overflow')
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.$eval(groupContent, content => getComputedStyle(content).maxHeight), '226px', 'the handle supports keyboard resizing')
    for (let i = 0; i < 2; i++) {
        await page.$eval('[data-tab-group-id="group"] .tab-group-toggle', button => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
    }
    assert.equal(await page.$eval(groupContent, content => getComputedStyle(content).maxHeight), '226px', 'the session limit survives collapsing and reopening')
    await page.focus(resizeHandle)
    await page.keyboard.press('Home')
    await page.$eval(resizeHandle, button => button.blur())
    await page.mouse.move(600, 500)
    await page.evaluate(() => window.flushSync(() => {
        for (let index = 0; index < 30; index++) {
            const tab = { ...window.data.docs.outside, id: `scroll-${index}`, order: -30 - index }
            window.data.docs[tab.id] = tab
            window.data.spaces.space.tabs.push(tab)
        }
    }))
    await page.evaluate(() => {
        document.querySelector('.space-tabs-sections').scrollTop = 0
        document.querySelector('[data-tab-group-id="group"] .tab-group-content').scrollTop = 0
    })
    await page.hover(`${groupContent} > :first-child`)
    await page.mouse.wheel({ deltaY: 80 })
    await page.waitForFunction(selector => document.querySelector(selector).scrollTop > 0, {}, groupContent)
    assert.equal(await page.$eval('.space-tabs-sections', list => list.scrollTop), 0, 'overflowing groups scroll internally')
    await page.$eval(groupContent, content => { content.scrollTop = content.scrollHeight })
    await page.mouse.wheel({ deltaY: 80 })
    await new Promise(resolve => setTimeout(resolve, 200))
    assert.equal(await page.$eval('.space-tabs-sections', list => list.scrollTop), 0, 'overflowing groups contain scrolling at their boundary')

    const shortGroup = '[data-tab-group-id="resize"] .tab-group-content'
    await page.hover(`${shortGroup} > [data-tab-id="resize-0"]`)
    await page.mouse.wheel({ deltaY: 80 })
    await page.waitForFunction(() => document.querySelector('.space-tabs-sections').scrollTop > 0)
    assert.equal(await page.$eval(shortGroup, content => content.scrollTop), 0, 'groups without overflow pass scrolling to the parent list')
    await page.hover(`${shortGroup} > [data-tab-id="resize-0"]`)
    await page.mouse.wheel({ deltaY: -80 })
    await page.waitForFunction(() => document.querySelector('.space-tabs-sections').scrollTop === 0)
    await page.evaluate(() => window.flushSync(() => {
        window.data.spaces.space.tabs = window.data.spaces.space.tabs.filter(tab => tab.tabGroupId !== 'resize' && !tab.id.startsWith('scroll-'))
    }))
    console.log('Chromium: group activation previews, menus, resizing and nested scrolling pass')
})

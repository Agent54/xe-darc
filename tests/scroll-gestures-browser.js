import assert from 'node:assert/strict'
import { withSidebarFixture } from './sidebar-browser-fixture.js'

const app = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
const gestureHandlers = app.slice(app.indexOf('    let scrollGestureProgress'), app.indexOf('    const tabHistorySwitcher'))
const releaseHandler = app.slice(app.indexOf('    function handleShortcutKeyUp'), app.indexOf('    function closeGridView'))

await withSidebarFixture('scroll-gestures', async ({ page }) => {
    await page.setViewport({ width: 1200, height: 800 })
    await page.mouse.move(500, 200)
    await page.keyboard.down('Alt')
    await page.keyboard.down('Shift')
    assert.equal(await page.evaluate(() => window.gestureState().scale), .9)
    await page.mouse.wheel({ deltaX: 120, deltaY: 2 })
    await page.waitForFunction(() => window.gestureState().left > 0)
    await page.mouse.wheel({ deltaX: 1, deltaY: -100 })
    assert.equal(await page.evaluate(() => window.gestureState().scale), .9, 'horizontal lock ignores vertical drift')
    assert.equal(await page.evaluate(() => window.gestureState().pageWheels), 0, 'content cannot take modified wheel events')
    await page.keyboard.up('Shift')
    assert.equal(await page.evaluate(() => window.gestureState().scale), 1)
    await page.keyboard.up('Alt')
    await page.mouse.wheel({ deltaY: 20 })
    await page.waitForFunction(() => window.gestureState().pageWheels === 1)

    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('darc-controlled-frame-input', { detail: {
            type: 'keydown', key: 'Shift', altKey: true, shiftKey: true
        } }))
    })
    assert.equal(await page.evaluate(() => window.gestureState().scale), .9, 'generic frame key events enter frame mode')
    await new Promise(resolve => setTimeout(resolve, 260))
    const left = await page.evaluate(() => window.gestureState().left)
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('darc-controlled-frame-input', { detail: {
            type: 'wheel', altKey: true, ctrlKey: false, metaKey: false, shiftKey: true,
            deltaX: 80, deltaY: 0, deltaMode: 0
        } }))
    })
    await page.waitForFunction(previous => window.gestureState().left > previous, {}, left)
    await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('darc-controlled-frame-input', { detail: {
            type: 'keyup', key: 'Shift', altKey: true, shiftKey: false
        } }))
    })
    assert.equal(await page.evaluate(() => window.gestureState().scale), 1)

    await new Promise(resolve => setTimeout(resolve, 260))
    await page.keyboard.down('Alt')
    await page.keyboard.down('Shift')
    await page.mouse.wheel({ deltaY: -100 })
    await page.waitForFunction(() => window.gestureState().scale < .9)
    const scale = await page.evaluate(() => window.gestureState().scale)
    await page.mouse.wheel({ deltaX: 100, deltaY: -1 })
    assert.ok(await page.evaluate(previous => window.gestureState().scale <= previous, scale))
    await page.keyboard.up('Alt')
    await page.keyboard.up('Shift')
    assert.equal(await page.evaluate(() => window.gestureState().scale), 1)

    await new Promise(resolve => setTimeout(resolve, 260))
    await page.keyboard.down('Alt')
    await page.mouse.wheel({ deltaY: -80 })
    await page.waitForFunction(() => window.gestureState().progress?.progress > 0)
    assert.equal(await page.evaluate(() => window.gestureState().viewMode), 'default')
    await page.mouse.wheel({ deltaY: -80 })
    await page.mouse.wheel({ deltaY: -80 })
    await page.waitForFunction(() => window.gestureState().viewMode === 'tile')
    await page.keyboard.up('Alt')

    await page.evaluate(() => { window.data.ui.viewMode = 'default' })
    await new Promise(resolve => setTimeout(resolve, 260))
    const active = await page.evaluate(() => window.data.spaceMeta.activeTabId)
    await page.keyboard.down('Alt')
    for (let i = 0; i < 3; i++) {
        await page.mouse.wheel({ deltaY: 80 })
    }
    await page.waitForFunction(() => window.gestureState().history?.source === 'scroll')
    await page.keyboard.up('Alt')
    assert.equal(await page.evaluate(() => window.gestureState().history?.visible), true, 'releasing the modifier preserves scroll-opened history')
    assert.equal(await page.evaluate(() => window.data.spaceMeta.activeTabId), active)

    await page.evaluate(() => window.testGridEntry())
    assert.deepEqual(await page.evaluate(() => window.gestureState().layout), [true, false, true, []])
    await page.evaluate(() => window.testGridExit())
    assert.deepEqual(await page.evaluate(() => window.gestureState().layout), [false, true, false, ['settings']])

    await page.evaluate(() => {
        window.finishGestureHistory()
        localStorage.setItem('scrollGestureModifier', 'control')
    })
    await page.keyboard.down('Alt')
    await page.keyboard.down('Shift')
    assert.equal(await page.evaluate(() => window.gestureState().scale), .9, 'saving a modifier keeps the startup assignment until restart')
    await page.keyboard.up('Shift')
    await page.keyboard.up('Alt')
    await page.reload()
    await page.waitForFunction(() => !!window.gestureState)
    await page.mouse.move(500, 200)
    await page.keyboard.down('Control')
    for (let i = 0; i < 3; i++) {
        await page.mouse.wheel({ deltaY: -80 })
    }
    await page.waitForFunction(() => window.gestureState().viewMode === 'tile')
    await page.keyboard.up('Control')
    await page.evaluate(() => { window.data.ui.viewMode = 'default' })
    await page.keyboard.down('Control')
    await page.keyboard.down('Shift')
    assert.equal(await page.evaluate(() => window.gestureState().scale), .9)
    await page.evaluate(() => window.stopGestureListeners())
    assert.equal(await page.evaluate(() => window.gestureState().scale), 1, 'listener cleanup resets frame mode')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('darc-controlled-frame-input', { detail: {
        type: 'keydown', key: 'Shift', ctrlKey: true, shiftKey: true
    } })))
    assert.equal(await page.evaluate(() => window.gestureState().scale), 1, 'cleanup removes generic input listeners')
    await page.keyboard.up('Shift')
    await page.keyboard.up('Control')
    console.log('Shell gestures: real modified wheel capture, axis lock, scale release, normal scroll restoration, thresholds, persistent history, layout restoration and Control selection passed')
}, `
    import { createScrollGestures } from './app/lib/scroll-gestures.js'
    import { createTabHistorySwitcher } from './app/lib/tab-activation-history.js'
    let tabHistorySwitch = $state(null)
    let focusModeEnabled = false, tabSidebarVisible = true, rightToolbarAutohide = false
    let openSidebars = new Set(['settings'])
    let restoreLayout
    const toggleFocusMode = () => { focusModeEnabled = !focusModeEnabled }
    const selectViewMode = mode => { data.ui.viewMode = mode }
    const onMount = callback => { window.stopGestureListeners = callback() }
    const handleKeyDown = { keyup() {} }
    const scrollContainer = document.createElement('div')
    scrollContainer.style.cssText = 'position:fixed;left:300px;top:80px;width:800px;height:500px;overflow:auto'
    scrollContainer.innerHTML = '<div style="width:3000px;height:500px;background:#15191c"></div>'
    document.body.append(scrollContainer)
    let pageWheels = 0
    scrollContainer.firstElementChild.addEventListener('wheel', () => { pageWheels++ })
    data.ui.viewMode = 'default'
    ${gestureHandlers}
    const tabHistorySwitcher = createTabHistorySwitcher(data, state => { tabHistorySwitch = state })
    ${releaseHandler}
    window.addEventListener('keyup', handleShortcutKeyUp)
    window.finishGestureHistory = () => tabHistorySwitcher.finish()
    window.testGridEntry = () => { restoreLayout = enterGridView() }
    window.testGridExit = () => restoreLayout()
    window.gestureState = () => ({ progress: scrollGestureProgress, scale: frameScrollScale,
        viewMode: data.ui.viewMode, history: tabHistorySwitch, left: scrollContainer.scrollLeft, pageWheels,
        layout: [focusModeEnabled, tabSidebarVisible, rightToolbarAutohide, [...openSidebars]] })
`)

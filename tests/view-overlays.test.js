import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'

function component(path) {
    const source = Deno.readTextFileSync(new URL(`../app/${path}`, import.meta.url))
    const body = parse(source).instance.content.body
    return {
        functions(names) {
            return body.filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name))
                .map(node => source.slice(node.start, node.end)).join('\n')
        },
        mountContaining(text) {
            const node = body.find(node => node.expression?.callee?.name === 'onMount' && source.slice(node.start, node.end).includes(text))
            return source.slice(node.start, node.end)
        }
    }
}

function clock() {
    let id = 0
    const timers = new Map()
    return {
        timers,
        setTimeout(callback) { timers.set(++id, callback); return id },
        clearTimeout(id) { timers.delete(id) },
        run() {
            const pending = [...timers.values()]
            timers.clear()
            for (const callback of pending) callback()
        }
    }
}

function shellHarness() {
    const timers = clock()
    const window = new EventTarget()
    const events = []
    let popovers = 0
    for (const name of ['darc-dismiss-hovercards', 'darc-dismiss-overlays']) {
        window.addEventListener(name, () => events.push(name))
    }
    const document = { querySelectorAll: () => [{ hidePopover() { popovers++ } }] }
    const storage = { setItem() {} }
    const data = { ui: { viewMode: 'default' }, settings: {} }
    const functions = component('App.svelte').functions([
        'dismissViewOverlays', 'hideContextMenu', 'selectViewMode', 'toggleViewMode',
        'openAppsOverlay', 'closeAppsOverlay', 'toggleAppsOverlay', 'toggleFocusMode'
    ])
    const api = new Function('window', 'document', 'data', 'localStorage', 'setTimeout', 'clearTimeout', `
        let contextMenu = { visible: true }, appearanceMenu = {}, isDragEnabled = false
        let menuForceClose = false, newTabMenuVisible = true, shortcutOverviewVisible = true, gestureOverviewVisible = true
        let newTabMenuHoverTimeout = setTimeout(() => { newTabMenuVisible = true }, 800)
        let newTabMenuLeaveTimeout = setTimeout(() => {}, 150)
        let lastUsedViewMode = 'tile', backToDefault = false
        let focusModeEnabled = false, focusModeHovered = true, contentAreaScrimActive = true, hasLeftToggle = true
        let appsOverlayZenModeWasActive = false, appsOverlayHasOpened = false, showAppsOverlay = false
        const appsView = { refresh() {}, close() {} }
        ${functions}
        return {
            selectViewMode, toggleViewMode, toggleAppsOverlay, toggleFocusMode,
            get state() { return { context: contextMenu.visible, appearanceMenu, menuForceClose,
                newTabMenuVisible, shortcutOverviewVisible, gestureOverviewVisible, isDragEnabled, showAppsOverlay } }
        }
    `)(window, document, data, storage, timers.setTimeout, timers.clearTimeout)
    return { api, data, timers, events, get popovers() { return popovers } }
}

Deno.test('every view selection dismisses menus and popovers and cancels pending menu opening', () => {
    for (const mode of ['default', 'tile', 'leaflet', 'canvas', 'reading', 'squat', 'notebook', 'stage']) {
        for (const options of [{}, { fromZoomOrKey: true }]) {
            const h = shellHarness()
            h.api.selectViewMode(mode, options)
            h.timers.run()
            assert.equal(h.data.ui.viewMode, mode)
            assert.deepEqual(h.api.state, {
                context: false, appearanceMenu: null, menuForceClose: true,
                newTabMenuVisible: false, shortcutOverviewVisible: false, gestureOverviewVisible: false, isDragEnabled: true, showAppsOverlay: false
            })
            assert.deepEqual(h.events, ['darc-dismiss-hovercards', 'darc-dismiss-overlays'])
            assert.equal(h.popovers, 1)
        }
    }
})

Deno.test('view toggles, app view entry and exit, and focus mode share dismissal', () => {
    for (const action of ['toggleViewMode', 'toggleAppsOverlay', 'toggleFocusMode']) {
        const h = shellHarness()
        for (let i = 0; i < 2; i++) {
            const before = h.events.length
            h.api[action]()
            h.timers.run()
            assert.ok(h.events.length > before)
            assert.equal(h.api.state.context, false)
            assert.equal(h.api.state.newTabMenuVisible, false)
            assert.equal(h.api.state.menuForceClose, true)
        }
        assert.equal(h.api.state.showAppsOverlay, false)
    }
})

Deno.test('sidebar dismissal closes expanded hovercards, space menus, pickers and pending previews', () => {
    const window = new EventTarget()
    const timers = clock()
    const functions = component('components/TabSidebar.svelte')
    const api = new Function('window', 'setTimeout', 'clearTimeout', 'onMount', `
        let hoveredTab = {}, hoveredGroupTarget = {}, hovercardAnchor = {}, hovercardShowTime = 1
        let expandedHovercardHistoryTabId = 'tab', hovercardHistoryReady = true, hovercardUrlBarExpanded = true
        let expandedHovercardTabs = { tab: true }, openMenuId = 'space', newSpaceMenuOpen = true
        let spaceContextMenuId = 'space', colorPickerSpaceId = 'space', renamingSpaceId = 'space', urlBarExpanded = true
        let closedTabsHovered = true, closedTabsHeaderHovered = true, closedTabsPreviewUntil = 1000
        let hoverMenusDismissed = false
        let tabContextMenu = { visible: true }, stopped = false, groupDismissed = false
        let hoverTimeout = setTimeout(() => { hoveredTab = {} }, 500)
        let menuCloseTimeout = setTimeout(() => {}, 340), closedTabsHideTimeout = setTimeout(() => {}, 100)
        function stopHovercardPositionCheck() { stopped = true }
        const groupPreview = { dismiss() { groupDismissed = true } }
        ${functions.functions(['hideTabContextMenu'])}
        ${functions.mountContaining('darc-dismiss-overlays')}
        return () => [hoveredTab, hoveredGroupTarget, hovercardAnchor, hovercardShowTime, expandedHovercardHistoryTabId,
            hovercardHistoryReady, hovercardUrlBarExpanded, expandedHovercardTabs, openMenuId, newSpaceMenuOpen,
            spaceContextMenuId, colorPickerSpaceId, renamingSpaceId, urlBarExpanded, closedTabsHovered,
            closedTabsHeaderHovered, closedTabsPreviewUntil, tabContextMenu.visible, stopped, groupDismissed]
    `)(window, timers.setTimeout, timers.clearTimeout, callback => callback())
    window.dispatchEvent(new Event('darc-dismiss-overlays'))
    timers.run()
    assert.deepEqual(api(), [null, null, null, null, null, false, false, {}, null, false,
        null, null, null, false, false, false, 0, false, true, true])
    assert.equal(timers.timers.size, 0)
})

function frameHarness() {
    const timers = clock()
    let resolveTab
    const data = { spaceMeta: { activeSpace: 'space' }, newTab: () => new Promise(resolve => { resolveTab = resolve }) }
    const functions = component('components/Frame.svelte').functions(['dismissPreviews', 'startGlobalPreview', 'cleanupGlobalPreview'])
    const api = new Function('data', 'setTimeout', 'clearTimeout', 'console', `
        let hoveredLink = { href: 'https://example.com/' }, tabId = 'opener', previewGeneration = 0
        let globalHoverPreviewTimeout = null, hidePreviewDelayTimeout = null, previewShowTimeout = null
        let previewCleanupTimeout = null, previewSwitchTimeout = null
        let globalHoverPreview = null, globalHoverPreviewTabId = null, globalHoverPreviewTab = null
        let globalHoverPreviewVisible = false, globalHoverPreviewShown = false
        let globalHoverPreviewPinned = false, globalHoverPreviewExpanding = false, isHoveringPreview = false
        ${functions}
        return {
            start: startGlobalPreview, dismiss: dismissPreviews,
            pin() { globalHoverPreviewPinned = true; isHoveringPreview = true },
            get visible() { return globalHoverPreviewVisible || globalHoverPreviewShown || !!hoveredLink || !!globalHoverPreviewTabId }
        }
    `)(data, timers.setTimeout, timers.clearTimeout, { log() {} })
    return { api, timers, resolve() { resolveTab({ id: 'preview' }) } }
}

Deno.test('view changes cancel pending link previews and pinned previews', () => {
    for (const pinned of [false, true]) {
        const h = frameHarness()
        if (pinned) h.api.pin()
        h.api.start()
        h.api.dismiss()
        h.timers.run()
        assert.equal(h.api.visible, false)
        assert.equal(h.timers.timers.size, 0)
    }
})

Deno.test('an async preview creation cannot reopen after switching views', async () => {
    const h = frameHarness()
    h.api.start()
    h.timers.run()
    h.api.dismiss()
    h.resolve()
    await Promise.resolve()
    h.timers.run()
    assert.equal(h.api.visible, false)
    assert.equal(h.timers.timers.size, 0)
})

Deno.test('view changes cancel the delayed fade-in of an already created preview', async () => {
    const h = frameHarness()
    h.api.start()
    h.timers.run()
    h.resolve()
    await Promise.resolve()
    assert.equal(h.api.visible, true)
    h.api.dismiss()
    h.timers.run()
    assert.equal(h.api.visible, false)
    assert.equal(h.timers.timers.size, 0)
})

Deno.test('switching away from grid view closes an expanded group and cancels scrubbing', () => {
    let dismissed = false
    let closed = false
    const preview = { dismiss() { dismissed = true } }
    const dialog = { open: true, close() { this.open = false; closed = true } }
    const functions = component('components/GridTabStack.svelte').functions(['dismissOverlays'])
    const reset = new Function('preview', 'dialog', `
        let keyboardIndex = 4
        ${functions}
        dismissOverlays()
        return keyboardIndex
    `)(preview, dialog)
    assert.equal(dismissed, true)
    assert.equal(closed, true)
    assert.equal(reset, null)
})

Deno.test('switching views clears completion menus and aborts in-flight suggestions', () => {
    const controller = new AbortController()
    const timers = clock()
    const functions = component('components/NewTab.svelte').functions(['dismissCompletions'])
    const state = new Function('controller', 'setTimeout', 'clearTimeout', `
        let currentAbortController = controller, completions = ['suggestion'], selectedCompletionIndex = 0
        let isGeneratingCompletions = true
        let completionTimeout = setTimeout(() => { completions = ['stale suggestion'] }, 500)
        ${functions}
        dismissCompletions()
        return { completions, selectedCompletionIndex, isGeneratingCompletions, currentAbortController }
    `)(controller, timers.setTimeout, timers.clearTimeout)
    assert.equal(controller.signal.aborted, true)
    assert.equal(timers.timers.size, 0)
    assert.deepEqual(state, { completions: [], selectedCompletionIndex: -1, isGeneratingCompletions: false, currentAbortController: null })
})

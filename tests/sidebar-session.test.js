import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'

const source = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
const functions = parse(source).instance.content.body
    .filter(node => node.type === 'FunctionDeclaration' && [
        'getSidebarPreference', 'persistSidebarPreference', 'loadSidebarPreferences',
        'persistOpenSidebars', 'toggleTabSidebar', 'stopResizeLeft', 'stopResizeRight',
        'stopResizeSidebar', 'stopResizeTabSidebar'
    ].includes(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n')

function session(storage, id) {
    const identity = Promise.withResolvers()
    const window = { darcWindowId: null, darcWindowIdPromise: identity.promise }
    const reads = []
    const api = new Function('window', 'localStorage', 'document', 'console', `
        let openSidebars = new Set(), sidebarStateLoaded = false, invisiblePins = {}
        let customLeftPinnedWidth = null, customRightPinnedWidth = null
        let customRightSidebarWidth = null, customTabSidebarWidth = null, tabSidebarVisible = false
        let isResizingLeft = false, isResizingRight = false, isResizingSidebar = false, isResizingTabSidebar = false
        let resizeAnimationFrame = null, resizeStartWidth = 0, visibleFrameDuringResize = null
        let tabSidebarHasDragged = true, tabSidebarResizeStartTime = 0
        function handleResizeLeft() {}
        function handleResizeRight() {}
        function handleResizeSidebar() {}
        function handleResizeTabSidebar() {}
        ${functions}
        return {
            load: loadSidebarPreferences,
            save: persistSidebarPreference,
            toggle: toggleTabSidebar,
            layout(sidebars, widths) {
                openSidebars = new Set(sidebars)
                persistOpenSidebars()
                ;[customLeftPinnedWidth, customRightPinnedWidth, customRightSidebarWidth, customTabSidebarWidth] = widths
                stopResizeLeft()
                stopResizeRight()
                stopResizeSidebar()
                stopResizeTabSidebar()
            },
            get state() {
                return { loaded: sidebarStateLoaded, open: [...openSidebars], hidden: invisiblePins,
                    visible: tabSidebarVisible,
                    widths: [customLeftPinnedWidth, customRightPinnedWidth, customRightSidebarWidth, customTabSidebarWidth] }
            }
        }
    `)(window, {
        getItem(key) { reads.push(key); return storage.get(key) ?? null },
        setItem(key, value) { storage.set(key, value) }
    }, { removeEventListener() {} }, { log() {}, warn() {} })
    const assign = () => { window.darcWindowId = id; identity.resolve(id) }
    return { api, reads, assign }
}

Deno.test('sidebar restoration waits for the virtual window identity and never writes defaults before loading', async () => {
    const storage = new Map([
        ['tabSidebarVisible:window-1', 'true'],
        ['customTabSidebarWidth:window-1', '345']
    ])
    const h = session(storage, 'window-1')
    const loading = h.api.load()
    h.api.save('tabSidebarVisible', 'false')
    assert.equal(h.api.state.loaded, false)
    assert.deepEqual(h.reads, [])
    h.assign()
    h.api.save('tabSidebarVisible', 'false')
    await loading
    assert.equal(h.api.state.loaded, true)
    assert.equal(h.api.state.visible, true)
    assert.equal(h.api.state.widths[3], 345)
    assert.ok(h.reads.every(key => key.endsWith(':window-1')))
    assert.equal(storage.size, 2)
})

Deno.test('sidebar open states, pin visibility and all widths survive reload independently for each window', async () => {
    const storage = new Map()
    for (const [id, open, widths, visible, hidden] of [
        ['left', ['settings', 'activity'], [210, 220, 330, 280], true, { 'pin-a': true }],
        ['right', ['resources'], [310, 320, 430, 380], false, { 'pin-b': true }]
    ]) {
        const h = session(storage, id)
        h.assign()
        await h.api.load()
        h.api.layout(open, widths)
        if (visible) h.api.toggle()
        h.api.save('invisiblePins', JSON.stringify(hidden))
    }
    for (const [id, open, widths, visible, hidden] of [
        ['left', ['settings', 'activity'], [210, 220, 330, 280], true, { 'pin-a': true }],
        ['right', ['resources'], [310, 320, 430, 380], false, { 'pin-b': true }]
    ]) {
        const restored = session(storage, id)
        restored.assign()
        await restored.api.load()
        assert.deepEqual(restored.api.state, { loaded: true, open, widths, visible, hidden })
    }
    assert.ok([...storage.keys()].every(key => key.endsWith(':left') || key.endsWith(':right')))
})

Deno.test('new virtual windows use defaults instead of another window or legacy shared sidebar preferences', async () => {
    const storage = new Map([
        ['openSidebars', '["settings"]'], ['tabSidebarVisible', 'true'],
        ['customTabSidebarWidth', '550'], ['invisiblePins', '{"pin":true}'],
        ['openSidebars:existing', '["resources"]'], ['customRightSidebarWidth:existing', '450']
    ])
    const h = session(storage, 'new')
    h.assign()
    await h.api.load()
    assert.deepEqual(h.api.state, {
        loaded: true, open: [], hidden: {}, visible: false, widths: [null, null, null, null]
    })
    assert.equal(storage.size, 6)
})

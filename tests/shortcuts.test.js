import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { shortcuts, getShortcutHelp, shortcutActionIds, createShortcutMatcher, createShortcutHandler, listenForShortcutHelpCancellation, getFrameShortcutScript } from '../app/lib/shortcuts.js'
import { createShortcutActions, getShortcutTab } from '../app/lib/shortcut-actions.js'

const mac = createShortcutMatcher(shortcuts, true)
const windows = createShortcutMatcher(shortcuts, false)
const key = (key, modifiers = {}) => ({ key, ...modifiers })
const cmd = (key, modifiers = {}) => ({ key, metaKey: true, ...modifiers })

Deno.test('shortcuts distinguish every requested command and reject extra modifiers', () => {
    for (const [event, expected] of [
        [cmd('l'), 'open-location'], [cmd('w'), 'close-tab'], [cmd('R'), 'reload-tab'],
        [cmd('T', { shiftKey: true }), 'restore-tab'], [cmd('t'), 'new-tab'],
        [cmd('0'), 'reset-zoom'],
        [key('Tab', { ctrlKey: true }), 'previous-active-tab'],
        [cmd('ArrowLeft', { altKey: true }), 'previous-tab'],
        [cmd('ArrowRight', { altKey: true }), 'next-tab'],
        [cmd('ArrowLeft', { altKey: true, shiftKey: true }), 'pin-left'],
        [cmd('ArrowRight', { altKey: true, shiftKey: true }), 'pin-right'],
        [key('Escape'), 'escape'], [key('F5'), 'reload-tab'], [key('F18'), 'overview']
    ]) assert.equal(mac(event)?.id, expected)
    for (const event of [key('l'), cmd('w', { altKey: true }), cmd('r', { shiftKey: true }), cmd('w', { ctrlKey: true }), cmd('Tab')]) {
        assert.equal(mac(event), null)
    }
    assert.equal(windows(key('l', { ctrlKey: true }))?.id, 'open-location')
    assert.equal(windows(cmd('l')), null)
    assert.equal(mac(key('l', { ctrlKey: true })), null)
})

Deno.test('space shortcuts map 1 through 9 and reserve 0 for zoom reset, including non-Latin layouts', () => {
    for (let n = 1; n <= 9; n++) {
        assert.equal(mac(cmd(String(n)))?.id, `space-${n}`)
        assert.equal(mac(cmd('different-layout', { code: `Digit${n}` }))?.id, `space-${n}`)
    }
    assert.equal(mac(cmd('0'))?.id, 'reset-zoom')
    assert.equal(mac(cmd('different-layout', { code: 'Digit0' }))?.id, 'reset-zoom')
    assert.equal(mac(cmd('д', { code: 'KeyL' }))?.id, 'open-location')
    assert.equal(mac(cmd('l', { isComposing: true })), null)
    assert.equal(mac(cmd('l', { keyCode: 229 })), null)
    assert.equal(windows(key('l', { ctrlKey: true, getModifierState: name => name === 'AltGraph' })), null)
})

function dispatch(handler, properties) {
    const event = {
        ...properties, prevented: false, stopped: false,
        preventDefault() { this.prevented = true },
        stopPropagation() { this.stopped = true },
        stopImmediatePropagation() { this.stopped = true }
    }
    handler(event)
    return event
}

function holdHarness(matcher = mac) {
    let now = 0, nextId = 0
    const timers = new Map(), calls = []
    const handler = createShortcutHandler(matcher, id => calls.push(id), {
        schedule(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id },
        cancel(id) { timers.delete(id) }
    })
    return {
        handler, calls, timers,
        down: event => dispatch(handler, event),
        up: event => handler.keyup(event),
        advance(ms) {
            const end = now + ms
            while (true) {
                const next = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= end)
                if (!next) break
                now = next[1].at
                timers.delete(next[0])
                next[1].fn()
            }
            now = end
        }
    }
}

Deno.test('a quick Cmd+T opens one tab in the current group on release', () => {
    const h = holdHarness()
    assert.equal(h.down(cmd('t')).prevented, true)
    h.advance(649)
    assert.deepEqual(h.calls, [])
    h.up(cmd('t'))
    h.advance(2000)
    assert.deepEqual(h.calls, ['new-tab'])
    assert.equal(h.timers.size, 0)
})

Deno.test('holding Cmd+T opens only a new group and ignores repeats until release', () => {
    const h = holdHarness()
    h.down(cmd('Meta'))
    h.down(cmd('t'))
    h.advance(650)
    for (let n = 0; n < 10; n++) h.down(cmd('t', { repeat: true }))
    h.advance(3000)
    h.up(cmd('t'))
    h.up(key('Meta'))
    assert.deepEqual(h.calls, ['new-tab-group'])
    h.down(cmd('t'))
    h.up(cmd('t'))
    assert.deepEqual(h.calls, ['new-tab-group', 'new-tab'])
})

Deno.test('modifier release finishes a quick Cmd+T when macOS omits letter keyup', () => {
    const h = holdHarness()
    h.down(cmd('Meta'))
    h.down(cmd('t'))
    h.advance(100)
    h.up(key('Meta'))
    h.advance(1000)
    assert.deepEqual(h.calls, ['new-tab'])
})

Deno.test('holding Command or Control alone reveals help at two seconds and release dismisses it', () => {
    for (const event of [cmd('Meta'), key('Control', { ctrlKey: true })]) {
        const h = holdHarness()
        h.down(event)
        h.advance(1999)
        assert.deepEqual(h.calls, [])
        h.down({ ...event, repeat: true })
        h.advance(1)
        assert.deepEqual(h.calls, ['show-shortcuts'])
        h.up(key(event.key))
        assert.deepEqual(h.calls, ['show-shortcuts', 'hide-shortcuts'])
    }
})

Deno.test('normal shortcuts and typing cancel modifier help, and Escape only dismisses the help overlay', () => {
    const h = holdHarness()
    h.down(cmd('Meta'))
    h.advance(1000)
    h.down(cmd('l'))
    h.advance(3000)
    assert.deepEqual(h.calls, ['open-location'])
    h.up(key('Meta'))
    h.down(cmd('Meta'))
    h.advance(2000)
    h.down(key('Escape'))
    assert.deepEqual(h.calls, ['open-location', 'show-shortcuts', 'hide-shortcuts'])
    h.up(key('Meta'))
    h.down(key('Control', { ctrlKey: true }))
    h.down(key('a', { ctrlKey: true }))
    h.advance(3000)
    assert.equal(h.calls.filter(id => id === 'show-shortcuts').length, 1)
})

Deno.test('every pointer, scroll and preview action aborts help until the modifier is released', () => {
    for (const modifier of [cmd('Meta'), key('Control', { ctrlKey: true })]) {
        for (const type of ['pointerdown', 'mousedown', 'click', 'auxclick', 'contextmenu', 'wheel', 'scroll', 'touchstart', 'touchmove',
            'darc-controlled-frame-mousedown', 'darc-controlled-frame-click', 'darc-link-preview']) {
            for (const alreadyVisible of [false, true]) {
                const h = holdHarness()
                const target = new EventTarget()
                const cleanup = listenForShortcutHelpCancellation(target, h.handler.cancelHelp)
                h.down(modifier)
                h.advance(alreadyVisible ? 2000 : 1000)
                target.dispatchEvent(new Event(type))
                h.down({ ...modifier, repeat: true })
                h.down(modifier)
                h.advance(10000)
                assert.deepEqual(h.calls, alreadyVisible ? ['show-shortcuts', 'hide-shortcuts'] : [], type)
                h.up(key(modifier.key))
                h.down(modifier)
                h.advance(2000)
                assert.equal(h.calls.at(-1), 'show-shortcuts', `${type}: a fresh hold works`)
                cleanup()
                target.dispatchEvent(new Event(type))
                assert.equal(h.calls.at(-1), 'show-shortcuts', `${type}: cleanup removes the listener`)
                h.handler.reset()
            }
        }
    }
})

Deno.test('other keys before or during the hold prevent help even after that key is released', () => {
    for (const other of ['a', 'Shift', 'Alt', 'Control']) {
        const h = holdHarness()
        h.down(cmd('Meta'))
        h.advance(1000)
        h.down(cmd(other, { ctrlKey: other === 'Control' }))
        h.up(cmd(other))
        h.down(cmd('Meta', { repeat: true }))
        h.advance(10000)
        assert.deepEqual(h.calls, [], other)
        h.up(key('Meta'))
        h.down(cmd('Meta'))
        h.advance(2000)
        assert.deepEqual(h.calls, ['show-shortcuts'])
    }
    const h = holdHarness()
    h.down(key('a'))
    h.down(cmd('Meta'))
    h.up(cmd('a'))
    h.advance(10000)
    assert.deepEqual(h.calls, [])
    h.up(key('Meta'))
    h.down(cmd('Meta'))
    h.advance(2000)
    assert.deepEqual(h.calls, ['show-shortcuts'])
})

Deno.test('ordinary pointer activity before a modifier hold does not disable help', () => {
    const h = holdHarness()
    h.handler.cancelHelp()
    h.down(cmd('Meta'))
    h.advance(2000)
    assert.deepEqual(h.calls, ['show-shortcuts'])
})

Deno.test('blur and cleanup cancel pending tabs and modifier timers without opening anything', () => {
    for (const keys of [[cmd('Meta')], [cmd('Meta'), cmd('t')]]) {
        const h = holdHarness()
        keys.forEach(h.down)
        h.handler.reset()
        h.advance(4000)
        assert.deepEqual(h.calls, [])
        assert.equal(h.timers.size, 0)
    }
})

Deno.test('Ctrl+T on Windows supports quick tabs and held groups too', () => {
    const h = holdHarness(windows)
    h.down(key('t', { ctrlKey: true }))
    h.up(key('t', { ctrlKey: true }))
    h.down(key('t', { ctrlKey: true }))
    h.advance(650)
    h.up(key('Control'))
    assert.deepEqual(h.calls, ['new-tab', 'new-tab-group'])
})

Deno.test('the reference sheet derives platform keys and hold actions from the binding registry', () => {
    const macHelp = getShortcutHelp(true).flatMap(group => group.items)
    const winHelp = getShortcutHelp(false).flatMap(group => group.items)
    assert.equal(macHelp.find(item => item.id === 'new-tab-group').hold, true)
    assert.deepEqual(macHelp.find(item => item.id === 'new-tab-group').keys, ['⌘', 'T'])
    assert.deepEqual(winHelp.find(item => item.id === 'pin-left').keys, ['Ctrl', 'Alt', 'Shift', '←'])
    assert.deepEqual(macHelp.find(item => item.id === 'space-1').keys, ['⌘', '1–9'])
    for (const item of macHelp) assert.equal(shortcutActionIds.has(item.id), true)
})

Deno.test('repeat never closes, restores, or pins multiple tabs; navigation can repeat', () => {
    const calls = []
    const handler = createShortcutHandler(mac, id => calls.push(id))
    for (const event of [cmd('w'), cmd('T', { shiftKey: true }), cmd('ArrowLeft', { altKey: true, shiftKey: true })]) {
        assert.equal(dispatch(handler, { ...event, repeat: true }).prevented, true)
    }
    dispatch(handler, key('Tab', { ctrlKey: true, repeat: true }))
    assert.deepEqual(calls, ['previous-active-tab'])
    assert.equal(dispatch(handler, key('a')).prevented, false)
    assert.equal(dispatch(createShortcutHandler(mac, () => false), key('Escape')).prevented, false)
})

function harness() {
    const calls = []
    const tab = (id, properties = {}) => ({ id, type: 'tab', spaceId: 's1', ...properties })
    const docs = Object.fromEntries(['a', 'b', 'c'].map(id => [id, tab(id)]))
    const spaces = Object.fromEntries(Array.from({ length: 10 }, (_, n) => [`s${n + 1}`, { tabs: [], activeTabsOrder: [] }]))
    spaces.s1.tabs = Object.values(docs)
    const data = {
        docs, spaces, previews: {}, frames: {},
        spaceMeta: { activeTabId: 'b', activeSpace: 's1', spaceOrder: Object.keys(spaces), closedTabs: [] },
        activateSpace(id) { this.spaceMeta.activeSpace = id; calls.push(['space', id]) },
        previous() { calls.push(['history']) },
        pin(options) { calls.push(['pin', options]) },
        reloadTab(id) { calls.push(['reload', id]) },
        closeTab(space, id) { calls.push(['close-lightbox', space, id]) },
        restoreClosedTab(id) { calls.push(['restore', id]) }
    }
    const ui = {
        openNewTab: () => calls.push(['new']),
        openNewTabGroup: () => calls.push(['new-group']),
        showShortcuts: visible => calls.push(['help', visible]),
        openLocation: tab => calls.push(['location', tab.id]),
        closeTab: tab => calls.push(['close', tab.id]),
        dismissHovercards() {},
        activateTab(tab) { data.spaceMeta.activeTabId = tab.id; calls.push(['activate', tab.id]) },
        getTabs: () => spaces.s1.tabs,
        escape: () => false,
        focusTab: id => calls.push(['focus', id]),
        showOverview: () => calls.push(['overview'])
    }
    return { data, ui, calls, run: createShortcutActions(data, ui), tab }
}

Deno.test('Ctrl+Tab uses the exact same history operation as clicking the active tab', () => {
    const h = harness()
    h.run('previous-active-tab')
    h.run('previous-active-tab')
    assert.deepEqual(h.calls, [['history'], ['history']])
})

Deno.test('hold actions create a separate group and toggle the reference sheet', () => {
    const h = harness()
    h.run('new-tab-group')
    h.run('show-shortcuts')
    h.run('hide-shortcuts')
    assert.deepEqual(h.calls, [['new-group'], ['help', true], ['help', false]])
})

Deno.test('the app creates a separate group for a hold and uses current-group creation for quick tabs', () => {
    const source = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
    const node = parse(source).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'openNewTab')
    const calls = []
    const openNewTab = new Function('data', `
        let isChangingTabs = false, newTabMenuVisible = false, newTabMenuHoverTimeout = null
        const setTimeout = () => {}, collapseAndRemovePlaceholders = () => {}, checkTabListOverflow = () => {}
        ${source.slice(node.start, node.end)}
        return openNewTab
    `)({
        spaceMeta: { activeSpace: 'space' },
        newTab: (space, options) => calls.push(['group', space, options]),
        newGroupTab: (space, options) => calls.push(['tab', space, options])
    })
    openNewTab()
    openNewTab(true)
    assert.deepEqual(calls, [['tab', 'space', { shouldFocus: true }], ['group', 'space', { shouldFocus: true }]])
})

Deno.test('previous/next follow displayed tab order and wrap at either end', () => {
    const h = harness()
    h.run('next-tab')
    h.run('next-tab')
    h.run('previous-tab')
    assert.deepEqual(h.calls, [['activate', 'c'], ['activate', 'a'], ['activate', 'c']])
})

Deno.test('numbered space selection restores its last valid ordinary tab, including ninth space', () => {
    const h = harness()
    const older = h.tab('older', { spaceId: 's9' }), recent = h.tab('recent', { spaceId: 's9' })
    h.data.spaces.s9 = { tabs: [older, recent], activeTabsOrder: ['closed', { id: 'recent' }, 'older'] }
    h.run('space-9')
    assert.deepEqual(h.calls, [['space', 's9'], ['activate', 'recent']])
    h.run('space-11')
    assert.equal(h.calls.length, 2)
})

Deno.test('Cmd+0 resets the targeted frame to 100% without changing spaces', () => {
    const h = harness()
    h.data.frames.b = { frame: { setZoom: zoom => { h.calls.push(['zoom', 'b', zoom]); return Promise.resolve() } } }
    h.data.frames.a = { frame: { setZoom: zoom => { h.calls.push(['zoom', 'a', zoom]); return Promise.resolve() } } }
    h.run('reset-zoom')
    h.run('reset-zoom', null, 'a')
    assert.deepEqual(h.calls, [['zoom', 'b', 1], ['zoom', 'a', 1]])
    assert.equal(h.data.spaceMeta.activeSpace, 's1')
})

Deno.test('location, reload and close target the focused frame or its innermost lightbox', () => {
    const h = harness()
    h.data.docs.lb = h.tab('lb', { lightbox: true, opener: 'b' })
    h.data.docs.nested = h.tab('nested', { lightbox: true, opener: 'lb' })
    h.data.previews.b = { lightbox: 'lb' }
    h.data.previews.lb = { lightbox: 'nested' }
    assert.equal(getShortcutTab(h.data).id, 'nested')
    h.run('open-location')
    h.run('reload-tab')
    h.run('close-tab')
    assert.equal(h.data.previews.lb.lightbox, null)
    assert.deepEqual(h.calls, [['location', 'nested'], ['reload', 'nested'], ['close-lightbox', 's1', 'nested'], ['focus', 'lb']])
    h.calls.length = 0
    h.run('reload-tab', null, 'a')
    h.run('close-tab', null, 'a')
    assert.deepEqual(h.calls, [['reload', 'a'], ['close', 'a']])
})

Deno.test('Escape closes the lightbox, restores parent focus, and leaves ordinary pages alone', () => {
    const h = harness()
    assert.equal(h.run('escape'), false)
    h.data.docs.lb = h.tab('lb', { lightbox: true, opener: 'b' })
    h.data.previews.b = { lightbox: 'lb' }
    h.ui.escape = () => true
    h.run('escape')
    assert.equal(h.calls.length, 0, 'UI overlays get first chance at Escape')
    h.ui.escape = () => false
    assert.equal(h.run('escape'), true)
    assert.deepEqual(h.calls, [['close-lightbox', 's1', 'lb'], ['focus', 'b']])
    assert.equal(h.run('escape'), false)
})

Deno.test('reopen skips deleted tabs and pin commands select the requested side', () => {
    const h = harness()
    h.data.spaceMeta.closedTabs = [h.tab('deleted', { deleted: true }), h.tab('missing', { spaceId: 'gone' }), h.tab('last-closed')]
    h.run('restore-tab')
    h.run('pin-left')
    h.run('pin-right')
    assert.deepEqual(h.calls, [['restore', 'last-closed'], ['pin', { tabId: 'b', pinned: 'left' }], ['pin', { tabId: 'b', pinned: 'right' }]])
})

Deno.test('serialized frame matcher forwards once, preserves colon-containing IDs, and leaves plain Escape available', () => {
    const listeners = new Map(), messages = []
    new Function('window', 'console', getFrameShortcutScript('darc:tab:frame'))(
        { addEventListener(type, handler) { const list = listeners.get(type) || []; list.push(handler); listeners.set(type, list) } },
        { log(message) { if (message.startsWith('iwa:shortcut:')) messages.push(JSON.parse(message.slice('iwa:shortcut:'.length))) } }
    )
    const down = event => { event.isTrusted = true; for (const listener of listeners.get('keydown')) listener(event) }
    // getFrameShortcutScript uses this host's platform; exercise that binding.
    const modifier = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }
    assert.equal(dispatch(down, key('l', modifier)).prevented, true)
    assert.equal(dispatch(down, key('w', { ...modifier, repeat: true })).prevented, true)
    assert.equal(dispatch(down, key('Escape')).prevented, false)
    assert.deepEqual(messages, [{ id: 'open-location', tabId: 'darc:tab:frame' }, { id: 'escape', tabId: 'darc:tab:frame' }])
})

Deno.test('Cmd+L opens the current hovercard and focuses it again on repeated invocation', async () => {
    const source = Deno.readTextFileSync(new URL('../app/App.svelte', import.meta.url))
    const node = parse(source).instance.content.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'openTabLocation')
    const calls = []
    const open = new Function('window', 'document', 'tick', 'hovercardComponent', `
        let hoveredTab = null, hovercardPosition = {}, hovercardShowTime = null, hovercardUrlBarExpanded = false
        const tabButtons = {}
        ${source.slice(node.start, node.end)}
        return { openTabLocation, read: () => ({ tab: hoveredTab, expanded: hovercardUrlBarExpanded }) }
    `)({ innerWidth: 1200, innerHeight: 800, dispatchEvent() {} }, { querySelector: () => null }, () => Promise.resolve(), { focusLocation: () => calls.push('focus') })
    const tab = { id: 'current' }
    await open.openTabLocation(tab)
    await open.openTabLocation(tab)
    assert.deepEqual(open.read(), { tab, expanded: true })
    assert.deepEqual(calls, ['focus', 'focus'])
})

import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'

function components (path, name) {
    const source = Deno.readTextFileSync(new URL(path, import.meta.url))
    const found = []
    function visit (node) {
        if (!node || typeof node !== 'object') {
            return
        }
        if (node.type === 'InlineComponent' && node.name === name) {
            found.push(Object.fromEntries(node.attributes.filter(attr => attr.type === 'Attribute').map(attr => [
                attr.name, attr.value[0]?.expression ? source.slice(attr.value[0].expression.start, attr.value[0].expression.end) : null
            ])))
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                value.forEach(visit)
            } else {
                visit(value)
            }
        }
    }
    visit(parse(source).html)
    return found
}

Deno.test('navigation controls switch between reload and stop with the target tab loading state', () => {
    const source = Deno.readTextFileSync(new URL('../app/components/TabActionButtons.svelte', import.meta.url))
    const actions = parse(source).instance.content.body
        .flatMap(node => node.declarations || []).find(node => node.id.name === 'actions').init.arguments[0]
    const calls = []
    const readActions = new Function('loading', 'onReload', 'onStop', `
        const isClosedTab = false, showDevTools = false, showSettingsButton = false
        const showCloseButton = false, copyUrlSuccess = false, onGoBack = null, onGoForward = null, onCopyUrl = null
        return ${source.slice(actions.start, actions.end)}
    `)
    const reload = () => calls.push('reload')
    const stop = () => calls.push('stop')
    const idle = readActions(false, reload, stop)[2]
    const loading = readActions(true, reload, stop)[2]
    assert.equal(idle.label, 'Reload')
    assert.equal(loading.label, 'Stop')
    assert.notEqual(idle.path, loading.path)
    idle.run()
    loading.run()
    readActions(false, reload, stop)[2].run()
    assert.deepEqual(calls, ['reload', 'stop', 'reload'])
})

Deno.test('URL bars and tab menus stop their displayed tab without triggering reload', () => {
    for (const path of ['../app/components/UrlBar.svelte', '../app/components/TabContextMenu.svelte']) {
        const actions = components(path, 'TabActionButtons')[0]
        const calls = []
        const tab = { id: 'preview' }
        const data = { frames: { preview: { loading: true }, unrelated: { loading: false } }, stopTab: id => calls.push(id) }
        const read = new Function('data', 'tabId', 'menu', 'runTabAction', `
            return { loading: ${actions.loading}, stop: ${actions.onStop} }
        `)
        const controls = read(data, tab.id, { tab }, action => action(tab))
        assert.equal(controls.loading, true)
        controls.stop()
        assert.deepEqual(calls, ['preview'])
        data.frames.preview.loading = false
        assert.equal(read(data, tab.id, { tab }, action => action(tab)).loading, false)
    }
})

Deno.test('URL bar reload supports lightboxes without a custom callback', () => {
    const actions = components('../app/components/UrlBar.svelte', 'TabActionButtons')[0]
    const calls = []
    const create = new Function('data', 'tabId', 'onReload', `return ${actions.onReload}`)
    const data = { reloadTab: id => calls.push(id) }
    create(data, 'lightbox', null)()
    create(data, 'preview', () => calls.push('custom'))()
    assert.deepEqual(calls, ['lightbox', 'custom'])
})

Deno.test('all top and sidebar hovercards wire settings and developer tools to their target', async () => {
    const cards = [
        ...components('../app/App.svelte', 'TabHoverCard'),
        ...components('../app/components/TabSidebar.svelte', 'TabHoverCard')
    ]
    assert.equal(cards.length, 3)
    for (const card of cards) {
        const calls = []
        const tab = { id: 'preview', spaceId: 'other-space' }
        const data = { spaceMeta: { activeTabId: 'unrelated' } }
        const handlers = new Function('data', 'hoveredTab', 'activeTab', 'previewTab', 'openTabDevTools', 'switchToSettings', 'onSettings', `
            return { devtools: ${card.onDevTools}, settings: ${card.onSettings} }
        `)(data, tab, tab, tab, (store, id) => calls.push(['devtools', store === data, id]), () => calls.push(['settings']), () => calls.push(['settings']))
        await handlers.devtools()
        handlers.settings()
        assert.deepEqual(calls, [['devtools', true, 'preview'], ['settings']])
    }
    const sidebar = components('../app/App.svelte', 'TabSidebar')[0]
    assert.equal(sidebar.onSettings, 'switchToSettings')
})

Deno.test('top hovercard reload keeps its original target when activation dismisses the preview', () => {
    const card = components('../app/App.svelte', 'TabHoverCard')[0]
    const calls = []
    const timers = []
    const run = new Function('calls', 'timers', `
        let hoveredTab = { id: 'preview' }
        const data = {
            spaceMeta: { activeTabId: 'unrelated' },
            activate(id) { calls.push(['activate', id]); hoveredTab = null },
            reloadTab(id) { calls.push(['reload', id]) }
        }
        const setTimeout = callback => timers.push(callback)
        return ${card.onReload}
    `)(calls, timers)
    run()
    timers.forEach(callback => callback())
    assert.deepEqual(calls, [['activate', 'preview'], ['reload', 'preview']])
})

Deno.test('navigation hovercard actions address the displayed tab directly', () => {
    const card = components('../app/App.svelte', 'TabHoverCard')[1]
    const calls = []
    const handlers = new Function('activeTab', 'navigateTabHistory', 'data', `
        return { back: ${card.onGoBack}, forward: ${card.onGoForward}, reload: ${card.onReload} }
    `)({ id: 'preview' }, (id, direction) => calls.push([direction, id]), { reloadTab: id => calls.push(['reload', id]) })
    handlers.back()
    handlers.forward()
    handlers.reload()
    assert.deepEqual(calls, [['back', 'preview'], ['forward', 'preview'], ['reload', 'preview']])
})

import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { getFrameShortcutScript } from '../app/lib/shortcuts.js'
import { registerFrameWrapper } from '../app/lib/frame-lifecycle.js'

const source = Deno.readTextFileSync(new URL('../app/components/ControlledFrame.svelte', import.meta.url))
const names = ['createControlledFrame', 'releaseControlledFrame', 'detach', 'closeOAuthPopup', 'appendPopupFrame', 'setupContentScripts', 'handleAudioStateChanged']
const functions = parse(source).instance.content.body
    .filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id.name))
    .map(node => source.slice(node.start, node.end)).join('\n')
const destroyCallback = parse(source).instance.content.body
    .find(node => node.type === 'ExpressionStatement' && node.expression.callee?.name === 'onDestroy').expression.arguments[0]
const destroySource = source.slice(destroyCallback.start, destroyCallback.end)

function harness() {
    const events = []
    const tab = { id: 'page', _id: 'page', url: 'https://example.com/', title: 'Example', favicon: 'icon' }
    const data = { docs: { page: tab }, frames: { page: {} } }
    const wrapper = {
        isConnected: true,
        querySelector() { return frame.parentNode === wrapper ? frame : null },
        removeChild(node) { events.push('remove'); node.parentNode = null }
    }
    const background = {
        moveBefore(node) { node.parentNode = background },
        removeChild(node) { events.push('remove'); node.parentNode = null }
    }
    const document = {
        createElement() {
            let src = tab.url
            return {
                parentNode: wrapper,
                get src() { return src },
                set src(value) {
                    events.push(value)
                    src = value
                    this.onloadstart?.({ isTopLevel: true, url: value })
                    this.onloadstop?.()
                },
                remove() { this.parentNode?.removeChild(this) }
            }
        },
        getElementById(id) { return id === 'backgroundFrames' ? background : {} }
    }
    const api = new Function('data', 'tab', 'document', 'console', 'getFrameShortcutScript', `
        const tabId = tab.id
        let detached = false, oauthPopup = null
        let frameRegistration
        let linkPreviewTimeout = null
        const tick = () => Promise.resolve()
        const userMods = { css: [], js: [] }
        const ipc = '', select = '', zoomControl = '', contextMenu = ''
        const untrack = fn => fn()
        ${functions}
        return {
            createControlledFrame, detach, appendPopupFrame, closeOAuthPopup, setupContentScripts, handleAudioStateChanged,
            setPopup: frame => { oauthPopup = { frame } },
            setRegistration: registration => { frameRegistration = registration },
            destroy: ${destroySource},
            getPopup: () => oauthPopup,
            isDetached: () => detached
        }
    `)(data, tab, document, { log() {} }, getFrameShortcutScript)
    const frame = api.createControlledFrame()
    data.frames.page.frame = frame
    api.setRegistration(registerFrameWrapper(data, tab.id, wrapper, { parentNode: wrapper }, () => {}))
    return { ...api, tab, data, frame, events, wrapper, background }
}

Deno.test('closing a tab blanks its DOM instance even after the shared frame reference is cleared', () => {
    const h = harness()
    const originalTab = { ...h.tab }
    h.data.frames.page.frame = null
    h.frame.onloadstart = () => { h.tab.url = h.frame.src }
    h.frame.onloadstop = () => { h.tab.title = 'Blank'; h.tab.favicon = null }
    const queuedAbort = () => { throw new Error('A queued callback must be cancelled') }
    queuedAbort.cancel = () => h.events.push('cancel')
    h.frame.onloadabort = queuedAbort

    h.detach(h.wrapper)
    h.wrapper.removeChild(h.frame)

    assert.deepEqual(h.events, ['cancel', 'about:blank', 'remove'])
    assert.deepEqual(h.tab, originalTab)
    assert.equal(h.frame.onloadabort, null)
    assert.equal(h.data.frames.page.frame, null)
})

Deno.test('audio events update the current document after metadata replaces the captured tab', () => {
    const h = harness()
    const currentTab = { ...h.tab }
    h.data.docs.page = currentTab
    h.handleAudioStateChanged(h.tab, { audible: true })
    assert.equal(currentTab.audioPlaying, true)
    assert.equal(h.tab.audioPlaying, undefined)
    h.handleAudioStateChanged(h.tab, { audible: false })
    assert.equal(currentTab.audioPlaying, false)
    delete h.data.docs.page
    assert.doesNotThrow(() => h.handleAudioStateChanged(h.tab, { audible: true }))
})

Deno.test('removing a transient tab blanks its frame before deleting the frame entry', () => {
    const h = harness()
    delete h.tab._id
    h.detach(h.wrapper)
    assert.deepEqual(h.events, ['about:blank'])
    assert.equal(h.data.frames.page, undefined)
})

Deno.test('parking a live frame preserves its page and handlers', () => {
    const h = harness()
    const onloadstop = () => {}
    h.frame.onloadstop = onloadstop
    h.detach(h.wrapper)

    assert.deepEqual(h.events, [])
    assert.equal(h.frame.src, h.tab.url)
    assert.equal(h.frame.onloadstop, onloadstop)
    assert.equal(h.frame.parentNode, h.background)
    assert.equal(h.isDetached(), true)
    assert.equal(h.data.frames.page.wrapper, undefined)
})

Deno.test('hibernating a parked frame blanks it before its native removal', () => {
    const h = harness()
    h.detach(h.wrapper)
    h.frame.remove()
    assert.deepEqual(h.events, ['about:blank', 'remove'])
    assert.equal(h.tab.url, 'https://example.com/')
    assert.equal(h.frame.parentNode, null)
})

Deno.test('an outgoing wrapper cannot park the frame or unregister its new owner', () => {
    const h = harness()
    const destination = { isConnected: true }
    const next = registerFrameWrapper(h.data, h.tab.id, destination, { parentNode: destination }, () => {})
    h.frame.parentNode = destination
    h.detach(h.wrapper)
    assert.equal(h.frame.parentNode, destination)
    assert.equal(h.data.frames.page.wrapper, destination)
    assert.equal(next.owns(), true)
    assert.deepEqual(h.events, [])
})

Deno.test('delayed component destruction cannot delete a newer owner of the same frame', async () => {
    const h = harness()
    const destroyed = h.destroy()
    const destination = { isConnected: true }
    const next = registerFrameWrapper(h.data, h.tab.id, destination, { parentNode: destination }, () => {})
    await destroyed
    assert.equal(h.data.frames.page.frame, h.frame)
    assert.equal(h.data.frames.page.wrapper, destination)
    assert.equal(next.owns(), true)
})

Deno.test('destroying the parked owner releases only its wrapper registration', async () => {
    const h = harness()
    h.detach(h.wrapper)
    await h.destroy()
    assert.equal(h.data.frames.page.frame, h.frame)
    assert.equal(h.data.frames.page.wrapper, undefined)
    assert.equal(h.data.frames.page.attach, undefined)
    assert.equal(h.frame.parentNode, h.background)
})

Deno.test('pending content script setup cannot reload a released frame', async () => {
    const h = harness()
    let finishInjection
    h.frame.addContentScripts = () => new Promise(resolve => { finishInjection = resolve })
    h.setupContentScripts(h.frame)
    h.frame.remove()
    finishInjection()
    await Promise.resolve()
    assert.deepEqual(h.events, ['about:blank', 'remove'])
    assert.equal(h.frame.src, 'about:blank')
})

Deno.test('both popup close and popup action cleanup blank the frame before removing it', () => {
    for (const closeDirectly of [true, false]) {
        const h = harness()
        if (closeDirectly) {
            h.setPopup(h.frame)
            h.closeOAuthPopup()
            assert.equal(h.getPopup(), null)
        } else {
            const container = { appendChild() {} }
            h.appendPopupFrame(container, h.frame).destroy()
        }
        assert.deepEqual(h.events, ['about:blank', 'remove'])
    }
})

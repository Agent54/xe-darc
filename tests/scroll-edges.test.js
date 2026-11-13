import assert from 'node:assert/strict'
import { compile } from 'svelte/compiler'

const actionSource = Deno.readTextFileSync(new URL('../app/lib/scroll-edges.js', import.meta.url))
    .replace('export function', 'function')

function scrollHarness () {
    const listeners = new Map()
    const microtasks = []
    let resize
    let disconnected = false
    const node = {
        parentElement: { dataset: {} }, scrollTop: 0, scrollHeight: 400, clientHeight: 204,
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: name => listeners.delete(name)
    }
    const observe = new Function('ResizeObserver', 'queueMicrotask', `${actionSource}\nreturn observeScrollEdges`)(
        function (callback) { resize = callback; this.observe = () => {}; this.disconnect = () => { disconnected = true } },
        callback => microtasks.push(callback)
    )
    const action = observe(node)
    return {
        node, action, listeners,
        edges: () => ({ ...node.parentElement.dataset }),
        scroll (top) { node.scrollTop = top; listeners.get('scroll')() },
        resize (height) { node.clientHeight = height; resize() },
        flush () { for (const callback of microtasks.splice(0)) callback() },
        disconnected: () => disconnected
    }
}

Deno.test('overflow fades follow the top, middle and bottom of an expanded group', () => {
    const h = scrollHarness()
    assert.deepEqual(h.edges(), { scrollTop: 'false', scrollBottom: 'true' })
    h.scroll(90)
    assert.deepEqual(h.edges(), { scrollTop: 'true', scrollBottom: 'true' })
    h.scroll(196)
    assert.deepEqual(h.edges(), { scrollTop: 'true', scrollBottom: 'false' })
    h.action.destroy()
    assert.equal(h.listeners.size, 0)
    assert.equal(h.disconnected(), true)
})

Deno.test('overflow fades update after expansion, resizing and adding or removing tabs', () => {
    const h = scrollHarness()
    h.node.scrollHeight = 180
    h.action.update()
    h.flush()
    assert.deepEqual(h.edges(), { scrollTop: 'false', scrollBottom: 'false' })
    h.node.scrollHeight = 400
    h.action.update()
    h.flush()
    assert.equal(h.edges().scrollBottom, 'true')
    h.resize(400)
    assert.equal(h.edges().scrollBottom, 'false')
    h.resize(204)
    assert.equal(h.edges().scrollBottom, 'true')
    h.action.destroy()
})

Deno.test('Svelte preserves both runtime-controlled group fade rules in production CSS', () => {
    const result = compile(Deno.readTextFileSync(new URL('../app/components/TabSidebar.svelte', import.meta.url)), {
        generate: 'client', dev: false, filename: 'app/components/TabSidebar.svelte'
    })
    const css = result.css.code.replace(/\/\*[\s\S]*?\*\//g, '')
    assert.match(css, /\.tab-group-scroll[^{}]*\[data-scroll-top=['"]true['"]\]::before/)
    assert.match(css, /\.tab-group-scroll[^{}]*\[data-scroll-bottom=['"]true['"]\]::after/)
    assert.equal(result.warnings.some(warning => warning.code === 'css_unused_selector' && warning.message.includes('data-scroll-')), false)
})

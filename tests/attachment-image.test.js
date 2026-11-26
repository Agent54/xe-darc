import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'

const source = Deno.readTextFileSync(new URL('../app/components/AttachmentImage.svelte', import.meta.url))
const script = parse(source).instance.content
const instance = source.slice(script.start, script.end).replace(/^\s*import .*$/gm, '')

function imageHarness(options = {}) {
    const images = []
    const effects = []
    const mounts = []
    const warnings = []
    const requests = []
    const image = {
        src: '', style: { display: 'none' }, complete: true,
        getAttribute(name) { return this[name] },
        addEventListener() {}, removeEventListener() {}
    }
    const loading = { style: { display: 'flex' } }
    const error = { style: { display: 'none' } }
    const container = { querySelector: selector => ({ '.attachment-image': image, '.attachment-loading': loading, '.attachment-error': error })[selector] }
    class PendingImage {
        constructor() {
            this.pending = Promise.withResolvers()
            images.push(this)
        }
        decode() { return this.pending.promise }
    }
    const data = {
        getAttachmentUrl(src, digest) {
            requests.push({ src, digest })
            return options.resolve ? options.resolve(src, digest) : Promise.resolve(`${src}:${digest}`)
        }
    }
    const api = new Function('data', 'Image', '$props', '$state', '$effect', 'onMount', 'displayedSet', 'requestAnimationFrame', 'console', `
        ${instance}
        return {
            bind(element) { containerEl = element },
            load: loadImage
        }
    `)(data, PendingImage, () => ({ src: 'initial', fadeIn: true }), value => value, effect => effects.push(effect), mount => mounts.push(mount), new Set(), callback => callback(), { warn: (...args) => warnings.push(args) })
    api.bind(container)
    const destroy = mounts[0]()
    return {
        ...api, image, loading, error, images, requests, warnings, destroy,
        flush: () => effects.forEach(effect => effect()),
        async decode(index = null) {
            await Promise.resolve()
            images[index ?? images.length - 1].pending.resolve()
        }
    }
}

Deno.test('screenshot updates keep the previous opaque image until the replacement is decoded', async () => {
    const h = imageHarness()
    const initial = h.load('screenshot', 'one')
    await h.decode()
    await initial
    assert.equal(h.image.src, 'screenshot:one')

    const replacement = h.load('screenshot', 'two')
    await Promise.resolve()
    assert.equal(h.image.src, 'screenshot:one')
    assert.equal(h.image.style.display, 'block')
    assert.equal(h.image.style.opacity, '1')
    assert.equal(h.loading.style.display, 'none')
    await h.decode()
    await replacement
    assert.equal(h.image.src, 'screenshot:two')
    assert.equal(h.image.style.opacity, '1')
})

Deno.test('out-of-order screenshot decodes cannot overwrite a newer digest at the same URL', async () => {
    const h = imageHarness()
    const older = h.load('attachment://tab/screenshot', 'old')
    await Promise.resolve()
    const newer = h.load('attachment://tab/screenshot', 'new')
    await h.decode()
    await newer
    await h.decode(0)
    await older
    assert.equal(h.image.src, 'attachment://tab/screenshot:new')
    assert.deepEqual(h.requests.map(request => request.digest), ['old', 'new'])
})

Deno.test('late attachment URL resolution cannot replace the latest history preview', async () => {
    const pending = Promise.withResolvers()
    const h = imageHarness({ resolve: src => src === 'old' ? pending.promise : Promise.resolve(src) })
    const older = h.load('old', 'one')
    const newer = h.load('new', 'two')
    await h.decode()
    await newer
    pending.resolve('old')
    await older
    assert.equal(h.image.src, 'new')
    assert.equal(h.images.length, 1)
})

Deno.test('revisiting a previously shown screenshot still waits for decoding', async () => {
    const h = imageHarness()
    for (const src of ['history-one', 'history-two']) {
        const load = h.load(src, 'digest')
        await h.decode()
        await load
    }
    const revisit = h.load('history-one', 'digest')
    await Promise.resolve()
    assert.equal(h.image.src, 'history-two:digest')
    await h.decode()
    await revisit
    assert.equal(h.image.src, 'history-one:digest')
})

Deno.test('failed screenshot updates retain the visible preview and initial failures show the fallback', async () => {
    const h = imageHarness()
    const initial = h.load('initial', 'one')
    await h.decode()
    await initial
    const replacement = h.load('replacement', 'two')
    await Promise.resolve()
    h.images.at(-1).pending.reject(new Error('Decode failed'))
    await replacement
    assert.equal(h.image.src, 'initial:one')
    assert.equal(h.image.style.display, 'block')
    assert.equal(h.error.style.display, 'none')

    const empty = imageHarness()
    const failure = empty.load('missing', 'one')
    await Promise.resolve()
    empty.images[0].pending.reject(new Error('Decode failed'))
    await failure
    assert.equal(empty.error.style.display, 'flex')
    assert.equal(empty.image.style.display, 'none')
})

Deno.test('mounting loads a screenshot once and dismissing its card cancels a pending decode', async () => {
    const h = imageHarness()
    h.flush()
    await Promise.resolve()
    assert.equal(h.requests.length, 1)
    h.destroy()
    await h.decode()
    await Promise.resolve()
    assert.equal(h.image.src, '')
})

import assert from 'node:assert/strict'
import puppeteer from 'puppeteer'

const mainSource = Deno.readTextFileSync(new URL('../app/main.js', import.meta.url))
const bootstrap = mainSource.slice(mainSource.indexOf('// Test Shared Worker'))
const helper = Deno.readTextFileSync(new URL('../app/lib/window-session.js', import.meta.url))
const worker = Deno.readTextFileSync(new URL('../public/test-shared-worker.js', import.meta.url))
const fixture = `<!doctype html><title>Session test</title><script type="module">
import { getWindowSessionHints, getWindowSessionStartup, getWindowBounds, rememberWindowBounds, restoreWindowBounds, openWindowSession } from '/window-session.js'
const isAppWindow = true
window.resolveDarcWindowId = id => {
    window.darcWindowId = id
    document.title = id
}
window.getScreenDetails = async () => ({ screens: [screen], currentScreen: screen })
if (!window.launchQueue) {
    window.launchQueue = { setConsumer() {} }
}
${bootstrap}
</script>`

const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
    const path = new URL(request.url).pathname
    if (path === '/test-shared-worker.js' || path === '/window-session.js') {
        return new Response(path === '/test-shared-worker.js' ? worker : helper, { headers: { 'content-type': 'text/javascript' } })
    }
    return new Response(fixture, { headers: { 'content-type': 'text/html' } })
})
const origin = `http://127.0.0.1:${server.addr.port}`
const profile = new URL(`../.cache/window-session-browser-${crypto.randomUUID()}`, import.meta.url).pathname
let browser
const errors = []

async function startBrowser() {
    const instance = await puppeteer.launch({ headless: true, userDataDir: profile })
    instance.on('targetcreated', async target => {
        const page = await target.page()
        page?.on('pageerror', error => errors.push(error.message))
    })
    return instance
}

async function ready(page) {
    await page.waitForFunction(() => !!window.darcWindowId)
    return await page.evaluate(() => window.darcWindowId)
}

async function openAppWindow(url, name, features) {
    const target = browser.waitForTarget(target => target.type() === 'page' && target.url().startsWith(url))
    const driver = (await browser.pages())[0]
    await driver.evaluate((url, name, features) => window.open(url, name, features), url, name, features)
    return await (await target).page()
}

async function savedSet(page) {
    return await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('darc-window-sessions', 1)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        try {
            return await new Promise((resolve, reject) => {
                const request = db.transaction('session').objectStore('session').get('windows')
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => reject(request.error)
            })
        } finally {
            db.close()
        }
    })
}

try {
    browser = await startBrowser()
    const first = await openAppWindow(origin, 'first', 'popup,left=20,top=30,width=550,height=400')
    const firstId = await ready(first)
    const second = await openAppWindow(`${origin}/#new`, 'second', 'popup,left=180,top=100,width=600,height=450')
    const secondId = await ready(second)
    assert.notEqual(secondId, firstId)

    await first.evaluate(id => localStorage.setItem(`tabActiveHistory:${id}:darc:space_default`, JSON.stringify([{ id: 'second-tab', activatedAt: 100 }])), firstId)
    await second.evaluate(id => localStorage.setItem(`tabActiveHistory:${id}:darc:space_default`, JSON.stringify([{ id: 'third-tab', activatedAt: 200 }])), secondId)
    await second.waitForFunction(async () => {
        const request = indexedDB.open('darc-window-sessions', 1)
        const db = await new Promise(resolve => { request.onsuccess = () => resolve(request.result) })
        const read = db.transaction('session').objectStore('session').get('windows')
        const saved = await new Promise(resolve => { read.onsuccess = () => resolve(read.result) })
        db.close()
        return saved?.windows?.length === 2
    })
    const before = await savedSet(second)

    // Destroy the entire browser process, then launch the bare app URL with the same profile.
    await browser.close()
    browser = await startBrowser()
    const reopened = await openAppWindow(origin, 'reopened', 'popup,left=0,top=0,width=400,height=300')
    await ready(reopened)
    await browser.waitForTarget(target => target.type() === 'page' && target.url().startsWith(`${origin}/?darcWindowId=`) && target !== reopened.target())
    const restored = (await browser.pages()).filter(page => page.url().startsWith(origin))
    const restoredIds = await Promise.all(restored.map(ready))
    assert.deepEqual(restoredIds.sort(), [firstId, secondId].sort())
    assert.equal(restored.length, 2)
    assert.equal((await savedSet(reopened)).windows.length, 2)
    for (const page of restored) {
        const windowId = await ready(page)
        const bounds = before.windows.find(saved => saved.windowId === windowId).bounds
        await page.waitForFunction(bounds => {
            return window.screenX === bounds.x && window.screenY === bounds.y && window.outerWidth === bounds.width && window.outerHeight === bounds.height
        }, {}, bounds)
    }
    const histories = await reopened.evaluate(ids => ids.map(id => JSON.parse(localStorage.getItem(`tabActiveHistory:${id}:darc:space_default`))[0].id), [firstId, secondId])
    assert.deepEqual(histories, ['second-tab', 'third-tab'])

    const id = await ready(reopened)
    await reopened.reload()
    assert.equal(await ready(reopened), id)
    assert.equal((await browser.pages()).filter(page => page.url().startsWith(origin)).length, 2)
    assert.equal(before.windows.length, 2)
    assert.deepEqual(errors, [])
    console.log('Real Chromium restart: two original window IDs, exact window positions and sizes, automatic reopening, separate histories, IndexedDB persistence and reload verified')
} finally {
    await browser?.close()
    await server.shutdown()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
}

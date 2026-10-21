import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'
import { compile } from 'svelte/compiler'

const source = readFileSync(new URL('../app/components/Frame.svelte', import.meta.url), 'utf8')
const { css } = compile(source, { filename: 'Frame.svelte', css: 'external' })
const scope = css.code.match(/\.link-preview\.(svelte-[\w-]+)/)[1]
const action = readFileSync(new URL('../app/lib/link-preview.js', import.meta.url), 'utf8')
const fixture = `<!doctype html>
<style>
    * { box-sizing: border-box; }
    ${css.code}
    header { position: fixed; inset: 0 0 auto; height: 58px; background: black; z-index: 2100; }
    button { position: absolute; right: 20px; top: 8px; }
    #scroller { position: fixed; top: 44px; right: 9px; width: 380px; height: 600px;
        overflow: auto; z-index: 1; transform: translateZ(0); }
    #strip { width: 900px; }
    .frame-wrapper { margin-left: 80px; width: 350px; height: 550px; border: 1px solid gray;
        padding-left: 9px; content-visibility: auto; overflow: hidden; }
</style>
<header><button id="header-button" onclick="window.headerClicks++">Settings</button></header>
<div id="scroller"><div id="strip"><div class="frame-wrapper ${scope}">
    <div class="link-preview ${scope}" popover="manual">https://example.com/destination</div>
</div></div></div>
<script type="module">
    import { showLinkPreview } from '/link-preview.js'
    window.headerClicks = 0
    const preview = document.querySelector('.link-preview')
    window.showPreview = () => { window.previewAction = showLinkPreview(preview) }
    window.inspectPreview = () => {
        const frame = preview.parentElement
        const rect = preview.getBoundingClientRect()
        const frameRect = frame.getBoundingClientRect()
        // Temporarily enable hit testing to check painting order at the top border.
        preview.style.pointerEvents = 'auto'
        const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 0.5)
        preview.style.removeProperty('pointer-events')
        return {
            onTop: topmost === preview,
            overlap: frameRect.top + frame.clientTop - rect.top,
            left: rect.left,
            expectedLeft: frameRect.left + frame.clientLeft + parseFloat(getComputedStyle(frame).paddingLeft),
            maxWidth: parseFloat(getComputedStyle(preview).maxWidth),
            expectedMaxWidth: frame.clientWidth - 24,
            pointerEvents: getComputedStyle(preview).pointerEvents,
            open: preview.matches(':popover-open'),
            focused: document.activeElement.id
        }
    }
</script>`

const server = createServer((request, response) => {
    response.setHeader('content-type', request.url === '/link-preview.js' ? 'text/javascript' : 'text/html')
    response.end(request.url === '/link-preview.js' ? action : fixture)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = fileURLToPath(new URL(`../.cache/link-preview-browser-${crypto.randomUUID()}`, import.meta.url))
let browser
const errors = []

async function checkPreview(page) {
    await page.waitForFunction(() => {
        const preview = window.inspectPreview()
        return preview.overlap === 4 && preview.left === preview.expectedLeft && preview.maxWidth === preview.expectedMaxWidth
    })
    const result = await page.evaluate(() => window.inspectPreview())
    assert.equal(result.onTop, true, 'The top border must paint above the header')
    assert.equal(result.open, true)
    assert.equal(result.pointerEvents, 'none', 'The preview must not intercept header clicks')
    assert.equal(result.focused, 'header-button', 'Showing the preview must not steal focus')
}

try {
    browser = await puppeteer.launch({ headless: true, userDataDir: profile })
    const page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewport({ width: 1000, height: 800 })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.waitForFunction(() => !!window.showPreview)

    // Reproduce the original failure before testing the fix in the same fixture.
    await page.evaluate(() => {
        const preview = document.querySelector('.link-preview')
        preview.removeAttribute('popover')
        preview.style.cssText = 'position: absolute; top: -4px; left: 9px; max-width: 326px'
    })
    assert.equal((await page.evaluate(() => window.inspectPreview())).onTop, false)

    await page.evaluate(() => {
        const preview = document.querySelector('.link-preview')
        preview.removeAttribute('style')
        preview.setAttribute('popover', 'manual')
        document.getElementById('header-button').focus()
        window.showPreview()
    })
    await checkPreview(page)
    await page.click('#header-button')
    assert.equal(await page.evaluate(() => window.headerClicks), 1)

    await page.evaluate(() => { document.getElementById('scroller').scrollLeft = 40 })
    await checkPreview(page)
    await page.setViewport({ width: 760, height: 700 })
    await checkPreview(page)
    await page.evaluate(() => {
        document.querySelector('.frame-wrapper').style.width = '300px'
        document.getElementById('strip').style.transform = 'translateX(20px)'
    })
    await checkPreview(page)

    await page.evaluate(() => {
        window.previewAction.destroy()
        document.querySelector('.link-preview').remove()
    })
    assert.equal(await page.$(':popover-open'), null)
    assert.deepEqual(errors, [])
    console.log('Chromium: header occlusion reproduced; top-layer border, 4px overlap, scrolling, resizing, layout movement, focus, click-through and cleanup verified')
} finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
    rmSync(profile, { recursive: true, force: true })
}

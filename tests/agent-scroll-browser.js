import assert from 'node:assert/strict'
import puppeteer from 'puppeteer'
import { compile } from 'svelte/compiler'
import { clickToScroll } from '../app/lib/click-to-scroll.js'

const root = new URL('../', import.meta.url).pathname
const profile = `${root}.cache/agent-scroll-${crypto.randomUUID()}`
// Compile the actual component as well as exercising its action in Chromium.
compile(Deno.readTextFileSync(`${root}app/components/AgentSidebar.svelte`), {
    filename: 'app/components/AgentSidebar.svelte', generate: 'client'
})
let browser
try {
    browser = await puppeteer.launch({ headless: true, userDataDir: profile })
    const page = await browser.newPage()
    await page.setContent(`
        <style>
            body { margin: 0; }
            #list { height: 500px; width: 400px; overflow: auto; }
            #panel > .spacer { height: 300px; }
            .pane { height: 100px; overflow: auto; }
            .pane > div { height: 500px; }
            #panel :is(.pane, #code):not([data-scroll-active]) { overflow: hidden; }
            #code { width: 200px; height: 40px; overflow: auto; }
            #code > span { display: block; width: 600px; }
        </style>
        <button id="outside">Outside</button>
        <div id="list"><div id="panel">
            <div class="spacer"></div>
            <div id="first" class="pane"><div><button id="control" style="margin-top: 140px">Tool result</button> <span id="text">Selectable</span></div></div>
            <div id="second" class="pane"><div><pre id="code"><span>Long code line</span></pre></div></div>
            <div class="spacer"></div><div class="spacer"></div>
        </div></div>
    `)
    await page.addScriptTag({ content: `
        window.action = (${clickToScroll})(document.querySelector('#panel'), '.pane, #code')
        window.controlClicks = 0
        document.querySelector('#control').onclick = () => window.controlClicks++
    ` })
    const state = () => page.evaluate(() => Object.fromEntries(
        ['list', 'first', 'second', 'code'].map(id => {
            const element = document.getElementById(id)
            return [id, [element.scrollLeft, element.scrollTop]]
        })
    ))
    const position = async (list = 250, first = 100, second = 100) => page.evaluate(values => {
        for (const [id, value] of Object.entries(values)) document.getElementById(id).scrollTop = value
    }, { list, first, second })
    const wheel = async (selector, deltaY, deltaX = 0) => {
        await page.hover(selector)
        await page.mouse.wheel({ deltaY, deltaX })
        // Native wheel scrolling may animate over several frames.
        await new Promise(resolve => setTimeout(resolve, 250))
    }

    await position()
    await wheel('#first', 40)
    assert.equal((await state()).first[1], 100, 'unclicked panes must not capture wheel input')
    assert.equal((await state()).list[1], 290)

    await position()
    await page.hover('#first')
    await page.mouse.down()
    await page.mouse.wheel({ deltaY: 40 })
    await page.waitForFunction(() => document.getElementById('first').scrollTop === 140)
    assert.equal((await state()).list[1], 250, 'pressing activates the pane before release')
    await page.mouse.up()

    await position(250, 390)
    await wheel('#first', 40)
    assert.equal((await state()).first[1], 400)
    await wheel('#first', 40)
    assert.equal((await state()).list[1], 290, 'continued wheel movement reaches the parent at the edge')
    await wheel('#first', -20)
    assert.equal((await state()).first[1], 400, 'reversing direction at the bottom still requires another click')
    assert.equal((await state()).list[1], 270)

    await page.click('#first')
    await wheel('#first', -20)
    assert.equal((await state()).first[1], 380, 'clicking rearms a pane at its edge')
    await position(250, 10)
    await wheel('#first', -40)
    assert.equal((await state()).first[1], 0)
    await wheel('#first', -40)
    assert.equal((await state()).list[1], 210, 'continued wheel movement reaches the parent at the top edge')
    await wheel('#first', 20)
    assert.equal((await state()).first[1], 0)
    assert.equal((await state()).list[1], 230)

    await position(250, 360)
    await page.click('#first')
    await wheel('#first', 40)
    await wheel('#first', -20)
    assert.equal((await state()).first[1], 400, 'landing exactly at the edge must disarm the pane')

    await position(250, 400)
    await page.click('#first')
    await wheel('#first', 20)
    assert.equal((await state()).list[1], 270, 'pressing a pane already at its edge must not trap outward scrolling')
    assert.equal(await page.$eval('#first', element => element.hasAttribute('data-scroll-active')), false)

    await position()
    await page.click('#first')
    await wheel('#second', 20)
    assert.equal((await state()).second[1], 100, 'activation does not carry over to a sibling pane')
    await page.click('#outside')
    await wheel('#first', 20)
    assert.equal((await state()).first[1], 100, 'an outside click clears activation')

    await position(350, 100, 0)
    await page.click('#code')
    await wheel('#code', 0, 30)
    assert.equal((await state()).code[0], 30, 'nested code blocks support horizontal scrolling after a press')
    await wheel('#code', 20)
    assert.equal((await state()).second[1], 0, 'vertical gestures bypass an unclicked enclosing pane')
    assert.equal((await state()).list[1], 370)

    await position()
    await page.click('#first')
    const zoomCanceled = await page.$eval('#first', element => !element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 50, ctrlKey: true, bubbles: true, cancelable: true })
    ))
    assert.equal(zoomCanceled, false, 'zoom gestures retain browser defaults')
    assert.equal((await state()).first[1], 100)
    const wheelCanceled = await page.$eval('#first', element => !element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 1, deltaMode: 1, bubbles: true, cancelable: true })
    ))
    assert.equal(wheelCanceled, false, 'wheel scrolling stays native')
    assert.equal((await state()).first[1], 100, 'synthetic wheel events must not manually move the pane')

    await page.click('#outside')
    await page.click('#control')
    assert.equal(await page.evaluate(() => window.controlClicks), 1, 'the activation press also reaches buttons inside a locked pane')
    await page.click('#outside')
    await page.click('#text', { clickCount: 2 })
    assert.equal(await page.evaluate(() => getSelection().toString()), 'Selectable', 'text selection works on the activation press')

    await page.evaluate(() => window.action.destroy())
    const canceledAfterDestroy = await page.$eval('#first', element => !element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true })
    ))
    assert.equal(canceledAfterDestroy, false, 'unmount removes wheel interception')
    console.log('Chromium: native scrolling, click activation, both edge handoffs, reactivation, code blocks, buttons, selection and zoom pass')
} finally {
    await browser?.close()
    await Deno.remove(profile, { recursive: true }).catch(() => {})
}

import assert from 'node:assert/strict'
import { parse } from 'svelte/compiler'
import { root, withSidebarFixture } from './sidebar-browser-fixture.js'

const app = parse(await Deno.readTextFile(`${root}app/App.svelte`), { modern: true })
let light
function visit(node) {
    if (!node || typeof node !== 'object') { return }
    if (node.attributes?.some(attribute => attribute.type === 'UseDirective' && attribute.name === 'flashAgentActivity')) { light = node }
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) { value.forEach(visit) } else { visit(value) }
    }
}
visit(app.fragment)
assert(light?.attributes.some(attribute => attribute.name === 'class' && attribute.value[0].data === 'led-dot agent-activity'))
await Deno.mkdir(`${root}.cache/agent-activity`, { recursive: true })

await withSidebarFixture('agent-activity', async ({ page }) => {
    await page.evaluate(() => window.flushSync(() => {
        window.data.spaces.other = { name: 'Other', pinnedTabs: [], activeTabsOrder: [], tabs: [] }
        window.data.spaceMeta.spaceOrder.push('other')
    }))
    const favicon = '[data-tab-id="outside"] .favicon-wrapper'
    const space = '.space-item[data-space-id="space"]'
    await page.evaluate(() => {
        window.firstAccess = window.activity.begin()
        window.firstAccess.touch({ tabs: ['outside', 'pin-two', 'group-two'], spaces: ['space'] })
    })
    await page.waitForSelector(`${favicon} .mcp-activity-glow`)
    assert(await page.$(`${space} .mcp-activity-glow`))
    assert.equal(await page.$('.space-item[data-space-id="other"] .mcp-activity-glow'), null)
    assert(await page.$('[data-tab-id="pin-two"] .mcp-activity-glow'))
    assert(await page.$('.tab-group-main .mcp-activity-glow'))
    assert.equal(await page.$eval('.tab-group-main .mcp-activity-glow', node => {
        const glow = node.getBoundingClientRect()
        const viewport = node.closest('.favicon-viewport').getBoundingClientRect()
        return glow.top >= viewport.top && glow.bottom <= viewport.bottom
    }), true, 'Group previews leave vertical space for the glow')
    assert.equal(await page.$eval(favicon, node => getComputedStyle(node).overflow), 'visible')
    assert.match(await page.$eval(`${favicon} .mcp-activity-glow`, node => getComputedStyle(node, '::before').animationName), /mcp-glow-warp/)
    await page.evaluate(() => window.activity.pulse())
    await page.waitForFunction(() => document.querySelector('#activity-led').getAnimations().length === 1)
    await page.evaluate(() => {
        window.previousFlash = document.querySelector('#activity-led').getAnimations()[0]
        window.activity.pulse()
    })
    assert.equal(await page.evaluate(() => window.previousFlash.playState), 'idle', 'Every pulse restarts the blue flash')
    await page.screenshot({ path: `${root}.cache/agent-activity/glow.png` })
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    assert.equal(await page.$eval(`${favicon} .mcp-activity-glow`, node => getComputedStyle(node, '::before').animationName), 'none')
    await page.evaluate(() => {
        window.secondAccess = window.activity.begin()
        window.secondAccess.touch({ tabs: ['outside'], spaces: ['space'] })
        window.firstAccess.finish()
    })
    assert(await page.$(`${favicon} .mcp-activity-glow`))
    assert.equal(await page.$('[data-tab-id="pin-two"] .mcp-activity-glow'), null)
    await page.evaluate(() => window.secondAccess.finish())
    await page.waitForFunction(() => !document.querySelector('.mcp-activity-glow'))
    await page.waitForFunction(() => document.querySelector('#activity-led').getAnimations().length === 0)
    await page.evaluate(() => { window.destroyActivityLight(); window.activity.pulse() })
    assert.equal(await page.$eval('#activity-led', node => node.getAnimations().length), 0)
    console.log('MCP activity: tab/pin/group/space glow, overlapping calls, cleanup, reduced motion and repeat blue LED flashes pass')
}, `
    import { agentActivity, flashAgentActivity } from './app/lib/agent-activity.js'
    window.activity = agentActivity
    const led = document.createElement('div')
    led.id = 'activity-led'
    led.style.cssText = 'position:fixed;right:24px;bottom:24px;width:5px;height:5px;border-radius:50%;background:#5aaaff;opacity:.17'
    document.body.append(led)
    const action = flashAgentActivity(led)
    window.destroyActivityLight = () => action.destroy()
`)

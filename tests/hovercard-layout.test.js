import assert from 'node:assert/strict'
import { getSidebarHovercardPosition } from '../app/lib/hovercard-layout.js'

Deno.test('a short sidebar preview stays beside its trigger', () => {
    assert.deepEqual(getSidebarHovercardPosition({ left: 10, right: 260, top: 200 }, 336, 280, 1200, 800), { x: 270, y: 174 })
})

Deno.test('a group preview shifts upward when its full card stack fits the window', () => {
    const position = getSidebarHovercardPosition({ left: 10, right: 260, top: 650 }, 336, 600, 1200, 800)
    assert.deepEqual(position, { x: 270, y: 180 })
    assert.equal(position.y + 600, 780)
})

Deno.test('a tall stack uses the full bounded viewport and leaves its overflow scrollable', () => {
    const position = getSidebarHovercardPosition({ left: 10, right: 260, top: 700 }, 336, 2400, 1200, 800)
    assert.deepEqual(position, { x: 270, y: 20 })
})

Deno.test('previews flip to the left in a right-hand sidebar lane', () => {
    assert.deepEqual(getSidebarHovercardPosition({ left: 850, right: 1100, top: 200 }, 336, 280, 1200, 800), { x: 504, y: 174 })
})

Deno.test('the sidebar gap participates in deciding when to flip a preview', () => {
    assert.deepEqual(getSidebarHovercardPosition({ left: 600, right: 854, top: 200 }, 336, 280, 1200, 800), { x: 254, y: 174 })
})

Deno.test('small windows and triggers near the top retain window margins', () => {
    assert.deepEqual(getSidebarHovercardPosition({ left: 10, right: 260, top: 4 }, 300, 900, 320, 400), { x: 10, y: 20 })
})

Deno.test('expanding a card history recomputes the stack position from its new height', () => {
    const anchor = { left: 10, right: 260, top: 400 }
    const before = getSidebarHovercardPosition(anchor, 336, 250, 1200, 800)
    const after = getSidebarHovercardPosition(anchor, 336, 700, 1200, 800)
    assert.equal(before.y, 374)
    assert.equal(after.y, 80)
})

import assert from 'node:assert/strict'
import { formatToolValue, toolPhase, toolOutputValues, findBrowserToolMessage } from '../app/lib/agent-tool-display.js'
import { mcpTools } from '../app/lib/mcp-tool-defs.js'

Deno.test('tool JSON formatting preserves values and highlights keys, escaped strings, and primitives', () => {
    const value = { html: '<script>alert("hello")</script>', escaped: 'a\\b\nc', number: -1.25e8, values: [false, null, 0] }
    for (const input of [value, JSON.stringify(value), '```json\n' + JSON.stringify(value) + '\n```']) {
        const tokens = formatToolValue(input)
        assert.equal(tokens.map(token => token.text).join(''), JSON.stringify(value, null, 2))
        for (const kind of ['key', 'string', 'number', 'boolean', 'null', 'punctuation']) assert(tokens.some(token => token.kind === kind), kind)
    }
    for (const value of [false, 0, null]) assert.equal(formatToolValue(value).map(token => token.text).join(''), JSON.stringify(value))
    assert.deepEqual(formatToolValue('partial {"html":'), [{ text: 'partial {"html":', kind: 'text' }])
    assert.deepEqual(formatToolValue('<img src=x onerror=alert(1)>'), [{ text: '<img src=x onerror=alert(1)>', kind: 'text' }])
})

Deno.test('tool outputs preserve separate JSON blocks and falsy raw results', () => {
    assert.deepEqual(toolOutputValues({ rawOutput: false }), [false])
    assert.deepEqual(toolOutputValues({ rawOutput: null }), [null])
    const toolContent = ['{"a":1}', '[false,0]'].map(text => ({ type: 'content', content: { type: 'text', text } }))
    assert.deepEqual(toolOutputValues({ toolContent, content: 'flattened' }), ['{"a":1}', '[false,0]'])
})

Deno.test('tool phases distinguish preparing, permission, execution, denial and cancellation', () => {
    const tool = { role: 'tool', toolCallId: 'one', status: 'pending' }
    const approval = { role: 'approval', toolCallId: 'one', status: 'pending' }
    assert.equal(toolPhase(tool), 'preparing')
    assert.equal(toolPhase({ ...tool, status: 'in_progress' }), 'running')
    assert.equal(toolPhase(tool, [approval]), 'waiting')
    assert.equal(toolPhase(tool, [{ ...approval, toolCallId: 'other' }]), 'preparing')
    assert.equal(toolPhase(tool, [{ ...approval, status: 'approved' }]), 'running')
    assert.equal(toolPhase(tool, [{ ...approval, status: 'denied' }]), 'denied')
    assert.equal(toolPhase({ ...tool, browserPhase: 'waiting', status: 'in_progress' }), 'waiting')
    assert.equal(toolPhase({ ...tool, browserPhase: 'completed' }), 'completed')
    assert.equal(toolPhase({ ...tool, browserPhase: 'cancelled' }), 'cancelled')
    assert.equal(toolPhase({ ...tool, status: 'completed' }, [approval]), 'completed')
    assert.equal(toolPhase({ ...tool, status: 'failed' }), 'failed')
})

Deno.test('browser executions only attach to one matching live announcement', () => {
    const tool = { role: 'tool', title: 'darc_displayHtml', rawInput: { spaceId: 'one', html: '<p>Hello</p>' }, status: 'in_progress' }
    assert.equal(findBrowserToolMessage([tool], 'darc', 'displayHtml', { html: '<p>Hello</p>', spaceId: 'one' }), tool)
    assert.equal(findBrowserToolMessage([tool, { ...tool }], 'darc', 'displayHtml', tool.rawInput), null)
    assert.equal(findBrowserToolMessage([{ ...tool, browserPhase: 'waiting' }], 'darc', 'displayHtml', tool.rawInput), null)
    assert.equal(findBrowserToolMessage([{ ...tool, status: 'completed' }], 'darc', 'displayHtml', tool.rawInput), null)
    assert.equal(findBrowserToolMessage([tool], 'different', 'displayHtml', tool.rawInput), null)
    assert.equal(findBrowserToolMessage([tool], 'darc', 'displayHtml', { ...tool.rawInput, spaceId: 'two' }), null)
    const listing = { role: 'tool', title: 'darc_listSpaces', status: 'in_progress', rawInput: {} }
    assert.equal(findBrowserToolMessage([listing], 'darc', 'listSpaces', { currentOnly: false }, mcpTools.listSpaces.inputSchema), listing)
})

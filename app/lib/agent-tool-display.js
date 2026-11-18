export function formatToolValue(value) {
    let text
    if (typeof value === 'string') {
        const source = value.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1')
        try { text = JSON.stringify(JSON.parse(source), null, 2) }
        catch { return [{ text: value, kind: 'text' }] }
    } else {
        text = JSON.stringify(value, null, 2)
    }
    if (text === undefined) return []
    const tokens = []
    const pattern = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}\[\]:,]/g
    let offset = 0
    for (const match of text.matchAll(pattern)) {
        if (match.index > offset) tokens.push({ text: text.slice(offset, match.index), kind: 'text' })
        const token = match[0]
        const kind = token.startsWith('"') ? (/^\s*:/.test(text.slice(match.index + token.length)) ? 'key' : 'string')
            : /^-?\d/.test(token) ? 'number' : token === 'null' ? 'null' : /^(true|false)$/.test(token) ? 'boolean' : 'punctuation'
        tokens.push({ text: token, kind })
        offset = match.index + token.length
    }
    if (offset < text.length) tokens.push({ text: text.slice(offset), kind: 'text' })
    return tokens
}

export function toolPhase(message, approvals = []) {
    if (message.status === 'completed') return 'completed'
    if (['denied', 'cancelled'].includes(message.browserPhase)) return message.browserPhase
    if (message.status === 'failed') return 'failed'
    if (message.status === 'cancelled') return 'cancelled'
    if (message.browserPhase) return message.browserPhase
    const approval = approvals.findLast(item => item.role === 'approval' && item.toolCallId === message.toolCallId)
    if (approval?.status === 'pending') return 'waiting'
    if (['denied', 'cancelled'].includes(approval?.status)) return approval.status
    if (approval?.status === 'approved') return 'running'
    return message.status === 'in_progress' ? 'running' : 'preparing'
}

export function toolOutputValues(message) {
    if (message.toolContent?.length) return message.toolContent.map(item => item.type === 'content' && item.content.type === 'text'
        ? item.content.text : item.type === 'diff' ? `${item.path}\n${item.newText || ''}` : item)
    if (message.rawOutput !== undefined) return [message.rawOutput]
    return message.content ? [message.content] : []
}

export const toolPhaseLabels = {
    preparing: 'Preparing', waiting: 'Waiting for permission', running: 'Running',
    completed: 'Completed', failed: 'Failed', denied: 'Denied', cancelled: 'Cancelled'
}

function sameJson(left, right) {
    if (left === right) return true
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
}

// Only associate an execution with an unambiguous announcement in this conversation.
export function findBrowserToolMessage(messages, serverName, name, args, inputSchema) {
    const matches = messages.filter(message => message.role === 'tool' && !message.browserPhase &&
        !['completed', 'failed'].includes(message.status) &&
        [name, `${serverName}_${name}`].includes(message.title) &&
        (!inputSchema || inputSchema.allows(message.rawInput)) &&
        sameJson(inputSchema ? inputSchema.assert(message.rawInput) : message.rawInput, args))
    return matches.length === 1 ? matches[0] : null
}

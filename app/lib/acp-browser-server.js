import { McpServer } from '@modelcontextprotocol/server'
import { fromMcpServer } from '@agentclientprotocol/sdk/experimental/mcp-server'
import { mcpTools, mcpServerInstructions } from './mcp-tool-defs.js'

// Only the transport changes: the connection's existing executor owns every permission check.
export function createBrowserServer({ connection, onToolCall }) {
    let pending = new AbortController()
    const backend = fromMcpServer(() => {
        const server = new McpServer({ name: 'darc-browser', version: '1.0.0' }, { instructions: mcpServerInstructions })
        for (const [name, definition] of Object.entries(mcpTools)) {
            server.registerTool(name, definition, async (args, ctx) => {
                const update = onToolCall?.({ name, args, serverName: connection.name, inputSchema: definition.inputSchema })
                const signal = AbortSignal.any([pending.signal, ctx.mcpReq.signal])
                let phase = 'preparing'
                const onPhase = value => { phase = value; update?.({ phase }) }
                try {
                    const result = await connection.execute({ name, args, signal, onPhase })
                    const text = JSON.stringify(result)
                    if (text.length > 4 * 1024 * 1024) { throw new Error('The MCP result is too large; read a smaller scope or use an XPath selector') }
                    update?.({ phase: 'completed', result })
                    return { content: [{ type: 'text', text }] }
                } catch (error) {
                    update?.({ phase: signal.aborted ? 'cancelled' : phase === 'denied' ? 'denied' : 'failed', error: error.message })
                    return { isError: true, content: [{ type: 'text', text: error.message }] }
                }
            })
        }
        return server
    })
    return {
        name: connection.name,
        signal: connection.signal,
        proxyIdentity: connection.proxyIdentity,
        setMcpUrl: value => connection.setMcpUrl?.(value),
        handler(operation) {
            connection.reportAgent(operation.clientInfo)
            return backend.handler(operation)
        },
        cancelPending() { pending.abort(); pending = new AbortController() },
        async close() { connection.close(); await backend.close() }
    }
}

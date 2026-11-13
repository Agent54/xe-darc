import { McpServer } from '@modelcontextprotocol/server'
import { fromMcpServer } from '@agentclientprotocol/sdk/experimental/mcp-server'
import { mcpTools } from './mcp-tool-defs.js'

// Only the transport changes: the connection's existing executor owns every permission check.
export function createBrowserServer({ connection }) {
    let pending = new AbortController()
    const backend = fromMcpServer(() => {
        const server = new McpServer({ name: 'darc-browser', version: '1.0.0' })
        for (const [name, definition] of Object.entries(mcpTools)) {
            server.registerTool(name, definition, async (args, ctx) => {
                try {
                    const result = await connection.execute({ name, args, signal: AbortSignal.any([pending.signal, ctx.mcpReq.signal]) })
                    const text = JSON.stringify(result)
                    if (text.length > 4 * 1024 * 1024) { throw new Error('The MCP result is too large; read a smaller scope or use an XPath selector') }
                    return { content: [{ type: 'text', text }] }
                } catch (error) {
                    return { isError: true, content: [{ type: 'text', text: error.message }] }
                }
            })
        }
        return server
    })
    return {
        name: connection.name,
        signal: connection.signal,
        handler(operation) {
            connection.reportAgent(operation.clientInfo)
            return backend.handler(operation)
        },
        cancelPending() { pending.abort(); pending = new AbortController() },
        async close() { connection.close(); await backend.close() }
    }
}

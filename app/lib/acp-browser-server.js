import { McpServer } from '@modelcontextprotocol/server'
import { fromMcpServer } from '@agentclientprotocol/sdk/experimental/mcp-server'
import * as z from 'zod/v4'
import { prepareBrowserTool } from './agent-browser-tools.js'

export function createBrowserServer({ data, getContext, approve }) {
    return fromMcpServer(() => {
        const server = new McpServer({ name: 'darc-browser', version: '1.0.0' })
        const tools = {
            listTabs: { description: 'List tabs in the browser context selected by the user', inputSchema: z.object({}) },
            readPageContent: {
                description: 'Read a selected Darc tab, optionally selecting an element with XPath',
                inputSchema: z.object({ tabId: z.string().optional(), textOnly: z.boolean().default(true), selector: z.string().optional() })
            },
            openNewTab: {
                description: 'Open and focus a tab in the space selected by the user',
                inputSchema: z.object({ url: z.string().optional(), title: z.string().optional() })
            },
            displayHtml: {
                description: 'Create and focus an HTML page in a new Darc tab',
                inputSchema: z.object({ html: z.string().min(1), title: z.string().optional() })
            }
        }
        for (const [name, definition] of Object.entries(tools)) {
            server.registerTool(name, definition, async (args, ctx) => {
                try {
                    const operation = prepareBrowserTool(data, getContext(), name, args)
                    const signal = ctx.mcpReq.signal
                    signal?.throwIfAborted()
                    if (name !== 'listTabs' && !await approve({ title: name, details: operation.details, signal })) {
                        throw new Error('Browser action denied or cancelled')
                    }
                    signal?.throwIfAborted()
                    const result = await operation.execute()
                    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
                } catch (error) {
                    return { isError: true, content: [{ type: 'text', text: error.message }] }
                }
            })
        }
        return server
    })
}

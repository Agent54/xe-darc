import { readable } from 'svelte/store'
import data from '../data.svelte.js'
import { createAgentClient } from './acp-client.js'
import { createBrowserServer } from './acp-browser-server.js'
import { readAcpSettings } from './acp-settings.js'

export const agent = createAgentClient({
    getSettings: readAcpSettings,
    createBrowserServer: options => createBrowserServer({ data, ...options })
})

export const agentState = readable(agent.state, set => agent.subscribe(set))

export async function testAgentConnection(settings) {
    const client = createAgentClient({ getSettings: () => settings })
    try {
        await client.connect()
        return `${client.state.agentName} connected (ACP v1). Browser tools: ${client.state.browserTools ? 'available' : 'require MCP-over-ACP support'}.`
    } finally {
        client.disconnect()
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => agent.disconnect())
}

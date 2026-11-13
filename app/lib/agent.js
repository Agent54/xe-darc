import { readable } from 'svelte/store'
import { createAgentClient } from './acp-client.js'
import { mcp } from './mcp-service.js'
import { readAcpSettings } from './acp-settings.js'
import { createBrowserServer } from './acp-browser-server.js'

export const agent = createAgentClient({
    getSettings: readAcpSettings,
    modelStorage: globalThis.localStorage,
    createBrowserServer: (settings, agentInfo) => createBrowserServer({ connection: mcp.openAcp(settings.mcpConnectionId, agentInfo) })
})

export const agentState = readable(agent.state, set => agent.subscribe(set))

export async function testAgentConnection(settings) {
    const client = createAgentClient({ getSettings: () => settings })
    try {
        await client.connect()
        return `${client.state.agentName} connected (ACP v1).`
    } finally {
        client.disconnect()
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => agent.disconnect())
}

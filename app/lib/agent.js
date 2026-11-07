import { readable } from 'svelte/store'
import { createAgentClient } from './acp-client.js'
import { mcp } from './mcp-service.js'
import { readAcpSettings } from './acp-settings.js'

export const agent = createAgentClient({
    getSettings: readAcpSettings,
    modelStorage: globalThis.localStorage,
    getMcpServers: settings => {
        if (!settings.mcpConnectionId) { return [] }
        const connection = mcp.state.connections.find(entry => entry.id === settings.mcpConnectionId)
        if (!connection) { throw new Error('The selected MCP connection was removed. Choose a connection in Settings.') }
        return [{ type: 'http', name: connection.title.replace(/[^A-Za-z0-9_-]/g, '_'), url: connection.endpoint, headers: [] }]
    }
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

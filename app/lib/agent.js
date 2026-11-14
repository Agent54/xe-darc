import { readable } from 'svelte/store'
import { createAgentClient } from './acp-client.js'
import { createAgentConnections } from './agent-connections.js'
import { mcp } from './mcp-service.js'
import { createBrowserServer } from './acp-browser-server.js'

export const agent = createAgentConnections({
    storage: globalThis.localStorage, session: globalThis.sessionStorage,
    getWindowId: () => window.darcWindowId, mcp,
    createBrowserServer: (settings, agentInfo) => createBrowserServer({ connection: mcp.openAcp(settings.mcpConnectionId, agentInfo, settings.endpoint) })
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
    void window.waitForDarcWindowId().then(() => agent.start())
    window.addEventListener('pagehide', () => agent.suspend())
    window.addEventListener('pageshow', () => agent.start())
    window.addEventListener('online', () => agent.start())
}

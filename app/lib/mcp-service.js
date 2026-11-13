import { readable } from 'svelte/store'
import data from '../data.svelte.js'
import { createMcpConnections } from './mcp-connections.js'

export const mcp = createMcpConnections({ data })
export const mcpState = readable(mcp.state, set => mcp.subscribe(set))

export async function startMcpConnections() {
    await window.waitForDarcWindowId()
    mcp.start()
    const storageChanged = event => { if (event.key === 'mcpConnections') { mcp.sync() } }
    const hide = () => mcp.stop()
    const show = () => mcp.start()
    window.addEventListener('storage', storageChanged)
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', show)
    return () => { window.removeEventListener('storage', storageChanged); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show); mcp.stop() }
}

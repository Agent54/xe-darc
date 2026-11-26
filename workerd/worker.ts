import cdpProxy from './cdp-proxy'
import { routeMcp } from './mcp.js'
export { McpConnection } from './mcp.js'

export default {
    async fetch(request, env, ctx) {
        const response = await routeMcp(request, env)
        return response || cdpProxy.fetch(request, env, ctx)
    }
}

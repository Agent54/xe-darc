interface Env {
    CDP_TARGET_HOST?: string
    CDP_TARGET_PORT?: string
    [key: string]: any
}

interface ExecutionContext {
    waitUntil(promise: Promise<any>): void
}

interface ExportedHandler<Env = unknown> {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>
}

// Store active WebSocket connections
const connections = new Map<string, WebSocket>()
let connectionCounter = 0

function addCorsHeaders(response: Response): Response {
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, UPGRADE')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol')
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    })
}

async function proxyHttpRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const targetHost = env.CDP_TARGET_HOST || 'localhost'
    const targetPort = env.CDP_TARGET_PORT || '9222'
    
    // Build target URL
    const targetUrl = `http://${targetHost}:${targetPort}${url.pathname}${url.search}`
    
    console.log(`[CDP-PROXY] HTTP ${request.method} ${url.pathname} -> ${targetUrl}`)
    
    try {
        // Forward the request to the CDP target
        const proxyRequest = new Request(targetUrl, {
            method: request.method,
            headers: request.headers,
            body: request.body
        })
        
        const response = await fetch(proxyRequest)
        console.log(`[CDP-PROXY] HTTP Response ${response.status} for ${url.pathname}`)
        
        return addCorsHeaders(response)
    } catch (error) {
        console.error(`[CDP-PROXY] HTTP Error for ${url.pathname}:`, error)
        return addCorsHeaders(new Response(
            JSON.stringify({ error: 'Failed to connect to CDP target' }), 
            { 
                status: 502, 
                headers: { 'Content-Type': 'application/json' } 
            }
        ))
    }
}

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const targetHost = env.CDP_TARGET_HOST || 'localhost'
    const targetPort = env.CDP_TARGET_PORT || '9222'
    
    // Extract WebSocket path (usually something like /devtools/page/{id})
    const wsPath = url.pathname + url.search
    const targetWsUrl = `ws://${targetHost}:${targetPort}${wsPath}`
    
    console.log(`[CDP-PROXY] WebSocket connection request: ${wsPath} -> ${targetWsUrl}`)
    
    // Create WebSocket pair for client connection
    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)
    
    // Accept the client connection
    server.accept()
    
    const connectionId = `conn_${++connectionCounter}`
    console.log(`[CDP-PROXY] New WebSocket connection: ${connectionId}`)
    
    // Connect to the CDP target
    let targetWs: WebSocket
    
    try {
        targetWs = new WebSocket(targetWsUrl)
        connections.set(connectionId, targetWs)
        
        // Handle target WebSocket events
        targetWs.addEventListener('open', () => {
            console.log(`[CDP-PROXY] ${connectionId} - Connected to CDP target`)
        })
        
        targetWs.addEventListener('message', (event) => {
            const message = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
            console.log(`[CDP-PROXY] ${connectionId} - Target -> Client:`, message)
            
            try {
                server.send(message)
            } catch (error) {
                console.error(`[CDP-PROXY] ${connectionId} - Failed to send to client:`, error)
            }
        })
        
        targetWs.addEventListener('error', (event) => {
            console.error(`[CDP-PROXY] ${connectionId} - Target WebSocket error:`, event)
            server.close(1011, 'Target connection error')
        })
        
        targetWs.addEventListener('close', (event) => {
            console.log(`[CDP-PROXY] ${connectionId} - Target WebSocket closed:`, event.code, event.reason)
            connections.delete(connectionId)
            server.close(event.code, event.reason)
        })
        
    } catch (error) {
        console.error(`[CDP-PROXY] ${connectionId} - Failed to connect to CDP target:`, error)
        server.close(1011, 'Failed to connect to target')
        return new Response('Failed to connect to CDP target', { status: 502 })
    }
    
    // Handle client WebSocket events
    server.addEventListener('message', (event) => {
        const message = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
        console.log(`[CDP-PROXY] ${connectionId} - Client -> Target:`, message)
        
        try {
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(message)
            } else {
                console.error(`[CDP-PROXY] ${connectionId} - Target WebSocket not ready`)
                server.close(1011, 'Target not ready')
            }
        } catch (error) {
            console.error(`[CDP-PROXY] ${connectionId} - Failed to send to target:`, error)
        }
    })
    
    server.addEventListener('close', (event) => {
        console.log(`[CDP-PROXY] ${connectionId} - Client WebSocket closed:`, event.code, event.reason)
        connections.delete(connectionId)
        if (targetWs) {
            targetWs.close(event.code, event.reason)
        }
    })
    
    server.addEventListener('error', (event) => {
        console.error(`[CDP-PROXY] ${connectionId} - Client WebSocket error:`, event)
        connections.delete(connectionId)
        if (targetWs) {
            targetWs.close(1011, 'Client error')
        }
    })
    
    return new Response(null, {
        status: 101,
        webSocket: client
    })
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url)
        
        // Handle CORS preflight requests
        if (request.method === 'OPTIONS') {
            return addCorsHeaders(new Response(null, { status: 204 }))
        }
        
        // Check if this is a WebSocket upgrade request
        const upgradeHeader = request.headers.get('Upgrade')
        if (upgradeHeader?.toLowerCase() === 'websocket') {
            return handleWebSocket(request, env)
        }
        
        // Handle HTTP requests to CDP endpoints
        if (url.pathname.startsWith('/json') || 
            url.pathname.startsWith('/devtools') ||
            url.pathname === '/') {
            return proxyHttpRequest(request, env)
        }
        
        // Default 404 for unhandled routes
        return addCorsHeaders(new Response("CDP Proxy - Route not found", { status: 404 }))
    }
} satisfies ExportedHandler<Env>

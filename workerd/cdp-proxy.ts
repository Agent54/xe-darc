// CDP Target Configuration
// Chrome's CDP server runs on a single port for both HTTP API endpoints
// (like /json/version, /json/list) and WebSocket CDP connections
const CDP_DEFAULT_PORT = '9226'
const CDP_DEFAULT_HOST = 'localhost'

interface Env {
    CDP_TARGET_HOST?: string
    CDP_TARGET_PORT?: string
    [key: string]: any
}

// Cloudflare Workers WebSocket types
interface CloudflareWebSocket extends WebSocket {
    accept(): void
}

declare global {
    interface WebSocketPair {
        0: CloudflareWebSocket
        1: CloudflareWebSocket
    }
    
    interface ResponseInit {
        webSocket?: WebSocket
    }
    
    var WebSocketPair: {
        new(): WebSocketPair
    }
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
    const targetHost = env.CDP_TARGET_HOST || CDP_DEFAULT_HOST
    const targetPort = env.CDP_TARGET_PORT || CDP_DEFAULT_PORT
    
    // Build target URL
    const targetUrl = `http://${targetHost}:${targetPort}${url.pathname}${url.search}`
    
    // Log request body if it exists
    let requestBody: string | null = null
    if (request.body) {
        try {
            const bodyText = await request.text()
            if (bodyText) {
                try {
                    const jsonBody = JSON.parse(bodyText)
                    console.log(`[CDP-PROXY] HTTP Request JSON:`, JSON.stringify(jsonBody, null, 2))
                } catch (parseError) {
                    // Skip non-JSON bodies
                }
                requestBody = bodyText
            }
        } catch (error) {
            // Silent
        }
    }
    
    try {
        // Forward the request to the CDP target
        const proxyRequest = new Request(targetUrl, {
            method: request.method,
            headers: request.headers,
            body: requestBody
        })
        
        const response = await fetch(proxyRequest)
       
        //Log and rewrite response body if it's JSON
        const responseClone = response.clone()
        try {
            const responseText = await responseClone.text()
            if (responseText) {
                // Try to parse as JSON first
                try {
                    const jsonData = JSON.parse(responseText)
                    const proxyHost = url.host
                    
                    let modified = false
                    
                    // Recursively rewrite URLs and targetInfo in JSON object
                    function rewriteUrlsInObject(obj: any): any {
                        if (typeof obj === 'string') {
                            // Rewrite WebSocket URLs
                            if (obj.includes(`ws://${targetHost}:${targetPort}`)) {
                                modified = true
                                return obj.replace(`ws://${targetHost}:${targetPort}`, `ws://${proxyHost}`)
                            }
                            // Rewrite HTTP URLs  
                            if (obj.includes(`http://${targetHost}:${targetPort}`)) {
                                modified = true
                                return obj.replace(`http://${targetHost}:${targetPort}`, `${url.protocol}//${proxyHost}`)
                            }
                            return obj
                        } else if (Array.isArray(obj)) {
                            return obj.map(rewriteUrlsInObject)
                        } else if (obj && typeof obj === 'object') {
                            const rewritten = {}
                            
                            // Rewrite targetInfo.type to "page" and preserve original in xe-meta
                            if (obj.type && obj.type !== 'page' && (obj.webSocketDebuggerUrl || obj.devtoolsFrontendUrl)) {
                                rewritten['xe-meta'] = { originalType: obj.type }
                                rewritten['type'] = 'page'
                                modified = true
                            }
                            
                            for (const [key, value] of Object.entries(obj)) {
                                if (key === 'type' && rewritten['type']) {
                                    // Already handled above
                                    continue
                                }
                                rewritten[key] = rewriteUrlsInObject(value)
                            }
                            return rewritten
                        }
                        return obj
                    }
                    
                    const rewrittenJson = rewriteUrlsInObject(jsonData)
                    
                    console.log(`[CDP-PROXY] HTTP Response JSON:`, JSON.stringify(rewrittenJson, null, 2))
                    
                    if (modified) {
                        return addCorsHeaders(new Response(JSON.stringify(rewrittenJson), {
                            status: response.status,
                            statusText: response.statusText,
                            headers: response.headers
                        }))
                    }
                    
                } catch (parseError) {
                    // Skip non-JSON responses
                }
            }
        } catch (error) {
            // Silent
        }
        
        return addCorsHeaders(response)
    } catch (error) {
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
    const targetHost = env.CDP_TARGET_HOST || CDP_DEFAULT_HOST
    const targetPort = env.CDP_TARGET_PORT || CDP_DEFAULT_PORT
    
    // Extract WebSocket path (usually something like /devtools/page/{id})
    const wsPath = url.pathname + url.search
    const targetWsUrl = `ws://${targetHost}:${targetPort}${wsPath}`
    
    // Create WebSocket pair for client connection
    const webSocketPair = new WebSocketPair()
    const [client, server]: [CloudflareWebSocket, CloudflareWebSocket] = [webSocketPair[0], webSocketPair[1]]
    
    // Accept the client connection
    server.accept()
    
    const connectionId = `conn_${++connectionCounter}`
    
    // Connect to the CDP target
    let targetWs: WebSocket
    
    try {
        targetWs = new WebSocket(targetWsUrl)
        connections.set(connectionId, targetWs)
        
        // Handle target WebSocket events
        targetWs.addEventListener('open', () => {
            // Connected
        })
        
        targetWs.addEventListener('message', (event) => {
            const message = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
            
            let modifiedMessage = message
            
            // Parse and rewrite target types
            try {
                const jsonPayload = JSON.parse(message)
                
                // Recursively rewrite targetInfo.type to "page" and preserve original in xe-meta
                function rewriteTargetInfo(obj: any): any {
                    if (obj && typeof obj === 'object') {
                        if (obj.targetInfo && obj.targetInfo.type && obj.targetInfo.type !== 'page') {
                            // Store original type in xe-meta
                            obj.targetInfo['xe-meta'] = { originalType: obj.targetInfo.type }
                            obj.targetInfo.type = 'page'
                        }
                        
                        // Recursively process nested objects
                        for (const key in obj) {
                            if (typeof obj[key] === 'object') {
                                obj[key] = rewriteTargetInfo(obj[key])
                            }
                        }
                    } else if (Array.isArray(obj)) {
                        return obj.map(rewriteTargetInfo)
                    }
                    return obj
                }
                
                const rewrittenPayload = rewriteTargetInfo(jsonPayload)
                modifiedMessage = JSON.stringify(rewrittenPayload)
                
                console.log(`[CDP-PROXY] Target -> Client:`, JSON.stringify(rewrittenPayload, null, 2))
            } catch (parseError) {
                // Skip non-JSON
            }
            
            try {
                server.send(modifiedMessage)
            } catch (error) {
                // Silent
            }
        })
        
        targetWs.addEventListener('error', (event) => {
            server.close(1011, 'Target connection error')
        })
        
        targetWs.addEventListener('close', (event) => {
            connections.delete(connectionId)
            // 1005, 1006, 1015 are reserved codes that cannot be sent in a close frame
            const closeCode = (event.code === 1005 || event.code === 1006 || event.code === 1015) ? 1000 : event.code
            server.close(closeCode, event.reason)
        })
        
    } catch (error) {
        server.close(1011, 'Failed to connect to target')
        return new Response('Failed to connect to CDP target', { status: 502 })
    }
    
    // Handle client WebSocket events
    server.addEventListener('message', (event) => {
        const message = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
        
        // Parse and log JSON payload
        try {
            const jsonPayload = JSON.parse(message)
            console.log(`[CDP-PROXY] Client -> Target:`, JSON.stringify(jsonPayload, null, 2))
        } catch (parseError) {
            // Skip non-JSON
        }
        
        try {
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(message)
            } else {
                server.close(1011, 'Target not ready')
            }
        } catch (error) {
            // Silent
        }
    })
    
    server.addEventListener('close', (event) => {
        connections.delete(connectionId)
        if (targetWs) {
            // 1005, 1006, 1015 are reserved codes that cannot be sent in a close frame
            const closeCode = (event.code === 1005 || event.code === 1006 || event.code === 1015) ? 1000 : event.code
            targetWs.close(closeCode, event.reason)
        }
    })
    
    server.addEventListener('error', (event) => {
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
        
        console.log(`[CDP-PROXY] *** REQUEST: ${request.method} ${url.pathname}`)
        
        // Handle CORS preflight requests
        if (request.method === 'OPTIONS') {
            return addCorsHeaders(new Response(null, { status: 204 }))
        }
        
        // Check if this is a WebSocket upgrade request
        const upgradeHeader = request.headers.get('Upgrade')
        
        if (upgradeHeader?.toLowerCase() === 'websocket') {
            console.log(`[CDP-PROXY] -> Handling as WebSocket`)
            return handleWebSocket(request, env)
        }
        
        // Handle HTTP requests to CDP endpoints
        if (url.pathname.startsWith('/json') || 
            url.pathname.startsWith('/devtools') ||
            url.pathname === '/') {
            console.log(`[CDP-PROXY] -> Handling as HTTP request`)
            return proxyHttpRequest(request, env)
        }
        
        console.log(`[CDP-PROXY] -> 404 Not Found`)
        
        // Default 404 for unhandled routes
        return addCorsHeaders(new Response("CDP Proxy - Route not found", { status: 404 }))
    }
} satisfies ExportedHandler<Env>

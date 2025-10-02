// CDP Target Configuration
// Chrome's CDP server runs on a single port for both HTTP API endpoints
// (like /json/version, /json/list) and WebSocket CDP connections
const CDP_DEFAULT_PORT = '9226'
const CDP_DEFAULT_HOST = 'localhost'

// Global CDP target (set from env on first request)
let CDP_TARGET_HOST = CDP_DEFAULT_HOST
let CDP_TARGET_PORT = CDP_DEFAULT_PORT

// Global WebSocket server connection
let CDP_SERVER: CloudflareWebSocket | null = null

// Track sent context target IDs to avoid duplicates
const SENT_CONTEXT_TARGET_IDS = new Set<string>()

// Global context cache
let CONTEXT_CACHE: any[] = []
let CONTEXT_CACHE_TIMESTAMP = 0
const CONTEXT_CACHE_TTL = 5000 // 5 seconds TTL

// Map sessionId to targetId for context lookups
const SESSION_TO_TARGET_MAP = new Map<string, string>()
// Map targetId to sessionId for sending events with correct session
const TARGET_TO_SESSION_MAP = new Map<string, string>()

// Whitelist of CDP methods that are always forwarded to the browser
// Use '*' as first entry to whitelist all methods (useful for debugging)
const CDP_METHOD_WHITELIST = [
    // '*', // Whitelist all methods - custom handlers still take precedence
    'Browser.getVersion',
    // 'Target.createTarget',
    // 'Target.setAutoAttach',
    // 'Target.getTargetInfo'
]

// {
//     "id": 16,
//     "method": "Page.createIsolatedWorld",
//     "params": {
//       "frameId": "773E3798636653D52F18FEC316397498",
//       "grantUniveralAccess": true,
//       "worldName": "__playwright_utility_world_page@9639fd888b7b74c3655c6213d3404097"
//     },
//     "sessionId": "35FB6D6730D39149088FBD1B5DCDEE7E"
//   }

// "method": "Runtime.executionContextCreated",
// "params": {
//   "context": {
//     "id": 2,
//     "origin": "",
//     "name": "__playwright_utility_world_page@9639fd888b7b74c3655c6213d3404097",
//     "uniqueId": "-2940306569973037192.5374295183845837550",
//     "auxData": {
//       "isDefault": false,
//       "type": "isolated",
//       "frameId": "773E3798636653D52F18FEC316397498"
//     }
//   }
// // },

const CDP_METHOD_BLOCKLIST = [
    'Page.setInterceptFileChooserDialog',
    'Browser.setDownloadBehavior',
    'Log.enable',
    'Page.setLifecycleEventsEnabled'
]

// {
//     "method": "Target.attachedToTarget",
//     "params": {
//       "sessionId": "866859C728A9F82CE302B260355661A2",
//       "targetInfo": {
//         "targetId": "78563A0BB34BDBD4C8615F39FD7F4F9E",
//         "type": "page",
//         "title": "darc login",
//         "url": "http://localhost:8086/login?workspace=/workspace/.vscode/orchestrator.code-workspace&to=",
//         "attached": true,
//         "canAccessOpener": false,
//         "browserContextId": "8E1F656513F858FB413FED699EBAB499",
//         "xe-meta": {
//           "originalType": "webview"
//         }
//       },
//       "waitingForDebugger": false
//     }
//   }

// {
//     "id": 5,
//     "method": "Page.getFrameTree",
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }
// {
//     "id": 5,
//     "result": {
//       "frameTree": {
//         "frame": {
//           "id": "773E3798636653D52F18FEC316397498",
//           "loaderId": "200414315E387D413873B49E86F4BDC2",
//           "url": "https://www.sheldonbrown.com/web_sample1.html",
//           "domainAndRegistry": "sheldonbrown.com",
//           "securityOrigin": "https://www.sheldonbrown.com",
//           "securityOriginDetails": {
//             "isLocalhost": false
//           },
//           "mimeType": "text/html",
//           "adFrameStatus": {
//             "adFrameType": "none"
//           },
//           "secureContextType": "Secure",
//           "crossOriginIsolatedContextType": "NotIsolated",
//           "gatedAPIFeatures": []
//         }
//       }
//     },
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }

// {
//     "id": 6,
//     "method": "Log.enable",
//     "params": {},
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }
// {
//     "id": 6,
//     "result": {},
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }

// {
//     "id": 7,
//     "method": "Page.setLifecycleEventsEnabled",
//     "params": {
//       "enabled": true
//     },
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }

// {
//     "id": 8,
//     "method": "Runtime.enable",
//     "params": {},
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }

// {
//     "id": 9,
//     "method": "Page.addScriptToEvaluateOnNewDocument",
//     "params": {
//       "source": "",
//       "worldName": "__playwright_utility_world_page@b3bb2104848c6c2e49113241dbd9a0ae"
//     },
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }{
//   "id": 9,
//   "method": "Page.addScriptToEvaluateOnNewDocument",
//   "params": {
//     "source": "",
//     "worldName": "__playwright_utility_world_page@b3bb2104848c6c2e49113241dbd9a0ae"
//   },
//   "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
// }


// {
//     "method": "Log.entryAdded",
//     "params": {
//       "entry": {
//         "source": "security",
//         "level": "error",
//         "text": "Mixed Content: The page at 'https://www.sheldonbrown.com/web_sample1.html' was loaded over HTTPS, but requested an insecure script 'http://pagead2.googlesyndication.com/pagead/show_ads.js'. This request has been blocked; the content must be served over HTTPS.",
//         "timestamp": 1759469314669.022,
//         "url": "https://www.sheldonbrown.com/web_sample1.html"
//       }
//     },
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }

// Runtime.enable
// {
//     "method": "Runtime.executionContextCreated",
//     "params": {
//       "context": {
//         "id": 1,
//         "origin": "https://www.sheldonbrown.com",
//         "name": "",
//         "uniqueId": "-3915242719240577280.-1499112669313792923",
//         "auxData": {
//           "isDefault": true,
//           "type": "default",
//           "frameId": "01722449B715F987F947A3986446AE6D"
//         }
//       }
//     },
//     "sessionId": "F3184615A24CE21AD40B6F4ED109681D"
//   }

// {
//     "id": 16,
//     "method": "Page.createIsolatedWorld",
//     "params": {
//       "frameId": "01722449B715F987F947A3986446AE6D",
//       "grantUniveralAccess": true,
//       "worldName": "__playwright_utility_world_page@761b4e58888a3abd6eb432e69657677d"
//     },
//     "sessionId": "F3184615A24CE21AD40B6F4ED109681D"
//   }
// {
//     "id": 16,
//     "result": {
//       "executionContextId": 2
//     },
//     "sessionId": "F3184615A24CE21AD40B6F4ED109681D"
//   }
// {
//     "method": "Runtime.executionContextCreated",
//     "params": {
//       "context": {
//         "id": 2,
//         "origin": "",
//         "name": "__playwright_utility_world_page@761b4e58888a3abd6eb432e69657677d",
//         "uniqueId": "-4756990924769249467.9223039481375764124",
//         "auxData": {
//           "isDefault": false,
//           "type": "isolated",
//           "frameId": "01722449B715F987F947A3986446AE6D"
//         }
//       }
//     },
//     "


// {
//     "id": 19,
//     "method": "Runtime.callFunctionOn",
//     "params": {
//       "functionDeclaration": "(utilityScript, ...args) => utilityScript.evaluate(...args)",
//       "objectId": "8199704006095199276.2.1",
//       "arguments": [
//         {
//           "objectId": "8199704006095199276.2.1"
//         },
//         {
//           "value": true
//         },
//         {
//           "value": true
//         },
//         {
//           "value": "() => document.title"
//         },
//         {
//           "value": 1
//         },
//         {
//           "value": {
//             "v": "undefined"
//           }
//         }
//       ],
//       "returnByValue": true,
//       "awaitPromise": true,
//       "userGesture": true
//     },
//     "sessionId": "F3184615A24CE21AD40B6F4ED109681D"
//   }
//       [CDP-PROXY] Target ->
//       {
//         "id": 19,
//         "result": {
//           "result": {
//             "type": "string",
//             "value": "Basic HTML Sample Page"
//           }
//         },
//         "sessionId": "F3184615A24CE21AD40B6F4ED109681D"
//       }


// {
//   "id": 16,
//   "method": "Page.createIsolatedWorld",
//   "params": {
//     "frameId": "773E3798636653D52F18FEC316397498",
//     "grantUniveralAccess": true,
//     "worldName": "__playwright_utility_world_page@b3bb2104848c6c2e49113241dbd9a0ae"
//   },
//   "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
// }
// {
//     "id": 16,
//     "result": {
//       "executionContextId": 5
//     },
//     "sessionId": "2CB8195164A6F0DA8F2124F5C021469E"
//   }
const CDP_CUSTOM_HANDLERS_DISABLED = {}
// Custom handlers for CDP methods (mocked responses instead of forwarding)
const CDP_CUSTOM_HANDLERS: Record<string, (params: any, id: number, sessionId: string) => any> = {
    'Target.setAutoAttach': async (params, id, sessionId) => {
        const response = { id, result: {}, sessionId }
        
        // Send contexts immediately after returning response
        // Don't await - let it happen async but start immediately
        setTimeout(() => {
            sendContexts().then(() => {
                // console.log(`[CDP-PROXY] Sent contexts`)
            })
        }, 0)
        
        return response
    },
    
    'Target.getTargetInfo': (params, id, sessionId) => {
        // Generate random target ID (UUID format)
        const targetId = '00xxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0
            const v = c === 'x' ? r : (r & 0x3 | 0x8)
            return v.toString(16)
        })
        return {
            id,
            result: {
                targetInfo: {
                    targetId,
                    originalType: 'browser',
                    title: '',
                    url: '',
                    attached: true,
                    canAccessOpener: false
                }
            },
            sessionId
        }
    },

    'Runtime.callFunctionOn': (params, id, sessionId) => {
        // Check if this is a document.title call
        const isTitleCall = params.functionDeclaration?.includes('utilityScript.evaluate') &&
                           params.arguments?.some(arg => arg.value === '() => document.title')
        
        if (isTitleCall && params.returnByValue && params.awaitPromise) {
            // Get the target from session mapping
            const targetId = SESSION_TO_TARGET_MAP.get(sessionId)
            const target = CONTEXT_CACHE.find(t => t.id === targetId)
            
            const response = {
                id,
                result: {
                    result: {
                        type: 'string',
                        value: target?.title || ''
                    }
                },
                sessionId
            }
            
            return response
        }
        
        // For other callFunctionOn cases, return empty result
        return {
            id,
            result: { result: { type: 'undefined' } },
            sessionId
        }
    },
    
    'Runtime.evaluate': (params, id, sessionId) => {
        const randomPart1 = Math.floor(Math.random() * 9999999999999999999)
        const randomPart2 = Math.floor(Math.random() * 9) + 1
        const randomPart3 = Math.floor(Math.random() * 9) + 1
        const objectId = `${randomPart1}.${randomPart2}.${randomPart3}`
        
        return {
            id,
            sessionId: sessionId,
            result: {
                result: {
                    type: 'object',
                    className: 'UtilityScript',
                    description: 'UtilityScript',
                    objectId
                }
            }
        }
    },

    'Runtime.enable': async (params, id, sessionId) => {
        const response = {
            id,
            result: {},
            sessionId
        }
        
        // Send execution context created event only for this session's target
        const targetId = SESSION_TO_TARGET_MAP.get(sessionId)
        if (targetId) {
            const target = CONTEXT_CACHE.find(t => t.id === targetId)
            if (target) {
                const contextId = Math.floor(Math.random() * 999) + 1
                const uniqueId = `-${Math.floor(Math.random() * 9999999999999999999)}.${Math.floor(Math.random() * 9999999999999999999)}`
                
                const url = target.url || 'about:blank'
                let origin = ''
                try {
                    if (url.startsWith('http')) {
                        const urlObj = new URL(url)
                        origin = `${urlObj.protocol}//${urlObj.host}`
                    }
                } catch (e) {
                    // Invalid URL, keep empty origin
                }
                
                const contextCreatedEvent = {
                    method: 'Runtime.executionContextCreated',
                    params: {
                        context: {
                            id: contextId,
                            origin,
                            name: '',
                            uniqueId,
                            auxData: {
                                isDefault: true,
                                type: 'default',
                                frameId: target.id
                            }
                        }
                    },
                    sessionId
                }
                
                CDP_SERVER.send(JSON.stringify(contextCreatedEvent))
                console.log('\n')
                console.log(`    [CDP-PROXY] Sent Runtime.executionContextCreated for target ${target.id}:`)
                console.log('    ' + JSON.stringify(contextCreatedEvent, null, 2).split('\n').join('\n    '))
            }
        }
        
        return response
    },

    'Page.createIsolatedWorld': (params, id, sessionId) => {
        // Generate random executionContextId (1-999)
        const executionContextId = Math.floor(Math.random() * 999) + 1
        
        // Generate unique ID (negative number with decimal)
        const uniqueId = `-${Math.floor(Math.random() * 9999999999999999999)}.${Math.floor(Math.random() * 9999999999999999999)}`
        
        const response = {
            id,
            result: {
                executionContextId
            },
            sessionId
        }
    
        
        // Send the context created event immediately after
        const contextCreatedEvent = {
            method: 'Runtime.executionContextCreated',
            params: {
                context: {
                    id: executionContextId,
                    origin: '',
                    name: params.worldName,
                    uniqueId,
                    auxData: {
                        isDefault: false,
                        type: 'isolated',
                        frameId: params.frameId
                    }
                }
            },
            sessionId
        }
        
        // Send the event after a small delay to ensure proper order
        setTimeout(() => {
            CDP_SERVER.send(JSON.stringify(contextCreatedEvent))
            console.log('\n')
            console.log(`    [CDP-PROXY] Sent Runtime.executionContextCreated event:`)
            console.log('    ' + JSON.stringify(contextCreatedEvent, null, 2).split('\n').join('\n    '))
        }, 10)
        
        return response
    },

    'Page.getFrameTree': async (params, id, sessionId) => {
        try {
            // Use cached targets to generate frame tree
            const targets = await getCachedContexts()
            
            // Find the main page target (first one with type 'page' or fallback to first target)
            const mainTarget = targets.find(t => t.type === 'page') || targets[0]
            
            // Generate frame tree based on main target
            const frameId = mainTarget.id || '1'
            const loaderId = Array.from({ length: 16 }, () => 
                Math.floor(Math.random() * 16).toString(16).toUpperCase()
            ).join('')
            
            const url = mainTarget.url || 'about:blank'
            const urlObj = new URL(url.startsWith('http') ? url : 'http://localhost')
            const domainAndRegistry = urlObj.hostname || ''
            const securityOrigin = `${urlObj.protocol}//${urlObj.host}`
            
            return {
                id,
                result: {
                    frameTree: {
                        frame: {
                            id: frameId,
                            loaderId,
                            url,
                            domainAndRegistry,
                            securityOrigin,
                            mimeType: 'text/html',
                            secureContextType: url.startsWith('https') ? 'Secure' : 'InsecureOrigin',
                            crossOriginIsolatedContextType: 'NotIsolated',
                            gatedAPIFeatures: [],
                            "securityOriginDetails": {
                                "isLocalhost": false
                            },
                            "adFrameStatus": {
                                "adFrameType": "none"
                            }
                        },
                        childFrames: []
                    }
                },
                sessionId
            }
        } catch (error) {
            // Fallback frame tree on error
            return {
                id,
                result: {
                    frameTree: {
                        frame: {
                            id: '1',
                            loaderId: '1',
                            url: 'about:blank',
                            domainAndRegistry: '',
                            securityOrigin: 'null',
                            mimeType: 'text/html',
                            secureContextType: 'Secure',
                            crossOriginIsolatedContextType: 'NotIsolated',
                            gatedAPIFeatures: []
                        },
                        childFrames: []
                    }
                },
                sessionId
            }
        }
    },
    
    'Target.createTarget': (params, id, sessionId) => {
        // Generate random target ID (32 hex characters)
        const targetId = Array.from({ length: 32 }, () => 
            Math.floor(Math.random() * 16).toString(16).toUpperCase()
        ).join('')
        return { id, result: { targetId }, sessionId }
    },
    
    'Page.addScriptToEvaluateOnNewDocument': (params, id, sessionId) => {
        // Generate random script identifier
        const identifier = Math.floor(Math.random() * 999999).toString()
        
        // Send Runtime.executionContextCreated event for each cached context
        for (const target of CONTEXT_CACHE) {
            const contextId = Math.floor(Math.random() * 999) + 1
            const uniqueId = `-${Math.floor(Math.random() * 9999999999999999999)}.${Math.floor(Math.random() * 9999999999999999999)}`
            
            // Get the correct sessionId for this target
            const targetSessionId = TARGET_TO_SESSION_MAP.get(target.id)
            if (!targetSessionId) continue // Skip if no session for this target
            
            const contextCreatedEvent = {
                method: 'Runtime.executionContextCreated',
                params: {
                    context: {
                        id: identifier,
                        origin: '',
                        name: params.worldName,
                        uniqueId,
                        auxData: {
                            isDefault: false,
                            type: 'isolated',
                            frameId: target.id
                        }
                    }
                },
                sessionId: targetSessionId
            }
            
            CDP_SERVER.send(JSON.stringify(contextCreatedEvent))
            console.log('\n')
            console.log(`    [CDP-PROXY] Sent Runtime.executionContextCreated for script with session ${targetSessionId}:`)
            console.log('    ' + JSON.stringify(contextCreatedEvent, null, 2).split('\n').join('\n    '))
        }
        
        const response = {
            id,
            result: { identifier },
            sessionId
        }
        
        return response
    },
}

// {
//     "id": 4,
//     "result": {
//       "targetInfo": {
//         "targetId": "84eefdae-d9c0-464c-a385-a9f76b5b06fe",
//         "originalType": "browser",
//         "title": "",
//         "url": "",
//         "attached": true,
//         "canAccessOpener": false
//       }
//     }
//   }

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
    
    // Set global target from env
    CDP_TARGET_HOST = env.CDP_TARGET_HOST || CDP_DEFAULT_HOST
    CDP_TARGET_PORT = env.CDP_TARGET_PORT || CDP_DEFAULT_PORT
    
    // Trigger background cache refresh for /json/list requests
    if (url.pathname === '/json/list') {
        // Refresh cache in background (don't block response)
        fetchAndCacheContexts().catch(error => {
            console.error(`[CDP-PROXY] Background cache refresh failed:`, error)
        })
    }
    
    // Build target URL
    const targetUrl = `http://${CDP_TARGET_HOST}:${CDP_TARGET_PORT}${url.pathname}${url.search}`
    
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
                            if (obj.includes(`ws://${CDP_TARGET_HOST}:${CDP_TARGET_PORT}`)) {
                                modified = true
                                return obj.replace(`ws://${CDP_TARGET_HOST}:${CDP_TARGET_PORT}`, `ws://${proxyHost}`)
                            }
                            // Rewrite HTTP URLs  
                            if (obj.includes(`http://${CDP_TARGET_HOST}:${CDP_TARGET_PORT}`)) {
                                modified = true
                                return obj.replace(`http://${CDP_TARGET_HOST}:${CDP_TARGET_PORT}`, `${url.protocol}//${proxyHost}`)
                            }
                            return obj
                        } else if (Array.isArray(obj)) {
                            return obj.map(rewriteUrlsInObject)
                        } else if (obj && typeof obj === 'object') {
                            const rewritten = {}
                            
                            // Rewrite targetInfo.type to "page" and preserve original in xe-meta
                            if (obj.type && obj.type !== 'page' && obj.type !== 'browser' && obj.type !== 'service_worker' && obj.type !== 'worker' && (obj.webSocketDebuggerUrl || obj.devtoolsFrontendUrl)) {
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

async function fetchAndCacheContexts(): Promise<any[]> {
    try {
        const listUrl = `http://${CDP_TARGET_HOST}:${CDP_TARGET_PORT}/json/list`
        const response = await fetch(listUrl)
        const targets = await response.json() as any[]
        
        // Update cache
        CONTEXT_CACHE = targets
        CONTEXT_CACHE_TIMESTAMP = Date.now()
        
        console.log(`[CDP-PROXY] Cached ${targets.length} contexts`)
        return targets
    } catch (error) {
        console.error(`[CDP-PROXY] Failed to fetch contexts:`, error)
        return CONTEXT_CACHE // Return existing cache on error
    }
}

async function getCachedContexts(): Promise<any[]> {
    const now = Date.now()
    
    // If cache is empty, fetch synchronously
    if (CONTEXT_CACHE.length === 0) {
        return await fetchAndCacheContexts()
    }
    
    // If cache is expired, refresh in background but return stale data immediately
    // if ((now - CONTEXT_CACHE_TIMESTAMP) > CONTEXT_CACHE_TTL) {
        // Refresh in background (don't await)
        fetchAndCacheContexts().catch(error => {
            console.error(`[CDP-PROXY] Background cache refresh failed:`, error)
        })
    // }
    
    // Always return current cache immediately
    return CONTEXT_CACHE
}

async function sendContexts() {
    if (!CDP_SERVER) {
        return
    }
    
    try {
        const targets = await getCachedContexts()
        // console.log(`[CDP-PROXY] Found ${targets.length} targets`)
        for (const target of targets) {
            // Skip if we already sent this target ID
            if (SENT_CONTEXT_TARGET_IDS.has(target.id)) {
                // console.log(`[CDP-PROXY] Skipping already sent target: ${target.id}`)
                continue
            }
            
            // Generate random sessionId (32 hex characters uppercase)
            const sessionId = Array.from({ length: 32 }, () => 
                Math.floor(Math.random() * 16).toString(16).toUpperCase()
            ).join('')
            
            // Generate random browserContextId if not present
            const browserContextId = target.browserContextId || Array.from({ length: 32 }, () => 
                Math.floor(Math.random() * 16).toString(16).toUpperCase()
            ).join('')
            
            // Rewrite target type if needed (preserve original in xe-meta)
            let targetType = target.type
            let xeMeta: any = undefined
            if (targetType && targetType !== 'page' && targetType !== 'browser' && targetType !== 'service_worker' && targetType !== 'worker') {
                xeMeta = { originalType: targetType }
                targetType = 'page'
            }
            
            const targetInfo: any = {
                targetId: target.id,
                type: targetType,
                title: target.title || '',
                url: target.url || '',
                attached: true,
                canAccessOpener: false,
                browserContextId
            }
            
            if (xeMeta) {
                targetInfo['xe-meta'] = xeMeta
            }
            
            const message = {
                method: 'Target.attachedToTarget',
                params: {
                    sessionId,
                    targetInfo,
                    waitingForDebugger: false
                }
            }
            
            CDP_SERVER.send(JSON.stringify(message))
            console.log(`    [CDP-PROXY] Sent context:`)
            console.log('    ' + JSON.stringify(message, null, 2).split('\n').join('\n    '))
            
            // Mark this target ID as sent and store session mapping
            SENT_CONTEXT_TARGET_IDS.add(target.id)
            SESSION_TO_TARGET_MAP.set(sessionId, target.id)
            TARGET_TO_SESSION_MAP.set(target.id, sessionId)
        }
    } catch (error) {
        console.error(`[CDP-PROXY] Failed to send contexts:`, error)
    }
}

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    
    // Set global target from env
    CDP_TARGET_HOST = env.CDP_TARGET_HOST || CDP_DEFAULT_HOST
    CDP_TARGET_PORT = env.CDP_TARGET_PORT || CDP_DEFAULT_PORT
    
    // Extract WebSocket path (usually something like /devtools/page/{id})
    const wsPath = url.pathname + url.search
    const targetWsUrl = `ws://${CDP_TARGET_HOST}:${CDP_TARGET_PORT}${wsPath}`
    
    // Create WebSocket pair for client connection
    const webSocketPair = new WebSocketPair()
    const [client, server]: [CloudflareWebSocket, CloudflareWebSocket] = [webSocketPair[0], webSocketPair[1]]
    
    // Accept the client connection
    server.accept()
    
    // Set global server
    CDP_SERVER = server
    
    const connectionId = `conn_${++connectionCounter}`
    
    // Connect to the CDP target
    let targetWs: WebSocket
    
    try {
        targetWs = new WebSocket(targetWsUrl)
        connections.set(connectionId, targetWs)
        
        // Handle target WebSocket events
        targetWs.addEventListener('open', async () => {
            // Fetch and cache contexts on startup
            await fetchAndCacheContexts()
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
                        if (obj.targetInfo && obj.targetInfo.type && obj.targetInfo.type !== 'page' && obj.targetInfo.type !== 'browser' && obj.targetInfo.type !== 'service_worker' && obj.targetInfo.type !== 'worker') {
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
                
                console.log(`    [CDP-PROXY] Target ->`)
                console.log('    ' + JSON.stringify(rewrittenPayload, null, 2).split('\n').join('\n    '))
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
    server.addEventListener('message', async (event) => {
        const message = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
        
        let shouldForward = false
        let customHandlerResponse = null
        let messageId = null
        
        // Parse and log JSON payload
        try {
            const jsonPayload = JSON.parse(message)
            console.log('\n')
            console.log(`[CDP-PROXY] Client ->`)
            console.log(JSON.stringify(jsonPayload, null, 2))
            
            messageId = jsonPayload.id
            
            // Check if wildcard is enabled (whitelist all)
            const whitelistAll = CDP_METHOD_WHITELIST.includes('*')
            
            // BLOCKLIST TAKES HIGHEST PRECEDENCE (even over whitelist)
            if (jsonPayload.method && CDP_METHOD_BLOCKLIST.includes(jsonPayload.method)) {
                customHandlerResponse = { id: jsonPayload.id, result: {} }
                if (jsonPayload.sessionId) {
                    customHandlerResponse.sessionId = jsonPayload.sessionId
                }
                // console.log(`[CDP-PROXY] 🚫 Method ${jsonPayload.method} is BLOCKLISTED, returning empty result`)
            } else if (jsonPayload.method && !whitelistAll && (CDP_METHOD_WHITELIST.includes(jsonPayload.method))) {
                // specific Whitelisted - always forward to browser
                shouldForward = true
                // console.log(`[CDP-PROXY] ✓ Method ${jsonPayload.method} is whitelisted${whitelistAll ? ' (*)' : ''}, forwarding to browser`)
            } else if (jsonPayload.method && CDP_CUSTOM_HANDLERS[jsonPayload.method]) {
                const handler =  CDP_CUSTOM_HANDLERS[jsonPayload.method]
                customHandlerResponse = await handler(jsonPayload.params, jsonPayload.id, jsonPayload.sessionId)
                //  console.log(`[CDP-PROXY] 🔧 Method ${jsonPayload.method} has custom handler, returning mock response`)
            } else if (whitelistAll) {
                // all whitelist mode is lower than rewriters
                shouldForward = true
                // console.log(`[CDP-PROXY] ✓ Method ${jsonPayload.method} is whitelisted${whitelistAll ? ' (*)' : ''}, forwarding to browser`)
            } else if (jsonPayload.method) {
                customHandlerResponse = { id: jsonPayload.id, result: {} }
                if (jsonPayload.sessionId) {
                    customHandlerResponse.sessionId = jsonPayload.sessionId
                }
                // console.log(`[CDP-PROXY] 🚫 Method ${jsonPayload.method} is NOT whitelisted, returning empty result`)
            }
        } catch (parseError) {
            // Skip non-JSON
        }
        
        // Send custom handler response if available
        if (customHandlerResponse) {
            try {
                await new Promise(resolve => setTimeout(resolve, 200))
                server.send(JSON.stringify(customHandlerResponse))
                console.log('\n')
                console.log(`    [CDP-PROXY] Target -> (mocked):`)
                console.log('    ' + JSON.stringify(customHandlerResponse, null, 2).split('\n').join('\n    '))
            } catch (error) {
                console.error(error)
            }
        }
        // Forward to browser only if whitelisted
        else if (shouldForward) {
            try {
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(message)
                } else {
                    server.close(1011, 'Target not ready')
                }
            } catch (error) {
                console.error(error)
            }
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

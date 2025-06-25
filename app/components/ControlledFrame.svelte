<script module>
    window.instances = new Map()

    console.log('starting garbage collector')
    // garbage collect instances that are not in the tabs array every 15 minutes
    setInterval(() => {
        window.instances.forEach(instance => {
            console.log('inspecting for gb instance', instance)
        })
    }, 900000)
</script>

<script>
    import { untrack } from 'svelte'
    // import { fade } from 'svelte/transition'

    let {
        style = '',
        tab, 
        tabs,
        headerPartOfMain,
        isScrolling,
        captureTabScreenshot,
        onFrameFocus = () => {},
        onFrameBlur = () => {},
        userMods,
        requestedResources,

        hoveredLink = $bindable(),
        linkPreviewVisible = $bindable(),
        linkPreviewTimeout = $bindable(),
        inputDiffVisible = $bindable(),
        inputDiffTimeout = $bindable(),
        inputDiffData = $bindable(),
    } = $props()

    let wrapper = $state(null)
    let anchor = $state(null)

    let initialUrl = $state('')

    function handlePermissionRequest(eventName, tab, event) {
        requestedResources.push({
            permission: event.permission,
            url: event.url || tab.url,
            tabId: tab.id,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            id: 'camera',
            name: 'Camera',
            icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>`,
            description: 'Camera access for photos and video capture',
            lastUsed: 'now', status: 'Request'
        })

        console.log(`🔒 [Permission Request] Tab ${tab.id}: ${event.permission}`)
        console.log('📋 Permission request details:', {
            permission: event.permission,
            url: event.url || tab.url,
            tabId: tab.id,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        })
        
        // Grant all permissions but log them for monitoring
        try {
            event.request.allow()
            console.log(`✅ [Permission Granted] ${event.permission} granted for ${event.url || tab.url}`)
        } catch (error) {
            console.error(`❌ [Permission Error] Failed to grant ${event.permission}:`, error)
        }
    }

    function handleEvent(eventName, tab, event) {
        // console.log(eventName, tab, event)
    }

    function handleContentLoad(tab, event) {
        setTimeout(() => updateTabMeta(tab), 100)
    }

    // todo cycle every 5 seconds to non hibernated tabs to check audiostate 
    // function updateTabAudioState (frame) {
    //     if (frame && typeof frame.getAudioState === 'function') {
    //         frame.getAudioState().then(audible => {
    //             const tabId = frame.id.replace('tab_', '')
    //             const tabIndex = tabs.findIndex(t => t.id === tabId)
    //             if (tabIndex !== -1) {
    //                 tabs[tabIndex].audioPlaying = audible
    //             }
    //         }).catch(err => {
    //             console.log('Error getting audio state:', err)
    //         })
    //     }
    // }

    function handleLoadCommit(tab, event) {
        // console.log('Page loaded:', event.url)
        
        // Update the URL immediately
        // tab.url = event.url
        
        // Update the favicon URL
        // tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${event.url}&size=64`
    }

    function handleAudioStateChanged (tab, event) {
        tab.audioPlaying = event.audible
    }

    function handleLoadStart(tab) {
       tab.loading = true
    }

    function handleLoadStop(tab) {
        tab.loading = false

        tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${tab.url}&size=64`
        
        // Update title and capture screenshot after page loads
        setTimeout(async () => {
            await updateTabMeta(tab)
            await captureTabScreenshot(tab)
        }, 2) // Wait a bit for the page to fully render
    }

    function handleNewWindow(tab, e) {
        console.log('New window request:', e)
        
        // Check if this looks like an OAuth popup based on URL patterns or window features
        const isOAuthPopup = e.targetUrl && (
            // Generic OAuth patterns
            e.targetUrl.includes('oauth') || 
            e.targetUrl.includes('auth') || 
            e.targetUrl.includes('login') ||
            e.targetUrl.includes('sso') ||
            e.targetUrl.includes('authorize') ||
            e.targetUrl.includes('connect') ||
            // Specific OAuth providers
            e.targetUrl.includes('accounts.google.com') ||
            e.targetUrl.includes('github.com/login') ||
            e.targetUrl.includes('api.twitter.com/oauth') ||
            e.targetUrl.includes('facebook.com/dialog/oauth') ||
            e.targetUrl.includes('api.linkedin.com/oauth') ||
            e.targetUrl.includes('discord.com/api/oauth2') ||
            e.targetUrl.includes('slack.com/oauth') ||
            e.targetUrl.includes('login.microsoftonline.com') ||
            e.targetUrl.includes('appleid.apple.com/auth') ||
            e.targetUrl.includes('auth0.com') ||
            e.targetUrl.includes('okta.com') ||
            // Small popup window dimensions are typically OAuth
            (e.initialWidth && e.initialHeight && e.initialWidth < 800 && e.initialHeight < 700) ||
            // Named popup windows for OAuth
            (e.name && (e.name.includes('oauth') || e.name.includes('auth') || e.name.includes('login')))
        )

        if (isOAuthPopup && controlledFrameSupported) {
            handleOAuthPopup(tab, e)
        } else {
            // Regular new window - create a new tab
            tabs.push({ 
                id: crypto.randomUUID(),
                url: e.targetUrl, 
                title: e.title, 
                favicon: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${e.targetUrl}&size=64`,
                audioPlaying: false,
                screenshot: null,
                pinned: false,
                muted: false,
                loading: false
            })
            
        }
    }

    // Handle OAuth popup windows with proper window.opener support
    function handleOAuthPopup(parentTab, e) {
        console.log('Creating OAuth popup for:', e.targetUrl)
        
        // Set reactive state to show popup
        oauthPopup = {
            url: e.targetUrl,
            width: e.initialWidth || 500,
            height: e.initialHeight || 600,
            parentTab,
            event: e
        }
    }

    async function updateTabMeta(tab, frame = null) {
        if (!frame) {
            frame = tab.frame //  document.getElementById(`tab_${tab.id}`)
        }
        if (!frame) return

        tab.url = frame.src
        tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${tab.url}&size=64`

        try {
            let title = null

            try {
                const result = await frame.executeScript({
                    code: 'document.title'
                })
                if (result && result[0] && result[0].trim()) {
                    title = result[0].trim()
                }
            } catch (scriptErr) {
                console.log('executeScript failed for title:', scriptErr)
            }

            // Update the tab title directly
            if (title && title !== 'about:blank') {
                tab.title = title
            } else {
                // Fallback to URL if no title is available
                const url = tab.url
                if (url && url !== 'about:blank') {
                    try {
                        const urlObj = new URL(url)
                        tab.title = urlObj.hostname || url
                    } catch {
                        tab.title = url
                    }
                }
            }

        } catch (err) {
            console.log('Error updating tab title:', err)
        }
    }

// Content script for window focus/blur handling
function setupContentScripts(frame) {
        // First try a simple test script to verify content script injection works
        const systemInjections = [
            {
                name: 'system-css',
                matches: ['<all_urls>', 'http://*/*', 'https://*/*'],
                css: {
                    // fix scroll bug in PWA/IWA that makes scroll janky on child element scrolling
                    code: `* {
            overscroll-behavior-x: none;
        }`
                }
            },    
        {
            name: 'system-script',
            matches: ['<all_urls>', 'http://*/*', 'https://*/*'],
            js: {
                code: `
window.addEventListener('focus', () => { console.log('iwa:focus') }, false);
window.addEventListener('blur', () => { console.log('iwa:blur') }, false);

// Global keyboard event listener for controlled frame
document.addEventListener('keydown', function(event) {
    // Check for Cmd+W (Mac) or Ctrl+W (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
        console.log('iwa:close-tab:${tab.id}');
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
    }
    
    // Check for Cmd+T (Mac) or Ctrl+T (Windows/Linux) 
    if ((event.metaKey || event.ctrlKey) && event.key === 't') {
        console.log('iwa:new-tab:${tab.id}');
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
    }
}, { capture: true, passive: false });

// Global wheel event listener for controlled frame zoom control
document.addEventListener('wheel', function(event) {
    // Check for Ctrl key (Windows/Linux) or Cmd key (Mac) - same as zoom prevention in main app
    if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Determine zoom direction based on deltaY
        const zoomDirection = event.deltaY < 0 ? 'in' : 'out';
        
        // Log zoom direction to console IPC system
        console.log('iwa:zoom:${tab.id}:' + zoomDirection);
        
        return false;
    }
}, { capture: true, passive: false });

// Track hovered anchor elements
let currentHoveredAnchor = null;

document.addEventListener('mouseover', function(event) {
    // Find the closest anchor element in the event path
    const anchor = event.target.closest('a');
    
    // Only log if we're hovering a new anchor (different from the last one)
    if (anchor && anchor !== currentHoveredAnchor) {
        currentHoveredAnchor = anchor;
        
        // Log anchor enter with details
        console.log('iwa:link-enter:${tab.id}:' + JSON.stringify({
            href: anchor.href || anchor.getAttribute('href') || '',
            target: anchor.target || anchor.getAttribute('target') || '',
            rel: anchor.rel || anchor.getAttribute('rel') || '',
            title: anchor.title || anchor.getAttribute('title') || ''
        }));
    } else if (!anchor && currentHoveredAnchor) {
        // Left the anchor element
        console.log('iwa:link-leave:${tab.id}:' + JSON.stringify({
            href: currentHoveredAnchor.href || currentHoveredAnchor.getAttribute('href') || ''
        }));
        currentHoveredAnchor = null;
    }
}, { capture: true, passive: true });

// Track text input changes with debouncing
let inputDebounceTimeouts = new Map();
const INPUT_DEBOUNCE_DELAY = 750; // 0.75 seconds

function isTextInputElement(element) {
    if (!element) return false;
    
    // Check for input elements with text-like types (excluding password)
    if (element.tagName === 'INPUT') {
        const type = (element.type || 'text').toLowerCase();
        const textTypes = ['text', 'email', 'search', 'tel', 'url', 'number'];
        return textTypes.includes(type);
    }
    
    // Check for textarea elements
    if (element.tagName === 'TEXTAREA') {
        return true;
    }
    
    // Check for contenteditable elements
    if (element.contentEditable === 'true') {
        return true;
    }
    
    return false;
}

// Global drag and drop event listeners for controlled frame content
function setupDragDropListeners() {
    let dragEventCounter = 0;
    
    function logDragDropEvent(eventType, event) {
        const eventData = {
            type: eventType,
            timestamp: new Date().toISOString(),
            frameId: '${tab.id}',
            target: {
                tagName: event.target?.tagName,
                id: event.target?.id,
                className: event.target?.className,
                textContent: event.target?.textContent?.slice(0, 50),
            },
            coordinates: {
                clientX: event.clientX,
                clientY: event.clientY,
                screenX: event.screenX,
                screenY: event.screenY,
            },
            dataTransfer: {
                dropEffect: event.dataTransfer?.dropEffect,
                effectAllowed: event.dataTransfer?.effectAllowed,
                types: event.dataTransfer?.types ? Array.from(event.dataTransfer.types) : [],
                filesCount: event.dataTransfer?.files ? event.dataTransfer.files.length : 0,
            },
            modifierKeys: {
                altKey: event.altKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                shiftKey: event.shiftKey,
            }
        };
        
        // Send drag/drop event data to parent via console
        console.log('iwa:dragdrop:${tab.id}:' + JSON.stringify(eventData));
    }
    
    // Dragstart - when user starts dragging an element
    document.addEventListener('dragstart', (event) => {
        logDragDropEvent('dragstart', event);
    }, { capture: true });
    
    // Drag - during the drag operation (throttled)
    document.addEventListener('drag', (event) => {
        dragEventCounter++;
        if (dragEventCounter % 10 === 0) {
            logDragDropEvent('drag', event);
        }
    }, { capture: true });
    
    // Dragenter - when dragged item enters a drop target
    document.addEventListener('dragenter', (event) => {
        logDragDropEvent('dragenter', event);
    }, { capture: true });
    
    // Dragover - when dragged item is over a drop target
    document.addEventListener('dragover', (event) => {
        logDragDropEvent('dragover', event);
    }, { capture: true });
    
    // Dragleave - when dragged item leaves a drop target  
    document.addEventListener('dragleave', (event) => {
        logDragDropEvent('dragleave', event);
    }, { capture: true });
    
    // Drop - when dragged item is dropped
    document.addEventListener('drop', (event) => {
        logDragDropEvent('drop', event);
        
        // Try to get additional data for drops
        if (event.dataTransfer) {
            const additionalData = {
                files: Array.from(event.dataTransfer.files).map(f => ({
                    name: f.name,
                    size: f.size,
                    type: f.type
                })),
                textData: {},
            };
            
            // Try to get text data
            try {
                additionalData.textData['text/plain'] = event.dataTransfer.getData('text/plain');
                additionalData.textData['text/uri-list'] = event.dataTransfer.getData('text/uri-list');
                additionalData.textData['text/html'] = event.dataTransfer.getData('text/html');
            } catch (e) {
                console.log('Could not read dataTransfer text data:', e);
            }
            
            console.log('iwa:dragdrop-data:${tab.id}:' + JSON.stringify(additionalData));
        }
    }, { capture: true });
    
    // Dragend - when drag operation ends
    document.addEventListener('dragend', (event) => {
        logDragDropEvent('dragend', event);
        dragEventCounter = 0; // Reset counter
    }, { capture: true });
    
    console.log('🎯 Drag&Drop listeners installed in controlled frame ${tab.id}');
}

// Initialize drag and drop listeners
setupDragDropListeners();

function getElementIdentifier(element) {
    // Create a unique identifier for the element
    const id = element.id || '';
    const name = element.name || '';
    const placeholder = element.placeholder || '';
    const className = element.className || '';
    const tagName = element.tagName.toLowerCase();
    
    return \`\${tagName}[\${id ? 'id="' + id + '"' : ''}]\${name ? '[name="' + name + '"]' : ''}\${className ? '[class="' + className + '"]' : ''}\${placeholder ? '[placeholder="' + placeholder + '"]' : ''}\`;
}

function getElementText(element) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        return element.value || '';
    } else if (element.contentEditable === 'true') {
        return element.textContent || element.innerText || '';
    }
    return '';
}

document.addEventListener('input', function(event) {
    const element = event.target;
    
    if (!isTextInputElement(element)) {
        return;
    }
    
    const elementId = getElementIdentifier(element);
    
    // Clear existing timeout for this element
    if (inputDebounceTimeouts.has(elementId)) {
        clearTimeout(inputDebounceTimeouts.get(elementId));
    }
    
    // Set new timeout
    const timeoutId = setTimeout(() => {
        const currentText = getElementText(element);
        
        // Only log if there's actual text content
        if (currentText.trim().length > 0) {
            console.log('iwa:input-text:${tab.id}:' + JSON.stringify({
                element: elementId,
                text: currentText,
                length: currentText.length,
                timestamp: Date.now()
            }));
        }
        
        // Clean up the timeout
        inputDebounceTimeouts.delete(elementId);
    }, INPUT_DEBOUNCE_DELAY);
    
    inputDebounceTimeouts.set(elementId, timeoutId);
}, { capture: true, passive: true });
`,
            },
            runAt: 'document-end',
            allFrames: true
        }]

        const userInjections = [
            ...userMods.css.map(mod => {
                return {
                    name: mod.name,
                    matches: [mod.pattern.replace(/^\*/g, '<all_urls>')],
                    css: {
                        code: mod.content
                    }
                }
            }),
            ...userMods.js.map(mod => {
                return {
                    name: mod.name,
                    matches: [mod.pattern.replace(/^\*/g, '<all_urls>')],
                    js: {
                        code: mod.content
                    }
                }
            })
        ]

        console.log('trying' , tab.id)

        if (!frame.addContentScripts) {
            initialUrl = untrack(() => tab.url)
        } else {
            frame.addContentScripts([...systemInjections, ...userInjections]).then((res) => {
            console.log('✅ Injections added successfully', res)

            initialUrl = untrack(() => tab.url)
            
            // Now add the focus/blur script
            // return frame.addContentScripts([contentScript])
            }).catch((err) => {
                console.error('❌ inject error:', err)
            })
        }
    }


    // WebRequest logger - logs all network requests with full details
    function setupRequestHandler(frame) {
        if (!frame.request) {
            console.log('WebRequest API not available')
            return
        }

        // Filter to capture all URLs
        const allUrlsFilter = { urls: ['<all_urls>'] }

        // Headers to strip from responses for security isolation
        const headersToHandle = [
            'cross-origin-embedder-policy',
            'cross-origin-opener-policy',
            'cross-origin-embedder-policy-report-only',
            'cross-origin-opener-policy-report-only',
        ]

        // Get the app's own origin for CSP injection
        const appOrigin = window.location.origin

        // Log all request events with full details
        frame.request.onBeforeRequest.addListener((details) => {
            const url = new URL(details.url)
            // console.group(`🌐 onBeforeRequest: ${details.method}`, url)
            // console.log('📋 Request Details:', {
            //     requestId: details.requestId,
            //     url: details.url,
            //     method: details.method,
            //     type: details.type,
            //     frameId: details.frameId,
            //     parentFrameId: details.parentFrameId,
            //     timeStamp: details.timeStamp,
            //     documentId: details.documentId,
            //     documentLifecycle: details.documentLifecycle,
            //     frameType: details.frameType,
            //     initiator: details.initiator,
            //     requestBody: details.requestBody
            // })
            // console.groupEnd()


            if (url.hostname === 'code.xe') {
                return {
                    redirectUrl: 'https://google.com',
                    responseHeaders: [
                        {
                            name: 'Content-Type',
                            value: 'text/html'
                        }
                    ]
                }
            }

            const block = details.url.indexOf("google-analytics.com") != -1

            // block && console.log('blocking', details.url)
            return { cancel: block }
        }, allUrlsFilter, ['blocking', 'requestBody'])

        // Helper function to parse and modify CSP directives
        function enhanceCSPWithOrigin(cspValue, appOrigin) {
            if (!cspValue || !appOrigin) return cspValue

            // Parse CSP directives
            const directives = cspValue.split(';').map(dir => dir.trim()).filter(dir => dir)
            const enhancedDirectives = []

            // Directives that should include the app origin
            const directivesToEnhance = [
                'default-src', 'script-src', 'style-src', 'img-src', 
                'font-src', 'connect-src', 'media-src', 'child-src', 
                'worker-src', 'frame-src'
            ]

            for (const directive of directives) {
                const [name, ...sources] = directive.split(/\s+/)
                const directiveName = name.toLowerCase()

                if (directivesToEnhance.includes(directiveName)) {
                    // Check if app origin is already present
                    const sourcesStr = sources.join(' ')
                    if (!sourcesStr.includes(appOrigin)) {
                        // Add app origin to this directive
                        enhancedDirectives.push(`${name} ${sources.join(' ')} ${appOrigin}`.trim())
                    } else {
                        // Already contains app origin, keep as is
                        enhancedDirectives.push(directive)
                    }
                } else {
                    // Keep directive as is
                    enhancedDirectives.push(directive)
                }
            }

            return enhancedDirectives.join('; ')
        }

        // Handle response headers - strip some security headers and enhance CSP with app origin
        frame.request.onHeadersReceived.addListener((details) => {
            if (!details.responseHeaders) return

            const modifiedHeaders = []

            // Process each header
            for (const header of details.responseHeaders) {
                const headerName = header.name.toLowerCase()
                
                if (headerName === 'content-security-policy') {
                    // Enhance existing CSP with app origin
                    const enhancedCSP = enhanceCSPWithOrigin(header.value, appOrigin)
                    modifiedHeaders.push({
                        name: header.name,
                        value: enhancedCSP
                    })
                    // console.log('🔒 Enhanced CSP:', { original: header.value, enhanced: enhancedCSP })
                } else if (headerName === 'content-security-policy-report-only') {
                    // Enhance existing CSP report-only with app origin
                    const enhancedCSP = enhanceCSPWithOrigin(header.value, appOrigin)
                    modifiedHeaders.push({
                        name: header.name,
                        value: enhancedCSP
                    })
                    //console.log('🔒 Enhanced CSP Report-Only:', { original: header.value, enhanced: enhancedCSP })
                } else if (headersToHandle.includes(headerName)) {
                     // Strip these headers but don't add them to modifiedHeaders
                     //console.log('🚫 Stripped header:', headerName)
                 } else {
                     // Keep other headers as is
                     modifiedHeaders.push(header)
                 }
             }

            // Add Cross-Origin policies that allow communication with app
            modifiedHeaders.push({
                name: 'Cross-Origin-Embedder-Policy',
                value: 'unsafe-none'
            })

            modifiedHeaders.push({
                name: 'Cross-Origin-Opener-Policy',
                value: 'same-origin-allow-popups'
            })

            // console.log('🔒 Modified response headers for:', details.url, {
            //     originalCount: details.responseHeaders.length,
            //     modifiedCount: modifiedHeaders.length,
            //     injectedOrigin: appOrigin
            // })

            return { 
                responseHeaders: modifiedHeaders 
            }
        }, allUrlsFilter, ['blocking', 'responseHeaders'])

        frame.request.onAuthRequired.addListener((details) => {
            console.log('🔐 Auth Required:', {
                requestId: details.requestId,
                url: details.url,
                challenger: details.challenger,
                scheme: details.scheme,
                realm: details.realm,
                isProxy: details.isProxy
            })
        }, allUrlsFilter)

        frame.request.onBeforeRedirect.addListener((details) => {
            console.log('🔄 Redirect:', {
                requestId: details.requestId,
                url: details.url,
                redirectUrl: details.redirectUrl,
                statusCode: details.statusCode,
                fromCache: details.fromCache,
                ip: details.ip
            })
        }, allUrlsFilter)

        // frame.request.onResponseStarted.addListener((details) => {
        //     console.log('📡 Response Started:', {
        //         requestId: details.requestId,
        //         url: details.url,
        //         statusCode: details.statusCode,
        //         fromCache: details.fromCache,
        //         ip: details.ip
        //     })
        // }, allUrlsFilter)

        frame.request.onCompleted.addListener((details) => {
            // console.log('✅ Request Completed:', {
            //     requestId: details.requestId,
            //     url: details.url,
            //     statusCode: details.statusCode,
            //     fromCache: details.fromCache,
            //     ip: details.ip
            // })
        }, allUrlsFilter)

        frame.request.onErrorOccurred.addListener((details) => {
            // console.error('❌ Request Error:', {
            //     requestId: details.requestId,
            //     url: details.url,
            //     error: details.error,
            //     fromCache: details.fromCache,
            //     ip: details.ip
            // })
        }, allUrlsFilter)
    }

    // Context menu setup - adds a context menu entry and logs all data
    function setupContextMenu(frame) {
        if (!frame.contextMenus) {
            console.log('Context Menus API not available')
            return
        }

        // Create a context menu item called "Here"
        frame.contextMenus.create({
            id: 'here',
            title: 'Here',
            contexts: ['all'], // Show on all types of content
            onclick: (info) => {
                // console.group('🎯 Context Menu "Here" clicked!')
                // console.log('📋 OnClickData:', {
                //     checked: info.checked,
                //     editable: info.editable,
                //     frameId: info.frameId,
                //     frameUrl: info.frameUrl,
                //     linkUrl: info.linkUrl,
                //     mediaType: info.mediaType,
                //     menuItemId: info.menuItemId,
                //     pageUrl: info.pageUrl,
                //     parentMenuId: info.parentMenuId,
                //     selectionText: info.selectionText,
                //     srcUrl: info.srcUrl,
                //     wasChecked: info.wasChecked
                // })
                // console.log('📋 Raw info object:', info)
                // console.log('📋 Tab data:', tab)
                // console.groupEnd()
            }
        }).then(() => {
            console.log('✅ Context menu "Here" created successfully')
        }).catch((err) => {
            console.error('❌ Failed to create context menu:', err)
        })

        // Also listen to onClicked event for additional logging
        frame.contextMenus.onClicked.addListener((info) => {
            console.log('🎯 Context menu onClicked event:', info)
        })

        // Listen to onShow event
        frame.contextMenus.onShow.addListener((info) => {
            console.log('👁️ Context menu onShow event:', info)
        })
    }

    // Input text diff state
    let currentInputText = $state('')
    let previousInputText = $state('')

    // Listen for messages from content scripts
    function setupMessageListener(frame) {
        // Listen for messages from the controlled frame's content window
        // if (frame.contentWindow) {
        //     frame.contentWindow.addEventListener('message', (event) => {
        //         console.log('message', event)
        //         if (event.data?.type === 'controlled-frame-focus' && event.data?.tabId === tab.id) {
        //             console.log(`🎯 Tab ${tab.id} gained focus`)
        //             onFrameFocus()
        //         } else if (event.data?.type === 'controlled-frame-blur' && event.data?.tabId === tab.id) {
        //             console.log(`😴 Tab ${tab.id} lost focus`)
        //             onFrameBlur()
        //         }
        //     })
        // }
        
        // Also listen on main window as fallback for cross-origin messages
        // window.addEventListener('message', (event) => {
        //     console.log('message', event)
        //     // Check if message is from the controlled frame
        //     if (event.source === frame.contentWindow && event.data?.tabId === tab.id) {
        //         if (event.data?.type === 'controlled-frame-focus') {
        //             console.log(`🎯 Tab ${tab.id} gained focus (cross-origin)`)
        //             onFrameFocus()
        //         } else if (event.data?.type === 'controlled-frame-blur') {
        //             console.log(`😴 Tab ${tab.id} lost focus (cross-origin)`)
        //             onFrameBlur()
        //         }
        //     }
        // })

        frame.addEventListener('consolemessage', (event) => {
            // console.log('consolemessage', event)
            const message = event.message
            
            if (message === 'iwa:focus') {
                onFrameFocus()
            } else if (message === 'iwa:blur') {
                onFrameBlur()
            } else if (message.startsWith('iwa:close-tab:')) {
                // Extract tab ID from message
                const tabId = message.split(':')[2]
                console.log(`Controlled frame ${tabId} requested tab close`)
                
                // Dispatch custom event to app shell to close this tab
                window.dispatchEvent(new CustomEvent('darc-close-tab-from-frame', {
                    detail: { 
                        tabId: tabId,
                        sourceFrame: `tab_${tab.id}`
                    }
                }))
            } else if (message.startsWith('iwa:new-tab:')) {
                // Extract tab ID from message  
                const tabId = message.split(':')[2]
                console.log(`Controlled frame ${tabId} requested new tab`)
                
                // Dispatch custom event to app shell to open new tab
                window.dispatchEvent(new CustomEvent('darc-new-tab-from-frame', {
                    detail: { 
                        tabId: tabId,
                        sourceFrame: `tab_${tab.id}`
                    }
                }))
            } else if (message.startsWith('iwa:link-enter:')) {
                // Parse link enter event
                const parts = message.split(':')
                const tabId = parts[2]
                try {
                    const linkData = JSON.parse(parts.slice(3).join(':'))
                    console.log(`[Tab ${tabId}] Link enter:`, linkData)
                    
                    // Show link preview if it's for this tab
                    if (tabId === tab.id && linkData.href) {
                        hoveredLink = linkData
                        linkPreviewVisible = true
                        
                        // Clear any existing timeout
                        if (linkPreviewTimeout) {
                            clearTimeout(linkPreviewTimeout)
                            linkPreviewTimeout = null
                        }
                        
                        // Set timeout to auto-hide after 1.5 seconds (similar to origin preview)
                        linkPreviewTimeout = setTimeout(() => {
                            linkPreviewVisible = false
                            hoveredLink = null
                            linkPreviewTimeout = null
                        }, 1500)
                    }
                } catch (error) {
                    console.error('Failed to parse link enter data:', error)
                }
            } else if (message.startsWith('iwa:link-leave:')) {
                // Parse link leave event
                const parts = message.split(':')
                const tabId = parts[2]
                try {
                    const linkData = JSON.parse(parts.slice(3).join(':'))
                    console.log(`[Tab ${tabId}] Link leave:`, linkData)
                    
                    // Hide link preview immediately if it's for this tab
                    if (tabId === tab.id) {
                        linkPreviewVisible = false
                        hoveredLink = null
                        
                        // Clear any existing timeout
                        if (linkPreviewTimeout) {
                            clearTimeout(linkPreviewTimeout)
                            linkPreviewTimeout = null
                        }
                    }
                } catch (error) {
                    console.error('Failed to parse link leave data:', error)
                }
            } else if (message.startsWith('iwa:input-text:')) {
                // Parse input text event
                const parts = message.split(':')
                const tabId = parts[2]
                try {
                    const inputData = JSON.parse(parts.slice(3).join(':'))
                    // console.log(`[Tab ${tabId}] Input text:`, inputData)
                    
                    // Show input diff if it's for this tab and has meaningful text
                    if (tabId === tab.id && inputData.text && inputData.text.length > 3) {
                        showInputDiff(inputData)
                    }
                } catch (error) {
                    console.error('Failed to parse input text data:', error)
                }
            } else if (message.startsWith('iwa:zoom:')) {
                // Parse zoom event
                const parts = message.split(':')
                const tabId = parts[2]
                const zoomDirection = parts[3]
                
                console.log(`[Tab ${tabId}] Zoom direction:`, zoomDirection)
                
                // Handle zoom if it's for this tab
                if (tabId === tab.id && frame.setZoom) {
                    // Get current zoom level or default to 1.0
                    frame.getZoom?.().then((currentZoom) => {
                        let newZoom = currentZoom || 1.0
                        
                                                 // Adjust zoom level based on direction (5% increments for smoother control)
                         if (zoomDirection === 'in') {
                             newZoom = Math.min(newZoom + 0.05, 3.0) // Max zoom 300%
                         } else if (zoomDirection === 'out') {
                             newZoom = Math.max(newZoom - 0.05, 0.3) // Min zoom 30%
                         }
                        
                        // Set the new zoom level
                        frame.setZoom(newZoom).then(() => {
                            console.log(`[Tab ${tabId}] Zoom set to:`, Math.round(newZoom * 100) + '%')
                        }).catch((error) => {
                            console.error(`[Tab ${tabId}] Failed to set zoom:`, error)
                        })
                                         }).catch(() => {
                         // Fallback if getZoom fails - assume current zoom is 1.0
                         let newZoom = 1.0
                         if (zoomDirection === 'in') {
                             newZoom = 1.05
                         } else if (zoomDirection === 'out') {
                             newZoom = 0.95
                         }
                        
                        frame.setZoom(newZoom).then(() => {
                            console.log(`[Tab ${tabId}] Zoom set to:`, Math.round(newZoom * 100) + '%')
                        }).catch((error) => {
                            console.error(`[Tab ${tabId}] Failed to set zoom:`, error)
                        })
                    })
                } else if (tabId === tab.id && !frame.setZoom) {
                    console.warn(`[Tab ${tabId}] setZoom API not available on this frame`)
                }
            } else if (message.startsWith('iwa:dragdrop:')) {
                // Parse drag and drop event from controlled frame
                const parts = message.split(':')
                const tabId = parts[2]
                try {
                    const eventData = JSON.parse(parts.slice(3).join(':'))
                    console.group(`🎯 [CONTROLLED-FRAME] ${eventData.type.toUpperCase()} in tab ${tabId}`)
                    console.log('📍 Frame Event Details:', eventData)
                    console.log('🖼️ Frame ID:', tabId)
                    console.groupEnd()
                } catch (error) {
                    console.error('Failed to parse drag/drop event data:', error)
                }
            } else if (message.startsWith('iwa:dragdrop-data:')) {
                // Parse additional drag and drop data from controlled frame
                const parts = message.split(':')
                const tabId = parts[2]
                try {
                    const additionalData = JSON.parse(parts.slice(3).join(':'))
                    console.group(`📋 [CONTROLLED-FRAME] Additional Drop Data in tab ${tabId}`)
                    console.log('📁 Files:', additionalData.files)
                    console.log('📝 Text Data:', additionalData.textData)
                    console.groupEnd()
                } catch (error) {
                    console.error('Failed to parse additional drag/drop data:', error)
                }
            }
        })
    }


    // Simple diff algorithm to generate additions/deletions
    function generateDiff(oldText, newText) {
        const diff = []
        let i = 0, j = 0
        
        while (i < oldText.length || j < newText.length) {
            if (i >= oldText.length) {
                // Remaining characters are additions
                diff.push({ type: 'add', char: newText[j] })
                j++
            } else if (j >= newText.length) {
                // Remaining characters are deletions
                diff.push({ type: 'delete', char: oldText[i] })
                i++
            } else if (oldText[i] === newText[j]) {
                // Characters match
                diff.push({ type: 'same', char: oldText[i] })
                i++
                j++
            } else {
                // Characters differ - look ahead to see if it's insert/delete/replace
                let foundMatch = false
                
                // Check if next few chars in new text match current old char (insertion)
                for (let k = j + 1; k < Math.min(j + 5, newText.length); k++) {
                    if (newText[k] === oldText[i]) {
                        // Found match - insert the characters before it
                        for (let l = j; l < k; l++) {
                            diff.push({ type: 'add', char: newText[l] })
                        }
                        diff.push({ type: 'same', char: oldText[i] })
                        i++
                        j = k + 1
                        foundMatch = true
                        break
                    }
                }
                
                if (!foundMatch) {
                    // Check if next few chars in old text match current new char (deletion)
                    for (let k = i + 1; k < Math.min(i + 5, oldText.length); k++) {
                        if (oldText[k] === newText[j]) {
                            // Found match - delete the characters before it
                            for (let l = i; l < k; l++) {
                                diff.push({ type: 'delete', char: oldText[l] })
                            }
                            diff.push({ type: 'same', char: newText[j] })
                            i = k + 1
                            j++
                            foundMatch = true
                            break
                        }
                    }
                }
                
                if (!foundMatch) {
                    // Treat as replacement
                    diff.push({ type: 'delete', char: oldText[i] })
                    diff.push({ type: 'add', char: newText[j] })
                    i++
                    j++
                }
            }
        }
        
        return diff
    }

    // Generate random text changes for diff simulation
    function simulateTextChanges(text) {
        if (!text || text.length === 0) return text
        
        let result = text
        const changeCount = Math.floor(Math.random() * 3) + 1 // 1-3 changes
        
        for (let i = 0; i < changeCount; i++) {
            const changeType = Math.random()
            
            if (changeType < 0.4 && result.length > 0) {
                // Delete a character (40% chance)
                const pos = Math.floor(Math.random() * result.length)
                result = result.slice(0, pos) + result.slice(pos + 1)
            } else if (changeType < 0.7) {
                // Add a character (30% chance)
                const chars = 'abcdefghijklmnopqrstuvwxyz0123456789 '
                const randomChar = chars[Math.floor(Math.random() * chars.length)]
                const pos = Math.floor(Math.random() * (result.length + 1))
                result = result.slice(0, pos) + randomChar + result.slice(pos)
            } else {
                // Replace a character (30% chance)
                if (result.length > 0) {
                    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789 '
                    const randomChar = chars[Math.floor(Math.random() * chars.length)]
                    const pos = Math.floor(Math.random() * result.length)
                    result = result.slice(0, pos) + randomChar + result.slice(pos + 1)
                }
            }
        }
        
        return result
    }

    // Show input diff preview
    function showInputDiff(inputData) {
        const newText = inputData.text
        const simulatedOldText = simulateTextChanges(newText)
        
        previousInputText = simulatedOldText
        currentInputText = newText
        
        inputDiffData = {
            element: inputData.element,
            diff: generateDiff(simulatedOldText, newText),
            timestamp: inputData.timestamp
        }
        
        inputDiffVisible = true
        
        // Clear any existing timeout
        if (inputDiffTimeout) {
            clearTimeout(inputDiffTimeout)
        }
        
        // Auto-hide after 3 seconds
        inputDiffTimeout = setTimeout(() => {
            inputDiffVisible = false
            inputDiffData = null
            inputDiffTimeout = null
        }, 3000)
    }

     // user initiated clear data options clearData(options, types)

    let attached = false
    $effect(() => {
        if (!anchor || !wrapper) { 
            return
        }
        
        let controlledFrame = instances.get(tab.id)

        let addNode = false
        if (!controlledFrame) {
            controlledFrame = document.createElement('controlledframe')
            tab.frame = controlledFrame
            instances.set(tab.id, controlledFrame)
            addNode = true

            controlledFrame.classList.add('frame-instance')

            controlledFrame.partition = tab.partition || 'persist:myapp'
            controlledFrame.onloadcommit = e => handleLoadCommit(tab, e)
            controlledFrame.onnewwindow = e => handleNewWindow(tab, e)
            controlledFrame.onaudiostatechanged = e => handleAudioStateChanged(tab, e)
            controlledFrame.onloadstart = e => handleLoadStart(tab, e)
            controlledFrame.onloadstop = e => handleLoadStop(tab, e)
            controlledFrame.oncontentload = e => handleContentLoad(tab, e)
            controlledFrame.onclose = e => handleEvent('onclose', tab, e)
            controlledFrame.oncontentresize = e => handleEvent('oncontentresize',tab, e)
            controlledFrame.ondialog = e => handleEvent('ondialog',tab, e)
            controlledFrame.onexit = e => handleEvent('onexit',tab, e)
            controlledFrame.onloadabort = e => handleEvent('onloadabort',tab, e)
            controlledFrame.onloadredirect = e => handleEvent('onloadredirect',tab, e)
            //     onloadredirect={(e) => { 
            //         handleEvent('onloadredirect',tab, e)
            //         // Update URL on redirect
            //         // if (e.newUrl) {
            //         //     tab.url = e.newUrl
            //         //     tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${e.newUrl}&size=64`
            //         // }
            //         return false
            //     }}
            controlledFrame.onpermissionrequest = e => handlePermissionRequest('onpermissionrequest',tab, e)
            controlledFrame.onresize = e => handleEvent('onresize',tab, e)
            controlledFrame.onresponsive = e => handleEvent('onresponsive',tab, e)  
            controlledFrame.onsizechanged = e => handleEvent('onsizechanged',tab, e)
            controlledFrame.onunresponsive = e => handleEvent(tab, e, 'onunresponsive')
            controlledFrame.allowscaling = true
            controlledFrame.autosize = true
            controlledFrame.allowtransparency = false

            console.log('setting up frame', controlledFrame)
            controlledFrame.setZoomMode?.('disabled')
            setupRequestHandler(controlledFrame)
            setupMessageListener(controlledFrame)
            setupContentScripts(controlledFrame)
            setupContextMenu(controlledFrame)
        }

        if (controlledFrame.src !== initialUrl) {
            controlledFrame.src = initialUrl
        }
        

        console.log('controlledFrame', controlledFrame, {initialUrl, addNode})
       
        if (addNode) {
            wrapper.insertBefore(controlledFrame, anchor)
            attached = true
        }

        if (!attached) {
            wrapper.moveBefore(controlledFrame, anchor)
            attached = true
        }
    })

    function detach () {
        let controlledFrame = instances.get(tab.id)

        if (controlledFrame) {
            const backgroundFrames = document.getElementById('backgroundFrames')
            const anchorFrame = document.getElementById('anchorFrame')
            backgroundFrames.moveBefore(controlledFrame, anchorFrame)
        }

		return {
			duration: 0
		}
	}
</script>

 {#key tab.partition}
    <div
        out:detach|global
        style={style}
        bind:this={wrapper} 
        
        class:window-controls-overlay={headerPartOfMain}
        class:no-pointer-events={isScrolling}
        id="tab_{tab.id}"
        class="frame">

        <div class="hidden" bind:this={anchor}></div>
    </div>
{/key}

<!-- transition:fade={{duration: 150}} -->

<!-- 
ControlledFrame API provides secure iframe-like functionality for Isolated Web Apps

Key isolation and display parameters:
- partition: Controls process isolation and session data separation
    Different partitions = separate cookie stores, localStorage, processes  
    Format: "persist:name" (persistent) or "ephemeral:name" (session-only)
    Enables multi-account browsing and security isolation
    
- allowscaling: Controls whether users can zoom/scale content with touch gestures
    true = users can pinch-to-zoom, false = fixed scale
    Important for mobile/touch interfaces and content layout control
    
- autosize: Controls automatic frame dimension adjustment  
    true = frame auto-resizes based on content size
    false = frame maintains fixed dimensions set by CSS
    Useful for responsive layouts and dynamic content
    
- allowtransparency: Controls background transparency support
    true = frame background can be transparent, allowing parent styling to show through
    false = frame has opaque background (better performance)
    Set to false to prevent visual glitches and improve rendering performance

SECURITY & POLICY ATTRIBUTES (available for standard iframes, some may apply to ControlledFrame):

- sandbox: Restricts frame capabilities for security isolation
    Examples: "allow-scripts allow-same-origin" (most permissive)
            "allow-scripts" (scripts but no same-origin access)
            "" or true (maximum restrictions - no scripts, forms, etc.)
    Values: allow-downloads, allow-forms, allow-modals, allow-orientation-lock,
            allow-pointer-lock, allow-popups, allow-presentation, allow-same-origin,
            allow-scripts, allow-top-navigation, allow-top-navigation-by-user-activation
            
- csp: Content Security Policy for the embedded content
    Format: "default-src 'self'; script-src 'unsafe-inline'"
    Overrides the frame's CSP headers, useful for additional restrictions
    
- allow: Feature Policy / Permissions Policy controls
    Examples: "camera; microphone; geolocation"
            "camera 'none'; microphone 'self'"
    Controls: accelerometer, ambient-light-sensor, autoplay, battery, camera,
            cross-origin-isolated, display-capture, document-domain, encrypted-media,
            execution-while-not-rendered, fullscreen, geolocation, gyroscope,
            magnetometer, microphone, midi, navigation-override, payment, picture-in-picture,
            publickey-credentials-get, screen-wake-lock, sync-xhr, usb, web-share,
            xr-spatial-tracking
            
- credentialless: Controls credential access (experimental)
    true = frame loads without credentials (cookies, auth headers)
    false = normal credential behavior
    Useful for loading untrusted cross-origin content
    
- referrerpolicy: Controls referrer information sent to the frame
    Values: no-referrer, no-referrer-when-downgrade, origin, origin-when-cross-origin,
            same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
            
- loading: Controls when the frame loads
    Values: "lazy" (load when near viewport), "eager" (load immediately)
    
Note: ControlledFrame in IWAs may have additional security controls beyond standard iframe attributes
Check the ControlledFrame specification for IWA-specific security features

EXAMPLE SECURITY ATTRIBUTE USAGE:
sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
allow="camera 'none'; microphone 'none'; geolocation 'self'; autoplay 'self'"
credentialless={false}
referrerpolicy="strict-origin-when-cross-origin"
loading="eager"

    onconsolemessage={e => { handleEvent(tab, e, 'onconsolemessage') }}
    onloadprogress={e => { handleEvent(tab, e, 'onloadprogress') }}
    onzoomchange={e => { handleEvent(tab, e, 'onzoomchange') }}
 -->

 <style>
    :global(.frame-instance) {
        width: 100%;
        height: 100%;
        display: block;
    }
</style>

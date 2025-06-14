<script module>
</script>



<script>
    import { untrack } from 'svelte'
    import { fade } from 'svelte/transition'

    let {
        tab, 
        tabs,
        headerPartOfMain,
        isScrolling,
        captureTabScreenshot,
        onFrameFocus = () => {},
        onFrameBlur = () => {},
        userMods = { css: [], js: [] }
    } = $props()

    // see https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/controlled_frame/controlled_frame_permissions_unittest.cc;l=53 for supported permissions 

    // not solved yet: notifications
    
    let partition = $state(tab.partition || 'persist:myapp')
    // permission requests
    // "media",
    // "geolocation",
    // "pointerLock",
    // "download",
    // "filesystem",
    // "fullscreen",
    // "hid",

    let initialUrl = $state('')

    // OAuth popup state
    let oauthPopup = $state(null) // { url, width, height, parentTab, event }

    // Proper detection of ControlledFrame API support
    function isControlledFrameSupported() {
        // Method 1: Check if the custom element is defined
        if (typeof customElements !== 'undefined' && customElements.get('controlledframe')) {
            console.log('✅ ControlledFrame API detected via customElements.get()')
            return true
        }
        
        // Method 2: Check if the global constructor exists
        if (typeof window.HTMLControlledFrameElement !== 'undefined') {
            console.log('✅ ControlledFrame API detected via HTMLControlledFrameElement constructor')
            return true
        }
        
        // Method 3: Try to create element and check for API methods
        try {
            const testElement = document.createElement('controlledframe')
            const hasApiMethods = typeof testElement.setZoomMode === 'function' || 
                                 typeof testElement.back === 'function' ||
                                 typeof testElement.forward === 'function'
            if (hasApiMethods) {
                console.log('✅ ControlledFrame API detected via element methods')
                return true
            }
        } catch (error) {
            console.log('❌ ControlledFrame element creation failed:', error)
        }
        
        console.log('❌ ControlledFrame API not available - falling back to iframe')
        console.log('💡 To enable ControlledFrame API:')
        console.log('   1. Ensure you\'re running in an Isolated Web App (IWA)')
        console.log('   2. Add "controlled-frame" permission to your manifest.json')
        console.log('   3. Run Chrome with --enable-features=IsolatedWebApps,IsolatedWebAppControlledFrame')
        console.log('   4. Or enable chrome://flags/#isolated-web-app-controlled-frame')
        
        return false
    }

    let controlledFrameSupported = $state(isControlledFrameSupported())

    function handleEvent(eventName, tab, event) {
        console.log(eventName, tab, event)
    }

    function handleContentLoad(tab, event) {
        setTimeout(() => updateTabMeta(tab), 100)
    }

    async function updateTabMeta(tab, frame = null) {
        if (!frame) {
            frame = document.getElementById(`tab_${tab.id}`)
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
        console.log('Page loaded:', event.url)
        
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

    // Close OAuth popup
    function closeOAuthPopup() {
        console.log('OAuth popup closed')
        oauthPopup = null
    }

    // Handle OAuth popup events
    function handleOAuthPopupEvent(eventType, popupFrame, event) {
        if (!oauthPopup) return

        const { parentTab } = oauthPopup
        
        switch (eventType) {
            case 'consolemessage':
                const message = event.message
                
                if (message.startsWith(`oauth:message:${parentTab.id}:`)) {
                    try {
                        const data = JSON.parse(message.split(`oauth:message:${parentTab.id}:`)[1])
                        console.log('[OAuth] Received message from popup:', data)
                        
                        // Forward the message to the parent frame's content window
                        if (parentTab.frame && parentTab.frame.contentWindow) {
                            parentTab.frame.contentWindow.postMessage(data.message, data.targetOrigin || '*')
                        }
                        
                        // Also dispatch as a custom event that the parent page can listen for
                        window.dispatchEvent(new CustomEvent('oauth-popup-message', {
                            detail: {
                                tabId: parentTab.id,
                                message: data.message,
                                targetOrigin: data.targetOrigin
                            }
                        }))
                        
                    } catch (error) {
                        console.error('[OAuth] Error parsing popup message:', error)
                    }
                } else if (message === `oauth:close:${parentTab.id}`) {
                    console.log('[OAuth] Popup requested close')
                    closeOAuthPopup()
                }
                break

            case 'loadstart':
                console.log('[OAuth] Popup loading started for:', oauthPopup.url)
                
                // Set up window.opener patching via content script
                const openerPatchScript = {
                    name: `oauth-opener-patch-${Date.now()}`,
                    matches: ['<all_urls>'],
                    js: {
                        code: `
                            console.log('[OAuth Popup] Patching window.opener for ${parentTab.id}');
                            
                            // Store original opener reference
                            if (typeof window.originalOpener === 'undefined') {
                                window.originalOpener = window.opener;
                                
                                // Create patched opener that forwards messages to parent
                                window.opener = {
                                    postMessage: (message, targetOrigin) => {
                                        console.log('[OAuth Popup] Forwarding postMessage to parent:', message);
                                        
                                        // Send message via console to parent frame
                                        console.log('oauth:message:${parentTab.id}:' + JSON.stringify({
                                            message: message,
                                            targetOrigin: targetOrigin,
                                            timestamp: Date.now()
                                        }));
                                    },
                                    
                                    close: () => {
                                        console.log('[OAuth Popup] Close requested by content');
                                        console.log('oauth:close:${parentTab.id}');
                                    },
                                    
                                    focus: () => {
                                        console.log('[OAuth Popup] Focus requested');
                                    }
                                };
                                
                                // Also patch window.close to notify parent
                                const originalClose = window.close;
                                window.close = () => {
                                    console.log('oauth:close:${parentTab.id}');
                                    originalClose.call(window);
                                };
                                
                                console.log('[OAuth Popup] window.opener patched successfully');
                            }
                        `
                    },
                    runAt: 'document_start',
                    allFrames: true
                }
                
                // Add content script to patch window.opener
                if (popupFrame.addContentScripts) {
                    popupFrame.addContentScripts([openerPatchScript]).then(() => {
                        console.log('[OAuth] Opener patch script added successfully')
                    }).catch((error) => {
                        console.error('[OAuth] Failed to add opener patch script:', error)
                    })
                } else {
                    console.warn('[OAuth] addContentScripts not available - window.opener patching may not work')
                }
                break

            case 'loadstop':
                console.log('[OAuth] Popup loading completed')
                break

            case 'loadabort':
                console.warn('[OAuth] Popup load aborted:', event)
                break

            case 'exit':
                console.log('[OAuth] Popup process exited:', event)
                closeOAuthPopup()
                break

            case 'close':
                closeOAuthPopup()
                break
        }
    }

    // Handle OAuth popup window attachment
    function handleOAuthPopupAttachment(popupFrame) {
        if (!oauthPopup) return

        try {
            oauthPopup.event.window.attach(popupFrame)
            console.log('[OAuth] Window attached to popup frame')
        } catch (error) {
            console.error('[OAuth] Failed to attach window to popup:', error)
        }
    }

    // Handle keyboard events for OAuth popup
    function handleOAuthKeydown(event) {
        if (oauthPopup && event.key === 'Escape') {
            closeOAuthPopup()
        }
    }

    // Auto-close timeout for OAuth popup
    let oauthTimeout
    $effect(() => {
        if (oauthPopup) {
            // Set timeout to auto-close popup after 10 minutes
            oauthTimeout = setTimeout(() => {
                console.log('[OAuth] Popup timeout - closing after 10 minutes')
                closeOAuthPopup()
            }, 10 * 60 * 1000)
        } else if (oauthTimeout) {
            clearTimeout(oauthTimeout)
            oauthTimeout = null
        }

        // Cleanup on component unmount
        return () => {
            if (oauthTimeout) {
                clearTimeout(oauthTimeout)
            }
        }
    })

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
            console.group(`🌐 onBeforeRequest: ${details.method}`, url)
            console.log('📋 Request Details:', {
                requestId: details.requestId,
                url: details.url,
                method: details.method,
                type: details.type,
                frameId: details.frameId,
                parentFrameId: details.parentFrameId,
                timeStamp: details.timeStamp,
                documentId: details.documentId,
                documentLifecycle: details.documentLifecycle,
                frameType: details.frameType,
                initiator: details.initiator,
                requestBody: details.requestBody
            })
            console.groupEnd()


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

            block && console.log('blocking', details.url)
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
                    console.log('🔒 Enhanced CSP:', { original: header.value, enhanced: enhancedCSP })
                } else if (headerName === 'content-security-policy-report-only') {
                    // Enhance existing CSP report-only with app origin
                    const enhancedCSP = enhanceCSPWithOrigin(header.value, appOrigin)
                    modifiedHeaders.push({
                        name: header.name,
                        value: enhancedCSP
                    })
                    console.log('🔒 Enhanced CSP Report-Only:', { original: header.value, enhanced: enhancedCSP })
                                 } else if (headersToHandle.includes(headerName)) {
                     // Strip these headers but don't add them to modifiedHeaders
                     console.log('🚫 Stripped header:', headerName)
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

            console.log('🔒 Modified response headers for:', details.url, {
                originalCount: details.responseHeaders.length,
                modifiedCount: modifiedHeaders.length,
                injectedOrigin: appOrigin
            })

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
            console.log('✅ Request Completed:', {
                requestId: details.requestId,
                url: details.url,
                statusCode: details.statusCode,
                fromCache: details.fromCache,
                ip: details.ip
            })
        }, allUrlsFilter)

        frame.request.onErrorOccurred.addListener((details) => {
            console.error('❌ Request Error:', {
                requestId: details.requestId,
                url: details.url,
                error: details.error,
                fromCache: details.fromCache,
                ip: details.ip
            })
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
                console.group('🎯 Context Menu "Here" clicked!')
                console.log('📋 OnClickData:', {
                    checked: info.checked,
                    editable: info.editable,
                    frameId: info.frameId,
                    frameUrl: info.frameUrl,
                    linkUrl: info.linkUrl,
                    mediaType: info.mediaType,
                    menuItemId: info.menuItemId,
                    pageUrl: info.pageUrl,
                    parentMenuId: info.parentMenuId,
                    selectionText: info.selectionText,
                    srcUrl: info.srcUrl,
                    wasChecked: info.wasChecked
                })
                console.log('📋 Raw info object:', info)
                console.log('📋 Tab data:', tab)
                console.groupEnd()
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

        console.log('trying' , frame.id)

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

    // Listen for messages from content scripts
    function setupMessageListener(frame) {
        // Listen for messages from the controlled frame's content window
        if (frame.contentWindow) {
            frame.contentWindow.addEventListener('message', (event) => {
                console.log('message', event)
                if (event.data?.type === 'controlled-frame-focus' && event.data?.tabId === tab.id) {
                    console.log(`🎯 Tab ${tab.id} gained focus`)
                    onFrameFocus()
                } else if (event.data?.type === 'controlled-frame-blur' && event.data?.tabId === tab.id) {
                    console.log(`😴 Tab ${tab.id} lost focus`)
                    onFrameBlur()
                }
            })
        }
        
        // Also listen on main window as fallback for cross-origin messages
        window.addEventListener('message', (event) => {
            console.log('message', event)
            // Check if message is from the controlled frame
            if (event.source === frame.contentWindow && event.data?.tabId === tab.id) {
                if (event.data?.type === 'controlled-frame-focus') {
                    console.log(`🎯 Tab ${tab.id} gained focus (cross-origin)`)
                    onFrameFocus()
                } else if (event.data?.type === 'controlled-frame-blur') {
                    console.log(`😴 Tab ${tab.id} lost focus (cross-origin)`)
                    onFrameBlur()
                }
            }
        })

        frame.addEventListener('consolemessage', (event) => {
            console.log('consolemessage', event)
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
                        sourceFrame: frame.id || `tab_${tab.id}`
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
                        sourceFrame: frame.id || `tab_${tab.id}`
                    }
                }))
            }
        })
    }

    // user initiated clear data options clearData(options, types)

    $effect(() => {
        partition = tab.partition
        const frame = tab.frame
        
        frame.setZoomMode?.('disabled')
        setupRequestHandler(frame)
        
        setupMessageListener(frame)
        
        setupContentScripts(frame)
        
        setupContextMenu(frame)

        if (tab.shouldFocus) {
            tab.shouldFocus = false
            setTimeout(() => {
                tab.frame.scrollIntoView({ behavior: 'smooth' })
                tab.tabButton.scrollIntoView({ behavior: 'smooth' })
            }, 200)
        }
    })

    //TODo clear daata support
</script>

{#if tab.hibernated}
    <div 
        class="frame hibernated-frame"
        class:window-controls-overlay={headerPartOfMain}
        class:no-pointer-events={isScrolling}
        id="tab_{tab.id}"
        transition:fade={{duration: 150}}
    >
        {#if tab.screenshot}
            <img src={tab.screenshot} alt="Hibernated tab preview" class="hibernated-screenshot" />
        {:else}
            <div class="hibernated-placeholder">
                <div class="hibernated-icon">💤</div>
                <div class="hibernated-text">Tab is hibernated</div>
                <div class="hibernated-url">{tab.url}</div>
            </div>
        {/if}
    </div>
{:else}
    {#key partition}
        {#if controlledFrameSupported}
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
            -->
            <controlledframe
                transition:fade={{duration: 150}}
                bind:this={tab.frame}
                class:window-controls-overlay={headerPartOfMain}
                class:no-pointer-events={isScrolling}
                id="tab_{tab.id}"
                class="frame"
                src={initialUrl}
                partition={partition}
                onloadcommit={e => handleLoadCommit(tab, e)}
                onnewwindow={(e) => { handleNewWindow(tab, e)} }
                onaudiostatechanged={e => handleAudioStateChanged(tab, e)}
                allowscaling={false}
                autosize={true}
                allowtransparency={false}
                onloadstart={e => { handleLoadStart(tab, e) }}
                onloadstop={e => { handleLoadStop(tab, e) }}

                oncontentload={e => handleContentLoad(tab, e)}
                onclose={e => { handleEvent('onclose', tab, e) }}
                oncontentresize={e => { handleEvent('oncontentresize',tab, e) }}
                ondialog={e => { handleEvent('ondialog',tab, e) }}
                onexit={e => { handleEvent('onexit',tab, e) }}
                onloadabort={e => { handleEvent('onloadabort',tab, e) }}
                onloadredirect={(e) => { 
                    handleEvent('onloadredirect',tab, e)
                    // Update URL on redirect
                    // if (e.newUrl) {
                    //     tab.url = e.newUrl
                    //     tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${e.newUrl}&size=64`
                    // }
                    return false
                }}
                onpermissionrequest={e => { handleEvent('onpermissionrequest',tab, e) }}
                onresize={e => { handleEvent('onresize',tab, e) }}
                onresponsive={e => { handleEvent('onresponsive',tab, e) }}
                onsizechanged={e => { handleEvent('onsizechanged',tab, e) }}
                onunresponsive={e => { handleEvent(tab, e, 'onunresponsive') }}

                sandbox="allow-scripts allow-forms"
                csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; child-src 'none'; worker-src 'none'; frame-src 'none';"
                allow="accelerometer 'self'; ambient-light-sensor 'none'; autoplay 'self'; battery 'none'; camera 'self'; cross-origin-isolated 'none'; display-capture 'none'; document-domain 'none'; encrypted-media 'self'; execution-while-not-rendered 'self'; fullscreen 'none'; geolocation 'self'; gyroscope 'none'; magnetometer 'none'; microphone 'none'; midi 'none'; navigation-override 'none'; payment 'none'; picture-in-picture 'self'; publickey-credentials-create 'self'; publickey-credentials-get 'self'; screen-wake-lock 'none'; sync-xhr 'none'; usb 'none'; web-share 'none'; xr-spatial-tracking 'none'"
                credentialless={true}
                referrerpolicy="strict-origin-when-cross-origin"
                loading="lazy"
                ></controlledframe>
                <!--
                onconsolemessage={e => { handleEvent(tab, e, 'onconsolemessage') }}
                onloadprogress={e => { handleEvent(tab, e, 'onloadprogress') }}
                onzoomchange={e => { handleEvent(tab, e, 'onzoomchange') }}
                -->
        {:else}
            <!-- ControlledFrame API not available, falling back to iframe -->
            {#if initialUrl}
                <iframe
                    transition:fade={{duration: 150}}
                    bind:this={tab.frame}
                    src={initialUrl}
                    class:window-controls-overlay={headerPartOfMain}
                    class:no-pointer-events={isScrolling}
                    id="tab_{tab.id}"
                    class="frame"
                    title="fallback-iframe"

                    sandbox="allow-scripts allow-forms"
                    csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; child-src 'none'; worker-src 'none'; frame-src 'none';"
                    allow="accelerometer 'none'; ambient-light-sensor 'none'; autoplay 'self'; battery 'none'; camera 'none'; cross-origin-isolated 'none'; display-capture 'none'; document-domain 'none'; encrypted-media 'self'; execution-while-not-rendered 'self'; fullscreen 'none'; geolocation 'none'; gyroscope 'none'; magnetometer 'none'; microphone 'none'; midi 'none'; navigation-override 'none'; payment 'none'; picture-in-picture 'self'; publickey-credentials-create 'self'; publickey-credentials-get 'self'; screen-wake-lock 'none'; sync-xhr 'none'; usb 'none'; web-share 'none'; xr-spatial-tracking 'none'"
                    credentialless={true}
                    referrerpolicy="strict-origin-when-cross-origin"
                    loading="lazy"
                ></iframe>
            {:else}
                <div 
                    transition:fade={{duration: 150}}
                    bind:this={tab.frame}
                    class:window-controls-overlay={headerPartOfMain}
                    class:no-pointer-events={isScrolling}
                    id="tab_{tab.id}"
                    class="frame iframe-blocked"
                >
                    <div class="iframe-blocked-content">
                        <div class="iframe-blocked-icon">⚠️</div>
                        <div class="iframe-blocked-title">ControlledFrame API Not Available</div>
                        <div class="iframe-blocked-message">
                            This app requires the ControlledFrame API to display web content securely. 
                            {#if tab.url}
                                The URL "{tab.url}" cannot be displayed in a standard iframe due to security restrictions.
                            {/if}
                        </div>
                        <div class="iframe-blocked-suggestion">
                            <strong>To enable ControlledFrame API:</strong><br/>
                            1. Ensure this is running as an Isolated Web App (IWA)<br/>
                            2. Enable chrome://flags/#isolated-web-app-controlled-frame<br/>
                            3. Or run Chrome with --enable-features=IsolatedWebApps,IsolatedWebAppControlledFrame
                        </div>
                    </div>
                </div>
            {/if}
        {/if}
    {/key}
{/if}

<!-- OAuth Popup Modal -->
{#if oauthPopup}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div 
        class="oauth-popup-backdrop" 
        onclick={closeOAuthPopup}
        transition:fade={{duration: 200}}
    ></div>
    
    <controlledframe
        bind:this={oauthPopup.frame}
        class="oauth-popup-frame"
        style="width: {oauthPopup.width}px; height: {oauthPopup.height}px;"
        src={oauthPopup.url}
        partition={oauthPopup.parentTab.partition || 'persist:myapp'}
        
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; publickey-credentials-create 'self'; publickey-credentials-get 'self'"
        referrerpolicy="strict-origin-when-cross-origin"
        allowscaling={false}
        autosize={true}
        allowtransparency={false}
        
        onconsolemessage={e => handleOAuthPopupEvent('consolemessage', oauthPopup.frame, e)}
        onloadstart={e => { 
            handleOAuthPopupEvent('loadstart', oauthPopup.frame, e)
            handleOAuthPopupAttachment(oauthPopup.frame)
        }}
        onloadstop={e => handleOAuthPopupEvent('loadstop', oauthPopup.frame, e)}
        onloadabort={e => handleOAuthPopupEvent('loadabort', oauthPopup.frame, e)}
        onexit={e => handleOAuthPopupEvent('exit', oauthPopup.frame, e)}
        onclose={e => handleOAuthPopupEvent('close', oauthPopup.frame, e)}
        
        transition:fade={{duration: 300, delay: 100}}
    ></controlledframe>
{/if}

<!-- Global keyboard event handler for OAuth popup -->
<svelte:window onkeydown={handleOAuthKeydown} />


<style>
     .hibernated-frame {
        background: #0a0a0a;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        --webkit-app-region: no-drag;
    }

    .hibernated-screenshot {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top;
        opacity: 0.5;
    }

    .hibernated-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        text-align: center;
        padding: 40px;
        color: rgba(255, 255, 255, 0.5);
    }

    .hibernated-icon {
        font-size: 48px;
        opacity: 0.6;
    }

    .hibernated-text {
        font-size: 16px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
    }

    .hibernated-url {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.4);
        font-family: 'SF Mono', Consolas, monospace;
        word-break: break-all;
        max-width: 300px;
    }

    .hibernated-frame::before {
        content: '';
        position: absolute;
        top: 8px;
        right: 8px;
        width: 24px;
        height: 24px;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        z-index: 1;
        pointer-events: none;
        border-radius: 12px;
    }

    .hibernated-frame::after {
        content: '💤';
        position: absolute;
        top: 14px;
        right: 14px;
        font-size: 12px;
        z-index: 2;
        pointer-events: none;
    }

    .iframe-blocked {
        background: #0a0a0a;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        --webkit-app-region: no-drag;
    }

    .iframe-blocked-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        text-align: center;
        padding: 40px;
        color: rgba(255, 255, 255, 0.8);
        max-width: 480px;
    }

    .iframe-blocked-icon {
        font-size: 48px;
        opacity: 0.6;
    }

    .iframe-blocked-title {
        font-size: 18px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.9);
    }

    .iframe-blocked-message {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.4;
    }

    .iframe-blocked-url {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        font-family: 'SF Mono', Consolas, monospace;
        word-break: break-all;
        background: rgba(255, 255, 255, 0.05);
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .iframe-blocked-suggestion {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.4;
        text-align: left;
        max-width: 100%;
    }

    .iframe-blocked-suggestion strong {
        color: rgba(255, 255, 255, 0.8);
        font-weight: 600;
    }

    /* OAuth popup styles */
    .oauth-popup-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.7);
        z-index: 9999;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
    }

    .oauth-popup-frame {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10000;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 
            0 25px 50px rgba(0, 0, 0, 0.6),
            0 0 0 1px rgba(255, 255, 255, 0.1);
        background: #0a0a0a;
    }
</style>

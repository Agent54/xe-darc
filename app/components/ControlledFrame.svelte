<script module>
</script>



<script>
    import { untrack } from 'svelte'
    import { fade } from 'svelte/transition'

    let {
        style = '',
        tab, 
        tabs,
        headerPartOfMain,
        isScrolling,
        captureTabScreenshot,
        onFrameFocus = () => {},
        onFrameBlur = () => {},
        userMods = { css: [], js: [] },
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
    
    // Link preview state
    let hoveredLink = $state(null) // { href, target, rel, title }
    let linkPreviewVisible = $state(false)
    let linkPreviewTimeout = null
    
    // Input text diff state
    let currentInputText = $state('')
    let previousInputText = $state('')
    let inputDiffVisible = $state(false)
    let inputDiffTimeout = null
    let inputDiffData = $state(null)

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
            if (linkPreviewTimeout) {
                clearTimeout(linkPreviewTimeout)
            }
            if (inputDiffTimeout) {
                clearTimeout(inputDiffTimeout)
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

    // user initiated clear data options clearData(options, types)
    $effect(() => {
        partition = tab.partition
        const frame = tab.frame
        
        if (frame) {
            frame.setZoomMode?.('disabled')
            setupRequestHandler(frame)
            
            setupMessageListener(frame)
            
            setupContentScripts(frame)
            
            setupContextMenu(frame)
        }

        if (tab.shouldFocus) {
            tab.shouldFocus = false
            setTimeout(() => {
                if (tab.frame) {
                    tab.frame.scrollIntoView({ behavior: 'smooth' })
                }
                if (tab.tabButton) {
                    tab.tabButton.scrollIntoView({ behavior: 'smooth' })
                }
            }, 200)
        }
    })

    //TODo clear daata support
</script>

{#if tab.hibernated}
    <div 
        style={style}
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
                style={style}
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

                {#if linkPreviewVisible && hoveredLink}
                    <div class="link-preview" transition:fade={{duration: 150}}>
                        {hoveredLink.href}
                    </div>
                {/if}
                
                <!-- Input diff preview for controlledframe -->
                {#if inputDiffVisible && inputDiffData}
                    <div class="input-diff-preview" transition:fade={{duration: 200}}>
                        <div class="input-diff-header">
                            <span class="input-diff-element">Press tab to complete / double Esc to disable</span>
                        </div>
                        <div class="input-diff-content">
                            {#each inputDiffData.diff as diffItem}
                                {#if diffItem.type === 'add'}
                                    <span class="diff-add">{diffItem.char}</span>
                                {:else if diffItem.type === 'delete'}
                                    <span class="diff-delete">{diffItem.char}</span>
                                {:else}
                                    <span class="diff-same">{diffItem.char}</span>
                                {/if}
                            {/each}
                        </div>
                    </div>
                {/if}
                <!--
                onconsolemessage={e => { handleEvent(tab, e, 'onconsolemessage') }}
                onloadprogress={e => { handleEvent(tab, e, 'onloadprogress') }}
                onzoomchange={e => { handleEvent(tab, e, 'onzoomchange') }}
                -->
        {:else}
            <!-- ControlledFrame API not available, falling back to iframe -->
            {#if initialUrl}
                <iframe
                    style={style}
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
                
                <!-- Link preview for iframe fallback -->
                {#if linkPreviewVisible && hoveredLink}
                    <div class="link-preview" transition:fade={{duration: 150}}>
                        {hoveredLink.href}
                    </div>
                {/if}
                
                <!-- Input diff preview for iframe fallback -->
                {#if inputDiffVisible && inputDiffData}
                    <div class="input-diff-preview" transition:fade={{duration: 200}}>
                        <div class="input-diff-header">
                            <span class="input-diff-element">completion</span>
                        </div>
                        <div class="input-diff-content">
                            {#each inputDiffData.diff as diffItem}
                                {#if diffItem.type === 'add'}
                                    <span class="diff-add">{diffItem.char}</span>
                                {:else if diffItem.type === 'delete'}
                                    <span class="diff-delete">{diffItem.char}</span>
                                {:else}
                                    <span class="diff-same">{diffItem.char}</span>
                                {/if}
                            {/each}
                        </div>
                    </div>
                {/if}
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

    .link-preview {
        position: absolute;
        top: 1px;
        left: 7px;
        background: rgba(25, 25, 25, 0.98);
        color: rgba(255, 255, 255, 0.95);
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
        font-size: 11px;
        font-weight: 400;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.103);
        backdrop-filter: blur(12px);
        z-index: 10010;
        max-width: calc(100% - 24px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        user-select: none;
        pointer-events: none;
    }

    .input-diff-preview {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.95);
        color: rgba(255, 255, 255, 0.9);
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
        font-size: 12px;
        font-weight: 400;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(16px);
        z-index: 10015;
        max-width: 480px;
        min-width: 300px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        user-select: none;
        pointer-events: none;
        overflow: hidden;
    }

    .input-diff-header {
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.8);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .input-diff-content {
        padding: 10px 12px;
        line-height: 1.4;
        overflow-wrap: break-word;
        word-break: break-all;
        max-height: 120px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    }

    .input-diff-content::-webkit-scrollbar {
        width: 4px;
    }

    .input-diff-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .input-diff-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 2px;
    }

    .diff-add {
        background: rgba(34, 197, 94, 0.3);
        color: rgba(34, 197, 94, 1);
        padding: 1px 2px;
        border-radius: 2px;
        font-weight: 500;
    }

    .diff-delete {
        background: rgba(239, 68, 68, 0.3);
        color: rgba(239, 68, 68, 1);
        padding: 1px 2px;
        border-radius: 2px;
        text-decoration: line-through;
        font-weight: 500;
    }

    .diff-same {
        color: rgba(255, 255, 255, 0.8);
    }
</style>

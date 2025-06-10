<scirpt context="module">
</scirpt>

<script>
    import { untrack , onMount} from 'svelte'
    import { fade } from 'svelte/transition'

    let {
        tab, 
        tabs,
        isWindowControlsOverlay,
        isScrolling,
        captureTabScreenshot,
        onFrameFocus = () => {},
        onFrameBlur = () => {}
    } = $props()


    // permission requests
    // "media",
    // "geolocation",
    // "pointerLock",
    // "download",
    // "filesystem",
    // "fullscreen",
    // "hid",

    let initialUrl = $state('')

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
        console.log('New window:', e)
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
        setTimeout(checkTabListOverflow, 50) // Check overflow after DOM update
    }

    // WebRequest logger - logs all network requests with full details
    function setupRequestLogger(frame) {
        if (!frame.request) {
            console.log('WebRequest API not available')
            return
        }

        // Filter to capture all URLs
        const allUrlsFilter = { urls: ['<all_urls>'] }

        // Log all request events with full details
        frame.request.onBeforeRequest.addListener((details) => {
            console.group(`🌐 Request: ${details.method} ${details.url}`)
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

            const block = details.url.indexOf("google-analytics.com") != -1

            block && console.log('blocking', details.url)
            return { cancel: block }
        }, allUrlsFilter, ['blocking', 'requestBody'])

        // frame.request.onBeforeSendHeaders.addListener((details) => {
        //     console.log('📤 Request Headers:', {
        //         requestId: details.requestId,
        //         url: details.url,
        //         headers: details.requestHeaders
        //     })
        // }, allUrlsFilter, ['requestHeaders'])

        // frame.request.onSendHeaders.addListener((details) => {
        //     console.log('✈️ Headers Sent:', {
        //         requestId: details.requestId,
        //         url: details.url,
        //         headers: details.requestHeaders
        //     })
        // }, allUrlsFilter, ['requestHeaders'])

        // frame.request.onHeadersReceived.addListener((details) => {
        //     console.log('📥 Response Headers:', {
        //         requestId: details.requestId,
        //         url: details.url,
        //         statusCode: details.statusCode,
        //         statusLine: details.statusLine,
        //         headers: details.responseHeaders
        //     })
        // }, allUrlsFilter, ['responseHeaders'])

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
    function setupFocusBlurContentScript(frame) {
        //         const contentScript = {
        //     name: 'focus-blur-handler' + i++,

        //     matches: ['<all_urls>', 'http://*/*', 'https://*/*'],

        //     js: {
        //         code: `
        //             console.log('🔧 Focus/blur content script loading for tab ${tab.id}');
                    
        //             // Focus/blur handlers for controlled frame
        //             let lastFocusState = document.hasFocus();
                    
        //             function handleFocusChange() {
        //                 const currentFocusState = document.hasFocus();
        //                 if (currentFocusState !== lastFocusState) {
        //                     lastFocusState = currentFocusState;
                            
        //                     // Send message to parent frame
        //                     if (currentFocusState) {
        //                         console.log('🎯 Frame gained focus - sending message');
        //                         const focusMessage = {
        //                             type: 'controlled-frame-focus',
        //                             tabId: '${tab.id}',
        //                             focused: true,
        //                             timestamp: Date.now()
        //                         };
        //                         // Try multiple messaging approaches
        //                         window.postMessage(focusMessage, '*');
        //                         try { parent.postMessage(focusMessage, '*'); } catch(e) { console.log('parent.postMessage failed:', e); }
        //                         try { top.postMessage(focusMessage, '*'); } catch(e) { console.log('top.postMessage failed:', e); }
        //                     } else {
        //                         console.log('😴 Frame lost focus - sending message');
        //                         const blurMessage = {
        //                             type: 'controlled-frame-blur', 
        //                             tabId: '${tab.id}',
        //                             focused: false,
        //                             timestamp: Date.now()
        //                         };
        //                         // Try multiple messaging approaches
        //                         window.postMessage(blurMessage, '*');
        //                         try { parent.postMessage(blurMessage, '*'); } catch(e) { console.log('parent.postMessage failed:', e); }
        //                         try { top.postMessage(blurMessage, '*'); } catch(e) { console.log('top.postMessage failed:', e); }
        //                     }
        //                 }
        //             }
                    
        //             // Listen for focus and blur events
        //             window.addEventListener('focus', handleFocusChange, true);
        //             window.addEventListener('blur', handleFocusChange, true);
        //             document.addEventListener('visibilitychange', handleFocusChange);
                    
        //             // Check initial state
        //             setTimeout(handleFocusChange, 100);
                    
        //             // Periodic check for focus state changes
        //             setInterval(handleFocusChange, 1000);
                    
        //             console.log('✅ Focus/blur content script initialized for tab ${tab.id}');
        //         `,
                
        //     },
        //     runAt: 'document-end',
        //     allFrames: true
        // }

        // First try a simple test script to verify content script injection works
        const testScript = {
            name: 'test-script',
            matches: ['<all_urls>', 'http://*/*', 'https://*/*'],
            js: {
                code: `
window.addEventListener('focus', () => { console.log('iwa:focus') }, false);
window.addEventListener('blur', () => { console.log('iwa:blur') }, false);
`,
            },
            runAt: 'document-end',
            allFrames: true
        }

        console.log('trying' , frame.id)
        frame.addContentScripts([testScript]).then((res) => {
            console.log('✅ Test content script added successfully', res)

            initialUrl = untrack(() => tab.url)
            
            // Now add the focus/blur script
            // return frame.addContentScripts([contentScript])
        }).catch((err) => {
            console.error('❌ Content script error:', err)
        })
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
            if (event.message === 'iwa:focus') {
                onFrameFocus()
            } else if (event.message === 'iwa:blur') {
                onFrameBlur()
            }
        })
    }

    // user initiated clear data options clearData(options, types)

    // TODO: if controledframe api missing, explain how to enable it

    onMount(() => {
        const frame = tab.frame
        // Set zoom mode to disabled for consistent behavior
        frame.setZoomMode?.('disabled')
        
        // Setup request logging
        setupRequestLogger(frame)
        
        // Setup message listener
        setupMessageListener(frame)
        
        // Setup focus/blur content scripts
        setupFocusBlurContentScript(frame)
        
        // Setup context menu
        setupContextMenu(frame)

        if (tab.shouldFocus) {
            tab.frame.scrollIntoView({ behavior: 'smooth' })
            tab.tabButton.scrollIntoView({ behavior: 'smooth' })
            tab.shouldFocus = false
        }
    })
</script>

{#if tab.hibernated}
    <div 
        class="frame hibernated-frame"
        class:window-controls-overlay={isWindowControlsOverlay}
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
    <controlledframe
        transition:fade={{duration: 150}}
        bind:this={tab.frame}
        class:window-controls-overlay={isWindowControlsOverlay}
        class:no-pointer-events={isScrolling}
        id="tab_{tab.id}"
        class="frame"
        src={initialUrl}
        partition="persist:myapp"
        onloadcommit={e => handleLoadCommit(tab, e)}
        onnewwindow={(e) => { handleNewWindow(tab, e)} }
        onaudiostatechanged={e => handleAudioStateChanged(tab, e)}
        allowscaling={true}
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
        ></controlledframe>
        <!--
        onconsolemessage={e => { handleEvent(tab, e, 'onconsolemessage') }}
        onloadprogress={e => { handleEvent(tab, e, 'onloadprogress') }}
        onzoomchange={e => { handleEvent(tab, e, 'onzoomchange') }}
        -->
{/if}


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
</style>

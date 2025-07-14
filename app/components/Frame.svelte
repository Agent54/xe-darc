<script>
    import { fade } from 'svelte/transition'
    import ControlledFrame from './ControlledFrame.svelte'
    import UrlRenderer from './UrlRenderer.svelte'
    import { origin } from '../lib/utils.js'
    import data from '../data.svelte.js'

    let {
        style = '',
        tabId,
        headerPartOfMain,
        isScrolling,
        captureTabScreenshot,
        onFrameFocus = () => {},
        onFrameBlur = () => {},
        userMods = { css: [], js: [] },
        requestedResources = [],
        statusLightsEnabled = false,
        controlledFrameSupported = false,
    } = $props()

    const tab = $derived(data.docs[tabId])

    // see https://source.chromium.org/chromium/chromium/src/+/main:chrome/browser/controlled_frame/controlled_frame_permissions_unittest.cc;l=53 for supported permissions 

    // not solved yet: notifications, screen capture
    
    // permission requests
    // "media"
    // "geolocation"
    // "pointerLock"
    // "download"
    // "filesystem"
    // "fullscreen"
    // "hid"

    // OAuth popup state
    let oauthPopup = $state(null) // { url, width, height, parentTab, event }
    
    // Link preview state
    let hoveredLink = $state(null) // { href, target, rel, title }
    let linkPreviewVisible = $state(false)
    let linkPreviewTimeout = null
    
    let inputDiffVisible = $state(false)
    let inputDiffTimeout = null
    let inputDiffData = $state(null)
    
    // Check if hovered link has different origin than current tab
    let isDifferentOrigin = $derived.by(() => {
        if (!hoveredLink?.href || !tab.url) return false
        try {
            const linkOrigin = origin(hoveredLink.href)
            const tabOrigin = origin(tab.url)
            const different = linkOrigin !== tabOrigin
            return different
        } catch (error) {
            console.log('Origin check error:', error)
            return false
        }
    })

    // Close OAuth popup
    function closeOAuthPopup() {
        console.log('OAuth popup closed')
        oauthPopup = null
    }

    // Handle OAuth popup events
    function handleOAuthPopupEvent(eventType, popupFrame, event) {
        if (!oauthPopup) return

        const { parentTab } = oauthPopup
        const parentFrame = data.frames[parentTab.id]?.frame
        
        switch (eventType) {
            case 'consolemessage':
                const message = event.message
                
                if (message.startsWith(`oauth:message:${parentTab.id}:`)) {
                    try {
                        const data = JSON.parse(message.split(`oauth:message:${parentTab.id}:`)[1])
                        console.log('[OAuth] Received message from popup:', data)
                        
                        // Forward the message to the parent frame's content window
                        if (parentFrame && parentFrame.contentWindow) {
                            parentFrame.contentWindow.postMessage(data.message, data.targetOrigin || '*')
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

    $effect(() => {
        if (tab.shouldFocus) {
            // Delay resetting shouldFocus to give NewTab component time to handle it
            setTimeout(() => {
                tab.shouldFocus = false
            }, 100)
            
            setTimeout(() => {
                data.frames[tab.id]?.wrapper?.scrollIntoView({ behavior: 'smooth' })
                if (tabButtons[tab.id]) {
                    tabButtons[tab.id].scrollIntoView({ behavior: 'smooth' })
                }
            }, 100)
        }
    })  
    //TODo clear daata support

    let iframeFrame = $state(null)
    let frameWrapper = $state(null)

    $effect(() => {
        data.frames[tab.id] ??= { frame: iframeFrame, wrapper: frameWrapper }
    })
</script>

{#if tab.hibernated}
    <div 
        bind:this={frameWrapper}
        transition:fade={{duration: 150}}
        style={style}
        class="frame hibernated-frame"
        class:window-controls-overlay={headerPartOfMain}
        class:no-pointer-events={isScrolling}
        role="button"
        tabindex="0"
        onmousedown={() => {
            tab.hibernated = false
        }}
        id="tab_{tab.id}"
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
    {#if controlledFrameSupported}
        <ControlledFrame
            {style}
            {isScrolling}
            {tabId}
            {headerPartOfMain}
            {captureTabScreenshot}
            {onFrameFocus}
            {onFrameBlur}
            {userMods}
            {requestedResources}
            {statusLightsEnabled}
            bind:hoveredLink
            bind:linkPreviewVisible
            bind:linkPreviewTimeout
            bind:inputDiffVisible
            bind:inputDiffTimeout
            bind:inputDiffData
        />

        {#if linkPreviewVisible && hoveredLink}
            <div class="link-preview" transition:fade={{duration: 150}}>
                {#if isDifferentOrigin}
                    <svg class="link-preview-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15,3 21,3 21,9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                {/if}
                <img 
                    src="https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={hoveredLink?.href || ''}&size=16"
                    alt=""
                    class="link-preview-favicon"
                />
                <UrlRenderer url={hoveredLink?.href || ''} variant="compact" />
            </div>
        {/if}
        
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
    {:else}
        {#if true} 
        <!-- initial url  -->
            <iframe
                style={style}
                transition:fade={{duration: 150}}
                bind:this={iframeFrame}
                src={tab.url}
                class:window-controls-overlay={headerPartOfMain}
                class:no-pointer-events={isScrolling}
                id="tab_{tab.id}"
                class="frame"
                title="fallback-iframe"
                credentialless={true}
                referrerpolicy="strict-origin-when-cross-origin"
                loading="lazy"
            ></iframe>

            <!--  sandbox="allow-scripts allow-forms"
                csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; child-src 'none'; worker-src 'none'; frame-src 'none';"
                allow="accelerometer 'none'; ambient-light-sensor 'none'; autoplay 'self'; battery 'none'; camera 'none'; cross-origin-isolated 'none'; display-capture 'none'; document-domain 'none'; encrypted-media 'self'; execution-while-not-rendered 'self'; fullscreen 'none'; geolocation 'none'; gyroscope 'none'; magnetometer 'none'; microphone 'none'; midi 'none'; navigation-override 'none'; payment 'none'; picture-in-picture 'self'; publickey-credentials-create 'self'; publickey-credentials-get 'self'; screen-wake-lock 'none'; sync-xhr 'none'; usb 'none'; web-share 'none'; xr-spatial-tracking 'none'" -->
            
            <!-- Link preview for iframe fallback -->
            {#if linkPreviewVisible && hoveredLink}
                <div class="link-preview" transition:fade={{duration: 150}}>
                    {#if isDifferentOrigin}
                        <svg class="link-preview-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15,3 21,3 21,9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                    {/if}
                    <img 
                        src="https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={hoveredLink?.href || ''}&size=16"
                        alt=""
                        class="link-preview-favicon"
                    />
                    <UrlRenderer url={hoveredLink?.href || ''} variant="compact" />
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
        <!-- {:else}
            <div 
                transition:fade={{duration: 150}}
                bind:this={frame}
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
            </div> -->
        {/if}
    {/if}
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

    /* .frame:focus {
        outline: none;
    }

    controlledframe {
         background: white;
        border: none;
        overflow: hidden;
    } */

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
        /* margin-left: 7px; */
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
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .link-preview-favicon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        opacity: 0.8;
    }
    
    .link-preview-external {
        width: 13px;
        height: 13px;
        opacity: 0.8;
        flex-shrink: 0;
        margin-right: 4px;
        margin-top: -1px;
        color: rgba(255, 255, 255, 0.9);
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

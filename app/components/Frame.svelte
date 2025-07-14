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

    
    // Link preview state
    let hoveredLink = $state(null) // { href, target, rel, title }
    let linkPreviewVisible = $state(false)
    let linkPreviewTimeout = null
    
    // Global hover link preview state
    let globalHoverPreview = $state(null) // { href, target, rel, title }
    let globalHoverPreviewVisible = $state(false)
    let globalHoverPreviewShown = $state(false) // Controls the delayed fade-in
    let globalHoverPreviewTimeout = null
    
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

    // Check if global hover preview has different origin than current tab
    let globalIsDifferentOrigin = $derived.by(() => {
        if (!globalHoverPreview?.href || !tab.url) return false
        try {
            const linkOrigin = origin(globalHoverPreview.href)
            const tabOrigin = origin(tab.url)
            const different = linkOrigin !== tabOrigin
            return different
        } catch (error) {
            console.log('Origin check error:', error)
            return false
        }
    })

    // Show global hover preview when regular link preview has been visible for a while
    $effect(() => {
        if (linkPreviewVisible && hoveredLink && !globalHoverPreviewVisible) {
            // Clear any existing global preview timeout
            if (globalHoverPreviewTimeout) {
                clearTimeout(globalHoverPreviewTimeout)
            }
            
            // Set timeout to create preview node after 500ms (earlier than before)
            globalHoverPreviewTimeout = setTimeout(() => {
                globalHoverPreview = hoveredLink
                globalHoverPreviewVisible = true
                
                // Add delayed fade-in after node is created (let page load)
                setTimeout(() => {
                    globalHoverPreviewShown = true
                }, 1000) // 1000ms delay for page loading
                
                // Set timeout to hide global preview after 20 seconds
                globalHoverPreviewTimeout = setTimeout(() => {
                    globalHoverPreviewShown = false
                    // Hide the node after fade out completes
                    setTimeout(() => {
                        globalHoverPreviewVisible = false
                        globalHoverPreview = null
                        globalHoverPreviewTimeout = null
                    }, 300) // Wait for fade out transition
                }, 20000)
            }, 500) // Reduced from 1000ms to 500ms
        } else if (!linkPreviewVisible) {
            // Hide global preview when regular preview is hidden (on mouseleave)
            if (globalHoverPreviewTimeout) {
                clearTimeout(globalHoverPreviewTimeout)
                globalHoverPreviewTimeout = null
            }
            if (globalHoverPreviewVisible) {
                globalHoverPreviewShown = false
                setTimeout(() => {
                    globalHoverPreviewVisible = false
                    globalHoverPreview = null
                }, 300) // Wait for fade out
            }
        }
    })

    $effect(() => {
       
        // Cleanup on component unmount
        return () => {

            if (linkPreviewTimeout) {
                clearTimeout(linkPreviewTimeout)
            }
            if (globalHoverPreviewTimeout) {
                clearTimeout(globalHoverPreviewTimeout)
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

{#if globalHoverPreviewVisible && globalHoverPreview}
    <div 
        class="global-hover-preview" 
        class:shown={globalHoverPreviewShown}
        role="dialog"
        aria-label="Link preview"
    >
        <div class="global-hover-preview-container">
            <div class="global-hover-preview-header">
                <div class="global-hover-preview-title">
                    {#if globalIsDifferentOrigin}
                        <svg class="global-hover-preview-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15,3 21,3 21,9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                    {/if}
                    <img 
                        src="https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={globalHoverPreview.href}&size=16"
                        alt=""
                        class="global-hover-preview-favicon"
                    />
                    <UrlRenderer url={globalHoverPreview.href} variant="compact" />
                </div>
                <button 
                    class="global-hover-preview-close"
                    aria-label="Close link preview"
                    onclick={() => {
                        globalHoverPreviewVisible = false
                        globalHoverPreview = null
                        if (globalHoverPreviewTimeout) {
                            clearTimeout(globalHoverPreviewTimeout)
                            globalHoverPreviewTimeout = null
                        }
                    }}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="global-hover-preview-frame">
                <controlledframe
                    src={globalHoverPreview.href}
                    class="global-hover-preview-controlledframe"
                    partition="persist:preview"
                    allowscaling={false}
                    autosize={false}
                    allowtransparency={false}
                    sandbox="allow-scripts allow-same-origin"
                    referrerpolicy="strict-origin-when-cross-origin"
                ></controlledframe>
            </div>
        </div>
    </div>
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

    /* Global hover link preview styles */
    .global-hover-preview {
        position: fixed;
        top: 40px;
        right: 40px;
        z-index: 20000;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity 300ms ease-out, transform 300ms ease-out;
    }

    .global-hover-preview.shown {
        opacity: 1;
        transform: translateY(0);
    }

    .global-hover-preview-container {
        position: relative;
        width: 300px;
        height: 200px;
        background: rgba(15, 15, 15, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        box-shadow: 
            0 8px 20px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .global-hover-preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.3);
        flex-shrink: 0;
    }

    .global-hover-preview-title {
        display: flex;
        align-items: center;
        gap: 6px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 11px;
        font-weight: 500;
        min-width: 0;
        flex: 1;
    }

    .global-hover-preview-external {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        opacity: 0.7;
        color: rgba(255, 255, 255, 0.8);
    }

    .global-hover-preview-favicon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        border-radius: 2px;
    }

    .global-hover-preview-close {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.8);
        transition: background 0.2s ease;
        flex-shrink: 0;
    }

    .global-hover-preview-close:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .global-hover-preview-close svg {
        width: 12px;
        height: 12px;
    }

    .global-hover-preview-frame {
        flex: 1;
        min-height: 0;
        position: relative;
        overflow: hidden;
        transform-origin: top left;
    }

    .global-hover-preview-controlledframe {
        width: 200%;
        height: 200%;
        border: none;
        background: white;
        display: block;
        border-radius: 0 0 8px 8px;
        transform: scale(0.5);
        transform-origin: top left;
    }
</style>

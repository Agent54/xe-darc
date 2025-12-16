<script>
    import { fade, scale } from 'svelte/transition'
    import { tick } from 'svelte'

    import ControlledFrame from './ControlledFrame.svelte'
    import UrlRenderer from './UrlRenderer.svelte'
    import Tooltip from './Tooltip.svelte'
    import AttachmentImage from './AttachmentImage.svelte'
    import { origin } from '../lib/utils.js'
    import data from '../data.svelte.js'

    let {
        style = '',
        tabId,
        headerPartOfMain,
        isScrolling,
        onFrameFocus = () => {},
        onFrameBlur = () => {},
        userMods = { css: [], js: [] },
        statusLightsEnabled = false,
        controlledFrameSupported = false,
        observer
    } = $props()

    const tab = $derived(data.docs[tabId])

    // Immediately unhibernate unhidden pinned frames on initial load
    // This runs once on component mount - no effect needed
    {
        const initialTab = data.docs[tabId]
        if (initialTab?.pinned && !initialTab?.hidden) {
            data.unhibernate(tabId)
        }
    }

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
    // let linkPreviewVisible = $state(false)
    // let linkPreviewTimeout = null
    
    // Global hover link preview state
    let globalHoverPreview = $state(null) // { href, target, rel, title, position }
    let globalHoverPreviewTabId = $state(null) // { href, target, rel, title, position }
    let globalHoverPreviewTab = $state(null) // Store the actual tab object since preview tabs aren't in docs store
    let globalHoverPreviewVisible = $state(false)
    let globalHoverPreviewShown = $state(false) // Controls the delayed fade-in
    let globalHoverPreviewTimeout = null
    let isHoveringPreview = $state(false) // Track if mouse is over the preview
    let globalHoverPreviewPinned = $state(false) // Track if preview is pinned for debugging
    let globalHoverPreviewExpanding = $state(false) // Track if preview is expanding to lightbox
    // Delay timer for hiding the global hover preview (prevents flicker while moving cursor)
    let hidePreviewDelayTimeout = null
    
    // Window dimensions for calculating preview aspect ratio
    let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1200)
    let windowHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 800)
    
    // Command key state from controlled frames
    let commandKeyPressed = $state(false)

    // Function to create off-origin tab (lightbox or normal tab based on command key)
    // FIXME: move to proper place
    function createOffOriginLightbox(url, originalOrigin, targetOrigin, useCommandKey = false) {
        const shouldCreateNormalTab = commandKeyPressed || useCommandKey
        
        console.log({commandKeyPressed, useCommandKey})
        // if (shouldCreateNormalTab) {
        //     console.log(`🔗 Creating off-origin normal tab with focus: ${originalOrigin} → ${targetOrigin}`)
            
        //     // Clean up any hover previews when creating a new tab
        //     cleanupAllHoverPreviews()
            
        //     const newTab = data.newTab(data.spaceMeta.activeSpace, { 
        //         url: url,
        //         title: targetOrigin,
        //         opener: tabId,
        //     })
            
        //     // Activate the new tab immediately
        //     data.activate(newTab.id)
            
        //     return newTab
        // }
        
        console.log(`🔗 Creating off-origin lightbox: ${originalOrigin} → ${targetOrigin}`)
        
        // Check if there's a current hover preview for the same URL
        if (globalHoverPreview && globalHoverPreview.href === url) {
            if (globalHoverPreviewVisible && globalHoverPreviewTabId) {
                // Convert existing visible preview to lightbox
                console.log(`🔄 Converting existing hover preview to lightbox: ${url}`)
                globalHoverPreviewExpanding = true
                
                // Preserve the existing ControlledFrame instance by moving it to background first
                const previewFrameData = data.frames[globalHoverPreviewTabId]
                if (previewFrameData?.frame) {
                    console.log('🎯 Preserving ControlledFrame instance for lightbox conversion')
                    const backgroundFrames = document.getElementById('backgroundFrames')
                    const anchorFrame = document.getElementById('anchorFrame')
                    if (backgroundFrames && anchorFrame) {
                        // Move to background to preserve the frame during state transition
                        backgroundFrames.moveBefore(previewFrameData.frame, anchorFrame)
                        // Clear the wrapper reference but keep the frame
                        delete previewFrameData.wrapper
                    }
                }
                
                cleanupForExpand()
                
                // Convert the preview tab to lightbox immediately
                data.updateTab(globalHoverPreviewTabId, {preview: false, lightbox: true})
                globalHoverPreview = null
                globalHoverPreviewTabId = null
                globalHoverPreviewExpanding = false
                
                // Return the existing tab (now converted to lightbox)
                return data.docs[globalHoverPreviewTabId]
            } else if (globalHoverPreviewTimeout) {
                // There's a pending hover preview for the same URL
                console.log(`🔄 Converting pending hover preview to lightbox: ${url}`)
                
                // Cancel the hover preview timeout
                clearTimeout(globalHoverPreviewTimeout)
                globalHoverPreviewTimeout = null
                
                // Create lightbox directly instead of preview
                const lightboxTab = data.newTab(data.spaceMeta.activeSpace, { 
                    url: url,
                    title: targetOrigin,
                    opener: tabId,
                    lightbox: true
                })
                
                // Clean up hover preview state
                globalHoverPreview = null
                globalHoverPreviewVisible = false
                globalHoverPreviewShown = false
                
                return lightboxTab
            }
        }
        
        // Clean up any other hover previews when creating a new lightbox
        cleanupAllHoverPreviews()
        
        // No matching hover preview, create new lightbox tab
        const lightboxTab = data.newTab(data.spaceMeta.activeSpace, { 
            url: url,
            title: targetOrigin,
            opener: tabId,
            lightbox: true
        })
        return lightboxTab
    }
    
    // Calculate preview height based on window aspect ratio
    let previewHeight = $derived.by(() => {
        const previewWidth = 280
        const windowAspectRatio = windowHeight / windowWidth
        const calculatedHeight = previewWidth * windowAspectRatio
        
        // Apply min/max constraints for usability
        const minHeight = 200 // Prevent too small on ultrawide screens
        const maxHeight = 700 // Prevent too large on portrait/tall screens
        
        return Math.round(Math.max(minHeight, Math.min(maxHeight, calculatedHeight)))
    })
    
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

    async function instantlyCleanupGlobalPreview() {
        if (globalHoverPreviewTimeout) {
            clearTimeout(globalHoverPreviewTimeout)
            globalHoverPreviewTimeout = null
        }
        globalHoverPreviewExpanding = true

        await tick()

        globalHoverPreviewExpanding = false
        globalHoverPreviewVisible = false
        globalHoverPreview = null
        globalHoverPreviewTabId = null
        globalHoverPreviewTab = null
    }

    // Cleanup function to properly reset all preview state
    function cleanupGlobalPreview() {
        // Don't cleanup if preview is pinned for debugging or expanding
        if (globalHoverPreviewPinned || globalHoverPreviewExpanding) {
            return
        }
        
        if (globalHoverPreviewTimeout) {
            clearTimeout(globalHoverPreviewTimeout)
            globalHoverPreviewTimeout = null
        }
        globalHoverPreviewShown = false
        setTimeout(() => {
            if (!globalHoverPreviewExpanding) {
                globalHoverPreviewVisible = false
                globalHoverPreview = null
                globalHoverPreviewTabId = null
                globalHoverPreviewTab = null
            }
        }, 300)
    }

    // Special cleanup for expanding (triggers the transition)
    function cleanupForExpand() {
        if (globalHoverPreviewTimeout) {
            clearTimeout(globalHoverPreviewTimeout)
            globalHoverPreviewTimeout = null
        }
        globalHoverPreviewShown = false
        globalHoverPreviewVisible = false
    }

    // Complete cleanup of all hover preview state (for lightbox creation)
    function cleanupAllHoverPreviews() {
        // Cancel any pending preview
        if (globalHoverPreviewTimeout) {
            clearTimeout(globalHoverPreviewTimeout)
            globalHoverPreviewTimeout = null
        }
        // Clear any pending hide delays
        if (hidePreviewDelayTimeout) {
            clearTimeout(hidePreviewDelayTimeout)
            hidePreviewDelayTimeout = null
        }
        // Clear hovered link state
        if (hoveredLink) {
            hoveredLink = null
        }
        // Clean up visible preview immediately (except pinned ones for debugging)
        if (globalHoverPreviewVisible && !globalHoverPreviewPinned) {
            cleanupGlobalPreview()
        }
    }

    // Cancel all hover previews when tab starts loading or navigates
    let prevUrl = null
    $effect(() => {  
        if (tab.url !== prevUrl) {
            prevUrl = tab.url
            cleanupAllHoverPreviews()
        } else if (tab.loading) {
            cleanupAllHoverPreviews()
        }
    })

    // Detect when tab is being closed and immediately abort all previews
    $effect(() => {
        if (tab?.closed || tab?.archive === 'closed') {
            cleanupAllHoverPreviews()
        }
    })

    // Show global hover preview when regular link preview has been visible for a while
    $effect(() => {
        // Don't show hover previews when a lightbox is active or tab is loading
        const hasActiveLightbox = data.previews[tab._id]?.lightbox
        
        console.log('Link preview effect:', { hoveredLink: !!hoveredLink, showLinkPreviews: data.spaceMeta.config.showLinkPreviews, hasActiveLightbox, tabLoading: tab?.loading })
        
        if (hoveredLink && data.spaceMeta.config.showLinkPreviews && !hasActiveLightbox && !tab?.loading) {
            // Cancel any pending hide delay because we have (or are about to have) a hovered link again
            if (hidePreviewDelayTimeout) {
                clearTimeout(hidePreviewDelayTimeout)
                hidePreviewDelayTimeout = null
            }
            // If there's already a preview for a different link, clean it up first
            if (globalHoverPreviewVisible && globalHoverPreview?.href !== hoveredLink.href) {
                // Hide the current preview after a short delay before switching
                if (hidePreviewDelayTimeout) clearTimeout(hidePreviewDelayTimeout)
                hidePreviewDelayTimeout = setTimeout(() => {
                    cleanupGlobalPreview()
                    // Start the new preview slightly after the old one begins hiding
                    setTimeout(() => startGlobalPreview(), 100)
                }, 150)
            } else if (!globalHoverPreviewVisible) {
                console.log('📍 Calling startGlobalPreview()')
                startGlobalPreview()
            }
        } else if (!isHoveringPreview && !globalHoverPreviewPinned) {
            // Hide global preview when regular preview is hidden AND not hovering the preview AND not pinned
            // OR when a lightbox becomes active
            if (hidePreviewDelayTimeout) clearTimeout(hidePreviewDelayTimeout)
            hidePreviewDelayTimeout = setTimeout(() => {
                if (!isHoveringPreview && (!hoveredLink || hasActiveLightbox)) {
                    cleanupGlobalPreview()
                }
            }, 150)
        }
    })

    const pinnedPreviews = $state([])

    function startGlobalPreview() {
        console.log('🎯 startGlobalPreview called')
        // Clear any existing timeout
        if (globalHoverPreviewTimeout) {
            clearTimeout(globalHoverPreviewTimeout)
        }
        
        const createPreview = async () => {
            console.log('🎯 createPreview called', { hoveredLink: hoveredLink?.href })
            if (!hoveredLink?.href) {
                console.log('❌ No hovered link, aborting preview creation')
                return
            }
            const tab = await data.newTab(data.spaceMeta.activeSpace, { url: hoveredLink.href, preview: true, opener: tabId })
            console.log('✅ Preview tab created:', { tabId: tab.id, url: hoveredLink.href })

            globalHoverPreviewTabId = tab.id
            globalHoverPreviewTab = tab
            globalHoverPreview = hoveredLink
            globalHoverPreviewVisible = true
            console.log('✅ Preview state set visible')
            
            // If the preview is pinned, show immediately, otherwise wait for the page to load
            if (globalHoverPreviewPinned) {
                globalHoverPreviewShown = true
            } else {
                setTimeout(() => {
                    globalHoverPreviewShown = true
                }, 1000) // 1000ms delay for page loading
            }
            
            // Set timeout to hide global preview after 21 seconds (unless pinned)
            const autoHideTimeout = setTimeout(() => {
                if (!globalHoverPreviewPinned) {
                    cleanupGlobalPreview()
                }
            }, 21000)
            
            // Store the auto-hide timeout so it can be cleared if needed
            globalHoverPreviewTimeout = autoHideTimeout
        }

        // Skip the show delay entirely if the preview is pinned
        if (globalHoverPreviewPinned) {
            createPreview()
        } else {
            // Set timeout to create preview node after 700ms
            globalHoverPreviewTimeout = setTimeout(createPreview, 700)
        }
    }

    $effect(() => {
        // Update window dimensions on resize
        if (typeof window !== 'undefined') {
            function updateWindowDimensions() {
                windowWidth = window.innerWidth
                windowHeight = window.innerHeight
            }
            
            window.addEventListener('resize', updateWindowDimensions)
            
            return () => {
                window.removeEventListener('resize', updateWindowDimensions)
            }
        }
    })
    
    $effect(() => {
       
        // Cleanup on component unmount
        return () => {

            // if (linkPreviewTimeout) {
            //     clearTimeout(linkPreviewTimeout)
            // }
            if (globalHoverPreviewTimeout) {
                clearTimeout(globalHoverPreviewTimeout)
            }
            if (inputDiffTimeout) {
                clearTimeout(inputDiffTimeout)
            }
        }
    })

    //TODO: clear data support

    let iframeFrame = $state(null)
    let frameWrapper = $state(null)

    $effect(() => {
        data.frames[tab.id] ??= { frame: iframeFrame, wrapper: frameWrapper }
        if (frameWrapper) {
            observer?.observe(frameWrapper)
        }
    
        return () => {
            frameWrapper && observer?.unobserve(frameWrapper)
        }
    })

    // Calculate preview position to ensure it stays within window bounds
    function calculatePreviewLeft(preview) {
        const previewWidth = 280
        const padding = 20

        const position = preview?.position || preview || {}
        
        // Get the actual source frame position to account for layout changes
        const sourceFrame = frameWrapper
        const sourceFrameRect = sourceFrame ? sourceFrame.getBoundingClientRect() : null
        
        if (!sourceFrameRect) {
            return 5 // Fallback if no frame rect available
        }

        // The link position is already in viewport coordinates, so use it directly
        const linkRight = position.right || (position.left + (position.width || 0)) || 0
        const linkLeft = position.left || 0
        
        // Position preview to the right of the link with padding
        let left = linkRight + padding
        
        // If preview would go off the right edge, position it to the left of the link
        if (left + previewWidth > window.innerWidth - padding) {
            left = linkLeft - previewWidth - padding
        }
        
        // Ensure preview doesn't go off the left edge of the frame
        if (left < sourceFrameRect.left + 5) {
            left = sourceFrameRect.left + 5
        }
        
        // Final boundary check
        if (left + previewWidth > window.innerWidth - 5) {
            left = window.innerWidth - previewWidth - 5
        }

        return Math.max(sourceFrameRect.left + 5, left)
    }
    
    function calculatePreviewTop(preview) {
        const totalPreviewHeight = previewHeight + 32
        const padding = 10

        const position = preview?.position || preview || {}
        const abs = preview?.absolute
        const previewScreenY = preview?.screenY
        const controlledFrameScreenY = window.screenY || 0
        const isFromIframe = typeof previewScreenY === 'number' && Math.abs(previewScreenY - controlledFrameScreenY) > 12
        const deltaY = isFromIframe ? (previewScreenY - controlledFrameScreenY) : 0

        if (abs && typeof abs.top === 'number' && typeof abs.bottom === 'number') {
            const viewportOriginY = (window.screenY || 0)
            let top = (abs.top - viewportOriginY) - padding
            if (top < padding) top = (abs.bottom - viewportOriginY) + padding
            top = Math.round(top)
            if (top + totalPreviewHeight > window.innerHeight - padding) top = window.innerHeight - totalPreviewHeight - padding
            const outAbs = Math.max(20, top)

            return outAbs
        }

        let top = (position.top ?? 0) - deltaY - padding

        if (top < padding) {
            top = (position.bottom ?? (position.top ?? 0)) - deltaY + padding
        }

        top = Math.round(top)
        if (top + totalPreviewHeight > window.innerHeight - padding) {
            top = window.innerHeight - totalPreviewHeight - padding
        }

        const out = Math.max(20, top)
        return out
    }
</script>

<div bind:this={frameWrapper} id="tab_{tab.id}" class="frame-wrapper frame" style={style} class:window-controls-overlay={headerPartOfMain} class:no-pointer-events={isScrolling}>
    {#if (!data.frames[tab.id]?.frame || !data.frames[tab.id]?.initialLoad) && !data.frames[tab.id]?.pendingLoad}
        <div 
            transition:fade={{duration: 200, delay: 0}}
            class="frame hibernated-frame"
            role="button"
            tabindex="0"
            onmousedown={() => {
                onFrameFocus()
            }}
        >
            {#if tab.screenshot}
                <AttachmentImage src={tab.screenshot} digest={tab._attachments?.screenshot?.digest} alt="Hibernated tab preview" class="hibernated-screenshot" lazy={true} />
            {:else}
                <div class="hibernated-placeholder">
                    <div class="hibernated-icon">💤</div>
                    <div class="hibernated-text">Tab is hibernated</div>
                    <div class="hibernated-url">{tab.url}</div>
                </div>
            {/if}
        </div>
    {/if}

    {#if data.frames[tab.id]?.frame || data.frames[tab.id]?.pendingLoad || data.spaceMeta.activeTabId === tab.id}
        {#if controlledFrameSupported}
            <ControlledFrame
                {style}
                {isScrolling}
                {tabId}
                {headerPartOfMain}
                {onFrameFocus}
                {onFrameBlur}
                {userMods}
                {statusLightsEnabled}
                {createOffOriginLightbox}
                {observer}
                {instantlyCleanupGlobalPreview}
                bind:commandKeyPressed
                bind:hoveredLink
            
                bind:inputDiffVisible
                bind:inputDiffTimeout
                bind:inputDiffData
            />
            <!--  bind:linkPreviewTimeout bind:linkPreviewVisible    linkPreviewVisible &&  -->

            {#if hoveredLink}
                <div class="link-preview" transition:fade={{duration: 100}}>
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
                    class="frame"
                    title="fallback-iframe"
                    credentialless={true}
                    referrerpolicy="strict-origin-when-cross-origin"
                    loading="lazy"
                ></iframe>

                <!--  sandbox="allow-scripts allow-forms"
                    csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; child-src 'none'; worker-src 'none'; frame-src 'none';"
                    allow="accelerometer 'none'; ambient-light-sensor 'none'; autoplay 'self'; battery 'none'; camera 'none'; cross-origin-isolated 'none'; display-capture 'none'; document-domain 'none'; encrypted-media 'self'; execution-while-not-rendered 'self'; fullscreen 'none'; geolocation 'none'; gyroscope 'none'; magnetometer 'none'; microphone 'none'; midi 'none'; navigation-override 'none'; payment 'none'; picture-in-picture 'self'; publickey-credentials-create 'self'; publickey-credentials-get 'self'; screen-wake-lock 'none'; sync-xhr 'none'; usb 'none'; web-share 'none'; xr-spatial-tracking 'none'" -->
                
                <!-- Link preview for iframe fallback  linkPreviewVisible &&-->
                {#if hoveredLink}
                    <div class="link-preview" transition:fade={{duration: 100}}>
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

        {#if globalHoverPreviewVisible && globalHoverPreview && globalHoverPreviewTabId}
            {#key globalHoverPreview.href}
                <div 
                    class="global-hover-preview" 
                    class:shown={globalHoverPreviewShown}
                    style={globalHoverPreview?.position ? 
                        `margin-left: ${calculatePreviewLeft(globalHoverPreview)}px; top: ${calculatePreviewTop(globalHoverPreview)}px;` : 
                        ''}
                    role="dialog"
                    aria-label="Link preview"
                    tabindex="-1"
                    out:scale={{duration: 200}}
                    onmouseenter={() => { 
                        isHoveringPreview = true 
                        // Cancel pending hide when mouse enters the preview
                        if (hidePreviewDelayTimeout) {
                            clearTimeout(hidePreviewDelayTimeout)
                            hidePreviewDelayTimeout = null
                        }
                    }}
                    onmouseleave={() => { 
                        isHoveringPreview = false 
                        // Trigger hide logic when leaving preview
                        if (!hoveredLink) {
                            if (hidePreviewDelayTimeout) clearTimeout(hidePreviewDelayTimeout)
                            hidePreviewDelayTimeout = setTimeout(() => {
                                if (!isHoveringPreview && !hoveredLink) {
                                    cleanupGlobalPreview()
                                }
                            }, 150)
                        }
                    }}
                >
                <div class="global-hover-preview-container" style="height: {previewHeight}px;">
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
                        <div class="global-hover-preview-controls">
                            <button 
                                class="global-hover-preview-pin"
                                class:pinned={globalHoverPreviewPinned}
                                aria-label="Pin link preview for debugging"
                                onclick={() => {
                                    globalHoverPreviewPinned = !globalHoverPreviewPinned
                                }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 9 V3 a1 1 0 0 1 6 0 v6"></path>
                                    <path d="M9 9 a3 3 0 0 0 6 0"></path>
                                    <path d="M12 15 v6"></path>
                                </svg>
                            </button>
                            <button 
                                class="global-hover-preview-expand"
                                aria-label="Expand to full tab"
                                onclick={() => {
                                    globalHoverPreviewExpanding = true
                                    
                                    // Preserve the existing ControlledFrame instance by moving it to background first
                                    const previewFrameData = data.frames[globalHoverPreviewTabId]
                                    if (previewFrameData?.frame) {

                                        const backgroundFrames = document.getElementById('backgroundFrames')
                                        const anchorFrame = document.getElementById('anchorFrame')
                                        if (backgroundFrames && anchorFrame) {
                                            // Move to background to preserve the frame during state transition
                                            backgroundFrames.moveBefore(previewFrameData.frame, anchorFrame)
                                            // Clear the wrapper reference but keep the frame
                                            delete previewFrameData.wrapper
                                        }
                                    }
                                    
                                    // Trigger the visual closing with expand animation
                                    cleanupForExpand()
                                    // Convert to lightbox immediately
                                    data.updateTab(globalHoverPreviewTabId, {preview: false, lightbox: true})
                                    globalHoverPreview = null
                                    globalHoverPreviewTabId = null
                                    globalHoverPreviewExpanding = false
                                }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="15,3 21,3 21,9"></polyline>
                                    <polyline points="9,21 3,21 3,15"></polyline>
                                    <line x1="21" y1="3" x2="14" y2="10"></line>
                                    <line x1="3" y1="21" x2="10" y2="14"></line>
                                </svg>
                            </button>
                            <button 
                                class="global-hover-preview-close"
                                aria-label="Close link preview"
                                onclick={() => {
                                    globalHoverPreviewVisible = false
                                    globalHoverPreview = null
                                    globalHoverPreviewTabId = null
                                    globalHoverPreviewPinned = false
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
                    </div>
                    <div class="global-hover-preview-frame">
                        {#if globalHoverPreviewTab && !globalHoverPreviewExpanding}
                            <ControlledFrame
                                {style}
                                class="global-hover-preview-controlledframe"
                                {isScrolling}
                                tabId={globalHoverPreviewTabId}
                                {headerPartOfMain}
                                {onFrameFocus}
                                {onFrameBlur}
                                {userMods}
                            />
                        {/if}
                    </div>
                </div>
                </div>
            {/key}
        {/if}

        {#if data.previews[tab._id] && data.docs[data.previews[tab._id]?.lightbox]}
            {@const lightboxChild = data.docs[data.previews[tab._id].lightbox]}
            <div 
                class="lightbox-backdrop"
                role="dialog"
                aria-modal="true"
                tabindex="-1"
                in:fade={{duration: 100}}
                out:fade={{duration: 80}}
                onclick={(e) => {
                    // Only close if clicking the backdrop, not the content
                    if (e.target === e.currentTarget) {
                        data.closeTab(tab.spaceId, lightboxChild?._id)
                    }
                }}
                onkeydown={(e) => {
                    if (e.key === 'Escape') {
                        data.closeTab(tab.spaceId, lightboxChild?._id)
                    }
                }}
            >
                <div class="lightbox-container" 
                    in:scale={{duration: 100}}
                    out:scale={{duration: 80}}>
                    <div class="lightbox-header">
                        <div class="lightbox-title">
                            <img 
                                src="https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={lightboxChild?.url}&size=16"
                                alt=""
                                class="lightbox-favicon"
                            />
                            <UrlRenderer url={lightboxChild?.url} variant="compact" />
                        </div>
                        <div class="lightbox-controls">
                            <Tooltip text="Move to new tab" position="bottom">
                                <button 
                                    class="lightbox-move-to-tab"
                                    aria-label="Move to new tab"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M9 9h3v3"/>
                                        <path d="M9 21V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z"/>
                                        <path d="M5 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/>
                                    </svg>
                                </button>
                            </Tooltip>
                            <Tooltip text="Expand to full tab" position="bottom">
                                <button 
                                    class="lightbox-expand-full"
                                    aria-label="Expand to full tab"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="15,3 21,3 21,9"></polyline>
                                        <polyline points="9,21 3,21 3,15"></polyline>
                                        <line x1="21" y1="3" x2="14" y2="10"></line>
                                        <line x1="3" y1="21" x2="10" y2="14"></line>
                                    </svg>
                                </button>
                            </Tooltip>
                            <Tooltip text="Collapse to preview card" position="bottom">
                                <button 
                                    class="lightbox-collapse-preview"
                                    aria-label="Collapse to preview card"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="4,14 10,14 10,20"></polyline>
                                        <polyline points="20,10 14,10 14,4"></polyline>
                                        <line x1="14" y1="10" x2="21" y2="3"></line>
                                        <line x1="3" y1="21" x2="10" y2="14"></line>
                                    </svg>
                                </button>
                            </Tooltip>
                            <Tooltip text="Settings" position="bottom">
                                <button 
                                    class="lightbox-settings"
                                    aria-label="Settings"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="3"></circle>
                                        <path d="m12 1 0 6m0 6 0 6"></path>
                                        <path d="M9 12 3 7.02M21 7.02 15 12m0 0 6 4.98M3 16.98 9 12"></path>
                                    </svg>
                                </button>
                            </Tooltip>
                            <Tooltip text="Close" position="bottom">
                                <button 
                                    class="lightbox-close"
                                    aria-label="Close lightbox"
                                    onclick={() => {
                                        data.closeTab(tab.spaceId, lightboxChild?.id)
                                    }}
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                    <div class="lightbox-frame">
                        <ControlledFrame
                            {style}
                            {isScrolling}
                            class="lightbox-controlledframe"
                            tabId={lightboxChild?.id}
                            {headerPartOfMain}
                            {onFrameFocus}
                            {onFrameBlur}
                            {userMods}
                            {statusLightsEnabled}
                            bind:hoveredLink
                            
                            bind:inputDiffVisible
                            bind:inputDiffTimeout
                            bind:inputDiffData
                        />
                        <!-- bind:linkPreviewTimeout bind:linkPreviewVisible -->
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .frame-wrapper {
        position: relative;
    }

     .hibernated-frame {
        background: #0a0a0a;
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        overflow: hidden;
        --webkit-app-region: no-drag;
    }

    :global(.has-left-pins .hibernated-frame) {
        max-width: calc(100% - 9px);
    }

    :global(.hibernated-screenshot) {
        width: 100%;
        height: 100%;
        opacity: 0.7;
        border-radius: 8px;
        overflow: hidden;
    }
    
    :global(.hibernated-screenshot .attachment-image) {
        object-fit: cover;
        object-position: top left;
        border-radius: 8px;
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
        /* pointer-events: none; */
        border-radius: 12px;
    }

    .hibernated-frame::after {
        content: '💤';
        position: absolute;
        top: 14px;
        right: 14px;
        font-size: 12px;
        z-index: 2;
        /* pointer-events: none; */
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
        top: -4px;
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
        z-index: 10000;
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

    .global-hover-preview {
        position: absolute;
        top: 40px;
        /* right: 40px; */
        z-index: 20000;
        pointer-events: none;
        opacity: 0;
        transform: translateZ(0) translateY(-10px);
        transition: opacity 300ms ease-out, transform 300ms ease-out;
        /* CSS optimization tricks */
        will-change: opacity, transform;
        backface-visibility: hidden;
    }

    .global-hover-preview.shown {
        opacity: 1;
        pointer-events: auto;
        transform: translateZ(0) translateY(0);
    }

    .global-hover-preview-container {
        position: relative;
        width: 280px;
        background: rgba(15, 15, 15, 0.95);
        /* border: 1px solid rgba(255, 255, 255, 0.08); */
        border-radius: 8px;
        box-shadow: 
            0 8px 20px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.05);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        /* CSS optimization tricks */
        transform: translateZ(0);
        backface-visibility: hidden;
        will-change: transform;
    }

    .global-hover-preview-container.animating {
        box-shadow: none;
    }

    .global-hover-preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.3);
        flex-shrink: 0;
        position: relative;
    }

    .global-hover-preview-header:hover .global-hover-preview-controls {
        opacity: 1;
        visibility: visible;
        width: auto;
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
        position: relative;
        overflow: hidden;
    }

    .global-hover-preview-title::after {
        content: '';
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 20px;
        background: linear-gradient(to right, transparent, rgba(15, 15, 15, 0.95));
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
    }

    .global-hover-preview-title:hover::after {
        opacity: 1;
    }

    .global-hover-preview-title :global(.url-renderer) {
        overflow-x: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }

    .global-hover-preview-title :global(.url-renderer)::-webkit-scrollbar {
        display: none;
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

    .global-hover-preview-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s ease, width 0.2s ease;
        flex-shrink: 0;
        width: 0;
        overflow: hidden;
    }

    .global-hover-preview-container:has(.global-hover-preview-pin.pinned) .global-hover-preview-controls {
        opacity: 1;
        visibility: visible;
        width: auto;
    }

    .global-hover-preview-pin {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.6);
        transition: background 0.2s ease, color 0.2s ease;
        flex-shrink: 0;
    }

    .global-hover-preview-pin:hover {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
    }

    .global-hover-preview-pin.pinned {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
    }

    .global-hover-preview-pin.pinned:hover {
        background: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 1);
    }

    .global-hover-preview-pin svg {
        width: 12px;
        height: 12px;
    }

    .global-hover-preview-expand {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.6);
        transition: background 0.2s ease, color 0.2s ease;
        flex-shrink: 0;
    }

    .global-hover-preview-expand:hover {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
    }

    .global-hover-preview-expand svg {
        width: 12px;
        height: 12px;
    }

    .global-hover-preview-close {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.6);
        transition: background 0.2s ease, color 0.2s ease;
        flex-shrink: 0;
    }

    .global-hover-preview-close:hover {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
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

    :global(.global-hover-preview-controlledframe) {
        width: 200%;
        height: 200%;
        border: none;
        display: block;
        position: absolute;
        border-radius: 0 0 8px 8px !important;
        transform: scale(0.5);
        transform-origin: top left;
    }
    :global(.global-hover-preview-controlledframe.frame) {
        width: 200% !important;
        height: 200% !important;
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
    }
    :global(.global-hover-preview-controlledframe.frame .frame-instance) {
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
    }

    .lightbox-backdrop {
        position: absolute;
        top: 0;
        /* left: 0; */
        /* width: 100%; */
        height: 100%;
        background: rgb(0 0 0 / 58%);
        backdrop-filter: blur(1px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
        z-index: 1;
        width: calc(100vw - var(--space-taken, 0px) - 18px);
        /* CSS optimization tricks */
        will-change: opacity, backdrop-filter;
        transform: translateZ(0);
        backface-visibility: hidden;
        /* Disable expensive effects during animation */
        transition: backdrop-filter 0.2s ease;
    }

    .lightbox-backdrop.animating {
        backdrop-filter: none;
    }

    /* @media (min-width: 1800px) {
        .lightbox-backdrop {
            max-width: 1411px;
        }
    } */

    .lightbox-container {
        width: calc(100% - 80px);
        height: calc(100% - 80px);
        background: rgb(0 0 0);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        box-shadow: 
            0 25px 50px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.05);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        /* CSS optimization tricks */
        will-change: transform, opacity, box-shadow;
        transform: translateZ(0);
        backface-visibility: hidden;
        /* Optimize rendering during transitions */
        transition: box-shadow 0.15s ease;
    }

    .lightbox-container.animating {
        box-shadow: none;
    }

    .lightbox-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        /* border-bottom: 1px solid rgba(255, 255, 255, 0.1); */
        background: rgba(0, 0, 0, 0.3);
        flex-shrink: 0;
    }

    .lightbox-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 12px;
        font-weight: 500;
        min-width: 0;
        flex: 1;
    }

    .lightbox-favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        border-radius: 2px;
    }

    .lightbox-controls {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
    }

    .lightbox-move-to-tab,
    .lightbox-expand-full,
    .lightbox-collapse-preview,
    .lightbox-settings,
    .lightbox-close {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.6);
        transition: background 0.2s ease, color 0.2s ease;
        flex-shrink: 0;
    }

    .lightbox-move-to-tab:hover,
    .lightbox-expand-full:hover,
    .lightbox-collapse-preview:hover,
    .lightbox-settings:hover,
    .lightbox-close:hover {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
    }

    .lightbox-move-to-tab svg,
    .lightbox-expand-full svg,
    .lightbox-collapse-preview svg,
    .lightbox-settings svg,
    .lightbox-close svg {
        width: 14px;
        height: 14px;
    }

    .lightbox-frame {
        flex: 1;
        min-height: 0;
        position: relative;
        overflow: hidden;
    }

    :global(.lightbox-controlledframe) {
        width: 100%;
        height: 100%;
        border: none;
        /* background: white; */
        display: block;
        border-radius: 0 0 12px 12px;
    }
    :global(.lightbox-controlledframe.frame) {
        width: 100% !important;
        height: 100% !important;
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
    }
    :global(.lightbox-controlledframe.frame .frame-instance) {
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
    }

    /* TODO: */
    .stage-manager-fold {
        transform: perspective(1200px) rotateY(-45deg) translateX(-20%) scale(0.85);
        transform-origin: right center;
        transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
    }
    .stage-manager-fold.active {
        transform: perspective(1200px) rotateY(0deg) translateX(0%) scale(1);
    }
</style>

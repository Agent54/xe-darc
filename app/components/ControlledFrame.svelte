<script>
    import data from '../data.svelte.js'
    import { fade } from 'svelte/transition'
    import { untrack, onDestroy, tick } from 'svelte'
    import SSLErrorPage from './SSLErrorPage.svelte'
    import NetworkErrorPage from './NetworkErrorPage.svelte'
    import NewTab from './NewTab.svelte'
    import TabHistory from './TabHistory.svelte'
    import { origin } from '../lib/utils.js'
    import { generateDiff, throttle } from '../lib/utils.js'
    import select from '../inject/select-patch.js?raw'
    import ipc from '../inject/ipc.js?raw'
    import contextMenu from '../inject/context-menu.js?raw'
    import zoomControl from '../inject/zoom-control.js?raw'

    let {
        tabId,
        style = '',
        headerPartOfMain,
        isScrolling,
        onFrameFocus = () => {},
        onFrameBlur = () => {},
        userMods,
        requestedResources,
        statusLightsEnabled = false,
        class: className = '',
        // createOffOriginLightbox = () => {},

        hoveredLink = $bindable(),
        commandKeyPressed = $bindable(),
        inputDiffVisible = $bindable(),
        inputDiffTimeout = $bindable(),
        inputDiffData = $bindable(),
        instantlyCleanupGlobalPreview = () => {},
        // observer,
    } = $props()

    let tab = $derived(data.docs[tabId])

    let viewMode = $derived(data.ui.viewMode)

    let linkPreviewTimeout = null
    let anchor = $state(null)

    // let usedUrl = $state('')
    
    // Track command key state
    let isCommandKeyDown = $state(false)

    // OAuth popup state
    let oauthPopup = $state(null) // { url, width, height, parentTab, event }

    // Track recently blocked off-origin URLs to prevent duplicate tab creation
    // Both onBeforeRequest and handleLoadStart may fire for the same navigation
    const recentlyBlockedUrls = new Map() // url -> timestamp
    const BLOCK_DEDUP_TIMEOUT = 2000 // 2 seconds

    // Derived values for error checking from origins store
    let currentCertificateError = $derived.by(() => {
        if (!tab?.url) {
            return null
        }
        const originValue = origin(tab.url)
        const certError = data.origins[originValue]?.certificateError ?? null
        // console.log(`🔒 [DEBUG] Tab ${tab.id} (${tab.url}) - Origin: ${originValue}, CertError:`, certError)
        return certError
    })

    let currentNetworkError = $derived.by(() => {
        if (!tab?.url) {
            return null
        }
        const originValue = origin(tab.url)
        const netError = data.origins[originValue]?.networkError ?? null
        // console.log(`🌐 [DEBUG] Tab ${tab.id} (${tab.url}) - Origin: ${originValue}, NetError:`, netError)
        return netError
    })

    // Permission-based navigation helpers
    // Determines if opening a new tab should use lightbox mode
    // Returns false (open in new tab) if:
    //   - Command key is pressed (override)
    //   - Origin has 'open-tab' permission granted
    // Returns true (use lightbox) if:
    //   - Permission is denied, mocked, or not requested (default behavior)
    function shouldUseLightboxForNewTab(originUrl, forceNewTab = false) {
        if (forceNewTab) return false
        const tabOrigin = origin(originUrl)
        if (data.isPermissionGranted('open-tab', tabOrigin)) {
            return false
        }
        return true
    }

    // Determines if off-origin navigation should use lightbox mode
    // Returns false (navigate directly) if:
    //   - Command key is pressed (override - opens in new tab)
    //   - Origin has 'navigate-off-origin' permission granted
    // Returns true (use lightbox) if:
    //   - Permission is denied, mocked, or not requested (default behavior)
    function shouldUseLightboxForOffOrigin(originUrl, forceNewTab = false) {
        if (forceNewTab) return false
        const tabOrigin = origin(originUrl)
        if (data.isPermissionGranted('navigate-off-origin', tabOrigin)) {
            return false
        }
        return true
    }

    // LED indicator functions - directly set timestamps in data store
    function showNetworkAccess() {
        data.ledIndicators.networkAccess = Date.now()
    }

    function showBlockedRequest() {
        data.ledIndicators.blockedRequest = Date.now()
    }

    function showMockedActivation() {
        data.ledIndicators.mockedActivation = Date.now()
    }

    function hideMockedActivation() {
        data.ledIndicators.mockedActivation = 0
    }

    // Check if a URL was recently blocked (for deduplication)
    function wasRecentlyBlocked(url) {
        const timestamp = recentlyBlockedUrls.get(url)
        if (!timestamp) return false
        if (Date.now() - timestamp > BLOCK_DEDUP_TIMEOUT) {
            recentlyBlockedUrls.delete(url)
            return false
        }
        return true
    }

    // Mark a URL as recently blocked
    function markAsBlocked(url) {
        recentlyBlockedUrls.set(url, Date.now())
        // Clean up old entries
        for (const [blockedUrl, timestamp] of recentlyBlockedUrls) {
            if (Date.now() - timestamp > BLOCK_DEDUP_TIMEOUT) {
                recentlyBlockedUrls.delete(blockedUrl)
            }
        }
    }

    // Check if user mods are applicable to current tab
    function matchesPattern(pattern, url) {
        if (pattern === '*') return true
        if (!pattern || !url) return false
        
        try {
            const urlObj = new URL(url)
            const hostname = urlObj.hostname
            
            // Support wildcards
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
            
            const regex = new RegExp(`^${regexPattern}$`, 'i')
            return regex.test(hostname) || regex.test(url)
        } catch {
            return false
        }
    }

    function getApplicableMods(url) {
        if (!userMods || !userMods.css || !userMods.js) return []
        
        const allMods = [...userMods.css, ...userMods.js]
        return allMods.filter(mod => mod.enabled && matchesPattern(mod.pattern, url))
    }

    // Check if current tab has applicable user mods
    $effect(() => {
        if (tab?.url && tab?.id === data.spaceMeta.activeTabId) {
            // console.log('checking for applicable mods', tab.url)
            const applicableMods = getApplicableMods(tab.url)
            if (applicableMods.length > 0) {
                showMockedActivation()
            } else {
                hideMockedActivation()
            }
        }
    })
    
    // Obsolete, remove when everything works for a while
    // $effect(() => {
        // if (tab.url) {
        //     // Update title if it's an about: page or if current title is empty/generic
        //     if (tab.url.startsWith('about:')) {
        //         if (tab.url.startsWith('about:newtab') || tab.url.startsWith('about:blank')) {
        //             tab.title = 'New Tab'
        //         } else if (tab.url.startsWith('about:')) {
        //             tab.title = tab.url.charAt(6).toUpperCase() + tab.url.slice(7)
        //         } else {
        //             // For regular URLs, extract origin as fallback title
        //             try {
        //                 const urlObj = new URL(tab.url)
        //                 tab.title = urlObj.origin || tab.url
        //             } catch {
        //                 tab.title = tab.url
        //             }
        //         }
        //     }
        //  else {
        //     tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${tab.url}&size=64`
        // }
        // }
    // })

    // Check if the current URL is about:newtab
    function isNewTabUrl(url) {
        return url?.startsWith('about:newtab') || url?.startsWith('about:blank')
    }
    
    // Check if the current URL is about:tabhistory
    function isTabHistoryUrl(url) {
        return url?.startsWith('about:tabhistory')
    }

    function handlePermissionRequest(tabId, event) {
        const { granted } = data.permissionRequest(tabId, event)
        // FIXME: permission requests only work sync?
        // requestedResources.push({
        //     permission: event.permission,
        //     url: event.url,
        //     tabId: tabId,
        //     timestamp: new Date().toISOString(),
        //     id: event.permission,
        //     lastUsed: 'now',
        //     status: 'Request'
        // })

        //  event.cancel()

        if (granted) {
            event.request.allow()
        } else {
            event.request.deny()
        }
        // event.request.deny()
        //    return granted ? event.request.allow() : event.request.deny()
    }

    // Check if an error code represents a certificate issue
    function isCertificateError(errorCode) {
        if (!errorCode) return false
        
        const error = errorCode.toString()
        
        // Check for any ERR_SSL_* or ERR_CERT_* prefix (handles both prefixed and non-prefixed)
        return error.includes('ERR_SSL_') || 
               error.includes('ERR_CERT_') || 
               error.includes('net::ERR_SSL_') || 
               error.includes('net::ERR_CERT_')
    }

    // Set certificate error on origin
    function setCertificateError(tab, errorCode, url) {
        const humanReadableError = getCertificateErrorDescription(errorCode)

        const certificateError = {
            code: errorCode,
            text: humanReadableError,
            url: url,
            timestamp: Date.now()
        }

        const originValue = origin(url)
        data.origins[originValue] ??= {}
        data.origins[originValue].certificateError = certificateError
        
        // Re-evaluate security state (will be set to 'insecure' due to certificate error)
        evaluateSecurityState(tab)
        
        console.warn(`🔒 Certificate error detected for ${url}: ${errorCode} - ${humanReadableError}`)
    }

    // Properly evaluate and set security state based on URL and certificate status
    function evaluateSecurityState(tab) {
        const originValue = origin(tab.url)
        data.origins[originValue] ??= {}
        
        // const hasCertificateError = !!data.origins[originValue]?.certificateError
        
        try {
            const url = new URL(tab.url)
            
            // About pages are secure as they only run inside the browser
            if (url.protocol === 'about:') {
                data.origins[originValue].securityState = 'secure'
                return
            }
            
            // HTTPS with no certificate errors = secure
            if (url.protocol === 'https:') {
                data.origins[originValue].securityState = 'secure'
                return
            }
            
            // HTTP = insecure
            if (url.protocol === 'http:') {
                data.origins[originValue].securityState = 'insecure'
                return
            }
            
            // Other protocols = unknown
            data.origins[originValue].securityState = 'unknown'
            
        } catch (error) {
            // Invalid URL
            data.origins[originValue].securityState = 'unknown'
        }
    }

    // Get human-readable description for certificate errors
    function getCertificateErrorDescription(errorCode) {
        const descriptions = {
            'ERR_CERT_DATE_INVALID': 'The certificate has expired or is not yet valid',
            'ERR_CERT_COMMON_NAME_INVALID': 'The certificate is not valid for this domain',
            'ERR_CERT_REVOKED': 'The certificate has been revoked',
            'ERR_SSL_PINNED_KEY_NOT_IN_CERT_CHAIN': 'The certificate does not match the expected public key',
            'ERR_SSL_VERSION_OR_CIPHER_MISMATCH': 'SSL/TLS version or cipher mismatch',
            'ERR_CERT_AUTHORITY_INVALID': 'The certificate authority is not trusted',
            'ERR_CERT_CONTAINS_ERRORS': 'The certificate contains errors',
            'ERR_CERT_NO_REVOCATION_MECHANISM': 'The certificate has no revocation mechanism',
            'ERR_CERT_UNABLE_TO_CHECK_REVOCATION': 'Unable to check certificate revocation status',
            'ERR_CERT_INVALID': 'The certificate is invalid',
            'ERR_CERT_WEAK_SIGNATURE_ALGORITHM': 'The certificate uses a weak signature algorithm',
            'ERR_CERT_WEAK_KEY': 'The certificate uses a weak key',
            'ERR_CERT_NAME_CONSTRAINT_VIOLATION': 'The certificate violates name constraints',
            'ERR_CERT_VALIDITY_TOO_LONG': 'The certificate validity period is too long',
            'ERR_CERTIFICATE_TRANSPARENCY_REQUIRED': 'Certificate transparency is required but not present',
            'ERR_CERT_SYMANTEC_LEGACY': 'This certificate is from a legacy Symantec CA'
        }
        
        return descriptions[errorCode] || `Certificate or SSL error: ${errorCode}`
    }

    // Check if an error code represents a network error
    function isNetworkError(errorCode) {
        if (!errorCode) return false
        
        const error = errorCode.toString()
        
        // Check for network error patterns
        return error.includes('ERR_NAME_NOT_RESOLVED') ||
               error.includes('ERR_INTERNET_DISCONNECTED') ||
               error.includes('ERR_CONNECTION_REFUSED') ||
               error.includes('ERR_CONNECTION_TIMED_OUT') ||
               error.includes('ERR_NETWORK_CHANGED') ||
               error.includes('ERR_CONNECTION_ABORTED') ||
               error.includes('ERR_CONNECTION_RESET') ||
               error.includes('ERR_CONNECTION_FAILED') ||
               error.includes('ERR_NETWORK_IO_SUSPENDED') ||
               error.includes('ERR_NETWORK_ACCESS_DENIED') ||
               error.includes('ERR_PROXY_CONNECTION_FAILED') ||
               error.includes('ERR_DNS_TIMED_OUT') ||
               error.includes('ERR_DNS_MALFORMED_RESPONSE') ||
               error.includes('ERR_DNS_SERVER_FAILED') ||
               error.includes('ERR_DNS_CACHE_MISS') ||
               error.includes('ERR_ADDRESS_UNREACHABLE') ||
               error.includes('ERR_NETWORK_TIMEOUT')
    }

    // Set network error on origin
    function setNetworkError(tab, errorCode, url) {
        const networkError = {
            code: errorCode,
            url: url,
            timestamp: Date.now()
        }

        const originValue = origin(url)
        data.origins[originValue] ??= {}
        data.origins[originValue].networkError = networkError
        
        console.warn(`🌐 Network error detected for ${url}: ${errorCode}`)
    }

    // Clear network error from origin
    function clearNetworkError(tab) {
        const originValue = origin(tab.url)
        if (data.origins[originValue]?.networkError) {
            data.origins[originValue].networkError = null
            console.log(`🌐 Network error cleared for ${tab.url}`)
        }
    }

    // Clear certificate error from origin
    function clearCertificateError(tab) {
        const originValue = origin(tab.url)
        if (data.origins[originValue]?.certificateError) {
            data.origins[originValue].certificateError = null
            console.log(`🔒 Certificate error cleared for ${tab.url}`)
        }
    }

    // Reload the current tab - delegates to centralized data.reloadTab
    function reloadTab(tab) {
        data.reloadTab(tab.id)
    }

    function handleEvent(eventName, tab, event) {
        console.log(eventName, tab, event)
    }
    function handleAudioStateChanged (tab, event) {
        tab.audioPlaying = event.audible
    }

    function handleLoadAbort(tab, event) {
        if (!event.isTopLevel) {
            return
        }
        
        console.log('🚨 onloadabort', event)
        if (!tab) {
            return
        }

        // Load failed, stop loading immediately
        data.frames[tab.id].loading = false
        
        // Check if this is a certificate error
        if (event && event.reason) {
            // console.log(`🔍 Checking if "${event.reason}" is a certificate error...`)
            if (isCertificateError(event.reason)) {
                console.log(`🔒 CERTIFICATE ERROR DETECTED: ${event.reason}`)
                setCertificateError(tab, event.reason, event.url || tab.url)
            } else if (isNetworkError(event.reason)) {
                console.log(`🌐 NETWORK ERROR DETECTED in loadabort: ${event.reason}`)
                const errorCode = event.reason.replace('net::', '')
                setNetworkError(tab, errorCode, event.url || tab.url)
            }
        }
    }

    async function captureTabScreenshot(tab) {
        let frame = null
        if (!frame) {
            frame = data.frames[tab.id]?.frame
        }
        if (!frame) {
            console.log('Frame not found for tab:', tab.id)
            return
        }

        if (typeof frame.captureVisibleRegion !== 'function') {
            return
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000))

        try {
            let screenshot = null
            
            // Check if frame is ready and loaded
            // const isFrameReady = () => {
            //     return frame.src && 
            //            !frame.src.includes('about:blank') && 
            //            frame.contentWindow !== null
            // }
            
            // Wait for frame to be ready if needed
            // if (!isFrameReady()) {
            //     console.log('Frame not ready for screenshot, waiting...')
            //     await new Promise(resolve => setTimeout(resolve, 1000))
            //     if (!isFrameReady()) {
            //         console.log('Frame still not ready, skipping screenshot')
            //         return null
            //     }
            // }
            
            // Retry mechanism for flaky captures
            // for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    // console.log(`Screenshot attempt ${attempt} for tab ${tab.id}`)
                    screenshot = await frame.captureVisibleRegion({
                        format: 'png',
                        quality: 80
                    })
                    // if (screenshot) {
                    //     console.log(`Screenshot successful on attempt ${attempt}`)
                    //     // break
                    // }
                } catch (captureError) {
                    console.log(`Capture failed:`, captureError)
                    // if (attempt < 3) {
                    //     // Wait before retry, increasing delay each time
                    //     await new Promise(resolve => setTimeout(resolve, attempt * 500))
                    // }
                }
            // }
            
            if (screenshot) {
                // tab.screenshot = screenshot
                await data.updateTab(tab.id, { screenshot })
            }
        } catch (err) {
            console.log('Error capturing screenshot:', err)
        }
    }

    // function handleContentLoad(tab) {
    //     // setTimeout(() => updateTabMeta(tab), 100)

    //     console.log('handleContentLoad', data.frames[tab.id]?.frame?.src)
    // }

    // todo cycle every 15 seconds to check audiostate?
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

    // function handleLoadCommit(tab, event) {
    //     if (!event.isTopLevel) {
    //         return
    //     }

        // fired on success stop.  stop fires for commit and abort
        // console.log('handleLoadCommit:', event.url)
        
        // Update the URL immediately
        // tab.url = event.url
        
        // Update the favicon URL
        // tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${event.url}&size=64`
    // }

    function handleLoadStart(tab, event) {
        if (!event.isTopLevel) {
            return
        }

        hoveredLink = null
        instantlyCleanupGlobalPreview()
        data.frames[tab.id].loading = true

        // Clear favicon immediately on navigation start to prevent stale favicons
        // This ensures the globe icon shows while loading instead of old favicon
        if (event?.url && event.url !== tab.url) {
            tab.favicon = null
        }

        // Fallback off-origin blocking in loadstart (main blocking is in onBeforeRequest)
        // This catches edge cases where the request handler didn't fire
        if (event?.url && tab.url) {
            const currentOrigin = origin(tab.url)
            const targetOrigin = origin(event.url)
            
            // Skip origin check for about: pages and same-origin navigation
            if (event.isTopLevel && currentOrigin !== 'about' && currentOrigin !== 'unknown' && 
                targetOrigin !== currentOrigin && targetOrigin !== 'about') {
                
                // Check if already blocked by onBeforeRequest (deduplication)
                if (wasRecentlyBlocked(event.url)) {
                    console.log(`🔄 [loadstart fallback] Already blocked by onBeforeRequest: ${event.url}`)
                    const frame = data.frames[tab.id]?.frame
                    if (frame?.stop) {
                        frame.stop()
                    }
                    return
                }
                
                console.log(`🚫 [loadstart fallback] Off-origin navigation: ${currentOrigin} → ${targetOrigin} (${event.url}), isCommandKeyDown: ${isCommandKeyDown}`)
                markAsBlocked(event.url)

                const frame = data.frames[tab.id]?.frame
                if (frame?.stop) {
                    frame.stop()
                }
                
                // Create new tab/lightbox for off-origin navigation
                // Command+click always opens in new tab (not lightbox), in background
                // Otherwise check if origin has 'navigate-off-origin' permission
                const useLightbox = shouldUseLightboxForOffOrigin(tab.url, isCommandKeyDown)
                const shouldFocus = !isCommandKeyDown
                
                data.newTab(data.spaceMeta.activeSpace, {
                    url: event.url,
                    title: '',
                    opener: tab.id,
                    lightbox: useLightbox,
                    shouldFocus
                })     
                
                // Don't set loading state since we're blocking navigation
                return
            }
        }

        evaluateSecurityState(tab)
        updateTabMeta(tab)
    }

    function handleLoadStop(tab) {
        // console.log('stopped', {tab})
        // console.log('handleLoadStop', data.frames[tab.id]?.frame?.src)
        if (!data.frames[tab.id]) return
        const wasLoading = data.frames[tab.id].loading
        data.frames[tab.id].loading = false
        data.frames[tab.id].initialLoad = true
        
        const originValue = origin(tab.url)
        const currentNetworkErr = data.origins[originValue]?.networkError
        const currentCertErr = data.origins[originValue]?.certificateError
        
        // console.log(`handleLoadStop called for`, {tab, e, currentNetworkErr})

        // Get actual URL from frame if available (more reliable than tab.url during navigation)
        const frameUrl = data.frames[tab.id]?.frame?.src || tab.url
        
        // Don't set favicon for about: URLs - let Favicon.svelte handle it
        if (!frameUrl?.startsWith('about:')) {
            tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${frameUrl}&size=64`
        } else {
            tab.favicon = null
        }

        // Only clear errors if the load was successful (was still loading when this was called)
        if (wasLoading) {
            // Clear network error if we successfully navigated to a different URL
            if (currentNetworkErr && currentNetworkErr.url !== tab?.url) {
                clearNetworkError(tab)
                console.log(`🌐 Network error cleared - successfully navigated from ${currentNetworkErr?.url} to ${tab?.url}`)
            }
            
            // Clear certificate error if we successfully navigated to a different URL
            if (currentCertErr && tab.url !== currentCertErr.url) {
                clearCertificateError(tab)
                console.log(`🔒 Certificate error cleared - successfully navigated from ${currentCertErr?.url} to ${tab.url}`)
            }
            
            // console.log(`✅ Page loaded successfully: ${tab.url}`)
        } else {
            // Load failed - preserve errors
            console.log(`🚨 Load failed - preserving errors for ${tab.url}`)
            if (currentNetworkErr) {
                console.log(`🌐 Network error preserved: ${currentNetworkErr.code}`)
            }
            if (currentCertErr) {
                console.log(`🔒 Certificate error preserved: ${currentCertErr.code}`)
            }
        }
        
        // const hasNetworkError = !!currentNetworkErr
        // const hasCertError = !!currentCertErr
        
        // Update title and capture screenshot after page loads (only if successful)
        updateTabMeta(tab)
        
        // Queue screenshot capture during idle time to avoid blocking UI
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => {
                captureTabScreenshot(tab)
            }, { timeout: 5000 })
        } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(() => captureTabScreenshot(tab), 1000)
        }
    }

    function handleNewWindow(tab, e) {
        // Check for modifier keys in the event
        // windowOpenDisposition can be: "new_foreground_tab", "new_background_tab", "new_popup", "new_window"
        // Cmd+click typically sets this to "new_background_tab"
        const hasModifierKey = isCommandKeyDown || e.windowOpenDisposition === 'new_background_tab'
        console.log('New window request:', e, 'isCommandKeyDown:', isCommandKeyDown, 'hasModifierKey:', hasModifierKey)
        
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

        if (isOAuthPopup) {
            handleOAuthPopup(tab, e)
        } else {
            const currentOrigin = origin(tab.url)
            
            // Command+click always opens in new tab (not lightbox), in background
            // hasModifierKey is set above based on isCommandKeyDown or windowOpenDisposition
            const forceNewTab = hasModifierKey
            
            // Check if origin has permission to open tabs
            const hasOpenTabPermission = data.isPermissionGranted('open-tab', currentOrigin)
            
            // Use lightbox if: not command+click AND (permission not granted or permission is mocked)
            const useLightbox = !forceNewTab && !hasOpenTabPermission
            
            // Command+click opens in background, otherwise use window disposition
            const shouldFocus = forceNewTab ? false : e.windowOpenDisposition !== "new_background_tab"
            
            data.newTab(data.spaceMeta.activeSpace, {
                url: e.targetUrl,
                title: e.title,
                opener: tab.id,
                lightbox: useLightbox,
                shouldFocus
            })         
        }
    }

    // Handle OAuth popup windows with proper window.opener support
    function handleOAuthPopup(parentTab, e) {
        console.log('Creating OAuth popup for:', e.targetUrl)
        
        // Create the popup frame immediately
        const popupFrame = document.createElement('controlledframe')
        popupFrame.classList.add('oauth-popup-frame')
        popupFrame.partition = parentTab.partition || 'persist:myapp'
        popupFrame.src = e.targetUrl
        popupFrame.sandbox = "allow-scripts allow-forms allow-same-origin allow-popups"
        popupFrame.allow = "camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'; publickey-credentials-create 'self'; publickey-credentials-get 'self'"
        popupFrame.referrerpolicy = "strict-origin-when-cross-origin"
        popupFrame.allowscaling = false
        popupFrame.autosize = true
        popupFrame.allowtransparency = false
        
        // Set up event handlers
        popupFrame.onconsolemessage = (event) => handleOAuthPopupEvent('consolemessage', popupFrame, event)
        popupFrame.onloadstart = (event) => handleOAuthPopupEvent('loadstart', popupFrame, event)
        popupFrame.onloadstop = (event) => handleOAuthPopupEvent('loadstop', popupFrame, event)
        popupFrame.onloadabort = (event) => handleOAuthPopupEvent('loadabort', popupFrame, event)
        popupFrame.onexit = (event) => handleOAuthPopupEvent('exit', popupFrame, event)
        popupFrame.onclose = (event) => handleOAuthPopupEvent('close', popupFrame, event)
        
        // Attach the window immediately to prevent default behavior
        try {
            e.window.attach(popupFrame)
            console.log('[OAuth] Window attached to popup frame successfully')
        } catch (error) {
            console.error('[OAuth] Failed to attach window to popup:', error)
            return
        }
        
        // Set reactive state to show popup
        oauthPopup = {
            url: e.targetUrl,
            width: e.initialWidth || 500,
            height: e.initialHeight || 600,
            parentTab,
            event: e,
            frame: popupFrame
        }
    }

    async function updateTabMeta(tab) {
        let frame = null
        if (!frame) {
            frame = data.frames[tab.id]?.frame
        }
        if (!frame) return

        let url = frame.src || tab.url

        // For about: URLs, clear favicon but preserve existing title
        if (url.startsWith('about:')) {
            data.updateTab(tab.id, { favicon: null, url })
            return
        }

        let favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`

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
            if (!title) {
                // Fallback to URL if no title is available
                if (url) {
                    try {
                        const urlObj = new URL(url)
                        title = urlObj.origin || url
                    } catch {
                        title = url
                    }
                }
            }

            // console.log('updateTabMeta', {favicon, title, url})
            data.updateTab(tab.id, { favicon, title, url })
        } catch (err) {
            console.log('Error updating tab meta:', err, tab)
        }
    }

// Content script for window focus/blur handling
function setupContentScripts(frame) {        
        // First try a simple test script to verify content script injection works
        const systemInjections = [
            {
                name: 'system-css',
                urlPatterns: [ 'http://*/*', 'https://*/*'], // '<all_urls>',
                css: {
                    // fix scroll bug in PWA/IWA that makes scroll janky on child element scrolling
                    code: `* {
            overscroll-behavior-x: none;
        }`
                }
            },

        {
            name: 'system-script',
            urlPatterns: ['http://*/*', 'https://*/*'], // '<all_urls>', 
            js: {
                code: `
const tabId = '${tab?.id || tabId}';

${ipc}

${select}

${zoomControl}

${contextMenu}


// Track hovered anchor elements
let currentHoveredAnchor = null;

document.addEventListener('mouseover', function(event) {
    // Find the closest anchor element in the event path
    const anchor = event.target.closest('a');
    
    // Only log if we're hovering a new anchor (different from the last one)
    if (anchor && anchor !== currentHoveredAnchor) {
        currentHoveredAnchor = anchor;
        
        // Get anchor position relative to viewport
        const rect = anchor.getBoundingClientRect();
        // Compute viewport origin in screen coords using the event
        const vpx = (typeof event.screenX === 'number' && typeof event.clientX === 'number') ? (event.screenX - event.clientX) : 0;
        const vpy = (typeof event.screenY === 'number' && typeof event.clientY === 'number') ? (event.screenY - event.clientY) : 0;
        
        // Log anchor enter with details including position and screen coordinates
        // Use the link's right edge as the reference to avoid preview overlapping the cursor on long links
        console.log('iwa:link-enter:' + tabId + ':' + JSON.stringify({
            href: anchor.href || anchor.getAttribute('href') || '',
            target: anchor.target || anchor.getAttribute('target') || '',
            rel: anchor.rel || anchor.getAttribute('rel') || '',
            title: anchor.title || anchor.getAttribute('title') || '',
            position: {
                x: rect.right,
                y: rect.top + rect.height / 2,
                left: rect.right,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height
            },
            absolute: {
                left: vpx + rect.left,
                top: vpy + rect.top,
                right: vpx + rect.right,
                bottom: vpy + rect.bottom
            },
            screenX: window.screenX || 0,
            screenY: window.screenY || 0
        }));
    } else if (!anchor && currentHoveredAnchor) {
        // Left the anchor element
        console.log('iwa:link-leave:' + tabId + ':' + JSON.stringify({
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
            frameId: tabId,
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
        console.log('iwa:dragdrop:' + tabId + ':' + JSON.stringify(eventData));
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
            
            console.log('iwa:dragdrop-data:' + tabId + ':' + JSON.stringify(additionalData));
        }
    }, { capture: true });
    
    // Dragend - when drag operation ends
    document.addEventListener('dragend', (event) => {
        logDragDropEvent('dragend', event);
        dragEventCounter = 0; // Reset counter
    }, { capture: true });
    
    console.log('🎯 Drag&Drop listeners installed in controlled frame ' + tabId);
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
            console.log('iwa:input-text:' + tabId + ':' + JSON.stringify({
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
            allFrames: true,
            matchAboutBlank: true
        }]

        const userInjections = [
            ...userMods.css.map(mod => {
                return {
                    name: mod.name,
                    urlPatterns: [mod.pattern], // .replace(/^\*/g, '<all_urls>')
                    css: {
                        code: mod.content
                    }
                }
            }),
            ...userMods.js.map(mod => {
                return {
                    name: mod.name,
                    urlPatterns: [mod.pattern], // replace(/^\*/g, '<all_urls>')
                    js: {
                        code: mod.content
                    }
                }
            })
        ]

        if (!frame.addContentScripts) {
            frame.src = untrack(() => tab.url)
        } else {
            frame.addContentScripts([...systemInjections, ...userInjections]).then((res) => {
            console.log('####### 💉 [INJECT] Successful script injection | tabId:', tab?.id || tabId, '| res:', res)

            frame.src  = untrack(() => tab.url)
            
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

        // monkey patch the old api back again to get it working in chrome 139+
        // todo: replace with single createWebRequestInterceptor interceptor object for all events if url patterns are the same 

        const requestEvents = ['onBeforeRequest', 'onHeadersReceived', 'onAuthRequired', 'onBeforeRedirect', 'onResponseStarted', 'onCompleted', 'onErrorOccurred']

        requestEvents.forEach(event => {
            if(frame.request[event] === undefined) {
                frame.request[event] = {
                    addListener: (callback, urlPatterns, options) => {
                        const _resourceTypes = ['csp_report', 'font', 'image', 'main_frame', 'media', 'object', 'other', 'ping', 'script', 'stylesheet', 'sub_frame', 'webbundle', 'websocket', 'xmlhttprequest']
                        const interceptor = frame.request.createWebRequestInterceptor({
                            urlPatterns: urlPatterns.urls.map(url => url === '<all_urls>' ? '*://*/*' : url),
                            //resourceTypes: resourceTypes.filter(type => _resourceTypes.includes(type)), 
                            blocking: options && options.includes('blocking'),
                            includeRequestBody: options && options.includes('requestBody') 
                            // includeHeaders: options.includes('headers') // "none", "same-origin", or "cross-origin"
                        })
                        interceptor.addEventListener(event.replace('on', '').toLowerCase(), callback)
                    }
                } 
            }
        })

        // Log all request events with full details
        frame.request.onBeforeRequest.addListener((details) => {
            const url = new URL(details.url || details.request.url)
            const requestType = details.type || details.request?.type
            
            // Block off-origin main_frame navigations BEFORE they start (more reliable than frame.stop())
            if (requestType === 'main_frame') {
                const currentTabUrl = tab?.url
                if (currentTabUrl) {
                    const currentOrigin = origin(currentTabUrl)
                    const targetOrigin = origin(url.href)
                    
                    // Skip origin check for about: pages and same-origin navigation
                    if (currentOrigin !== 'about' && currentOrigin !== 'unknown' && 
                        targetOrigin !== currentOrigin && targetOrigin !== 'about') {
                        
                        // Deduplicate: check if this URL was already blocked recently
                        if (wasRecentlyBlocked(url.href)) {
                            console.log(`🔄 [onBeforeRequest] Already blocked recently, skipping: ${url.href}`)
                            if (details.preventDefault) {
                                details.preventDefault()
                            }
                            return { cancel: true }
                        }
                        
                        console.log(`🚫 [onBeforeRequest] Blocking off-origin navigation: ${currentOrigin} → ${targetOrigin} (${url.href}), isCommandKeyDown: ${isCommandKeyDown}`)
                        markAsBlocked(url.href)
                        
                        // Cancel the request before it starts
                        if (details.preventDefault) {
                            details.preventDefault()
                        }
                        
                        // Create new tab/lightbox for off-origin navigation
                        // Command+click always opens in new tab (not lightbox), in background
                        // Otherwise check if origin has 'navigate-off-origin' permission
                        const useLightbox = shouldUseLightboxForOffOrigin(currentTabUrl, isCommandKeyDown)
                        const shouldFocus = !isCommandKeyDown
                        
                        data.newTab(data.spaceMeta.activeSpace, {
                            url: url.href,
                            title: '',
                            opener: tab.id,
                            lightbox: useLightbox,
                            shouldFocus
                        })
                        
                        showBlockedRequest()
                        return { cancel: true }
                    }
                }
            }

            const block = url.hostname.indexOf("google-analytics.com") != -1 
                || url.hostname.indexOf("googletagmanager.com") != -1
                || url.hostname.indexOf("adservice.google.com") != -1
                || url.hostname.indexOf("doubleclick.net") != -1
                || url.hostname.indexOf('cdn.cookielaw.org') != -1
                || url.hostname.indexOf('.googlesyndication.com') != -1
                || url.hostname.indexOf('fides-cdn.ethyca.com') != -1
                || url.hostname.indexOf('posthog.com') != -1

                // only for data saver/ use proxy
                // || url.hostname.indexOf('fonts.gstatic.com') != -1

                // needs to be exposed and enablable as custom entities:
                || url.hostname.indexOf('play.google.com') != -1

                || url.hostname.indexOf('accounts.google.com/') != -1
                || url.hostname.indexOf('appleid.cdn-apple.com') != -1

                // hanlde special tracking for internal domains
                || url.pathname.indexOf('/track') != -1 && (details.request.method == 'POST' || details.request.method == 'PUT')

            if (block) {
                if (details.preventDefault) {
                    details.preventDefault()
                }
                // Show red LED for blocked requests
                showBlockedRequest()
                return { cancel: true }
            } else {
                // Show green LED for allowed network access
                showNetworkAccess()
                return { cancel: false }
            }
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
            // details.error !== 'net::ERR_BLOCKED_BY_ORB' &&
            if (details.error !== 'net::ERR_BLOCKED_BY_CLIENT') {
                    console.error('❌ Request Error:', {
                    requestId: details.requestId,
                    url: details.url,
                    error: details.error,
                    fromCache: details.fromCache,
                    ip: details.ip
                })
            }
            
            
            // Check if this is a certificate error
            if (details.error) {
                // console.log(`🔍 Request error - checking if "${details.error}" is a certificate error...`)
                if (isCertificateError(details.error)) {
                    // ANY certificate error (main frame OR subresource) compromises the entire page
                    console.log(`🔒 CERTIFICATE ERROR DETECTED: ${details.error} for ${details.url}`)
                    console.log(`🚨 SECURITY COMPROMISED: Certificate error in ANY resource makes entire page insecure`)
                    const errorCode = details.error.replace('net::', '')
                    setCertificateError(tab, errorCode, details.url)
                    // Load failed due to certificate error
                    if (details.frameId === 0) {
                        data.frames[tab.id].loading = false
                    }
                } else if (isNetworkError(details.error)) {
                    // Network error detected - only set for main frame errors
                    console.log(`🌐 NETWORK ERROR DETECTED: ${details.error} for ${details.url}`)
                    const errorCode = details.error.replace('net::', '')
                    
                    // Only show network error page for main frame errors (not subresources)
                    if (details.frameId === 0) {
                        setNetworkError(tab, errorCode, details.url)
                        // Load failed due to network error
                        data.frames[tab.id].loading = false
                    }
                } 
                // else {
                //     console.log(`ℹ️ Not a certificate or network error: ${details.error}`)
                // }
            }
        }, allUrlsFilter)
    }

    // Context menu setup - adds a context menu entry and logs all data
    function setupContextMenu(frame) {
        if (!frame.contextMenus) {
            console.log('Context Menus API not available')
            return
        }
        // Set up event handlers using the new API
        frame.contextMenus.addEventListener('click', (event) => {
            console.log('🎯 Context menu clicked:', event)

            if (event.menuItem.id === 'reload') {
                reloadTab(tab)
            }
        })
        frame.contextMenus.addEventListener('show', (event) => {
            console.log('👁️ Context menu shown:', event)
        })

        // frame.contextMenus.create({
        //     id: 'root',
        //     title: 'Darc',
        //     contexts: ['all'], // Show on all types of content
        //     enabled: true,
        //     type: 'normal'
        // }).then(() => {
        //     console.log('✅ Context menu "Here" created successfully')
        // }).catch((err) => {
        //     console.error('❌ Failed to create context menu:', err)
        // })

        // Create a context menu item called "Here"
        frame.contextMenus.create({
            id: 'here',
            title: 'Here',
            contexts: ['all'], // Show on all types of content
            enabled: true,
            type: 'normal',
            parentId: null
        }).then(() => {
            console.log('✅ Context menu "Here" created successfully')
        }).catch((err) => {
            console.error('❌ Failed to create context menu:', err)
        })

        // // Create a reload context menu item
        // frame.contextMenus.create(        {
        //     id: 'reload',
        //     title: 'Reload',
        //     contexts: ['all'],
        //     enabled: true,
        //     type: 'normal',
        // }).then(() => {
        //     console.log('✅ Context menu "Reload" created successfully')
        // }).catch((err) => {
        //     console.error('❌ Failed to create reload context menu:', err)
        // })
    }

    // Input text diff state
    let currentInputText = $state('')
    let previousInputText = $state('')

    // Listen for messages from content scripts
    function setupMessageListener(frame) {
        const mytab = untrack(() => tab)
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
                // console.log('####### 🎯 [FOCUS-RECV] Received iwa:focus from inside frame | tabId:', tab?.id || tabId)
                onFrameFocus(tab?.id || tabId)
            } else if (message === 'iwa:blur') {
                // console.log('####### 😴 [BLUR-RECV] Received iwa:blur from inside frame | tabId:', tab?.id || tabId)
                onFrameBlur(tab?.id || tabId)
            } else if (message.startsWith('iwa:command-key-down:')) {
                // Track command key press from controlled frame
                const tabId = message.substring('iwa:command-key-down:'.length)
                if (tabId === mytab.id) {
                    isCommandKeyDown = true
                    commandKeyPressed = true
                }
            } else if (message.startsWith('iwa:command-key-up:')) {
                // Track command key release from controlled frame
                const tabId = message.substring('iwa:command-key-up:'.length)
                if (tabId === mytab.id) {
                    isCommandKeyDown = false
                    commandKeyPressed = false
                }
            } else if (message.startsWith('iwa:close-tab:')) {
                // Extract tab ID from message - handle colons in tab ID
                const tabId = message.substring('iwa:close-tab:'.length)
                console.log(`Controlled frame ${tabId} requested tab close`)
                
                // Dispatch custom event to app shell to close this tab
                window.dispatchEvent(new CustomEvent('darc-close-tab-from-frame', {
                    detail: { 
                        tabId: tabId,
                        sourceFrame: `tab_${tabId}`
                    }
                })) 
            } else if (message.startsWith('iwa:new-tab:')) {
                // Extract tab ID from message - handle colons in tab ID
                const tabId = message.substring('iwa:new-tab:'.length)
                console.log(`Controlled frame ${tabId} requested new tab`)
                
                // Dispatch custom event to app shell to open new tab
                window.dispatchEvent(new CustomEvent('darc-new-tab-from-frame', {
                    detail: { 
                        tabId: tabId,
                        sourceFrame: `tab_${mytab.id}`
                    }
                }))
            } else if (message.startsWith('iwa:reload-tab:')) {
                // Extract tab ID from message - handle colons in tab ID
                const tabId = message.substring('iwa:reload-tab:'.length)
                
                // Dispatch custom event to app shell to reload this tab
                window.dispatchEvent(new CustomEvent('darc-reload-tab-from-frame', {
                    detail: { 
                        tabId: tabId,
                        sourceFrame: `tab_${mytab.id}`
                    }
                }))
            } else if (message.startsWith('iwa:key:')) {
                // Generic key event from frame - format: iwa:key:{keyName}:{tabId}
                const parts = message.split(':')
                const keyName = parts[2]
                window.dispatchEvent(new CustomEvent('darc-key-from-frame', {
                    detail: { 
                        key: keyName,
                        tabId: mytab.id,
                        sourceFrame: `tab_${mytab.id}`
                    }
                }))
            } else if (message.startsWith('iwa:link-enter:')) {
                const prefix = 'iwa:link-enter:'
                const remainingMessage = message.substring(prefix.length)
                
                // Find the tab ID by looking for our known mytab.id, then extract data after it
                const tabIdPattern = mytab.id + ':'
                const tabIdIndex = remainingMessage.indexOf(tabIdPattern)
                
                if (tabIdIndex === 0) {
                    const tabId = mytab.id
                    try {
                        const dataPayload = remainingMessage.substring(tabIdPattern.length)
                        const linkData = JSON.parse(dataPayload)
                        
                        if (linkData.href) {
                            hoveredLink = linkData
                            
                            if (linkPreviewTimeout) {
                                clearTimeout(linkPreviewTimeout)
                                linkPreviewTimeout = null
                            }

                            linkPreviewTimeout = setTimeout(() => {
                                hoveredLink = null
                                linkPreviewTimeout = null
                            }, 7000)
                        }
                    } catch (error) {
                        console.error('Failed to parse link enter data:', error)
                    }
                }
            } else if (message.startsWith('iwa:link-leave:')) {
                const prefix = 'iwa:link-leave:'
                const remainingMessage = message.substring(prefix.length)
                
                // Find the tab ID by looking for our known mytab.id, then extract data after it
                const tabIdPattern = mytab.id + ':'
                const tabIdIndex = remainingMessage.indexOf(tabIdPattern)
                
                if (tabIdIndex === 0) {
                    const tabId = mytab.id
                    try {
                        const dataPayload = remainingMessage.substring(tabIdPattern.length)
                        const linkData = JSON.parse(dataPayload)
                        
                        hoveredLink = null

                        if (linkPreviewTimeout) {
                            clearTimeout(linkPreviewTimeout)
                            linkPreviewTimeout = null
                        }
                    } catch (error) {
                        console.error('Failed to parse link leave data:', error)
                    }
                }
            } else if (message.startsWith('iwa:input-text:')) {
                // Parse input text event
                const prefix = 'iwa:input-text:'
                const remainingMessage = message.substring(prefix.length)
                
                // Find the tab ID by looking for our known mytab.id, then extract data after it
                const tabIdPattern = mytab.id + ':'
                const tabIdIndex = remainingMessage.indexOf(tabIdPattern)
                
                if (tabIdIndex === 0) {
                    const tabId = mytab.id
                    try {
                        const dataPayload = remainingMessage.substring(tabIdPattern.length)
                        const inputData = JSON.parse(dataPayload)
                        // console.log(`[Tab ${tabId}] Input text:`, inputData)
                        
                        // Show input diff if it has meaningful text
                        if (inputData.text && inputData.text.length > 3) {
                            showInputDiff(inputData)
                        }
                    } catch (error) {
                        console.error('Failed to parse input text data:', error)
                    }
                }
            } else if (message.startsWith('iwa:zoom:')) {
                const prefix = 'iwa:zoom:'
                const remainingMessage = message.substring(prefix.length)
                const tabIdPattern = mytab.id + ':'
                const tabIdIndex = remainingMessage.indexOf(tabIdPattern)
                
                if (tabIdIndex === 0) {
                    const tabId = mytab.id
                    const zoomDirection = remainingMessage.substring(tabIdPattern.length)
                    
                    const gridViewOpen = viewMode === 'tile'
                    
                    if (zoomDirection === 'out') {
                        if (gridViewOpen) {
                            window.dispatchEvent(new CustomEvent('darc-zoom-out-at-max-internal', {
                                detail: { 
                                    source: 'controlled-frame-grid-view',
                                    tabId: tabId,
                                    currentScale: 1.0,
                                    direction: zoomDirection
                                }
                            }))
                        } else {
                            const frameScale = window.visualViewport?.scale || 1.0
                            let parentScale = 1.0
                            
                            try {
                                parentScale = window.parent?.visualViewport?.scale || 1.0
                            } catch (e) {}
                            
                            const currentScale = parentScale !== 1.0 ? parentScale : frameScale
                            
                            if (currentScale <= 1.0) {
                                window.dispatchEvent(new CustomEvent('darc-zoom-out-at-max-internal', {
                                    detail: { 
                                        source: 'controlled-frame',
                                        tabId: tabId,
                                        currentScale: currentScale,
                                        frameScale: frameScale,
                                        parentScale: parentScale,
                                        direction: zoomDirection
                                    }
                                }))
                            }
                        }
                    } else if (zoomDirection === 'in') {
                        window.dispatchEvent(new CustomEvent('darc-zoom-in', {
                            detail: { 
                                source: gridViewOpen ? 'controlled-frame-grid-view' : 'controlled-frame',
                                tabId: tabId,
                                direction: zoomDirection
                            }
                        }))
                    }
                    
                }
            } else if (message.startsWith('iwa:scale:')) {
                // Parse scale event
                const prefix = 'iwa:scale:'
                const remainingMessage = message.substring(prefix.length)
                
                // Find the tab ID by looking for our known mytab.id, then extract zoom direction after it
                const tabIdPattern = mytab.id + ':'
                const tabIdIndex = remainingMessage.indexOf(tabIdPattern)
                
                if (tabIdIndex === 0) {
                    const tabId = mytab.id
                    const zoomDirection = remainingMessage.substring(tabIdPattern.length)
                    
                    console.log(`[Tab ${tabId}] Zoom direction:`, zoomDirection)
                    
                    // Handle zoom if frame supports it
                    if (frame.setZoom) {
                    // Get current zoom level or default to 1.0
                    frame.getZoom?.().then((currentZoom) => {
                        let newZoom = currentZoom || 1.0
                        
                        // Check if zoom-out is attempted at minimum zoom level
                        // if (zoomDirection === 'out' && newZoom <= 0.3) {
                        //     console.log(`🔍 [CONTROLLED-FRAME] Zoom out attempted at minimum zoom level (${Math.round(newZoom * 100)}%) - triggering handleZoomOutAtMax`)
                            
                        //     // Dispatch event to trigger the zoom-out-at-max handler in App.svelte
                        //     window.dispatchEvent(new CustomEvent('darc-zoom-out-at-max-internal', {
                        //         detail: { 
                        //             source: 'controlled-frame',
                        //             tabId: tabId,
                        //             currentZoom: newZoom,
                        //             direction: zoomDirection
                        //         }
                        //     }))
                        //     return // Don't process normal zoom
                        // }
                        
                        // Normal zoom behavior - adjust zoom level based on direction (5% increments for smoother control)
                         if (zoomDirection === 'in') {
                             newZoom = Math.min(newZoom + 0.05, 3.0) // Max zoom 300%
                             // Dispatch event for zoom in to potentially close grid view
                            //  window.dispatchEvent(new CustomEvent('darc-zoom-in', {
                            //      detail: { 
                            //          source: 'controlled-frame-zoom',
                            //          tabId: tabId,
                            //          direction: zoomDirection,
                            //          newZoom: newZoom
                            //      }
                            //  }))
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
                            let currentZoom = 1.0
                            
                            // Check if zoom-out is attempted at minimum zoom level (fallback case)
                            if (zoomDirection === 'out' && currentZoom <= 1.0) {
                                console.log(`🔍 [CONTROLLED-FRAME] Zoom out attempted at fallback zoom level - triggering handleZoomOutAtMax`)
                                
                                // Dispatch event to trigger the zoom-out-at-max handler in App.svelte
                                window.dispatchEvent(new CustomEvent('darc-zoom-out-at-max-internal', {
                                    detail: { 
                                        source: 'controlled-frame-fallback',
                                        tabId: tabId,
                                        currentZoom: currentZoom,
                                        direction: zoomDirection
                                    }
                                }))
                                return // Don't process normal zoom
                            }
                            
                            let newZoom = currentZoom
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
                    } else {
                        console.warn(`[Tab ${tabId}] setZoom API not available on this frame`)
                    }
                }
            } else if (message.startsWith('iwa:dragdrop:')) {
                // Parse drag and drop event from controlled frame
                const prefix = 'iwa:dragdrop:'
                const remainingMessage = message.substring(prefix.length)
                
                // Find the tab ID by looking for our known mytab.id, then extract data after it
                const tabIdPattern = mytab.id + ':'
                const tabIdIndex = remainingMessage.indexOf(tabIdPattern)
                
                if (tabIdIndex === 0) {
                    const tabId = mytab.id
                    try {
                        const dataPayload = remainingMessage.substring(tabIdPattern.length)
                        const eventData = JSON.parse(dataPayload)
                        console.group(`🎯 [CONTROLLED-FRAME] ${eventData.type.toUpperCase()} in tab ${tabId}`)
                        console.log('📍 Frame Event Details:', eventData)
                        console.log('🖼️ Frame ID:', tabId)
                        console.groupEnd()
                    } catch (error) {
                        console.error('Failed to parse drag/drop event data:', error)
                    }
                }
            } else if (message.startsWith('iwa:dragdrop-data:')) {
                // Parse additional drag and drop data from controlled frame
                const prefix = 'iwa:dragdrop-data:'
                const remainingMessage = message.substring(prefix.length)
                
                // Find the tab ID by looking for our known mytab.id, then extract data after it
                const tabIdPattern = mytab.id + ':'
                const tabIdIndex = remainingMessage.indexOf(tabIdPattern)
                
                if (tabIdIndex === 0) {
                    const tabId = mytab.id
                    try {
                        const dataPayload = remainingMessage.substring(tabIdPattern.length)
                        const additionalData = JSON.parse(dataPayload)
                        console.group(`📋 [CONTROLLED-FRAME] Additional Drop Data in tab ${tabId}`)
                        console.log('📁 Files:', additionalData.files)
                        console.log('📝 Text Data:', additionalData.textData)
                        console.groupEnd()
                    } catch (error) {
                        console.error('Failed to parse additional drag/drop data:', error)
                    }
                }
            } else if (message.startsWith('iwa:mousedown:')) {
                // Handle mousedown from controlled frame - handle colons in tab ID
                // Format: iwa:mousedown:${tabId}:${button}:${mod}
                const parts = message.substring('iwa:mousedown:'.length).split(':')
                const hasModifier = parts.pop() === 'mod'  // Last part is 'mod' or empty
                const button = parts.length > 1 ? parseInt(parts.pop()) : undefined
                const msgTabId = parts.join(':')
                
                // Track modifier state for this tab's click
                if (msgTabId === mytab.id && hasModifier) {
                    isCommandKeyDown = true
                    commandKeyPressed = true
                }
                
                // Dispatch mousedown event to parent app
                window.dispatchEvent(new CustomEvent('darc-controlled-frame-mousedown', {
                    detail: { tabId: msgTabId, button: button, hasModifier }
                }))
            } else if (message.startsWith('iwa:mouseup:')) {
                // Handle mouseup from controlled frame - handle colons in tab ID
                const msgTabId = message.substring('iwa:mouseup:'.length)
                
                // Reset modifier key state after mouseup (click complete)
                // Use a short delay to ensure navigation events have been processed
                if (msgTabId === mytab.id) {
                    setTimeout(() => {
                        isCommandKeyDown = false
                        commandKeyPressed = false
                    }, 100)
                }
                
                // Dispatch mouseup event to parent app
                window.dispatchEvent(new CustomEvent('darc-controlled-frame-mouseup', {
                    detail: { tabId: msgTabId }
                }))
            } else if (message.startsWith('iwa:contextmenu-forced-native:')) {
                console.log(`🛡️ [CONTEXT MENU] Website preventDefault blocked - forcing native context menu in tab ${mytab.id}`)
            } else if (message.startsWith('iwa:contextmenu-native-forced:')) {
                console.log(`🖱️ [CONTEXT MENU] Native context menu forced with cmd/ctrl key in tab ${mytab.id}`)
            }
        })
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
    let frameWrapper = $state(null)
    let retry = $state(0)
    $effect(async () => {
        if (retry > 10) {
            console.error('retry error')
            return
        }
        await tick()

        if (!anchor || !frameWrapper) { 
            return
        }

        let controlledFrame = data.frames[tab?.id]?.frame

        // If transitioning from newtab to real URL, create frame if needed
        const framesObj = untrack(() => $state.snapshot(data.frames[tabId]))
        if (!framesObj) {
            // console.log('resetting frame!!!!!')
            data.frames[tabId] = {}
        }
        data.frames[tabId].wrapper = frameWrapper

        let addNode = false
        if (!controlledFrame && tab) {
            controlledFrame = document.createElement('controlledframe')
            const currentTabId = tab.id
            const mytab = untrack(() => tab)

            data.frames[tabId].frame = controlledFrame
            data.frames[tabId].pendingLoad = false
            addNode = true

            controlledFrame.classList.add('frame-instance')

            controlledFrame.partition = tab.partition || 'persist:myapp'

            controlledFrame.onnewwindow = e => handleNewWindow(mytab, e)
            controlledFrame.onaudiostatechanged = throttle(e => handleAudioStateChanged(mytab, e), 500, {leading: false})
            
            // fired when navigation (including reloads and traversals) starts, for every navigable of the embedded document, but not same document navigation.
            // IMPORTANT: leading: true is required to block off-origin navigation before it completes
            controlledFrame.onloadstart = throttle( e => handleLoadStart(mytab, e), 500, {leading: true})
            
            // fired when navigation has been completed.
            // controlledFrame.onloadcommit =  throttle(e => handleLoadCommit(mytab, e), 500, {leading: false})
            
            // fired when all pending navigations finish(either commit or abort). If a new navigation starts after, loadstop may fire again.
            controlledFrame.onloadstop = throttle(e => handleLoadStop(mytab, e), 500, {leading: false})

             // fired when the Window associated with embedded navigable fires a load event.
            // controlledFrame.oncontentload =  throttle(e => handleContentLoad(mytab, e), 500, {leading: false})

            // fired when navigation has exited before completion.
            controlledFrame.onloadabort =  throttle(e => handleLoadAbort(mytab, e), 500, {leading: false})

            controlledFrame.onclose = e => handleEvent('onclose', mytab, e)
            controlledFrame.oncontentresize = e => handleEvent('oncontentresize',mytab, e)
            controlledFrame.ondialog = e => handleEvent('ondialog',mytab, e)
            controlledFrame.onexit = e => handleEvent('onexit',mytab, e)
            controlledFrame.onloadredirect = e => handleEvent('onloadredirect',mytab, e)
            // controlledFrame.onloadredirect= (e) => { 
            //     console.log(onloadredirect', e)
            //     //         handleEvent('onloadredirect',tab, e)
            //     //         // Update URL on redirect
            //     //         // if (e.newUrl) {
            //     //         //     tab.url = e.newUrl
            //     //         //     tab.favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${e.newUrl}&size=64`
            //     //         // }
            //     //         return false
            // }
            controlledFrame.onpermissionrequest = e => handlePermissionRequest(tabId, e)
            controlledFrame.onresize = e => handleEvent('onresize',mytab, e)
            controlledFrame.onresponsive = e => handleEvent('onresponsive',mytab, e)  
            controlledFrame.onsizechanged = e => handleEvent('onsizechanged',mytab, e)
            controlledFrame.onunresponsive = e => handleEvent(mytab, e, 'onunresponsive')
            controlledFrame.allowscaling = true
            controlledFrame.autosize = true
            controlledFrame.allowtransparency = false

            controlledFrame.setZoomMode?.('disabled')
            setupRequestHandler(controlledFrame)
            setupMessageListener(controlledFrame)
            setupContentScripts(controlledFrame)
            setupContextMenu(controlledFrame)
            // controlledFrame.src = usedUrl
        }
        //  console.log('controlledFrame', controlledFrame, { attached, tab.url, addNode })
       
        if (addNode) {
            frameWrapper.insertBefore(controlledFrame, anchor)
            attached = true
        }

        if (!attached && controlledFrame && anchor) {
            try {
                frameWrapper.moveBefore(controlledFrame, anchor)
                attached = true
            } catch (err) {
                console.error('Error attaching ControlledFrame:', err)
                tab?.id && delete data.frames[tab.id]
                setTimeout(() => {
                    retry = retry + 1
                }, 10)
            }
        }
    })

    let detached = false
    onDestroy(async () => {
        await tick()
        // console.log('------------------', $state.snapshot(data.frames[tab.id].forceHibernated))
        if (tab?.id && !detached && !data.frames[tab.id]?.forceHibernated) {
            delete data.frames[tab.id]
        }
        
        if (linkPreviewTimeout) {
            clearTimeout(linkPreviewTimeout)
            linkPreviewTimeout = null
        }
    })
    
    function detach () {
        if (!tab?._id) {
            tab?.id && delete data.frames[tab.id]
            return {
                duration: 0
            }
        }
        
        let controlledFrame = data.frames[tab.id]?.frame

        if (controlledFrame) {
            const backgroundFrames = document.getElementById('backgroundFrames')
            const anchorFrame = document.getElementById('anchorFrame')
            backgroundFrames.moveBefore(controlledFrame, anchorFrame)
            detached = true
        }

        delete data.frames[tab.id]?.wrapper

        return {
            duration: 0
        }
    }

     // Close OAuth popup
     function closeOAuthPopup() {
        console.log('OAuth popup closed')
        
        // Clean up the frame if it exists
        if (oauthPopup?.frame) {
            try {
                if (oauthPopup.frame.parentNode) {
                    oauthPopup.frame.parentNode.removeChild(oauthPopup.frame)
                }
            } catch (error) {
                console.error('Error removing OAuth popup frame:', error)
            }
        }
        
        oauthPopup = null
    }

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
                    name: `oauth-opener-patch`,
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
                    runAt: 'document-start',
                    allFrames: true,
                    matchAboutBlank: true
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

    function handleOAuthKeydown(event) {
        if (oauthPopup && event.key === 'Escape') {
            closeOAuthPopup()
        }
    }

    function appendPopupFrame(container, frame) {
        if (frame) {
            container.appendChild(frame)
        }
        
        return {
            destroy() {
                if (frame && frame.parentNode) {
                    frame.parentNode.removeChild(frame)
                }
            }
        }
    }

    let oauthTimeout
    $effect(() => {
        if (oauthPopup) {
            oauthTimeout = setTimeout(() => {
                console.log('[OAuth] Popup timeout - closing after 10 minutes')
                closeOAuthPopup()
            }, 10 * 60 * 1000)
        } else if (oauthTimeout) {
            clearTimeout(oauthTimeout)
            oauthTimeout = null
        }

        return () => {
            if (oauthTimeout) {
                clearTimeout(oauthTimeout)
            }
        }
    })
</script>

<svelte:window onkeydown={handleOAuthKeydown} />
{#key tab?.partition || 'default'}
    {#if oauthPopup}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div 
            class="oauth-popup-backdrop" 
            onclick={closeOAuthPopup}
            transition:fade={{duration: 200}}
        ></div>

        <div 
            class="oauth-popup-frame-container"
            style="width: {oauthPopup.width}px; height: {oauthPopup.height}px;"
            transition:fade={{duration: 300, delay: 100}}
            use:appendPopupFrame={oauthPopup.frame}
        ></div>
    {/if}

    <div
        out:detach|global
        style="{style}"
        bind:this={frameWrapper} 
        
        class:window-controls-overlay={headerPartOfMain}
        class:no-pointer-events={isScrolling}
        class:certificate-error={!!currentCertificateError}
        class:network-error={!!currentNetworkError}
        class:new-tab-page={isNewTabUrl(tab?.url)}
        class:tab-history-page={isTabHistoryUrl(tab?.url)}
        id="tab_{tab?.id || tabId}"
        class="frame {className}"

        role="tabpanel"
        tabindex="0"
        onmousedown={(event) => {
            // console.log('[DEBUG:ControlledFrame] mousedown on frame wrapper | tabId:', tab?.id || tabId, '| button:', event.button)
            window.dispatchEvent(new CustomEvent('darc-controlled-frame-mousedown', {
                detail: { tabId: tab?.id || tabId, button: event.button }
            }))
            onFrameFocus()
        }}
        onmouseup={() => {
            window.dispatchEvent(new CustomEvent('darc-controlled-frame-mouseup', {
                detail: { tabId: tab?.id || tabId }
            }))
        }} >

        <div class="hidden" bind:this={anchor}></div>

        {#if currentCertificateError}
            <SSLErrorPage
                {tab}
                certificateError={currentCertificateError}
                onReload={() => reloadTab(tab)}
            />

        {:else if currentNetworkError}
            <NetworkErrorPage
                {tab}
                networkError={currentNetworkError}
                onReload={() => reloadTab(tab)}
            />

        {:else if isTabHistoryUrl(tab?.url)}
            <TabHistory
                {tab}
                isActive={tab?.id === data.spaceMeta.activeTabId}
            />
        {:else if isNewTabUrl(tab?.url)}
            <NewTab
                {tab}
                isActive={tab?.id === data.spaceMeta.activeTabId}
            />
        {/if}
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
        border-radius: 8px;
        overflow: hidden;
        border: none;
    }
    :global(.certificate-error > .frame-instance:not(.ssl-error)) {
        display: none;
    }
    :global(.network-error > .frame-instance:not(.network-error)) {
        display: none;
    }
    :global(.new-tab-page > .frame-instance) {
        display: none;
    }
    :global(.tab-history-page > .frame-instance) {
        display: none;
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

    .oauth-popup-frame-container {
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

    .oauth-popup-frame-container :global(.oauth-popup-frame) {
        width: 100%;
        height: 100%;
        display: block;
        border: none;
        border-radius: 12px;
    }
</style>

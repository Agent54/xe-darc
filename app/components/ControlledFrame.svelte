<script>
    import { untrack } from 'svelte'
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

    const initialUrl = $state(untrack(() => tab.url))

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

            // Method 1: Try executeScript to get document.title
            if (typeof frame.executeScript === 'function') {
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
            }

            // Method 2: Try to get title from frame.contentDocument
            if (!title && frame.contentDocument && frame.contentDocument.title) {
                title = frame.contentDocument.title.trim()
            }

            // Method 3: Try frame.title attribute
            if (!title && frame.title) {
                title = frame.title.trim()
            }

            // Method 4: Try getTitle method if available
            if (!title && typeof frame.getTitle === 'function') {
                try {
                    title = await frame.getTitle()
                    if (title) title = title.trim()
                } catch (getTitleErr) {
                    console.log('getTitle failed:', getTitleErr)
                }
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

    // todo cycle every 10 seconds to non hibernated tabs to check audiostate 
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
        onfocus={e => { onFrameFocus(tab, e) }}
        onblur={e => { onFrameBlur(tab, e) }}

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

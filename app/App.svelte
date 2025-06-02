<script>   
    function handleLoadCommit(event) {
        console.log('Page loaded:', event.url)
    }
    
    function navigateToExample() {
      controlledFrame.navigate('https://example.com')
    }

    let tabs = $state([
        { 
            id: 'tab-1',
            url: 'https://operaneon.com/', 
            title: 'Opera Neon', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://operaneon.com&size=64' 
        },
        {
            id: 'tab-2',
            url: 'https://open.spotify.com/', 
            title: 'Spotify', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://open.spotify.com&size=64' 
        },
        {
            id: 'tab-3',
            url: 'https://google.com', 
            title: 'Google', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64' 
        },
        {
            id: 'tab-4',
            url: 'about:newtab', 
            title: 'New Tab', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64' 
        }
    ])

    let closed = $state([])
    let activeTabIndex = $state(0)
    let visibilityTimers = new Map()

    function handleNewWindow(e) {
        console.log('New window:', e)
        tabs.push({ 
            id: crypto.randomUUID(),
            url: e.targetUrl, title: e.title, favicon: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${e.targetUrl}&size=64` })
    }

    function openNewTab() {
        const newTab = { 
            id: crypto.randomUUID(),
            url: 'https://google.com', 
            title: 'Google', 
            favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64' 
        }
        tabs.push(newTab)
        activeTabIndex = tabs.length - 1
    }

    function handleKeyDown(event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 't') {
            event.preventDefault()
            openNewTab()
        }
        if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
            event.preventDefault()
            if (tabs.length > 0) {
                const tabToClose = tabs[activeTabIndex]
                closeTab(tabToClose, event)
                if (activeTabIndex >= tabs.length) {
                    activeTabIndex = tabs.length - 1
                }
            }
        }
    }

    function openTab(tab, index) {
        console.log('Opening tab:', tab)
        activeTabIndex = index
        const controlledFrame = document.getElementById(`tab_${tab.id}`)
        if (controlledFrame) {
            controlledFrame.scrollIntoView({ behavior: 'smooth' })
        }
    }

    function closeTab(tab, event) {
        if (event) event.stopPropagation()
        closed.push(tab)
        tabs = tabs.filter(t => t !== tab)
    }

    function restoreTab(tab) {
        tabs.push(tab)
        closed = closed.filter(t => t !== tab)
    }

    function setupIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const tabId = entry.target.id.replace('tab_', '')
                const tabIndex = tabs.findIndex(t => t.id === tabId)
                
                if (entry.isIntersecting) {
                    // Start timer when tab becomes visible
                    const timer = setTimeout(() => {
                        if (entry.isIntersecting) {
                            activeTabIndex = tabIndex
                        }
                    }, 400)
                    visibilityTimers.set(tabId, timer)
                } else {
                    // Clear timer when tab is no longer visible
                    const timer = visibilityTimers.get(tabId)
                    if (timer) {
                        clearTimeout(timer)
                        visibilityTimers.delete(tabId)
                    }
                }
            })
        }, {
            threshold: 0.5, // Tab must be 50% visible
            root: document.querySelector('.controlled-frame-container')
        })

        // Observe all controlled frames
        tabs.forEach(tab => {
            const frame = document.getElementById(`tab_${tab.id}`)
            if (frame) observer.observe(frame)
        })

        return observer
    }

    let observer

    $effect(() => {
        if (tabs) {
            if (observer) observer.disconnect()
            observer = setupIntersectionObserver()
        }
    })
</script>

<svelte:window onkeydown={handleKeyDown}/>

<header>
    <ul style="padding: 0; margin: 6px;">
        {#each tabs as tab, i}
            <li class="tab" class:active={i===activeTabIndex}>
                <div onclick={() => openTab(tab, i)}>
                    <img src={tab.favicon} alt="" class="favicon" />
                    <span>{tab.title || tab.url}</span>
                    <button class="close-btn" onclick={() => closeTab(tab, event)}>×</button>
                </div>
            </li>
        {/each}
    </ul>
</header>

<div class="controlled-frame-container browser-frame w-full h-full"  style="width: 100%; height: 100%; box-sizing: border-box;">
    {#each tabs as tab}
        <controlledframe 
            id="tab_{tab.id}"
            src={tab.url}
            partition="persist:myapp"
            onloadcommit={handleLoadCommit}
            onnewwindow={(e) => { handleNewWindow(e)} }
        ></controlledframe>
    {/each}
</div>

<!-- <button on:click={navigateToExample}>Navigate to Example</button>
<button on:click={() => controlledFrame.back()}>Back</button>
<button on:click={() => controlledFrame.forward()}>Forward</button> -->

<style>
    header {
        /* -webkit-app-region: no-drag;
        app-region: no-drag; */
        position: fixed;
        top: 0;
        left: 80px;
        z-index: 1000;
        width: 100%;
        height: 38px;
        background-color: #000;
        color: #fff;
        display: flex;
        align-items: center;
        color: #fff;
        font-size: 16px;
        font-weight: 600;
        padding: 0;
        z-index: 1000;
        gap: 8px;
        flex-direction: row;
        flex-wrap: nowrap;
        justify-content: flex-start;
        align-items: flex-start;
    }
    ul {
        display: flex;
        flex-direction: row;
        flex-wrap: nowrap;
        justify-content: flex-start;
        align-items: flex-start;
        display: flex;
        gap: 7px;
        overflow: hidden;
        /* width: 100%; */
        /* max-width: 100px; */
    }
    .favicon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        opacity: 0.5;
    }
    .tab {
        user-select: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 400;
        font-family: 'Inter', sans-serif;
        padding: 4px;
        list-style: none;
        transition: border-color 0.3s ease;
        border-radius: 8px;
        background-color: hsl(0 0% 6% / 1);
        min-width: 60px;
        max-width: 150px;
        width: 200px;
        flex: 0 0 auto;
    }
    .tab:hover, .tab.active:hover {
        background-color: #4a4a4a;
        
    }
    .tab.active {
        background-color: hsl(0 0% 10% / 1);
    }
    .tab div {
        user-select: none;
        white-space: nowrap;
        text-overflow: ellipsis;
        text-decoration: none;
        color: hsl(0 0% 35% / 1);
        overflow: hidden;
        text-align: center;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 4px;
        position: relative;
    }

    .tab.active div {
        color: #999999;
    }
    .tab.active .favicon, .tab:hover .favicon {
        opacity: 1;
    }

   
    .tab:hover div{
        color: #fff;
    }

    .tab div span {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .close-btn {
        background: none;
        border: none;
        color: #717171;
        cursor: pointer;
        font-size: 18px;
        padding: 0 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 4px;
        margin-left: auto;
        opacity: 0;
        transition: opacity 0.2s ease;
        margin-right: 4px;
    }

    .close-btn:hover {
        background-color: #2a2a2a;
        color: #fff;
    }

    .tab:hover .close-btn {
        opacity: 1;
    }

    .controlled-frame-container {
      position: absolute;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 9px;
      margin: 0;
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      justify-content: flex-start;
      align-items: flex-start;
      width: 100%;
      height: 100%;
      gap: 9px;
      /* -webkit-app-region: drag;
      app-region: drag; */
      padding-top: 38px;
      scrollbar-width: thin;
      scrollbar-color: #888 #f1f1f1;
      overscroll-behavior-x: none;
      -webkit-overflow-scrolling: touch;
    }
    
    .controlled-frame-container::-webkit-scrollbar {
      height: 8px;
    }
    
    .controlled-frame-container::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }
    
    .controlled-frame-container::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }
    
    .controlled-frame-container::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    .browser-frame {
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    
    :global(controlledframe) {
      min-width: calc(100vw - 18px);
      width: calc(100vw - 18px);
      height: 100%;
      border: none;
      display: block;
      border-radius: inherit;
      border-radius: 8px;
      overflow: hidden;
      flex: 0 0 auto;
      /* -webkit-app-region: no-drag;
      app-region: no-drag; */
    }
  </style>
  
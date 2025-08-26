<script>
    import data from '../data.svelte.js'
    import { onMount } from 'svelte'
    
    let { src, alt = '', class: className = '', lazy = false, ...props } = $props()
    
    let containerEl = null
    let currentSrc = null
    let observer = null
    let shouldLoad = !lazy

    // we rely on this to show fadout screenshot while loading a tab from hibernated state, svelte will stop updating components when transition is running, so we need to manually update the DOM
    
    function updateDOM(state, resolvedSrc = null) {
        if (!containerEl) return
        
        const loadingEl = containerEl.querySelector('.attachment-loading')
        const errorEl = containerEl.querySelector('.attachment-error')
        const imageEl = containerEl.querySelector('.attachment-image')
        
        // Hide all elements first
        if (loadingEl) loadingEl.style.display = 'none'
        if (errorEl) errorEl.style.display = 'none'
        if (imageEl) imageEl.style.display = 'none'
        
        if (state === 'loading') {
            if (loadingEl) loadingEl.style.display = 'flex'
        } else if (state === 'error') {
            if (errorEl) errorEl.style.display = 'flex'
        } else if (state === 'loaded' && resolvedSrc) {
            if (imageEl) {
                imageEl.src = resolvedSrc
                imageEl.style.display = 'block'
            }
        }
    }
    
    async function loadImage(srcToLoad) {
        if (!srcToLoad || !shouldLoad) {
            updateDOM('loading')
            return
        }
        
        updateDOM('loading')
        
        try {
            const resolved = await data.getAttachmentUrl(srcToLoad)
            // Check if this is still the current src (prevent race conditions)
            if (srcToLoad === currentSrc) {
                updateDOM('loaded', resolved)
            }
        } catch (err) {
            console.warn('Failed to resolve attachment image:', err)
            // Check if this is still the current src
            if (srcToLoad === currentSrc) {
                updateDOM('error')
            }
        }
    }
    
    function handleSrcChange() {
        currentSrc = src
        if (shouldLoad) {
            loadImage(src)
        }
    }
    
    onMount(() => {
        // Initial load
        handleSrcChange()
        
        // Setup intersection observer for lazy loading
        if (lazy && containerEl) {
            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting && !shouldLoad) {
                            shouldLoad = true
                            loadImage(currentSrc)
                            observer.unobserve(entry.target)
                        }
                    })
                },
                {
                    rootMargin: '50px'
                }
            )
            
            observer.observe(containerEl)
        }
        
        // Watch for src changes using a simple interval check
        // This works even during transitions when Svelte reactivity might be paused
        let lastSrc = src
        const checkInterval = setInterval(() => {
            if (src !== lastSrc) {
                lastSrc = src
                handleSrcChange()
            }
        }, 100)
        
        return () => {
            if (observer) {
                observer.disconnect()
            }
            clearInterval(checkInterval)
        }
    })
</script>

<div bind:this={containerEl} class="attachment-container {className}" {...props}>
    <div class="attachment-loading" style="display: flex;">
    </div>
    <div class="attachment-error" style="display: none;">
    </div>
    <img src="" {alt} class="attachment-image" style="display: none;" />
</div>

<style>
    .attachment-container {
        width: 100%;
        height: 100%;
    }
    
    .attachment-loading,
    .attachment-error {
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .attachment-error {
        background: rgba(255, 0, 0, 0.1);
    }
    
    .attachment-image {
        width: 100%;
        height: 100%;
    }
</style>

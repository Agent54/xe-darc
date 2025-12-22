<script module>
    const MAX_CONCURRENT = 10
    const BATCH_DELAY = 5
    let activeLoads = 0
    const loadQueue = []
    
    function processNext() {
        if (loadQueue.length > 0 && activeLoads < MAX_CONCURRENT) {
            const next = loadQueue.shift()
            next()
        }
    }
    
    export function enqueueLoad(loadFn) {
        return new Promise((resolve) => {
            const execute = async () => {
                activeLoads++
                try {
                    await loadFn()
                } finally {
                    activeLoads--
                    resolve()
                    if (loadQueue.length > 0) {
                        setTimeout(processNext, BATCH_DELAY)
                    }
                }
            }
            
            if (activeLoads < MAX_CONCURRENT) {
                execute()
            } else {
                loadQueue.push(execute)
            }
        })
    }
    
    const lazyCallbacks = new Map()
    let sharedObserver = null
    
    function getSharedObserver() {
        if (!sharedObserver) {
            sharedObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            const callback = lazyCallbacks.get(entry.target)
                            if (callback) {
                                callback()
                                lazyCallbacks.delete(entry.target)
                                sharedObserver.unobserve(entry.target)
                            }
                        }
                    })
                },
                { rootMargin: '50px' }
            )
        }
        return sharedObserver
    }
    
    export function observeLazy(el, callback) {
        lazyCallbacks.set(el, callback)
        getSharedObserver().observe(el)
    }
    
    export function unobserveLazy(el) {
        lazyCallbacks.delete(el)
        if (sharedObserver) {
            sharedObserver.unobserve(el)
        }
    }
</script>

<script>
    import data from '../data.svelte.js'
    import { onMount } from 'svelte'
    
    let { src, digest = null, alt = '', class: className = '', lazy = false, fadeIn = false, ...props } = $props()
    
    let containerEl = null
    let currentSrc = null
    let currentDigest = null
    let shouldLoad = $state(!lazy)

    function updateDOM(state, resolvedSrc = null) {
        if (!containerEl) return
        
        const loadingEl = containerEl.querySelector('.attachment-loading')
        const errorEl = containerEl.querySelector('.attachment-error')
        const imageEl = containerEl.querySelector('.attachment-image')
        
        if (loadingEl) loadingEl.style.display = 'none'
        if (errorEl) errorEl.style.display = 'none'
        if (imageEl) imageEl.style.display = 'none'
        
        if (state === 'loading') {
            if (loadingEl) loadingEl.style.display = 'flex'
        } else if (state === 'error') {
            if (errorEl) errorEl.style.display = 'flex'
        } else if (state === 'loaded' && resolvedSrc) {
            if (imageEl) {
                if (fadeIn) {
                    imageEl.style.opacity = '0'
                    imageEl.style.transition = 'opacity 0.5s ease-out'
                }
                imageEl.src = resolvedSrc
                imageEl.style.display = 'block'
                if (loadingEl) loadingEl.style.display = 'none'
                if (fadeIn) {
                    void imageEl.offsetWidth
                    imageEl.style.opacity = '1'
                }
            }
        }
    }
    
    async function loadImage(srcToLoad) {
        if (!srcToLoad || !shouldLoad) {
            updateDOM('loading')
            return
        }
        
        updateDOM('loading')
        
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100))
        if (srcToLoad !== currentSrc) return
        
        await enqueueLoad(async () => {
            try {
                const resolved = await data.getAttachmentUrl(srcToLoad, digest)
                if (srcToLoad !== currentSrc) return
                
                await new Promise((resolve, reject) => {
                    const img = new Image()
                    img.onload = resolve
                    img.onerror = reject
                    img.src = resolved
                })
                
                if (srcToLoad === currentSrc) {
                    updateDOM('loaded', resolved)
                }
            } catch (err) {
                console.warn('Failed to resolve attachment image:', err)
                if (srcToLoad === currentSrc) {
                    updateDOM('error')
                }
            }
        })
    }
    
    // Use $effect to react to src or digest changes instead of polling interval
    $effect(() => {
        if (src !== currentSrc || digest !== currentDigest) {
            currentSrc = src
            currentDigest = digest
            if (shouldLoad) {
                loadImage(src)
            }
        }
    })
    
    onMount(() => {
        // Initial load
        currentSrc = src
        if (shouldLoad) {
            loadImage(src)
        }
        
        // Setup lazy loading with shared observer
        if (lazy && containerEl) {
            observeLazy(containerEl, () => {
                if (!shouldLoad) {
                    shouldLoad = true
                    loadImage(currentSrc)
                }
            })
        }
        
        return () => {
            if (lazy && containerEl) {
                unobserveLazy(containerEl)
            }
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
        position: relative;
    }
    
    .attachment-loading,
    .attachment-error {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .attachment-error {
        background: rgba(255, 0, 0, 0.1);
    }
    
    .attachment-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top;
        will-change: opacity;
        transform: translateZ(0);
    }
</style>

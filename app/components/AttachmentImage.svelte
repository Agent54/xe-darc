<script>
    import data from '../data.svelte.js'
    import { onMount } from 'svelte'
    
    let { src, alt = '', class: className = '', lazy = false, ...props } = $props()
    
    let resolvedSrc = $state(null)
    let loading = $state(true)
    let error = $state(false)
    let shouldLoad = $state(!lazy)
    let containerEl = $state(null)
    
    onMount(() => {
        if (lazy && containerEl) {
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting && !shouldLoad) {
                            shouldLoad = true
                            observer.unobserve(entry.target)
                        }
                    })
                },
                {
                    rootMargin: '50px' // Start loading 50px before the element is visible
                }
            )
            
            observer.observe(containerEl)
            
            return () => {
                observer.disconnect()
            }
        }
    })
    
    $effect(async () => {
        if (!src || !shouldLoad) {
            resolvedSrc = null
            loading = !shouldLoad
            error = false
            return
        }
        
        loading = true
        error = false
        
        try {
            const resolved = await data.getAttachmentUrl(src)
            resolvedSrc = resolved
            loading = false
        } catch (err) {
            console.warn('Failed to resolve attachment image:', src, err)
            error = true
            loading = false
        }
    })
</script>

<div bind:this={containerEl} class="attachment-container {className}" {...props}>
    {#if loading}
        <div class="attachment-loading">
            <!-- Loading placeholder -->
        </div>
    {:else if error || !resolvedSrc}
        <div class="attachment-error">
            <!-- Error placeholder -->
        </div>
    {:else}
        <img src={resolvedSrc} {alt} class="attachment-image" />
    {/if}
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

<script>
    import Favicon from './Favicon.svelte'

    let { url = '', size = 12 } = $props()

    const tab = $derived.by(() => {
        let favicon = null
        try {
            const parsed = new URL(url)
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                favicon = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(parsed.origin)}&size=16`
            }
        } catch {}
        return { url, favicon }
    })
</script>

<span class="link-preview-icon" style:width="{size}px" style:height="{size}px">
    <Favicon {tab} showButton={false} security={false} />
</span>

<style>
    .link-preview-icon {
        display: flex;
        flex-shrink: 0;
    }

    .link-preview-icon :global(.favicon-wrapper) {
        width: 100%;
        height: 100%;
    }
</style>

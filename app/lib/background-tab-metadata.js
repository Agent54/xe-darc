export function parseBackgroundTabMetadata(html, url) {
    const document = new DOMParser().parseFromString(html, 'text/html')
    const title = document.querySelector('title')?.textContent.trim() ||
        document.querySelector('meta[property="og:title"]')?.content.trim()
    const image = document.querySelector('meta[property="og:image"]')?.content.trim()
    const metadata = {}
    if (title) {
        metadata.title = title
    }
    if (image) {
        try {
            const base = document.querySelector('base[href]')?.getAttribute('href')
            const imageUrl = new URL(image, base ? new URL(base, url) : url)
            if (['http:', 'https:'].includes(imageUrl.protocol)) {
                metadata.screenshot = imageUrl.href
            }
        } catch {
            // An invalid preview URL should not discard the title.
        }
    }
    return metadata
}

export function scheduleBackgroundTabMetadata(data, tabId, {
    requestIdle = globalThis.requestIdleCallback?.bind(globalThis),
    fetchPage = globalThis.fetch,
    parse = parseBackgroundTabMetadata
} = {}) {
    const tab = data.docs[tabId]
    if (!requestIdle || !/^https?:\/\//i.test(tab?.url)) {
        return
    }
    const { url, title } = tab
    const isUnopened = () => {
        const current = data.docs[tabId]
        const frame = data.frames[tabId]
        return current && current.url === url && !current.archive && !current._deleted &&
            !current.preview && !current.lightbox && !current.lastLoadedAt &&
            !frame?.frame && !frame?.pendingLoad && !frame?.hibernated &&
            data.spaceMeta.activeTabId !== tabId
    }
    requestIdle(async () => {
        if (!isUnopened()) {
            return
        }
        try {
            const response = await fetchPage(url, {
                credentials: 'omit', signal: AbortSignal.timeout(15000)
            })
            if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
                return
            }
            const html = await response.text()
            if (!isUnopened()) {
                return
            }
            const metadata = parse(html, response.url || url)
            const current = data.docs[tabId]
            if (current.title !== title) {
                delete metadata.title
            }
            if (current.screenshot) {
                delete metadata.screenshot
            }
            if (Object.keys(metadata).length) {
                await data.updateTab(tabId, metadata)
            }
        } catch {
            // Metadata is optional; a failed fetch must not affect navigation.
        }
    })
}

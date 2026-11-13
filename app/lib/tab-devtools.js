import { getTabTitle } from './tab-title.js'
import { cdpFetch } from './cdp.js'

export async function openTabDevTools (data, tabId) {
    const activeTab = data.docs[tabId]
    if (!activeTab?.url) {
        return
    }

    try {
        // Get dev tools list to find the correct context ID
        const response = await cdpFetch('/json/list')
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const devToolsData = await response.json()

        // Find matching dev tools entry for current tab URL
        let matchingItem = devToolsData.find(item => {
            return item.url === activeTab.url || item.title === activeTab.title
        })

        // If multiple URLs exist for the same site, use hash trick to find correct ID
        if (!matchingItem && devToolsData.length > 1) {
            const originalUrl = activeTab.url
            const randomHash = Math.random().toString(36).substring(2, 15)

            try {
                // Change URL hash to identify this specific tab
                const urlWithHash = originalUrl.includes('#')
                    ? originalUrl.replace(/#.*$/, `#${randomHash}`)
                    : `${originalUrl}#${randomHash}`

                // Navigate to the URL with hash
                data.navigate(tabId, urlWithHash)

                // Wait a moment for the change to register
                await new Promise(resolve => setTimeout(resolve, 1))

                // Fetch updated dev tools list
                const updatedResponse = await cdpFetch('/json/list')
                if (updatedResponse.ok) {
                    const updatedData = await updatedResponse.json()
                    matchingItem = updatedData.find(item => item.url?.includes(randomHash))
                }

                // Restore original URL
                data.navigate(tabId, originalUrl)
            } catch (err) {
                console.warn('Hash trick failed:', err)
            }
        }

        // Default to first item if still no match
        if (!matchingItem && devToolsData.length > 0) {
            matchingItem = devToolsData[0]
        }

        if (matchingItem?.devtoolsFrontendUrl) {
            // The API supplies the matching frontend and the launcher's debugger URL.
            const localDevToolsUrl = matchingItem.devtoolsFrontendUrl

            await data.newTab(activeTab.spaceId || data.spaceMeta.activeSpace, {
                url: localDevToolsUrl,
                title: `DevTools - ${getTabTitle(activeTab)}`,
                shouldFocus: true,
                pinned: 'right',
                groupTabId: tabId
            })

            // if (devToolsTab) {
            //     // Pin the dev tools tab to the right after a small delay to ensure DB persistence
            //     setTimeout(() => {
            //         data.pin({ tabId: devToolsTab.id, pinned: 'right' })
            //     }, 1)
            //     data.activate(devToolsTab.id)
            // }
        }
    } catch (err) {
        console.error('Failed to open dev tools:', err)
    }
}

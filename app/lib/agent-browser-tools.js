import { getTabTitle } from './tab-title.js'

export function captureAgentContext(data, target = 'current-tab') {
    const spaceId = data.spaceMeta.activeSpace
    const tabId = data.spaceMeta.activeTabId
    const tabs = Object.values(data.docs).filter(tab => tab.type === 'tab' && !tab.archive && !tab.closed && !tab.preview && !tab.lightbox && (
        target === 'all-spaces' || (target === 'current-space' ? tab.spaceId === spaceId : tab.id === tabId)
    )).map(tab => ({ id: tab.id, title: getTabTitle(tab), url: tab.url, spaceId: tab.spaceId }))
    return { target, spaceId, tabId, tabs }
}

export function prepareBrowserTool(data, context, name, args = {}) {
    if (!context) {
        throw new Error('Submit a prompt with browser context before using browser tools')
    }
    if (name === 'listTabs') {
        return { details: context.target, execute: async () => context.tabs.filter(tab => data.docs[tab.id] && !data.docs[tab.id].archive && !data.docs[tab.id].closed && data.docs[tab.id].spaceId === tab.spaceId).map(tab => ({ ...tab, title: getTabTitle(data.docs[tab.id]), url: data.docs[tab.id].url })) }
    }
    if (name === 'readPageContent') {
        const tabId = args.tabId || context.tabId
        const tab = context.tabs.find(tab => tab.id === tabId)
        if (!tab) {
            throw new Error('This tab is outside the context selected for this prompt')
        }
        const url = data.docs[tabId]?.url
        const assertTarget = () => {
            const current = data.docs[tabId]
            if (!current || current.archive || current.closed || current.spaceId !== tab.spaceId || current.url !== url || url !== tab.url) {
                throw new Error('The selected tab was closed or navigated; submit a new prompt')
            }
        }
        assertTarget()
        return {
            details: `${tab.title}\n${tab.url}${args.selector ? `\nXPath: ${args.selector}` : ''}`,
            execute: async () => {
                assertTarget()
                const content = await data.readPage(tabId, { textOnly: args.textOnly ?? true, selector: args.selector })
                assertTarget()
                return { tabId, url, content }
            }
        }
    }
    if (!['openNewTab', 'displayHtml'].includes(name)) {
        throw new Error(`Unknown browser tool: ${name}`)
    }
    const spaceId = context.spaceId
    const assertSpace = () => {
        if (!data.spaces[spaceId]) {
            throw new Error('The selected space no longer exists')
        }
    }
    assertSpace()
    let url = args.url || 'about:newtab'
    if (name === 'displayHtml') {
        if (typeof args.html !== 'string' || !args.html.trim()) {
            throw new Error('HTML content is required')
        }
        url = `data:text/html;charset=utf-8,${encodeURIComponent(args.html)}`
    } else if (url !== 'about:newtab' && !['http:', 'https:'].includes(new URL(url).protocol)) {
        throw new Error('New tabs accept HTTP(S) URLs or about:newtab')
    }
    return {
        details: name === 'displayHtml' ? `${args.title || 'HTML page'}\n${args.html}` : `${args.title || 'New tab'}\n${url}`,
        execute: async () => {
            assertSpace()
            const tab = await data.newTab(spaceId, { url, title: args.title, shouldFocus: true })
            if (!tab?.id) {
                throw new Error('Darc could not create the tab')
            }
            context.tabs.push({ id: tab.id, title: getTabTitle(tab), url: tab.url, spaceId })
            data.activateSpace(spaceId)
            data.activate(tab.id)
            return { tabId: tab.id, spaceId, url: name === 'displayHtml' ? undefined : url, title: args.title }
        }
    }
}

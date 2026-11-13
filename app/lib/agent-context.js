import { getTabTitle } from './tab-title.js'

export function captureAgentContext(data, target = 'current-tab') {
    const spaceId = data.spaceMeta.activeSpace
    const tabId = data.spaceMeta.activeTabId
    const tabs = Object.values(data.docs).filter(tab => tab.type === 'tab' && !tab.archive && !tab.closed && !tab.preview && !tab.lightbox && (
        target === 'all-spaces' || (target === 'current-space' ? tab.spaceId === spaceId : tab.id === tabId)
    )).map(tab => ({ id: tab.id, title: getTabTitle(tab), url: tab.url, spaceId: tab.spaceId }))
    return { target, spaceId, tabId, tabs }
}

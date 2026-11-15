import { mcpTools } from './mcp-tool-defs.js'
import { requestMcpPermission } from './mcp-permissions.js'
import { getTabTitle } from './tab-title.js'

function openTab(tab) {
    return tab?.type === 'tab' && !tab.archive && !tab.closed && !tab.preview && !tab.lightbox && !tab._deleted
}

export function createMcpBrowserExecutor({ data, getConnection }) {
    const backgroundGroups = new Map()
    return async ({ name, args, agent, signal, onPhase }) => {
        const definition = mcpTools[name]
        if (!definition) { throw new Error(`Unknown MCP tool: ${name}`) }
        args = definition.inputSchema.assert(args || {})
        const connection = getConnection()
        if (!connection) { throw new Error('MCP connection removed or disconnected') }
        const active = () => getConnection()?.id === connection.id
        const allTabs = () => Object.values(data.docs).filter(openTab)
        const spaceTarget = spaceId => {
            const space = data.spaces[spaceId]
            if (!space || space.archive || space._deleted) { throw new Error('The requested space does not exist') }
            return { kind: 'space', id: spaceId, spaceId, label: `Space: ${space.name || space.title || spaceId}` }
        }
        const groupFor = (spaceId, groupId) => {
            spaceTarget(spaceId)
            const group = data.getTabGroups(spaceId).find(group => group.id === groupId || group.tabGroupId === groupId)
            if (!group) { throw new Error('The requested tab group does not exist in this space') }
            return group
        }
        const groupTarget = (spaceId, group) => ({ kind: 'tabgroup', id: group.id, spaceId, label: `Tab group: ${group.title || group.name || group.id}` })
        const all = { kind: 'all', label: 'All tabs' }
        const authorize = (permission, target, { parents = [], targets = [], valid = () => true, reportPhase = onPhase } = {}) => requestMcpPermission(data, {
            connection, agent, permission, target, parents, targets, signal, onPhase: reportPhase, current: () => active() && valid()
        })
        const metadata = tab => {
            const group = data.getTabGroups(tab.spaceId).find(group => group.tabs.some(member => member.id === tab.id))
            const isActiveSpace = tab.spaceId === data.spaceMeta.activeSpace
            return {
                tabId: tab.id, spaceId: tab.spaceId, tabGroupId: group?.id || null, title: getTabTitle(tab),
                url: tab.url?.startsWith('data:') ? `${tab.url.split(',')[0]},…` : tab.url,
                isActiveSpace,
                isActiveTabGroup: isActiveSpace && !!group?.tabs.some(member => member.id === data.getCurrentGroupTabId(tab.spaceId)),
                isActiveTab: tab.id === data.spaceMeta.activeTabId,
                isActiveInTabGroup: !!group && data.getGroupActiveTab(group, tab.spaceId)?.id === tab.id
            }
        }

        const tabScope = tab => {
            const space = spaceTarget(tab.spaceId)
            const group = data.getTabGroups(tab.spaceId).find(group => group.tabs.some(member => member.id === tab.id))
            const target = { kind: 'tab', id: tab.id, spaceId: tab.spaceId, label: `Tab: ${getTabTitle(tab)}` }
            const parents = [...(group ? [groupTarget(tab.spaceId, group)] : []), space, all]
            return { target, parents, targets: [target, ...parents.filter(parent => parent.kind !== 'all')].map(target => ({ target, label: target.label })) }
        }
        const ids = (values, field) => {
            if (!values.length || values.some(id => !id.trim() || id === '*')) throw new Error(`${field} must contain explicit non-empty IDs; use spaceIds:"*" for all spaces`)
            return [...new Set(values)]
        }
        const selectTabs = () => {
            if (args.tabIds !== undefined) {
                if (args.spaceIds !== undefined || args.current !== undefined || args.tabGroupId !== undefined) throw new Error('Do not combine tabIds with other scope options')
                const tabs = ids(args.tabIds, 'tabIds').map(id => {
                    const tab = data.docs[id]
                    if (!openTab(tab)) throw new Error(`The requested tab is not open: ${id}`)
                    return tab
                })
                return { tabs, scopes: tabs.map(tabScope) }
            }
            if (args.current !== undefined && (args.spaceIds !== undefined || args.tabGroupId !== undefined)) throw new Error('Do not combine current with spaceIds or tabGroupId')
            if (args.spaceIds === undefined) {
                if (args.tabGroupId !== undefined) throw new Error('tabGroupId requires exactly one explicit space ID')
                const tab = data.docs[data.spaceMeta.activeTabId]
                if (!openTab(tab)) throw new Error('There is no current open tab')
                if (args.current !== 'tabList') return { tabs: [tab], scopes: [tabScope(tab)] }
                const group = data.getTabGroups(tab.spaceId).find(group => group.tabs.some(member => member.id === tab.id))
                if (!group) throw new Error('The current tab does not belong to a tab group')
                return { tabs: group.tabs.filter(openTab), scopes: [{ target: groupTarget(tab.spaceId, group), parents: [spaceTarget(tab.spaceId), all] }] }
            }
            const spaceIds = args.spaceIds === '*' ? Object.keys(data.spaces).filter(id => !data.spaces[id].archive && !data.spaces[id]._deleted) : ids(args.spaceIds, 'spaceIds')
            const spaces = spaceIds.map(spaceTarget)
            if (args.tabGroupId !== undefined) {
                if (args.spaceIds === '*' || spaceIds.length !== 1) throw new Error('tabGroupId requires exactly one explicit space ID')
                const group = groupFor(spaceIds[0], args.tabGroupId)
                return { tabs: group.tabs.filter(openTab), scopes: [{ target: groupTarget(spaceIds[0], group), parents: [spaces[0], all] }] }
            }
            return { tabs: allTabs().filter(tab => spaceIds.includes(tab.spaceId)),
                scopes: args.spaceIds === '*' ? [{ target: all }] : spaces.map(target => ({ target, parents: [all] })) }
        }

        if (name === 'listSpaces') {
            const currentSpaceId = data.spaceMeta.activeSpace
            const target = args.currentOnly ? spaceTarget(currentSpaceId) : { ...all, label: 'All spaces' }
            const valid = () => !args.currentOnly || (!!data.spaces[currentSpaceId] && !data.spaces[currentSpaceId].archive && !data.spaces[currentSpaceId]._deleted)
            await authorize('mcp-list-spaces', target, { parents: args.currentOnly ? [all] : [], valid })
            return Object.entries(data.spaces).filter(([spaceId, space]) => !space.archive && !space._deleted && (!args.currentOnly || spaceId === currentSpaceId))
                .map(([spaceId, space]) => ({ spaceId, title: space.name || space.title || spaceId, isActiveSpace: spaceId === data.spaceMeta.activeSpace }))
        }
        if (name === 'activateTab') {
            const tab = data.docs[args.tabId]
            if (!openTab(tab)) throw new Error('The requested tab is not open')
            const { spaceId, tabGroupId, url } = tab
            const scope = tabScope(tab)
            const valid = () => {
                const current = data.docs[args.tabId]
                return openTab(current) && current.spaceId === spaceId && current.tabGroupId === tabGroupId && current.url === url &&
                    !!data.spaces[spaceId] && !data.spaces[spaceId].archive && !data.spaces[spaceId]._deleted
            }
            await authorize('mcp-activate-tab', scope.target, { ...scope, valid })
            signal?.throwIfAborted()
            if (!active() || !valid()) throw new Error('The requested tab changed; request activation again')
            data.activateSpace(spaceId)
            data.activate(tab.id)
            return metadata(data.docs[tab.id])
        }
        if (name === 'openTab' || name === 'displayHtml') {
            const spaceId = args.spaceId || data.spaceMeta.activeSpace
            const space = spaceTarget(spaceId)
            const background = args.background
            let group
            let newTabGroupId
            let anchorId
            if (background) {
                if (!backgroundGroups.has(spaceId)) backgroundGroups.set(spaceId, crypto.randomUUID())
                newTabGroupId = backgroundGroups.get(spaceId)
                if (args.tabGroupId) {
                    group = groupFor(spaceId, args.tabGroupId)
                    if (!group.tabs.every(tab => tab.tabGroupId === newTabGroupId)) throw new Error('Background tabs must stay in this conversation\'s agent-created tab group')
                    anchorId = group.tabs[0].id
                }
            } else {
                if (spaceId !== data.spaceMeta.activeSpace) throw new Error('Foreground tabs must open in the current space and tab group')
                const currentTabId = data.getCurrentGroupTabId(spaceId)
                group = data.getTabGroups(spaceId).find(group => group.tabs.some(tab => tab.id === currentTabId))
                if (!group) throw new Error('There is no current tab group; use background:true to create an agent group')
                if (args.tabGroupId && groupFor(spaceId, args.tabGroupId).id !== group.id) throw new Error('Foreground tabs must stay in the current tab group')
                anchorId = currentTabId
            }
            const target = background
                ? { kind: 'tabgroup', id: `group:${newTabGroupId}`, spaceId, label: `Agent tab group in ${space.label.slice(7)} (background)` }
                : { ...groupTarget(spaceId, group), label: `${groupTarget(spaceId, group).label} (foreground)` }
            const valid = () => {
                if (!data.spaces[spaceId] || data.spaces[spaceId].archive || data.spaces[spaceId]._deleted) return false
                if (background) return !anchorId || (openTab(data.docs[anchorId]) && data.docs[anchorId].spaceId === spaceId && data.docs[anchorId].tabGroupId === newTabGroupId)
                return data.spaceMeta.activeSpace === spaceId && data.getTabGroups(spaceId).some(item =>
                    item.id === group.id && item.tabs.some(tab => tab.id === anchorId) && item.tabs.some(tab => tab.id === data.getCurrentGroupTabId(spaceId)))
            }
            const url = name === 'displayHtml' ? `data:text/html;charset=utf-8,${encodeURIComponent(args.html)}` : args.url || 'about:newtab'
            if (name === 'openTab' && url !== 'about:newtab' && !['http:', 'https:'].includes(new URL(url).protocol)) {
                throw new Error('New tabs accept HTTP(S) URLs or about:newtab')
            }
            await authorize('mcp-open-tab', target, { parents: [space], valid })
            signal?.throwIfAborted()
            if (!active() || !valid()) { throw new Error('The target space or tab group changed') }
            if (background && !anchorId) anchorId = allTabs().find(tab => tab.spaceId === spaceId && tab.tabGroupId === newTabGroupId)?.id
            const tab = await data.newTab(spaceId, { url, title: args.title, groupTabId: anchorId, newTabGroupId, shouldFocus: !background })
            if (!tab?.id) { throw new Error('Could not create a browser tab') }
            const { url: tabUrl, ...tabMetadata } = metadata(tab)
            return { ...tabMetadata, background, ...(name === 'openTab' ? { url: tabUrl } : {}) }
        }

        const { tabs, scopes } = selectTabs()
        const selected = tabs.map(tab => ({ tabId: tab.id, spaceId: tab.spaceId, groupId: tab.tabGroupId, url: tab.url }))
        const validSpace = id => !!data.spaces[id] && !data.spaces[id].archive && !data.spaces[id]._deleted
        const valid = () => selected.every(item => {
            const tab = data.docs[item.tabId]
            return openTab(tab) && (name !== 'readTabs' || tab.url === item.url) && tab.spaceId === item.spaceId && tab.tabGroupId === item.groupId && validSpace(item.spaceId)
        }) && scopes.every(({ target }) => (!target.spaceId || validSpace(target.spaceId)) &&
            (target.kind !== 'tabgroup' || data.getTabGroups(target.spaceId).some(group => group.id === target.id)))
        for (const scope of scopes) {
            await authorize(name === 'listTabs' ? 'mcp-list-tabs' : 'mcp-read-tabs', scope.target, { ...scope, valid,
                reportPhase: phase => { if (phase !== 'running') onPhase?.(phase) } })
        }
        signal?.throwIfAborted()
        if (!active() || !valid()) throw new Error('A selected tab or space changed; request access again')
        onPhase?.('running')
        if (name === 'listTabs') return selected.map(item => metadata(data.docs[item.tabId]))
        const results = []
        for (const item of selected) {
            signal?.throwIfAborted()
            if (!active() || !valid()) { throw new Error('A selected tab was closed, moved, or navigated; request access again') }
            const tabMetadata = metadata(data.docs[item.tabId])
            try {
                const content = await data.readPage(item.tabId, { textOnly: args.textOnly, selector: args.selector })
                if (!active() || !valid()) { throw new Error('A selected tab changed while reading') }
                results.push({ ...tabMetadata, url: item.url, content })
            } catch (error) {
                if (selected.length === 1) { throw error }
                results.push({ ...tabMetadata, error: error.message })
            }
        }
        return results
    }
}

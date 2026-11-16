import { mcpTools } from './mcp-tool-defs.js'
import { requestMcpPermission } from './mcp-permissions.js'
import { getTabTitle } from './tab-title.js'
import { agentActivity } from './agent-activity.js'

function openTab(tab) {
    return tab?.type === 'tab' && !tab.archive && !tab.closed && !tab.preview && !tab.lightbox && !tab._deleted
}

export function createMcpBrowserExecutor({ data, getConnection, activity = agentActivity }) {
    async function execute({ name, args, agent, signal }, access) {
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
        const authorize = (permission, target, { parents = [], targets = [], valid = () => true } = {}) => requestMcpPermission(data, {
            connection, agent, permission, target, parents, targets, signal, toolCall: { name, arguments: args }, current: () => active() && valid()
        })
        const metadata = tab => {
            const group = data.getTabGroups(tab.spaceId).find(group => group.tabs.some(member => member.id === tab.id))
            return { tabId: tab.id, spaceId: tab.spaceId, tabGroupId: group?.id || null, title: getTabTitle(tab), url: tab.url?.startsWith('data:') ? `${tab.url.split(',')[0]},…` : tab.url }
        }

        if (name === 'listSpaces') {
            await authorize('mcp-list-spaces', { ...all, label: 'All spaces' })
            const spaces = Object.entries(data.spaces).filter(([, space]) => !space.archive && !space._deleted)
            access.touch({ spaces: spaces.map(([id]) => id) })
            return spaces
                .map(([spaceId, space]) => ({ spaceId, title: space.name || space.title || spaceId }))
        }
        if (name === 'listTabs') {
            await authorize('mcp-list-tabs', all)
            const tabs = allTabs()
            access.touch({ tabs: tabs.map(tab => tab.id), spaces: tabs.map(tab => tab.spaceId) })
            return tabs.map(metadata)
        }
        if (name === 'listSpaceTabs') {
            const target = spaceTarget(args.spaceId)
            await authorize('mcp-list-tabs', target, { parents: [all], valid: () => !!data.spaces[args.spaceId] && !data.spaces[args.spaceId].archive })
            const tabs = allTabs().filter(tab => tab.spaceId === args.spaceId)
            access.touch({ tabs: tabs.map(tab => tab.id), spaces: [args.spaceId] })
            return tabs.map(metadata)
        }
        if (name === 'listTabGroupTabs') {
            const group = groupFor(args.spaceId, args.tabGroupId)
            const target = groupTarget(args.spaceId, group)
            await authorize('mcp-list-tabs', target, { parents: [spaceTarget(args.spaceId), all],
                valid: () => data.getTabGroups(args.spaceId).some(group => group.id === target.id) })
            const members = groupFor(args.spaceId, target.id).tabs.map(tab => tab.id)
            const tabs = allTabs().filter(tab => tab.spaceId === args.spaceId && members.includes(tab.id))
            access.touch({ tabs: tabs.map(tab => tab.id), spaces: [args.spaceId] })
            return tabs.map(metadata)
        }
        if (name === 'openTab' || name === 'displayHtml') {
            const space = spaceTarget(args.spaceId)
            const group = args.tabGroupId ? groupFor(args.spaceId, args.tabGroupId) : null
            const target = group ? groupTarget(args.spaceId, group) : space
            const anchorId = group?.tabs[0]?.id
            const valid = () => !!data.spaces[args.spaceId] && !data.spaces[args.spaceId].archive &&
                (!group || data.getTabGroups(args.spaceId).some(item => item.id === group.id && item.tabs.some(tab => tab.id === anchorId)))
            const url = name === 'displayHtml' ? `data:text/html;charset=utf-8,${encodeURIComponent(args.html)}` : args.url || 'about:newtab'
            if (name === 'openTab' && url !== 'about:newtab' && !['http:', 'https:'].includes(new URL(url).protocol)) {
                throw new Error('New tabs accept HTTP(S) URLs or about:newtab')
            }
            await authorize('mcp-open-tab', target, { parents: group ? [space] : [], valid })
            signal?.throwIfAborted()
            if (!valid()) { throw new Error('The target space or tab group changed') }
            access.touch({ spaces: [args.spaceId] })
            const tab = await data.newTab(args.spaceId, { url, title: args.title, groupTabId: anchorId, shouldFocus: true })
            if (!tab?.id) { throw new Error('Could not create a browser tab') }
            access.touch({ tabs: [tab.id] })
            data.activateSpace(args.spaceId)
            data.activate(tab.id)
            return { tabId: tab.id, spaceId: args.spaceId, tabGroupId: group?.id || null, title: getTabTitle(tab), ...(name === 'openTab' ? { url: tab.url } : {}) }
        }

        let tabs
        let target
        let parents = []
        let targets = []
        if (name === 'readTab') {
            const tab = data.docs[args.tabId]
            if (!openTab(tab)) { throw new Error('The requested tab is not open') }
            tabs = [tab]
            const space = spaceTarget(tab.spaceId)
            const group = data.getTabGroups(tab.spaceId).find(group => group.tabs.some(member => member.id === tab.id))
            target = { kind: 'tab', id: tab.id, spaceId: tab.spaceId, label: `Tab: ${getTabTitle(tab)}` }
            parents = [...(group ? [groupTarget(tab.spaceId, group)] : []), space]
            targets = [target, ...parents].map(target => ({ target, label: target.label }))
        } else if (name === 'readSpaceTabs') {
            target = spaceTarget(args.spaceId)
            tabs = allTabs().filter(tab => tab.spaceId === args.spaceId)
        } else if (name === 'readTabGroupTabs') {
            const group = groupFor(args.spaceId, args.tabGroupId)
            target = groupTarget(args.spaceId, group)
            parents = [spaceTarget(args.spaceId)]
            tabs = group.tabs.filter(openTab)
        }
        const selected = tabs.map(tab => ({ tabId: tab.id, spaceId: tab.spaceId, groupId: tab.tabGroupId, url: tab.url }))
        const valid = () => selected.every(item => {
            const tab = data.docs[item.tabId]
            return openTab(tab) && tab.url === item.url && tab.spaceId === item.spaceId && tab.tabGroupId === item.groupId
        }) && !!data.spaces[target.spaceId] && !data.spaces[target.spaceId].archive
        await authorize('mcp-read-tabs', target, { parents, targets, valid })
        access.touch({ tabs: selected.map(tab => tab.tabId), spaces: [target.spaceId] })
        const results = []
        for (const item of selected) {
            signal?.throwIfAborted()
            if (!active() || !valid()) { throw new Error('A selected tab was closed, moved, or navigated; request access again') }
            try {
                const content = await data.readPage(item.tabId, { textOnly: args.textOnly, selector: args.selector })
                signal?.throwIfAborted()
                if (!active() || !valid()) { throw new Error('A selected tab changed while reading') }
                results.push({ tabId: item.tabId, url: item.url, content })
            } catch (error) {
                if (name === 'readTab') { throw error }
                results.push({ tabId: item.tabId, error: error.message })
            }
        }
        return name === 'readTab' ? results[0] : results
    }
    return async request => {
        const access = activity.begin(request.signal)
        try { return await execute(request, access) } finally { access.finish() }
    }
}

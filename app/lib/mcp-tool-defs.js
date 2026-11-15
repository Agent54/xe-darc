import { scope } from 'arktype'

const schemas = scope({
    spaces: { '+': 'reject', currentOnly: 'boolean = false' },
    tabScope: { '+': 'reject', 'spaceIds?': 'string[] | "*"', 'current?': '"tab" | "tabList"', 'tabGroupId?': 'string > 0' },
    readTabs: { '+': 'reject', 'spaceIds?': 'string[] | "*"', 'current?': '"tab" | "tabList"', 'tabGroupId?': 'string > 0',
        'tabIds?': 'string[]', textOnly: 'boolean = false', 'selector?': 'string' },
    activate: { '+': 'reject', tabId: 'string > 0' },
    open: { '+': 'reject', 'spaceId?': 'string > 0', 'tabGroupId?': 'string > 0', background: 'boolean = false', 'url?': 'string', 'title?': 'string' },
    html: { '+': 'reject', 'spaceId?': 'string > 0', 'tabGroupId?': 'string > 0', background: 'boolean = false', html: 'string > 0', 'title?': 'string' }
}, { jitless: true }).export()

const tabActivityDescription = ' Tab results include isActiveSpace (current space), isActiveTabGroup (current group in the current space), isActiveTab (focused tab), and isActiveInTabGroup (selected tab within its group, including inactive groups).'
const scopeDescription = ' Use current:"tab" for the focused tab, current:"tabList" for all tabs in the focused tab\'s tab group, or spaceIds:[id,...] for specific spaces. current:"tabList" requires the focused tab to belong to a tab group. spaceIds:"*" explicitly selects all spaces. Do not combine current with spaceIds or tabGroupId. Optional tabGroupId limits exactly one explicit space to that group.'
const minimalScopeDescription = ' Always use the smallest scope needed for the task. Start with the current tab when sufficient; use specific tab IDs or spaces before expanding. Use all spaces only when the task requires it. Listing metadata does not authorize reading page content.'
const workflowDescription = ' Open research, investigation, and other intermediate work with background:true in the agent-created background tab group. Use the current tab group in the foreground only when showing something to the user. Do not activate research tabs merely to inspect or read them; use readTabs by ID without changing focus. Use activateTab only to present a result or when the user asks to switch tabs.'
export const mcpServerInstructions = [
    'Darc provides tools for working with browser spaces, tab groups, and tabs. Browser access is authorized by Darc\'s permission prompts.',
    minimalScopeDescription.trim(),
    workflowDescription.trim()
].join('\n\n')
const openDescription = ' Defaults to foreground opening in the current tab group. Set background:true to open without changing focus in a separate agent-created group, reused for this conversation and space. spaceId defaults to the current space. Optional tabGroupId constrains the destination: it must be the current group for foreground opens or this conversation\'s agent-created group for background opens. Other groups are rejected. A foreground call fails if the current group changes while awaiting permission.'

export const mcpTools = {
    listSpaces: { description: 'List only spaces and their metadata (IDs, titles, current-space marker), never tabs or page content. Set currentOnly:true to return only the current space.', inputSchema: schemas.spaces },
    listTabs: { description: 'List open tab metadata. Defaults to the current tab. Returns an array.' + scopeDescription, inputSchema: schemas.tabScope },
    openTab: { description: 'Open an HTTP(S) URL or about:newtab.' + openDescription, inputSchema: schemas.open },
    displayHtml: { description: 'Create an HTML page.' + openDescription, inputSchema: schemas.html },
    activateTab: { description: 'Bring an existing open tab into the foreground by tabId, activating its space and tab group. Does not open, move, or read the tab. Requires separate permission to change focus. Use to show the user a result or carry out an explicit tab-switch request.', inputSchema: schemas.activate },
    readTabs: { description: 'Read page content as HTML (default) or text (textOnly:true), optionally limited by an XPath selector. Use tabIds:[id,...] for one or more known tabs; do not combine tabIds with other scope options. Defaults to the current tab. Always returns an array.' + scopeDescription, inputSchema: schemas.readTabs }
}

for (const [name, definition] of Object.entries(mcpTools)) {
    if (name !== 'listSpaces') definition.description += tabActivityDescription
}

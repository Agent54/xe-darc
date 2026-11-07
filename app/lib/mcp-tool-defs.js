import { scope } from 'arktype'

const schemas = scope({
    empty: {},
    space: { spaceId: 'string > 0' },
    group: { spaceId: 'string > 0', tabGroupId: 'string > 0' },
    tab: { tabId: 'string > 0', textOnly: 'boolean = false', 'selector?': 'string' },
    readSpace: { spaceId: 'string > 0', textOnly: 'boolean = false', 'selector?': 'string' },
    readGroup: { spaceId: 'string > 0', tabGroupId: 'string > 0', textOnly: 'boolean = false', 'selector?': 'string' },
    open: { spaceId: 'string > 0', 'tabGroupId?': 'string > 0', 'url?': 'string', 'title?': 'string' },
    html: { spaceId: 'string > 0', 'tabGroupId?': 'string > 0', html: 'string > 0', 'title?': 'string' }
}, { jitless: true }).export()

export const mcpTools = {
    listSpaces: { description: 'List browser spaces. Requires permission from this MCP connection.', inputSchema: schemas.empty },
    listTabs: { description: 'List open tab metadata across all spaces. Does not grant page-content access.', inputSchema: schemas.empty },
    listSpaceTabs: { description: 'List open tab metadata in one space, including tab group IDs.', inputSchema: schemas.space },
    listTabGroupTabs: { description: 'List open tab metadata in one tab group. Use the tabGroupId returned by tab listing.', inputSchema: schemas.group },
    openTab: { description: 'Open and focus an HTTP(S) URL or about:newtab in a specified space or tab group.', inputSchema: schemas.open },
    displayHtml: { description: 'Create and focus an HTML page in a specified space or tab group.', inputSchema: schemas.html },
    readTab: { description: 'Read one tab as text or HTML, optionally selecting an element with XPath.', inputSchema: schemas.tab },
    readSpaceTabs: { description: 'Read page content from open tabs in a specified space.', inputSchema: schemas.readSpace },
    readTabGroupTabs: { description: 'Read page content from open tabs in a specified tab group.', inputSchema: schemas.readGroup }
}

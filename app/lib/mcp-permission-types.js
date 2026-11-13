const icon = '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 8H5a3 3 0 0 0 0 6h3m8-6h3a3 3 0 0 1 0 6h-3M7 11h10M10 4v16m4-16v16" /></svg>'

export default Object.fromEntries([
    ['mcp-list-spaces', 'MCP: List spaces', 'List the names and IDs of browser spaces'],
    ['mcp-list-tabs', 'MCP: List tabs', 'List tab metadata in the requested browser scope'],
    ['mcp-open-tab', 'MCP: Open tabs', 'Open URLs or create HTML pages in the requested space or tab group'],
    ['mcp-read-tabs', 'MCP: Read pages', 'Read page text or HTML from the requested tabs']
].map(([key, name, description]) => [key, { name, description, icon, availability: async () => ({ available: true, error: null }), mcp: true }]))

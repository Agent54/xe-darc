<script>
    import { mcpState } from '../lib/mcp-service.js'
    import { mcpPermissionResources } from '../lib/mcp-permissions.js'
    import data from '../data.svelte.js'
    import PermissionCard from './PermissionCard.svelte'

    let { connectionId } = $props()
    let error = $state('')
    let copied = $state(null)

    async function copy(entry) {
        try { await navigator.clipboard.writeText(entry.mcpUrl); copied = entry.mcpUrl } catch { error = 'Could not copy the MCP URL' }
    }
</script>

<section class="mcp-connections" aria-label="Connection browser access">
    {#each $mcpState.connections.filter(entry => entry.id === connectionId) as entry (entry.id)}
        {@const permissions = mcpPermissionResources(data, entry.id)}
        <article class="mcp-connection-entry" data-mcp-connection-id={entry.id}>
            <div class="mcp-connection-heading"><h4>Browser access</h4><span>{entry.status === 'other-window' ? 'Another window' : entry.status}</span></div>
            <p>Connection ID: {entry.id}</p>
            {#if entry.mcpUrl}
                <label>Legacy MCP URL<textarea aria-label={`MCP URL for ${entry.title}`} value={entry.mcpUrl} readonly rows="3"></textarea></label>
                <p>This URL uses the same connection ID and permissions. Keep ACP connected to use it.</p>
            {:else}
                <p>Connect through the ACP proxy to expose this connection to legacy MCP clients. No separate MCP setup is needed.</p>
            {/if}
            <div class="mcp-connection-actions">
                {#if entry.mcpUrl}<button onmousedown={() => copy(entry)} onclick={event => { if (event.detail === 0) copy(entry) }}>{copied === entry.mcpUrl ? 'Copied' : 'Copy MCP URL'}</button>{/if}
            </div>
            {#if entry.agent}
                <details class="mcp-agent-identity"><summary>Reported agent: {entry.agent.name}{entry.agent.version ? ` ${entry.agent.version}` : ''}</summary>
                    <p>Self-reported identification; permissions belong to this connection.</p>
                    {#each Object.entries(entry.agent.headers || {}) as [header, value]}<p><strong>{header}:</strong> {value}</p>{/each}
                    {#if entry.agent.clientInfo}<p>Advertised MCP client: {entry.agent.clientInfo.name} {entry.agent.clientInfo.version}</p>{/if}
                </details>
            {:else}<p>No agent has used this connection yet.</p>{/if}
            {#if entry.error}<p role="status">{entry.error}</p>{/if}
            <details class="mcp-connection-permissions" open={permissions.some(resource => resource.status === 'requested')}>
                <summary>Access history and permissions ({permissions.length})</summary>
                {#if !permissions.length}<p>No permissions granted. Access requests will appear here and in Resources.</p>{/if}
                {#each permissions as resource (resource.ruleId || resource.requestId)}
                    <PermissionCard {resource} sectionId={resource.status === 'requested' ? 'requested' : resource.status === 'denied' ? 'blocked' : 'used'} />
                {/each}
            </details>
        </article>
    {/each}
    {#if error}<p role="alert">{error}</p>{/if}
</section>

<style>
    .mcp-connections { display: grid; gap: 12px; margin-bottom: 28px; color: #ddd }
    h4 { font-size: 14px; margin: 0 }
    p { font-size: 12px; line-height: 1.5; color: #aaa; margin: 0; overflow-wrap: anywhere }
    button { font: inherit; font-size: 12px; color: #ddd; background: #ffffff0c; border: 1px solid #ffffff22; border-radius: 6px; padding: 7px 10px; cursor: pointer; justify-self: start }
    button:hover { background: #ffffff18 }
    button:disabled { opacity: .4; cursor: default }
    textarea { box-sizing: border-box; width: 100%; font: inherit; font-size: 12px; padding: 8px; color: #ddd; background: #ffffff08; border: 1px solid #ffffff22; border-radius: 6px }
    textarea { resize: vertical; min-height: 60px }
    label { display: grid; gap: 7px; font-size: 12px }
    .mcp-connection-entry { display: grid; gap: 10px; border: 1px solid #ffffff20; border-radius: 8px; padding: 12px }
    .mcp-connection-heading, .mcp-connection-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
    .mcp-connection-heading h4 { flex: 1 }
    .mcp-connection-heading span { font-size: 11px; color: #999 }
    summary { cursor: pointer; font-size: 12px; margin-bottom: 8px }
    details p { margin: 6px 0 }
    textarea:focus-visible, button:focus-visible { outline: 1px solid #aaa; outline-offset: 2px }
</style>

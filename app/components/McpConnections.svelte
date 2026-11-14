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
    .mcp-connections { display: grid; gap: 12px; min-width: 0; color: rgba(255, 255, 255, 0.8) }
    h4 { font-size: 13px; font-weight: 500; line-height: 1.2; margin: 0; color: rgba(255, 255, 255, 0.75) }
    p { font-size: 12px; line-height: 1.4; color: rgba(255, 255, 255, 0.7); margin: 0; overflow-wrap: anywhere }
    button { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font: inherit; font-size: 11px; font-weight: 500; color: rgba(255, 255, 255, 0.8); background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 8px 12px; cursor: pointer; justify-self: start; transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease }
    button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.95) }
    button:disabled { opacity: .5; cursor: not-allowed }
    textarea { box-sizing: border-box; width: 100%; min-width: 0; font: 12px 'SF Mono', Consolas, monospace; padding: 8px 10px; color: rgba(255, 255, 255, 0.9); background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 4px }
    textarea { resize: vertical; min-height: 60px }
    label { display: grid; gap: 6px; min-width: 0; font-size: 12px; font-weight: 500 }
    .mcp-connection-entry { display: grid; gap: 16px; min-width: 0; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 16px }
    .mcp-connection-heading, .mcp-connection-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
    .mcp-connection-heading h4 { flex: 1 }
    .mcp-connection-heading span { font-size: 11px; color: rgba(255, 255, 255, 0.5) }
    summary { cursor: pointer; font-size: 12px; font-weight: 500; margin-bottom: 8px }
    .mcp-connection-permissions { border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 12px }
    details p { margin: 6px 0 }
    textarea:focus-visible { outline: none; border-color: rgba(59, 130, 246, 0.3); background: rgba(255, 255, 255, 0.08) }
    button:focus-visible, summary:focus-visible { outline: 1px solid rgba(59, 130, 246, 0.7); outline-offset: 2px }
</style>

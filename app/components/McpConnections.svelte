<script>
    import { mcp, mcpState } from '../lib/mcp-service.js'
    import { mcpPermissionResources } from '../lib/mcp-permissions.js'
    import data from '../data.svelte.js'
    import PermissionCard from './PermissionCard.svelte'

    let adding = $state(false)
    let title = $state('')
    let description = $state('')
    let editing = $state(null)
    let busy = $state(null)
    let error = $state('')
    let copied = $state(null)

    async function perform(id, action) {
        busy = id
        error = ''
        try { await action() } catch (failure) { error = failure.message } finally { busy = null }
    }

    function add(event) {
        event.preventDefault()
        perform('new', async () => {
            await mcp.add(title, description)
            title = ''
            description = ''
            adding = false
        })
    }

    async function copy(entry) {
        try { await navigator.clipboard.writeText(entry.id); copied = entry.id } catch { error = 'Could not copy the connection ID' }
    }
</script>

<section class="mcp-connections" aria-labelledby="mcp-connections-title">
    <h3 id="mcp-connections-title">MCP connections</h3>
    <p>Each connection has its own identity and starts with no permissions. Select it in Agent connection settings to share browser tools through ACP. Browser access uses the same permission prompts as tabs.</p>
    <button onmousedown={() => { adding = !adding }}>Add new MCP connection</button>
    {#if adding}
        <form class="mcp-connection-form" onsubmit={add}>
            <label>Short title<input aria-label="New MCP connection title" bind:value={title} maxlength="96" required placeholder="Pi workspace" /></label>
            <label>Identifying description<textarea aria-label="New MCP connection description" bind:value={description} maxlength="512" required placeholder="Local Pi agent for this project"></textarea></label>
            <button type="submit" disabled={busy === 'new' || !title.trim() || !description.trim()}>Create connection</button>
        </form>
    {/if}
    {#each $mcpState.connections as entry (entry.id)}
        {@const permissions = mcpPermissionResources(data, entry.id)}
        <article class="mcp-connection-entry" data-mcp-connection-id={entry.id}>
            <div class="mcp-connection-heading"><h4>{entry.title}</h4><span>{entry.status === 'other-window' ? 'Another window' : entry.status}</span></div>
            <p>{entry.description}</p>
            <label>Connection ID<input aria-label={`MCP connection ID for ${entry.title}`} value={entry.id} readonly /></label>
            <div class="mcp-connection-actions">
                <button onmousedown={() => copy(entry)}>{copied === entry.id ? 'Copied' : 'Copy connection ID'}</button>
                <button onmousedown={() => { editing = { id: entry.id, title: entry.title, description: entry.description } }}>Edit</button>
                <button onclick={() => perform(entry.id, () => mcp.remove(entry.id))} disabled={busy === entry.id}>Remove</button>
            </div>
            {#if editing?.id === entry.id}
                <form class="mcp-connection-form" onsubmit={event => {
                    event.preventDefault()
                    perform(entry.id, async () => { await mcp.update(entry.id, editing.title, editing.description); editing = null })
                }}>
                    <label>Short title<input aria-label="Edit MCP connection title" bind:value={editing.title} maxlength="96" required /></label>
                    <label>Identifying description<textarea aria-label="Edit MCP connection description" bind:value={editing.description} maxlength="512" required></textarea></label>
                    <div class="mcp-connection-actions"><button type="submit" disabled={busy === entry.id}>Save</button><button type="button" onmousedown={() => { editing = null }}>Cancel</button></div>
                </form>
            {/if}
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
                {#each permissions as resource (resource.requestId)}
                    <PermissionCard {resource} sectionId={resource.status === 'requested' ? 'requested' : resource.status === 'denied' ? 'blocked' : 'used'} />
                {/each}
            </details>
        </article>
    {/each}
    {#if error}<p role="alert">{error}</p>{/if}
</section>

<style>
    .mcp-connections { display: grid; gap: 12px; margin-bottom: 28px; color: #ddd }
    h3, h4 { font-size: 14px; margin: 0 }
    p { font-size: 12px; line-height: 1.5; color: #aaa; margin: 0; overflow-wrap: anywhere }
    button { font: inherit; font-size: 12px; color: #ddd; background: #ffffff0c; border: 1px solid #ffffff22; border-radius: 6px; padding: 7px 10px; cursor: pointer; justify-self: start }
    button:hover { background: #ffffff18 }
    button:disabled { opacity: .4; cursor: default }
    input, textarea { box-sizing: border-box; width: 100%; font: inherit; font-size: 12px; padding: 8px; color: #ddd; background: #ffffff08; border: 1px solid #ffffff22; border-radius: 6px }
    textarea { resize: vertical; min-height: 60px }
    label, .mcp-connection-form { display: grid; gap: 7px; font-size: 12px }
    .mcp-connection-form { gap: 10px }
    .mcp-connection-entry { display: grid; gap: 10px; border: 1px solid #ffffff20; border-radius: 8px; padding: 12px }
    .mcp-connection-heading, .mcp-connection-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
    .mcp-connection-heading h4 { flex: 1 }
    .mcp-connection-heading span { font-size: 11px; color: #999 }
    summary { cursor: pointer; font-size: 12px; margin-bottom: 8px }
    details p { margin: 6px 0 }
    input:focus-visible, textarea:focus-visible, button:focus-visible { outline: 1px solid #aaa; outline-offset: 2px }
</style>

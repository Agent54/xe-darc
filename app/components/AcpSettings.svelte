<script>
    import { agent, agentState, testAgentConnection } from '../lib/agent.js'
    import { readAcpSettings } from '../lib/acp-settings.js'
    import McpConnections from './McpConnections.svelte'

    const initial = readAcpSettings()
    let id = $state(initial.id)
    let title = $state(initial.title)
    let description = $state(initial.description)
    let adding = $state(!initial.id)
    let editing = $state(false)
    let endpoint = $state(initial.endpoint)
    let cwd = $state(initial.cwd)
    let status = $state('')
    let testing = $state(false)
    let removeButton
    let removePressed = false
    let removeCancelled = false

    function load(config = readAcpSettings()) {
        id = config.id; title = config.title; description = config.description
        endpoint = config.endpoint; cwd = config.cwd
        status = ''
    }

    $effect(() => {
        const selected = $agentState.connectionId
        if (!adding && selected !== id) { editing = false; load() }
    })

    function select(connectionId) {
        agent.selectConnection(connectionId)
        adding = false
        editing = true
        load()
    }

    function add() {
        adding = true
        editing = false
        load({ id: '', title: '', description: '', endpoint: '', cwd: '/' })
    }

    function cancel() { adding = false; editing = false; load() }

    function save() {
        try {
            const config = agent.saveConnection({ id, title, description, endpoint, cwd })
            adding = false
            editing = false
            load(config)
            status = 'Connection saved.'
            return config
        } catch (error) {
            status = error.message
        }
    }

    async function connect() {
        if (!save()) { return }
        testing = true
        try { await agent.prepareConversation(); status = 'Connected.' } catch (error) { status = error.message } finally { testing = false }
    }

    async function test() {
        testing = true
        status = 'Connecting…'
        try {
            status = await testAgentConnection({ endpoint, cwd })
        } catch (error) {
            status = error.message
        } finally {
            testing = false
        }
    }

    export async function reset() {
        if (!id) { cancel(); return }
        testing = true
        try { await agent.removeConnection(id); cancel() } catch (error) { status = error.message } finally { testing = false }
    }

    function remove(event) {
        if (event.detail === 0 || (removePressed && !removeCancelled)) { void reset() }
        removePressed = false
    }
</script>

<svelte:window onkeydown={event => { if (event.key === 'Escape') { if (removePressed) removeCancelled = true; if (adding || editing) cancel() } }}
    onmouseup={event => { if (!removeButton?.contains(event.target)) removePressed = false }} />

<section class="acp-settings setting-section" aria-labelledby="acp-settings-title">
    <h3 class="section-title" id="acp-settings-title">Agent connections</h3>
    <div class="acp-settings-cards">
    {#if !adding && !editing}
        {#each $agentState.connections as connection (connection.id)}
            <button class="acp-connection-summary" aria-label={`Edit ${connection.title}`} onmousedown={() => select(connection.id)} onclick={event => { if (event.detail === 0) select(connection.id) }} disabled={testing}>
                <span class="acp-connection-title">{connection.title}</span>
                {#if connection.description}<span class="acp-connection-description">{connection.description}</span>{/if}
                <span class="acp-connection-endpoint">{connection.endpoint}</span>
                {#if connection.approvals}<span class="acp-connection-approval">Permission requested</span>{/if}
            </button>
        {/each}
        <div class="acp-settings-actions">
            <button onmousedown={add} onclick={event => { if (event.detail === 0) add() }} disabled={testing}>Add new connection</button>
        </div>
    {/if}
    {#if adding || editing}
    <div class="acp-settings-card">
    <div class="acp-settings-heading">
        <h4>{adding ? 'New agent connection' : 'Connection details'}</h4>
        <button aria-label={adding ? 'Close new agent connection' : 'Close connection details'} onmousedown={cancel} onclick={event => { if (event.detail === 0) cancel() }} disabled={testing}>Close</button>
    </div>
    <p>Connect to an installed agent served over ACP HTTP. Manage the agent and its model credentials on the agent host.</p>
    <label>Name<input aria-label="ACP connection name" bind:value={title} maxlength="96" placeholder="OpenCode project" /></label>
    <label>Description (optional)<textarea aria-label="ACP connection description" bind:value={description} maxlength="512"></textarea></label>
    <label>ACP endpoint<input aria-label="ACP endpoint" type="url" bind:value={endpoint} placeholder="https://localhost:7331/acp" /></label>
    <label>Working directory on agent host<input aria-label="Agent working directory" bind:value={cwd} placeholder="/" /></label>
    <p class="acp-settings-note">This connection owns its browser permissions. The ACP proxy exposes the same ID as a legacy MCP URL. Connections stay saved until removed.</p>
    <div class="acp-settings-actions">
        <button class="primary" onmousedown={save} onclick={event => { if (event.detail === 0) save() }} disabled={testing || !title.trim() || !endpoint.trim()}>Save connection</button>
        <button onmousedown={connect} onclick={event => { if (event.detail === 0) connect() }} disabled={testing || !title.trim() || !endpoint.trim()}>Connect</button>
        <button onmousedown={test} onclick={event => { if (event.detail === 0) test() }} disabled={testing || !endpoint.trim()}>Test connection</button>
        {#if id}<button class="danger" aria-label="Remove ACP connection" bind:this={removeButton} onmousedown={event => { if (event.button === 0) { removePressed = true; removeCancelled = false } }} onclick={remove} disabled={testing}>Remove connection</button>{/if}
    </div>
    </div>
    {/if}
    {#if status}<p role="status">{status}</p>{/if}
    {#if id && editing}<McpConnections connectionId={id} />{/if}
    </div>
</section>

<style>
    .acp-settings { margin: 16px 0 32px; min-width: 0 }
    .acp-settings-cards { display: grid; gap: 12px }
    .acp-settings-card { display: grid; gap: 16px; min-width: 0; padding: 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px }
    h4 { font-size: 13px; font-weight: 500; line-height: 1.2; margin: 0; color: rgba(255, 255, 255, 0.75) }
    p { font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.4; margin: 0; overflow-wrap: anywhere }
    label { display: grid; gap: 6px; min-width: 0; font-size: 12px; font-weight: 500; color: rgba(255, 255, 255, 0.8) }
    input, textarea { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 4px; padding: 8px 10px; background: rgba(255, 255, 255, 0.04); color: rgba(255, 255, 255, 0.9); font: inherit; font-size: 12px; font-weight: 400 }
    input[type="url"], input[aria-label="Agent working directory"] { font-family: 'SF Mono', Consolas, monospace }
    textarea { resize: vertical; min-height: 60px }
    input::placeholder, textarea::placeholder { color: rgba(255, 255, 255, 0.4) }
    .acp-settings-actions, .acp-settings-heading { display: flex; gap: 8px; flex-wrap: wrap; align-items: center }
    .acp-settings-heading h4 { flex: 1 }
    button.acp-connection-summary { display: grid; gap: 6px; justify-content: stretch; box-sizing: border-box; width: 100%; padding: 14px 16px; text-align: left; border-radius: 8px; overflow-wrap: anywhere }
    .acp-connection-title { font-size: 13px; font-weight: 500 }
    .acp-connection-description { font-size: 12px; font-weight: 400; color: rgba(255, 255, 255, 0.65) }
    .acp-connection-endpoint { font-size: 11px; font-weight: 400; color: rgba(255, 255, 255, 0.5) }
    .acp-connection-approval { font-size: 11px; color: rgb(251, 191, 36) }
    .acp-settings-note { border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 12px; font-size: 11px; color: rgba(255, 255, 255, 0.5) }
    button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; padding: 8px 12px; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; background: rgba(255, 255, 255, 0.04); color: rgba(255, 255, 255, 0.8); font: inherit; font-size: 11px; font-weight: 500; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease }
    button:disabled { opacity: .5; cursor: not-allowed }
    button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); color: rgba(255, 255, 255, 0.95) }
    button.primary { background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.2); color: rgba(59, 130, 246, 0.9) }
    button.primary:hover:not(:disabled) { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3); color: rgb(59, 130, 246) }
    button.danger { background: rgba(239, 68, 68, 0.06); border-color: rgba(239, 68, 68, 0.2); color: rgba(239, 68, 68, 0.7) }
    button.danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.35); color: rgba(239, 68, 68, 0.9) }
    input:focus-visible, textarea:focus-visible { outline: none; border-color: rgba(59, 130, 246, 0.3); background: rgba(255, 255, 255, 0.08) }
    button:focus-visible { outline: 1px solid rgba(59, 130, 246, 0.7); outline-offset: 2px }
</style>

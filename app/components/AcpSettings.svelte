<script>
    import { agent, agentState, testAgentConnection } from '../lib/agent.js'
    import { readAcpSettings } from '../lib/acp-settings.js'
    import McpConnections from './McpConnections.svelte'

    const initial = readAcpSettings()
    let id = $state(initial.id)
    let title = $state(initial.title)
    let description = $state(initial.description)
    let adding = $state(!initial.id)
    let endpoint = $state(initial.endpoint)
    let cwd = $state(initial.cwd)
    let token = $state(initial.token)
    let status = $state('')
    let testing = $state(false)
    let removeButton
    let removePressed = false
    let removeCancelled = false

    function load(config = readAcpSettings()) {
        id = config.id; title = config.title; description = config.description
        endpoint = config.endpoint; cwd = config.cwd; token = config.token
        status = ''
    }

    $effect(() => {
        const selected = $agentState.connectionId
        if (!adding && selected !== id) { load() }
    })

    function select(event) {
        agent.selectConnection(event.currentTarget.value)
        adding = false
        load()
    }

    function add() {
        adding = true
        load({ id: '', title: '', description: '', endpoint: '', cwd: '/', token: '' })
    }

    function cancel() { adding = false; load() }

    function save() {
        try {
            const config = agent.saveConnection({ id, title, description, endpoint, cwd, token })
            adding = false
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
            status = await testAgentConnection({ endpoint, cwd, token })
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

<svelte:window onkeydown={event => { if (event.key === 'Escape') { if (removePressed) removeCancelled = true; if (adding) cancel() } }}
    onmouseup={event => { if (!removeButton?.contains(event.target)) removePressed = false }} />

<section class="acp-settings" aria-labelledby="acp-settings-title">
    <h3 id="acp-settings-title">Agent connections</h3>
    <p>Connect to an installed agent served over ACP HTTP. Manage the agent and its model credentials on the agent host.</p>
    {#if $agentState.connections.length}
        <label>Saved connection<select aria-label="Saved ACP connection" value={$agentState.connectionId} onchange={select} disabled={testing || adding}>
            {#each $agentState.connections as connection (connection.id)}<option value={connection.id}>{connection.title}</option>{/each}
        </select></label>
    {/if}
    <button onmousedown={add} onclick={event => { if (event.detail === 0) add() }} disabled={testing || adding}>Add new connection</button>
    {#if adding || id}
    {#if adding}<div class="acp-settings-heading"><h4>New agent connection</h4><button aria-label="Close new agent connection" onmousedown={cancel} onclick={event => { if (event.detail === 0) cancel() }}>Close</button></div>{/if}
    <label>Name<input aria-label="ACP connection name" bind:value={title} maxlength="96" placeholder="OpenCode project" /></label>
    <label>Description (optional)<textarea aria-label="ACP connection description" bind:value={description} maxlength="512"></textarea></label>
    <label>ACP endpoint<input aria-label="ACP endpoint" type="url" bind:value={endpoint} placeholder="https://localhost:7331/acp" /></label>
    <label>Working directory on agent host<input aria-label="Agent working directory" bind:value={cwd} placeholder="/" /></label>
    <label>Connection bearer token<input aria-label="ACP bearer token" type="password" bind:value={token} autocomplete="off" /></label>
    <p>This connection owns its browser permissions. The ACP proxy exposes the same ID as a legacy MCP URL. Connections stay saved until removed.</p>
    <div class="acp-settings-actions">
        <button onmousedown={save} onclick={event => { if (event.detail === 0) save() }} disabled={testing || !title.trim() || !endpoint.trim()}>Save connection</button>
        <button onmousedown={connect} onclick={event => { if (event.detail === 0) connect() }} disabled={testing || !title.trim() || !endpoint.trim()}>Connect</button>
        <button onmousedown={test} onclick={event => { if (event.detail === 0) test() }} disabled={testing || !endpoint.trim()}>Test connection</button>
        {#if id}<button aria-label="Remove ACP connection" bind:this={removeButton} onmousedown={event => { if (event.button === 0) { removePressed = true; removeCancelled = false } }} onclick={remove} disabled={testing}>Remove connection</button>{/if}
    </div>
    {/if}
    {#if status}<p role="status">{status}</p>{/if}
    {#if id && !adding}<McpConnections connectionId={id} />{/if}
</section>

<style>
    .acp-settings { margin-bottom: 24px; display: grid; gap: 12px }
    h3, h4 { font-size: 14px; margin: 0; color: #eee }
    p { font-size: 12px; color: #999; line-height: 1.5; margin: 0; overflow-wrap: anywhere }
    label { display: grid; gap: 6px; font-size: 12px; color: #ccc }
    input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid #ffffff22; border-radius: 6px; padding: 8px 10px; background: #242424; color: #eee; font-size: 13px }
    textarea { resize: vertical; min-height: 60px; font: inherit }
    .acp-settings-actions, .acp-settings-heading { display: flex; gap: 8px; flex-wrap: wrap; align-items: center }
    .acp-settings-heading h4 { flex: 1 }
    button { padding: 7px 10px; border: 1px solid #ffffff22; border-radius: 6px; background: #ffffff0c; color: #ddd; font-size: 12px; cursor: pointer }
    button:disabled { opacity: .4; cursor: default }
    button:hover { background: #ffffff18 }
    input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible { outline: 1px solid #aaa; outline-offset: 2px }
</style>

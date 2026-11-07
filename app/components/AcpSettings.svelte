<script>
    import { agent, testAgentConnection } from '../lib/agent.js'
    import { readAcpSettings, saveAcpSettings } from '../lib/acp-settings.js'

    const initial = readAcpSettings()
    let endpoint = $state(initial.endpoint)
    let cwd = $state(initial.cwd)
    let token = $state(initial.token)
    let status = $state('')
    let testing = $state(false)

    function save() {
        try {
            saveAcpSettings({ endpoint, cwd, token })
            agent.configure()
            status = 'Connection saved.'
        } catch (error) {
            status = error.message
        }
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

    export function reset() {
        endpoint = ''
        cwd = '/'
        token = ''
        saveAcpSettings({ endpoint, cwd, token })
        agent.configure()
        status = ''
    }
</script>

<section class="acp-settings" aria-labelledby="acp-settings-title">
    <h3 id="acp-settings-title">Agent connection</h3>
    <p>Connect to an installed agent served over ACP HTTP. Manage the agent and its model credentials on the agent host.</p>
    <label>ACP endpoint<input aria-label="ACP endpoint" type="url" bind:value={endpoint} placeholder="https://localhost:7331/acp" /></label>
    <label>Working directory on agent host<input aria-label="Agent working directory" bind:value={cwd} placeholder="/" /></label>
    <label>Connection bearer token<input aria-label="ACP bearer token" type="password" bind:value={token} autocomplete="off" /></label>
    <p>The connection token is kept for this window session. Browser tools require MCP-over-ACP support.</p>
    <div class="acp-settings-actions"><button onmousedown={save} disabled={testing}>Save connection</button><button onmousedown={test} disabled={testing || !endpoint.trim()}>Test connection</button></div>
    {#if status}<p role="status">{status}</p>{/if}
</section>

<style>
    .acp-settings { margin-bottom: 24px; display: grid; gap: 12px }
    h3 { font-size: 14px; margin: 0; color: #eee }
    p { font-size: 12px; color: #999; line-height: 1.5; margin: 0; overflow-wrap: anywhere }
    label { display: grid; gap: 6px; font-size: 12px; color: #ccc }
    input { width: 100%; box-sizing: border-box; border: 1px solid #ffffff22; border-radius: 6px; padding: 8px 10px; background: #ffffff08; color: #eee; font-size: 13px }
    .acp-settings-actions { display: flex; gap: 8px }
    button { padding: 7px 10px; border: 1px solid #ffffff22; border-radius: 6px; background: #ffffff0c; color: #ddd; font-size: 12px; cursor: pointer }
    button:disabled { opacity: .4; cursor: default }
    button:hover { background: #ffffff18 }
    input:focus-visible, button:focus-visible { outline: 1px solid #aaa; outline-offset: 2px }
</style>

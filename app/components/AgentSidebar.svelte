<script>
    import RightSidebar from './RightSidebar.svelte'
    import data from '../data.svelte.js'
    import { agent, agentState } from '../lib/agent.js'
    import { captureAgentContext } from '../lib/agent-browser-tools.js'
    import { readAcpSettings } from '../lib/acp-settings.js'
    import * as smd from 'streaming-markdown'

    let { onClose, openSidebars, switchToResources, switchToSettings, switchToUserMods, switchToActivity, switchToAIAgent, switchToDevTools, devModeEnabled = false, viewMode = 'default', currentTab = null } = $props()
    let conversation = $state('')
    let selectedTarget = $state('')
    let input = $state(null)
    let connectionError = $state('')
    const chat = $derived($agentState.conversations.find(item => item.id === $agentState.activeConversationId))
    const target = $derived(selectedTarget || (viewMode === 'canvas' ? 'current-space' : 'current-tab'))

    function markdown(node, message) {
        let parser = smd.parser(smd.default_renderer(node))
        let rendered = ''
        let ended = false
        function update(next) {
            if (!next.content.startsWith(rendered) || (ended && next.content !== rendered)) {
                node.replaceChildren()
                parser = smd.parser(smd.default_renderer(node))
                rendered = ''
                ended = false
            }
            if (next.content.length > rendered.length) {
                smd.parser_write(parser, next.content.slice(rendered.length))
                rendered = next.content
            }
            if (!next.streaming && !ended) {
                smd.parser_end(parser)
                ended = true
            }
        }
        update(message)
        return { update }
    }

    async function connect() {
        connectionError = ''
        try {
            await agent.connect()
        } catch (error) {
            connectionError = error.message
        }
    }

    function send() {
        if (!conversation.trim()) { return }
        if (!readAcpSettings().endpoint) {
            connectionError = 'Configure an ACP endpoint in Settings before sending a message.'
            return
        }
        const text = conversation
        conversation = ''
        connectionError = ''
        agent.submit(text, captureAgentContext(data, target))
        input?.focus()
    }

    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault()
            send()
        }
    }

    function configValues(option) {
        return option.options.flatMap(item => item.options || [item])
    }
</script>

<RightSidebar title="Agent" padding={false} {onClose} {openSidebars} {switchToResources} {switchToSettings} {switchToUserMods} {switchToActivity} switchToAgent={switchToAIAgent} {switchToDevTools} {devModeEnabled}>
    {#snippet children()}
        <div class="agent-panel">
            <div class="agent-sticky-header">
                <div class="agent-header-row">
                    <select aria-label="Conversation" value={$agentState.activeConversationId || ''} disabled={$agentState.processing} onchange={event => agent.selectConversation(event.currentTarget.value)}>
                        {#if !$agentState.conversations.length}<option value="">New conversation</option>{/if}
                        {#each $agentState.conversations as item (item.id)}<option value={item.id}>{item.title}</option>{/each}
                    </select>
                    <button onmousedown={() => agent.newConversation()} disabled={$agentState.processing}>New chat</button>
                </div>
                <div class="agent-connection-row">
                    <span role="status">{$agentState.status === 'connected' ? $agentState.agentName : $agentState.status === 'connecting' ? 'Connecting…' : 'Disconnected'}</span>
                    {#if $agentState.status === 'connected'}
                        <button onmousedown={() => agent.disconnect()}>Disconnect</button>
                    {:else}
                        <button disabled={$agentState.status === 'connecting'} onmousedown={connect}>Connect</button>
                    {/if}
                    <button onmousedown={switchToSettings} aria-label="Configure agent connection">Settings</button>
                </div>
                {#if $agentState.status === 'connected' && !$agentState.browserTools}<p class="agent-hint">This agent supports chat. Browser tools require MCP-over-ACP support.</p>{/if}
                <label class="agent-context-selector">Context
                    <select aria-label="Browser context" value={target} onchange={event => { selectedTarget = event.currentTarget.value }}>
                        <option value="current-tab">Current tab{currentTab ? `: ${currentTab.title || currentTab.url || 'New Tab'}` : ''}</option>
                        <option value="current-space">Current space</option>
                        <option value="all-spaces">All spaces</option>
                    </select>
                </label>
                {#if chat}
                    {#each chat.configOptions as option (option.id)}
                        {#if option.type === 'select'}
                            <label class="agent-context-selector">{option.name}
                                <select aria-label={option.name} value={option.currentValue} disabled={$agentState.processing} onchange={event => agent.setConfig(option.id, event.currentTarget.value)}>
                                    {#each configValues(option) as value (value.value)}<option value={value.value}>{value.name}</option>{/each}
                                </select>
                            </label>
                        {:else if option.type === 'boolean'}
                            <label class="agent-context-selector">{option.name}<input type="checkbox" checked={option.currentValue} disabled={$agentState.processing} onchange={event => agent.setConfig(option.id, event.currentTarget.checked)} /></label>
                        {/if}
                    {/each}
                    {#if !chat.configOptions.length && chat.modes}
                        <label class="agent-context-selector">Mode
                            <select aria-label="Agent mode" value={chat.modes.currentModeId} disabled={$agentState.processing} onchange={event => agent.setMode(event.currentTarget.value)}>
                                {#each chat.modes.availableModes as mode (mode.id)}<option value={mode.id}>{mode.name}</option>{/each}
                            </select>
                        </label>
                    {/if}
                {/if}
            </div>

            <div class="agent-chat-container" aria-label="Agent conversation" role="log" aria-live="polite">
                {#if !chat?.messages.length}
                    <div class="agent-empty-state"><p>Work with your installed agent.</p><p class="agent-hint">Choose browser context, then ask a question or request an action. Page reads and tab creation ask for approval.</p></div>
                {/if}
                {#each chat?.messages || [] as message (message.id)}
                    <article class="agent-message" class:user={message.role === 'user'} data-message-id={message.id}>
                        {#if message.role === 'thought'}
                            <details><summary>Thinking</summary><div class="agent-markdown" use:markdown={message}></div></details>
                        {:else if message.role === 'tool'}
                            <details class="agent-tool-card" open={message.status === 'in_progress'}>
                                <summary>{message.title || 'Tool'} · {message.status || 'pending'}</summary>
                                {#if message.rawInput}<pre>{JSON.stringify(message.rawInput, null, 2)}</pre>{/if}
                                <div class="agent-markdown" use:markdown={message}></div>
                            </details>
                        {:else}
                            <div class="agent-message-label">{message.role === 'user' ? 'You' : message.role === 'error' ? 'Connection' : $agentState.agentName || 'Agent'}</div>
                            <div class="agent-markdown" use:markdown={message}></div>
                            <button class="agent-copy" aria-label="Copy message" onmousedown={() => navigator.clipboard.writeText(message.content)}>Copy</button>
                        {/if}
                    </article>
                {/each}
                {#if chat?.plan.length}
                    <div class="agent-plan"><h4>Plan</h4>{#each chat.plan as entry}<p>{entry.status === 'completed' ? '✓' : entry.status === 'in_progress' ? '•' : '–'} {entry.content}</p>{/each}</div>
                {/if}
                {#each $agentState.approvals as approval (approval.id)}
                    <div class="agent-approval" role="group" aria-label={approval.title}>
                        <h4>{approval.title}</h4><pre>{approval.details}</pre>
                        <div class="agent-actions">{#each approval.options as option (option.optionId)}<button onmousedown={() => agent.answer(approval.id, option.optionId)}>{option.name}</button>{/each}</div>
                    </div>
                {/each}
            </div>

            {#if $agentState.queue.length}
                <div class="agent-queue">
                    <div class="agent-header-row"><strong>Queued messages</strong><button onmousedown={() => $agentState.queuePaused ? agent.resumeQueue() : agent.pauseQueue()}>{$agentState.queuePaused ? 'Resume' : 'Pause'}</button></div>
                    {#each $agentState.queue as item (item.id)}
                        <div class="agent-queue-item">
                            <textarea aria-label="Queued message" value={item.text} oninput={event => agent.updateQueued(item.id, event.currentTarget.value)}></textarea>
                            <div class="agent-actions"><button onmousedown={() => agent.toggleQueued(item.id)}>{item.paused ? 'Resume' : 'Pause'}</button><button onclick={() => agent.removeQueued(item.id)}>Remove</button></div>
                        </div>
                    {/each}
                </div>
            {/if}
            {#if connectionError || $agentState.error}<p class="agent-error" role="alert">{connectionError || $agentState.error}</p>{/if}
            <div class="agent-composer">
                {#if chat?.commands.length}<p class="agent-hint">{chat.commands.map(command => `/${command.name}`).join(' · ')}</p>{/if}
                <textarea bind:this={input} bind:value={conversation} onkeydown={handleKeyDown} aria-label="Message agent" placeholder="Ask your agent…" rows="3"></textarea>
                <div class="agent-actions">
                    {#if $agentState.processing}<button onmousedown={() => agent.stop()}>Stop</button>{/if}
                    {#if $agentState.queuePaused}<button onmousedown={() => agent.resumeQueue()}>Resume queue</button>{/if}
                    <button class="agent-send" disabled={!conversation.trim()} onmousedown={send}>{$agentState.processing ? 'Queue message' : 'Send'}</button>
                </div>
            </div>
        </div>
    {/snippet}
</RightSidebar>

<style>
    .agent-panel { display: flex; flex-direction: column; min-height: 0; height: 100%; color: #ddd }
    .agent-sticky-header { padding: 12px; border-bottom: 1px solid #ffffff18; display: grid; gap: 10px }
    .agent-header-row, .agent-connection-row, .agent-actions { display: flex; align-items: center; gap: 8px }
    .agent-header-row select { flex: 1; min-width: 0 }
    .agent-connection-row span { flex: 1; font-size: 12px }
    .agent-context-selector { display: flex; align-items: center; gap: 10px; font-size: 12px }
    .agent-context-selector select { flex: 1; min-width: 0 }
    select, textarea, button { font: inherit; color: inherit; background: #ffffff09; border: 1px solid #ffffff18; border-radius: 6px }
    select, button { padding: 5px 8px; font-size: 12px }
    button { cursor: pointer }
    button:hover { background: #ffffff16 }
    button:disabled { opacity: .4; cursor: default }
    button:focus-visible, select:focus-visible, textarea:focus-visible { outline: 1px solid #aaa; outline-offset: 2px }
    select option { background: #242424 }
    textarea { width: 100%; resize: vertical; min-height: 55px; padding: 10px; box-sizing: border-box; font-size: 13px }
    .agent-chat-container { flex: 1; overflow: auto; min-height: 100px; padding: 14px }
    .agent-message { margin-bottom: 18px; overflow-wrap: anywhere; font-size: 13px; line-height: 1.6 }
    .agent-message.user { background: #ffffff08; padding: 10px; border-radius: 8px }
    .agent-message-label { font-size: 11px; color: #999; margin-bottom: 5px }
    .agent-copy { font-size: 10px; margin-top: 5px; color: #aaa; background: transparent }
    .agent-empty-state { margin: 22px 0; font-size: 14px }
    .agent-hint { color: #999; font-size: 12px; line-height: 1.5; margin: 0 }
    .agent-tool-card, .agent-approval, .agent-plan { padding: 10px; border: 1px solid #ffffff20; border-radius: 8px; margin-bottom: 12px }
    summary { cursor: pointer; color: #bbb }
    pre { max-height: 220px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px }
    h4 { margin: 0 0 8px; font-size: 12px }
    .agent-plan p { font-size: 12px; margin: 5px 0 }
    .agent-queue { padding: 10px 12px; max-height: 220px; overflow: auto; border-top: 1px solid #ffffff18; font-size: 12px }
    .agent-queue-item { margin-top: 8px }
    .agent-queue-item textarea { font-size: 12px }
    .agent-composer { padding: 12px; border-top: 1px solid #ffffff18; display: grid; gap: 8px }
    .agent-actions { flex-wrap: wrap }
    .agent-send { margin-left: auto }
    .agent-error { font-size: 12px; padding: 0 12px; overflow-wrap: anywhere; color: #bbb }
    .agent-markdown :global(pre) { background: #0004; padding: 10px; overflow: auto }
    .agent-markdown :global(p) { margin: 0 0 8px }
    .agent-markdown :global(a) { color: #c5d5ee; text-decoration: underline }
    .agent-markdown :global(ul), .agent-markdown :global(ol) { padding-left: 20px }
    .agent-markdown :global(table) { display: block; overflow: auto; border-collapse: collapse }
    .agent-markdown :global(td), .agent-markdown :global(th) { border: 1px solid #ffffff20; padding: 4px 7px }
</style>

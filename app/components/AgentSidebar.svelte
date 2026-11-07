<script>
    import { onMount, tick } from 'svelte'
    import RightSidebar from './RightSidebar.svelte'
    import data from '../data.svelte.js'
    import { getTabTitle } from '../lib/tab-title.js'
    import { agent, agentState } from '../lib/agent.js'
    import { captureAgentContext } from '../lib/agent-context.js'
    import { readAcpSettings } from '../lib/acp-settings.js'
    import { getModelConfig, modelAvatar } from '../lib/agent-models.js'
    import { default_renderer, parser as createMarkdownParser, parser_write as writeMarkdownChunk, parser_end as endMarkdownStream } from 'streaming-markdown'

    let {
        onClose, openSidebars, switchToResources, switchToSettings, switchToUserMods,
        switchToActivity, switchToAIAgent, switchToDevTools, devModeEnabled = false,
        viewMode = 'default', currentTab = null, conv = $bindable(false)
    } = $props()

    let conversation = $state('')
    let selectedTarget = $state('')
    let hoveredMessageId = $state(null)
    let editingMessageId = $state(null)
    let editingContent = $state('')
    let connectionError = $state('')
    let showAllHistory = $state(false)
    let input = $state(null)
    const chat = $derived($agentState.conversations.find(item => item.id === $agentState.activeConversationId))
    const isProcessing = $derived($agentState.processing)
    const queuePaused = $derived($agentState.queuePaused)
    const target = $derived(selectedTarget || (viewMode === 'canvas' ? 'current-space' : 'current-tab'))
    const selectedHistoryId = $derived($agentState.activeConversationId || 'current')
    const chatHistoryList = $derived($agentState.conversations)
    const modelConfig = $derived(getModelConfig(chat?.configOptions))
    const selectedModel = $derived(modelConfig?.currentValue || 'agent')
    const availableTargets = $derived([
        { id: 'current-tab', name: `Current tab${currentTab ? ': ' + getTabTitle(currentTab) : ''}` },
        { id: 'current-space', name: 'Current space' },
        { id: 'all-spaces', name: 'All spaces' }
    ])
    const messageQueue = $derived($agentState.queue.map(item => ({ ...item, userMessage: item.text, status: 'queued' })))
    const chatHistory = $derived.by(() => {
        const messages = (chat?.messages || []).map(message => {
            if (message.role !== 'tool') { return message }
            return { ...message, role: 'info-cards', cards: [{
                action: ({ read: 'read-tab', search: 'web-search', execute: 'execute-js', edit: 'modify-content' })[message.kind] || 'tool-call',
                title: message.title || 'Tool', toolCallId: message.toolCallId,
                status: message.status === 'failed' ? 'error' : message.status === 'completed' ? 'completed' : 'pending',
                details: message.rawInput ? JSON.stringify(message.rawInput, null, 2) : '',
                result: message.content || (message.rawOutput ? JSON.stringify(message.rawOutput, null, 2) : '')
            }] }
        })
        for (const approval of $agentState.approvals.filter(item => item.conversationId === chat?.id)) {
            messages.push({ id: approval.id, role: 'info-cards', cards: [{
                action: 'grant-permission', title: approval.title, details: approval.details,
                awaitingPermission: true, needsPermission: true, status: 'pending',
                approvalId: approval.id, options: approval.options
            }] })
        }
        return messages
    })

    function streamingMarkdown(node, message) {
        let parser = createMarkdownParser(default_renderer(node))
        let rendered = ''
        let ended = false
        function update(next) {
            if (!next.content.startsWith(rendered) || (ended && next.content !== rendered)) {
                node.replaceChildren()
                parser = createMarkdownParser(default_renderer(node))
                rendered = ''
                ended = false
            }
            if (next.content.length > rendered.length) {
                writeMarkdownChunk(parser, next.content.slice(rendered.length))
                rendered = next.content
            }
            if (!next.streaming && !ended) {
                endMarkdownStream(parser)
                ended = true
            }
        }
        update(message)
        return { update }
    }

    async function connect() {
        connectionError = ''
        try { await agent.prepareConversation() } catch (error) { connectionError = error.message }
    }

    function sendMessage() {
        const text = conversation.trim()
        if (!text) { return }
        const command = text.toLowerCase()
        if (!['cards', 'doc', 'test'].includes(command) && !readAcpSettings().endpoint) {
            connectionError = 'Configure an ACP endpoint in Settings before sending a message.'
            return
        }
        conversation = ''
        connectionError = ''
        switch (command) {
            case 'cards':
                showTestCards()
                break
            case 'doc':
                generateTestMarkdownDocument()
                break
            case 'test':
                showTestMessage()
                break
            default:
                agent.submit(text, captureAgentContext(data, target))
        }
        input?.focus()
    }

    function handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault()
            sendMessage()
        }
    }

    function handleModelChange(event) { agent.setConfig(modelConfig.id, event.currentTarget.value) }
    function handleHistoryChange(event) {
        const id = event.currentTarget.value
        if (id === 'show-all') { showAllHistory = true; event.currentTarget.value = selectedHistoryId }
        else if (id !== 'current') { agent.selectConversation(id) }
    }
    function clearHistory() {
        const id = agent.newConversation()
        if (id && $agentState.status === 'connected') {
            connect()
        }
        input?.focus()
    }
    function pauseQueue() { agent.pauseQueue(); input?.focus() }
    function resumeQueue() { agent.resumeQueue(); input?.focus() }
    function stopCurrentTask() { agent.stop(); input?.focus() }
    function pauseQueueItem(id) { if (!messageQueue.find(item => item.id === id)?.paused) { agent.toggleQueued(id) } }
    function resumeQueueItem(id) { if (messageQueue.find(item => item.id === id)?.paused) { agent.toggleQueued(id) } }
    function stopQueueItem(id) { agent.removeQueued(id) }
    function editQueueItem(id) {
        const item = messageQueue.find(item => item.id === id)
        if (item) { editingMessageId = id; editingContent = item.userMessage }
    }
    function editMessage(id) {
        const message = chat?.messages.find(item => item.id === id && item.role === 'user')
        if (message) { editingMessageId = id; editingContent = message.content }
    }
    function saveQueueItemEdit(id) { agent.updateQueued(id, editingContent); cancelMessageEdit() }
    function saveMessageEdit(id) { agent.editMessage(id, editingContent); cancelMessageEdit() }
    function cancelMessageEdit() { editingMessageId = null; editingContent = '' }
    function copyMessage(id) {
        const message = chat?.messages.find(item => item.id === id)
        if (message) { navigator.clipboard.writeText(message.content) }
    }
    function thumbsUp(id) {
        agent.rateMessage(id, 'good')
        // TODO: Implement feedback system
    }
    function thumbsDown(id) {
        agent.rateMessage(id, 'poor')
        // TODO: Implement feedback system
    }
    function handleActionButton(action) {
        if (action === 'listen') { conv = !conv; return }
        if (action === 'search') {
            generateTestMarkdownDocumentForTest()
        } else {
            const prefixes = { ask: 'ask about ', do: 'do ', remember: 'remember ', see: 'show me ' }
            conversation = conversation || prefixes[action] || ''
        }
        input?.focus()
    }

    function showTestCards() {
        const testCards = [
            {
                type: 'context',
                action: 'read-tab',
                status: 'accessed',
                title: currentTab ? getTabTitle(currentTab) : 'Test Tab',
                url: currentTab ? currentTab.url : 'https://example.com',
                favicon: currentTab ? currentTab.favicon : null
            },
            {
                type: 'context',
                action: 'read-space',
                status: 'accessed',
                title: 'Current Space',
                details: '5 tabs'
            },
            {
                type: 'context',
                action: 'read-all-spaces',
                status: 'accessed',
                title: 'All Spaces',
                details: '3 spaces total'
            },
            {
                type: 'tool',
                action: 'web-search',
                status: 'accessed',
                title: 'Web Search',
                details: 'Searching for relevant information'
            },
            {
                type: 'tool',
                action: 'execute-js',
                status: 'accessed',
                title: 'JavaScript Execution',
                details: currentTab ? getTabTitle(currentTab) : 'No target tab'
            },
            {
                type: 'tool',
                action: 'screenshot',
                status: 'accessed',
                title: 'Page Analysis',
                details: 'Analyzing current page content'
            },
            {
                type: 'tool',
                action: 'modify-content',
                status: 'modified',
                title: 'Content Modification',
                details: 'Modifying page content'
            },
            {
                type: 'tool',
                action: 'inject-script',
                status: 'accessed',
                title: 'Script Injection',
                details: 'Adding custom functionality'
            },
            {
                type: 'tool',
                action: 'clipboard-access',
                status: 'accessed',
                title: 'Clipboard Access',
                details: 'Reading/writing clipboard'
            },
            {
                type: 'tool',
                action: 'file-download',
                status: 'accessed',
                title: 'File Download',
                details: 'Downloading file to device'
            },
            {
                type: 'tool',
                action: 'file-upload',
                status: 'accessed',
                title: 'File Upload',
                details: 'Uploading file from device'
            },
            {
                type: 'tool',
                action: 'api-call',
                status: 'accessed',
                title: 'API Request',
                details: 'Making external API call'
            },
            {
                type: 'tool',
                action: 'local-storage',
                status: 'accessed',
                title: 'Local Storage',
                details: 'Storing data locally'
            },
            {
                type: 'tool',
                action: 'css-injection',
                status: 'modified',
                title: 'CSS Injection',
                details: 'Custom styling applied'
            },
            {
                type: 'security',
                action: 'camera-access',
                status: 'accessed',
                title: 'Camera Access',
                details: 'Requesting camera permission'
            },
            {
                type: 'security',
                action: 'microphone-access',
                status: 'denied',
                title: 'Microphone Access',
                details: 'User denied microphone access'
            },
            {
                type: 'security',
                action: 'location-access',
                status: 'accessed',
                title: 'Location Access',
                details: 'Accessing device location'
            },
            {
                type: 'security',
                action: 'notification-permission',
                status: 'accessed',
                title: 'Notifications',
                details: 'Permission to show notifications'
            },
            {
                type: 'security',
                action: 'fullscreen-request',
                status: 'accessed',
                title: 'Fullscreen Mode',
                details: 'Entering fullscreen view'
            },
            {
                type: 'security',
                action: 'ad-block',
                status: 'denied',
                title: 'Ad Blocked',
                details: 'Blocked advertisement content'
            },
            {
                type: 'security',
                action: 'analytics-block',
                status: 'denied',
                title: 'Analytics Blocked',
                details: 'Blocked tracking scripts'
            },
            {
                type: 'security',
                action: 'malware-scan',
                status: 'accessed',
                title: 'Security Scan',
                details: 'Scanning for threats'
            },
            {
                type: 'security',
                action: 'proxy-detection',
                status: 'accessed',
                title: 'Proxy Detection',
                details: 'Checking network routing'
            }
        ]

        agent.addLocalExchange('cards', { role: 'info-cards', cards: testCards })
    }

    function showTestMessage() {
        agent.addLocalExchange('test', { role: 'assistant', content: 'Hello world! This is a test response.' })
    }

    function generateTestMarkdownDocumentForTest() {
        // Test markdown document (shorter version)
        const testMarkdown = `# Test Document

## Overview

This is a test markdown document to demonstrate the document rendering format.

### Features

- **Markdown rendering**: Full markdown support
- **Streaming display**: Content appears progressively  
- **Document layout**: Optimized for longer content

### Code Example

\`\`\`javascript
function example() {
    console.log("Hello from test document!")
    return "success"
}
\`\`\`

### Summary

This demonstrates the assistant-doc message format with proper markdown rendering and document-style layout.

---

*Test completed successfully*`
        streamTestDocument(testDocumentChunks(testMarkdown, { minLength: 30, lengthVariation: 40, initialDelay: 100, interval: 150 }))
    }

    function generateTestMarkdownDocument() {
        // Test markdown document
        const testMarkdown = `# Comprehensive Analysis Report

## Executive Summary

This document provides a detailed analysis of the current system architecture and recommendations for future improvements. The analysis covers performance metrics, security considerations, and scalability patterns.

### Key Findings

- **Performance**: Current response times average 120ms
- **Security**: All endpoints properly authenticated  
- **Scalability**: System can handle 10,000 concurrent users
- **Reliability**: 99.97% uptime achieved

## Technical Architecture

### Current Stack

The system is built using modern web technologies:

\`\`\`javascript
// Example configuration
const config = {
    database: 'postgresql',
    cache: 'redis',
    framework: 'svelte',
    deployment: 'docker'
}
\`\`\`

### Database Schema

| Table | Records | Growth Rate |
|-------|---------|-------------|
| Users | 50,000 | 5% monthly |
| Sessions | 2.3M | 15% monthly |
| Analytics | 890K | 25% monthly |

## Performance Metrics

### Response Times
- **API Endpoints**: 95ms average
- **Database Queries**: 15ms average  
- **Cache Hit Rate**: 87%

### Load Testing Results

We conducted comprehensive load testing with the following results:

1. **Baseline Performance**: 1000 req/sec
2. **Peak Load**: 5000 req/sec sustained
3. **Breaking Point**: 8500 req/sec

## Security Assessment

### Authentication
- Multi-factor authentication implemented
- JWT tokens with 15-minute expiration
- Rate limiting: 100 requests per minute

### Data Protection
- All data encrypted at rest using AES-256
- TLS 1.3 for data in transit
- Regular security audits performed

## Recommendations

### Short Term (Next 3 months)
1. **Optimize database queries** - Reduce average query time by 30%
2. **Implement CDN** - Improve global response times
3. **Add monitoring** - Enhanced observability with Datadog

### Long Term (Next 12 months)
1. **Microservices migration** - Break monolith into services
2. **Auto-scaling** - Implement Kubernetes horizontal scaling
3. **Multi-region deployment** - Add redundancy across regions

## Conclusion

The current system demonstrates strong performance and security characteristics. With the recommended improvements, we can achieve:

- 50% faster response times
- 99.99% uptime SLA
- Support for 100,000 concurrent users
- Enhanced security posture

> **Note**: All metrics are based on production data from the last 6 months. Implementation timeline depends on resource allocation and business priorities.

---

*Report generated on ${new Date().toLocaleDateString()}*`
        streamTestDocument(testDocumentChunks(testMarkdown, { minLength: 65, lengthVariation: 55, initialDelay: 450, interval: 300 }))
    }

    async function streamTestDocument(chunks) {
        const panel = input?.closest('.agent-panel')
        agent.addLocalExchange('doc', { role: 'assistant-doc', chunks })
        await tick()
        const reply = Array.from(panel?.querySelectorAll('.assistant-doc') || []).at(-1)
        reply?.scrollIntoView({ block: 'center', inline: 'nearest' })
    }

    async function* testDocumentChunks(testMarkdown, { minLength, lengthVariation, initialDelay, interval }) {
        // Split into chunks and stream
        const chunks = []
        let remaining = testMarkdown
        while (remaining.length > 0) {
            const chunkLength = Math.floor(Math.random() * lengthVariation) + minLength
            const chunk = remaining.substring(0, chunkLength)
            chunks.push(chunk)
            remaining = remaining.substring(chunkLength)
        }

        // Stream the chunks
        await new Promise(resolve => setTimeout(resolve, initialDelay))
        for (const chunk of chunks) {
            yield chunk
            await new Promise(resolve => setTimeout(resolve, interval))
        }
    }

    onMount(() => { input?.focus() })
</script>

{#snippet configChoices(options)}
    {#each options as option}
        {#if option.options}
            <optgroup label={option.name}>
                {#each option.options as value (value.value)}
                    <option value={value.value}>{value.name}</option>
                {/each}
            </optgroup>
        {:else}
            <option value={option.value}>{option.name}</option>
        {/if}
    {/each}
{/snippet}

<RightSidebar
	title="Agent"
	padding={false}
	{onClose}
	{openSidebars}
	{switchToResources}
	{switchToSettings}
	{switchToUserMods}
	{switchToActivity}
	switchToAgent={switchToAIAgent}
	{switchToDevTools}
	{devModeEnabled}
>
	{#snippet children()}
		<div class="agent-panel">
		<div class="agent-sticky-header">
			<div class="agent-header-row">
				<select class="agent-model-select" aria-label="Conversation" value={selectedHistoryId} disabled={isProcessing} onchange={handleHistoryChange}>
					<option value="current">Current chat</option>
					{#each (showAllHistory ? chatHistoryList : chatHistoryList.slice(0, 10)) as historyItem}
						<option value={historyItem.id}
							>{historyItem.title} [{new Date(historyItem.timestamp).toLocaleDateString('de-DE')}]</option
						>
					{/each}
					{#if !showAllHistory && chatHistoryList.length > 10}
						<option value="show-all">Show all {chatHistoryList.length} chats...</option>
					{/if}
				</select>

				<select class="agent-model-select" aria-label={modelConfig?.name || 'Agent model'} value={selectedModel} disabled={isProcessing || !modelConfig} onchange={handleModelChange}>
					{#if modelConfig}
						{@render configChoices(modelConfig.options)}
					{:else}
						<option value="agent">{$agentState.agentName || 'Agent model'}</option>
					{/if}
				</select>
			</div>

			<div class="agent-connection-row">
				<span role="status">{$agentState.status === 'connected' ? $agentState.agentName : $agentState.status === 'connecting' ? 'Connecting…' : 'Disconnected'}</span>
				{#if $agentState.status === 'connected'}
					<button class="agent-quick-action" onmousedown={() => agent.disconnect()}>Disconnect</button>
				{:else}
					<button class="agent-quick-action" disabled={$agentState.status === 'connecting'} onmousedown={connect}>Connect</button>
				{/if}
				<button class="agent-quick-action" onmousedown={switchToSettings} aria-label="Configure agent connection">Settings</button>
			</div>
			{#each chat?.configOptions.filter(option => option !== modelConfig) || [] as option (option.id)}
				<label class="agent-selector-row">{option.name}
					{#if option.type === 'select'}
						<select class="agent-context-select" aria-label={option.name} value={option.currentValue} disabled={isProcessing} onchange={event => agent.setConfig(option.id, event.currentTarget.value)}>
							{@render configChoices(option.options)}
						</select>
					{:else if option.type === 'boolean'}
						<input type="checkbox" checked={option.currentValue} disabled={isProcessing} onchange={event => agent.setConfig(option.id, event.currentTarget.checked)} />
					{/if}
				</label>
			{/each}
			{#if !chat?.configOptions.length && chat?.modes}
				<label class="agent-selector-row">Mode
					<select class="agent-context-select" aria-label="Agent mode" value={chat.modes.currentModeId} disabled={isProcessing} onchange={event => agent.setMode(event.currentTarget.value)}>
						{#each chat.modes.availableModes as mode (mode.id)}<option value={mode.id}>{mode.name}</option>{/each}
					</select>
				</label>
			{/if}
			<div class="agent-target-selector">
				<div class="agent-selector-row">
					<label class="agent-context-label" for="agent-context-select">Context:</label>
					<select id="agent-context-select" aria-label="Browser context" class="agent-context-select" value={target} onchange={event => { selectedTarget = event.currentTarget.value }}>
						{#each availableTargets as target}
							<option value={target.id}>{target.name}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<div class="agent-chat-container" aria-label="Agent conversation" role="log" aria-live="polite">
			{#if chatHistory.length > 0 || messageQueue.length > 0}
				<div class="agent-chat-history">
					{#each chatHistory as message (message.id)}
						{#if message.role === 'info-cards'}
							<div class="agent-info-cards">
								{#each message.cards as card}
									<div
										class="agent-info-card"
										class:agent-approval={!!card.approvalId}
										class:context={card.type === 'context'}
										class:tool={card.type === 'tool'}
										class:security={card.type === 'security'}
										class:accessed={card.status === 'accessed'}
										class:modified={card.status === 'modified'}
										class:denied={card.status === 'denied'}
									>
									<div class="agent-info-card-header">
										<div class="agent-info-card-icon">
											{#if card.action === 'read-tab'}
												{#if card.favicon}
													<img src={card.favicon} alt="" class="agent-info-card-favicon" />
												{:else}
													<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z"
														/>
													</svg>
												{/if}
											{:else if card.action === 'read-space' || card.action === 'read-all-spaces'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z"
													/>
												</svg>
											{:else if card.action === 'web-search'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
													/>
												</svg>
											{:else if card.action === 'execute-js'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 1 3.75 6v12A2.25 2.25 0 0 1 6 20.25Z"
													/>
												</svg>
											{:else if card.action === 'modify-content'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
													/>
												</svg>
											{:else if card.action === 'inject-script'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
													/>
												</svg>
											{:else if card.action === 'block-request'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
													/>
												</svg>
											{:else if card.action === 'grant-permission'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
													/>
												</svg>
											{:else if card.action === 'api-call'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
													/>
												</svg>
											{:else if card.action === 'access-cookies'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
													/>
												</svg>
											{:else if card.action === 'file-download'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
													/>
												</svg>
											{:else if card.action === 'file-upload'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
													/>
												</svg>
											{:else if card.action === 'screenshot'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
													/>
												</svg>
											{:else if card.action === 'notification-permission'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
													/>
												</svg>
											{:else if card.action === 'location-access'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
													/>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
													/>
												</svg>
											{:else if card.action === 'camera-access'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
													/>
												</svg>
											{:else if card.action === 'microphone-access'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
													/>
												</svg>
											{:else if card.action === 'clipboard-access'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
													/>
												</svg>
											{:else if card.action === 'fullscreen-request'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
													/>
												</svg>
											{:else if card.action === 'local-storage'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
													/>
												</svg>
											{:else if card.action === 'proxy-detection'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
													/>
												</svg>
											{:else if card.action === 'analytics-block'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
													/>
												</svg>
											{:else if card.action === 'ad-block'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
													/>
												</svg>
											{:else if card.action === 'malware-scan'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
													/>
												</svg>
											{:else if card.action === 'css-injection'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
													/>
												</svg>
											{:else if card.action === 'page-redirect'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
													/>
												</svg>
											{:else if card.action === 'print-dialog'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M18.75 9V6a2.25 2.25 0 0 0-2.25-2.25H7.5A2.25 2.25 0 0 0 5.25 6v3M6.75 9h10.5m-10.5 0V6a2.25 2.25 0 0 1 2.25-2.25h6A2.25 2.25 0 0 1 17.25 6v3"
													/>
												</svg>
											{:else if card.action === 'tool-call'}
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
													/>
												</svg>

											{/if}
										</div>
										<div class="agent-info-card-text">
											<div class="agent-info-card-title">{card.title}</div>
											{#if card.details}
												<div class="agent-info-card-details">{card.details}</div>
											{:else if card.url}
												<div class="agent-info-card-url">{card.url}</div>
											{/if}
										</div>
									</div>

									<!-- Debug info -->
									<!-- <div style="font-size: 9px; color: rgba(255,255,255,0.3); margin-top: 4px;">
										DEBUG: needsPermission={card.needsPermission}, awaitingPermission={card.awaitingPermission}, status={card.status}, result={card.result}
									</div> -->

									{#if card.awaitingPermission}
										<div class="agent-info-card-actions">
											{#each card.options || [] as option (option.optionId)}
												<button class="agent-permission-btn" onmousedown={() => agent.answer(card.approvalId, option.optionId)}>{option.name}</button>
											{/each}
											{#if !card.approvalId}
											<button
												class="agent-permission-btn approve"
												disabled
												title="Approve tool permission"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
													/>
												</svg>
												Accept
											</button>
											<button
												class="agent-permission-btn reject"
												disabled
												title="Reject tool permission"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
													/>
												</svg>
												Reject
											</button>
											{/if}
										</div>
									{:else if card.needsPermission && card.permissionResult}
										<div class="agent-info-card-result">
											<div class="agent-permission-result {card.status}">
												{card.status === 'approved' ? 'Approved' : 'Denied'}
											</div>
										</div>
									{:else if card.result}
										<div class="agent-info-card-result">
											<div class="agent-tool-result">
												Result: {card.result}
											</div>
										</div>
									{/if}
									</div>
								{/each}
							</div>
						{:else if message.role === 'assistant' || message.role === 'assistant-doc'}
							{@const avatar = modelAvatar(message.model, message.modelName)}
							{@const documentLayout = message.role === 'assistant-doc' || message.content.split('\n', 17).length > 16}
							<div
								class="agent-markdown-message"
								class:assistant-chat={!documentLayout}
								class:assistant-doc={documentLayout}
								data-message-id={message.id}
								role="group"
								onmouseenter={() => (hoveredMessageId = message.id)}
								onmouseleave={() => (hoveredMessageId = null)}
							>
								<div class="agent-message-header">
									<div class="agent-avatar" title={message.modelName}>
										{@html avatar.icon}
										{#if avatar.badge}
											<div class="agent-avatar-title-overlay">
												{avatar.badge}
											</div>
										{/if}
									</div>
								</div>
								<div class="agent-markdown-content">
									<div class="agent-markdown-streaming agent-markdown" class:streaming={message.streaming} use:streamingMarkdown={message}>
										<!-- Markdown content will be inserted here by the streaming-markdown library -->
									</div>
								</div>
								<div class="agent-markdown-time-row">
									<div class="agent-chat-message-time">
										{new Date(message.timestamp).toLocaleTimeString('en-GB')}
									</div>
									<div class="agent-message-actions" class:visible={hoveredMessageId === message.id}>
										<button
											class="agent-action-btn"
											onmousedown={() => thumbsUp(message.id)}
											aria-pressed={message.feedback === 'good'}
											title="Good response"
											aria-label="Good response"
										>
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5.904 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z"
												/>
											</svg>
										</button>
										<button
											class="agent-action-btn"
											onmousedown={() => thumbsDown(message.id)}
											aria-pressed={message.feedback === 'poor'}
											title="Poor response"
											aria-label="Poor response"
										>
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 0 1-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.997 7.997 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-2.824 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 1.302-4.665c0-1.194-.232-2.333-.654-3.375Z"
												/>
											</svg>
										</button>
										<button
											class="agent-action-btn"
											onmousedown={() => copyMessage(message.id)}
											title="Copy message"
											aria-label="Copy message"
										>
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
												/>
											</svg>
										</button>
									</div>
								</div>
							</div>
						{:else if message.role === 'response-divider'}
							<div class="agent-response-divider">
								{message.content}
							</div>
						{:else}
							<div
								class="agent-chat-message"
								class:user={message.role === 'user'}
								class:error={message.role === 'error'}
								class:token-summary={message.isTokenSummary}
								role="group"
								onmouseenter={() => (hoveredMessageId = message.id)}
								onmouseleave={() => (hoveredMessageId = null)}
							>
								<div class="agent-chat-message-content">
									{#if editingMessageId === message.id}
										<div class="agent-edit-container">
											<textarea
												class="agent-edit-input"
												bind:value={editingContent}
												placeholder="Edit your message..."
												rows="2"
											></textarea>
											<div class="agent-edit-actions">
												<button class="agent-edit-btn save" onmousedown={() => saveMessageEdit(message.id)}>Save</button
												>
												<button class="agent-edit-btn cancel" onmousedown={cancelMessageEdit}>Cancel</button>
											</div>
										</div>
									{:else}
										<div class="agent-message-text">
											{message.content}
										</div>
										{#if message.role === 'user'}<button class="agent-action-btn" disabled={isProcessing} onmousedown={() => editMessage(message.id)} aria-label="Edit displayed message">Edit</button>{/if}
									{/if}
								</div>
								<div class="agent-chat-message-time-row">
									<div class="agent-chat-message-time">
										{new Date(message.timestamp).toLocaleTimeString('en-GB')}
									</div>
								</div>
							</div>
						{/if}
					{/each}

					{#if isProcessing}
						<div class="agent-chat-message assistant">
							<div class="agent-chat-message-content">
								<div class="agent-typing-indicator">
									<span></span>
									<span></span>
									<span></span>
								</div>
							</div>
						</div>
					{/if}

					{#if messageQueue.filter((item) => item.status === 'queued').length > 0}
						<div class="agent-global-controls">
							{#if queuePaused}
								<button
									class="agent-queue-btn"
									onmousedown={resumeQueue}
									title="Resume Queue"
									aria-label="Resume Queue"
								>
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
										/>
									</svg>
								</button>
							{:else}
								<button class="agent-queue-btn" onmousedown={pauseQueue} title="Pause Queue" aria-label="Pause Queue">
									<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
									</svg>
								</button>
							{/if}
						</div>
					{/if}

					{#if messageQueue.filter((item) => item.status === 'queued').length > 0}
						{#each messageQueue.filter((item) => item.status === 'queued') as queueItem, index}
							<div class="agent-chat-message user queued" class:paused={queueItem.paused}>
								<div class="agent-chat-message-content">
									{#if editingMessageId === queueItem.id}
										<div class="agent-edit-container">
											<textarea
												class="agent-edit-input"
												bind:value={editingContent}
												placeholder="Edit your message..."
												rows="3"
											></textarea>
											<div class="agent-edit-actions">
												<button class="agent-edit-btn save" onmousedown={() => saveQueueItemEdit(queueItem.id)}>Save</button
												>
												<button class="agent-edit-btn cancel" onmousedown={cancelMessageEdit}>Cancel</button>
											</div>
										</div>
									{:else}
										<div
											class="agent-message-text editable"
											role="button"
											tabindex="0"
											onkeydown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); editQueueItem(queueItem.id) } }}
											onclick={() => editQueueItem(queueItem.id)}
										>
											{queueItem.userMessage}
										</div>
									{/if}
								</div>
								<div class="agent-chat-message-time-row">
									<div class="agent-chat-message-time">
										Queued #{index + 1}
										{queueItem.paused ? '(Paused)' : ''}
									</div>
									<div class="agent-queue-item-controls">
										{#if queueItem.paused}
											<button
												class="agent-queue-item-btn play"
												onmousedown={() => resumeQueueItem(queueItem.id)}
												title="Resume this item"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
													/>
												</svg>
											</button>
										{:else}
											<button
												class="agent-queue-item-btn pause"
												onmousedown={() => pauseQueueItem(queueItem.id)}
												title="Pause this item"
											>
												<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
												</svg>
											</button>
										{/if}
										<button
											class="agent-queue-item-btn stop"
												onclick={() => stopQueueItem(queueItem.id)}
											title="Remove this item"
										>
											<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

				</div>

	<div class="agent-bottom-sticky">
		{#if chat?.plan.length}<div class="agent-plan"><h4>Plan</h4>{#each chat.plan as entry}<p>{entry.status}: {entry.content}</p>{/each}</div>{/if}
		{#if connectionError || $agentState.error}<p class="agent-error" role="alert">{connectionError || $agentState.error}</p>{/if}
		{#if conv}<p class="agent-voice-status" role="status">Voice controls enabled. Voice input is not connected yet.</p>{/if}
		{#if chat?.commands.length}<p class="agent-commands">{chat.commands.map(command => '/' + command.name).join(' · ')}</p>{/if}
		<div class="agent-chat-input-container">
			<div class="agent-textarea-container">
				<textarea
					class="agent-conversation-input"
					aria-label="Message agent"
					bind:this={input}
					bind:value={conversation}
					onkeydown={handleKeyDown}
					placeholder="We can do anything..."
					rows="3"
				></textarea>
				<button
					class="agent-mic-button"
					class:low-opacity={!conv}
					onmousedown={() => handleActionButton('listen')}
					title="Voice Input"
					aria-label="Voice Input"
					aria-pressed={conv}
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M19 10v2a7 7 0 0 1-14 0v-2"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 19v4"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M8 23h8"
						/>
					</svg>
				</button>
				{#if isProcessing}
					<button
						class="agent-stop-button"
						onmousedown={stopCurrentTask}
						title="Stop Current Task"
						aria-label="Stop Current Task"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
							/>
						</svg>
					</button>
				{/if}
				<button
					class="agent-send-button"
					onmouseup={sendMessage}
					disabled={!conversation.trim()}
					title="Send (Enter)"
					aria-label="Send (Enter)"
				>
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
						/>
					</svg>
				</button>
			</div>

			<div class="agent-action-buttons">
				<button class="agent-quick-action" onmousedown={() => handleActionButton('search')}>search</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('ask')}>ask</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('do')}>do</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('remember')}>remember</button>
				<button class="agent-quick-action" onmousedown={() => handleActionButton('see')}>see</button>
			</div>
		</div>

		{#if chatHistory.length > 0}
			<div class="agent-chat-actions">
				<button class="agent-clear-button" onmousedown={clearHistory} disabled={isProcessing}> New </button>
			</div>
		{/if}
	</div>

		<!-- Scroll padding for bringing input to top -->
		{#if chatHistory.length > 0}
			<div class="agent-chat-scroll-padding"></div>
		{/if}
		</div>
	{/snippet}
</RightSidebar>

<style>
	.agent-panel { display: flex; flex-direction: column; min-height: 100%; color: #ddd }
	.agent-connection-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px }
	.agent-connection-row span { flex: 1 }
	.agent-error, .agent-voice-status, .agent-commands, .agent-plan { font-size: 12px; color: #aaa; padding: 0 20px; overflow-wrap: anywhere }
	.agent-action-btn[aria-pressed="true"] { background: #ffffff25 }
	.agent-sticky-header {
		flex-shrink: 0;
		position: sticky;
		background: rgba(0, 0, 0, 0.95);
		backdrop-filter: blur(10px);
		z-index: 10;
		padding: 16px 0 12px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		margin: 0 0 12px 0;
		top: 0px;
		padding-left: 20px;
		padding-right: 20px;
	}

	.agent-sticky-header::after {
		content: '';
		position: absolute;
		bottom: -12px;
		left: 0;
		right: 0;
		height: 12px;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.95), transparent);
		pointer-events: none;
		z-index: 11;
	}

	.agent-header-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.agent-header-row select {
		flex: 1;
		min-width: 0;
	}

	.agent-history-dropdown {
		position: relative;
		display: inline-block;
		flex: 1;
	}

	.agent-history-button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 6px 12px;
		color: #fff;
		font-size: 13px;
		font-weight: 500;
		letter-spacing: -0.008em;
		line-height: 1;
		font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
		-webkit-font-smoothing: antialiased;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
	}

	.agent-history-button:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-history-dropdown-content {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 4px;
		z-index: 1000;
		max-height: 320px;
		overflow-y: auto;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s ease;
		backdrop-filter: blur(10px);
		min-width: 280px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
		margin-top: 4px;
		font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	.agent-history-dropdown:hover .agent-history-dropdown-content {
		opacity: 1;
		pointer-events: auto;
	}

	.agent-history-item {
		display: flex;
		align-items: center;
		padding: 6px 8px;
		margin: 2px 0;
		border-radius: 3px;
		transition: all 0.2s ease;
	}

	.agent-history-item:hover,
	.agent-history-item.hover-xe {
		background: rgba(255, 255, 255, 0.05);
	}

	.agent-history-item.current-chat {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 4px;
	}

	.agent-history-item.current-chat .agent-history-item-main {
		cursor: default;
	}

	.agent-history-item.current-chat:hover,
	.agent-history-item.current-chat.hover-xe {
		background: rgba(255, 255, 255, 0.03);
	}

	.agent-history-item-main {
		flex: 1;
		cursor: pointer;
		min-width: 0;
	}

	.agent-history-item-title {
		font-size: 13px;
		font-weight: 500;
		letter-spacing: -0.008em;
		color: #fff;
		margin-bottom: 2px;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-history-item-meta {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
	}

	.agent-history-item-delete {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		padding: 2px;
		border-radius: 2px;
		transition: all 0.2s ease;
		margin-left: 8px;
		flex-shrink: 0;
		opacity: 0;
	}

	.agent-history-item:hover .agent-history-item-delete,
	.agent-history-item.hover-xe .agent-history-item-delete {
		opacity: 1;
	}

	.agent-history-item-delete:hover,
	.agent-history-item-delete.hover-xe {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(239, 68, 68, 0.9);
	}

	.agent-history-empty {
		padding: 16px;
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
		font-size: 11px;
	}

	.agent-history-show-all {
		margin-top: 4px;
		padding: 4px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.agent-show-all-button {
		width: 100%;
		background: transparent;
		border: none;
		padding: 6px 8px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		border-radius: 3px;
	}

	.agent-show-all-button:hover,
	.agent-show-all-button.hover-xe {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-target-selector {
		margin-bottom: 0;
	}

	.agent-selector-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.agent-context-label {
		font-size: 10px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.3px;
		flex-shrink: 0;
	}

	.agent-context-select {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 4px 8px;
		color: white;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		flex: 1;
		min-width: 0;
		max-width: 100%;
	}

	.agent-context-select:hover,
	:global(.agent-context-select.hover-xe) {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-context-select:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-chat-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding-left: 20px;
		padding-right: 20px;
	}

	.agent-chat-history {
		flex: 0 0 auto;
		padding: 16px 0;
		overflow-y: auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		scroll-behavior: smooth;
        overflow-y: visible;
	}

	.agent-chat-scroll-padding {
		height: calc(100vh - 429px);
		flex-shrink: 0;
	}

	.agent-chat-message {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.agent-chat-message.user {
		align-items: flex-end;
	}

	.agent-chat-message.assistant {
		align-items: flex-start;
	}

	.agent-chat-message-content {
		max-width: 85%;
		padding: 8px 12px;
		border-radius: 12px;
		font-size: 14px;
		line-height: 1.4;
		word-wrap: break-word;
	}

	.agent-chat-message.user .agent-chat-message-content {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.agent-chat-message.assistant .agent-chat-message-content {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.agent-chat-message.assistant.token-summary .agent-chat-message-content {
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.6);
		font-size: 11px;
		opacity: 0.8;
	}

	.agent-chat-message.error .agent-chat-message-content {
		background: rgba(239, 68, 68, 0.8);
		color: white;
	}

	.agent-chat-message-time-row {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: space-between;
	}

	.agent-chat-message-time {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.5);
		padding: 0 4px;
		flex-shrink: 0;
		padding-top: 2px;
	}

	.agent-message-actions {
		display: flex;
		gap: 4px;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.agent-message-actions.visible {
		opacity: 1;
	}

	.agent-action-btn {
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		font-size: 11px;
	}

	.agent-action-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-typing-indicator {
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.agent-typing-indicator span {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.6);
		animation: typing 1.4s infinite ease-in-out;
	}

	.agent-typing-indicator span:nth-child(1) {
		animation-delay: -0.32s;
	}

	.agent-typing-indicator span:nth-child(2) {
		animation-delay: -0.16s;
	}

	@keyframes typing {
		0%,
		80%,
		100% {
			transform: scale(0);
		}
		40% {
			transform: scale(1);
		}
	}

	.agent-bottom-sticky {
		flex-shrink: 0;
		position: sticky;
		bottom: 0;
		background: rgba(0, 0, 0, 0.95);
		backdrop-filter: blur(20px);
		z-index: 10;
	}

	.agent-chat-input-container {
		padding: 16px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding-left: 20px;
		padding-right: 20px;
	}

	.agent-model-select {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 4px 8px;
		color: white;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.agent-model-select:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-model-select:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-chat-message[class*='queued'] {
		opacity: 0.6;
	}

	.agent-chat-message.paused {
		opacity: 0.4;
		background: rgba(255, 255, 255, 0.02);
	}



	.agent-global-controls {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
		margin: 8px 0;
	}

	.agent-queue-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.agent-queue-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-queue-item-controls {
		display: flex;
		gap: 4px;
	}

	.agent-queue-item-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		padding: 2px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.agent-queue-item-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-edit-container {
		width: 100%;
	}

	.agent-edit-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 8px;
		color: white;
		font-size: 14px;
		font-family: inherit;
		resize: vertical;
		min-height: 60px;
		max-height: 200px;
		transition: all 0.2s ease;
	}

	.agent-edit-input:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.agent-edit-actions {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}

	.agent-edit-btn {
		padding: 4px 12px;
		border-radius: 4px;
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
	}

	.agent-edit-btn.save {
		background: rgba(34, 197, 94, 0.2);
		color: rgba(34, 197, 94, 0.9);
		border-color: rgba(34, 197, 94, 0.3);
	}

	.agent-edit-btn.save:hover {
		background: rgba(34, 197, 94, 0.3);
		border-color: rgba(34, 197, 94, 0.5);
	}

	.agent-edit-btn.cancel {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.7);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.agent-edit-btn.cancel:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.agent-message-text.editable {
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: background 0.2s ease;
	}

	.agent-message-text.editable:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.agent-textarea-container {
		position: relative;
	}

	.agent-conversation-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 8px 8px 27px 9px;
		color: white;
		font-size: 14px;
		font-family: inherit;
		resize: none;
		min-height: 20px;
		max-height: 120px;
		transition: all 0.2s ease;
	}

	.agent-conversation-input:focus {
		outline: none;
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-conversation-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
	}

	.agent-conversation-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.agent-send-button {
		position: absolute;
		background: transparent;
		border: none;
		border-radius: 4px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		z-index: 2;
		bottom: 11px;
		right: 5px;
	}

	.agent-stop-button {
		position: absolute;
		background: transparent;
		border: none;
		border-radius: 4px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		z-index: 2;
		bottom: 11px;
		right: 40px;
	}

	.agent-send-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.agent-send-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.agent-mic-button {
		position: absolute;
		background: transparent;
		border: none;
		border-radius: 4px;
		padding: 4px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		z-index: 2;
		bottom: 11px;
		right: 40px;
	}

	.agent-mic-button.low-opacity {
		opacity: 0.4;
	}

	.agent-mic-button:hover {
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.agent-stop-button:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-action-buttons {
		display: flex;
		justify-content: space-between;
		gap: 6px;
	}

	.agent-quick-action {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 4px 8px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.agent-quick-action:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-info-cards {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 8px 0;
	}

	.agent-info-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 12px;
		max-width: 90%;
		align-self: flex-start;
	}

	.agent-info-card.context {
		border-left: 2px solid rgba(59, 130, 246, 0.45);
		background: rgba(59, 130, 246, 0.05);
	}

	.agent-info-card.accessed {
		border-left: 2px solid rgba(34, 197, 94, 0.45);
		background: rgba(34, 197, 94, 0.05);
	}

	.agent-info-card.modified {
		border-left: 2px solid rgba(168, 85, 247, 0.45);
		background: rgba(168, 85, 247, 0.05);
	}

	.agent-info-card.denied {
		border-left: 2px solid rgba(239, 68, 68, 0.45);
		background: rgba(239, 68, 68, 0.05);
	}

	.agent-info-card.approved {
		border-left: 2px solid rgba(34, 197, 94, 0.45);
		background: rgba(34, 197, 94, 0.05);
	}

	.agent-info-card.processing {
		border-left: 2px solid rgba(251, 191, 36, 0.45);
		background: rgba(251, 191, 36, 0.05);
	}

	.agent-info-card-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.agent-info-card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.7);
		flex-shrink: 0;
	}

	.agent-info-card-favicon {
		width: 12px;
		height: 12px;
		border-radius: 2px;
	}

	.agent-info-card-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.agent-info-card-title {
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-info-card-details,
	.agent-info-card-url {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.agent-info-card.tool .agent-info-card-details {
		white-space: pre-wrap;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 10px;
		overflow: visible;
		text-overflow: unset;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		padding: 6px;
		margin-top: 4px;
		max-height: 120px;
		overflow-y: auto;
	}

	.agent-info-card-actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.agent-permission-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 10px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 1px solid transparent;
		font-weight: 500;
	}

	.agent-permission-btn.approve {
		background: rgba(34, 197, 94, 0.2);
		color: rgba(34, 197, 94, 0.9);
		border-color: rgba(34, 197, 94, 0.3);
	}

	.agent-permission-btn.approve:hover {
		background: rgba(34, 197, 94, 0.3);
		border-color: rgba(34, 197, 94, 0.5);
		color: white;
	}

	.agent-permission-btn.reject {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(239, 68, 68, 0.9);
		border-color: rgba(239, 68, 68, 0.3);
	}

	.agent-permission-btn.reject:hover {
		background: rgba(239, 68, 68, 0.3);
		border-color: rgba(239, 68, 68, 0.5);
		color: white;
	}

	.agent-info-card-result {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.agent-permission-result {
		font-size: 10px;
		font-weight: 500;
		padding: 2px 6px;
		border-radius: 3px;
		display: inline-block;
	}

	.agent-permission-result.approved {
		background: rgba(34, 197, 94, 0.2);
		color: rgba(34, 197, 94, 0.9);
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.agent-permission-result.denied {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(239, 68, 68, 0.9);
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.agent-tool-result {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.8);
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		padding: 6px;
		white-space: pre-wrap;
		max-height: 80px;
		overflow-y: auto;
	}

	.agent-chat-actions {
		padding: 12px 0 20px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}

	.agent-clear-button {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 4px 12px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 11px;
		cursor: pointer;
		transition: all 0.2s ease;
		width: auto;
		margin: 0 auto;
		display: block;
	}

	.agent-clear-button:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.agent-markdown-message {
		display: flex;
		flex-direction: column;
		width: 100%;
		margin: 16px 0;
		align-items: flex-start;
		animation: messageSlideIn 0.3s ease-out;
        /* border-top-left-radius: 0; */
	}

	.agent-message-header {
		display: flex;
		align-items: center;
		margin-bottom: 4px;
		gap: 8px;
	}

	.agent-avatar {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border: 1px solid rgba(255, 255, 255, 0.2);
        margin-left: -12px;
		position: relative;
	}

	.agent-avatar-title-overlay {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 10px;
        height: 10px;
        color: #ffffff;
        font-size: 10px;
        font-weight: 200;
        z-index: 1;
	}

	.agent-avatar :global(svg) {
		width: 20px;
		height: 20px;
	}

	/* Chat bubble style for regular assistant messages */
	.agent-markdown-message.assistant-chat {
		margin: 8px 0;
		align-items: flex-start;
        /* border-top-left-radius: 0; */
	}

	/* Document style for assistant-doc messages */
	.agent-markdown-message.assistant-doc {
		margin: 16px 0;
		align-items: flex-start;
		width: 100%;
        /* border-top-left-radius: 0; */
	}

	@keyframes messageSlideIn {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.agent-markdown-content {
		width: 100%;
		background: rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 12px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(10px);
		position: relative;
		overflow-y: auto;
		max-height: 600px;
		font-size: 12px;
		transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		min-height: 40px;
	}

	/* Chat bubble styling for regular assistant messages */
	.agent-markdown-message.assistant-chat .agent-markdown-content {
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 12px;
		padding: 8px 12px;
		font-size: 14px;
		line-height: 1.4;
		color: white;
		word-wrap: break-word;
		max-width: 85%;
	}

	/* Override markdown styles for chat bubbles to look like simple text */
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(p) {
		margin: 0;
		color: white;
		font-size: 14px;
		line-height: 1.4;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h1),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h2),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h3),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h4),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h5),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(h6) {
		font-size: 14px;
		font-weight: 600;
		margin: 0 0 4px 0;
		color: white;
		border: none;
		padding: 0;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(ul),
	.agent-markdown-message.assistant-chat .agent-markdown-content :global(ol) {
		margin: 4px 0;
		padding-left: 16px;
		font-size: 14px;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(li) {
		margin: 0;
		color: white;
		font-size: 14px;
		line-height: 1.4;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(strong) {
		color: white;
		font-weight: 600;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(em) {
		color: white;
		font-style: italic;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(code) {
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 3px;
		padding: 1px 4px;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 13px;
		color: white;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(pre) {
		background: rgba(0, 0, 0, 0.3);
		border: none;
		border-radius: 4px;
		padding: 8px;
		margin: 4px 0;
		font-size: 13px;
		line-height: 1.3;
	}

	.agent-markdown-message.assistant-chat .agent-markdown-content :global(blockquote) {
		border-left: 2px solid rgba(255, 255, 255, 0.3);
		padding-left: 8px;
		margin: 4px 0;
		color: white;
		font-style: italic;
		font-size: 14px;
	}

	/* Document styling for assistant-doc messages */
	.agent-markdown-message.assistant-doc .agent-markdown-content {
		background: rgba(0, 0, 0, 0.4);
		border-radius: 6px;
		padding: 12px;
		max-height: 450px;
		font-size: 12px;
		min-height: 40px;
		backdrop-filter: blur(10px);
	}

	/* .agent-markdown-content::before {
        content: '';
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        height: 12px;
        margin: -12px -12px 0 -12px;
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0.4), transparent);
        pointer-events: none;
        z-index: 1;
    }

    .agent-markdown-content::after {
        content: '';
        position: sticky;
        bottom: 0;
        left: 0;
        right: 0;
        height: 12px;
        margin: 0 -12px -12px -12px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.4), transparent);
        pointer-events: none;
        z-index: 1;
    } */

	.agent-markdown-streaming {
		position: relative;
		animation: smoothExpand 0.3s ease-out;
		transition: opacity 0.8s ease-in-out;
        padding: 4px;
	}

	.agent-markdown-streaming.streaming {
		/* Additional styling for streaming state if needed */
	}

	/* Animate content as it appears during streaming */
	.agent-markdown-streaming.streaming :global(*) {
		animation: fadeInContent 0.4s ease-out;
	}

	/* Animate new elements as they're added */
	.agent-markdown-streaming :global(p),
	.agent-markdown-streaming :global(h1),
	.agent-markdown-streaming :global(h2),
	.agent-markdown-streaming :global(h3),
	.agent-markdown-streaming :global(h4),
	.agent-markdown-streaming :global(h5),
	.agent-markdown-streaming :global(h6),
	.agent-markdown-streaming :global(ul),
	.agent-markdown-streaming :global(ol),
	.agent-markdown-streaming :global(li),
	.agent-markdown-streaming :global(blockquote),
	.agent-markdown-streaming :global(pre),
	.agent-markdown-streaming :global(table),
	.agent-markdown-streaming :global(code) {
		animation: fadeInElement 0.3s ease-out;
	}

	/* Animate text nodes as they appear */
	.agent-markdown-streaming.streaming :global(span),
	.agent-markdown-streaming.streaming :global(em),
	.agent-markdown-streaming.streaming :global(strong) {
		animation: fadeInText 0.2s ease-out;
	}

	@keyframes smoothExpand {
		from {
			transform: scaleY(0.98);
		}
		to {
			transform: scaleY(1);
		}
	}

	@keyframes fadeInContent {
		from {
			opacity: 0;
			transform: translateY(3px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeInElement {
		from {
			opacity: 0;
			transform: translateY(5px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fadeInText {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.agent-markdown-time-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}

	/* Markdown Content Styling */
	.agent-markdown-content :global(h1) {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 10px 0;
		color: rgba(255, 255, 255, 0.98);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 4px;
	}

	.agent-markdown-content :global(h2) {
		font-size: 14px;
		font-weight: 500;
		margin: 16px 0 8px 0;
		color: rgba(255, 255, 255, 0.95);
	}

	.agent-markdown-content :global(h3) {
		font-size: 13px;
		font-weight: 500;
		margin: 12px 0 6px 0;
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-markdown-content :global(p) {
		margin: 0 0 8px 0;
		color: rgba(255, 255, 255, 0.85);
		font-size: 12px;
	}

	.agent-markdown-content :global(ul),
	.agent-markdown-content :global(ol) {
		margin: 0 0 8px 0;
		padding-left: 16px;
		font-size: 12px;
	}

	.agent-markdown-content :global(ul) {
		list-style-type: disc;
		list-style-position: outside;
	}

	.agent-markdown-content :global(ol) {
		list-style-type: decimal;
		list-style-position: outside;
	}

	.agent-markdown-content :global(li) {
		margin: 2px 0;
		color: rgba(255, 255, 255, 0.85);
		display: list-item;
	}

	.agent-markdown-content :global(strong) {
		color: rgba(255, 255, 255, 0.95);
		font-weight: 600;
	}

	.agent-markdown-content :global(em) {
		color: rgba(255, 255, 255, 0.9);
		font-style: italic;
	}

	.agent-markdown-content :global(code) {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 3px;
		padding: 1px 4px;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 10px;
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-markdown-content :global(pre) {
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		padding: 10px;
		margin: 8px 0;
		overflow-x: auto;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 10px;
		line-height: 1.4;
	}

	.agent-markdown-content :global(pre code) {
		background: none;
		border: none;
		padding: 0;
		color: rgba(255, 255, 255, 0.9);
	}

	.agent-markdown-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin: 8px 0;
		font-size: 11px;
	}

	.agent-markdown-content :global(th),
	.agent-markdown-content :global(td) {
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 4px 8px;
		text-align: left;
	}

	.agent-markdown-content :global(th) {
		background: rgba(255, 255, 255, 0.05);
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
	}

	.agent-markdown-content :global(td) {
		color: rgba(255, 255, 255, 0.85);
	}

	.agent-markdown-content :global(blockquote) {
		border-left: 3px solid rgba(255, 255, 255, 0.2);
		padding-left: 12px;
		margin: 8px 0;
		color: rgba(255, 255, 255, 0.8);
		font-style: italic;
		font-size: 11px;
	}

	.agent-markdown-content :global(hr) {
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		margin: 16px 0;
	}

	.agent-markdown-content :global(a) {
		color: rgba(59, 130, 246, 0.9);
		text-decoration: none;
		border-bottom: 1px solid rgba(59, 130, 246, 0.3);
		transition: all 0.2s ease;
	}

	.agent-markdown-content :global(a:hover) {
		color: rgba(59, 130, 246, 1);
		border-bottom-color: rgba(59, 130, 246, 0.8);
	}

	.agent-response-divider {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 16px 0;
		padding: 8px 0;
		font-size: 9px;
		color: rgba(255, 255, 255, 0.25);
		font-weight: 400;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		position: relative;
	}

	.agent-response-divider::before,
	.agent-response-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
		margin: 0 12px;
	}
</style>

import * as acp from '@agentclientprotocol/sdk/unstable'
import { createHttpStream } from '@agentclientprotocol/sdk/experimental/http-client'
import { readAcpModelPreference, saveAcpModelPreference, validateAcpSettings } from './acp-settings.js'
import { configValues, getModelConfig } from './agent-models.js'

export function createAgentClient({ getSettings, createBrowserServer, modelStorage, createStream = createHttpStream, setupTimeout = 15000, cancelTimeout = 5000 }) {
    const state = {
        status: 'disconnected', error: '', agentName: '',
        conversations: [], activeConversationId: null, queue: [], queuePaused: false,
        processing: false, approvals: []
    }
    const listeners = new Set()
    const pendingApprovals = new Map()
    const localStreams = new Map()
    const sessionSetups = new WeakMap()
    const browserServers = new Map()
    const provider = new acp.McpOverAcpProvider()
    let agentInfo = null
    let connection = null
    let connecting = null
    let capabilities = {}
    let settings = null
    let generation = 0
    let activeTurn = null

    function snapshot() {
        return {
            ...state,
            conversations: state.conversations.map(chat => ({ ...chat, messages: chat.messages.map(message => ({ ...message })) })),
            queue: state.queue.map(item => ({ ...item })), approvals: [...state.approvals]
        }
    }

    function publish() {
        for (const listener of listeners) {
            listener(snapshot())
        }
    }

    function addMessage(chat, role, content, extra = {}) {
        const model = getModelConfig(chat.configOptions)
        const modelName = model && configValues(model).find(value => value.value === model.currentValue)?.name
        const message = { id: crypto.randomUUID(), role, content, timestamp: new Date().toISOString(),
            model: model?.currentValue || 'agent', modelName, ...extra }
        chat.messages.push(message)
        return message
    }

    function updateCurrentChatTimestamp(chat) {
        chat.timestamp = new Date().toISOString()
        const index = state.conversations.indexOf(chat)
        // Move to front
        if (index > 0) {
            state.conversations.unshift(...state.conversations.splice(index, 1))
        }
    }

    function resolveApproval(id, optionId) {
        const pending = pendingApprovals.get(id)
        if (!pending) {
            return
        }
        pendingApprovals.delete(id)
        const approval = state.approvals.find(item => item.id === id)
        const chat = state.conversations.find(item => item.id === approval?.conversationId)
        const message = chat?.messages.find(item => item.approvalId === id)
        if (message) {
            const option = approval.options.find(item => item.optionId === optionId)
            message.status = !option ? 'cancelled' : option.kind.startsWith('allow_') ? 'approved' : 'denied'
            message.content = option?.name || 'Cancelled'
        }
        state.approvals = state.approvals.filter(item => item.id !== id)
        pending.cleanup()
        pending.resolve(optionId)
        publish()
    }

    function cancelApprovals() {
        for (const id of pendingApprovals.keys()) {
            resolveApproval(id, null)
        }
    }

    function askApproval({ title, details, options, signal, conversationId }) {
        if (signal?.aborted) {
            return Promise.resolve(null)
        }
        const id = crypto.randomUUID()
        return new Promise(resolve => {
            const abort = () => resolveApproval(id, null)
            pendingApprovals.set(id, { resolve, cleanup: () => signal?.removeEventListener('abort', abort) })
            state.approvals.push({ id, title, details, options, conversationId })
            const chat = state.conversations.find(item => item.id === conversationId)
            if (chat) {
                addMessage(chat, 'approval', '', { approvalId: id, title, details, options, status: 'pending' })
            }
            signal?.addEventListener('abort', abort, { once: true })
            publish()
        })
    }

    function handleUpdate({ sessionId, update }) {
        const chat = state.conversations.find(item => item.sessionId === sessionId)
        if (!chat) {
            return
        }
        if (update.sessionUpdate === 'config_option_update') {
            chat.configOptions = update.configOptions
        } else if (update.sessionUpdate === 'current_mode_update' && chat.modes) {
            chat.modes = { ...chat.modes, currentModeId: update.currentModeId }
        } else if (!chat.loading && !activeTurn?.cancelled) {
            if (update.sessionUpdate === 'agent_message_chunk' || update.sessionUpdate === 'agent_thought_chunk') {
                const role = update.sessionUpdate === 'agent_thought_chunk' ? 'thought' : 'assistant'
                const content = update.content
                const text = content.type === 'text' ? content.text : content.type === 'resource' && content.resource?.text ? content.resource.text : `[${content.type} content]`
                const sourceMessageId = update.messageId ?? undefined
                const previous = sourceMessageId === undefined
                    ? chat.messages.findLast(message => !message.local)
                    : chat.messages.findLast(message => message.role === role && message.sourceMessageId === sourceMessageId)
                if (previous?.role === role && previous.streaming && previous.sourceMessageId === sourceMessageId) {
                    previous.content += text
                } else {
                    addMessage(chat, role, text, { sourceMessageId, streaming: true })
                }
            } else if (['tool_call', 'tool_call_update'].includes(update.sessionUpdate)) {
                let message = chat.messages.find(item => item.toolCallId === update.toolCallId)
                if (!message) {
                    message = addMessage(chat, 'tool', '', { toolCallId: update.toolCallId })
                }
                const previousContent = message.content
                Object.assign(message, Object.fromEntries(Object.entries(update).filter(([key, value]) => key !== 'content' && value != null)))
                message.content = update.content ? update.content.map(item => item.type === 'content' && item.content.type === 'text' ? item.content.text : item.type === 'diff' ? `${item.path}\n${item.newText || ''}` : `[${item.type}]`).join('\n') : previousContent
            } else if (update.sessionUpdate === 'plan') {
                chat.plan = update.entries
            } else if (update.sessionUpdate === 'available_commands_update') {
                chat.commands = update.availableCommands
            } else if (update.sessionUpdate === 'session_info_update' && update.title) {
                chat.title = update.title
            }
        }
        publish()
    }

    async function setupRequest(peer, method, params) {
        const timer = setTimeout(() => peer.close(new Error('ACP setup timed out')), setupTimeout)
        try {
            return await peer.agent.request(method, params)
        } finally {
            clearTimeout(timer)
        }
    }

    async function setSessionConfig(peer, sessionId, configId, value) {
        const result = await setupRequest(peer, acp.methods.agent.session.setConfigOption, {
            sessionId, configId, value, ...(typeof value === 'boolean' ? { type: 'boolean' } : {})
        })
        if (connection !== peer) {
            throw new Error('ACP connection changed while setting an option')
        }
        return result.configOptions
    }

    async function restoreModelPreference(chat, peer, endpoint) {
        const model = getModelConfig(chat.configOptions)
        const saved = readAcpModelPreference(endpoint, modelStorage)
        if (!model || saved == null || !configValues(model).some(option => option.value === saved)) {
            return
        }
        if (model.currentValue !== saved) {
            try {
                chat.configOptions = await setSessionConfig(peer, chat.sessionId, model.id, saved)
            } catch (error) {
                if (connection !== peer) {
                    throw error
                }
                state.error = `Could not restore the selected model: ${error.message}`
                return
            }
        }
        if (getModelConfig(chat.configOptions)?.currentValue === saved) {
            saveAcpModelPreference(endpoint, saved, modelStorage)
        }
    }

    function releaseBrowserServer(chat) {
        const server = browserServers.get(chat)
        if (!server) { return }
        browserServers.delete(chat)
        server.binding.dispose().catch(() => {})
        server.backend.close().catch(() => {})
    }

    function releaseBrowserServers() {
        for (const chat of browserServers.keys()) { releaseBrowserServer(chat) }
    }

    function disconnect(reason = '') {
        generation++
        const peer = connection
        connection = null
        connecting = null
        releaseBrowserServers()
        cancelApprovals()
        if (activeTurn) {
            activeTurn.cancelled = true
            state.queuePaused = true
        }
        peer?.close()
        state.status = 'disconnected'
        state.error = reason
        publish()
    }

    async function connect() {
        if (connection && state.status === 'connected') {
            return connection
        }
        if (connecting) {
            return connecting
        }
        settings = validateAcpSettings(getSettings())
        const currentGeneration = ++generation
        state.status = 'connecting'
        state.error = ''
        publish()
        const work = async () => {
            const app = acp.client({ name: 'darc', version: '0.4.5' })
                .onRequest(acp.methods.client.mcp.message, provider.handleRequest)
                .onNotification(acp.methods.client.session.update, ({ params }) => handleUpdate(params))
                .onRequest(acp.methods.client.session.requestPermission, async ({ params, signal }) => {
                    const chat = state.conversations.find(item => item.sessionId === params.sessionId)
                    if (!chat || activeTurn?.cancelled) {
                        return { outcome: { outcome: 'cancelled' } }
                    }
                    const optionId = await askApproval({
                        title: params.toolCall.title || 'Agent permission', details: JSON.stringify(params.toolCall, null, 2),
                        options: params.options, signal, conversationId: chat.id
                    })
                    return { outcome: optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' } }
                })
            const peer = app.connect(createStream(settings.endpoint, {
                headers: settings.token ? { Authorization: `Bearer ${settings.token}` } : {}, cookies: 'include'
            }))
            connection = peer
            peer.closed.then(() => {
                if (connection !== peer) {
                    return
                }
                connection = null
                releaseBrowserServers()
                state.status = 'disconnected'
                state.queuePaused = true
                cancelApprovals()
                state.error = 'ACP connection closed. Reconnect to continue; interrupted prompts are not resent.'
                publish()
            })
            try {
                const result = await setupRequest(peer, acp.methods.agent.initialize, {
                    protocolVersion: acp.PROTOCOL_VERSION,
                    clientCapabilities: { session: { configOptions: { boolean: {} } } }
                })
                if (result.protocolVersion !== acp.PROTOCOL_VERSION) {
                    throw new Error(`Unsupported ACP protocol version: ${result.protocolVersion}`)
                }
                if (currentGeneration !== generation) {
                    throw new Error('ACP connection configuration changed')
                }
                capabilities = result.agentCapabilities || {}
                state.agentName = result.agentInfo?.title || result.agentInfo?.name || 'ACP agent'
                agentInfo = result.agentInfo
                state.status = 'connected'
                publish()
                return peer
            } catch (error) {
                if (connection === peer) {
                    disconnect(error.message)
                } else {
                    peer.close()
                }
                throw error
            }
        }
        connecting = work()
        try {
            return await connecting
        } finally {
            if (currentGeneration === generation) {
                connecting = null
            }
        }
    }

    function newConversation() {
        if (state.processing) {
            return
        }
        const chat = {
            id: crypto.randomUUID(), title: 'New conversation', timestamp: new Date().toISOString(), sessionId: null,
            endpoint: null, generation: null, messages: [], configOptions: [], plan: [], commands: []
        }
        state.conversations.unshift(chat)
        state.activeConversationId = chat.id
        publish()
        return chat.id
    }

    async function ensureSession(chat, peer) {
        if (chat.generation === generation && chat.sessionId) {
            return
        }
        const pending = sessionSetups.get(chat)
        if (pending?.peer === peer) {
            return pending.promise
        }
        const declarations = []
        const identity = `${settings.endpoint}\n${settings.cwd}\n${settings.mcpConnectionId || ''}`
        if (chat.sessionId && (chat.endpoint !== identity || !capabilities.loadSession)) {
            throw new Error('This conversation cannot be resumed by this endpoint. Start a new conversation.')
        }
        if (settings.mcpConnectionId) {
            if (!capabilities.mcpCapabilities?.acp || !createBrowserServer) {
                throw new Error('Browser tools require MCP-over-ACP. Connect through the ACP proxy for HTTP-only agents.')
            }
            releaseBrowserServer(chat)
            const backend = createBrowserServer(settings, agentInfo)
            const binding = provider.registerServer(peer.agent, { name: backend.name, handler: backend.handler })
            browserServers.set(chat, { backend, binding })
            backend.signal?.addEventListener('abort', () => releaseBrowserServer(chat), { once: true })
            declarations.push(binding.declaration)
        }
        const isNewSession = !chat.sessionId
        const endpoint = settings.endpoint
        chat.loading = !isNewSession
        const setup = { peer }
        setup.promise = setupRequest(peer, chat.sessionId ? acp.methods.agent.session.load : acp.methods.agent.session.new, {
            ...(chat.sessionId ? { sessionId: chat.sessionId } : {}), cwd: settings.cwd, mcpServers: declarations
        }).then(async response => {
            if (connection !== peer) {
                throw new Error('ACP connection changed while opening the conversation')
            }
            chat.sessionId = chat.sessionId || response.sessionId
            chat.endpoint = identity
            chat.configOptions = response?.configOptions || []
            chat.modes = response?.modes
            if (isNewSession) {
                await restoreModelPreference(chat, peer, endpoint)
            }
            if (connection !== peer) {
                throw new Error('ACP connection changed while opening the conversation')
            }
            chat.generation = generation
            publish()
        }).catch(error => {
            releaseBrowserServer(chat)
            throw error
        }).finally(() => {
            if (sessionSetups.get(chat) === setup) {
                sessionSetups.delete(chat)
                chat.loading = false
            }
        })
        sessionSetups.set(chat, setup)
        return setup.promise
    }

    async function drainQueue() {
        if (state.processing || state.queuePaused) {
            return
        }
        state.processing = true
        publish()
        try {
            while (!state.queuePaused) {
                const item = state.queue.find(item => !item.paused)
                if (!item) {
                    break
                }
                state.queue = state.queue.filter(entry => entry.id !== item.id)
                const chat = state.conversations.find(entry => entry.id === item.conversationId)
                const turn = { chat, cancelled: false }
                activeTurn = turn
                try {
                    const peer = await connect()
                    chat.context = item.context
                    await ensureSession(chat, peer)
                    if (turn.cancelled) {
                        break
                    }
                    for (const message of chat.messages) {
                        if (!message.local) {
                            message.streaming = false
                        }
                    }
                    addMessage(chat, 'user', item.text)
                    if (chat.title === 'New conversation') {
                        chat.title = item.text.slice(0, 50)
                    }
                    publish()
                    const result = await peer.agent.request(acp.methods.agent.session.prompt, {
                        sessionId: chat.sessionId,
                        prompt: [{ type: 'text', text: `Selected Darc browser context:\n${JSON.stringify(item.context)}` }, { type: 'text', text: item.text }]
                    })
                    chat.stopReason = result.stopReason
                    const usage = result.usage
                    if (!turn.cancelled && Number.isFinite(usage?.inputTokens) && Number.isFinite(usage?.outputTokens)) {
                        addMessage(chat, 'response-divider', `${usage.inputTokens} prompt • ${usage.outputTokens} completion`, { usage })
                    }
                } catch (error) {
                    state.error = error.message
                    addMessage(chat, 'error', turn.cancelled ? 'Turn cancelled. Already completed actions cannot be undone.' : error.message)
                    state.queuePaused = true
                } finally {
                    clearTimeout(turn.cancelTimer)
                    cancelApprovals()
                    for (const message of chat.messages) {
                        if (!message.local) {
                            message.streaming = false
                        }
                    }
                    activeTurn = null
                    publish()
                }
            }
        } finally {
            state.processing = false
            publish()
        }
    }

    function stop() {
        if (state.processing || activeTurn) { state.queuePaused = true }
        for (const stream of localStreams.values()) {
            stream.cancelled = true
            stream.reply.streaming = false
        }
        cancelApprovals()
        const turn = activeTurn
        if (turn) {
            browserServers.get(turn.chat)?.backend.cancelPending?.()
            turn.cancelled = true
            if (turn.chat.sessionId && connection) {
                connection.agent.notify(acp.methods.agent.session.cancel, { sessionId: turn.chat.sessionId }).catch(error => disconnect(error.message))
            }
            turn.cancelTimer = setTimeout(() => disconnect('The agent did not finish cancellation; reconnect before continuing.'), cancelTimeout)
        }
        publish()
    }

    return {
        subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
        get state() { return snapshot() },
        connect, disconnect, newConversation, stop,
        async prepareConversation() {
            const peer = await connect()
            const id = state.activeConversationId || newConversation()
            const chat = state.conversations.find(item => item.id === id)
            await ensureSession(chat, peer)
        },
        configure() {
            const processing = state.processing
            stop()
            disconnect('Connection settings changed. Connect to use the new endpoint.')
            state.queue = []
            state.queuePaused = processing
            publish()
        },
        selectConversation(id) {
            if (!state.processing && state.conversations.some(chat => chat.id === id)) {
                state.activeConversationId = id
                publish()
            }
        },
        submit(text, context) {
            if (!text.trim()) {
                return
            }
            if (!state.activeConversationId) {
                newConversation()
            }
            state.queue.push({ id: crypto.randomUUID(), text: text.trim(), context: structuredClone(context), conversationId: state.activeConversationId, paused: false })
            publish()
            return drainQueue()
        },
        async addLocalExchange(prompt, { role, content = '', chunks, ...extra }) {
            if (!state.activeConversationId) {
                newConversation()
            }
            const chat = state.conversations.find(item => item.id === state.activeConversationId)
            addMessage(chat, 'user', prompt, { local: true })
            const reply = addMessage(chat, role, content, { ...extra, local: true, streaming: !!chunks })
            publish()
            if (chunks) {
                const stream = { reply, cancelled: false }
                localStreams.set(reply.id, stream)
                try {
                    for await (const chunk of chunks) {
                        if (stream.cancelled) { break }
                        reply.content += chunk
                        publish()
                    }
                } finally {
                    localStreams.delete(reply.id)
                    // Streaming complete
                    reply.streaming = false
                    updateCurrentChatTimestamp(chat)
                    publish()
                }
            }
        },
        pauseQueue() { state.queuePaused = true; publish() },
        resumeQueue() { state.queuePaused = false; publish(); return drainQueue() },
        removeQueued(id) { state.queue = state.queue.filter(item => item.id !== id); publish() },
        updateQueued(id, text) {
            const item = state.queue.find(item => item.id === id)
            if (item && text.trim()) { item.text = text.trim(); publish() }
        },
        toggleQueued(id) {
            const item = state.queue.find(item => item.id === id)
            if (item) { item.paused = !item.paused; publish() }
            return drainQueue()
        },
        editMessage(id, content) {
            const chat = state.conversations.find(item => item.id === state.activeConversationId)
            const message = chat?.messages.find(item => item.id === id && item.role === 'user')
            if (message && !state.processing && content.trim()) { message.content = content; publish() }
        },
        rateMessage(id, feedback) {
            const chat = state.conversations.find(item => item.id === state.activeConversationId)
            const message = chat?.messages.find(item => item.id === id && ['assistant', 'assistant-doc'].includes(item.role))
            if (message && ['good', 'poor'].includes(feedback)) { message.feedback = message.feedback === feedback ? null : feedback; publish() }
        },
        answer(id, optionId) {
            const approval = state.approvals.find(item => item.id === id)
            if (approval?.options.some(option => option.optionId === optionId)) {
                resolveApproval(id, optionId)
            }
        },
        async setConfig(configId, value) {
            const chat = state.conversations.find(item => item.id === state.activeConversationId)
            if (!chat?.sessionId || state.processing) { return }
            try {
                const peer = await connect()
                await ensureSession(chat, peer)
                chat.configOptions = await setSessionConfig(peer, chat.sessionId, configId, value)
                const model = getModelConfig(chat.configOptions)
                if (model?.id === configId && model.currentValue === value) {
                    saveAcpModelPreference(settings.endpoint, value, modelStorage)
                }
            } catch (error) {
                state.error = error.message
            }
            publish()
        },
        async setMode(modeId) {
            const chat = state.conversations.find(item => item.id === state.activeConversationId)
            if (!chat?.sessionId || state.processing) { return }
            try {
                const peer = await connect()
                await ensureSession(chat, peer)
                await setupRequest(peer, acp.methods.agent.session.setMode, { sessionId: chat.sessionId, modeId })
                chat.modes = { ...chat.modes, currentModeId: modeId }
            } catch (error) {
                state.error = error.message
            }
            publish()
        }
    }
}

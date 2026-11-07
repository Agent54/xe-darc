import * as acp from '@agentclientprotocol/sdk/unstable'
import { createHttpStream } from '@agentclientprotocol/sdk/experimental/http-client'
import { validateAcpSettings } from './acp-settings.js'

export function createAgentClient({ getSettings, createBrowserServer, createStream = createHttpStream, setupTimeout = 15000, cancelTimeout = 5000 }) {
    const state = {
        status: 'disconnected', error: '', agentName: '', browserTools: false,
        conversations: [], activeConversationId: null, queue: [], queuePaused: false,
        processing: false, approvals: []
    }
    const listeners = new Set()
    const pendingApprovals = new Map()
    let connection = null
    let connecting = null
    let capabilities = {}
    let settings = null
    let provider = null
    let generation = 0
    let activeTurn = null

    function snapshot() {
        return {
            ...state,
            conversations: state.conversations.map(({ binding, backend, ...chat }) => ({ ...chat, messages: chat.messages.map(message => ({ ...message })) })),
            queue: state.queue.map(item => ({ ...item })), approvals: [...state.approvals]
        }
    }

    function publish() {
        for (const listener of listeners) {
            listener(snapshot())
        }
    }

    function addMessage(chat, role, content, extra = {}) {
        const message = { id: crypto.randomUUID(), role, content, ...extra }
        chat.messages.push(message)
        return message
    }

    function resolveApproval(id, optionId) {
        const pending = pendingApprovals.get(id)
        if (!pending) {
            return
        }
        pendingApprovals.delete(id)
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
            if (['agent_message_chunk', 'agent_thought_chunk', 'user_message_chunk'].includes(update.sessionUpdate)) {
                const role = update.sessionUpdate === 'agent_thought_chunk' ? 'thought' : update.sessionUpdate === 'user_message_chunk' ? 'user' : 'assistant'
                const content = update.content
                const text = content.type === 'text' ? content.text : content.type === 'resource' && content.resource?.text ? content.resource.text : `[${content.type} content]`
                const previous = chat.messages.at(-1)
                if (previous?.role === role && previous.streaming) {
                    previous.content += text
                } else if (role !== 'user') {
                    addMessage(chat, role, text, { streaming: true })
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

    function releaseBindings() {
        for (const chat of state.conversations) {
            chat.binding?.dispose().catch(() => {})
            chat.backend?.close().catch(() => {})
            chat.binding = null
            chat.backend = null
        }
    }

    function disconnect(reason = '') {
        generation++
        const peer = connection
        connection = null
        connecting = null
        cancelApprovals()
        releaseBindings()
        if (activeTurn) {
            activeTurn.cancelled = true
            state.queuePaused = true
        }
        peer?.close()
        state.status = 'disconnected'
        state.browserTools = false
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
            provider = new acp.McpOverAcpProvider()
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
                state.status = 'disconnected'
                state.browserTools = false
                state.queuePaused = true
                cancelApprovals()
                releaseBindings()
                state.error = 'ACP connection closed. Reconnect to continue; interrupted prompts are not resent.'
                publish()
            })
            try {
                const result = await setupRequest(peer, acp.methods.agent.initialize, { protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} })
                if (result.protocolVersion !== acp.PROTOCOL_VERSION) {
                    throw new Error(`Unsupported ACP protocol version: ${result.protocolVersion}`)
                }
                if (currentGeneration !== generation) {
                    throw new Error('ACP connection configuration changed')
                }
                capabilities = result.agentCapabilities || {}
                state.agentName = result.agentInfo?.title || result.agentInfo?.name || 'ACP agent'
                state.browserTools = capabilities.mcpCapabilities?.acp === true
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
            id: crypto.randomUUID(), title: 'New conversation', sessionId: null,
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
        const identity = `${settings.endpoint}\n${settings.cwd}`
        if (chat.sessionId && (chat.endpoint !== identity || !capabilities.loadSession)) {
            throw new Error('This conversation cannot be resumed by this endpoint. Start a new conversation.')
        }
        let declarations = []
        if (state.browserTools && createBrowserServer) {
            chat.backend = createBrowserServer({
                getContext: () => chat.context,
                approve: ({ title, details, signal }) => askApproval({
                    title, details, signal, conversationId: chat.id,
                    options: [{ optionId: 'allow', name: 'Allow once' }, { optionId: 'deny', name: 'Deny' }]
                }).then(value => value === 'allow')
            })
            chat.binding = provider.registerServer(peer.agent, { name: 'darc-browser', handler: chat.backend.handler })
            declarations = [chat.binding.declaration]
        }
        chat.loading = !!chat.sessionId
        try {
            const response = await setupRequest(peer, chat.sessionId ? acp.methods.agent.session.load : acp.methods.agent.session.new, {
                ...(chat.sessionId ? { sessionId: chat.sessionId } : {}), cwd: settings.cwd, mcpServers: declarations
            })
            chat.sessionId = chat.sessionId || response.sessionId
            chat.endpoint = identity
            chat.generation = generation
            chat.configOptions = response?.configOptions || []
            chat.modes = response?.modes
            publish()
        } catch (error) {
            await chat.binding?.dispose().catch(() => {})
            await chat.backend?.close().catch(() => {})
            chat.binding = null
            chat.backend = null
            throw error
        } finally {
            chat.loading = false
        }
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
                        message.streaming = false
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
                } catch (error) {
                    state.error = error.message
                    addMessage(chat, 'error', turn.cancelled ? 'Turn cancelled. Already completed actions cannot be undone.' : error.message)
                    state.queuePaused = true
                } finally {
                    clearTimeout(turn.cancelTimer)
                    cancelApprovals()
                    for (const message of chat.messages) {
                        message.streaming = false
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
        state.queuePaused = true
        cancelApprovals()
        const turn = activeTurn
        if (turn) {
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
        configure() { stop(); disconnect('Connection settings changed. Connect to use the new endpoint.'); state.queue = []; publish() },
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
                const result = await setupRequest(peer, acp.methods.agent.session.setConfigOption, { sessionId: chat.sessionId, configId, value, ...(typeof value === 'boolean' ? { type: 'boolean' } : {}) })
                chat.configOptions = result.configOptions
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

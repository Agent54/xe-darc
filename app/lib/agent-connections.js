import { createAgentClient } from './acp-client.js'
import { readAcpConnections, readAcpSettings, saveAcpSettings, selectAcpConnection, removeAcpSettings } from './acp-settings.js'

export function createAgentConnections({ storage, session, getWindowId, mcp, createBrowserServer, createClient = createAgentClient }) {
    const clients = new Map()
    const listeners = new Set()
    let connections = []
    let selectedId = ''
    let conversationScope = null
    let bindingsKey
    let conversationBindings
    const keyFor = id => `${getWindowId() || ''}:${id}`

    function bindings() {
        const key = `acpConversations:${getWindowId()}:tabGroups`
        if (bindingsKey !== key) {
            conversationBindings = JSON.parse(storage.getItem(key) || '{}')
            bindingsKey = key
        }
        return conversationBindings
    }

    function rememberConversation() {
        if (!conversationScope?.key || !getWindowId()) { return }
        const conversationId = clientFor(selectedId).state.activeConversationId
        if (!conversationId) { return }
        const saved = bindings()
        const previous = saved[conversationScope.key]
        if (previous?.connectionId === selectedId && previous.conversationId === conversationId) { return }
        saved[conversationScope.key] = { connectionId: selectedId, conversationId }
        storage.setItem(bindingsKey, JSON.stringify(saved))
    }

    function restoreScopedConversation(connectionId) {
        if (!conversationScope) { return }
        const saved = bindings()
        // A standalone tab acquires a group ID when another tab joins it.
        const keys = [conversationScope.key, ...conversationScope.tabKeys].filter(Boolean)
        for (const key of keys) {
            const binding = saved[key]
            if (!binding || (connectionId !== undefined && binding.connectionId !== connectionId) ||
                (!binding.connectionId && selectedId) ||
                (binding.connectionId && !connections.some(entry => entry.id === binding.connectionId))) { continue }
            const client = clientFor(binding.connectionId)
            if (!client.state.conversations.some(chat => chat.id === binding.conversationId)) { continue }
            if (selectedId !== binding.connectionId) {
                selectAcpConnection(binding.connectionId, storage, session, getWindowId())
                refresh()
            }
            client.selectConversation(binding.conversationId)
            if (key !== conversationScope.key) {
                saved[conversationScope.key] = binding
                delete saved[key]
                storage.setItem(bindingsKey, JSON.stringify(saved))
            }
            return
        }
        const client = clientFor(selectedId)
        const state = client.state
        const chat = state.conversations.find(chat => chat.id === state.activeConversationId)
        if (chat && (chat.messages.length || state.processingConversationId === chat.id || state.queue.some(item => item.conversationId === chat.id))) {
            client.newConversation()
        }
    }

    function clientFor(id) {
        const key = keyFor(id)
        if (clients.has(key)) { return clients.get(key).client }
        const windowId = getWindowId()
        const storageKey = id ? `acpConversations:${windowId}:${id}` : `acpConversations:${windowId}`
        const legacyKey = `acpConversations:${windowId}`
        if (id && id === selectedId && !storage.getItem(storageKey) && storage.getItem(legacyKey)) {
            let value = storage.getItem(legacyKey)
            try {
                const saved = JSON.parse(value)
                const config = connections.find(entry => entry.id === id)
                const prefix = `${config.endpoint}\n${config.cwd}\n`
                // Conversations without browser tools gain this connection's identity on upgrade.
                for (const chat of saved.conversations || []) {
                    if (chat.endpoint === prefix) { chat.endpoint = prefix + id }
                }
                value = JSON.stringify(saved)
            } catch { /* The client's existing restore path reports invalid saved conversations. */ }
            storage.setItem(storageKey, value)
            storage.removeItem(legacyKey)
        }
        const client = createClient({
            getSettings: () => {
                if (!id) { return { endpoint: '', cwd: '/', token: '' } }
                const config = readAcpConnections(storage, session, windowId).find(entry => entry.id === id)
                if (!config) { throw new Error('Agent connection removed') }
                return config
            },
            modelStorage: storage, conversationStorage: storage,
            getConversationKey: () => windowId ? storageKey : null,
            createBrowserServer
        })
        const runtime = { client, state: client.state }
        clients.set(key, runtime)
        runtime.unsubscribe = client.subscribe(state => { runtime.state = state; publish() })
        return client
    }

    function snapshot() {
        clientFor(selectedId)
        return { ...clients.get(keyFor(selectedId)).state, connectionId: selectedId,
            connections: connections.map(({ token: _token, ...connection }) => {
                const state = clients.get(keyFor(connection.id))?.state
                const chat = state?.conversations.find(chat => chat.id === state.activeConversationId)
                return { ...connection, agentName: state?.agentName, configOptions: chat?.configOptions || [],
                    processing: state?.processing || false, approvals: state?.approvals.length || 0 }
            }) }
    }

    function publish() {
        if (!listeners.size) { return }
        const state = snapshot()
        for (const listener of listeners) { listener(state) }
    }

    function refresh() {
        connections = readAcpConnections(storage, session, getWindowId())
        selectedId = readAcpSettings(storage, session, getWindowId()).id || ''
        publish()
    }

    refresh()
    const commands = ['connect', 'disconnect', 'prepareConversation', 'configure', 'newConversation', 'stop',
        'pauseQueue', 'resumeQueue', 'removeQueued', 'moveQueued', 'updateQueued', 'toggleQueued', 'editMessage', 'rateMessage', 'answer', 'setConfig', 'setMode']
    return {
        ...Object.fromEntries(commands.map(name => [name, (...args) => clientFor(selectedId)[name](...args)])),
        setConversationScope(scope) {
            const previous = conversationScope
            conversationScope = scope
            if (scope && (!previous || previous.key !== scope.key)) {
                restoreScopedConversation()
            }
        },
        selectConversation(id) {
            const client = clientFor(selectedId)
            client.selectConversation(id)
            const state = client.state
            const chat = state.conversations.find(chat => chat.id === id)
            if (chat && state.activeConversationId === id &&
                (chat.messages.length || state.processingConversationId === id || state.queue.some(item => item.conversationId === id))) {
                rememberConversation()
            }
        },
        submit(text, options) {
            const result = clientFor(selectedId).submit(text, options)
            if (text.trim() || options?.attachments?.length) { rememberConversation() }
            return result
        },
        addLocalExchange(...args) {
            const result = clientFor(selectedId).addLocalExchange(...args)
            rememberConversation()
            return result
        },
        get state() { return snapshot() },
        subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
        start() {
            refresh()
            mcp.sync()
            for (const entry of connections) { clientFor(entry.id).start() }
        },
        suspend() { for (const { client } of clients.values()) { client.suspend() } },
        selectConnection(id) {
            selectAcpConnection(id, storage, session, getWindowId())
            refresh()
            restoreScopedConversation(id)
            clientFor(id).start()
        },
        saveConnection(settings) {
            const previous = connections.find(entry => entry.id === settings.id)
            const draft = !connections.length && clients.get(keyFor(''))
            if (draft) { draft.client.suspend(); draft.unsubscribe(); clients.delete(keyFor('')) }
            const config = saveAcpSettings(settings, storage, session, getWindowId())
            mcp.sync()
            refresh()
            if (previous && ['endpoint', 'cwd', 'token'].some(key => previous[key] !== config[key])) { clientFor(config.id).configure() }
            return config
        },
        async removeConnection(id = selectedId) {
            const key = keyFor(id)
            const runtime = clients.get(key)
            runtime?.client.disconnect()
            await mcp.remove(id)
            runtime?.unsubscribe()
            clients.delete(key)
            removeAcpSettings(id, storage, getWindowId())
            refresh()
        }
    }
}

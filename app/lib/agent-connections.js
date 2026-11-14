import { createAgentClient } from './acp-client.js'
import { readAcpConnections, readAcpSettings, saveAcpSettings, selectAcpConnection, removeAcpSettings } from './acp-settings.js'

export function createAgentConnections({ storage, session, getWindowId, mcp, createBrowserServer, createClient = createAgentClient }) {
    const clients = new Map()
    const listeners = new Set()
    let connections = []
    let selectedId = ''
    const keyFor = id => `${getWindowId() || ''}:${id}`

    function clientFor(id) {
        const key = keyFor(id)
        if (clients.has(key)) { return clients.get(key).client }
        const windowId = getWindowId()
        const storageKey = id ? `acpConversations:${windowId}:${id}` : `acpConversations:${windowId}`
        const legacyKey = `acpConversations:${windowId}`
        if (id && id === selectedId && !storage.getItem(storageKey) && storage.getItem(legacyKey)) {
            const saved = JSON.parse(storage.getItem(legacyKey))
            const config = connections.find(entry => entry.id === id)
            const prefix = `${config.endpoint}\n${config.cwd}\n`
            // Conversations without browser tools gain this connection's identity on upgrade.
            for (const chat of saved.conversations || []) {
                if (chat.endpoint === prefix) { chat.endpoint = prefix + id }
            }
            storage.setItem(storageKey, JSON.stringify(saved))
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
        const runtime = { client }
        clients.set(key, runtime)
        runtime.unsubscribe = client.subscribe(() => publish())
        return client
    }

    function snapshot() {
        return { ...clientFor(selectedId).state, connectionId: selectedId,
            connections: connections.map(({ token: _token, ...connection }) => connection) }
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
    const commands = ['connect', 'disconnect', 'prepareConversation', 'configure', 'newConversation', 'stop', 'selectConversation',
        'submit', 'addLocalExchange', 'pauseQueue', 'resumeQueue', 'removeQueued', 'updateQueued', 'toggleQueued', 'editMessage', 'rateMessage', 'answer', 'setConfig', 'setMode']
    return {
        ...Object.fromEntries(commands.map(name => [name, (...args) => clientFor(selectedId)[name](...args)])),
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

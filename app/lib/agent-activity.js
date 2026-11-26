import { writable } from 'svelte/store'

export function createAgentActivity() {
    const pulses = writable(0)
    const access = writable({ tabs: new Set(), spaces: new Set(), calls: 0 })
    const calls = new Map()
    const publish = () => access.set({
        tabs: new Set([...calls.values()].flatMap(call => [...call.tabs])),
        spaces: new Set([...calls.values()].flatMap(call => [...call.spaces])),
        calls: calls.size
    })
    const pulse = () => pulses.update(value => value + 1)
    return {
        pulses: { subscribe: pulses.subscribe }, access: { subscribe: access.subscribe }, pulse,
        begin(signal) {
            pulse()
            const id = Symbol()
            const call = { tabs: new Set(), spaces: new Set() }
            const finish = () => {
                signal?.removeEventListener('abort', finish)
                if (calls.delete(id)) { publish() }
            }
            if (!signal?.aborted) {
                calls.set(id, call)
                signal?.addEventListener('abort', finish, { once: true })
                publish()
            }
            return {
                touch({ tabs = [], spaces = [] }) {
                    if (!calls.has(id)) { return }
                    for (const tab of tabs) { call.tabs.add(tab) }
                    for (const space of spaces) { call.spaces.add(space) }
                    publish()
                },
                finish
            }
        }
    }
}

export const agentActivity = createAgentActivity()
export const mcpAccess = agentActivity.access

export function flashAgentActivity(node) {
    let initial = true
    let animation
    const unsubscribe = agentActivity.pulses.subscribe(() => {
        if (initial) { initial = false; return }
        animation?.cancel()
        animation = node.animate([
            { opacity: 1, boxShadow: '0 0 7px #5aaaff, 0 0 13px #398fff80' },
            { opacity: 0.17, boxShadow: '0 0 0 transparent' }
        ], { duration: 420, easing: 'ease-out' })
    })
    return { destroy() { unsubscribe(); animation?.cancel() } }
}

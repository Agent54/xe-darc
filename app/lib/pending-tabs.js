import { getTabTitle } from './tab-title.js'
import { tabGroupMetadataId } from './tab-groups.js'

export const snoozeHorizon = 2 * 60 * 60 * 1000
export const pendingPollInterval = 60 * 1000

export function snoozeTime(option, now = Date.now()) {
    if (option === '1h') return now + 60 * 60 * 1000
    if (option === '4h') return now + 4 * 60 * 60 * 1000
    const date = new Date(now)
    if (option === 'tomorrow') date.setDate(date.getDate() + 1)
    else if (option === 'week') date.setDate(date.getDate() + 7)
    else return null
    date.setHours(9, 0, 0, 0)
    return date.getTime()
}

// An action ID keeps independently closed/snoozed members out of whole-group entries.
export function getArchivedTabItems(tabs = [], docs = {}) {
    const entries = new Map()
    for (const tab of tabs) {
        const batchId = tab.pending?.batchId || tab.closedBatchId
        const key = batchId && tab.tabGroupId ? `${tab.spaceId}:${tab.tabGroupId}:${batchId}` : tab.id
        if (!entries.has(key)) entries.set(key, { id: key, tabs: [], spaceId: tab.spaceId })
        entries.get(key).tabs.push(tab)
    }
    return [...entries.values()].map(entry => {
        entry.tabs.sort((a, b) => (a.tabGroupOrder ?? a.order ?? 0) - (b.tabGroupOrder ?? b.order ?? 0))
        entry.tabGroupId = entry.tabs.length > 1 ? entry.tabs[0].tabGroupId : null
        entry.metadata = entry.tabGroupId ? docs[tabGroupMetadataId(entry.tabGroupId)] : null
        entry.title = entry.metadata?.name?.trim() || getTabTitle(entry.tabs[0])
        return entry
    }).sort((a, b) => Math.max(...b.tabs.map(tab => tab.pending?.createdAt || tab.closedAt || tab.modified || 0)) -
        Math.max(...a.tabs.map(tab => tab.pending?.createdAt || tab.closedAt || tab.modified || 0)))
}

// Every source (startup, sync, polling, timers) uses the same refresh path.
export function createPendingScheduler({ read, wake, onError = console.error, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
    const timers = new Map()
    let running = null
    let again = false
    let stopped = false

    async function scan() {
        do {
            again = false
            const tabs = await read()
            if (stopped) return
            for (const timer of timers.values()) clearTimer(timer)
            timers.clear()
            const timestamp = now()
            for (const tab of tabs) {
                const wakeAt = tab.pending?.wakeAt
                if (!Number.isFinite(wakeAt) || wakeAt > timestamp + snoozeHorizon) continue
                if (wakeAt <= timestamp) await wake(tab)
                else timers.set(tab.id || tab._id, setTimer(() => { refresh() }, wakeAt - timestamp))
            }
        } while (again && !stopped)
    }

    function refresh() {
        if (stopped) return Promise.resolve()
        if (running) { again = true; return running }
        running = scan().catch(onError).finally(() => { running = null })
        return running
    }

    return {
        refresh,
        stop() {
            stopped = true
            for (const timer of timers.values()) clearTimer(timer)
            timers.clear()
        }
    }
}

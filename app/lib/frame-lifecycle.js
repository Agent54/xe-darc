import { getPinScope, tabGroupKey } from './tab-groups.js'

export const releasedFrames = new WeakSet()

export function isLiveFrameTab(tab) {
    return !!tab && !tab._deleted && (!tab.archive || tab.archive === 'preview')
}

function framePlacement(tab, update) {
    const value = key => Object.hasOwn(update, key) ? update[key] : tab[key]
    return {
        id: tab.id, spaceId: value('spaceId'), pinned: value('pinned'), pinScope: value('pinScope'),
        tabGroupId: value('tabGroupId'), tabGroupOrder: value('tabGroupOrder'),
        pinOrder: value('pinOrder'), order: value('order')
    }
}

function changesFramePlacement(tab, update) {
    const next = framePlacement(tab, update)
    if (tab.spaceId !== next.spaceId || (tab.tabGroupId || null) !== (next.tabGroupId || null) ||
        (tab.pinned || null) !== (next.pinned || null)) {
        return true
    }
    if (tab.pinned) {
        return getPinScope(tab) !== getPinScope(next) ||
            (tab.pinOrder ?? tab.order ?? 0) !== (next.pinOrder ?? next.order ?? 0)
    }
    return (tab.tabGroupOrder ?? tab.order ?? 0) !== (next.tabGroupOrder ?? next.order ?? 0)
}

function frameLists(items, updates) {
    const spaces = new Map()
    const lists = []
    for (const item of items.values()) {
        if (item.type !== 'tab' || item.archive || item.preview || item.lightbox) {
            continue
        }
        const update = updates?.get(item.id)
        const tab = update ? framePlacement(item, update) : item
        const panel = tab.pinned === 'normal' ? 'center' : tab.pinned === 'menu' ? 'menu' : tab.pinned ? tab.pinned === 'right' ? 'right' : 'left' : 'center'
        const groupKey = tab.pinned === 'normal' || tab.pinned === 'menu' ? `pin:${tab.id}` : tab.pinned ? null : tabGroupKey(tab)
        const spaceId = tab.pinned ? null : tab.spaceId
        if (!spaces.has(spaceId)) {
            spaces.set(spaceId, new Map())
        }
        const panels = spaces.get(spaceId)
        if (!panels.has(panel)) {
            panels.set(panel, new Map())
        }
        const groups = panels.get(panel)
        if (!groups.has(groupKey)) {
            const list = { spaceId, panel, groupKey, tabs: [] }
            groups.set(groupKey, list)
            lists.push(list)
        }
        groups.get(groupKey).tabs.push(tab)
    }
    for (const list of lists) {
        if (updates || list.panel !== 'center') {
            list.tabs.sort((a, b) => (list.panel === 'center'
                ? (a.tabGroupOrder ?? a.order ?? 0) - (b.tabGroupOrder ?? b.order ?? 0)
                : Number(getPinScope(a) === 'global') - Number(getPinScope(b) === 'global') ||
                    (a.pinOrder ?? a.order ?? 0) - (b.pinOrder ?? b.order ?? 0)) || a.id.localeCompare(b.id))
        }
    }
    return lists
}

export function getFrameMoveIds({ docs, frames }, updates, groups) {
    const moved = new Set()
    const relevant = updates.filter(update => docs[update.id] && changesFramePlacement(docs[update.id], update))
    if (!relevant.length) {
        return moved
    }
    const items = new Map()
    for (const group of new Set(groups)) {
        for (const tab of group?.tabs || []) {
            if (docs[tab.id]) {
                items.set(tab.id, docs[tab.id])
            }
        }
    }
    for (const update of relevant) {
        items.set(update.id, docs[update.id])
    }
    const mounted = id => {
        const entry = frames[id]
        return entry?.frame && entry.wrapper?.isConnected && entry.frame.parentNode === entry.wrapper
    }
    if (relevant.some(update => docs[update.id].pinned || update.pinned)) {
        for (const id in frames) {
            if (mounted(id) && docs[id]?.pinned) {
                items.set(id, docs[id])
            }
        }
    }
    if (![...items.keys()].some(mounted)) {
        return moved
    }
    const byId = new Map(updates.map(update => [update.id, update]))
    const before = frameLists(items)
    const after = frameLists(items, byId)
    const beforeById = new Map(before.flatMap(list => list.tabs.map(tab => [tab.id, list])))
    const afterById = new Map(after.flatMap(list => list.tabs.map(tab => [tab.id, list])))
    const pairs = new Map(before.map(list => [list, new Map()]))
    for (const list of before) {
        for (const tab of list.tabs) {
            const other = afterById.get(tab.id)
            if (!other) {
                continue
            }
            const destinations = pairs.get(list)
            if (!destinations.has(other)) {
                destinations.set(other, { before: [], after: [] })
            }
            destinations.get(other).before.push(tab.id)
        }
    }
    for (const list of after) {
        for (const tab of list.tabs) {
            pairs.get(beforeById.get(tab.id))?.get(list)?.after.push(tab.id)
        }
    }
    for (const [list, destinations] of pairs) {
        for (const [other, ids] of destinations) {
            let start = 0
            let end = ids.before.length
            const sameMembers = end === list.tabs.length && end === other.tabs.length
            if (list.spaceId === other.spaceId && list.panel === other.panel &&
                (list.groupKey === other.groupKey || sameMembers)) {
                while (start < end && ids.before[start] === ids.after[start]) {
                    start++
                }
                while (end > start && ids.before[end - 1] === ids.after[end - 1]) {
                    end--
                }
            }
            // Svelte can move either neighbor in this range, regardless of whose rank changed.
            for (let index = start; index < end; index++) {
                const id = ids.before[index]
                if (mounted(id)) {
                    moved.add(id)
                }
            }
        }
    }
    return moved
}

export function registerFrameWrapper(data, tabId, wrapper, anchor, beforeAttach) {
    const frameData = data.frames[tabId] ??= {}
    const spaceId = data.docs[tabId]?.spaceId
    const owns = () => data.frames[tabId] === frameData && frameData.attach === attach
    function attach() {
        const tab = data.docs[tabId]
        const frame = frameData.frame
        if (!owns() || !isLiveFrameTab(tab) || tab.spaceId !== spaceId ||
            frameData.wrapper !== wrapper || !frame || releasedFrames.has(frame) || !wrapper.isConnected || anchor.parentNode !== wrapper) {
            return false
        }
        if (frame.parentNode !== wrapper) {
            try {
                beforeAttach(frame)
                if (frame.isConnected) {
                    wrapper.moveBefore(frame, anchor)
                } else {
                    wrapper.insertBefore(frame, anchor)
                }
            } catch (error) {
                console.error('Error attaching ControlledFrame:', error)
                return false
            }
        }
        frameData.promoting = false
        frameData.promoted = false
        return true
    }
    frameData.wrapper = wrapper
    frameData.attach = attach
    return {
        frameData, wrapper, anchor, owns, attach,
        destroy() {
            if (owns()) {
                delete frameData.wrapper
                delete frameData.attach
            }
        }
    }
}

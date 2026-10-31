import { getTabGroups, getPinScope } from './tab-groups.js'

function frameLists(items) {
    const spaces = Map.groupBy(items, item => item.spaceId)
    const lists = new Map()
    for (const [spaceId, tabs] of spaces) {
        for (const group of getTabGroups(tabs)) {
            const ids = group.tabs.filter(tab => !tab.pinned).map(tab => tab.id)
            const list = JSON.stringify([spaceId, 'center', ids])
            for (const id of ids) {
                lists.set(id, list)
            }
        }
        const pins = tabs.filter(tab => tab.type === 'tab' && tab.pinned && !tab.archive && !tab.preview && !tab.lightbox)
            .sort((a, b) => (a.pinOrder ?? a.order ?? 0) - (b.pinOrder ?? b.order ?? 0) || a.id.localeCompare(b.id))
        const panels = Map.groupBy(pins, tab => JSON.stringify([
            tab.pinned === 'right' ? 'right' : 'left', getPinScope(tab),
            getPinScope(tab) === 'group' ? tab.tabGroupId || tab.id : null
        ]))
        for (const [panel, members] of panels) {
            const list = JSON.stringify([spaceId, panel, members.map(tab => tab.id)])
            for (const tab of members) {
                lists.set(tab.id, list)
            }
        }
    }
    return lists
}

export function getFrameMoveIds(items, updates) {
    const byId = new Map(updates.map(({ id, ...update }) => [id, update]))
    const before = frameLists(items)
    const after = frameLists(items.map(item => byId.has(item.id) ? { ...item, ...byId.get(item.id) } : item))
    const moved = new Set()
    for (const id of new Set([...before.keys(), ...after.keys()])) {
        if (before.get(id) !== after.get(id)) {
            moved.add(id)
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
        if (!owns() || !tab || tab.archive || tab._deleted || tab.spaceId !== spaceId ||
            frameData.wrapper !== wrapper || !frame || !wrapper.isConnected || anchor.parentNode !== wrapper) {
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

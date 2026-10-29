import { getPinScope, tabGroupKey } from './tab-groups.js'

function visibilityKey (tab) {
    const scope = getPinScope(tab)
    return JSON.stringify([tab.spaceId, tab.pinned === true ? 'left' : tab.pinned, scope,
        scope === 'group' ? tabGroupKey(tab) : null])
}

export function resolveSidepinVisibility (pins, hidden, openingTabId = null) {
    const open = new Map()
    for (const tab of pins) {
        if (hidden[tab.id] && tab.id !== openingTabId) continue
        const key = visibilityKey(tab)
        // Prefer an explicitly opened pin; otherwise keep the last open candidate.
        if (open.get(key)?.id !== openingTabId) open.set(key, tab)
    }

    let visibility = hidden
    for (const tab of pins) {
        const shouldHide = open.get(visibilityKey(tab))?.id !== tab.id
        if (!!hidden[tab.id] === shouldHide) continue
        if (visibility === hidden) visibility = { ...hidden }
        if (shouldHide) visibility[tab.id] = true
        else delete visibility[tab.id]
    }
    return visibility
}

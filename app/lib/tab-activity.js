export function getActivityTimestamp(item) {
    return Number.isFinite(item?.lastActivityAt) ? item.lastActivityAt
        : Number.isFinite(item?.order) ? item.order : 0
}

export function getSidebarActivityTimestamp(item, docs = {}) {
    return item.tabs?.length
        ? Math.max(...item.tabs.map(tab => getActivityTimestamp(docs[tab.id] || tab)))
        : getActivityTimestamp(docs[item.id] || item)
}

export function getActivityGroupTabs(tabs, docs = {}, activityMode = false) {
    if (!activityMode) return tabs
    return tabs.toSorted((a, b) => getActivityTimestamp(docs[b.id] || b) - getActivityTimestamp(docs[a.id] || a))
}

// Activity order runs newest first, so either open end uses the opposite sign to ordinary order.
export function activityBetween(before, after) {
    const first = before ? getSidebarActivityTimestamp(before) : null
    const second = after ? getSidebarActivityTimestamp(after) : null
    if (first !== null && second !== null) return (first + second) / 2
    if (first !== null) return first - 1
    if (second !== null) return second + 1
    return Date.now()
}

export function withOrderActivity(item, update) {
    if (!Number.isFinite(update.order)) return update
    const activity = Object.hasOwn(update, 'lastActivityAt') ? update.lastActivityAt : item.lastActivityAt
    const lastActivityAt = Math.max(update.order,
        Number.isFinite(activity) ? activity : -Infinity)
    return { ...update, lastActivityAt }
}

export function getActivitySidebarItems(items, docs, activityMode, matchesSearch = () => true) {
    const visible = items.filter(item => !item.tabs || item.tabs.some(matchesSearch))
        .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0))
    if (!activityMode) return visible

    return visible.sort((a, b) => getSidebarActivityTimestamp(b, docs) - getSidebarActivityTimestamp(a, docs) || a.id.localeCompare(b.id))
}

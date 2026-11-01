export function getActivityTimestamp(item, orderField = 'order') {
    // Copying a group's shared order into activity is still manual member placement.
    const activity = item?.lastActivityAt
    if (Number.isFinite(activity) && (orderField === 'order' || activity !== item.order)) return activity
    return Number.isFinite(item?.[orderField]) ? item[orderField]
        : Number.isFinite(item?.order) ? item.order : 0
}

export function getSidebarActivityTimestamp(item, docs = {}, orderField = 'order') {
    return item.tabs?.length
        ? Math.max(...item.tabs.map(tab => {
            const current = docs[tab.id] || tab
            return Number.isFinite(current.lastActivityAt) && current.lastActivityAt !== current.order
                ? current.lastActivityAt : item.order ?? getActivityTimestamp(current, orderField)
        }))
        : getActivityTimestamp(docs[item.id] || item, orderField)
}

export function getActivityGroupTabs(tabs, docs = {}, activityMode = false) {
    const rank = tab => {
        const current = docs[tab.id] || tab
        return activityMode ? getActivityTimestamp(current, 'tabGroupOrder')
            : Number.isFinite(current.tabGroupOrder) ? current.tabGroupOrder : current.order ?? 0
    }
    return tabs.toSorted((a, b) => rank(b) - rank(a))
}

// Both sidebar modes run newest first; the title bar retains its traditional member order.
export function activityBetween(before, after, orderField = 'order') {
    const first = before ? getSidebarActivityTimestamp(before, {}, orderField) : null
    const second = after ? getSidebarActivityTimestamp(after, {}, orderField) : null
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
        .toSorted((a, b) => (b.order ?? 0) - (a.order ?? 0))
    if (!activityMode) return visible

    return visible.sort((a, b) => getSidebarActivityTimestamp(b, docs) - getSidebarActivityTimestamp(a, docs))
}

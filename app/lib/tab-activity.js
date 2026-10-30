// This function is serialized into a PouchDB view and must be self-contained.
export function tabActivityMap(doc) {
    if (typeof doc.spaceId !== 'string' || doc.archive >= 'deleted') return
    const activity = doc.type === 'tab' && typeof doc.lastActivityAt === 'number' &&
        isFinite(doc.lastActivityAt) && doc.lastActivityAt > 0 ? doc.lastActivityAt : 0
    // A separate key component avoids losing precision by multiplying timestamps.
    emit([doc.spaceId, doc.archive || '', doc.type, activity ? -activity : 0, doc.order || 0])
}

export async function ensureTabActivityView(db) {
    const _id = '_design/tab-activity'
    const views = { by_space: { map: tabActivityMap.toString() } }
    let existing
    try {
        existing = await db.get(_id)
    } catch (error) {
        if (error.status !== 404) throw error
    }
    if (existing?.views?.by_space?.map === views.by_space.map) return
    try {
        await db.put({ ...existing, _id, views })
    } catch (error) {
        // Another window may have installed the same view concurrently.
        if (error.status !== 409) throw error
        return ensureTabActivityView(db)
    }
}

export function getActivitySidebarItems(items, docs, activityMode, matchesSearch = () => true) {
    const visible = items.filter(item => !item.tabs || item.tabs.some(matchesSearch))
        .toSorted((a, b) => (a.order ?? 0) - (b.order ?? 0))
    if (!activityMode) return visible

    const activityAt = item => Math.max(0, ...(item.tabs || []).map(tab => {
        const timestamp = (docs[tab.id] || tab).lastActivityAt
        return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
    }))
    const active = visible.filter(item => activityAt(item) > 0)
        .sort((a, b) => activityAt(b) - activityAt(a) || (a.order ?? 0) - (b.order ?? 0))
    const rest = visible.filter(item => !activityAt(item))
    return active.length && rest.length
        ? [...active, { id: 'activity-divider', type: 'activity-divider' }, ...rest]
        : [...active, ...rest]
}

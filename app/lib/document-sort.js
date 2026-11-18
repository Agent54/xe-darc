export function withDocumentSort(doc) {
    if (doc._deleted || doc._id?.startsWith('_design/')) return doc
    const timestamp = Number.isFinite(doc.lastActivityAt) ? doc.lastActivityAt
        : Number.isFinite(doc.order) ? doc.order : 0
    // Both sidebar modes prefer larger ranks; preserve the generic ascending index prefixes.
    return { ...doc, sort: timestamp ? -timestamp : 0 }
}

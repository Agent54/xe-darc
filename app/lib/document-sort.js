export function withDocumentSort(doc) {
    if (doc._deleted || doc._id?.startsWith('_design/')) return doc
    const timestamp = Number.isFinite(doc.lastActivityAt) ? doc.lastActivityAt
        : Number.isFinite(doc.order) ? doc.order : 0
    // Preserve ascending archive/space/type prefixes while putting recent documents first.
    return { ...doc, sort: timestamp ? -timestamp : 0 }
}

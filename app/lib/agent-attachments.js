export async function readAgentAttachment(file) {
    const id = crypto.randomUUID()
    const mimeType = file.type || 'application/octet-stream'
    const uri = `attachment:///${id}/${encodeURIComponent(file.name)}`
    let content
    if (mimeType.startsWith('text/') || /^(application\/(json|xml|javascript)|.*\+(json|xml))$/.test(mimeType)) {
        content = { type: 'resource', resource: { uri, mimeType, text: await file.text() } }
    } else {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const chunks = []
        for (let offset = 0; offset < bytes.length; offset += 32768) {
            chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)))
        }
        const data = btoa(chunks.join(''))
        content = mimeType.startsWith('image/') ? { type: 'image', mimeType, data, uri }
            : { type: 'resource', resource: { uri, mimeType, blob: data } }
    }
    return { id, name: file.name, size: file.size, mimeType, content }
}

export function validateAgentAttachments(attachments, capabilities) {
    for (const attachment of attachments) {
        const supported = attachment.content.type === 'image' ? capabilities?.image : capabilities?.embeddedContext
        if (!supported) {
            throw new Error(`This harness does not support ${attachment.content.type === 'image' ? 'image attachments' : 'embedded files'}: ${attachment.name}`)
        }
    }
}

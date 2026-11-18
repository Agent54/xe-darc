<script>
    let { resource, anchor, name, id, onEnter, onLeave } = $props()
    const requests = $derived(resource.requests || [resource])
    const label = key => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, character => character.toUpperCase())
    const format = (key, value) => ['created', 'timestamp', 'seenAt', 'modified'].includes(key) && typeof value === 'number'
        ? new Date(value).toLocaleString('de-DE')
        : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)

    function position(node) {
        node.showPopover()
        const source = anchor.getBoundingClientRect()
        const bounds = node.getBoundingClientRect()
        const gap = 8
        let left = source.left - bounds.width - gap
        let top = source.top
        if (left < gap) {
            if (source.right + bounds.width + gap <= window.innerWidth - gap) {
                left = source.right + gap
            } else {
                left = source.left
                top = source.bottom + gap + bounds.height <= window.innerHeight - gap ? source.bottom + gap : source.top - bounds.height - gap
            }
        }
        node.style.left = `${Math.max(gap, Math.min(left, window.innerWidth - bounds.width - gap))}px`
        node.style.top = `${Math.max(gap, Math.min(top, window.innerHeight - bounds.height - gap))}px`
    }
</script>

<div {id} class="permission-hovercard" popover="manual" use:position tabindex="0"
         role="dialog" aria-label={`${name} permission details`} onmouseenter={onEnter} onmouseleave={onLeave}>
    <div class="permission-hovercard-heading">
        <h3>{name}</h3>
        <span>Permission details{requests.length > 1 ? ` · ${requests.length} requests` : ''}</span>
    </div>
    {#each requests as request (request.requestId)}
        <section class="permission-request-details" aria-label={`Request ${request.requestId}`}>
            {#if requests.length > 1}<h4>{request.status} · {new Date(request.created || request.timestamp).toLocaleString('de-DE')}</h4>{/if}
            {#if request.toolCall}
                <h4>Tool call · {request.toolCall.name}</h4>
                <div class="detail-label">Parameters</div>
                <pre class="tool-call-parameters">{JSON.stringify(request.toolCall.arguments, null, 2)}</pre>
            {/if}
            <dl>
                {#each Object.entries(request).filter(([key, value]) => key !== 'toolCall' && value !== undefined && value !== null && value !== '') as [key, value] (key)}
                    <div class="permission-detail">
                        <dt>{label(key)}</dt>
                        <dd>{#if typeof value === 'object'}<pre>{format(key, value)}</pre>{:else}{format(key, value)}{/if}</dd>
                    </div>
                {/each}
            </dl>
        </section>
    {/each}
</div>

<style>
    .permission-hovercard {
        position: fixed;
        inset: auto;
        margin: 0;
        width: min(440px, calc(100vw - 16px));
        max-height: calc(100dvh - 16px);
        box-sizing: border-box;
        padding: 14px;
        overflow: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        color: rgb(255 255 255 / 85%);
        background: rgb(0 0 0 / 95%);
        backdrop-filter: blur(20px);
        border: 1px solid rgb(255 255 255 / 14%);
        border-radius: 12px;
        box-shadow: 0 20px 40px rgb(0 0 0 / 55%), 0 8px 16px rgb(0 0 0 / 30%);
        font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        overflow-wrap: anywhere;
        user-select: text;
        -webkit-app-region: no-drag;
    }
    .permission-hovercard-heading { margin-bottom: 12px; }
    h3 { margin: 0; font-size: 13px; font-weight: 500; }
    .permission-hovercard-heading span, dt, .detail-label { color: rgb(255 255 255 / 45%); font-size: 11px; }
    h4 { margin: 0 0 8px; font-size: 12px; font-weight: 500; }
    .permission-request-details + .permission-request-details { border-top: 1px solid rgb(255 255 255 / 8%); margin-top: 12px; padding-top: 12px; }
    dl { margin: 0; }
    .permission-detail { margin-top: 8px; }
    dd { margin: 2px 0 0; white-space: pre-wrap; }
    pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.5 ui-monospace, monospace; }
    .tool-call-parameters { background: rgb(0 0 0 / 25%); padding: 8px; border-radius: 5px; margin: 4px 0 12px; }
    :focus-visible { outline: 2px solid #8ab4f8; outline-offset: -2px; }
</style>

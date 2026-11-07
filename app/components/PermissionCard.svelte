<script>
    import resourceTypes from '../lib/resourceTypes.js'
    import Tooltip from './Tooltip.svelte'
    import data from '../data.svelte.js'
    import { onMount } from 'svelte'
    import { permissionTargetKey } from '../lib/permissions.js'

    let { resource, sectionId = 'requested', onResolved = () => {}, onOpen = null, dismissible = false } = $props()
    const unknownPermissionIcon = '<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519a3 3 0 1 1 5.242 2.962c-.8.64-1.621 1.24-1.621 2.269v.75m-1.5 3h.008v.008H12V16.5Z" /></svg>'
    const knownType = $derived(Object.hasOwn(resourceTypes, resource.type) ? resourceTypes[resource.type] : null)
    const resourceType = $derived(knownType?.icon ? knownType : { name: knownType?.name || resource.type || 'Unknown permission', icon: unknownPermissionIcon, description: knownType?.description || 'Permission requested by this page' })

    // Track which accept dropdown is open
    let openAcceptDropdown = $state(null)
    let savingRequest = $state(null)
    let actionError = $state('')
    let acceptDropdown = $state(null)
    let chosenTarget = $state('')

    onMount(() => {
        window.addEventListener('mousedown', handleMouseDownOutside, true)
        window.addEventListener('click', handleClickOutside, true)
        const closeMenu = () => { openAcceptDropdown = null }
        window.addEventListener('scroll', closeMenu, true)
        window.addEventListener('resize', closeMenu)
        window.addEventListener('darc-controlled-frame-mousedown', closeMenu)
        return () => {
            window.removeEventListener('mousedown', handleMouseDownOutside, true)
            window.removeEventListener('click', handleClickOutside, true)
            window.removeEventListener('scroll', closeMenu, true)
            window.removeEventListener('resize', closeMenu)
            window.removeEventListener('darc-controlled-frame-mousedown', closeMenu)
        }
    })

    function showAcceptMenu(menu) {
        menu.showPopover()
        const anchor = acceptDropdown.getBoundingClientRect()
        const bounds = menu.getBoundingClientRect()
        menu.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8))}px`
        menu.style.top = `${Math.max(8, anchor.bottom + bounds.height + 4 > window.innerHeight ? anchor.top - bounds.height - 4 : anchor.bottom + 4)}px`
        menu.querySelector('button:not(:disabled)')?.focus()
        return { destroy() { if (menu.matches(':popover-open')) { menu.hidePopover() } } }
    }

    function handleMenuKey(event) {
        event.stopPropagation()
        if (event.key === 'Escape') {
            openAcceptDropdown = null
            acceptDropdown.querySelector('.accept-btn.dropdown')?.focus()
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const buttons = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'))
            const index = buttons.indexOf(document.activeElement)
            buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
        }
    }
    
    // Resource action handlers
    async function acceptResource(resource, permission = 'once', event = null) {
        if (event) {
            event.stopPropagation()
            event.preventDefault()
        }
        
        savingRequest = resource.requestId
        actionError = ''
        try {
            if (await data.allowPermission(resource.requestId, permission, chosenTarget || undefined)) {
                onResolved()
            } else {
                actionError = resource.error || 'This request can no longer be allowed.'
            }
        } catch (error) {
            actionError = 'Could not save the permission decision. Try again.'
        } finally {
            savingRequest = null
        }
        
        openAcceptDropdown = null
    }
    
    async function denyResource(resource) {
        savingRequest = resource.requestId
        actionError = ''
        try {
            if (await data.denyPermission(resource.requestId)) {
                onResolved()
            }
        } catch (error) {
            actionError = 'Could not save the permission decision. Try again.'
        } finally {
            savingRequest = null
        }
    }
    
    async function ignoreResource(resource) {
        savingRequest = resource.requestId
        actionError = ''
        try {
            if (await data.ignorePermission(resource.requestId)) {
                onResolved()
            }
        } catch (error) {
            actionError = 'Could not dismiss this request. Try again.'
        } finally {
            savingRequest = null
        }
    }

    async function changeResource(resource) {
        actionError = ''
        try {
            await data.changePermission(resource)
        } catch (error) {
            actionError = 'Could not reset the permission decision. Try again.'
        }
    }
    
    
    function toggleAcceptDropdown(requestId, event) {
        event.stopPropagation()
        event.preventDefault()
        openAcceptDropdown = openAcceptDropdown === requestId ? null : requestId
    }
    
    // Close dropdown when clicking outside
    function handleClickOutside(event) {
        if (!acceptDropdown?.contains(event.target)) {
            openAcceptDropdown = null
        }
    }
    
    function handleMouseDownOutside(event) {
        if (!acceptDropdown?.contains(event.target)) {
            openAcceptDropdown = null
        }
    }
    
</script>

<div class="resource-card {sectionId}" class:toast={!!onOpen} data-permission-type={resource.type} data-request-id={resource.requestId} class:unseen={resource.unseen}>
    {#if onOpen}
        <button class="permission-card-open" aria-label={`Open ${resourceType.name} request in resources`} disabled={savingRequest !== null}
            onmousedown={onOpen} onclick={event => { if (event.detail === 0) { onOpen(event) } }}></button>
    {/if}
    {#if dismissible}
        <button class="permission-card-dismiss" aria-label={`Ignore ${resourceType.name} permission request`} title="Ignore request" disabled={savingRequest !== null}
            onmousedown={() => ignoreResource(resource)} onclick={event => { if (event.detail === 0) { ignoreResource(resource) } }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
    {/if}
    <div class="resource-header">
        <span class="resource-icon">{@html resourceType.icon}</span>
        <div class="resource-info">
            <h4 class="resource-name">{resourceType.name}</h4>
            <p class="resource-description">{resourceType.description}</p>
        </div>
        {#if resource.unseen}
            <div class="unseen-indicator" title="New request"></div>
        {/if}
    </div>
    {#if resource.subject || resource.scope?.subject}
        {@const subject = resource.subject || resource.scope.subject}
        <div class="mcp-requester">
            <strong>{subject.title}</strong>
            <span>MCP connection · {subject.id}</span>
            {#if subject.description}<span>{subject.description}</span>{/if}
            {#if resource.target || resource.scope?.target}<span>Scope: {(resource.target || resource.scope.target).label || (resource.target || resource.scope.target).kind}</span>{/if}
            {#if resource.agent?.name}<span>Reported agent: {resource.agent.name}{resource.agent.version ? ` ${resource.agent.version}` : ''}</span>{/if}
            {#if resource.agent?.headers?.['user-agent']}<span>User-Agent: {resource.agent.headers['user-agent']}</span>{/if}
        </div>
    {/if}
    <div class="resource-details">
        <div class="resource-status {resource.status.toLowerCase().replace(' ', '-')}">
            <span class="status-indicator"></span>
            <span class="status-text">{resource.status}</span>
            {#if resource.decision === 'same-tab'}<span> · Same tab</span>{/if}
        </div>
        <div class="resource-last-used">
            <span class="last-used-label">Last used:</span>
            <span class="last-used-time">{resource.timestamp ? new Date(resource.timestamp).toLocaleString('de-DE') : 'Never'}</span>
        </div>
        {#if resource.mockValue}
            <div class="resource-mock-value">
                <span class="mock-value-label">Mock value:</span>
                <span class="mock-value-text">{resource.mockValue}</span>
            </div>
        {/if}
    </div>
    {#if resource.needsReload && (sectionId === 'used' || sectionId === 'blocked')}
        <div class="resource-reload-reminder">
            <div class="reload-message">
                {#if sectionId === 'used'}
                    <span class="reload-text">You might need to reload the page for changes to take effect</span>
                    <button class="reload-btn" onmousedown={() => data.reloadTab(resource.tabId)} title="Reload requesting page">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                            <path d="M21 3v5h-5"/>
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                            <path d="M3 21v-5h5"/>
                        </svg>
                        Reload
                    </button>
                {:else if sectionId === 'blocked'}
                    <span class="reload-text">New requests will use this decision.</span>
                {/if}
            </div>
            <button class="change-btn-inline" disabled={!data.permissionSupported(resource.type)} onmousedown={() => changeResource(resource)} title="Change permission decision">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                </svg>
                Change
            </button>
        </div>
    {/if}
    {#if sectionId !== 'requested'}
        {#if sectionId === 'unused'}
            <button class="change-btn" disabled={!data.permissionSupported(resource.type)} title={data.permissionSupported(resource.type) ? 'Request permission proactively' : 'Not implemented'} onmousedown={() => data.permissionRequest(data.spaceMeta.activeTabId, {
                permission: resource.type,
                url: data.docs[data.spaceMeta.activeTabId]?.url,
                requester: 'User (proactive)',
                explanation: 'User-initiated proactive permission request',
                requestType: 'always'
            })}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                </svg>
                Change
            </button>
        {:else}
            <button class="change-btn" disabled={!data.permissionSupported(resource.type)} onmousedown={() => changeResource(resource)} title="Change permission decision">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                </svg>
                Change
            </button>
        {/if}
    {/if}
    {#if sectionId === 'requested'}
        <div class="resource-request-info">
            <div class="requester-info">
                <span class="requester-label">Origin:</span>
                <span class="requester-name">{new URL(resource.url).origin}</span>
            </div>
            <div class="requester-info">
                <span class="requester-label">Requested by:</span>
                <span class="requester-name">{resource.requester || new URL(resource.url).origin}</span>
            </div>
            <div class="request-type-info">
                <span class="request-type-label">Access type:</span>
                <span class="request-type-value {resource.requestType}">
                    {resource.requestType === 'foreground' ? 'Foreground only' : 
                     resource.requestType === 'background' ? 'Background only' : 
                     resource.requestType === 'both' ? 'Foreground and background' : 
                     resource.requestType}
                </span>
            </div>
            <div class="explanation-info">
                <span class="explanation-text">{resource.explanation}</span>
            </div>
        </div>
        {#if resource.permissionTargets?.length > 1}
            <label class="mcp-target-selector">Permission scope
                <select aria-label="MCP permission scope" value={chosenTarget || permissionTargetKey(resource.target)} onchange={event => { chosenTarget = event.currentTarget.value }}>
                    {#each resource.permissionTargets as option}<option value={permissionTargetKey(option.target)}>{option.label}</option>{/each}
                </select>
            </label>
        {/if}
        <div class="resource-actions">
            <div class="accept-dropdown" bind:this={acceptDropdown}>
                <button class="accept-btn main" disabled={!resource.supported || savingRequest !== null} title={resource.error || 'Allow this request once'} onmousedown={() => acceptResource(resource)} onclick={event => { if (event.detail === 0) { acceptResource(resource) } }}>Allow once</button>
                <button class="accept-btn dropdown" disabled={!resource.supported || savingRequest !== null} aria-label="Accept options" aria-haspopup="menu" aria-expanded={openAcceptDropdown === resource.requestId} onmousedown={(event) => toggleAcceptDropdown(resource.requestId, event)} onclick={event => { if (event.detail === 0) { toggleAcceptDropdown(resource.requestId, event) } }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M2 3L4 5L6 3" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                {#if openAcceptDropdown === resource.requestId}
                    <div class="dropdown-menu" popover="manual" use:showAcceptMenu role="menu" tabindex="-1" onmousedown={(event) => { event.stopPropagation(); event.preventDefault(); }} onkeydown={handleMenuKey}>
                        <button disabled={savingRequest !== null} onmouseup={(event) => acceptResource(resource, 'always', event)} onclick={event => { if (event.detail === 0) { acceptResource(resource, 'always', event) } }}>Always allow</button>
                        <button disabled={savingRequest !== null} onmouseup={(event) => acceptResource(resource, 'until-app-close', event)} onclick={event => { if (event.detail === 0) { acceptResource(resource, 'until-app-close', event) } }}>Allow until closing this window</button>
                    </div>
                {/if}
            </div>
            <button class="action-btn deny" disabled={savingRequest !== null} onmousedown={() => denyResource(resource)} onclick={event => { if (event.detail === 0) { denyResource(resource) } }}>Deny</button>
            <Tooltip text="Not implemented yet"><button class="action-btn mock" disabled>Mock</button></Tooltip>
            <button class="action-btn ignore" disabled={savingRequest !== null} onmousedown={() => ignoreResource(resource)} onclick={event => { if (event.detail === 0) { ignoreResource(resource) } }}>Ignore</button>
        </div>
        {#if resource.error}<p class="permission-error">{resource.error}</p>{/if}
    {/if}
    {#if actionError}<p class="permission-error" role="alert">{actionError}</p>{/if}
</div>

<style>
    .mcp-requester { display: grid; gap: 4px; margin: 8px 0; font-size: 11px; overflow-wrap: anywhere; color: #aaa }
    .mcp-requester strong { color: #ddd }
    .mcp-target-selector { display: grid; gap: 5px; font-size: 12px; margin: 8px 0 }
    .mcp-target-selector select { padding: 6px; color: #ddd; background: #242424; border: 1px solid #ffffff25; border-radius: 5px }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .permission-error { color: #aaa; font-size: 12px; margin: 8px 0 0; }
    .resource-card.toast {
        z-index: 0;
        background: rgb(255 255 255 / 4%);
        border: 1px solid rgb(255 255 255 / 10%);
        border-radius: 6px;
        padding: 12px 14px;
        font-family: 'Inter', sans-serif;
        color: #fff;
        transition: background-color 0.2s ease, border-color 0.2s ease;
    }
    .resource-card.toast:hover { background: rgb(255 255 255 / 7%); border-color: rgb(255 255 255 / 16%); }
    .resource-card.toast.unseen { border-left: 2px solid rgb(59 130 246 / 60%); }
    .toast .resource-header { padding-right: 22px; }
    .toast .resource-actions { flex-wrap: wrap; }
    .permission-card-open { position: absolute; inset: 0; z-index: 1; border: 0; border-radius: inherit; background: transparent; cursor: pointer; }
    .permission-card-open:focus-visible { outline: 2px solid #8ab4f8; outline-offset: -2px; }
    .permission-card-dismiss { position: absolute; right: 8px; top: 8px; z-index: 3; display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 4px; border: 0; border-radius: 4px; background: transparent; color: #aaa; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 0.15s ease, background-color 0.15s ease; }
    .resource-card:hover .permission-card-dismiss, .resource-card:focus-within .permission-card-dismiss { opacity: 1; pointer-events: auto; }
    .permission-card-dismiss:hover { background: rgb(255 255 255 / 12%); color: #fff; }
    @media (hover: none) { .permission-card-dismiss { opacity: 1; pointer-events: auto; } }
    button:focus-visible { outline: 2px solid #8ab4f8; outline-offset: 2px; }
    .resource-card {
        position: relative;
        padding-bottom: 30px; /* Make room for change button */
    }

    .resource-card.unseen {
        border-left: 2px solid rgba(59, 130, 246, 0.6);
    }

    .resource-header {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-bottom: 6px;
        position: relative;
    }

    .unseen-indicator {
        width: 8px;
        height: 8px;
        background-color: #3b82f6;
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 2px;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }

    .resource-icon {
        font-size: 18px;
        flex-shrink: 0;
        line-height: 1;
        margin-top: 1px;
    }

    .resource-info {
        flex: 1;
        min-width: 0;
    }

    .resource-name {
        overflow-wrap: anywhere;
        font-size: 13px;
        font-weight: 500;
        margin: 0 0 2px 0;
        color: rgba(255, 255, 255, 0.75);
        line-height: 1.2;
    }

    .resource-description {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        line-height: 1.3;
        margin: 0;
        font-family: 'Inter', sans-serif;
        font-weight: 400;
    }

    .resource-details {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-top: 6px;
    }

    .resource-status {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
    }

    .status-indicator {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: -1px;
    }

    .active .status-indicator {
        background-color: #16a34a;
    }

    .requested .status-indicator {
        background-color: #eab308;
    }

    .available .status-indicator {
        background-color: #6b7280;
    }

    .unused .available .status-indicator {
        background-color: #16a34a;
        opacity: 0.6;
    }

    .unused .unavailable .status-indicator {
        background-color: #eab308;
    }

    .mocked .status-indicator {
        background-color: #8b5cf6;
    }

    .not-checked .status-indicator {
        background-color: #6b7280;
        opacity: 0.4;
    }

    .checking .status-indicator {
        background-color: #eab308;
        opacity: 0.6;
    }

    .blocked .status-indicator {
        background-color: #ef4444;
    }

    .archived .status-indicator {
        background-color: #3b82f6;
    }

    .status-text {
        color: rgba(255, 255, 255, 0.35);
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    .resource-last-used {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
    }

    .last-used-label {
        color: rgba(255, 255, 255, 0.35);
    }

    .last-used-time {
        color: rgba(255, 255, 255, 0.55);
    }

    .resource-mock-value {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
    }

    .mock-value-label {
        color: rgba(255, 255, 255, 0.35);
    }

    .mock-value-text {
        color: rgba(139, 92, 246, 0.8);
        font-weight: 500;
    }

    .resource-request-info {
        margin-top: 8px;
        margin-bottom: 6px;
        padding: 8px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .requester-info {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 4px;
    }

    .requester-label {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.35);
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    .requester-name {
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.6);
        font-weight: 500;
    }

    .request-type-info {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-bottom: 4px;
    }

    .request-type-label {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.35);
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    .request-type-value {
        font-size: 10px;
        font-weight: 500;
    }

    .request-type-value.foreground {
        color: rgba(34, 197, 94, 0.8);
    }

    .request-type-value.background {
        color: rgba(251, 191, 36, 0.8);
    }

    .request-type-value.both {
        color: rgba(168, 85, 247, 0.8);
    }

    .explanation-info {
        margin-top: 2px;
    }

    .explanation-text {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        line-height: 1.3;
        font-style: italic;
    }

    /* Resource Actions */
    .resource-actions {
        position: relative;
        z-index: 2;
        display: flex;
        gap: 4px;
        margin-top: 8px;
        width: 100%;
    }

    .accept-dropdown {
        position: relative;
        display: flex;
        flex: 1;
    }

    .accept-btn {
        background: rgba(34, 197, 94, 0.15);
        color: rgba(34, 197, 94, 1);
        border: none;
        font-size: 10px;
        font-weight: 500;
        padding: 6px 8px 5px 8px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        transition: background-color 0.15s ease, color 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        box-sizing: border-box;
        outline: 0;
        margin: 0;
        flex: 1;
    }

    .accept-btn.main {
        border-radius: 3px 0 0 3px;
        white-space: nowrap;
    }

    .accept-btn.dropdown {
        border-radius: 0 3px 3px 0;
        border-left: 1px solid rgba(34, 197, 94, 0.3);
        padding: 6px 6px 5px 6px;
        flex: 0 0 auto;
    }

    .accept-btn:hover,
    .accept-btn:focus {
        background: rgba(34, 197, 94, 0.22);
        color: rgba(34, 197, 94, 1);
    }

    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        background: rgba(0, 0, 0, 0.9);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        min-width: 120px;
        z-index: 10;
        margin-top: 2px;
        box-shadow: 0 16px 32px -8px rgba(0, 0, 0, 0.95), 0 12px 24px -6px rgba(0, 0, 0, 0.9), 0 8px 16px -4px rgba(0, 0, 0, 0.85), 0 4px 8px -2px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.15);
    }

    .dropdown-menu[popover] { position: fixed; inset: auto; margin: 0; max-width: calc(100vw - 16px); }

    .dropdown-menu button {
        display: block;
        width: 100%;
        background: none;
        border: none;
        color: #fff;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.008em;
        line-height: 1;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: antialiased;
        padding: 8px 14px;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.15s ease;
        white-space: nowrap;
    }

    .dropdown-menu button:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .dropdown-menu button:first-child {
        border-radius: 4px 4px 0 0;
    }

    .dropdown-menu button:last-child {
        border-radius: 0 0 4px 4px;
    }

    .action-btn {
        background: rgba(75, 85, 99, 0.15);
        color: rgba(255, 255, 255, 0.75);
        border: none;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 500;
        padding: 6px 8px 5px 8px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        transition: background-color 0.15s ease, color 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        box-sizing: border-box;
        outline: 0;
        margin: 0;
        flex: 1;
    }

    .action-btn:hover,
    .action-btn:focus {
        background: rgba(75, 85, 99, 0.22);
        color: rgba(255, 255, 255, 0.9);
    }

    .action-btn.deny {
        background: rgba(239, 68, 68, 0.15);
        color: rgba(239, 68, 68, 1);
    }

    .action-btn.deny:hover,
    .action-btn.deny:focus {
        background: rgba(239, 68, 68, 0.22);
        color: rgba(239, 68, 68, 1);
    }

    .action-btn.mock {
        background: rgba(139, 92, 246, 0.15);
        color: rgba(139, 92, 246, 1);
    }

    .action-btn.mock:hover,
    .action-btn.mock:focus {
        background: rgba(139, 92, 246, 0.22);
        color: rgba(139, 92, 246, 1);
    }

    .action-btn.mock:disabled {
        background: rgb(255 255 255 / 6%);
        color: #999;
    }

    .action-btn.ignore {
        background: rgba(107, 114, 128, 0.15);
        color: rgba(107, 114, 128, 1);
    }

    .action-btn.ignore:hover,
    .action-btn.ignore:focus {
        background: rgba(107, 114, 128, 0.22);
        color: rgba(107, 114, 128, 1);
    }

    /* Resource Reload Reminder */
    .resource-reload-reminder {
        margin-top: 8px;
        padding: 6px 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 4px;
    }

    /* Hide change button when reload reminder is visible */
    .resource-reload-reminder ~ .change-btn {
        display: none;
    }

    .change-btn-inline {
        margin-top: 6px;
        margin-left: auto;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.6);
        border: none;
        border-radius: 3px;
        font-size: 9px;
        font-weight: 500;
        padding: 4px 6px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        transition: background-color 0.15s ease, color 0.15s ease;
        display: flex;
        align-items: center;
        gap: 3px;
        line-height: 1;
        box-sizing: border-box;
        outline: 0;
        flex-shrink: 0;
    }

    .change-btn-inline:hover,
    .change-btn-inline:focus {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
    }

    .change-btn-inline svg {
        width: 10px;
        height: 10px;
    }

    .reload-message {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    .reload-text {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
        line-height: 1.3;
        flex: 1;
    }

    .reload-btn {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.6);
        border: none;
        border-radius: 3px;
        font-size: 9px;
        font-weight: 500;
        padding: 4px 6px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        transition: background-color 0.15s ease, color 0.15s ease;
        display: flex;
        align-items: center;
        gap: 3px;
        line-height: 1;
        box-sizing: border-box;
        outline: 0;
        margin: 0;
        flex-shrink: 0;
    }

    .reload-btn:hover,
    .reload-btn:focus {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
    }

    .reload-btn svg {
        width: 10px;
        height: 10px;
    }
    .change-btn {
        position: absolute;
        bottom: 6px;
        right: 6px;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.6);
        border: none;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 500;
        padding: 4px 6px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        transition: background-color 0.15s ease, color 0.15s ease, opacity 0.2s ease;
        display: flex;
        align-items: center;
        gap: 3px;
        line-height: 1;
        box-sizing: border-box;
        outline: 0;
        margin: 0;
        opacity: 0;
    }

    .resource-card:hover .change-btn {
        opacity: 1;
    }

    .change-btn:hover,
    .change-btn:focus {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
    }

    .change-btn svg {
        width: 10px;
        height: 10px;
    }
</style>


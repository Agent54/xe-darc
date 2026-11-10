<script>
    import RightSidebar from './RightSidebar.svelte'
    import resourceTypes from '../lib/resourceTypes.js'
    import { permissionType, permissionOrigin } from '../lib/permissions.js'
    import PermissionCard from './PermissionCard.svelte'
	import data from '../data.svelte'
    // FIXME: use app global click outside scrim handler
    // filter: current page's resources/ all resources

    let {
        onClose,
        openSidebars,
        switchToResources,
        switchToSettings,
        switchToUserMods,
        switchToActivity,
        switchToAgent,
        switchToDevTools,
        devModeEnabled = false,
    } = $props()

    // Clear unseen flags when sidebar is closed
    function handleClose() {
        data.clearUnseenResourceFlags()
        onClose()
    }

	const SCOPE_OPTIONS = [
		{ id: 'global', label: 'Global' },
		{ id: 'window', label: 'Current window' },
		{ id: 'instance', label: 'Current instance' },
        { id: 'origin', label: 'Current origin' },
        { id: 'mcp', label: 'MCP connections' },
	]
	let scope = $state(localStorage.getItem('resourcesScope') || 'origin')
	$effect(() => {
		localStorage.setItem('resourcesScope', scope)
	})

    const resourceSections = [
        { id: 'requested', title: 'Requested' },
        { id: 'mocked', title: 'Mocked' },
        { id: 'blocked', title: 'Blocked' },
        { id: 'used', title: 'Used' },
        { id: 'unused', title: 'Unused' },
        { id: 'archived', title: 'Archived' }
    ]

    // Track collapsed state for each section
    let collapsedSections = $state({
        requested: false,
        used: false,
        mocked: false,
        blocked: false,
        unused: true,
        archived: true
    })

    function toggleSection(sectionId) {
        collapsedSections[sectionId] = !collapsedSections[sectionId]
        
        // Check availability when unused section is first expanded
        if (sectionId === 'unused' && !collapsedSections[sectionId]) {
            checkResourceAvailability()
        }
    }

    console.log('test sd')

    let unused = $state(Object.keys(resourceTypes).map(id => ({
        id,
        type: id,
        lastUsed: 'Never',
        status: 'Not checked'
    })))
    let hasCheckedAvailability = $state(false)
    let isCheckingAvailability = $state(false)
    
    // Test each resource type for availability
    async function checkResourceAvailability() {
        if (hasCheckedAvailability || isCheckingAvailability) return
        
        isCheckingAvailability = true
        const newUnused = []
        for (const resourceType in resourceTypes) {
            try {
                const implemented = data.permissionSupported(resourceType)
                const result = implemented ? await resourceTypes[resourceType].availability() : { available: false, error: 'Not implemented' }
                newUnused.push({
                    id: resourceType,
                    type: resourceType,
                    lastUsed: 'Never',
                    status: result.available ? 'Available' : 'Unavailable',
                    error: result.error,
                    supported: implemented
                })
            } catch (e) {
                newUnused.push({
                    id: resourceType,
                    type: resourceType,
                    lastUsed: 'Never',
                    status: 'Unavailable',
                    error: 'Test function failed'
                })
            }
        }
        unused = newUnused
        hasCheckedAvailability = true
        isCheckingAvailability = false
    }

    const resourceData = $derived.by(() => {

        const requested = []
        const used = []
        const mocked = []
        const blocked = []

        const archived = []
        const usedResourceTypes = new Set()

        const currentUrl = data.docs[data.spaceMeta.activeTabId]?.url
        const currentOrigin = permissionOrigin(currentUrl)
        const currentPartition = data.docs[data.spaceMeta.activeTabId]?.partition || 'persist:myapp'
        const history = Object.values(data.permissions).flatMap(permission => Object.values(permission.origins || {}).flatMap(entry => entry.requests || []))
        const represented = new Set(history.filter(request => request.status !== 'ignored').map(request => request.ruleId))
        const saved = Object.values(data.permissionRules).filter(rule => !represented.has(rule._id)).map(rule => ({
            requestId: rule._id, ruleId: rule._id, type: permissionType(rule.permission), permission: rule.permission,
            scope: rule, url: rule.requestingOrigin, tabId: data.spaceMeta.activeTabId,
            status: rule.decision === 'deny' ? 'denied' : 'granted', decision: rule.decision, supported: true,
            lifetime: 'persistent', timestamp: rule.modified, instanceId: rule.instanceId,
            ...(rule.subject ? { subject: rule.subject, target: rule.target } : {})
        }))
        for (const resource of [...history, ...saved]) {
            if (resource.status === 'requested' && resource.windowId === window.darcWindowId) {
                requested.push(resource)
                usedResourceTypes.add(resource.type)
                continue
            }
            const matches = scope === 'mcp' ? !!resource.scope?.subject : scope === 'origin'
                ? resource.scope?.topLevelOrigin === currentOrigin && resource.scope?.partition === currentPartition
                : scope === 'window' ? resource.windowId === window.darcWindowId : true
            if (!matches) {
                continue
            }
            const rule = data.permissionRules[resource.ruleId]
            const status = resource.status !== 'requested' && rule ? rule.decision === 'deny' ? 'denied' : 'granted'
                : resource.lifetime === 'persistent' && resource.ruleId && !rule ? 'ignored' : resource.status
            const section = status === 'granted' ? used : status === 'denied' ? blocked : status === 'ignored' ? archived : null
            if (section) {
                section.push({ ...resource, status, decision: rule?.decision || resource.decision })
                usedResourceTypes.add(resource.type)
            }
        }

        return {
            requested,
            used,
            mocked,
            blocked,
            unused: unused.filter(unusedResource => !resourceTypes[unusedResource.type]?.mcp && !usedResourceTypes.has(unusedResource.type)),
            archived
        }


        // ...Object.values(data.resources).reduce((acc, resource) => {
        //     acc[resource.status] = [...(acc[resource.status] || []), resource]
        //     return acc
        // }, {})
    })
</script>

<RightSidebar title="Resources" onClose={handleClose} {openSidebars} {switchToResources} {switchToSettings} {switchToUserMods} {switchToActivity} {switchToAgent} {switchToDevTools} {devModeEnabled}>
    {#snippet children()}
        {#if data.permissionState.error}
            <p role="alert">{data.permissionState.error}</p>
        {/if}
        {#if data.permissionState.seenError}
            <p role="alert">{data.permissionState.seenError}</p>
        {/if}
		<div class="resources-controls">
			<div class="scope-control">
				<label class="sr-only" for="resources-scope">Scope</label>
				<select id="resources-scope" aria-label="Scope" bind:value={scope} onmousedown={(e) => e.stopPropagation()} title={`${SCOPE_OPTIONS.find(o => o.id === scope)?.label}${scope === 'origin' && data.docs[data.spaceMeta.activeTabId]?.url ? ` (${new URL(data.docs[data.spaceMeta.activeTabId].url).origin})` : ''}`}>
					{#each SCOPE_OPTIONS as opt}
						<option value={opt.id} title={`${opt.label}${opt.id === 'origin' && data.docs[data.spaceMeta.activeTabId]?.url ? ` (${new URL(data.docs[data.spaceMeta.activeTabId].url).origin})` : ''}`}>{opt.label}{opt.id === 'origin' && data.docs[data.spaceMeta.activeTabId]?.url ? ` (${new URL(data.docs[data.spaceMeta.activeTabId].url).origin})` : ''}</option>
					{/each}
				</select>
			</div>
		</div>
        {#each resourceSections as section}
            {#if resourceData[section.id].length > 0}
                <div class="resource-section {section.id}">
                    <button class="section-title" onmousedown={() => toggleSection(section.id)}>
                        <span class="collapse-icon" class:collapsed={collapsedSections[section.id]}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                        {section.title}
                    </button>
                    {#if !collapsedSections[section.id]}
                        <div class="resource-cards">
                            {#each resourceData[section.id] as resource}
                                <PermissionCard {resource} sectionId={section.id} />
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        {/each}

        {#if Object.values(resourceData).every(arr => arr.length === 0)}
            <div class="empty-state">
                <div class="empty-icon">
                    <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                </div>
                <h3 class="empty-title">No Resources Used</h3>
                <p class="empty-description">This page hasn't requested access to any system resources yet.</p>
            </div>
        {/if}
    {/snippet}
</RightSidebar>

<style>
	.resources-controls {
		display: flex;
		justify-content: flex-end;
		padding: 14px 0 10px 0;
		position: sticky;
		top: 0;
		background: rgba(0, 0, 0, 0.95);
		backdrop-filter: blur(12px);
		z-index: 10;
		margin: 0 -20px;
		padding: 14px 20px 10px 20px;
	}
	.scope-control select {
		appearance: none;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: rgba(255, 255, 255, 0.85);
		font-size: 12px;
		border-radius: 5px;
		padding: 6px 26px 6px 10px;
		line-height: 1;
		cursor: pointer;
		display: block;
		width: 100%;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.scope-control select:focus {
		outline: none;
		border-color: rgba(255, 255, 255, 0.2);
	}
	.scope-control {
		position: relative;
		width: 220px;
	}
	.scope-control::after {
		content: '';
		position: absolute;
		right: 10px;
		top: 50%;
		transform: translateY(-50%);
		border-width: 5px 4px 0 4px;
		border-style: solid;
		border-color: rgba(255, 255, 255, 0.6) transparent transparent transparent;
		pointer-events: none;
	}

    .resource-section {
        margin-bottom: 32px;
        margin-top: 16px;
    }

    .resource-section:last-child {
        margin-bottom: 0;
    }

    .section-title {
        font-size: 14px;
        font-weight: 600;
        margin: 0 0 12px 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        user-select: none;
    }

    .section-title:hover {
        opacity: 0.8;
    }

    .collapse-icon {
        display: flex;
        align-items: center;
        transition: transform 0.2s ease;
    }

    .collapse-icon.collapsed {
        transform: rotate(-90deg);
    }

    .requested .section-title {
        color: #eab308;
    }

    .used .section-title {
        color: #16a34a;
    }

    .mocked .section-title {
        color: #8b5cf6;
    }

    .unused .section-title {
        color: #6b7280;
    }

    .blocked .section-title {
        color: #ef4444;
    }

    .archived .section-title {
        color: #3b82f6;
    }

    .resource-cards {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 40px 20px;
        height: 100%;
        min-height: 300px;
    }

    .empty-icon {
        margin-bottom: 16px;
        opacity: 0.6;
        color: rgba(255, 255, 255, 0.4);
    }

    .empty-title {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 8px 0;
        color: rgba(255, 255, 255, 0.8);
    }

    .empty-description {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.5;
        margin: 0;
        max-width: 240px;
    }

    /* Resource Request Info */
</style>

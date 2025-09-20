<script>
    import RightSidebar from './RightSidebar.svelte'
    import resourceTypes from '../lib/resourceTypes.js'
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
        requestedResources
    } = $props()

	const SCOPE_OPTIONS = [
		{ id: 'global', label: 'Global' },
		{ id: 'window', label: 'Current window' },
		{ id: 'instance', label: 'Current instance' },
        { id: 'origin', label: 'Current origin' },
	]
	let scope = $state(localStorage.getItem('resourcesScope') || 'global')
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

    let unused = $state(Object.keys(resourceTypes).map(id => ({
        id,
        lastUsed: 'Never',
        status: 'Not checked'
    })))
    let hasCheckedAvailability = $state(false)
    let isCheckingAvailability = $state(false)
    
    // Track which accept dropdown is open
    let openAcceptDropdown = $state(null)
    
    // Resource action handlers
    function acceptResource(resourceId, permission = 'once', event = null) {
        if (event) {
            event.stopPropagation()
            event.preventDefault()
        }
        console.log('Accept resource:', resourceId, 'with permission:', permission)
        openAcceptDropdown = null
        // TODO: Implement actual acceptance logic
    }
    
    function denyResource(resourceId) {
        console.log('Deny resource:', resourceId)
        // TODO: Implement actual denial logic
    }
    
    function mockResource(resourceId) {
        console.log('Mock resource:', resourceId)
        // TODO: Implement actual mocking logic
    }
    
    function ignoreResource(resourceId) {
        console.log('Ignore resource:', resourceId)
        // TODO: Implement actual ignore logic
    }
    
    function toggleAcceptDropdown(resourceId, event) {
        event.stopPropagation()
        event.preventDefault()
        openAcceptDropdown = openAcceptDropdown === resourceId ? null : resourceId
    }
    
    // Close dropdown when clicking outside
    function handleClickOutside(event) {
        if (!event.target.closest('.accept-dropdown')) {
            openAcceptDropdown = null
        }
    }
    
    function handleMouseDownOutside(event) {
        if (!event.target.closest('.accept-dropdown')) {
            openAcceptDropdown = null
        }
    }
    
    // Test each resource type for availability
    async function checkResourceAvailability() {
        if (hasCheckedAvailability || isCheckingAvailability) return
        
        isCheckingAvailability = true
        const newUnused = []
        for (const resourceType in resourceTypes) {
            try {
                const result = await resourceTypes[resourceType].availability()
                newUnused.push({
                    id: resourceType,
                    lastUsed: 'Never',
                    status: result.available ? 'Available' : 'Unavailable',
                    error: result.error
                })
            } catch (e) {
                newUnused.push({
                    id: resourceType,
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

    // Mock data - in real app this would come from props or API
    const resourceData = $derived({
        requested: requestedResources.map(resource => ({
            ...resource,
            requester: resource.requester || 'example.com',
            explanation: resource.explanation || 'Required for core functionality',
            status: resource.status || 'Requested',
            requestType: resource.requestType || 'foreground'
        })),

        used: [],
        mocked: [],
        blocked: [],
        unused,
        archived: [],

        ...Object.values(data.resources).reduce((acc, resource) => {
            acc[resource.status] = [...(acc[resource.status] || []), resource]
            return acc
        }, {})
       
    })
</script>

<svelte:window onclick={handleClickOutside} onmousedown={handleMouseDownOutside} />

<RightSidebar title="Resources" {onClose} {openSidebars} {switchToResources} {switchToSettings} {switchToUserMods} {switchToActivity} {switchToAgent} {switchToDevTools} {devModeEnabled}>
    {#snippet children()}
		<div class="resources-controls">
			<div class="scope-control">
				<label class="sr-only" for="resources-scope">Scope</label>
				<select id="resources-scope" aria-label="Scope" bind:value={scope} onmousedown={(e) => e.stopPropagation()}>
					{#each SCOPE_OPTIONS as opt}
						<option value={opt.id}>{opt.label}</option>
					{/each}
				</select>
			</div>
		</div>
        {#each resourceSections as section}
            {#if resourceData[section.id].length > 0}
                <div class="resource-section {section.id}">
                    <button class="section-title" onclick={() => toggleSection(section.id)}>
                        <span class="collapse-icon" class:collapsed={collapsedSections[section.id]}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                        {section.title}
                    </button>
                    {#if !collapsedSections[section.id]}
                        <div class="resource-cards">
                            {#each resourceData[section.id] as resource (resource.id)}
                                {@const resourceType = resourceTypes[resource.id] || { name: resource.id, icon: '❓', description: 'Unknown resource type' }}
                                <div class="resource-card">
                                    <div class="resource-header">
                                        <span class="resource-icon">{@html resourceType.icon}</span>
                                        <div class="resource-info">
                                            <h4 class="resource-name">{resourceType.name}</h4>
                                            <p class="resource-description">{resourceType.description}</p>
                                        </div>
                                    </div>
                                    <div class="resource-details">
                                        <div class="resource-status {resource.status.toLowerCase().replace(' ', '-')}">
                                            <span class="status-indicator"></span>
                                            <span class="status-text">{resource.status}</span>
                                        </div>
                                        <div class="resource-last-used">
                                            <span class="last-used-label">Last used:</span>
                                            <span class="last-used-time">{resource.lastUsed}</span>
                                        </div>
                                        {#if resource.mockValue}
                                            <div class="resource-mock-value">
                                                <span class="mock-value-label">Mock value:</span>
                                                <span class="mock-value-text">{resource.mockValue}</span>
                                            </div>
                                        {/if}
                                    </div>
                                    {#if section.id === 'requested'}
                                        <div class="resource-request-info">
                                            <div class="requester-info">
                                                <span class="requester-label">Requested by:</span>
                                                <span class="requester-name">{resource.requester}</span>
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
                                        <div class="resource-actions">
                                            <div class="accept-dropdown">
                                                <button class="accept-btn main" onmousedown={() => acceptResource(resource.id)}>Allow</button>
                                                <button class="accept-btn dropdown" aria-label="Accept options" onmousedown={(event) => toggleAcceptDropdown(resource.id, event)}>
                                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                                        <path d="M2 3L4 5L6 3" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
                                                    </svg>
                                                </button>
                                                {#if openAcceptDropdown === resource.id}
                                                    <div class="dropdown-menu" role="menu" tabindex="-1" onclick={(event) => event.stopPropagation()} onmousedown={(event) => { event.stopPropagation(); event.preventDefault(); }} onkeydown={(event) => event.stopPropagation()}>
                                                        <button onmouseup={(event) => acceptResource(resource.id, 'once', event)}>Allow once</button>
                                                        <button onmouseup={(event) => acceptResource(resource.id, 'always', event)}>Always allow</button>
                                                        <button onmouseup={(event) => acceptResource(resource.id, 'until', event)}>Allow until...</button>
                                                    </div>
                                                {/if}
                                            </div>
                                            <button class="action-btn deny" onmousedown={() => denyResource(resource.id)}>Deny</button>
                                            <button class="action-btn mock" onmousedown={() => mockResource(resource.id)}>Mock</button>
                                            <button class="action-btn ignore" onmousedown={() => ignoreResource(resource.id)}>Ignore</button>
                                        </div>
                                    {/if}
                                </div>
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
	}
	.scope-control select:focus {
		outline: none;
		border-color: rgba(255, 255, 255, 0.2);
	}
	.scope-control {
		position: relative;
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

    .resource-card {
        position: relative;
    }

    .resource-header {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin-bottom: 6px;
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

    .dropdown-menu button {
        display: block;
        width: 100%;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.8);
        font-size: 11px;
        padding: 6px 10px;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.15s ease;
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

    .action-btn.ignore {
        background: rgba(107, 114, 128, 0.15);
        color: rgba(107, 114, 128, 1);
    }

    .action-btn.ignore:hover,
    .action-btn.ignore:focus {
        background: rgba(107, 114, 128, 0.22);
        color: rgba(107, 114, 128, 1);
    }
</style>

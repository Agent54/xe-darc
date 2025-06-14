<script>
    import RightSidebar from './RightSidebar.svelte'
    
    let { onClose, openSidebars, switchToResources, switchToSettings, switchToUserMods } = $props()

    const resourceSections = [
        { id: 'used', title: 'Used', color: 'green' },
        { id: 'unused', title: 'Unused', color: 'gray' },
        { id: 'blocked', title: 'Blocked', color: 'red' },
        { id: 'archived', title: 'Archived', color: 'blue' }
    ]

    const resourceTypes = [
        {
            id: 'network',
            name: 'Network',
            icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <circle cx="12" cy="12" r="9" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3c-2.5 0-4.5 4-4.5 9s2 9 4.5 9 4.5-4 4.5-9-2-9-4.5-9Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 12h18" />
            </svg>`,
            description: 'Internet connectivity and data usage'
        },
        {
            id: 'microphone',
            name: 'Microphone',
            icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>`,
            description: 'Audio input and recording access'
        },
        {
            id: 'audio',
            name: 'Audio Playback',
            icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.79-1.59-1.76V9.51c0-.97.71-1.76 1.59-1.76h2.24Z" />
            </svg>`,
            description: 'Audio output and media playback'
        },
        {
            id: 'storage',
            name: 'Storage',
            icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>`,
            description: 'File system and local storage access'
        }
    ]

    // Mock data - in real app this would come from props or API
    const resourceData = {
        used: [
            { ...resourceTypes[0], lastUsed: '2 minutes ago', status: 'Active' },
            { ...resourceTypes[2], lastUsed: '5 minutes ago', status: 'Active' }
        ],
        unused: [
            { ...resourceTypes[1], lastUsed: 'Never', status: 'Available' },
            { ...resourceTypes[3], lastUsed: '2 hours ago', status: 'Available' }
        ],
        blocked: [],
        archived: []
    }

    function getStatusColor(status) {
        switch (status) {
            case 'Active': return '#16a34a'
            case 'Available': return '#6b7280'
            case 'Blocked': return '#ef4444'
            case 'Archived': return '#3b82f6'
            default: return '#6b7280'
        }
    }
</script>

<RightSidebar title="Resources" {onClose} {openSidebars} {switchToResources} {switchToSettings} {switchToUserMods}>
    {#snippet children()}
        {#each resourceSections as section}
            {#if resourceData[section.id].length > 0}
                <div class="resource-section">
                    <h3 class="section-title" style="color: {section.color === 'green' ? '#16a34a' : section.color === 'red' ? '#ef4444' : section.color === 'blue' ? '#3b82f6' : '#6b7280'}">{section.title}</h3>
                    <div class="resource-cards">
                        {#each resourceData[section.id] as resource}
                            <div class="resource-card">
                                <div class="resource-header">
                                    <span class="resource-icon">{@html resource.icon}</span>
                                    <div class="resource-info">
                                        <h4 class="resource-name">{resource.name}</h4>
                                        <p class="resource-description">{resource.description}</p>
                                    </div>
                                </div>
                                <div class="resource-details">
                                    <div class="resource-status">
                                        <span class="status-indicator" style="background-color: {getStatusColor(resource.status)}"></span>
                                        <span class="status-text">{resource.status}</span>
                                    </div>
                                    <div class="resource-last-used">
                                        <span class="last-used-label">Last used:</span>
                                        <span class="last-used-time">{resource.lastUsed}</span>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
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
    .resource-section {
        margin-bottom: 32px;
    }

    .resource-section:last-child {
        margin-bottom: 0;
    }

    .resource-cards {
        display: flex;
        flex-direction: column;
        gap: 6px;
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
</style>

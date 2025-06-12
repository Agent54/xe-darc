<script>
    import RightSidebar from './RightSidebar.svelte'
    
    let { onClose, resourcesSidebarOpen, settingsSidebarOpen, switchToResources, switchToSettings } = $props()

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
            icon: '🌐',
            description: 'Internet connectivity and data usage'
        },
        {
            id: 'microphone',
            name: 'Microphone',
            icon: '🎤',
            description: 'Audio input and recording access'
        },
        {
            id: 'audio',
            name: 'Audio Playback',
            icon: '🔊',
            description: 'Audio output and media playback'
        },
        {
            id: 'storage',
            name: 'Storage',
            icon: '💾',
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
            case 'Active': return '#10b981'
            case 'Available': return '#6b7280'
            case 'Blocked': return '#ef4444'
            case 'Archived': return '#3b82f6'
            default: return '#6b7280'
        }
    }
</script>

<RightSidebar title="Resources" {onClose} {resourcesSidebarOpen} {settingsSidebarOpen} {switchToResources} {switchToSettings}>
    {#snippet children()}
        {#each resourceSections as section}
            {#if resourceData[section.id].length > 0}
                <div class="resource-section">
                    <h3 class="section-title" style="color: {section.color === 'green' ? '#10b981' : section.color === 'red' ? '#ef4444' : section.color === 'blue' ? '#3b82f6' : '#6b7280'}">{section.title}</h3>
                    <div class="resource-cards">
                        {#each resourceData[section.id] as resource}
                            <div class="resource-card">
                                <div class="resource-header">
                                    <span class="resource-icon">{resource.icon}</span>
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
                <div class="empty-icon">🔒</div>
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
        font-size: 48px;
        margin-bottom: 16px;
        opacity: 0.6;
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

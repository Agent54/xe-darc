<script>
    let { onClose } = $props()

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

<div class="resources-sidebar">
    <div class="resources-header">
        <h2 class="resources-title">Resources</h2>
        <button class="close-button" onclick={onClose} title="Close Resources">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
        </button>
    </div>

    <div class="resources-content">
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
    </div>
</div>

<style>
    .resources-sidebar {
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border-left: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        flex-direction: column;
        font-family: 'Inter', sans-serif;
        color: #fff;
    }

    .resources-header {
        padding: 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
    }

    .resources-title {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
        color: rgba(255, 255, 255, 0.9);
    }

    .close-button {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }

    .close-button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.9);
    }

    .resources-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .resources-content::-webkit-scrollbar {
        width: 6px;
    }

    .resources-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .resources-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .resource-section {
        margin-bottom: 32px;
    }

    .resource-section:last-child {
        margin-bottom: 0;
    }

    .section-title {
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0 0 16px 0;
        opacity: 0.9;
    }

    .resource-cards {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .resource-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 16px;
        transition: all 0.2s ease;
    }

    .resource-card:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
        transform: translateY(-1px);
    }

    .resource-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
    }

    .resource-icon {
        font-size: 20px;
        flex-shrink: 0;
        line-height: 1;
    }

    .resource-info {
        flex: 1;
        min-width: 0;
    }

    .resource-name {
        font-size: 14px;
        font-weight: 600;
        margin: 0 0 4px 0;
        color: rgba(255, 255, 255, 0.9);
    }

    .resource-description {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.4;
        margin: 0;
    }

    .resource-details {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .resource-status {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .status-text {
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
    }

    .resource-last-used {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
    }

    .last-used-label {
        color: rgba(255, 255, 255, 0.5);
    }

    .last-used-time {
        color: rgba(255, 255, 255, 0.7);
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

    .w-4 {
        width: 16px;
    }

    .h-4 {
        height: 16px;
    }
</style>

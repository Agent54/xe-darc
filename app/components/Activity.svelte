<script>
    import RightSidebar from './RightSidebar.svelte'

    let {
        onClose,
        openSidebars,
        switchToResources,
        switchToSettings,
        switchToUserMods,
        switchToActivity,
        switchToAgent
    } = $props()

    // Dummy activity data with various types of actions
    const activityData = [
        {
            id: '1',
            type: 'tab_opened',
            icon: 'plus',
            title: 'Opened new tab',
            description: 'Navigated to GitHub repository',
            url: 'https://github.com/Agent54/darc',
            timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
            user: 'Jan',
            device: 'MacBook Pro',
            agent: null
        },
        {
            id: '2',
            type: 'permission_accepted',
            icon: 'shield-check',
            title: 'Permission granted',
            description: 'Allowed camera access',
            resource: 'Camera',
            timestamp: new Date(Date.now() - 12 * 60 * 1000), // 12 minutes ago
            user: 'Jan',
            device: 'MacBook Pro',
            agent: null
        },
        {
            id: '3',
            type: 'tab_closed',
            icon: 'x',
            title: 'Closed tab',
            description: 'Spotify - Web Player',
            url: 'https://open.spotify.com',
            timestamp: new Date(Date.now() - 25 * 60 * 1000), // 25 minutes ago
            user: 'Jan',
            device: 'MacBook Pro',
            agent: null
        },
        {
            id: '4',
            type: 'permission_mocked',
            icon: 'beaker',
            title: 'Permission mocked',
            description: 'Location access mocked with San Francisco coordinates',
            resource: 'Location',
            timestamp: new Date(Date.now() - 35 * 60 * 1000), // 35 minutes ago
            user: 'System',
            device: 'MacBook Pro',
            agent: 'Privacy Agent'
        },
        {
            id: '5',
            type: 'page_visited',
            icon: 'globe',
            title: 'Page visited',
            description: 'Controlled Frame API Documentation',
            url: 'https://wicg.github.io/controlled-frame',
            timestamp: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
            user: 'Jan',
            device: 'MacBook Pro',
            agent: null
        },
        {
            id: '6',
            type: 'file_downloaded',
            icon: 'download',
            title: 'File downloaded',
            description: 'screenshot-2024-12-03.png (2.1 MB)',
            filename: 'screenshot-2024-12-03.png',
            size: '2.1 MB',
            timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago (will create break)
            user: 'Jan',
            device: 'MacBook Pro',
            agent: null
        },
        {
            id: '7',
            type: 'permission_rejected',
            icon: 'shield-x',
            title: 'Permission denied',
            description: 'Blocked microphone access request',
            resource: 'Microphone',
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
            user: 'Jan',
            device: 'MacBook Pro',
            agent: null
        },
        {
            id: '8',
            type: 'tab_opened',
            icon: 'plus',
            title: 'Opened new tab',
            description: 'Figma design workspace',
            url: 'https://figma.com/design/HP40QZCsYVBnYahP4oUa2q',
            timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000), // Yesterday
            user: 'Jan',
            device: 'MacBook Pro',
            agent: null
        }
    ]

    let visibleEntries = $state(5) // Initially show 5 entries
    let loading = $state(false)

    function loadMoreEntries() {
        loading = true
        // Remove simulated loading delay
        visibleEntries = Math.min(visibleEntries + 5, activityData.length)
        loading = false
    }

    function formatTimestamp(timestamp) {
        const now = new Date()
        const diff = now - timestamp
        const minutes = Math.floor(diff / (1000 * 60))
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))

        if (minutes < 1) return 'Just now'
        if (minutes < 60) return `${minutes}m ago`
        if (hours < 24) return `${hours}h ago`
        return `${days}d ago`
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp)
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        
        const isToday = date.toDateString() === today.toDateString()
        const isYesterday = date.toDateString() === yesterday.toDateString()
        
        if (isToday) return 'Today'
        if (isYesterday) return 'Yesterday'
        
        return date.toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        })
    }

    function isSameDate(date1, date2) {
        return new Date(date1).toDateString() === new Date(date2).toDateString()
    }

    function shouldShowBreak(currentActivity, nextActivity) {
        if (!nextActivity) return false
        const timeDiff = currentActivity.timestamp - nextActivity.timestamp
        const hoursDiff = timeDiff / (1000 * 60 * 60)
        return hoursDiff > 2 // Show break if more than 2 hours between activities
    }

    function getActivityIcon(type) {
        switch (type) {
            case 'tab_opened':
                return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>`
            case 'tab_closed':
                return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>`
            case 'permission_accepted':
                return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>`
            case 'permission_rejected':
                return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>`
            case 'permission_mocked':
                return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
                </svg>`
            case 'page_visited':
                return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>`
            case 'file_downloaded':
                return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>`
            default:
                return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>`
        }
    }

    function getActivityColor(type) {
        switch (type) {
            case 'tab_opened':
                return '#16a34a'
            case 'tab_closed':
                return '#dc2626'
            case 'permission_accepted':
                return '#16a34a'
            case 'permission_rejected':
                return '#dc2626'
            case 'permission_mocked':
                return '#8b5cf6'
            case 'page_visited':
                return '#3b82f6'
            case 'file_downloaded':
                return '#059669'
            default:
                return '#6b7280'
        }
    }
</script>

<RightSidebar title="Activity" {onClose} {openSidebars} {switchToResources} {switchToSettings} {switchToUserMods} {switchToActivity} {switchToAgent}>
    {#snippet children()}
        <div class="activity-timeline">
            {#each activityData.slice(0, visibleEntries) as activity, index (activity.id)}
                <!-- Date divider -->
                {#if index === 0 || !isSameDate(activity.timestamp, activityData.slice(0, visibleEntries)[index - 1]?.timestamp)}
                    <div class="date-divider">
                        <div class="date-divider-line"></div>
                        <div class="date-divider-text">{formatDate(activity.timestamp)}</div>
                        <div class="date-divider-line"></div>
                    </div>
                {/if}

                <div class="activity-entry" 
                     class:first={index === 0}
                     class:last={index === visibleEntries - 1} 
                     class:has-break={shouldShowBreak(activity, activityData.slice(0, visibleEntries)[index + 1])}
                     class:end-of-page={index === visibleEntries - 1 && visibleEntries < activityData.length}>
                    <div class="activity-timeline-icon" style="background-color: {getActivityColor(activity.type)};">
                        {@html getActivityIcon(activity.type)}
                    </div>
                    
                    <div class="activity-content">
                        <div class="activity-header">
                            <h4 class="activity-title">{activity.title}</h4>
                            <span class="activity-timestamp">{formatTimestamp(activity.timestamp)}</span>
                        </div>
                        
                        <p class="activity-description">{activity.description}</p>
                        
                        {#if activity.url}
                            <div class="activity-url">
                                <span class="activity-url-text">{activity.url}</span>
                            </div>
                        {/if}
                        
                        {#if activity.resource}
                            <div class="activity-resource">
                                <span class="activity-resource-label">Resource:</span>
                                <span class="activity-resource-name">{activity.resource}</span>
                            </div>
                        {/if}
                        
                        {#if activity.filename && activity.size}
                            <div class="activity-file-info">
                                <span class="activity-file-name">{activity.filename}</span>
                                <span class="activity-file-size">({activity.size})</span>
                            </div>
                        {/if}
                        
                        <div class="activity-meta">
                            <div class="activity-user">
                                <svg class="activity-meta-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                </svg>
                                <span>{activity.user}</span>
                            </div>
                            
                            {#if activity.agent}
                                <div class="activity-agent">
                                    <svg class="activity-meta-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                                    </svg>
                                    <span>{activity.agent}</span>
                                </div>
                            {/if}
                            
                            <div class="activity-device">
                                <svg class="activity-meta-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
                                </svg>
                                <span>{activity.device}</span>
                            </div>
                        </div>
                    </div>
                </div>


            {/each}
            
            {#if visibleEntries < activityData.length}
                <div class="load-more-container">
                    <button class="load-more-button" onclick={loadMoreEntries} disabled={loading}>
                        {#if loading}
                            <svg class="loading-spinner" viewBox="0 0 16 16">
                                <path d="M8 2 A6 6 0 0 1 14 8" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    stroke-width="2" 
                                    stroke-linecap="round"/>
                            </svg>
                            Loading...
                        {:else}
                            Load More ({activityData.length - visibleEntries} older)
                        {/if}
                    </button>
                </div>
            {:else}
                <div class="timeline-end">
                    <div class="timeline-end-icon">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                    </div>
                    <span class="timeline-end-text">Beginning of history</span>
                </div>
            {/if}
        </div>
    {/snippet}
</RightSidebar>

<style>
    .activity-timeline {
        position: relative;
        padding-left: 12px;
    }

    .activity-entry {
        position: relative;
        padding-bottom: 24px;
        margin-left: 4px;
    }



    /* Line below the icon (to next entry) */
    .activity-entry:not(.last):not(.end-of-page)::after {
        content: '';
        position: absolute;
        left: -20px;
        top: 24px;
        bottom: -8px;
        width: 2px;
        background: rgba(255, 255, 255, 0.1);
    }

    /* Short solid line with 3 dots at end of page */
    .activity-entry.end-of-page::after {
        content: '';
        position: absolute;
        left: -20px;
        top: 24px;
        height: 32px;
        width: 2px;
        background: 
            linear-gradient(to bottom, 
                rgba(255, 255, 255, 0.1) 0px,
                rgba(255, 255, 255, 0.1) 16px,
                transparent 16px,
                transparent 18px,
                rgba(255, 255, 255, 0.1) 18px,
                rgba(255, 255, 255, 0.1) 20px,
                transparent 20px,
                transparent 22px,
                rgba(255, 255, 255, 0.1) 22px,
                rgba(255, 255, 255, 0.1) 24px,
                transparent 24px,
                transparent 26px,
                rgba(255, 255, 255, 0.1) 26px,
                rgba(255, 255, 255, 0.1) 28px,
                transparent 28px
            );
    }

    /* Dotted line for time breaks only */
    .activity-entry.has-break:not(.end-of-page)::after {
        background: repeating-linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.1) 0px,
            rgba(255, 255, 255, 0.1) 2px,
            transparent 2px,
            transparent 6px
        ) !important;
    }



    .activity-timeline-icon {
        position: absolute;
        left: -31px;
        top: 0;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        border: 2px solid rgba(0, 0, 0, 0.95);
        z-index: 1;
    }

    .activity-content {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 16px;
    }

    .activity-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
        gap: 12px;
    }

    .activity-title {
        font-size: 13px;
        font-weight: 600;
        margin: 0;
        color: rgba(255, 255, 255, 0.9);
        line-height: 1.3;
        flex: 1;
    }

    .activity-timestamp {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        white-space: nowrap;
        font-weight: 400;
    }

    .activity-description {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.4;
        margin: 0 0 12px 0;
    }

    .activity-url {
        margin-bottom: 12px;
    }

    .activity-url-text {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
        word-break: break-all;
    }

    .activity-resource {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
        font-size: 11px;
    }

    .activity-resource-label {
        color: rgba(255, 255, 255, 0.4);
    }

    .activity-resource-name {
        color: rgba(255, 255, 255, 0.7);
        font-weight: 500;
    }

    .activity-file-info {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        font-size: 11px;
    }

    .activity-file-name {
        color: rgba(255, 255, 255, 0.7);
        font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
        font-weight: 500;
    }

    .activity-file-size {
        color: rgba(255, 255, 255, 0.4);
    }

    .activity-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
        padding-top: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .activity-user,
    .activity-agent,
    .activity-device {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .activity-meta-icon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
    }

    .load-more-container {
        display: flex;
        justify-content: center;
        margin-top: 16px;
        padding-top: 16px;
    }

    .load-more-button {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.8);
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .load-more-button:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.9);
    }

    .load-more-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .loading-spinner {
        width: 12px;
        height: 12px;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .timeline-end {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 24px;
        padding: 16px;
        color: rgba(255, 255, 255, 0.3);
        font-size: 11px;
        text-align: center;
    }

    .timeline-end-icon {
        width: 16px;
        height: 16px;
        opacity: 0.5;
    }

    .timeline-end-text {
        font-style: italic;
    }

    /* Date dividers */
    .date-divider {
        display: flex;
        align-items: center;
        margin: 20px 0 16px 0;
        gap: 12px;
        position: relative;
    }



    .date-divider-line {
        flex: 1;
        height: 1px;
        background: rgba(255, 255, 255, 0.1);
    }

    .date-divider-text {
        font-size: 11px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.6);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
        padding: 0 8px;
    }




</style>

<script>
    import AddAppModal from './AddAppModal.svelte'
    
    const hoverState = $state({})
    const collapsedSections = $state({})
    let showAddAppModal = $state(false)

    const apps = [
        // Default section apps (no category or category: null)
        { id: 'default1', name: 'Terminal', iconUrl: '/embed-icons/github_gist.png', type: 'pwa' },
        { id: 'default2', name: 'Browser', iconUrl: '/embed-icons/observable.png', type: 'weblink' },
        { id: 'default3', name: 'Files', iconUrl: '/embed-icons/felt.png', type: 'static' },
        
        { id: 'a1', name: 'Dashboard', iconUrl: '/embed-icons/observable.png', type: 'docker', composeService: 'webapp', category: 'Productivity', partition: { name: 'Work', color: '#a3e635' } },
        { id: 'a2', name: 'Reports', iconUrl: '/embed-icons/google_slides.png', type: 'docker', composeService: 'webapp', category: 'Analytics', partition: { name: 'Finance', color: '#22d3ee' } },
        { id: 'a3', name: 'User Admin', iconUrl: '/embed-icons/github_gist.png', type: 'docker', composeService: 'webapp', category: 'Admin' },
        { id: 'a4', name: 'Postgres UI', iconUrl: '/embed-icons/replit.png', type: 'docker', composeService: 'db', category: 'Databases' },
        { id: 'a5', name: 'Redis Monitor', iconUrl: '/embed-icons/codepen.png', type: 'docker', composeService: 'db', category: 'Databases' },
        { id: 'a6', name: 'Excalidraw', iconUrl: '/embed-icons/excalidraw.png', type: 'weblink', category: 'Design', partition: { name: 'Personal', color: '#f472b6' } },
        { id: 'a7', name: 'Figma', iconUrl: '/embed-icons/figma.png', type: 'pwa', category: 'Design' },
        { id: 'a8', name: 'Tldraw', iconUrl: '/embed-icons/tldraw.png', type: 'static', category: 'Design' },
        { id: 'a9', name: 'Google Maps', iconUrl: '/embed-icons/google_maps.png', type: 'weblink', category: 'Utilities' },
        { id: 'a10', name: 'Spotify', iconUrl: '/embed-icons/spotify.png', type: 'pwa', category: 'Media' },
        { id: 'a11', name: 'Calendar', iconUrl: '/embed-icons/google_calendar.png', type: 'weblink', category: 'Productivity', partition: { name: 'Work', color: '#a3e635' } },
        { id: 'a12', name: 'Vimeo', iconUrl: '/embed-icons/vimeo.png', type: 'weblink', category: 'Media' },
        { id: 'a13', name: 'Val Town', iconUrl: '/embed-icons/val_town.png', type: 'weblink', category: 'Dev' },
        { id: 'a14', name: 'Desmos', iconUrl: '/embed-icons/desmos.png', type: 'weblink', category: 'Math' },
        { id: 'a15', name: 'Observable', iconUrl: '/embed-icons/observable.png', type: 'weblink', category: 'Dev' },
        { id: 'a16', name: 'Notion', iconUrl: '/embed-icons/felt.png', type: 'pwa', category: 'Productivity', partition: { name: 'Personal', color: '#f472b6' } },
        { id: 'a17', name: 'Slack', iconUrl: '/embed-icons/codesandbox.png', type: 'pwa', category: 'Productivity', partition: { name: 'Work', color: '#a3e635' } },
        { id: 'a18', name: 'Discord', iconUrl: '/embed-icons/scratch.png', type: 'pwa', category: 'Productivity' },
        { id: 'a19', name: 'Photoshop', iconUrl: '/embed-icons/figma.png', type: 'pwa', category: 'Design', partition: { name: 'Creative', color: '#fb7185' } },
        { id: 'a20', name: 'Illustrator', iconUrl: '/embed-icons/tldraw.png', type: 'pwa', category: 'Design', partition: { name: 'Creative', color: '#fb7185' } },
        { id: 'a21', name: 'Sketch', iconUrl: '/embed-icons/excalidraw.png', type: 'static', category: 'Design' },
        { id: 'a22', name: 'Blender', iconUrl: '/embed-icons/felt.png', type: 'static', category: 'Design', partition: { name: 'Creative', color: '#fb7185' } },
        { id: 'a23', name: 'YouTube', iconUrl: '/embed-icons/youtube.png', type: 'weblink', category: 'Media' },
        { id: 'a24', name: 'Netflix', iconUrl: '/embed-icons/vimeo.png', type: 'pwa', category: 'Media', partition: { name: 'Personal', color: '#f472b6' } },
        { id: 'a25', name: 'Twitch', iconUrl: '/embed-icons/spotify.png', type: 'weblink', category: 'Media' },
        { id: 'a26', name: 'VS Code', iconUrl: '/embed-icons/github_gist.png', type: 'pwa', category: 'Dev', partition: { name: 'Work', color: '#a3e635' } },
        { id: 'a27', name: 'GitHub Desktop', iconUrl: '/embed-icons/github_gist.png', type: 'pwa', category: 'Dev', partition: { name: 'Work', color: '#a3e635' } },
        { id: 'a28', name: 'Postman', iconUrl: '/embed-icons/replit.png', type: 'pwa', category: 'Dev' },
        { id: 'a29', name: 'Calculator', iconUrl: '/embed-icons/desmos.png', type: 'static', category: 'Utilities' },
        { id: 'a30', name: 'Weather', iconUrl: '/embed-icons/google_maps.png', type: 'weblink', category: 'Utilities', partition: { name: 'Personal', color: '#f472b6' } },
        // Apps without tags for layout verification
        { id: 'a31', name: 'Calculator', iconUrl: '/embed-icons/desmos.png', type: null, category: 'Utilities' },
        { id: 'a32', name: 'Notes', iconUrl: null, type: null, category: 'Utilities' },
        { id: 'a33', name: 'TextEdit', iconUrl: null, type: null, category: 'Utilities' },
        { id: 'a34', name: 'Mail', iconUrl: '/embed-icons/google_calendar.png', type: null, category: 'Productivity' },
        { id: 'a35', name: 'Clock', iconUrl: null, type: null, category: 'Utilities' }
    ]

    const appsByCategory = $derived.by(() => {
        const grouped = {}
        for (const app of apps) {
            if (!app.category) continue
            const key = app.category
            grouped[key] ??= []
            grouped[key].push(app)
        }
        return grouped
    })

    const serviceApps = $derived(apps.filter(app => app.composeService))
    const defaultApps = $derived(apps.filter(app => !app.category))

    function showHover(appId) {
        const existing = hoverState[appId]
        if (existing?.timer) clearTimeout(existing.timer)
        
        const timer = setTimeout(() => {
            hoverState[appId] = { timer: null, visible: true }
        }, 1000)
        hoverState[appId] = { timer, visible: false }
    }

    function hideHover(appId) {
        const existing = hoverState[appId]
        if (existing?.timer) clearTimeout(existing.timer)
        hoverState[appId] = { timer: null, visible: false }
    }

    function openApp(e, app) {
        e.preventDefault()
        console.log('open app', app)
    }

    function actionSettings(e, app) {
        e.stopPropagation()
        console.log('settings', app)
    }

    function actionLogs(e, app) {
        e.stopPropagation()
        console.log('logs', app)
    }

    function actionEdit(e, app) {
        e.stopPropagation()
        console.log('edit', app)
    }

    function typeLabel(type) {
        if (!type) return null
        if (type === 'docker') return 'Docker'
        if (type === 'pwa') return 'PWA'
        if (type === 'static') return 'Static'
        return 'Link'
    }

    function toggleSection(sectionName) {
        collapsedSections[sectionName] = !collapsedSections[sectionName]
    }

    function openAddAppModal() {
        showAddAppModal = true
    }

    function closeAddAppModal() {
        showAddAppModal = false
    }
</script>

{#snippet AppCard(app, showServiceTag = false)}
    {@const hs = hoverState[app.id]}
    <div
        class="relative group rounded-xl border border-white/5 bg-black/20 hover:bg-white/8 transition-colors px-4 pt-4 pb-3 cursor-pointer w-38 h-38"
        role="button"
        tabindex="0"
        onmouseenter={() => showHover(app.id)}
        onmouseleave={() => hideHover(app.id)}
        onmousedown={(e) => openApp(e, app)}
        aria-label={`Open ${app.name}`}
    >
        <div class="flex flex-col items-center justify-center text-center gap-2 pt-3 pb-5 px-1">
            {#if app.iconUrl}
                <img src={app.iconUrl} alt="{app.name} icon" class="w-16 h-16 rounded-lg object-cover" />
            {:else}
                <div class="w-16 h-16 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white/80 text-xl font-semibold">
                    {(app.name || '?').trim().charAt(0).toUpperCase()}
                </div>
            {/if}
            
            <div class="text-white/90 text-sm font-medium truncate w-full px-2" title={app.name}>
                {app.name}
            </div>
        </div>

        <div class="absolute bottom-2 left-2 right-2 flex items-center gap-1 z-10">
            {#if typeLabel(app.type)}
                <span class="px-1.5 py-1 rounded text-[10px] leading-none border border-white/20 bg-white/10 text-white/70 flex-shrink-0">
                    {typeLabel(app.type)}
                </span>
            {/if}
            {#if showServiceTag && app.composeService}
                <span class="px-1.5 py-1 rounded text-[10px] leading-none border border-white/20 bg-white/10 text-white/70 flex-shrink-0">
                    {app.composeService}
                </span>
            {/if}
            {#if app.partition?.name}
                <span 
                    style="color:{app.partition.color};border-color:{app.partition.color}66"
                    class="px-1.5 py-1 rounded text-[10px] leading-none border bg-white/10 flex-shrink-0"
                >
                    {app.partition.name}
                </span>
            {/if}
        </div>

        {#if hs?.visible}
            <div class="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 rounded-xl"
                style="opacity:{hs?.visible ? 1 : 0}; transition: opacity 150ms ease"
                aria-hidden={!hs?.visible}
            >
                <button title="Settings" aria-label="Settings"
                    onmousedown={(e) => actionSettings(e, app)}
                    class="p-1.5 rounded-md bg-black/70 border border-white/20 text-white/80 hover:text-white hover:bg-black/80 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5"><path d="M11.78 2.25c-.29 0-.57.02-.85.05a.75.75 0 0 0-.64.85l.13 1.03a8.97 8.97 0 0 0-1.84 1.06l-.9-.51a.75.75 0 0 0-1.02.27c-.26.45-.48.92-.66 1.41a.75.75 0 0 0 .36.92l.9.52c-.12.59-.18 1.2-.18 1.82 0 .62.06 1.23.18 1.82l-.9.52a.75.75 0 0 0-.36.92c.18.49.4.96.66 1.41.2.34.64.46 1.02.27l.9-.51c.57.42 1.2.77 1.84 1.06l-.13 1.03a.75.75 0 0 0 .64.85c.28.03.56.05.85.05.29 0 .57-.02.85-.05a.75.75 0 0 0 .64-.85l-.13-1.03c.64-.29 1.27-.64 1.84-1.06l.9.51a.75.75 0 0 0 1.02-.27c.26-.45.48-.92.66-1.41a.75.75 0 0 0-.36-.92l-.9-.52c.12-.59.18-1.2.18-1.82 0-.62-.06-1.23-.18-1.82l.9-.52a.75.75 0 0 0 .36-.92 8 8 0 0 0-.66-1.41.75.75 0 0 0-1.02-.27l-.9.51a8.97 8.97 0 0 0-1.84-1.06l.13-1.03a.75.75 0 0 0-.64-.85 9.7 9.7 0 0 0-1.7 0Zm.22 5.5a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5Z"/></svg>
                </button>
                <button title="Logs" aria-label="Logs"
                    onmousedown={(e) => actionLogs(e, app)}
                    class="p-1.5 rounded-md bg-black/70 border border-white/20 text-white/80 hover:text-white hover:bg-black/80 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5"><path d="M19.5 14.25v-2.878a2.25 2.25 0 0 0-.659-1.591l-4.622-4.622A2.25 2.25 0 0 0 12.628 4.5H8.25A2.25 2.25 0 0 0 6 6.75v10.5A2.25 2.25 0 0 0 8.25 19.5h7.5a2.25 2.25 0 0 0 2.25-2.25Zm-6.75-9v3.375a.375.375 0 0 0 .375.375H16.5"/><path d="M8.25 15.75h7.5m-7.5-3h7.5m-7.5-3h3.75"/></svg>
                </button>
                <button title="Edit" aria-label="Edit"
                    onmousedown={(e) => actionEdit(e, app)}
                    class="p-1.5 rounded-md bg-black/70 border border-white/20 text-white/80 hover:text-white hover:bg-black/80 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-3.5 h-3.5"><path d="M21.731 2.269a2.625 2.625 0 0 0-3.713 0l-1.157 1.157 3.713 3.713 1.157-1.157a2.625 2.625 0 0 0 0-3.713Z"/><path d="M3 21v-3.75a2.25 2.25 0 0 1 .659-1.591l9.75-9.75 3.713 3.713-9.75 9.75A2.25 2.25 0 0 1 6.75 21H3Z"/></svg>
                </button>
            </div>
        {/if}
    </div>
{/snippet}

<div class="absolute top-[-50px] left-1/2 transform -translate-x-1/2 flex items-center justify-between z-10" style="width: 100%;">
    <h2 class="text-white/90 text-2xl font-semibold ml-2 mt-[-10px]">
        Apps
        
        <button 
            class="p-2 text-white/70 ml-4 relative t-[2px] hover:text-white/90 hover:bg-white/10 rounded-lg transition-colors z-20 cursor-pointer" 
            onmousedown={openAddAppModal}
            aria-label="Add App"
            title="Add App"
        >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
            <path d="M12 4.5a.75.75 0 0 1 .75.75v6h6a.75.75 0 0 1 0 1.5h-6v6a.75.75 0 0 1-1.5 0v-6h-6a.75.75 0 0 1 0-1.5h6v-6A.75.75 0 0 1 12 4.5Z"/>
            </svg>
        </button>
   
    </h2>

    <button 
        class="p-2 text-white/70 hover:text-white/90 mr-[-30px] mb-[-20px] opacity-50 hover:opacity-100 rounded-lg transition-colors cursor-pointer" 
        onmousedown={() => showAppsOverlay = false}
        aria-label="Close Apps"
        title="Close Apps"
    >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
            <path d="M6.225 4.811a1 1 0 0 0-1.414 1.414L10.586 12 4.81 17.775a1 1 0 1 0 1.414 1.414L12 13.414l5.775 5.775a1 1 0 0 0 1.414-1.414L13.414 12l5.775-5.775a1 1 0 0 0-1.414-1.414L12 10.586 6.225 4.81Z"/>
        </svg>
    </button>
</div>


<div class="w-full h-full px-6 pt-6 pb-4 select-none overflow-y-auto relative" style="transform: translateZ(0); will-change: scroll-position;">
    <!-- Default section without header -->
    {#if defaultApps.length > 0}
        <section class="mb-6">
            <div class="flex flex-wrap gap-3">
                {#each defaultApps as app}
                    {@render AppCard(app, false)}
                {/each}
            </div>
        </section>
    {/if}

    {#each Object.keys(appsByCategory).sort() as category, i}
        <section class="{i > 0 || defaultApps.length > 0 ? 'mt-8' : ''} mb-6">
            <div class="flex items-center gap-2 mb-3 cursor-pointer" role="button" tabindex="0" onmousedown={() => toggleSection(category)}>
                <h3 class="text-white/80 text-sm font-semibold tracking-wide">{category}</h3>
                <span class="text-white/40 text-xs">({appsByCategory[category].length})</span>
                <svg class="w-4 h-4 text-white/60 transition-transform {collapsedSections[category] ? 'rotate-180' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 16.5l-6-6h12l-6 6z"/>
                </svg>
                <span class="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></span>
            </div>
            {#if !collapsedSections[category]}
                <div class="flex flex-wrap gap-3">
                    {#each appsByCategory[category] as app}
                        {@render AppCard(app, true)}
                    {/each}
                </div>
            {/if}
        </section>
    {/each}

    <!-- Services Section -->
    {#if serviceApps.length > 0}
        <section class="mt-8 mb-0">
            <div class="flex items-center gap-2 mb-3 cursor-pointer" role="button" tabindex="0" onmousedown={() => toggleSection('Services')}>
                <h3 class="text-white/80 text-sm font-semibold tracking-wide">Services</h3>
                <span class="text-white/40 text-xs">({serviceApps.length})</span>
                <svg class="w-4 h-4 text-white/60 transition-transform {collapsedSections['Services'] ? 'rotate-180' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 16.5l-6-6h12l-6 6z"/>
                </svg>
                <span class="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></span>
            </div>
            {#if !collapsedSections['Services']}
                <div class="flex flex-wrap gap-3">
                    {#each serviceApps as app}
                        {@render AppCard(app, false)}
                    {/each}
                </div>
            {/if}
        </section>
    {/if}
</div>

<AddAppModal 
    show={showAddAppModal} 
    onClose={closeAddAppModal} 
/>
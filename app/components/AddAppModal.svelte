<script>
    let { show = false, onClose = () => {} } = $props()
    
    let activeTab = $state('catalog')
    let appFormData = $state({
        name: '',
        iconUrl: '',
        pinToAppPins: false,
        openInMenu: false,
        dataPartitions: ['current'],
        startOnBrowserStart: false,
        // URL tab specific
        url: '',
        // Repo tab specific
        githubUrl: '',
        branch: 'main',
        githubToken: '',
        pathType: 'compose',
        path: ''
    })
    
    let showPartitionDropdown = $state(false)
    let activeTooltip = $state(null)
    
    const availablePartitions = [
        { id: 'current', name: 'Current Space Partition', description: 'Default partition for this workspace' },
        { id: 'work', name: 'Work', description: 'Business and professional apps' },
        { id: 'personal', name: 'Personal', description: 'Personal apps and data' },
        { id: 'development', name: 'Development', description: 'Development tools and environments' },
        { id: 'testing', name: 'Testing', description: 'Testing and staging environments' },
        { id: 'isolated', name: 'Isolated', description: 'Completely isolated environment' }
    ]

    function switchTab(tab) {
        activeTab = tab
    }

    function selectCatalogApp(app) {
        // Don't prefill name or icon URL, let them come from manifest
        // Switch to appropriate tab based on app type
        if (app.type === 'docker') {
            activeTab = 'repo'
        } else {
            activeTab = 'url'
            appFormData.url = app.url || ''
        }
    }

    function submitApp() {
        console.log('Submit app:', appFormData)
        onClose()
    }

    function handleClose() {
        // Reset form
        Object.assign(appFormData, {
            name: '',
            iconUrl: '',
            pinToAppPins: false,
            openInMenu: false,
            dataPartitions: ['current'],
            startOnBrowserStart: false,
            url: '',
            githubUrl: '',
            branch: 'main',
            githubToken: '',
            pathType: 'compose',
            path: ''
        })
        activeTab = 'catalog'
        onClose()
    }

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) {
            handleClose()
        }
    }

    function handleModalClick() {
        // Close partition dropdown when clicking elsewhere in modal
        showPartitionDropdown = false
    }

    function togglePartition(partitionId) {
        if (appFormData.dataPartitions.includes(partitionId)) {
            if (appFormData.dataPartitions.length > 1) {
                appFormData.dataPartitions = appFormData.dataPartitions.filter(id => id !== partitionId)
            }
        } else {
            appFormData.dataPartitions = [...appFormData.dataPartitions, partitionId]
        }
    }

    function getSelectedPartitionNames() {
        return appFormData.dataPartitions
            .map(id => availablePartitions.find(p => p.id === id)?.name)
            .filter(Boolean)
            .join(', ')
    }

    function showTooltip(tooltipId) {
        activeTooltip = tooltipId
    }

    function hideTooltip() {
        activeTooltip = null
    }

    // Catalog apps data
    const catalogApps = [
        { id: 'cat1', name: 'VS Code', iconUrl: '/embed-icons/github_gist.png', type: 'url', url: 'https://vscode.dev' },
        { id: 'cat2', name: 'Figma', iconUrl: '/embed-icons/figma.png', type: 'url', url: 'https://figma.com' },
        { id: 'cat3', name: 'Excalidraw', iconUrl: '/embed-icons/excalidraw.png', type: 'url', url: 'https://excalidraw.com' },
        { id: 'cat4', name: 'Notion', iconUrl: '/embed-icons/felt.png', type: 'url', url: 'https://notion.so' },
        { id: 'cat5', name: 'Postgres', iconUrl: '/embed-icons/replit.png', type: 'docker', description: 'PostgreSQL database with pgAdmin' },
        { id: 'cat6', name: 'Redis', iconUrl: '/embed-icons/codepen.png', type: 'docker', description: 'Redis cache with RedisInsight' },
        { id: 'cat7', name: 'MongoDB', iconUrl: '/embed-icons/codesandbox.png', type: 'docker', description: 'MongoDB with Mongo Express' },
        { id: 'cat8', name: 'Jupyter', iconUrl: '/embed-icons/observable.png', type: 'docker', description: 'Jupyter notebook server' },
        { id: 'cat9', name: 'Grafana', iconUrl: '/embed-icons/desmos.png', type: 'docker', description: 'Analytics & monitoring platform' },
        { id: 'cat10', name: 'Nextcloud', iconUrl: '/embed-icons/google_calendar.png', type: 'docker', description: 'Self-hosted cloud storage' },
        { id: 'cat11', name: 'GitLab', iconUrl: '/embed-icons/github_gist.png', type: 'docker', description: 'Self-hosted Git repository' },
        { id: 'cat12', name: 'Miro', iconUrl: '/embed-icons/tldraw.png', type: 'url', url: 'https://miro.com' }
    ]
</script>

{#if show}
    <div 
        class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm"
        style="padding-top: 15vh;"
        onmousedown={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabindex="-1"
    >
        <div class="bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-4xl h-[70vh] shadow-2xl flex flex-col" onmousedown={handleModalClick} role="presentation">
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
                <h2 id="modal-title" class="text-xl font-semibold text-white/90">Add New App</h2>
                <button 
                    class="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white/90"
                    onmousedown={handleClose}
                    aria-label="Close modal"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                        <path d="M6.225 4.811a1 1 0 0 0-1.414 1.414L10.586 12 4.81 17.775a1 1 0 1 0 1.414 1.414L12 13.414l5.775 5.775a1 1 0 0 0 1.414-1.414L13.414 12l5.775-5.775a1 1 0 0 0-1.414-1.414L12 10.586 6.225 4.81Z"/>
                    </svg>
                </button>
            </div>

            <!-- Tabs -->
            <div class="flex gap-2 p-4 pb-4 flex-shrink-0">
                <button 
                    class="px-4 py-2 text-sm font-medium transition-colors rounded-lg cursor-pointer {activeTab === 'catalog' ? 'text-white bg-white/14 border border-white/20' : 'text-white/70 bg-white/5 border border-white/5 hover:text-white/90 hover:bg-white/10 hover:border-white/10'}"
                    onmousedown={() => switchTab('catalog')}
                >
                    Catalog
                </button>
                <button 
                    class="px-4 py-2 text-sm font-medium transition-colors rounded-lg cursor-pointer {activeTab === 'url' ? 'text-white bg-white/14 border border-white/20' : 'text-white/70 bg-white/5 border border-white/5 hover:text-white/90 hover:bg-white/10 hover:border-white/10'}"
                    onmousedown={() => switchTab('url')}
                >
                    URL
                </button>
                <button 
                    class="px-4 py-2 text-sm font-medium transition-colors rounded-lg cursor-pointer {activeTab === 'repo' ? 'text-white bg-white/14 border border-white/20' : 'text-white/70 bg-white/5 border border-white/5 hover:text-white/90 hover:bg-white/10 hover:border-white/10'}"
                    onmousedown={() => switchTab('repo')}
                >
                    Repository
                </button>
            </div>

            <!-- Content -->
            <div class="px-6 pt-4 pb-6 overflow-y-auto flex-1 min-h-0 modal-content">
                {#if activeTab === 'catalog'}
                    <!-- Catalog Tab -->
                    <div class="space-y-6">
                        <p class="text-white/70 text-sm">Choose from our curated collection of apps</p>
                        
                        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {#each catalogApps as app}
                                <div 
                                    class="group relative p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer hover:border-white/20 h-40"
                                    onmousedown={() => selectCatalogApp(app)}
                                    role="button"
                                    tabindex="0"
                                    aria-label="Select {app.name}"
                                >
                                    <div class="flex flex-col items-center space-y-3 h-full">
                                        <img src={app.iconUrl} alt="{app.name} icon" class="w-12 h-12 rounded-lg flex-shrink-0" />
                                        <div class="flex-1 flex flex-col justify-center w-full">
                                            <h3 class="font-medium text-white/90 text-sm text-center">{app.name}</h3>
                                            <div class="text-white/60 text-xs mt-3 text-left leading-4 overflow-y-auto max-h-8 min-h-8 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                                                {app.description || ''}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <!-- Badge -->
                                    <div class="absolute top-2 right-2">
                                        <span class="px-2 py-1 rounded text-xs border {app.type === 'docker' ? 'border-blue-500/50 bg-blue-500/20 text-blue-300' : 'border-green-500/50 bg-green-500/20 text-green-300'}">
                                            {app.type === 'docker' ? 'Docker' : 'URL'}
                                        </span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {:else if activeTab === 'url'}
                    <!-- URL Tab -->
                    <div class="space-y-6">
                        <!-- URL Input Section -->
                        <div class="space-y-4 p-4 rounded-xl border border-white/10 bg-white/5">
                            <h3 class="text-lg font-medium text-white/90">Web Application URL</h3>
                            <div>
                                <label for="app-url" class="block text-sm font-medium text-white/70 mb-2">Application URL (required)</label>
                                <input 
                                    id="app-url"
                                    type="url" 
                                    bind:value={appFormData.url}
                                    placeholder="https://app.example.com"
                                    class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
                                />
                            </div>
                        </div>

                        <!-- Common Settings -->
                        {@render CommonSettings()}
                    </div>
                {:else if activeTab === 'repo'}
                    <!-- Repository Tab -->
                    <div class="space-y-6">
                        <!-- Repository Settings Section -->
                        <div class="space-y-4 p-4 rounded-xl border border-white/10 bg-white/5">
                            <h3 class="text-lg font-medium text-white/90">Repository Settings</h3>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label for="github-url" class="block text-sm font-medium text-white/70 mb-2">GitHub URL (required)</label>
                                    <input 
                                        id="github-url"
                                        type="url" 
                                        bind:value={appFormData.githubUrl}
                                        placeholder="https://github.com/user/repo"
                                        class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
                                    />
                                </div>
                                
                                <div>
                                    <label for="branch" class="block text-sm font-medium text-white/70 mb-2">Branch</label>
                                    <input 
                                        id="branch"
                                        type="text" 
                                        bind:value={appFormData.branch}
                                        placeholder="main"
                                        class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label for="github-token" class="block text-sm font-medium text-white/70 mb-2">GitHub Token</label>
                                <input 
                                    id="github-token"
                                    type="password" 
                                    bind:value={appFormData.githubToken}
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                    class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
                                />
                            </div>
                            
                            <div class="space-y-4">
                                <fieldset>
                                    <legend class="block text-sm font-medium text-white/70 mb-3">Application Type</legend>
                                    <div class="flex items-center gap-6">
                                        <div class="flex items-center">
                                            <input 
                                                id="path-compose"
                                                type="radio" 
                                                name="pathType"
                                                value="compose"
                                                bind:group={appFormData.pathType}
                                                class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                                            />
                                            <label for="path-compose" class="ml-2 text-sm text-white/80">Docker Compose</label>
                                        </div>
                                        <div class="flex items-center">
                                            <input 
                                                id="path-dockerfile"
                                                type="radio" 
                                                name="pathType"
                                                value="dockerfile"
                                                bind:group={appFormData.pathType}
                                                class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                                            />
                                            <label for="path-dockerfile" class="ml-2 text-sm text-white/80">Dockerfile</label>
                                        </div>
                                        <div class="flex items-center">
                                            <input 
                                                id="path-static"
                                                type="radio" 
                                                name="pathType"
                                                value="static"
                                                bind:group={appFormData.pathType}
                                                class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                                            />
                                            <label for="path-static" class="ml-2 text-sm text-white/80">Static HTML</label>
                                        </div>
                                    </div>
                                </fieldset>
                                
                                <div>
                                    <label for="app-path" class="block text-sm font-medium text-white/70 mb-2">
                                        {#if appFormData.pathType === 'compose'}
                                            Compose File Path
                                        {:else if appFormData.pathType === 'dockerfile'}
                                            Dockerfile Path
                                        {:else}
                                            Index HTML Path
                                        {/if}
                                    </label>
                                    <input 
                                        id="app-path"
                                        type="text" 
                                        bind:value={appFormData.path}
                                        placeholder={appFormData.pathType === 'compose' ? 'docker-compose.yml' : appFormData.pathType === 'dockerfile' ? 'Dockerfile' : 'index.html'}
                                        class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- Common Settings -->
                        {@render CommonSettings()}
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-end gap-3 p-6 border-t border-white/10 flex-shrink-0">
                <button 
                    class="px-4 py-2 text-sm font-medium text-white/70 hover:text-white/90 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                    onmousedown={handleClose}
                >
                    Cancel
                </button>
                <button 
                    class="px-6 py-2 text-sm font-medium bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none cursor-pointer"
                    onmousedown={submitApp}
                    disabled={activeTab === 'url' && !appFormData.url || activeTab === 'repo' && !appFormData.githubUrl}
                >
                    Add App
                </button>
            </div>
        </div>
    </div>
{/if}

{#snippet CommonSettings()}
    <div class="space-y-4 p-4 rounded-xl border border-white/10 bg-white/5">
        <h3 class="text-lg font-medium text-white/90">App Settings</h3>
        
        <div>
            <label for="app-name" class="block text-sm font-medium text-white/70 mb-2">App Name</label>
            <input 
                id="app-name"
                type="text" 
                bind:value={appFormData.name}
                placeholder="Use from manifest or webpage"
                class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
            />
        </div>
        
        <div>
            <label for="icon-url" class="block text-sm font-medium text-white/70 mb-2">Custom Icon URL</label>
            <input 
                id="icon-url"
                type="url" 
                bind:value={appFormData.iconUrl}
                placeholder="Use from manifest or webpage"
                class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
            />
        </div>
        
        <div class="space-y-3">
            <div class="space-y-2">
                <div class="flex items-center">
                    <input 
                        id="pin-to-apps" 
                        type="checkbox" 
                        bind:checked={appFormData.pinToAppPins}
                        class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                    />
                    <label for="pin-to-apps" class="ml-2 text-sm text-white/80 flex items-center gap-2">
                        Pin to app pins
                        <div class="relative">
                            <svg 
                                class="w-3.5 h-3.5 text-white/50 hover:text-white/70 cursor-help" 
                                onmouseenter={() => showTooltip('pin-to-apps-info')}
                                onmouseleave={hideTooltip}
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                                role="button"
                                aria-label="Show pin to apps info"
                                tabindex="0"
                            >
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {#if activeTooltip === 'pin-to-apps-info'}
                                <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-black/90 border border-white/20 rounded-lg shadow-xl z-50">
                                    <div class="text-xs text-white/90 mb-2 font-medium">Pin to App Pins</div>
                                    <img src="/placeholder-pin-to-apps.png" alt="Pin to app pins explanation" class="w-full h-32 object-cover rounded border border-white/10 mb-2" />
                                    <div class="text-xs text-white/70">Shows app in the quick access pin bar for easy launching</div>
                                </div>
                            {/if}
                        </div>
                    </label>
                </div>
                
                {#if appFormData.pinToAppPins}
                    <div class="ml-6 flex items-center">
                        <input 
                            id="start-browser" 
                            type="checkbox" 
                            bind:checked={appFormData.startOnBrowserStart}
                            class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                        />
                        <label for="start-browser" class="ml-2 text-sm text-white/80">Always start on browser start</label>
                    </div>
                {/if}
            </div>
            
            <div class="flex items-center">
                <input 
                    id="open-in-menu" 
                    type="checkbox" 
                    bind:checked={appFormData.openInMenu}
                    class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                />
                <label for="open-in-menu" class="ml-2 text-sm text-white/80 flex items-center gap-2">
                    Open in menu
                    <div class="relative">
                        <svg 
                            class="w-3.5 h-3.5 text-white/50 hover:text-white/70 cursor-help" 
                            onmouseenter={() => showTooltip('open-in-menu-info')}
                            onmouseleave={hideTooltip}
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                            role="button"
                            aria-label="Show open in menu info"
                            tabindex="0"
                        >
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {#if activeTooltip === 'open-in-menu-info'}
                            <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-black/90 border border-white/20 rounded-lg shadow-xl z-50">
                                <div class="text-xs text-white/90 mb-2 font-medium">Open in Menu</div>
                                <img src="/placeholder-open-in-menu.png" alt="Open in menu explanation" class="w-full h-32 object-cover rounded border border-white/10 mb-2" />
                                <div class="text-xs text-white/70">App opens in a dropdown menu instead of a new tab or window</div>
                            </div>
                        {/if}
                    </div>
                </label>
            </div>
        </div>
        
        <div>
            <label for="data-partitions" class="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
                Data Container Partitions
                <div class="relative">
                    <svg 
                        class="w-3.5 h-3.5 text-white/50 hover:text-white/70 cursor-help" 
                        onmouseenter={() => showTooltip('data-partitions-info')}
                        onmouseleave={hideTooltip}
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                        role="button"
                        aria-label="Show data partitions info"
                        tabindex="0"
                    >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {#if activeTooltip === 'data-partitions-info'}
                        <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-black/90 border border-white/20 rounded-lg shadow-xl z-50">
                            <div class="text-xs text-white/90 mb-2 font-medium">Data Container Partitions</div>
                            <img src="/placeholder-data-partitions.png" alt="Data partitions explanation" class="w-full h-32 object-cover rounded border border-white/10 mb-2" />
                            <div class="text-xs text-white/70">Isolate app data into separate containers for security and organization</div>
                        </div>
                    {/if}
                </div>
            </label>
            <div class="relative">
                <button
                    type="button"
                    class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-left focus:outline-none focus:border-green-500 focus:bg-white/15 flex items-center justify-between cursor-pointer"
                    onmousedown={(e) => {
                        e.stopPropagation()
                        showPartitionDropdown = !showPartitionDropdown
                    }}
                >
                    <span class="text-sm">{getSelectedPartitionNames()}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-white/60">
                        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                    </svg>
                </button>
                
                {#if showPartitionDropdown}
                    <div class="absolute top-full left-0 right-0 mt-1 bg-black/90 border border-white/20 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                        {#each availablePartitions as partition}
                            <div 
                                class="px-3 py-2 hover:bg-white/10 cursor-pointer flex items-center justify-between"
                                role="button"
                                tabindex="0"
                                onmousedown={(e) => {
                                    e.stopPropagation()
                                    togglePartition(partition.id)
                                }}
                            >
                                <div class="flex-1">
                                    <div class="text-sm text-white/90 font-medium">{partition.name}</div>
                                    <div class="text-xs text-white/60">{partition.description}</div>
                                </div>
                                <div class="ml-3">
                                    {#if appFormData.dataPartitions.includes(partition.id)}
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-green-500">
                                            <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                                        </svg>
                                    {:else}
                                        <div class="w-4 h-4 border border-white/30 rounded"></div>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
        

    </div>
{/snippet}

<style>
    .modal-content {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
    
    .modal-content::-webkit-scrollbar {
        width: 6px;
    }

    .modal-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .modal-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .modal-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
</style>

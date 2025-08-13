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
        dockerfilePath: '',
        composePath: '',
        indexPath: ''
    })
    
    let showPartitionDropdown = $state(false)
    
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
        // Pre-fill form with catalog app data
        appFormData.name = app.name
        // Don't prefill icon URL, let it come from manifest
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
            dockerfilePath: '',
            composePath: '',
            indexPath: ''
        })
        activeTab = 'catalog'
        onClose()
    }

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) {
            handleClose()
        }
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
        class="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/60 backdrop-blur-sm"
        onmousedown={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabindex="-1"
    >
        <div class="bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-white/10">
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
            <div class="flex gap-2 p-4 pb-0">
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
            <div class="px-6 pt-4 pb-6 overflow-y-auto max-h-[calc(90vh-200px)]">
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
                                <label for="app-url" class="block text-sm font-medium text-white/70 mb-2">Application URL</label>
                                <input 
                                    id="app-url"
                                    type="url" 
                                    bind:value={appFormData.url}
                                    placeholder="https://example.com"
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
                                    <label for="github-url" class="block text-sm font-medium text-white/70 mb-2">GitHub URL</label>
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
                                <label for="github-token" class="block text-sm font-medium text-white/70 mb-2">GitHub Token (optional)</label>
                                <input 
                                    id="github-token"
                                    type="password" 
                                    bind:value={appFormData.githubToken}
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                    class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
                                />
                            </div>
                            
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label for="dockerfile-path" class="block text-sm font-medium text-white/70 mb-2">Dockerfile Path</label>
                                    <input 
                                        id="dockerfile-path"
                                        type="text" 
                                        bind:value={appFormData.dockerfilePath}
                                        placeholder="Dockerfile"
                                        class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
                                    />
                                </div>
                                
                                <div>
                                    <label for="compose-path" class="block text-sm font-medium text-white/70 mb-2">Compose File Path</label>
                                    <input 
                                        id="compose-path"
                                        type="text" 
                                        bind:value={appFormData.composePath}
                                        placeholder="docker-compose.yml"
                                        class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
                                    />
                                </div>
                                
                                <div>
                                    <label for="index-path" class="block text-sm font-medium text-white/70 mb-2">Index.html Path</label>
                                    <input 
                                        id="index-path"
                                        type="text" 
                                        bind:value={appFormData.indexPath}
                                        placeholder="index.html"
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
            <div class="flex items-center justify-end gap-3 p-6 border-t border-white/10">
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
            <label for="app-name" class="block text-sm font-medium text-white/70 mb-2">App Name (optional)</label>
            <input 
                id="app-name"
                type="text" 
                bind:value={appFormData.name}
                placeholder="My Custom App"
                class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
            />
        </div>
        
        <div>
            <label for="icon-url" class="block text-sm font-medium text-white/70 mb-2">Custom Icon URL (optional)</label>
            <input 
                id="icon-url"
                type="url" 
                bind:value={appFormData.iconUrl}
                placeholder="Use from manifest or webpage"
                class="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-green-500 focus:bg-white/15"
            />
        </div>
        
        <div class="space-y-3">
            <div class="flex items-center">
                <input 
                    id="pin-to-apps" 
                    type="checkbox" 
                    bind:checked={appFormData.pinToAppPins}
                    class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                />
                <label for="pin-to-apps" class="ml-2 text-sm text-white/80">Pin to app pins</label>
            </div>
            
            <div class="flex items-center">
                <input 
                    id="open-in-menu" 
                    type="checkbox" 
                    bind:checked={appFormData.openInMenu}
                    class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                />
                <label for="open-in-menu" class="ml-2 text-sm text-white/80">Open in menu</label>
            </div>
        </div>
        
        <div>
            <label for="data-partitions" class="block text-sm font-medium text-white/70 mb-2">Data Container Partitions</label>
            <div id="data-partitions" class="p-3 bg-white/5 border border-white/10 rounded-lg">
                <p class="text-xs text-white/60">Configure data partitions for app isolation (coming soon)</p>
            </div>
        </div>
        
        <div class="space-y-3">
            <div class="flex items-center">
                <input 
                    id="start-browser" 
                    type="checkbox" 
                    bind:checked={appFormData.startOnBrowserStart}
                    disabled={!appFormData.pinToAppPins}
                    class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <label for="start-browser" class="ml-2 text-sm text-white/80 {!appFormData.pinToAppPins ? 'opacity-50' : ''}">
                    Always start on browser start
                </label>
                {#if !appFormData.pinToAppPins}
                    <div class="ml-2 group relative">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-white/40">
                            <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
                        </svg>
                        <div class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-black/90 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            Only available when app is pinned
                        </div>
                    </div>
                {/if}
            </div>
            
            <div class="flex items-center">
                <input 
                    id="start-first-use" 
                    type="checkbox" 
                    bind:checked={appFormData.startOnFirstUse}
                    class="w-4 h-4 bg-white/10 border border-white/30 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-0 checked:bg-green-600 checked:border-green-600"
                />
                <label for="start-first-use" class="ml-2 text-sm text-white/80">Start on first use</label>
            </div>
        </div>
    </div>
{/snippet}

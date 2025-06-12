<script>
    import RightSidebar from './RightSidebar.svelte'
    
    let { onClose, resourcesSidebarOpen, settingsSidebarOpen, switchToResources, switchToSettings, tabs = [], closed = [] } = $props()

    // Settings state
    let defaultSearchEngine = $state('google')
    let defaultNewTabUrl = $state('about:newtab')
    let selectedAiProvider = $state('writer')
    let customSearchUrl = $state('')
    let customNewTabUrl = $state('')
    let exportDirectory = $state(null)
    let isExporting = $state(false)
    let exportStatus = $state('')
    let isLoadingDirectory = $state(true)

    const searchEngines = [
        { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=', icon: '🔍' },
        { id: 'kagi', name: 'Kagi', url: 'https://kagi.com/search?q=', icon: '🔎' },
        { id: 'custom', name: 'Custom', url: '', icon: '⚙️' }
    ]

    const newTabOptions = [
        { id: 'about:newtab', name: 'Default New Tab', description: 'Built-in new tab page with search' },
        { id: 'custom', name: 'Custom URL', description: 'Specify your own page' }
    ]

    const aiProviders = [
        { 
            id: 'writer', 
            name: 'Writer API (Gemini Nano)', 
            description: 'Local agent model running in browser',
            status: 'available',
            icon: '🤖'
        },
        { 
            id: 'gemini', 
            name: 'Google Gemini', 
            description: 'Google\'s advanced multimodal agent',
            status: 'disabled',
            icon: '✨'
        },
        { 
            id: 'openai', 
            name: 'OpenAI GPT', 
            description: 'Cloud-based agent model',
            status: 'disabled',
            icon: '🧠'
        },
        { 
            id: 'anthropic', 
            name: 'Anthropic Claude', 
            description: 'Cloud-based agent model',
            status: 'disabled',
            icon: '🎭'
        },
        { 
            id: 'disabled', 
            name: 'Disabled', 
            description: 'Turn off agent models',
            status: 'available',
            icon: '🚫'
        }
    ]

    function handleSearchEngineChange(engineId) {
        defaultSearchEngine = engineId
        // Save to localStorage or sync with app settings
        localStorage.setItem('defaultSearchEngine', engineId)
        if (engineId === 'custom') {
            localStorage.setItem('customSearchUrl', customSearchUrl)
        }
    }

    function handleNewTabChange(option) {
        defaultNewTabUrl = option
        localStorage.setItem('defaultNewTabUrl', option)
        if (option === 'custom') {
            localStorage.setItem('customNewTabUrl', customNewTabUrl)
        }
    }

    function handleAiProviderChange(providerId) {
        // Find the provider to check if it's disabled
        const provider = aiProviders.find(p => p.id === providerId)
        if (provider && provider.status === 'disabled') {
            console.log('Cannot select disabled AI provider:', providerId)
            return // Prevent selection of disabled providers
        }
        
        selectedAiProvider = providerId
        localStorage.setItem('selectedAiProvider', providerId)
    }

    // Centralized IndexedDB setup to avoid race conditions
    async function openDarcDatabase() {
        return new Promise((resolve, reject) => {
            // First, check what version the database is and what stores it has
            const checkRequest = indexedDB.open('darc-settings')
            
            checkRequest.onsuccess = (event) => {
                const checkDb = event.target.result
                const hasDirectoriesStore = checkDb.objectStoreNames.contains('directories')
                const currentVersion = checkDb.version
                checkDb.close()
                
                console.log('Current database version:', currentVersion, 'Has directories store:', hasDirectoriesStore)
                
                // Determine what version we need
                let targetVersion = currentVersion
                if (!hasDirectoriesStore) {
                    targetVersion = Math.max(currentVersion + 1, 2)
                    console.log('Need to upgrade database to version:', targetVersion)
                }
                
                // Now open with the correct version
                const request = indexedDB.open('darc-settings', targetVersion)
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result
                    console.log('Upgrading IndexedDB from version', event.oldVersion, 'to', event.newVersion)
                    
                    // Create directories object store if it doesn't exist
                    if (!db.objectStoreNames.contains('directories')) {
                        db.createObjectStore('directories')
                        console.log('Created directories object store')
                    }
                }
                
                request.onsuccess = (event) => {
                    const db = event.target.result
                    console.log('IndexedDB opened successfully, version:', db.version)
                    
                    // Double-check that the object store exists
                    if (!db.objectStoreNames.contains('directories')) {
                        console.error('Object store still missing after upgrade!')
                        db.close()
                        reject(new Error('Failed to create directories object store'))
                        return
                    }
                    
                    resolve(db)
                }
                
                request.onerror = (event) => {
                    console.error('Failed to open IndexedDB:', event.target.error)
                    reject(event.target.error)
                }
            }
            
            checkRequest.onerror = (event) => {
                console.log('No existing database, creating new one...')
                // Database doesn't exist, create it fresh
                const request = indexedDB.open('darc-settings', 2)
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result
                    console.log('Creating new IndexedDB with version:', db.version)
                    
                    if (!db.objectStoreNames.contains('directories')) {
                        db.createObjectStore('directories')
                        console.log('Created directories object store')
                    }
                }
                
                request.onsuccess = (event) => {
                    const db = event.target.result
                    console.log('New IndexedDB created successfully, version:', db.version)
                    resolve(db)
                }
                
                request.onerror = (event) => {
                    console.error('Failed to create new IndexedDB:', event.target.error)
                    reject(event.target.error)
                }
            }
        })
    }

    // Store directory handle in IndexedDB (browsers support this natively)
    async function storeDirectoryHandle(handle) {
        try {
            const db = await openDarcDatabase()
            
            return new Promise((resolve, reject) => {
                try {
                    const transaction = db.transaction(['directories'], 'readwrite')
                    const store = transaction.objectStore('directories')
                    
                    // Store both handle and metadata
                    const data = {
                        handle: handle,
                        name: handle.name,
                        timestamp: Date.now()
                    }
                    
                    const putRequest = store.put(data, 'exportDirectory')
                    
                    putRequest.onsuccess = () => {
                        console.log('Stored directory handle and metadata:', data.name)
                        db.close()
                        resolve()
                    }
                    
                    putRequest.onerror = () => {
                        console.error('Failed to store directory handle:', putRequest.error)
                        db.close()
                        reject(putRequest.error)
                    }
                    
                    transaction.onerror = () => {
                        console.error('Transaction failed:', transaction.error)
                        db.close()
                        reject(transaction.error)
                    }
                } catch (error) {
                    console.error('Error creating transaction:', error)
                    db.close()
                    reject(error)
                }
            })
        } catch (error) {
            console.warn('Could not store directory handle:', error)
            throw error
        }
    }

    async function getStoredDirectoryHandle() {
        try {
            const db = await openDarcDatabase()
            
            return new Promise((resolve, reject) => {
                try {
                    // Double-check that the object store exists
                    if (!db.objectStoreNames.contains('directories')) {
                        console.log('Directories object store does not exist yet')
                        db.close()
                        resolve(null)
                        return
                    }
                    
                    const transaction = db.transaction(['directories'], 'readonly')
                    const store = transaction.objectStore('directories')
                    const getRequest = store.get('exportDirectory')
                    
                    getRequest.onsuccess = () => {
                        const result = getRequest.result
                        console.log('Retrieved stored directory data:', result ? result.name : 'none')
                        db.close()
                        resolve(result)
                    }
                    
                    getRequest.onerror = () => {
                        console.error('Failed to retrieve directory handle:', getRequest.error)
                        db.close()
                        resolve(null)
                    }
                    
                    transaction.onerror = () => {
                        console.error('Transaction failed:', transaction.error)
                        db.close()
                        resolve(null)
                    }
                } catch (error) {
                    console.error('Error creating transaction:', error)
                    db.close()
                    resolve(null)
                }
            })
        } catch (error) {
            console.warn('Could not retrieve directory handle:', error)
            return null
        }
    }

    async function checkDirectoryAccess(handle) {
        try {
            // Check if we still have permission to access the directory
            const permission = await handle.queryPermission({ mode: 'readwrite' })
            console.log('Directory permission status:', permission)
            
            if (permission === 'granted') {
                return true
            } else if (permission === 'prompt') {
                // Request permission without showing picker
                const newPermission = await handle.requestPermission({ mode: 'readwrite' })
                console.log('Requested permission result:', newPermission)
                return newPermission === 'granted'
            }
            return false
        } catch (error) {
            console.warn('Could not check directory access:', error)
            return false
        }
    }

    async function loadLastUsedDirectory() {
        isLoadingDirectory = true
        
        if (!('showDirectoryPicker' in window)) {
            exportStatus = 'File System Access API not supported in this browser'
            isLoadingDirectory = false
            return
        }

        try {
            const storedData = await getStoredDirectoryHandle()
            
            if (storedData && storedData.handle) {
                console.log('Checking access to stored directory:', storedData.name)
                
                const hasAccess = await checkDirectoryAccess(storedData.handle)
                
                if (hasAccess) {
                    exportDirectory = storedData.handle
                    const timeAgo = Math.round((Date.now() - storedData.timestamp) / (1000 * 60))
                    const timeDesc = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.round(timeAgo / 60)}h ago`
                    exportStatus = `Ready to export to: ${storedData.name} (last used ${timeDesc})`
                    console.log('Successfully restored directory access:', storedData.name)
                } else {
                    const timeAgo = Math.round((Date.now() - storedData.timestamp) / (1000 * 60))
                    const timeDesc = timeAgo < 60 ? `${timeAgo}m ago` : `${Math.round(timeAgo / 60)}h ago`
                    exportStatus = `Last directory: ${storedData.name} (${timeDesc}) - permission needed, will prompt on export`
                    console.log('Directory access denied, will need to request permission:', storedData.name)
                }
            } else {
                exportStatus = 'No export directory configured'
            }
        } catch (error) {
            console.warn('Error loading directory:', error)
            exportStatus = 'No export directory configured'
        } finally {
            isLoadingDirectory = false
        }
    }

    async function selectExportDirectory() {
        if (!('showDirectoryPicker' in window)) {
            exportStatus = 'File System Access API not supported in this browser'
            return
        }

        try {
            const directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                id: 'darc-export',
                startIn: 'downloads'
            })
            
            exportDirectory = directoryHandle
            exportStatus = `Selected directory: ${directoryHandle.name}`
            
            // Store directory handle and metadata for future reference
            await storeDirectoryHandle(directoryHandle)
        } catch (error) {
            if (error.name === 'AbortError') {
                exportStatus = 'Directory selection cancelled'
            } else {
                console.error('Error selecting directory:', error)
                exportStatus = `Error: ${error.message}`
            }
        }
    }

    async function exportUserData() {
        isExporting = true
        exportStatus = 'Preparing export...'

        try {
            let directoryHandle = exportDirectory

            // If we don't have a directory handle, try to get the stored one
            if (!directoryHandle) {
                const storedData = await getStoredDirectoryHandle()
                if (storedData && storedData.handle) {
                    exportStatus = 'Accessing stored directory...'
                    
                    // Check if we still have access
                    const hasAccess = await checkDirectoryAccess(storedData.handle)
                    
                    if (hasAccess) {
                        directoryHandle = storedData.handle
                        exportDirectory = directoryHandle
                        exportStatus = `Using directory: ${directoryHandle.name}`
                    } else {
                        // Permission was denied, need to ask user to select directory again
                        exportStatus = 'Directory access permission denied. Please select the export directory again.'
                        isExporting = false
                        return
                    }
                } else {
                    exportStatus = 'Please select an export directory first'
                    isExporting = false
                    return
                }
            }

            // Double-check permission (should already be granted if we got here)
            const permission = await directoryHandle.queryPermission({ mode: 'readwrite' })
            if (permission !== 'granted') {
                // Try to request permission one more time
                const newPermission = await directoryHandle.requestPermission({ mode: 'readwrite' })
                if (newPermission !== 'granted') {
                    exportStatus = 'Directory access permission denied. Please select a new directory.'
                    isExporting = false
                    return
                }
            }

            // Update status to show we have permission now
            exportStatus = `Exporting to: ${directoryHandle.name}...`
            
            // Update the stored handle since we successfully accessed the directory
            await storeDirectoryHandle(directoryHandle)

            // Collect user data
            const userData = {
                timestamp: new Date().toISOString(),
                settings: {
                    defaultSearchEngine,
                    defaultNewTabUrl,
                    selectedAiProvider,
                    customSearchUrl,
                    customNewTabUrl
                },
                tabs: {
                    open: tabs.map(tab => ({
                        id: tab.id,
                        url: tab.url,
                        title: tab.title,
                        favicon: tab.favicon,
                        pinned: tab.pinned,
                        muted: tab.muted,
                        audioPlaying: tab.audioPlaying,
                        hibernated: tab.hibernated,
                        partition: tab.partition
                    })),
                    closed: closed.map(tab => ({
                        id: tab.id,
                        url: tab.url,
                        title: tab.title,
                        favicon: tab.favicon,
                        pinned: tab.pinned,
                        muted: tab.muted,
                        audioPlaying: tab.audioPlaying
                    })),
                    activeTabIndex: tabs.findIndex(tab => tab === tabs[0]) // Could be improved to track actual active tab
                },
                localStorage: { ...localStorage },
                version: '1.0.0'
            }

            // TODO: add cron

            // Create export file
            const fileName = `darc-export.json` // no data to support vsc ${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}
            const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true })
            const writable = await fileHandle.createWritable()
            
            await writable.write(JSON.stringify(userData, null, 2))
            await writable.close()

            exportStatus = `Successfully exported ${tabs.length} open tabs, ${closed.length} closed tabs, and all settings to ${fileName}. This directory will be used for future exports.`
            
            // Also create a readme file
            const readmeHandle = await directoryHandle.getFileHandle('README.txt', { create: true })
            const readmeWritable = await readmeHandle.createWritable()
            const readmeContent = `DARC Browser Export
===================

This directory contains exported data from DARC browser.

Files:
- ${fileName}: Complete user data in JSON format
- README.txt: This information file

Exported Data Includes:
- Browser settings (search engine, new tab page, AI provider)
- Open tabs (URLs, titles, favicons, pinned status, audio state)
- Recently closed tabs
- Local storage data
- User preferences

Export Date: ${new Date().toLocaleString()}
Version: 1.0.0
Tab Count: ${tabs.length} open, ${closed.length} recently closed

To import this data back into DARC, use the import function in Settings.
`
            await readmeWritable.write(readmeContent)
            await readmeWritable.close()

        } catch (error) {
            console.error('Error exporting data:', error)
            exportStatus = `Export failed: ${error.message}`
        } finally {
            isExporting = false
        }
    }

    function resetToDefaults() {
        defaultSearchEngine = 'google'
        defaultNewTabUrl = 'about:newtab'
        selectedAiProvider = 'writer'
        customSearchUrl = ''
        customNewTabUrl = ''
        
        localStorage.removeItem('defaultSearchEngine')
        localStorage.removeItem('defaultNewTabUrl')
        localStorage.removeItem('selectedAiProvider')
        localStorage.removeItem('customSearchUrl')
        localStorage.removeItem('customNewTabUrl')
    }

    // Load settings from localStorage on component mount
    async function loadSettings() {
        const savedSearchEngine = localStorage.getItem('defaultSearchEngine')
        const savedNewTabUrl = localStorage.getItem('defaultNewTabUrl')
        const savedAiProvider = localStorage.getItem('selectedAiProvider')
        const savedCustomSearchUrl = localStorage.getItem('customSearchUrl')
        const savedCustomNewTabUrl = localStorage.getItem('customNewTabUrl')

        if (savedSearchEngine) defaultSearchEngine = savedSearchEngine
        if (savedNewTabUrl) defaultNewTabUrl = savedNewTabUrl
        if (savedAiProvider) selectedAiProvider = savedAiProvider
        if (savedCustomSearchUrl) customSearchUrl = savedCustomSearchUrl
        if (savedCustomNewTabUrl) customNewTabUrl = savedCustomNewTabUrl
        
        // Clean up old localStorage storage formats
        localStorage.removeItem('exportDirectoryName')
        localStorage.removeItem('exportDirectoryMetadata')
        
        // Load last used export directory
        await loadLastUsedDirectory()
    }

    // Load settings when component mounts
    $effect(() => {
        loadSettings()
    })
</script>

<RightSidebar title="Settings" {onClose} {resourcesSidebarOpen} {settingsSidebarOpen} {switchToResources} {switchToSettings}>
    {#snippet children()}
        <!-- Search Engine Section -->
        <div class="setting-section">
            <h3 class="section-title">Default Search Engine</h3>
            <div class="setting-cards">
                {#each searchEngines as engine}
                    <div class="setting-card {defaultSearchEngine === engine.id ? 'selected' : ''}" 
                         onclick={() => handleSearchEngineChange(engine.id)}>
                        <div class="setting-header">
                            <span class="setting-icon">{engine.icon}</span>
                            <div class="setting-info">
                                <h4 class="setting-name">{engine.name}</h4>
                                {#if engine.id !== 'custom'}
                                    <p class="setting-description">{engine.url}</p>
                                {:else}
                                    <input 
                                        type="url" 
                                        bind:value={customSearchUrl}
                                        placeholder="https://example.com/search?q="
                                        class="custom-input"
                                        onclick={(e) => e.stopPropagation()}
                                    />
                                {/if}
                            </div>
                        </div>
                        {#if defaultSearchEngine === engine.id}
                            <div class="selected-indicator">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- New Tab Page Section -->
        <div class="setting-section">
            <h3 class="section-title">New Tab Page</h3>
            <div class="setting-cards">
                {#each newTabOptions as option}
                    <div class="setting-card {defaultNewTabUrl === option.id ? 'selected' : ''}" 
                         onclick={() => handleNewTabChange(option.id)}>
                        <div class="setting-header">
                            <div class="setting-info">
                                <h4 class="setting-name">{option.name}</h4>
                                {#if option.id !== 'custom'}
                                    <p class="setting-description">{option.description}</p>
                                {:else}
                                    <input 
                                        type="url" 
                                        bind:value={customNewTabUrl}
                                        placeholder="https://example.com"
                                        class="custom-input"
                                        onclick={(e) => e.stopPropagation()}
                                    />
                                {/if}
                            </div>
                        </div>
                        {#if defaultNewTabUrl === option.id}
                            <div class="selected-indicator">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- AI Providers Section -->
        <div class="setting-section">
            <h3 class="section-title">Agent Models</h3>
            <div class="setting-cards">
                {#each aiProviders as provider}
                    <div class="setting-card {selectedAiProvider === provider.id ? 'selected' : ''} {provider.status === 'disabled' ? 'disabled' : ''}" 
                         onclick={() => handleAiProviderChange(provider.id)}>
                        <div class="setting-header">
                            <span class="setting-icon">{provider.icon}</span>
                            <div class="setting-info">
                                <h4 class="setting-name">{provider.name}</h4>
                                <p class="setting-description">{provider.description}</p>
                            </div>
                        </div>
                        <div class="setting-status">
                            <span class="status-indicator {provider.status}"></span>
                            <span class="status-text">{provider.status === 'available' ? 'Available' : 'Coming Soon'}</span>
                        </div>
                        {#if selectedAiProvider === provider.id}
                            <div class="selected-indicator">
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Data Export Section -->
        <div class="setting-section">
            <h3 class="section-title">Data Export</h3>
            <div class="export-section">
                <div class="export-description">
                    <p>Export your complete browser data to a local folder. This includes all settings, open tabs, recently closed tabs, and user preferences.</p>
                </div>
                
                <div class="export-controls">
                    <button class="export-button" 
                            onclick={selectExportDirectory}
                            disabled={isLoadingDirectory}>
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        {exportDirectory ? 'Change Export Folder' : 'Select Export Folder'}
                    </button>
                    
                    <button class="export-button primary" 
                            onclick={exportUserData} 
                            disabled={isExporting || isLoadingDirectory}>
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                        </svg>
                        {isExporting ? 'Exporting...' : isLoadingDirectory ? 'Loading...' : 'Export Data'}
                    </button>
                </div>
                
                {#if exportStatus}
                    <div class="export-status" 
                         class:error={exportStatus.includes('Error') || exportStatus.includes('failed') || exportStatus.includes('denied')}
                         class:loading={isLoadingDirectory}>
                        {exportStatus}
                    </div>
                {/if}
                
                <div class="export-note">
                    <p><strong>Note:</strong>The exported data will be saved as JSON files that can be imported back into DARC. Your selected export directory will be remembered and automatically accessed for future exports without requiring folder selection.</p>
                </div>
            </div>
        </div>

        <!-- Reset Section -->
        <div class="setting-section">
            <div class="reset-section">
                <button class="reset-button" onclick={resetToDefaults}>
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Reset to Defaults
                </button>
            </div>
        </div>
    {/snippet}
</RightSidebar>

<style>
    .setting-section {
        margin-bottom: 32px;
    }

    .setting-section:last-child {
        margin-bottom: 0;
    }

    .setting-cards {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .setting-card.selected {
        background: rgba(59, 130, 246, 0.08);
        border-color: rgba(59, 130, 246, 0.15);
    }

    .setting-card.selected:hover {
        background: rgba(59, 130, 246, 0.07);
        border-color: rgba(59, 130, 246, 0.16);
        transform: translateY(-1px);
    }

    .setting-card.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none; /* Prevent all interactions */
    }

    .setting-card.disabled:hover {
        transform: none;
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.1);
    }

    .setting-header {
        display: flex;
        align-items: flex-start;
        gap: 10px;
    }

    .setting-icon {
        font-size: 18px;
        flex-shrink: 0;
        line-height: 1;
        margin-top: 1px;
    }

    .setting-info {
        flex: 1;
        min-width: 0;
    }

    .setting-name {
        font-size: 13px;
        font-weight: 500;
        margin: 0 0 2px 0;
        color: rgba(255, 255, 255, 0.75);
        line-height: 1.2;
    }

    .setting-description {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        line-height: 1.3;
        margin: 0;
        font-family: 'Inter', sans-serif;
        font-weight: 400;
    }

    .custom-input {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 3px;
        padding: 4px 6px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 11px;
        font-family: 'SF Mono', Consolas, monospace;
        width: 100%;
        margin-top: 3px;
    }

    .custom-input:focus {
        outline: none;
        border-color: rgba(59, 130, 246, 0.3);
        background: rgba(255, 255, 255, 0.08);
    }

    .custom-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
    }

    .setting-status {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 6px;
        font-size: 10px;
    }

    .status-indicator {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .status-indicator.available {
        background-color: #10b981;
    }

    .status-indicator.disabled {
        background-color: #6b7280;
    }

    .status-text {
        color: rgba(255, 255, 255, 0.35);
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }

    .selected-indicator {
        position: absolute;
        top: 10px;
        right: 10px;
        color: rgba(59, 130, 246, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        background: rgba(59, 130, 246, 0.06);
        border-radius: 50%;
        border: 1px solid rgba(59, 130, 246, 0.15);
    }

    .export-section {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 16px;
    }

    .export-description {
        margin-bottom: 16px;
    }

    .export-description p {
        color: rgba(255, 255, 255, 0.7);
        font-size: 12px;
        line-height: 1.4;
        margin: 0;
    }

    .export-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        flex-wrap: wrap;
    }

    .export-button {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease;
        min-width: 0;
    }

    .export-button:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.95);
    }

    .export-button.primary {
        background: rgba(59, 130, 246, 0.08);
        border-color: rgba(59, 130, 246, 0.2);
        color: rgba(59, 130, 246, 0.9);
    }

    .export-button.primary:hover:not(:disabled) {
        background: rgba(59, 130, 246, 0.12);
        border-color: rgba(59, 130, 246, 0.3);
        color: rgba(59, 130, 246, 1);
    }

    .export-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
    }

    .export-status {
        background: rgba(16, 185, 129, 0.08);
        border: 1px solid rgba(16, 185, 129, 0.2);
        color: rgba(16, 185, 129, 0.9);
        border-radius: 4px;
        padding: 8px 10px;
        font-size: 11px;
        margin-bottom: 12px;
    }

    .export-status.error {
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.2);
        color: rgba(239, 68, 68, 0.9);
    }

    .export-status.loading {
        background: rgba(59, 130, 246, 0.08);
        border-color: rgba(59, 130, 246, 0.2);
        color: rgba(59, 130, 246, 0.9);
    }

    .export-note {
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        padding-top: 12px;
    }

    .export-note p {
        color: rgba(255, 255, 255, 0.5);
        font-size: 10px;
        line-height: 1.4;
        margin: 0;
    }

    .reset-section {
        display: flex;
        justify-content: center;
        padding: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .reset-button {
        background: rgba(239, 68, 68, 0.06);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: rgba(239, 68, 68, 0.7);
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s ease;
    }

    .reset-button:hover {
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.35);
        color: rgba(239, 68, 68, 0.9);
    }

    .selected-indicator .w-4 {
        width: 10px;
    }

    .selected-indicator .h-4 {
        height: 10px;
    }
</style>

<script>
    import RightSidebar from './RightSidebar.svelte'
    
    let { onClose, resourcesSidebarOpen, settingsSidebarOpen, switchToResources, switchToSettings } = $props()

    // Settings state
    let defaultSearchEngine = $state('google')
    let defaultNewTabUrl = $state('about:newtab')
    let selectedAiProvider = $state('writer')
    let customSearchUrl = $state('')
    let customNewTabUrl = $state('')

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
        selectedAiProvider = providerId
        localStorage.setItem('selectedAiProvider', providerId)
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
    function loadSettings() {
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

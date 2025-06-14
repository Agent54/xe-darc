<script>
    import RightSidebar from './RightSidebar.svelte'
    
    let { 
        onClose, 
        resourcesSidebarOpen, 
        settingsSidebarOpen, 
        userModsSidebarOpen,
        switchToResources, 
        switchToSettings, 
        switchToUserMods,
        userMods = [],
        onUpdateUserMods,
        currentTab = null
    } = $props()

    // Form state for adding new mods
    let newModType = $state('site-css')
    let newModPattern = $state('')
    let newModContent = $state('')
    let newModName = $state('')
    let showAddForm = $state(false)
    let editingMod = $state(null)

    const modTypes = [
        { id: 'global-css', name: 'Global CSS', description: 'CSS applied to all sites' },
        { id: 'global-js', name: 'Global JS', description: 'JavaScript applied to all sites' },
        { id: 'site-css', name: 'Site CSS', description: 'CSS applied to specific sites' },
        { id: 'site-js', name: 'Site JS', description: 'JavaScript applied to specific sites' }
    ]

    function getModTypeInfo(type) {
        return modTypes.find(t => t.id === type) || modTypes[0]
    }

    async function addMod() {
        if (!newModContent.trim()) {
            return
        }

        if ((newModType === 'site-css' || newModType === 'site-js') && !newModPattern.trim()) {
            return
        }

        const newMod = {
            id: crypto.randomUUID(),
            name: newModName.trim() || '',
            type: newModType,
            pattern: newModType.startsWith('global-') ? '*' : newModPattern.trim(),
            content: newModContent.trim(),
            enabled: true,
            created: Date.now(),
            modified: Date.now()
        }

        try {
            await onUpdateUserMods([...userMods, newMod])
            resetForm()
        } catch (error) {
            console.error('Failed to add user mod:', error)
        }
    }

    async function updateMod() {
        if (!editingMod || !newModContent.trim()) {
            return
        }

        if ((newModType === 'site-css' || newModType === 'site-js') && !newModPattern.trim()) {
            return
        }

        const updatedMods = userMods.map(mod => 
            mod.id === editingMod.id 
                ? {
                    ...mod,
                    name: newModName.trim() || '',
                    type: newModType,
                    pattern: newModType.startsWith('global-') ? '*' : newModPattern.trim(),
                    content: newModContent.trim(),
                    modified: Date.now()
                }
                : mod
        )

        try {
            await onUpdateUserMods(updatedMods)
            cancelEdit()
        } catch (error) {
            console.error('Failed to update user mod:', error)
        }
    }



    async function deleteMod(modId) {
        if (confirm('Are you sure you want to delete this user modification?')) {
            try {
                await onUpdateUserMods(userMods.filter(mod => mod.id !== modId))
            } catch (error) {
                console.error('Failed to delete user mod:', error)
            }
        }
    }

    async function toggleMod(modId) {
        const updatedMods = userMods.map(mod => 
            mod.id === modId 
                ? { ...mod, enabled: !mod.enabled }
                : mod
        )
        try {
            await onUpdateUserMods(updatedMods)
        } catch (error) {
            console.error('Failed to toggle user mod:', error)
        }
    }

    function editMod(mod) {
        editingMod = mod
        newModName = mod.name
        newModType = mod.type
        newModPattern = mod.pattern === '*' ? '' : mod.pattern
        newModContent = mod.content
        showAddForm = true
    }

    function resetForm() {
        newModName = ''
        newModType = 'site-css'
        newModContent = ''
        showAddForm = false
        editingMod = null
        
        // Auto-fill pattern for site-specific mods - use full URL as-is
        if (currentTab?.url) {
            newModPattern = currentTab.url
        } else {
            newModPattern = ''
        }
    }

    function cancelEdit() {
        resetForm()
    }

    function handleTypeChange(event) {
        const newType = event.target.value
        newModType = newType
        
        // Auto-fill pattern when switching to site-specific mods
        if (newType.startsWith('site-') && currentTab?.url && !editingMod) {
            newModPattern = currentTab.url
        }
    }

    function getDomainFromUrl(url) {
        try {
            const urlObj = new URL(url)
            return urlObj.hostname
        } catch {
            return ''
        }
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp)
        const day = date.getDate().toString().padStart(2, '0')
        const month = (date.getMonth() + 1).toString().padStart(2, '0')
        const year = date.getFullYear()
        return `${day}.${month}.${year}`
    }

    function matchesPattern(pattern, url) {
        if (pattern === '*') return true
        if (!pattern || !url) return false
        
        try {
            const urlObj = new URL(url)
            const hostname = urlObj.hostname
            
            // Support wildcards
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
            
            const regex = new RegExp(`^${regexPattern}$`, 'i')
            return regex.test(hostname) || regex.test(url)
        } catch {
            return false
        }
    }

    function getApplicableMods(url) {
        return userMods.filter(mod => mod.enabled && matchesPattern(mod.pattern, url))
    }

    // Handle type changes - clear pattern for global mods
    $effect(() => {
        if (newModType.startsWith('global-')) {
            newModPattern = ''
        }
    })

    // Live update pattern when current tab changes (for site-specific mods)
    $effect(() => {
        if (newModType.startsWith('site-') && currentTab?.url && !editingMod && showAddForm) {
            newModPattern = currentTab.url
        }
    })
</script>

<RightSidebar title="User Mods" {onClose} {resourcesSidebarOpen} {settingsSidebarOpen} userModsSidebarOpen={userModsSidebarOpen} {switchToResources} {switchToSettings} {switchToUserMods}>
    {#snippet children()}
        <!-- Add/Edit Form -->
        {#if showAddForm}
            <div class="mod-form">
                <div class="form-header">
                    <h4 class="form-title">{editingMod ? 'Edit' : 'Add'} User Mod</h4>
                    <button class="cancel-button" onclick={cancelEdit} title="Cancel">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div class="form-field">
                    <label for="mod-type" class="form-label">Type</label>
                    <select 
                        id="mod-type" 
                        bind:value={newModType} 
                        onchange={handleTypeChange}
                        class="form-select">
                        {#each modTypes as type}
                            <option value={type.id}>{type.name}</option>
                        {/each}
                    </select>
                    <p class="form-description">{getModTypeInfo(newModType).description}</p>
                </div>

                {#if newModType.startsWith('site-')}
                    <div class="form-field">
                        <label for="mod-pattern" class="form-label">Site Pattern</label>
                        <input 
                            id="mod-pattern"
                            type="text" 
                            bind:value={newModPattern}
                            placeholder="*.example.com or example.com"
                            class="form-input"
                        />
                        <p class="form-description">
                            Use * for wildcards. Examples: *.google.com
                            {#if currentTab?.url}
                                <br><strong>Current tab:</strong> {getDomainFromUrl(currentTab.url)}
                            {/if}
                        </p>
                    </div>
                {/if}

                <div class="form-field">
                    <label for="mod-name" class="form-label">Name (optional)</label>
                    <input 
                        id="mod-name"
                        type="text" 
                        bind:value={newModName}
                        placeholder=""
                        class="form-input"
                    />
                </div>

                <div class="form-field">
                    <label for="mod-content" class="form-label">
                        {newModType.includes('css') ? 'CSS' : 'JavaScript'} Content
                    </label>
                    <textarea 
                        id="mod-content"
                        bind:value={newModContent}
                        placeholder={newModType.includes('css') 
                            ? 'body { background: #000; }\n.ads { display: none; }'
                            : 'console.log("Hello from usermod!");\n// Your JavaScript here'}
                        class="form-textarea"
                        rows="8"
                    ></textarea>
                </div>

                <div class="form-actions">
                    <button 
                        type="button"
                        onclick={editingMod ? updateMod : addMod}
                        class="save-button"
                        disabled={!newModContent.trim() || (newModType.startsWith('site-') && !newModPattern.trim())}
                    >
                        {editingMod ? 'Update' : 'Add'} Mod
                    </button>
                    <button type="button" onclick={cancelEdit} class="cancel-form-button">
                        Cancel
                    </button>
                </div>
            </div>
        {:else}
            <!-- Mod List -->
            <div class="mods-header">
                <div class="mods-title-row">
                    <h3 class="section-title">User Modifications</h3>
                    <button 
                        onclick={() => showAddForm = true}
                        class="add-mod-button"
                        title="Add new user mod"
                    >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                    </button>
                </div>
                {#if currentTab?.url}
                    <div class="current-tab-info">
                        <span class="current-tab-label">Current tab:</span>
                        <span class="current-tab-domain">{getDomainFromUrl(currentTab.url)}</span>
                        <span class="applicable-count">
                            ({getApplicableMods(currentTab.url).length} mod{getApplicableMods(currentTab.url).length !== 1 ? 's' : ''} applicable)
                        </span>
                    </div>
                {/if}
            </div>

            {#if userMods.length === 0}
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                        </svg>
                    </div>
                    <h3 class="empty-title">No User Mods</h3>
                    <p class="empty-description">Add custom CSS and JavaScript to enhance your browsing experience.</p>
                    <button onclick={() => showAddForm = true} class="empty-action-button">
                        Add Your First Mod
                    </button>
                </div>
            {:else}
                <div class="mods-list">
                    {#each userMods as mod (mod.id)}
                        <div class="mod-card" class:disabled={!mod.enabled} class:applicable={currentTab?.url && matchesPattern(mod.pattern, currentTab.url)}>
                            <div class="mod-header">
                                <div class="mod-info">
                                    <div class="mod-name-row">
                                        {#if mod.name}
                                            <h4 class="mod-name">{mod.name}</h4>
                                        {/if}
                                        <span class="mod-type-badge" class:css={mod.type.includes('css')} class:js={mod.type.includes('js')}>
                                            {getModTypeInfo(mod.type).name}
                                        </span>
                                    </div>
                                    <div class="mod-pattern">
                                        {#if mod.pattern === '*'}
                                            <span class="global-pattern">Global</span>
                                        {:else}
                                            <span class="site-pattern">{mod.pattern}</span>
                                        {/if}
                                    </div>
                                </div>
                                <div class="mod-actions">
                                    <button 
                                        onclick={() => toggleMod(mod.id)}
                                        class="toggle-button"
                                        class:enabled={mod.enabled}
                                        title={mod.enabled ? 'Disable mod' : 'Enable mod'}
                                    >
                                        {mod.enabled ? '●' : '○'}
                                    </button>
                                    <button 
                                        onclick={() => editMod(mod)}
                                        class="edit-button"
                                        title="Edit mod"
                                    >
                                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                        </svg>
                                    </button>
                                    <button 
                                        onclick={() => deleteMod(mod.id)}
                                        class="delete-button"
                                        title="Delete mod"
                                    >
                                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="mod-preview">
                                <code class="mod-content-preview">{mod.content.length > 100 ? mod.content.slice(0, 100) + '...' : mod.content}</code>
                            </div>
                            <div class="mod-meta">
                                <span class="mod-created">Created {formatDate(mod.created)}</span>
                                {#if mod.modified !== mod.created}
                                    <span class="mod-modified">Modified {formatDate(mod.modified)}</span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
    {/snippet}
</RightSidebar>

<style>
    .mod-form {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 20px;
    }

    .form-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .form-title {
        font-size: 14px;
        font-weight: 600;
        margin: 0;
        color: rgba(255, 255, 255, 0.9);
    }

    .cancel-button {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.1s ease;
    }

    .cancel-button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.9);
    }

    .form-field {
        margin-bottom: 16px;
    }

    .form-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
        margin-bottom: 6px;
    }

    .form-input,
    .form-select,
    .form-textarea {
        width: 100%;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        padding: 8px 10px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 12px;
        font-family: 'Inter', sans-serif;
        transition: all 0.2s ease;
    }

    .form-textarea {
        font-family: 'SF Mono', Consolas, monospace;
        resize: vertical;
        min-height: 120px;
    }

    .form-input:focus,
    .form-select:focus,
    .form-textarea:focus {
        outline: none;
        border-color: rgba(59, 130, 246, 0.3);
        background: rgba(255, 255, 255, 0.08);
    }

    .form-input::placeholder,
    .form-textarea::placeholder {
        color: rgba(255, 255, 255, 0.4);
    }

    .form-description {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 4px;
        margin-bottom: 0;
        line-height: 1.4;
    }

    .form-actions {
        display: flex;
        gap: 8px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .save-button {
        background: rgba(59, 130, 246, 0.08);
        border: 1px solid rgba(59, 130, 246, 0.2);
        color: rgba(59, 130, 246, 0.9);
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        flex: 1;
    }

    .save-button:hover:not(:disabled) {
        background: rgba(59, 130, 246, 0.12);
        border-color: rgba(59, 130, 246, 0.3);
        color: rgba(59, 130, 246, 1);
    }

    .save-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .cancel-form-button {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .cancel-form-button:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.95);
    }

    .mods-header {
        margin-bottom: 20px;
    }

    .mods-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    .add-mod-button {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
        border-radius: 4px;
        padding: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .add-mod-button:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.95);
        transform: scale(1.05);
    }

    .current-tab-info {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        padding: 8px 10px;
        font-size: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
    }

    .current-tab-label {
        color: rgba(255, 255, 255, 0.5);
    }

    .current-tab-domain {
        color: rgba(255, 255, 255, 0.8);
        font-family: 'SF Mono', Consolas, monospace;
        font-weight: 500;
    }

    .applicable-count {
        color: rgba(59, 130, 246, 0.8);
        font-weight: 500;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 40px 20px;
        min-height: 200px;
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
        margin: 0 0 20px 0;
        max-width: 240px;
    }

    .empty-action-button {
        background: rgba(59, 130, 246, 0.08);
        border: 1px solid rgba(59, 130, 246, 0.2);
        color: rgba(59, 130, 246, 0.9);
        border-radius: 6px;
        padding: 10px 16px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .empty-action-button:hover {
        background: rgba(59, 130, 246, 0.12);
        border-color: rgba(59, 130, 246, 0.3);
        color: rgba(59, 130, 246, 1);
        transform: translateY(-1px);
    }

    .mods-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .mod-card {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 14px;
        transition: all 0.2s ease;
        position: relative;
    }

    .mod-card.applicable {
        border-color: rgba(59, 130, 246, 0.3);
        background: rgba(59, 130, 246, 0.04);
    }

    .mod-card.disabled {
        opacity: 0.5;
    }

    .mod-card:hover:not(.disabled) {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.16);
        transform: translateY(-1px);
    }

    .mod-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 8px;
    }

    .mod-info {
        flex: 1;
        min-width: 0;
    }

    .mod-name-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
    }

    .mod-name {
        font-size: 13px;
        font-weight: 500;
        margin: 0;
        color: rgba(255, 255, 255, 0.9);
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
    }



    .mod-type-badge {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        padding: 2px 6px;
        font-size: 9px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.6);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex-shrink: 0;
    }

    .mod-type-badge.css {
        background: rgba(59, 130, 246, 0.08);
        border-color: rgba(59, 130, 246, 0.2);
        color: rgba(59, 130, 246, 0.9);
    }

    .mod-type-badge.js {
        background: rgba(245, 158, 11, 0.08);
        border-color: rgba(245, 158, 11, 0.2);
        color: rgba(245, 158, 11, 0.9);
    }

    .mod-pattern {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        font-family: 'SF Mono', Consolas, monospace;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
        margin-top: 16px;
    }

    .global-pattern {
        color: rgba(16, 185, 129, 0.8);
        font-weight: 500;
    }

    .site-pattern {
        color: rgba(255, 255, 255, 0.6);
    }

    .mod-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
        margin-left: 16px;
    }

    .toggle-button,
    .edit-button,
    .delete-button {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.6);
        border-radius: 3px;
        padding: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        font-size: 12px;
    }

    .toggle-button:hover,
    .edit-button:hover,
    .delete-button:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
        color: rgba(255, 255, 255, 0.9);
    }

    .toggle-button.enabled {
        background: rgba(16, 185, 129, 0.08);
        border-color: rgba(16, 185, 129, 0.2);
        color: rgba(16, 185, 129, 0.9);
    }

    .delete-button:hover {
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.2);
        color: rgba(239, 68, 68, 0.9);
    }

    .mod-preview {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        padding: 8px;
        margin-bottom: 8px;
        overflow: hidden;
    }

    .mod-content-preview {
        font-family: 'SF Mono', Consolas, monospace;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.7);
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-all;
        display: block;
    }

    .mod-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
    }

    .mod-created,
    .mod-modified {
        flex-shrink: 0;
    }

    .w-3 {
        width: 12px;
    }

    .h-3 {
        height: 12px;
    }

    .w-4 {
        width: 16px;
    }

    .h-4 {
        height: 16px;
    }

    .w-12 {
        width: 48px;
    }

    .h-12 {
        height: 48px;
    }
</style>

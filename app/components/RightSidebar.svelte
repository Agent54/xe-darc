<script>
    let { title, onClose, children, openSidebars = new Set(), switchToResources, switchToSettings, switchToUserMods } = $props()
</script>

<div class="sidebar">
    <div class="sidebar-header">
        <h3 class="sidebar-title">{title}</h3>
        <div class="sidebar-controls">
            <div class="sidebar-nav-buttons">
                <button class="sidebar-nav-button" title="Add" aria-label="Add">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                </button>
                
                <button class="sidebar-nav-button" title="Agent" aria-label="Agent">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 0 0 1.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                    </svg>
                </button>
                
                <button class="sidebar-nav-button" 
                        class:active={openSidebars.has('resources')}
                        title="Resources" 
                        aria-label="Resources"
                        onmousedown={switchToResources}>
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                </button>

                <button class="sidebar-nav-button" 
                        class:active={openSidebars.has('userMods')}
                        title="User Mods" 
                        aria-label="User Mods"
                        onmousedown={switchToUserMods}>
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                </button>
                
                <button class="sidebar-nav-button" 
                        class:active={openSidebars.has('settings')}
                        title="Settings" 
                        aria-label="Settings"
                        onmousedown={switchToSettings}>
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                </button>
            </div>
            
            <button class="close-button" onmousedown={onClose} title="Close {title}">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    </div>

    <div class="sidebar-content">
        {@render children()}
    </div>
</div>

<style>
    .sidebar {
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        border-left: none !important;
        border: none;
        display: flex;
        flex-direction: column;
        font-family: 'Inter', sans-serif;
        color: #fff;
    }

    .sidebar-header {
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
    }

    .sidebar-title {
        font-size: 14px;
        font-weight: 600;
        margin: 0;
        color: rgba(255, 255, 255, 0.9);
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .sidebar-controls {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .sidebar-nav-buttons {
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
    }

    .sidebar:hover .sidebar-nav-buttons {
        opacity: 1;
    }

    .sidebar-nav-button {
        width: 20px;
        height: 20px;
        border: none;
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.6);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.1s ease;
        padding: 0;
        backdrop-filter: blur(4px);
        border: 1px solid transparent;
    }

    .sidebar-nav-button:hover {
        background: rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.9);
        transform: scale(1.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .sidebar-nav-button:active {
        transform: scale(0.95);
        transition: transform 0.1s ease;
    }

    .sidebar-nav-button.active {
        background: rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.2);
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
        transition: all 0.1s ease;
        opacity: 0;
    }

    .sidebar:hover .close-button {
        opacity: 1;
    }

    .close-button:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.9);
    }

    .sidebar-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .sidebar-content::-webkit-scrollbar {
        width: 6px;
    }

    .sidebar-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .sidebar-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    /* Scoped global styles for child components */
    .sidebar :global(.w-4) {
        width: 16px;
    }

    .sidebar :global(.h-4) {
        height: 16px;
    }

    /* Global styles for section titles used by both Resources and Settings */
    .sidebar :global(.section-title) {
        font-size: 12px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin: 0 0 12px 0;
        color: rgba(255, 255, 255, 0.3);
    }

    /* Shared card styles for both resource-card and setting-card */
    .sidebar :global(.resource-card),
    .sidebar :global(.setting-card) {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 12px 14px;
        transition: all 0.2s ease;
        cursor: pointer;
        position: relative;
    }

    .sidebar :global(.resource-card:hover),
    .sidebar :global(.setting-card:hover:not(.disabled):not(.selected)) {
        background: rgba(255, 255, 255, 0.07);
        border-color: rgba(255, 255, 255, 0.16);
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
</style>

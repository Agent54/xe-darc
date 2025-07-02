<script>
    import { fade } from 'svelte/transition'
    import data from '../data.svelte.js'
    
    let {
        certificateMonitorForTab = $bindable(null)
    } = $props()
    
    let securityInfo = $derived.by(() =>  {
        if (!certificateMonitorForTab) return null

        const origin = new URL(certificateMonitorForTab.url).origin

        return {
            securityState: data.origins[origin]?.securityState || 'unknown',
            certificateError: data.origins[origin]?.certificateError,
            mixedContent: data.origins[origin]?.mixedContent,
            hasSecurityWarning: data.origins[origin]?.hasSecurityWarning
        }
    })

    // Get security icon
    function getSecurityIcon(securityState) {
        switch (securityState) {
            case 'secure':
                return '🔒'
            case 'insecure':
                return '⚠️'
            case 'mixed':
                return '🔓'
            default:
                return '❓'
        }
    }
    
    // Get security color
    function getSecurityColor(securityState) {
        switch (securityState) {
            case 'secure':
                return 'text-green-400'
            case 'insecure':
                return 'text-red-400'
            case 'mixed':
                return 'text-yellow-400'
            default:
                return 'text-gray-400'
        }
    }
</script>

{#if certificateMonitorForTab}
    <div class="certificate-monitor" transition:fade={{duration: 200}}>
        <div class="monitor-header">
            <h3>🔒 Certificate Monitor</h3>
            <button onclick={() => certificateMonitorForTab = null} class="close-btn">×</button>
        </div>
        
        <div class="active-tab-info">
            <h4>Current Tab</h4>
            {#if securityInfo}
                <div class="security-status">
                    <span class="security-icon">{getSecurityIcon(securityInfo.securityState)}</span>
                    <span class="security-state {getSecurityColor(securityInfo.securityState)}">
                        {securityInfo.securityState.toUpperCase()}
                    </span>
                    <span class="hostname">{securityInfo.hostname}</span>
                </div>
            {:else}
                <div class="loading-state">
                    <span class="loading-spinner">⏳</span>
                    <span>Loading certificate information...</span>
                </div>
            {/if}
            
            {#if securityInfo?.certificateError}
                <div class="certificate-error">
                    <strong>Certificate Error:</strong>
                    <p>{securityInfo.certificateError.text}</p>
                </div>
            {/if}
            
            {#if securityInfo?.mixedContent}
                <div class="mixed-content-warning">
                    <strong>Mixed Content Warning:</strong>
                    <p>This page contains insecure content</p>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .certificate-monitor {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 600px;
        max-height: 80vh;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 10px;
        z-index: 10000;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    
    .loading-state {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        color: #888;
        font-style: italic;
    }
    
    .loading-spinner {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    .monitor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        border-bottom: 1px solid #333;
        padding: 5px 5px 10px 5px;
    }
    
    .monitor-header h3 {
        margin: 0;
        color: #fff;
        font-size: 18px;
    }
    
    .close-btn {
        background: none;
        border: none;
        color: #888;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        line-height: 1;
        font-family: Arial, sans-serif;
        font-weight: normal;
        margin: -2px -2px 0 0;
    }
    
    .close-btn:hover {
        background: #333;
        color: #fff;
    }
    
    .active-tab-info {
        margin-bottom: 0;
        padding: 0 10px;
    }
    
    .active-tab-info h4 {
        margin: 0 0 10px 0;
        color: #fff;
        font-size: 16px;
    }
    
    .security-status {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 15px;
        padding: 10px;
        background: #2a2a2a;
        border-radius: 6px;
    }
    
    .security-icon {
        font-size: 20px;
    }
    
    .security-state {
        font-weight: bold;
        font-size: 14px;
    }
    
    .hostname {
        color: #ccc;
        font-family: monospace;
        font-size: 14px;
    }
    
    .certificate-error, .mixed-content-warning {
        margin-bottom: 15px;
        padding: 10px;
        background: #2a2a2a;
        border-radius: 6px;
        border-left: 4px solid #f59e0b;
    }
    
    .certificate-error {
        border-left-color: #ef4444;
    }
    
    .certificate-error strong, .mixed-content-warning strong {
        color: #fff;
        display: block;
        margin-bottom: 5px;
    }
    
    .certificate-error p, .mixed-content-warning p {
        margin: 0;
        color: #ccc;
        font-size: 14px;
    }
    
    .check-details p {
        margin: 2px 0;
        color: #ccc;
        font-size: 14px;
    }
    
    .certificate-list {
        max-height: 300px;
        overflow-y: auto;
    }
    
    .certificate-item {
        margin-bottom: 10px;
        padding: 10px;
        background: #2a2a2a;
        border-radius: 6px;
        border: 1px solid #333;
    }
    
    .cert-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 5px;
    }
    
    .cert-error, .cert-warning {
        font-size: 12px;
        color: #f59e0b;
        margin-bottom: 5px;
    }
    
    .cert-error {
        color: #ef4444;
    }
    
    .cert-meta {
        font-size: 11px;
        color: #888;
    }
    
    .no-certificates {
        text-align: center;
        color: #888;
        font-style: italic;
        padding: 20px;
    }
    
    .text-green-400 { color: #4ade80; }
    .text-red-400 { color: #f87171; }
    .text-yellow-400 { color: #facc15; }
    .text-gray-400 { color: #9ca3af; }
</style> 
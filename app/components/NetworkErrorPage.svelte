<script>
    let {
        tab,
        onReload = () => {}
    } = $props()
    
    let networkError = $derived(tab?.networkError)
    let url = $derived(tab?.url || '')
    let hostname = $derived.by(() => {
        try {
            return new URL(url).hostname
        } catch {
            return url
        }
    })
    
    function getErrorTitle(errorCode) {
        if (errorCode?.includes('ERR_NAME_NOT_RESOLVED')) {
            return 'This site can\'t be reached'
        }
        if (errorCode?.includes('ERR_INTERNET_DISCONNECTED')) {
            return 'No internet connection'
        }
        if (errorCode?.includes('ERR_CONNECTION_REFUSED')) {
            return 'Connection refused'
        }
        if (errorCode?.includes('ERR_CONNECTION_TIMED_OUT')) {
            return 'Connection timed out'
        }
        if (errorCode?.includes('ERR_NETWORK_CHANGED')) {
            return 'Network changed'
        }
        return 'Can\'t reach this page'
    }
    
    function getErrorDescription(errorCode, hostname) {
        if (errorCode?.includes('ERR_NAME_NOT_RESOLVED')) {
            return `${hostname}'s server IP address could not be found.`
        }
        if (errorCode?.includes('ERR_INTERNET_DISCONNECTED')) {
            return 'Check your internet connection and try again.'
        }
        if (errorCode?.includes('ERR_CONNECTION_REFUSED')) {
            return `${hostname} refused to connect.`
        }
        if (errorCode?.includes('ERR_CONNECTION_TIMED_OUT')) {
            return `${hostname} took too long to respond.`
        }
        if (errorCode?.includes('ERR_NETWORK_CHANGED')) {
            return 'Your network connection has changed. Try reloading the page.'
        }
        return `There was a problem loading ${hostname}.`
    }
    
    function getSuggestions(errorCode) {
        if (errorCode?.includes('ERR_NAME_NOT_RESOLVED')) {
            return [
                'Check your internet connection',
                'Check the spelling of the web address',
                'Try running Network Diagnostics'
            ]
        }
        if (errorCode?.includes('ERR_INTERNET_DISCONNECTED')) {
            return [
                'Check your internet connection',
                'Check your router and modem',
                'Try reconnecting to your network'
            ]
        }
        if (errorCode?.includes('ERR_CONNECTION_REFUSED')) {
            return [
                'Check if the website is down for everyone',
                'Try again later',
                'Check your firewall settings'
            ]
        }
        if (errorCode?.includes('ERR_CONNECTION_TIMED_OUT')) {
            return [
                'Check your internet connection',
                'Try reloading the page',
                'Check if the website is down for everyone'
            ]
        }
        return [
            'Check your internet connection',
            'Try reloading the page',
            'Try again later'
        ]
    }
</script>

<div  bind:this={tab.frame} class="frame-instance network-error">
    <div class="network-error-page">
        <div class="error-container">
            <div class="error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
            </div>
            
            <h1 class="error-title">{getErrorTitle(networkError?.code)}</h1>
            
            <p class="error-description">{getErrorDescription(networkError?.code, hostname)}</p>
            
            <div class="error-code">
                {networkError?.code || 'ERR_NETWORK_ERROR'}
            </div>
            
            <div class="suggestions">
                <h3>Try:</h3>
                <ul>
                    {#each getSuggestions(networkError?.code) as suggestion}
                        <li>{suggestion}</li>
                    {/each}
                </ul>
            </div>
            
            <div class="actions">
                <button 
                    class="reload-button"
                    onclick={() => onReload()}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    Reload
                </button>
            </div>
        </div>
    </div>
</div>

<style>
    :global(.frame-instance.network-error) {
        position: relative;
    }
    
    .network-error-page {
        position: absolute;
        width: 100%;
        height: 100%;
        background: #000;
        background-image: 
            radial-gradient(circle at 50% 0%, #0c0c0c 0%, #000 80%),
            radial-gradient(circle at 50% 50%, rgba(156, 163, 175, 0.15) 0%, transparent 50%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        color: #ffffff;
        z-index: 1;
    }
    
    .error-container {
        max-width: 600px;
        width: 100%;
        text-align: center;
        padding: 60px 40px;
    }
    
    .error-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 40px;
        color: #9ca3af;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .error-icon svg {
        width: 80px;
        height: 80px;
    }
    
    .error-title {
        font-size: 32px;
        font-weight: 600;
        margin: 0 0 24px;
        color: #ffffff;
        letter-spacing: -0.5px;
        line-height: 1.2;
    }
    
    .error-description {
        font-size: 16px;
        line-height: 1.6;
        margin: 0 0 24px;
        color: rgba(255, 255, 255, 0.85);
        max-width: 520px;
        margin-left: auto;
        margin-right: auto;
    }
    
    .error-code {
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
        font-size: 18px;
        font-weight: 600;
        color: #9ca3af;
        margin: 0 0 24px;
        letter-spacing: 0.5px;
    }
    
    .suggestions {
        max-width: 500px;
        margin: 0 auto 32px;
        text-align: left;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 20px;
    }
    
    .suggestions h3 {
        font-size: 16px;
        font-weight: 600;
        margin: 0 0 16px;
        color: #ffffff;
    }
    
    .suggestions ul {
        margin: 0;
        padding: 0;
        list-style: none;
    }
    
    .suggestions li {
        font-size: 14px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.7);
        margin: 0 0 8px;
        padding-left: 20px;
        position: relative;
    }
    
    .suggestions li:before {
        content: '•';
        position: absolute;
        left: 0;
        color: rgba(255, 255, 255, 0.5);
    }
    
    .suggestions li:last-child {
        margin-bottom: 0;
    }
    
    .actions {
        display: flex;
        justify-content: center;
        gap: 16px;
        flex-wrap: wrap;
    }
    
    .reload-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 18px;
        background: rgba(255, 255, 255, 0.12);
        color: #ffffff;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        backdrop-filter: blur(8px);
    }
    
    .reload-button:hover {
        background: rgba(255, 255, 255, 0.18);
    }
    
    .reload-button:active {
        background: rgba(255, 255, 255, 0.08);
    }
    
    .reload-button svg {
        width: 16px;
        height: 16px;
    }
    
    @media (max-width: 640px) {
        .error-container {
            padding: 40px 20px;
        }
        
        .error-title {
            font-size: 24px;
        }
        
        .error-description {
            font-size: 15px;
        }
        
        .suggestions {
            padding: 16px;
        }
        
        .actions {
            flex-direction: column;
        }
    }
</style> 
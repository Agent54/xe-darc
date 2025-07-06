<script>
    let {
        tab,
        certificateError
    } = $props()
    let url = $derived(tab?.url || '')
    let hostname = $derived.by(() => {
        try {
            return new URL(url).hostname
        } catch {
            return url
        }
    })
    
    function getTechnicalExplanation(errorCode, hostname) {
        if (errorCode?.includes('CERT_COMMON_NAME_INVALID')) {
            // Extract domain from certificate if available, otherwise use generic explanation
            return `This server could not prove that it is ${hostname}; its security certificate is from a different domain. This may be caused by a misconfiguration or an attacker intercepting your connection.`
        }
        if (errorCode?.includes('CERT_DATE_INVALID')) {
            return `This server's security certificate has expired. This may be caused by a misconfiguration or an attacker intercepting your connection.`
        }
        if (errorCode?.includes('CERT_AUTHORITY_INVALID')) {
            return `This server's security certificate was issued by an untrusted certificate authority. This may be caused by a misconfiguration or an attacker intercepting your connection.`
        }
        if (errorCode?.includes('CERT_REVOKED')) {
            return `This server's security certificate has been revoked by the certificate authority. This indicates the certificate should not be trusted.`
        }
        return `This server could not prove its identity; its security certificate has a problem. This may be caused by a misconfiguration or an attacker intercepting your connection.`
    }
</script>
<div class="frame-instance ssl-error">
    <div class="ssl-error-page">
        <div class="error-container">
            <div class="error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 4h.01M21 20.25H3L12 3l9 17.25Z" />
                </svg>
            </div>
            
            <h1 class="error-title">Your connection is not private</h1>
            
            <p class="error-description">Attackers might be trying to steal your information from <strong>{hostname}</strong> (for example, passwords, messages or credit cards).</p>
            {#if certificateError?.text}
                <p class="browser-message">{certificateError.text}</p>
            {/if}
            
            <div class="error-code">
                net::{certificateError?.code || 'ERR_CERT_INVALID'}
            </div>
            
            <div class="technical-explanation">
                {getTechnicalExplanation(certificateError?.code, hostname)}
            </div>
        </div>
    </div>
</div>

<style>
    /* Make the controlled-frame wrapper act as containing block for absolutely positioned overlay */
    :global(.frame-instance.ssl-error) {
        position: relative;
    }
    
    .ssl-error-page {
        position: absolute;
        width: 100%;
        height: 100%;
        background: #000;
        background-image: radial-gradient(circle at 50% 0%, #0c0c0c 0%, #000 80%);
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
        color: #b91c1c;
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
    
    .browser-message {
        font-size: 15px;
        line-height: 1.6;
        margin: 0 0 32px;
        color: rgba(255, 255, 255, 0.75);
        max-width: 520px;
        margin-left: auto;
        margin-right: auto;
    }
    
    .error-code {
        font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
        font-size: 18px;
        font-weight: 600;
        color: #b91c1c;
        margin: 0 0 24px;
        letter-spacing: 0.5px;
    }
    
    .technical-explanation {
        font-size: 14px;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.7);
        max-width: 500px;
        margin: 0 auto 32px;
        text-align: left;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 20px;
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
        
        .technical-explanation {
            text-align: left;
            padding: 16px;
        }
    }
</style> 
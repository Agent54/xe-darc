<script>
    import data from '../data.svelte.js'
    import { origin } from '../lib/utils.js'
    
    let {
        tab,
        size = 'small' // 'small' or 'large'
    } = $props()
    
    // Get origin data from the data store
    let originValue = $derived(tab?.url ? origin(tab.url) : null)
    let originData = $derived(originValue ? data.origins[originValue] : null)
    
    // Use origin data instead of tab properties
    let securityState = $derived(originData?.securityState || 'unknown')
    let certificateError = $derived(originData?.certificateError)
    let networkError = $derived(originData?.networkError)
    let isSecure = $derived(tab?.url?.startsWith('https:') || false)
    let isAboutUrl = $derived(tab?.url?.startsWith('about:') || false)
    
    // Determine if there are security issues that should replace the favicon
    // Skip certificate checks for about: URLs as they run inside the browser
    let hasSecurityIssue = $derived(
        !isAboutUrl && (
            certificateError || 
            networkError ||
            securityState === 'mixed' || 
            (securityState === 'insecure' && isSecure)
        )
    )
    
    function getSecurityIcon() {
        if (certificateError || networkError) {
            return 'warning'
        }
        if (securityState === 'secure') {
            return 'lock-closed'
        }
        if (securityState === 'mixed') {
            return 'lock-open'
        }
        if (securityState === 'insecure' && isSecure) {
            return 'warning'
        }
        if (!isSecure) {
            return 'shield-exclamation'
        }
        return 'question-mark-circle'
    }
    
    function getSecurityColor() {
        if (certificateError || networkError) {
            return '#ef4444' // red
        }
        if (securityState === 'secure') {
            return '#10b981' // green
        }
        if (securityState === 'mixed') {
            return '#f59e0b' // yellow
        }
        if (securityState === 'insecure') {
            return '#ef4444' // red
        }
        return '#6b7280' // gray
    }
    
    function getTooltipText() {
        if (certificateError) {
            return `Certificate Error: ${certificateError.text}`
        }
        if (networkError) {
            return `Network Error: ${networkError.code}`
        }
        if (securityState === 'secure') {
            return 'Secure connection'
        }
        if (securityState === 'insecure') {
            return 'Insecure connection'
        }
        if (!isSecure) {
            return 'Unencrypted connection'
        }
        return 'Security state unknown'
    }
    
    function renderSecurityIcon(iconType) {
        switch (iconType) {
            case 'warning':
                // Solid exclamation triangle (Heroicons solid)
                return `<svg viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" d="M10.34 1.39a1.5 1.5 0 0 1 3.32 0l8.83 16.26A1.5 1.5 0 0 1 21.17 20H2.83a1.5 1.5 0 0 1-1.32-2.35L10.34 1.39ZM12 6a.75.75 0 0 0-.75.75v4.5a.75.75 0 0 0 1.5 0v-4.5A.75.75 0 0 0 12 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
                </svg>`
            case 'lock-closed':
                return `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>`
            case 'lock-open':
                return `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>`
            case 'shield-exclamation':
                return `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 0v.008h.008V12.75H12Zm8.25-4.5c0 5.973-4.925 11.946-12 11.946S-.75 13.223-.75 7.25c0-1.36.22-2.667.598-3.869L12 .75l11.152 2.631c.378 1.202.598 2.51.598 3.869Z" />
                </svg>`
            case 'question-mark-circle':
                return `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
                </svg>`
            default:
                return ''
        }
    }
</script>

<div 
    class="security-indicator" 
    class:small={size === 'small'}
    class:large={size === 'large'}
    style="color: {getSecurityColor()}"
    title={getTooltipText()}
>
    {@html renderSecurityIcon(getSecurityIcon())}
</div>

<style>
    .security-indicator {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        opacity: 0.8;
        transition: opacity 0.2s ease;
    }
    
    .security-indicator:hover {
        opacity: 1;
    }
    
    .security-indicator.small {
        font-size: 12px;
        width: 14px;
        height: 14px;
    }
    
    .security-indicator.large {
        font-size: 14px;
        width: 16px;
        height: 16px;
    }
</style> 
export default {
    ip: {
        name: 'IP Address',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
        </svg>`,
        description: 'IP address and network information',
        availability: async () => {
            // todo: add ip masking and vpn location integration
            return { available: true, error: null }
        }
    },
    location: {
        name: 'Location',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>`,
        description: 'Geographic location and positioning data',
        availability: async () => {
            if (!navigator.geolocation) {
                return { available: false, error: 'Geolocation API not supported by browser' }
            }
            try {
                const permission = await navigator.permissions.query({ name: 'geolocation' })
                if (permission.state === 'denied') {
                    return { available: false, error: 'Location permission denied by user' }
                }
                return { available: true, error: null }
            } catch (e) {
                return { available: false, error: 'Unable to check location permission' }
            }
        }
    },
    camera: {
        name: 'Camera',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
        </svg>`,
        description: 'Camera access for photos and video capture',
        availability: async () => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return { available: false, error: 'Camera API not supported by browser' }
            }
            try {
                const permission = await navigator.permissions.query({ name: 'camera' })
                if (permission.state === 'denied') {
                    return { available: false, error: 'Camera permission denied by user' }
                }
                return { available: true, error: null }
            } catch (e) {
                return { available: false, error: 'Unable to check camera permission' }
            }
        }
    },
    microphone: {
        name: 'Microphone',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        </svg>`,
        description: 'Audio input and recording access',
        availability: async () => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return { available: false, error: 'Microphone API not supported by browser' }
            }
            try {
                const permission = await navigator.permissions.query({ name: 'microphone' })
                if (permission.state === 'denied') {
                    return { available: false, error: 'Microphone permission denied by user' }
                }
                return { available: true, error: null }
            } catch (e) {
                return { available: false, error: 'Unable to check microphone permission' }
            }
        }
    },
    'motion-sensors': {
        name: 'Motion Sensors',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>`,
        description: 'Device orientation and motion detection',
        availability: async () => {
            if (!window.DeviceOrientationEvent && !window.DeviceMotionEvent) {
                return { available: false, error: 'Motion sensors not supported by browser' }
            }
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    const permission = await DeviceOrientationEvent.requestPermission()
                    if (permission !== 'granted') {
                        return { available: false, error: 'Motion sensor permission denied by user' }
                    }
                } catch (e) {
                    return { available: false, error: 'Unable to request motion sensor permission' }
                }
            }
            return { available: true, error: null }
        }
    },
    notifications: {
        name: 'Notifications',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>`,
        description: 'System notifications and alerts',
        availability: async () => {
            if (!('Notification' in window)) {
                return { available: false, error: 'Notifications not supported by browser' }
            }
            if (Notification.permission === 'denied') {
                return { available: false, error: 'Notification permission denied by user' }
            }
            return { available: true, error: null }
        }
    },
    javascript: {
        name: 'JavaScript',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>`,
        description: 'JavaScript execution and scripting',
        availability: async () => {
            return { available: true, error: null } // Always available if this code is running
        }
    },
    images: {
        name: 'Images',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>`,
        description: 'Image loading and display',
        availability: async () => {
            return { available: true, error: null } // Images are generally always available
        }
    },
    popups: {
        name: 'Pop-ups and Redirects',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>`,
        description: 'Pop-up windows and page redirects',
        availability: async () => {
            return { available: true, error: null }
        }
    },
    'intrusive-ads': {
        name: 'Intrusive Ads',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>`,
        description: 'Ad blocking and intrusive content filtering',
        availability: async () => {
            return { available: false, error: 'Blocked by ad blocker or browser settings' } // Always blocked
        }
    },
    'background-sync': {
        name: 'Background Sync',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>`,
        description: 'Background data synchronization',
        availability: async () => {
            if (!('serviceWorker' in navigator) || !('sync' in window.ServiceWorkerRegistration.prototype)) {
                return { available: false, error: 'Background Sync API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    sound: {
        name: 'Sound',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.79-1.59-1.76V9.51c0-.97.71-1.76 1.59-1.76h2.24Z" />
        </svg>`,
        description: 'Audio output and media playback',
        availability: async () => {
            if (!window.Audio) {
                return { available: false, error: 'Audio API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    'automatic-downloads': {
        name: 'Automatic Downloads',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>`,
        description: 'Automatic file downloads and transfers',
        availability: async () => {
            return { available: false, error: 'Blocked by browser security policy' } // Usually blocked
        }
    },
    'midi-devices': {
        name: 'MIDI Device Control',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
        </svg>`,
        description: 'MIDI device control and programming',
        availability: async () => {
            if (!navigator.requestMIDIAccess) {
                return { available: false, error: 'Web MIDI API not supported by browser' }
            }
            try {
                await navigator.requestMIDIAccess()
                return { available: true, error: null }
            } catch (e) {
                return { available: false, error: 'MIDI access denied or no devices available' }
            }
        }
    },
    'usb-devices': {
        name: 'USB Devices',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-16.5 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21" />
        </svg>`,
        description: 'USB device access and control',
        availability: async () => {
            if (!navigator.usb) {
                return { available: false, error: 'WebUSB API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    'serial-ports': {
        name: 'Serial Ports',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.5-3h15m-15 0a2.25 2.25 0 0 1-2.25-2.25V6.75a2.25 2.25 0 0 1 2.25-2.25h15a2.25 2.25 0 0 1 2.25 2.25v8.25a2.25 2.25 0 0 1-2.25 2.25h-15Z" />
        </svg>`,
        description: 'Serial port communication',
        availability: async () => {
            if (!navigator.serial) {
                return { available: false, error: 'Web Serial API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    'file-editing': {
        name: 'File Editing',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
        </svg>`,
        description: 'File system editing and modification',
        availability: async () => {
            if (!window.showOpenFilePicker) {
                return { available: false, error: 'File System Access API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    'hid-devices': {
        name: 'HID Devices',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655-5.653a2.548 2.548 0 0 1-.1-3.528l.893-.893a2.55 2.55 0 0 1 3.528-.1l5.653 4.655M15.12 8.874l5.683-5.683a1.773 1.773 0 0 1 2.507 2.507L15.12 8.874ZM8.25 18.75a1.5 1.5 0 0 1-1.5-1.5v-1.875a1.125 1.125 0 0 1 1.125-1.125H10.5a1.125 1.125 0 0 1 1.125 1.125v1.875a1.5 1.5 0 0 1-1.5 1.5H8.25Z" />
        </svg>`,
        description: 'Human Interface Device access',
        availability: async () => {
            if (!navigator.hid) {
                return { available: false, error: 'WebHID API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    clipboard: {
        name: 'Clipboard',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
        </svg>`,
        description: 'Clipboard read and write access',
        availability: async () => {
            if (!navigator.clipboard) {
                return { available: false, error: 'Clipboard API not supported by browser' }
            }
            try {
                const permission = await navigator.permissions.query({ name: 'clipboard-read' })
                if (permission.state === 'denied') {
                    return { available: false, error: 'Clipboard permission denied by user' }
                }
                return { available: true, error: null }
            } catch (e) {
                return { available: true, error: null } // Fallback for older browsers
            }
        }
    },
    'payment-handlers': {
        name: 'Payment Handlers',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
        </svg>`,
        description: 'Payment processing and transactions',
        availability: async () => {
            if (!window.PaymentRequest) {
                return { available: false, error: 'Payment Request API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    'insecure-content': {
        name: 'Insecure Content',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
        </svg>`,
        description: 'Mixed content and security warnings',
        availability: async () => {
            const isSecure = location.protocol === 'https:' || location.hostname === 'localhost'
            if (!isSecure) {
                return { available: false, error: 'Mixed content blocked on insecure connection' }
            }
            return { available: true, error: null }
        }
    },
    'v8-optimiser': {
        name: 'V8 Optimiser',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5 10 3.75 16.25 13.5h-12.5Z" />
        </svg>`,
        description: 'JavaScript engine optimization',
        availability: async () => {
            return { available: true, error: null }
        }
    },
    'third-party-signin': {
        name: 'Third-party Sign-in',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>`,
        description: 'External authentication providers',
        availability: async () => {
            if (!window.CredentialsContainer || !navigator.credentials) {
                return { available: false, error: 'Credentials API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    'augmented-reality': {
        name: 'Augmented Reality',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>`,
        description: 'Augmented reality experiences',
        availability: async () => {
            if (!navigator.xr) {
                return { available: false, error: 'WebXR API not supported by browser' }
            }
            try {
                const supported = await navigator.xr.isSessionSupported('immersive-ar')
                if (!supported) {
                    return { available: false, error: 'AR not supported by device' }
                }
                return { available: true, error: null }
            } catch (e) {
                return { available: false, error: 'Unable to check AR support' }
            }
        }
    },
    'virtual-reality': {
        name: 'Virtual Reality',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>`,
        description: 'Virtual reality environments',
        availability: async () => {
            if (!navigator.xr) {
                return { available: false, error: 'WebXR API not supported by browser' }
            }
            try {
                const supported = await navigator.xr.isSessionSupported('immersive-vr')
                if (!supported) {
                    return { available: false, error: 'VR not supported by device' }
                }
                return { available: true, error: null }
            } catch (e) {
                return { available: false, error: 'Unable to check VR support' }
            }
        }
    },
    'device-use': {
        name: 'Your Device Use',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>`,
        description: 'Device usage analytics and telemetry',
        availability: async () => {
            return { available: false, error: 'Blocked by privacy settings' } // Usually blocked
        }
    },
    'window-management': {
        name: 'Window Management',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
        </svg>`,
        description: 'Multi-window and display management',
        availability: async () => {
            if (!window.getScreenDetails) {
                return { available: false, error: 'Window Management API not supported by browser' }
            }
            try {
                const permission = await navigator.permissions.query({ name: 'window-management' })
                if (permission.state === 'denied') {
                    return { available: false, error: 'Window management permission denied by user' }
                }
                return { available: true, error: null }
            } catch (e) {
                return { available: false, error: 'Unable to check window management permission' }
            }
        }
    },
    fonts: {
        name: 'Fonts',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 5.25h4.5m0 0L12 5.25m-4.5 0L12 5.25m0 0L16.5 21M12 5.25l4.5 15.75M12 5.25 16.5 21m-9.75-8.25h9" />
        </svg>`,
        description: 'Font loading and typography access',
        availability: async () => {
            if (!document.fonts || !document.fonts.query) {
                return { available: false, error: 'Font Loading API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    'automatic-picture-in-picture': {
        name: 'Automatic Picture-in-Picture',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 7.5l16.5-4.125M12 6.75c-2.708 0-5.363.224-7.948.655C2.999 7.58 2.25 8.507 2.25 9.574v9.176A2.25 2.25 0 0 0 4.5 21h15a2.25 2.25 0 0 0 2.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169A48.329 48.329 0 0 0 12 6.75Zm-1.683 6.443-.005.005-.006-.005.006-.005.005.005Zm-.005 2.127-.005-.006.005-.005.005.005-.005.006Zm2.448-2.127-.005-.005.005-.005.005.005-.005.005Zm0 2.127-.005.006-.005-.006.005-.005.005.005Z" />
        </svg>`,
        description: 'Automatic video overlay mode',
        availability: async () => {
            if (!document.pictureInPictureEnabled) {
                return { available: false, error: 'Picture-in-Picture not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    'scrolling-zooming-shared-tabs': {
        name: 'Scrolling and Zooming Shared Tabs',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607ZM10.5 7.5v6m3-3h-6" />
        </svg>`,
        description: 'Shared tab interaction controls',
        availability: async () => {
            return { available: false, error: 'Feature not implemented in browser' }
        }
    },
    'automatic-fullscreen': {
        name: 'Automatic Full Screen',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>`,
        description: 'Automatic fullscreen mode activation',
        availability: async () => {
            if (!document.fullscreenEnabled) {
                return { available: false, error: 'Fullscreen API not supported by browser' }
            }
            return { available: true, error: null }
        }
    },
    network: {
        name: 'Network',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <circle cx="12" cy="12" r="9" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3c-2.5 0-4.5 4-4.5 9s2 9 4.5 9 4.5-4 4.5-9-2-9-4.5-9Z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 12h18" />
        </svg>`,
        description: 'Internet connectivity and data usage',
        availability: async () => {
            if (!navigator.onLine) {
                return { available: false, error: 'No internet connection detected' }
            }
            return { available: true, error: null }
        }
    },
    'local-storage': {
        name: 'Local Storage',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>`,
        description: 'File system and local storage access',
        availability: async () => {
            try {
                localStorage.setItem('test', 'test')
                localStorage.removeItem('test')
                return { available: true, error: null }
            } catch (e) {
                return { available: false, error: 'Local storage disabled or quota exceeded' }
            }
        }
    },
    'server-storage': {
        name: 'Server Storage',
        icon: `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>`,
        description: 'Your data stored on servers of the sites',
        availability: async () => {
            if (!navigator.onLine) {
                return { available: false, error: 'No internet connection for server access' }
            }
            return { available: true, error: null }
        }
    }
}
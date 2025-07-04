<script>
    // Tab sidebar component with Firefox-like hover behavior
    let { isDragEnabled = true } = $props()
    import data from '../data.svelte.js'
    import Favicon from './Favicon.svelte'
    import { untrack } from 'svelte'
    
    let isHovered = $state(false)
    let tabListRef = $state(null)
    let openMenuId = $state(null)
    let closedTabsHovered = $state(false)
    let closedTabsHeaderHovered = $state(false)
    let closedTabsHideTimeout = null

    let isManualScroll = false
    let previousSpaceIndex = -1
    let scrollActiveSpaceTimeout = null
    
    // Dummy data matching Arc/Zen browser style
    const globallyPinnedTabs = [
        { id: 'global-1', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>', url: 'https://twitter.com' },
        { id: 'global-2', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>', url: 'https://github.com' },
        { id: 'global-3', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.354-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117v-6.038H8.148zm7.704 0h-.002c-2.476 0-4.49 2.015-4.49 4.491s2.014 4.49 4.49 4.49c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491zm0 7.509c-1.665 0-3.019-1.355-3.019-3.019s1.354-3.019 3.019-3.019 3.019 1.355 3.019 3.019-1.354 3.019-3.019 3.019z"/></svg>', url: 'https://figma.com' },
        { id: 'global-4', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636C.732 21.002 0 20.27 0 19.366V5.457c0-.904.732-1.636 1.636-1.636h3.819l6.545 4.91 6.545-4.91h3.819c.904 0 1.636.732 1.636 1.636z"/></svg>', url: 'https://gmail.com' }
    ]
    
    const spaces = $derived({
        ...data.spaces,
        design: {
            id: 'design',
            glyph: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
            name: 'Design',
            pinnedTabs: [
                { id: 'figma', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.354-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117v-6.038H8.148zm7.704 0h-.002c-2.476 0-4.49 2.015-4.49 4.491s2.014 4.49 4.49 4.49c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491zm0 7.509c-1.665 0-3.019-1.355-3.019-3.019s1.354-3.019 3.019-3.019 3.019 1.355 3.019 3.019-1.354 3.019-3.019 3.019z"/></svg>', url: 'https://figma.com', active: true },
                { id: 'linear', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 17l10-10M7 7h10v10"/></svg>', url: 'https://linear.app' }
            ],
            tabs: [
                { id: 'tab1', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>', title: 'Twitter', url: 'https://twitter.com' },
                { id: 'tab2', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.174-.105-.949-.199-2.403.042-3.441.219-.937 1.404-5.965 1.404-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.357-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001.012.001z"/></svg>', title: 'Apple', url: 'https://apple.com' },
                { id: 'tab3', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536h-1.568zm-11.136 0c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536H6.432zm12.8 7.68c-.8.8-2.4.8-3.2 0L12 12.8 8.96 15.84c-.8.8-2.4.8-3.2 0-.8-.8-.8-2.4 0-3.2L8.8 9.6c.8-.8 2.4-.8 3.2 0l3.04 3.04c.8.8.8 2.4 0 3.2z"/></svg>', title: 'Raycast', url: 'https://raycast.com' }
            ]
        },
        tools: {
            id: 'tools',
            glyph: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>',
            name: 'Tools',
            pinnedTabs: [
                { id: 'raycast', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536h-1.568zm-11.136 0c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536H6.432zm12.8 7.68c-.8.8-2.4.8-3.2 0L12 12.8 8.96 15.84c-.8.8-2.4.8-3.2 0-.8-.8-.8-2.4 0-3.2L8.8 9.6c.8-.8 2.4-.8 3.2 0l3.04 3.04c.8.8.8 2.4 0 3.2z"/></svg>', url: 'https://raycast.com' },
                { id: 'linear2', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 17l10-10M7 7h10v10"/></svg>', url: 'https://linear.app' }
            ],
            tabs: [
                { id: 'tab4', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>', title: 'Twitter', url: 'https://twitter.com', active: true },
                { id: 'tab5', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>', title: 'Twitter', url: 'https://twitter.com' },
                { id: 'tab6', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536h-1.568zm-11.136 0c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536H6.432zm12.8 7.68c-.8.8-2.4.8-3.2 0L12 12.8 8.96 15.84c-.8.8-2.4.8-3.2 0-.8-.8-.8-2.4 0-3.2L8.8 9.6c.8-.8 2.4-.8 3.2 0l3.04 3.04c.8.8.8 2.4 0 3.2z"/></svg>', title: 'Raycast', url: 'https://raycast.com' }
            ]
        },
        dev: {
            id: 'dev',
            glyph: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
            name: 'Development',
            pinnedTabs: [
                { id: 'github', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>', url: 'https://github.com' }
            ],
            tabs: [
                { id: 'tab7', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>', title: 'Twitter', url: 'https://twitter.com' }
            ]
        },
        notes: {
            id: 'notes',
            glyph: null,
            name: 'Notes',
            pinnedTabs: [],
            tabs: [
                { id: 'tab8', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/></svg>', title: 'Notes', url: 'https://notes.app' }
            ]
        }
    })
    
    const spaceOrder = $derived([...Object.keys(data.spaces).sort((a, b) => a.order.localeCompare(b.order)), 'design', 'tools', 'dev', 'notes'])
    
    // Recently closed tabs
    const closedTabs = [
        { id: 'closed-1', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>', title: 'Twitter Home', url: 'https://twitter.com' },
        { id: 'closed-2', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>', title: 'GitHub Dashboard', url: 'https://github.com' },
        { id: 'closed-3', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.354-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117v-6.038H8.148zm7.704 0h-.002c-2.476 0-4.49 2.015-4.49 4.491s2.014 4.49 4.49 4.49c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491zm0 7.509c-1.665 0-3.019-1.355-3.019-3.019s1.354-3.019 3.019-3.019 3.019 1.355 3.019 3.019-1.354 3.019-3.019 3.019z"/></svg>', title: 'Figma Design', url: 'https://figma.com' },
        { id: 'closed-4', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536h-1.568zm-11.136 0c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536H6.432zm12.8 7.68c-.8.8-2.4.8-3.2 0L12 12.8 8.96 15.84c-.8.8-2.4.8-3.2 0-.8-.8-.8-2.4 0-3.2L8.8 9.6c.8-.8 2.4-.8 3.2 0l3.04 3.04c.8.8.8 2.4 0 3.2z"/></svg>', title: 'Raycast Settings', url: 'https://raycast.com' },
        { id: 'closed-5', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 17l10-10M7 7h10v10"/></svg>', title: 'Linear Issues', url: 'https://linear.app' }
    ]
    
    function handleMouseEnter() {
        isHovered = true
    }
    
    function handleMouseLeave() {
        isHovered = false
    }
    
    function scrollToCurrentSpace(behavior = 'smooth') {
        if (tabListRef && data.spaceMeta.activeSpace) {
            const targetElement = tabListRef.querySelector(`[data-space-id="${data.spaceMeta.activeSpace}"]`)
            if (targetElement) {
                targetElement.scrollIntoView({ behavior, inline: 'start' })
            }
        }
    }

    function handleSpaceClick(spaceId) {
        data.spaceMeta.activeSpace = spaceId
        previousSpaceIndex = spaceOrder.indexOf(spaceId)
        isManualScroll = true
        scrollToCurrentSpace('smooth')
        setTimeout(() => { isManualScroll = false }, 300)
    }
    
    function handleTabScroll(event) {
        if (!tabListRef) return
        
        const scrollLeft = tabListRef.scrollLeft
        const containerWidth = tabListRef.clientWidth
        const newIndex = Math.round(scrollLeft / containerWidth)
        
        if (newIndex !== spaceOrder.indexOf(data.spaceMeta.activeSpace) && newIndex >= 0 && newIndex < spaceOrder.length) {
            if (scrollActiveSpaceTimeout) {
                clearTimeout(scrollActiveSpaceTimeout)
            }
            
            scrollActiveSpaceTimeout = setTimeout(() => {
                // Double-check that we're still on the same space after the delay
                const currentScrollLeft = tabListRef.scrollLeft
                const currentContainerWidth = tabListRef.clientWidth
                const currentIndex = Math.round(currentScrollLeft / currentContainerWidth)
                
                if (currentIndex === newIndex && currentIndex >= 0 && currentIndex < spaceOrder.length) {
                    isManualScroll = true
                    data.spaceMeta.activeSpace = spaceOrder[currentIndex]
                    setTimeout(() => { isManualScroll = false }, 100)
                }
                
                scrollActiveSpaceTimeout = null
            }, 500)
        }
    }
    
    function handleMenuToggle(spaceId) {
        openMenuId = openMenuId === spaceId ? null : spaceId
    }
    
    function handleMenuItemClick(action, spaceId) {
        // Handle the action (rename, change icon, set default container)
        console.log(`Action: ${action} for space: ${spaces[spaceId].name}`)
        
        if (action.startsWith('container-')) {
            const containerType = action.replace('container-', '')
            console.log(`Setting container to: ${containerType} for space: ${spaces[spaceId].name}`)
            // TODO: Implement container assignment logic
        }
        
        openMenuId = null
    }
    
    function handleClickOutside(event) {
        if (openMenuId !== null && !event.target.closest('.space-menu')) {
            openMenuId = null
        }
    }
    
    function handleClosedTabsMouseEnter() {
        if (closedTabsHideTimeout) {
            clearTimeout(closedTabsHideTimeout)
            closedTabsHideTimeout = null
        }
        closedTabsHovered = true
    }
    
    function handleClosedTabsMouseLeave() {
        closedTabsHideTimeout = setTimeout(() => {
            closedTabsHovered = false
            closedTabsHideTimeout = null
        }, 300)
    }
    
    // onMount(() => {
    //     scrollToCurrentSpace('instant')
    //     previousSpaceIndex = spaceOrder.indexOf(data.spaceMeta.activeSpace)
    // })

    // Watch for changes in space order that might affect current space position
    $effect(() => {
        const currentIndex = spaceOrder.indexOf(untrack(() => data.spaceMeta.activeSpace))
        if (currentIndex !== -1 && currentIndex !== previousSpaceIndex && tabListRef && !isManualScroll) {
            scrollToCurrentSpace('instant')
        }
        if (currentIndex !== -1) {
            previousSpaceIndex = currentIndex
        }
    })
    

</script>

<svelte:window onclick={handleClickOutside} onkeydown={(e) => { if (e.key === 'Escape') handleClickOutside(e) }} />

<div class="sidebar-box" 
     class:hovered={isHovered}
     onmouseenter={handleMouseEnter} 
     onmouseleave={handleMouseLeave}

     role="complementary"
     aria-label="Tab Sidebar">
    <div class="sidebar">
        <div class="sidebar-content">
            <!-- Globally Pinned Tabs -->
            <div class="section">
                <div class="pinned-tabs-grid">
                    {#each globallyPinnedTabs as tab}
                        <button class="pinned-tab" title={tab.url}>
                            <Favicon {tab} showButton={false} />
                        </button>
                    {/each}
                </div>
            </div>

            <div class="section">
                <div class="spaces-container">
                    <div class="spaces-list">
                        {#each spaceOrder as spaceId}
                            <button class="space-item" 
                                    class:active={data.spaceMeta.activeSpace === spaceId}
                                    onmousedown={() => handleSpaceClick(spaceId)}
                                    aria-label={`Switch to ${spaces[spaceId].name} space`}>
                                {#if spaces[spaceId].glyph}
                                    <span class="space-glyph">{@html spaces[spaceId].glyph}</span>
                                {:else}
                                    <span class="space-glyph-default"></span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                    <button class="new-space-button" 
                            onclick={() => console.log('Create new space')}
                            aria-label="Create new space">
                        <span class="plus-icon">+</span>
                    </button>
                </div>
            </div>
            
            <!-- Horizontally Scrollable Tab Content -->
            <div class="section flex-1">
                <div class="tab-content-container" 
                     bind:this={tabListRef}
                     onscroll={handleTabScroll}>
                    <div class="tab-content-track">
                        {#each spaceOrder as spaceId}
                            <div class="space-content" data-space-id={spaceId}>
                                <div class="space-title-container">
                                    <div class="space-title" class:active={data.spaceMeta.activeSpace === spaceId}>
                                        {spaces[spaceId].name}
                                    </div>
                                    <div class="space-menu">
                                        <button class="space-menu-button" 
                                                onmousedown={(e) => { e.stopPropagation(); handleMenuToggle(spaceId); }}
                                                aria-label="Space options">⋯</button>
                                        <div class="space-menu-dropdown" class:open={openMenuId === spaceId}>
                                            <button class="space-menu-item" 
                                                    onmouseup={() => handleMenuItemClick('rename', spaceId)}
                                                    role="menuitem">Rename</button>
                                            <button class="space-menu-item"
                                                    onmouseup={() => handleMenuItemClick('change-icon', spaceId)}
                                                    role="menuitem">Change icon</button>
                                            <button class="space-menu-item"
                                                    onmouseup={() => handleMenuItemClick('change-color', spaceId)}
                                                    role="menuitem">Change color</button>
                                            <button class="space-menu-item"
                                                    onmouseup={() => handleMenuItemClick('container', spaceId)}
                                                    role="menuitem">Container</button>
                                        </div>
                                    </div>
                                </div>
                                
                                {#if spaces[spaceId].pinnedTabs?.length > 0}
                                    <div class="pinned-tabs-grid">
                                        {#each spaces[spaceId].pinnedTabs as tab}
                                            <button class="app-tab" class:active={tab.active} title={tab.url}>
                                                <Favicon {tab} showButton={false} />
                                            </button>
                                        {/each}
                                    </div>
                                {/if}
                                
                                <div class="tabs-list">
                                    {#each spaces[spaceId].tabs as tab}
                                                                            <div class="tab-item" class:active={tab.active} title={tab.url}>
                                        <Favicon {tab} showButton={false} />
                                        <span class="tab-title">{tab.title}</span>
                                        <button class="tab-close" aria-label="Close tab">×</button>
                                    </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
            
            {#if closedTabs.length > 0}
                <div class="section closed-tabs-section"
                     onmouseenter={handleClosedTabsMouseEnter}
                     onmouseleave={handleClosedTabsMouseLeave}
                     role="region"
                     aria-label="Recently closed tabs">
                    <div class="closed-tabs-header"
                         onmouseenter={() => closedTabsHeaderHovered = true}
                         onmouseleave={() => closedTabsHeaderHovered = false}
                         role="button"
                         tabindex="0"
                         aria-label="Clear all recently closed tabs">
                        <span class="closed-tabs-title">{closedTabsHeaderHovered ? 'Clear All' : 'Recently Closed'}</span>
                        <span class="closed-tabs-count">{closedTabs.length}</span>
                    </div>
                    <div class="closed-tabs-content" class:expanded={closedTabsHovered}>
                        <div class="closed-tabs-list">
                            {#each closedTabs as tab}
                                                            <button class="closed-tab-item" title={tab.url}>
                                <Favicon {tab} showButton={false} />
                                <span class="tab-title">{tab.title}</span>
                            </button>
                            {/each}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .sidebar-box {
        background: transparent;
        position: fixed;
        z-index: 100000;
        bottom: 9px;
        top: 43px;
        left: 0px;
        overflow: hidden;
        transition: transform 190ms 340ms cubic-bezier(.78,-0.01,.34,1.04);
        padding-right: 15px;
        transform: translateX(-248px);
        backface-visibility: hidden;
        padding-left: 9px;
        width: 263px;
        pointer-events: auto;
    }

    .sidebar-box.hovered, .sidebar-box:hover {
        transition: transform 190ms 0ms cubic-bezier(.78,-0.01,.34,1.04);
        transform: translateX(0px);
    }

    .sidebar {
        flex: 1;
        border-radius: 9px;
        box-shadow: 0 0 2px 0 #000, -18px 0px 2px 1px #000;
        border: 1px solid hsl(0 0% 12% / 1);
        overflow: hidden;
        height: 100%;
        backdrop-filter: blur(21px);
        background: rgba(0, 0, 0, 0.85);
        user-select: none;
    }

    .sidebar-content {
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        background: transparent;
        padding: 4px;
        display: flex;
        flex-direction: column;
        /* gap: 6px; */
    }
    
    .section {
        display: flex;
        flex-direction: column;
    }
    
    .flex-1 {
        flex: 1;
    }
    
    /* Pinned Tabs Grid (shared for global and app tabs) */
    .pinned-tabs-grid {
        display: grid;
        grid-template-columns: repeat(4, 41px);
        gap: 3px;
        padding: 4px;
    }
    
    .pinned-tab {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: rgb(255 255 255 / 7%);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        color: rgba(255, 255, 255, 0.3);
        padding: 0;
        margin: 0;
    }
    
    .pinned-tab:hover {
        background: rgba(255, 255, 255, 0.15);
    }
    
    .spaces-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px;
        margin-top: 13px;
    }
    
    .spaces-list {
        display: flex;
        flex-direction: row;
        gap: 6px;
    }
    
    .space-item {
        width: 22px;
        height: 22px;
        border-radius: 10px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        opacity: 0.6;
        padding: 0;
        margin: 0;
    }
    
    .space-item:hover {
        background: rgba(255, 255, 255, 0.1);
        opacity: 0.8;
    }
    
    .space-item.active {
        background: transparent;
        opacity: 1;
    }
    
    .space-glyph {
        font-size: 12px;
        line-height: 1;
        width: 12px;
        height: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.3);
    }
    
    :global(.space-glyph svg) {
        width: 100%;
        height: 100%;
    }
    
    .space-glyph-default {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .new-space-button {
        width: 22px;
        height: 22px;
        border-radius: 10px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        opacity: 0;
        visibility: hidden;
        padding: 0;
        margin: 0;
    }
    
    .spaces-container:hover .new-space-button {
        opacity: 0.6;
        visibility: visible;
    }
    
    .new-space-button:hover {
        background: rgba(255, 255, 255, 0.1);
        opacity: 1;
    }
    
    .plus-icon {
        font-size: 16px;
        line-height: 1;
        color: rgba(255, 255, 255, 0.3);
    }
    
    .space-title-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 4px 0px 6px;
        margin-bottom: -4px;
    }
    
    .space-title {
        color: rgba(255, 255, 255, 0.6);
        font-size: 11px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        text-align: left;
    }
    
    .space-title.active {
        color: white;
        font-weight: 600;
    }
    
    .space-menu {
        position: relative;
        opacity: 1;
    }
    
    .space-menu-button {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.4);
        cursor: pointer;
        font-size: 14px;
        line-height: 14px;
        padding: 4px;
        border-radius: 10px;
        transition: all 150ms ease;
        opacity: 0;
    }
    
    .space-title-container:hover .space-menu-button {
        opacity: 1;
    }
    
    .space-menu-button:hover {
        color: rgba(255, 255, 255, 0.8);
        background: rgba(255, 255, 255, 0.1);
    }
    
    .space-menu-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 4px 0;
        min-width: 180px;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        transition: all 150ms ease;
        backdrop-filter: blur(12px);
        overflow: visible;
    }
    
    .space-menu-dropdown.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
    }
    
    .space-menu-item {
        padding: 6px 12px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
        cursor: pointer;
        transition: background 150ms ease;
        background: transparent;
        border: none;
        width: 100%;
        text-align: left;
    }
    
    .space-menu-item:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.95);
    }
    
    .space-menu-item:active {
        background: rgba(255, 255, 255, 0.15);
    }


    
    /* Horizontal Tab Content */
    .tab-content-container {
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        -ms-overflow-style: none;
        height: 100%;
        border-radius: 10px;
    }
    
    .tab-content-container::-webkit-scrollbar {
        display: none;
    }
    
    .tab-content-track {
        display: flex;
        height: 100%;
        gap: 20px;
    }
    
    .space-content {
        width: 100%;
        flex-shrink: 0;
        scroll-snap-align: start;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 100%;
        overflow-y: auto;
        padding-top: 0;
    }
    

    
    .app-tab {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: rgb(255 255 255 / 7%);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        color: rgba(255, 255, 255, 0.3);
        padding: 0;
        margin: 0;
    }
    
    .app-tab:hover {
        background: rgba(255, 255, 255, 0.15);
    }
    
    .app-tab.active {
        background: rgb(255 255 255 / 14%);
    }
    
    .app-tab.active:hover {
        background: rgb(255 255 255 / 17%);
    }
    
    .app-tab.active :global(.tab-favicon) {
        opacity: 0.6;
    }
    
    .app-tab:hover :global(.tab-favicon) {
        opacity: 0.8;
    }
    
    /* Regular Tabs */
    .tabs-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
    }
    
    .tab-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 6px 4px 8px;
        border-radius: 10px;
        background: rgb(255 255 255 / 7%);
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        min-height: 36px;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
    }
    
    .tab-item:hover {
        background: rgba(255, 255, 255, 0.15);
    }
    
    .tab-item.active {
        background: rgb(255 255 255 / 14%);
    }
    
    .tab-item.active:hover {
        background: rgb(255 255 255 / 17%);
    }
    
    .tab-favicon {
        font-size: 16px;
        line-height: 1;
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.3);
        opacity: 0.5;
    }
    
    :global(.tab-favicon svg) {
        width: 100%;
        height: 100%;
    }
    
    .tab-title {
        color: hsl(0 0% 35% / 1);
        font-size: 13px;
        font-weight: 300;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        line-height: 1.2;
        margin-top: 1px;
    }
    
    .tab-item.active .tab-title {
        color: #999999;
    }
    
    .tab-item:hover .tab-title {
        color: #fff;
    }
    
    .tab-item.active :global(.tab-favicon) {
        opacity: 0.6;
    }
    
    .tab-item:hover :global(.tab-favicon) {
        opacity: 0.8;
    }
    
    .tab-close {
        width: 20px;
        height: 20px;
        border-radius: 10px;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        line-height: 1;
        opacity: 0;
        transition: all 150ms ease;
        flex-shrink: 0;
    }
    
    .tab-item:hover .tab-close {
        opacity: 1;
    }
    
    .tab-close:hover {
        color: rgba(255, 255, 255, 0.9);
    }
    
    /* Recently Closed Tabs */
    .closed-tabs-section {
        margin-top: auto;
        padding-top: 8px;
    }
    
    .closed-tabs-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        cursor: pointer;
        border-radius: 10px;
        transition: all 50ms ease;
        background: transparent;
    }
    
    .closed-tabs-header:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .closed-tabs-title {
        color: rgba(255, 255, 255, 0.6);
        font-size: 11px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
    }
    
    .closed-tabs-count {
        color: rgba(255, 255, 255, 0.4);
        font-size: 10px;
        font-weight: 400;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 8px;
        min-width: 16px;
        text-align: center;
    }
    
    .closed-tabs-content {
        max-height: 0;
        overflow: hidden;
        transition: max-height 200ms ease 200ms;
    }
    
    .closed-tabs-content.expanded {
        max-height: 400px;
        transition: max-height 200ms ease;
    }
    
    .closed-tabs-list {
        padding: 8px 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 400px;
        overflow-y: auto;
    }
    
    .closed-tab-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 8px;
        border-radius: 10px;
        background: transparent;
        cursor: pointer;
        transition: all 150ms ease;
        border: 1px solid transparent;
        min-height: 32px;
        width: 100%;
        text-align: left;
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
    }
    
    .closed-tab-item:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .closed-tab-item .tab-favicon {
        opacity: 0.3;
    }
    
    .closed-tab-item .tab-title {
        color: rgba(255, 255, 255, 0.25);
        font-size: 12px;
    }
    
    .closed-tab-item:hover .tab-favicon {
        opacity: 0.6;
    }
    
    .closed-tab-item:hover .tab-title {
        color: rgba(255, 255, 255, 0.7);
    }

    /* .sidebar-content::-webkit-scrollbar {
        width: 6px;
    }

    .sidebar-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .sidebar-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .sidebar-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    } */
</style>

<!-- <div class="drag-handle-left" class:drag-enabled={isDragEnabled}></div> -->

<!-- 

.deck-previewed {
  visibility: visible;
  padding: 67px !important;
  z-index: 180 !important;
  background: #000000c4;
  display: block;
  position: relative;
  -moz-subtree-hidden-only-visually: 0;
}

.deck-previewed > .browserContainer {
    width: 100%;
    height: 100%;
    border-radius: 9px;
    overflow: hidden;
    box-shadow: 0px 0px 13px #00000087;
}

#appcontent {
    margin-left: 14px;
    border-radius: 9px;
    overflow: hidden;
    border-left: 1px solid #cecece1a !important;
    border-top: none;
}

#TabsToolbar {
     visibility: collapse;
}

#urlbar-container {
   min-width: 30vw !important;
}

#urlbar {
    top: 4px!important;
}

#nav-bar.browser-toolbar {
    position: absolute!important;
    z-index: 100000;
    border-bottom-right-radius: 10px;
/*     box-shadow: 0px 0px 20px 0px #000000e3 !important; */
    padding: 16px!important;
    background: rgb(8,8,8) !important;
    padding-left: 50px;
    border: none;
    padding-left: 26px!important;
}

#navigator-toolbox {
    position: absolute!important;
    z-index: 10000;
    transition: transform 90ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateY(-72px);
    width: 100%;
    height: 84px;
    border: none !important;
    background-image: none !important;
    background: transparent !important;
}

#navigator-toolbox:hover {
    transition: transform 90ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateY(0px);
}


#navigator-toolbox:not(:hover) #downloads-indicator-progress-inner {
    position: fixed;
    top: 84px;
    left: 4px;
    z-index: 10000;
    width: 7px!important;
    height: 7px!important;
    visibility: visible;
    display: block;
/*     box-shadow: 0px 0px 5px blue; */
}

.certErrorPage.notSecureText:before {
    display: block;
    content: '';
    position: fixed;
    height: 5px;
    width: 5px;
    background: red;
    top: 74px;
    left: 5px;
    border-radius: 100%;
    box-shadow: 0px 0px 5px #f00;
}

.notSecure:before { 
    display: block;
    content: '';
    position: fixed;
    height: 5px;
    width: 5px;
    background: orange;
    top: 74px;
    left: 5px;
    border-radius: 100%;
    box-shadow: 0px 0px 5px #f00;
}

/* #navigator-toolbox:hover .certErrorPage.notSecureText:before {
   top: 6px; 
}
     */
#sidebar-header {
    display: none;
}

#sidebar {
    -moz-box-flex: 1;
    border-radius: 9px;
    box-shadow: 0 0 2px 0 #000;
    border: 1px solid rgb(41, 41, 43);
    overflow: hidden;
    height: 100%;
    background: transparent;
  }

#sidebar-box {
    background: transparent !important;
    position: absolute;
    height: unset !important;
    z-index: 100000;
    border-radius: 9px;
    bottom: 0px !important;
    top: 0px !important;
    overflow: hidden !important;
    transition: transform 190ms 340ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    padding-right: 15px;
/*     cursor: grab; */
    transform: translateX(-248px);
    backface-visibility: hidden;
    padding-left: 12px;
    background:  transparent !important;
    width: 263px !important;
}

#sidebar-box:hover  {
    transition: transform 190ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateX(0px);
}



/* #sidebar-box:hover  {
 padding-right: 55px;
} */ -->
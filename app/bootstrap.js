export default [
    {
        _id: '1',
        type: 'space',
        name: 'Default',
        order: 1,
        tabs: []
    },
    {
        _id: '66',
        type: 'space',
        name: 'Test',
        tabs: [],
        order: 1000
    },

    {
        // http://coolgrandmajesticpathway.neverssl.com/online/
        _id: '12',
        type: 'tab',
        spaceId: '1',
        url: 'http://coolgrandmajesticpathway.neverssl.com/online/',
        title: 'HTTP test',
        screenshot: null,
        pinned: false
    },
    {
        _id: '11',
        type: 'tab',
        spaceId: '1',
        url: 'http://localhost:5173',
        title: 'XR',
        screenshot: null,
        pinned: false
    },
    {
        _id: '10',
        type: 'tab',
        spaceId: '1',
        url: 'https://wicg.github.io/controlled-frame',
        title: 'Controlled Frame API',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://wicg.github.io&size=64',
        screenshot: null,
        pinned: false,
    },
    {
        _id: '2',
        type: 'tab',
        url: 'https://open.spotify.com/',
        title: 'Spotify',
        spaceId: '1',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://open.spotify.com&size=64',
        screenshot: null,
        pinned: false,
    },
    {
        _id: '0',
        type: 'tab',
        url: 'http://lanes.localhost/',
        title: 'Lanes',
        spaceId: '1',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://lanes.pm&size=64',
        screenshot: null,
        pinned: false,
    },
    {
        _id: '1d',
        type: 'tab',
        spaceId: '1',
        url: 'https://operaneon.com/',
        title: 'Opera Neon',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://operaneon.com&size=64',
        screenshot: null,
        pinned: false,
    },
    {
        _id: '3',
        type: 'tab',
        spaceId: '1',
        url: 'https://google.com',
        title: 'Google',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://google.com&size=64',
        screenshot: null,
        pinned: false,
    },

    {
        _id: '5',
        type: 'tab',
        spaceId: '1',
        url: 'https://github.com/orgs/Agent54',
        title: 'Agent54',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://github.com&size=64',
        screenshot: null,
        pinned: false,
    },
    {
        _id: '16',
        type: 'tab',
        spaceId: '1',
        url: 'https://agregore.org',
        title: 'Agregore',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://agregore.org&size=64',
        screenshot: null,
        pinned: false,
    },
    {
        _id: '26',
        type: 'tab',
        spaceId: '1',
        url: 'https://users-and-agents.com',
        title: 'Agents & Agents',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://github.com&size=64',
        screenshot: null,
        pinned: false,
    },
    {
        _id: '36',
        type: 'tab',
        spaceId: '1',
        url: 'https://badssl.com/',
        title: 'Bad SSL',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://badssl.com&size=64',
        screenshot: null,
        pinned: false,
    },
    {
        _id: '7',
        type: 'tab',
        spaceId: '1',
        url: 'https://www.figma.com/design/HP40QZCsYVBnYahP4oUa2q/Darc-browser?node-id=0-1&p=f&t=mEPREy5GwjSdFBX9-0',
        title: 'Figma',
        favicon: 'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://figma.com&size=64',
        screenshot: null,
        pinned: false,
    },

    {
        _id: 'global-1',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>',
        spaceId: '_global',
        pinned: 'app',
        type: 'tab',
        url: 'https://twitter.com'
    },

    {
        _id: 'global-2',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
        type: 'tab',
        spaceId: '_global',
        pinned: 'app',
        url: 'https://github.com'
    },

    {
        _id: 'global-3',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.354-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117v-6.038H8.148zm7.704 0h-.002c-2.476 0-4.49 2.015-4.49 4.491s2.014 4.49 4.49 4.49c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491zm0 7.509c-1.665 0-3.019-1.355-3.019-3.019s1.354-3.019 3.019-3.019 3.019 1.355 3.019 3.019-1.354 3.019-3.019 3.019z"/></svg>',
        type: 'tab',
        spaceId: '_global',
        pinned: 'app',
        url: 'https://figma.com'
    },

    {
        _id: 'global-4',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636C.732 21.002 0 20.27 0 19.366V5.457c0-.904.732-1.636 1.636-1.636h3.819l6.545 4.91 6.545-4.91h3.819c.904 0 1.636.732 1.636 1.636z"/></svg>',
        type: 'tab',
        spaceId: '_global',
        pinned: 'app',
        url: 'https://gmail.com'
    },

    {
        _id: 'design',
        type: 'space',
        glyph: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
        name: 'Design',
        pinnedTabs: [

        ],
        tabs: [

        ]
    },
    {
        _id: 'figma',
        type: 'tab',
        pinned: 'app',
        spaceId: 'design',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.354-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117v-6.038H8.148zm7.704 0h-.002c-2.476 0-4.49 2.015-4.49 4.491s2.014 4.49 4.49 4.49c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491zm0 7.509c-1.665 0-3.019-1.355-3.019-3.019s1.354-3.019 3.019-3.019 3.019 1.355 3.019 3.019-1.354 3.019-3.019 3.019z"/></svg>',
        url: 'https://figma.com',
        active: true
    },
    {
        _id: 'linear',
        type: 'tab',
        pinned: 'app',
        spaceId: 'design',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 17l10-10M7 7h10v10"/></svg>',
        url: 'https://linear.app'
    },
    {
        _id: 'tab1',
        type: 'tab',
        spaceId: 'design',
        order: 1,
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>',
        title: 'Twitter',
        url: 'https://twitter.com'
    },
    {
        _id: 'divider1',
        type: 'tab',
        spaceId: 'design',
        order: 2,
        type: 'divider',
        title: 'Social Media'
    },
    {
        _id: 'tab2',
        type: 'tab',
        spaceId: 'design',
        order: 3,
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.174-.105-.949-.199-2.403.042-3.441.219-.937 1.404-5.965 1.404-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.357-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001.012.001z"/></svg>',
        title: 'Apple',
        url: 'https://apple.com'
    },
    {
        _id: 'divider2',
        type: 'tab',
        spaceId: 'design',
        order: 4,
        type: 'divider'
    },
    {
        _id: 'tab3',
        type: 'tab',
        spaceId: 'design',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536h-1.568zm-11.136 0c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536H6.432zm12.8 7.68c-.8.8-2.4.8-3.2 0L12 12.8 8.96 15.84c-.8.8-2.4.8-3.2 0-.8-.8-.8-2.4 0-3.2L8.8 9.6c.8-.8 2.4-.8 3.2 0l3.04 3.04c.8.8.8 2.4 0 3.2z"/></svg>',
        title: 'Raycast',
        url: 'https://raycast.com'
    },
    {
        _id: 'tools',
        type: 'space',
        glyph: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>',
        name: 'Tools',
        pinnedTabs: [

        ],
        tabs: [

        ]
    },
    {
        _id: 'raycast',
        type: 'tab',
        pinned: 'app',
        spaceId: 'tools',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536h-1.568zm-11.136 0c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536H6.432zm12.8 7.68c-.8.8-2.4.8-3.2 0L12 12.8 8.96 15.84c-.8.8-2.4.8-3.2 0-.8-.8-.8-2.4 0-3.2L8.8 9.6c.8-.8 2.4-.8 3.2 0l3.04 3.04c.8.8.8 2.4 0 3.2z"/></svg>',
        url: 'https://raycast.com'
    },
    {
        _id: 'linear2',
        type: 'tab',
        pinned: 'app',
        spaceId: 'tools',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 17l10-10M7 7h10v10"/></svg>',
        url: 'https://linear.app'
    },
    {
        _id: 'tab4',
        type: 'tab',
        spaceId: 'tools',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>',
        title: 'Twitter',
        url: 'https://twitter.com',
        active: true
    },
    {
        _id: 'tab5',
        type: 'tab',
        spaceId: 'tools',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>',
        title: 'Twitter',
        url: 'https://twitter.com'
    },
    {
        _id: 'tab6',
        type: 'tab',
        spaceId: 'tools',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536h-1.568zm-11.136 0c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536H6.432zm12.8 7.68c-.8.8-2.4.8-3.2 0L12 12.8 8.96 15.84c-.8.8-2.4.8-3.2 0-.8-.8-.8-2.4 0-3.2L8.8 9.6c.8-.8 2.4-.8 3.2 0l3.04 3.04c.8.8.8 2.4 0 3.2z"/></svg>',
        title: 'Raycast',
        url: 'https://raycast.com'
    },
    {
        _id: 'dev',
        glyph: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
        name: 'Development',
        type: 'space',
        pinnedTabs: [

        ],
        tabs: [

        ]
    },

    {
        _id: 'github',
        type: 'tab',
        pinned: 'app',
        spaceId: 'dev',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
        url: 'https://github.com'
    },

    {
        _id: 'tab7',
        type: 'tab',
        pinned: 'app',
        spaceId: 'dev',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>',
        title: 'Twitter',
        url: 'https://twitter.com'
    },
    {
        _id: 'notes',
        type: 'space',
        glyph: null,
        name: 'Notes',
        pinnedTabs: [],
        tabs: []
    },

    {
        _id: 'tab8', spaceId: 'notes', favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/></svg>', title: 'Notes', url: 'https://notes.app'
    },

    {
        _id: 'closed-1',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/></svg>',
        title: 'Twitter Home',
        url: 'https://twitter.com'
    },

    {
        _id: 'closed-2',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
        title: 'GitHub Dashboard',
        url: 'https://github.com'
    },

    {
        _id: 'closed-3',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.354-3.019-3.019-3.019h-3.117V7.51zm0 1.471H8.148c-2.476 0-4.49-2.015-4.49-4.491S5.672 0 8.148 0h4.588v8.981zm-4.587-7.51c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117V1.471H8.148zm4.587 15.019H8.148c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM8.148 8.981c-1.665 0-3.019 1.355-3.019 3.019s1.354 3.019 3.019 3.019h3.117v-6.038H8.148zm7.704 0h-.002c-2.476 0-4.49 2.015-4.49 4.491s2.014 4.49 4.49 4.49c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491zm0 7.509c-1.665 0-3.019-1.355-3.019-3.019s1.354-3.019 3.019-3.019 3.019 1.355 3.019 3.019-1.354 3.019-3.019 3.019z"/></svg>',
        title: 'Figma Design',
        url: 'https://figma.com'
    },

    {
        _id: 'closed-4',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536h-1.568zm-11.136 0c-.169-.113-.752-.849-.752-1.536 0-.849.696-1.536 1.536-1.536s1.536.687 1.536 1.536c0 .687-.583 1.423-.752 1.536H6.432zm12.8 7.68c-.8.8-2.4.8-3.2 0L12 12.8 8.96 15.84c-.8.8-2.4.8-3.2 0-.8-.8-.8-2.4 0-3.2L8.8 9.6c.8-.8 2.4-.8 3.2 0l3.04 3.04c.8.8.8 2.4 0 3.2z"/></svg>',
        title: 'Raycast Settings',
        url: 'https://raycast.com'
    },

    {
        _id: 'closed-5',
        favicon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM7 17l10-10M7 7h10v10"/></svg>',
        title: 'Linear Issues',
        url: 'https://linear.app'
    }
]


// FIXME about: support
// https://testpages.eviltester.com/styled/index.html#:~:text=Index,-About%20Related%20Sites
// http://localhost:5173
// {
//     _id: '11',
//     url: 'about://blank',
//     title: 'blank',
//     audioPlaying: false,
//     screenshot: null,
//     pinned: false,
// },
//      {
//     _id: '111',
//     url: 'http://code.xe',
//     title: 'Code',
//     audioPlaying: false,
//     // favicon: 'file://photon_logo.png',
//     screenshot: null,
//     pinned: false,
//     muted: false,
//     loading: false
// },
// {
//     _id: '4',
//     url: 'about:newtab',
//     title: 'New Tab',
//     audioPlaying: false,
//     // favicon: 'file://photon_logo.png',
//     screenshot: null,
//     pinned: false,
//     muted: false,
//     loading: false
// },
// {
//     _id: '5',
//     url: `isolated-app://kxhwjzichcfrfquwsmlthx2rhpjc75si7v22zajhnudxktjbvvtqaaac/public/test.html`,
//     title: 'Test',
//     audioPlaying: false,
//     // favicon: 'file://photon_logo.png',
//     screenshot: null,
//     pinned: false,
//     muted: false,
//     loading: false
// }
// {
//     _id: '5',
//     url: '/test-links.html',
//     title: 'Link Tracking Test',
//     audioPlaying: false,
//     // favicon: 'file://photon_logo.png',
//     screenshot: null,
//     pinned: false,
//     muted: false,
//     loading: false
// }

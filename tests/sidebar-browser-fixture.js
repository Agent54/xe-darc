import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { rollup } from 'rollup'
import { compile, compileModule } from 'svelte/compiler'
import puppeteer from 'puppeteer'

export const root = new URL('../', import.meta.url).pathname
const require = createRequire(import.meta.url)
const modules = {
    entry: `
        import { mount, flushSync } from 'svelte'
        import Sidebar from './app/components/TabSidebar.svelte'
        import TabHoverCard from './app/components/TabHoverCard.svelte'
        import LinkPreviewFavicon from './app/components/LinkPreviewFavicon.svelte'
        import { tabDrag, onDrop } from './app/lib/tab-drag.svelte.js'
        import data from 'fixture-data'
        window.data = data
        window.flushSync = flushSync
        window.tabDrag = tabDrag
        window.pinDrops = []
        onDrop(drop => window.pinDrops.push(drop))
        window.mountTopbarHovercard = () => {
            const target = document.createElement('div')
            target.id = 'topbar-hovercard-fixture'
            document.body.append(target)
            return mount(TabHoverCard, { target, props: { tab: data.docs.outside, showHistoryImmediately: true } })
        }
        window.mountMetadataHovercard = () => {
            const target = document.createElement('div')
            target.id = 'metadata-hovercard-fixture'
            target.style.cssText = 'position: fixed; z-index: 20000; top: 12px; left: 12px'
            document.body.append(target)
            mount(TabHoverCard, { target, props: { tab: data.docs['closed-two'], isClosedTab: true, showHistoryImmediately: true } })
        }
        window.mountLinkPreview = () => {
            const target = document.createElement('div')
            target.id = 'link-preview-fixture'
            document.body.append(target)
            mount(LinkPreviewFavicon, { target, props: {
                get url() { return data.linkPreviewUrl }
            } })
        }
        mount(Sidebar, { target: document.body, props: {
            get showUrl() { return !!data.ui.showUrl },
            get tabSidebarVisible() { return data.ui.sidebarVisible },
            get isDragEnabled() { return data.ui.dragEnabled },
            get customTabSidebarWidth() { return data.ui.sidebarWidth }
        } })
    `,
    'fixture-data': compileModule(`
        import { getSidebarItems, getTabGroup } from './app/lib/tab-groups.js'
        const tab = (id, favicon, extra = {}) => ({ id, title: id, url: 'https://example.com', type: 'tab', spaceId: 'space', created: Date.now() - 3600000, favicon: location.origin + favicon, ...extra })
        const data = $state({
            docs: {}, frames: {}, origins: {}, menuActions: [], linkPreviewUrl: '',
            ui: { sidebarVisible: true, dragEnabled: true, sidebarWidth: 263 },
            spaceMeta: {
                globalPins: [tab('pin-one', '/one.svg'), tab('pin-two', '/two.svg')],
                closedTabs: [tab('closed-one', '/one.svg'), tab('closed-missing', '/missing.svg'), tab('closed-two', '/two.svg', { closedAt: Date.now() - 120000, modified: Date.now() })],
                spaceOrder: ['space'], activeSpace: 'space', activeTabId: null
            },
            spaces: { space: { name: 'Space', pinnedTabs: [], activeTabsOrder: ['outside', 'group-two'], tabs: [
                tab('group-missing', '/group-missing.svg', { tabGroupId: 'group', tabGroupOrder: 0, order: 1 }),
                tab('group-two', '/two.svg', { tabGroupId: 'group', tabGroupOrder: 1, order: 2 }),
                tab('outside', '/one.svg', { order: 3 }),
                ...Array.from({ length: 6 }, (_, index) => tab('group-tail-' + index, '/one.svg', { tabGroupId: 'group', tabGroupOrder: index + 2, order: 1 }))
            ] } }
        })
        for (const tab of [...data.spaces.space.tabs, ...data.spaceMeta.globalPins, ...data.spaceMeta.closedTabs]) data.docs[tab.id] = tab
        data.getSidebarItems = spaceId => getSidebarItems(data.spaces[spaceId].tabs, [], data.docs)
        data.getTabGroup = (tabId, spaceId) => getTabGroup(data.spaces[spaceId].tabs, tabId)
        data.getGroupActiveTab = group => data.spaces.space.activeTabsOrder.map(id => group.tabs.find(tab => tab.id === id)).find(Boolean) || group.tabs[0]
        data.ungroupTabGroup = (tabId, spaceId) => data.menuActions.push({ action: 'ungroup', tabId, spaceId })
        data.closeTabGroup = (tabId, spaceId) => data.menuActions.push({ action: 'close', tabId, spaceId })
        data.updateTabOverrides = async (tabId, update) => Object.assign(data.docs[tabId], update)
        data.getSpacePins = spaceId => data.spaces[spaceId].pinnedTabs
        data.pinSidebarTab = options => data.menuActions.push({ action: 'sidebar-pin', ...options })
        data.toggleTabActivityMode = () => { data.ui.tabActivityMode = !data.ui.tabActivityMode }
        data.bumpTabActivity = tabId => {
            data.docs[tabId].lastActivityAt = Math.max(Date.now(), ...data.spaces.space.tabs.flatMap(tab => [tab.lastActivityAt ?? tab.order ?? 0, tab.tabGroupOrder ?? tab.order ?? 0])) + 1
        }
        let newTabCount = 0
        data.newTab = async spaceId => {
            const id = newTabCount++ ? 'new-normal-' + newTabCount : 'new-normal'
            const newTab = tab(id, '/one.svg', { spaceId })
            data.spaces[spaceId].tabs.unshift(newTab)
            data.docs[newTab.id] = newTab
            return newTab
        }
        data.activateSpace = spaceId => { data.spaceMeta.activeSpace = spaceId }
        data.addDivider = spaceId => data.menuActions.push({ action: 'add-divider', spaceId })
        data.activate = tabId => { data.spaceMeta.activeTabId = tabId }
        data.previous = () => {}
        data.isTabHibernated = () => false
        data.getTabLastActiveAt = id => data.docs[id]?.lastActiveAt || 0
        data.getAttachmentUrl = async src => src
        data.removeClosedTab = id => { data.spaceMeta.closedTabs = data.spaceMeta.closedTabs.filter(tab => tab.id !== id) }
        export default data
    `, { generate: 'client' }).js.code,
    empty: 'export default function () {}',
    'fixture-env': 'export const BROWSER = true, DEV = false, BUILD = false'
}

export async function withSidebarFixture(name, test) {
    const bundle = await rollup({
        input: 'entry',
        onwarn(warning) {
            if (warning.code !== 'CIRCULAR_DEPENDENCY') {
                throw new Error(warning.message)
            }
        },
        plugins: [{
            name: 'sidebar-fixture',
            resolveId(source, importer) {
                if (source in modules) {
                    return source
                }
                if (source === 'esm-env') {
                    return 'fixture-env'
                }
                if (source.endsWith('/data.svelte.js')) {
                    return 'fixture-data'
                }
                if (source === 'svelte') {
                    return require.resolve('svelte').replace('index-server.js', 'index-client.js')
                }
                if (source.startsWith('.')) {
                    return resolve(importer?.startsWith('/') ? dirname(importer) : root, source)
                }
                if (source === 'clsx') {
                    return createRequire(importer).resolve(source).replace(/\.js$/, '.mjs')
                }
                return createRequire(importer?.startsWith('/') ? importer : import.meta.url).resolve(source)
            },
            load(id) {
                if (id in modules) {
                    return modules[id]
                }
                const source = Deno.readTextFileSync(id)
                if (id.endsWith('.svelte')) {
                    return compile(source, { filename: id, generate: 'client', css: 'injected' }).js.code
                }
                if (id.endsWith('.svelte.js')) {
                    return compileModule(source, { filename: id, generate: 'client' }).js.code
                }
                return source
            }
        }]
    })
    const { output } = await bundle.generate({ format: 'es' })
    await bundle.close()
    const requests = []
    const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, request => {
        const path = new URL(request.url).pathname
        if (path === '/fixture.js') {
            return new Response(output[0].code, { headers: { 'content-type': 'text/javascript' } })
        }
        if (path.endsWith('.svg')) {
            requests.push(path)
            return new Response(path.includes('missing') ? '' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6"/></svg>', {
                status: path.includes('missing') ? 404 : 200,
                headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' }
            })
        }
        return new Response(`<!doctype html><style>${Deno.readTextFileSync(`${root}app/menus.css`)}</style><style>*, ::before, ::after { box-sizing: border-box; } :root { --tab-hover-background: #181818; --tab-hover-border: rgb(255 255 255 / 2.5%); --tab-group-tab-hover-background: #242424; } body { background: black; }</style><body><script type="module" src="/fixture.js"></script>`, { headers: { 'content-type': 'text/html' } })
    })

    let browser
    const profile = `${root}.cache/${name}-${crypto.randomUUID()}`
    const errors = []
    try {
        browser = await puppeteer.launch({ headless: true, userDataDir: profile })
        const page = await browser.newPage()
        page.setDefaultTimeout(5000)
        page.on('pageerror', error => {
            errors.push(error.message)
            console.error(error.message)
        })
        await page.goto(`http://127.0.0.1:${server.addr.port}`)
        await page.waitForFunction(() => document.querySelector('.closed-tab-item .fallback-favicon'))
        assert.deepEqual(errors, [])
        await test({ page, server, requests, errors })
        assert.deepEqual(errors, [])
    } finally {
        await browser?.close()
        await server.shutdown()
        await Deno.remove(profile, { recursive: true }).catch(() => {})
    }
}

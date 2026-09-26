<script>
    import { onMount } from 'svelte'
    import AddAppModal from './AddAppModal.svelte'
    import data from '../data.svelte.js'
    import { getComposeAppPorts, listComposeProjects } from '../lib/compose-api.js'

    let { onClose = () => {} } = $props()

    const collapsedSections = $state({ Examples: true })
    let showAddAppModal = $state(false)
    let composeApps = $state([])
    let composeLoading = $state(true)
    let composeError = $state('')
    let loadController = null

    let exampleApps = $state([
        { id: 'example-dashboard', name: 'Dashboard', iconUrl: '/embed-icons/observable.png', type: 'docker', partition: { name: 'Work', color: '#a3e635' } },
        { id: 'example-google-maps', name: 'Google Maps', iconUrl: '/embed-icons/google_maps.png', type: 'weblink', url: 'https://maps.google.com' },
        { id: 'example-google-weather', name: 'Google Weather', iconUrl: '/embed-icons/google_maps.png', type: 'weblink', url: 'https://www.google.com/search?q=weather', partition: { name: 'Personal', color: '#f472b6' } },
        { id: 'example-notes', name: 'Notes', iconUrl: null, type: null },
        { id: 'example-clock', name: 'Clock', iconUrl: null, type: null },
        { id: 'example-discord', name: 'Discord', iconUrl: '/embed-icons/scratch.png', type: 'pwa', url: 'https://discord.com/app' },
        { id: 'example-slack', name: 'Slack', iconUrl: '/embed-icons/codesandbox.png', type: 'pwa', url: 'https://app.slack.com', partition: { name: 'Work', color: '#a3e635' } },
        { id: 'example-blender', name: 'Blender', iconUrl: '/embed-icons/felt.png', type: 'static', partition: { name: 'Creative', color: '#fb7185' } }
    ])

    const rootApps = $derived(composeApps.filter(app => !app.section))
    const composeSections = $derived.by(() => {
        const sections = {}
        for (const app of composeApps) {
            if (!app.section) continue
            sections[app.section] ??= []
            sections[app.section].push(app)
        }
        return sections
    })

    onMount(() => {
        loadComposeApps()
        return () => loadController?.abort()
    })

    function sectionForConfigPath(configPath) {
        if (!configPath) return ''
        const normalized = configPath.replaceAll('\\', '/')
        const segments = normalized.split('/').filter(Boolean)
        const marker = segments.lastIndexOf('stacks')
        if (marker >= 0) return segments[marker + 1] && segments[marker + 1] !== segments.at(-1) ? segments[marker + 1] : ''
        if (!normalized.startsWith('/')) return segments.length > 1 ? segments[0] : ''
        return segments.length > 1 ? segments.at(-2) : ''
    }

    function value(object, ...keys) {
        for (const key of keys) {
            if (object?.[key] !== undefined && object[key] !== null) return object[key]
        }
        return undefined
    }

    function containerNumber(container) {
        const labels = value(container, 'Labels', 'labels') || {}
        const labelled = Number(labels['com.docker.compose.container-number'])
        if (Number.isInteger(labelled) && labelled > 0) return labelled
        const match = String(value(container, 'Name', 'name') || '').match(/[-_](\d+)$/)
        return Number(match?.[1]) || 1
    }

    function publishedPort(container, port) {
        const target = Number(value(port, 'target', 'TargetPort'))
        const protocol = String(value(port, 'protocol', 'Protocol') || 'tcp').toLowerCase()
        const publisher = (value(container, 'Publishers', 'publishers') || []).find(candidate =>
            Number(value(candidate, 'TargetPort', 'targetPort', 'target')) === target &&
            String(value(candidate, 'Protocol', 'protocol') || 'tcp').toLowerCase() === protocol
        )
        return Number(value(port, 'published', 'PublishedPort')) || Number(value(publisher, 'PublishedPort', 'publishedPort', 'published')) || 0
    }

    function servicePorts(service, containers) {
        const configured = Array.isArray(service?.ports) ? service.ports.filter(port =>
            String(value(port, 'protocol', 'Protocol') || 'tcp').toLowerCase() === 'tcp'
        ) : []
        if (configured.length) return configured

        const ports = new Map()
        for (const container of containers) {
            for (const publisher of value(container, 'Publishers', 'publishers') || []) {
                if (String(value(publisher, 'Protocol', 'protocol') || 'tcp').toLowerCase() !== 'tcp') continue
                const target = Number(value(publisher, 'TargetPort', 'targetPort', 'target'))
                const published = Number(value(publisher, 'PublishedPort', 'publishedPort', 'published'))
                if (target > 0) ports.set(`${target}:${published}`, { target, published, protocol: 'tcp' })
            }
        }
        return [...ports.values()]
    }

    function endpointsForService(project, serviceName, service, containers, httpsPort) {
        const serviceContainers = containers.filter(container => value(container, 'Service', 'service') === serviceName)
        const instances = serviceContainers.length ? serviceContainers : [{ Name: `${project}-${serviceName}-1` }]
        const ports = servicePorts(service, instances)
        const endpoints = []

        for (const container of instances) {
            const number = containerNumber(container)
            const containerName = value(container, 'Name', 'name') || `${project}-${serviceName}-${number}`
            const routeName = `${serviceName}_${project}${number > 1 ? `_${number}` : ''}`.toLowerCase()
            for (const port of ports) {
                const portName = String(value(port, 'name', 'Name') || '').trim()
                const published = publishedPort(container, port)
                if (!Number.isInteger(published) || published < 1 || published > 65535) continue
                const namedSelector = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(portName) ? portName.toLowerCase() : ''
                const uniqueName = namedSelector && ports.filter(candidate =>
                    String(value(candidate, 'name', 'Name') || '').trim().toLowerCase() === namedSelector
                ).length === 1
                const aliasSelector = uniqueName ? `n${namedSelector}` : `p${published}`
                const portLabel = portName || String(value(port, 'target', 'TargetPort') || published)
                endpoints.push({
                    id: `${containerName}:${portLabel}:${published}`,
                    label: `${containerName} · ${portLabel}`,
                    container: containerName,
                    port: portLabel,
                    url: `https://${routeName}--${aliasSelector}.app.localhost${httpsPort === 443 ? '' : `:${httpsPort}`}`
                })
            }
        }
        return endpoints.filter((endpoint, index) => endpoints.findIndex(candidate => candidate.url === endpoint.url) === index)
    }

    function appsForVariant(variant, httpsPort) {
        const services = variant.config?.services || {}
        return Object.entries(services).map(([serviceName, service]) => {
            const containers = variant.containers.filter(container => value(container, 'Service', 'service') === serviceName)
            return {
                id: `${variant.configFiles || variant.project}:${serviceName}`,
                name: serviceName,
                iconUrl: null,
                type: 'docker',
                section: sectionForConfigPath(variant.configPath),
                project: variant.project,
                status: containers[0] ? value(containers[0], 'State', 'state', 'Status', 'status') : variant.status,
                endpoints: endpointsForService(variant.project, serviceName, service, variant.containers, httpsPort)
            }
        })
    }

    async function loadComposeApps() {
        loadController?.abort()
        const controller = new AbortController()
        loadController = controller
        composeLoading = true
        composeError = ''
        try {
            const { https } = await getComposeAppPorts({ signal: controller.signal })
            const projects = await listComposeProjects({ signal: controller.signal })
            composeApps = projects.flatMap(project => appsForVariant(project, https)).sort((a, b) => a.name.localeCompare(b.name))
        } catch (error) {
            if (error?.name !== 'AbortError') composeError = error?.message || 'Compose apps could not be loaded'
        } finally {
            if (loadController === controller) {
                loadController = null
                composeLoading = false
            }
        }
    }

    async function openURL(event, url, title) {
        event?.preventDefault()
        event?.stopPropagation()
        if (!url) return
        await data.newTab(data.spaceMeta.activeSpace, { url, title, shouldFocus: true })
        onClose()
    }

    function openApp(event, app) {
        openURL(event, app.endpoints?.[0]?.url || app.url, app.name)
    }

    function handleOpenKey(event, app, url = app.endpoints?.[0]?.url || app.url) {
        if (event.key === 'Enter' || event.key === ' ') {
            openURL(event, url, app.name)
        }
    }

    function actionSettings(event, app) {
        event.stopPropagation()
        console.log('settings', app)
    }

    function actionLogs(event, app) {
        event.stopPropagation()
        console.log('logs', app)
    }

    function actionEdit(event, app) {
        event.stopPropagation()
        console.log('edit', app)
    }

    function handleActionKey(event, action, app) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            action(event, app)
        }
    }

    function typeLabel(type) {
        if (!type) return null
        if (type === 'docker') return 'Docker'
        if (type === 'pwa') return 'PWA'
        if (type === 'static') return 'Static'
        return 'Link'
    }

    function statusColor(status) {
        const state = String(status).toLowerCase()
        if (/\b(unhealthy|dead|failed|error)\b/.test(state)) {
            return '#f87171'
        }
        if (/\b(starting|restarting|paused|removing)\b/.test(state)) {
            return '#fbbf24'
        }
        if (/\b(running|up|healthy)\b/.test(state)) {
            return '#34d399'
        }
        return '#94a3b8'
    }

    function toggleSection(sectionName) {
        collapsedSections[sectionName] = !collapsedSections[sectionName]
    }

    function toggleSectionKey(event, sectionName) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggleSection(sectionName)
        }
    }

    function addApp({ type, app, checkout }) {
        if (type === 'repo' && checkout) {
            loadComposeApps()
            return
        }
        exampleApps.push({
            id: crypto.randomUUID(),
            name: app.name || app.url || 'App',
            iconUrl: app.iconUrl || null,
            type: 'weblink',
            url: app.url
        })
    }
</script>

{#snippet SectionHeader(name, count)}
    <button
        type="button"
        class="flex w-full items-center gap-2 mb-3 text-left cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        onmousedown={() => toggleSection(name)}
        onkeydown={(event) => toggleSectionKey(event, name)}
        aria-expanded={!collapsedSections[name]}
    >
        <h3 class="text-white/80 text-sm font-semibold tracking-wide">{name}</h3>
        <span class="text-white/40 text-xs">({count})</span>
        <svg class="w-4 h-4 text-white/60 transition-transform {collapsedSections[name] ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 16.5l-6-6h12l-6 6z"/>
        </svg>
        <span class="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></span>
    </button>
{/snippet}

{#snippet AppCard(app)}
    {@const defaultURL = app.endpoints?.[0]?.url || app.url}
    <article class="app-card relative w-52 min-h-44 rounded-xl border border-white/8 bg-black/20 hover:bg-white/8 hover:border-white/14 transition-colors px-3 pt-3 pb-2">
        {#if app.status}
            <button
                type="button"
                class="app-status absolute left-1.5 top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label={`Status for ${app.name}`}
                aria-describedby={`app-status-${encodeURIComponent(app.id)}`}
            >
                <span class="h-2 w-2 rounded-full ring-1 ring-black/30" style:background-color={statusColor(app.status)} aria-hidden="true"></span>
                <span
                    id={`app-status-${encodeURIComponent(app.id)}`}
                    role="tooltip"
                    class="app-status-tooltip pointer-events-none absolute left-0 top-full mt-1 w-max max-w-44 rounded-md border border-white/15 bg-black/95 px-2 py-1.5 text-left text-xs leading-4 text-white/90 shadow-lg"
                >{app.status}</span>
            </button>
        {/if}

        {#if app.endpoints?.length}
            <div class="app-card-hover-detail app-port-links absolute left-2 right-10 z-10 flex max-h-24 flex-col items-start gap-1 overflow-y-auto {app.status ? 'top-7' : 'top-2'}">
                {#each app.endpoints as endpoint}
                    <button
                        type="button"
                        class="max-w-full shrink-0 truncate rounded-md border border-emerald-300/20 bg-black/90 px-1.5 py-1 text-[9px] leading-none text-emerald-100/80 hover:border-emerald-300/45 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300/70 cursor-pointer"
                        title={`Open ${endpoint.container} on ${endpoint.port}`}
                        aria-label={`Open ${endpoint.container} on port ${endpoint.port}`}
                        onmousedown={(event) => openURL(event, endpoint.url, app.name)}
                        onkeydown={(event) => handleOpenKey(event, app, endpoint.url)}
                    >
                        {endpoint.label}
                    </button>
                {/each}
            </div>
        {/if}

        <button
            type="button"
            class="mx-auto flex w-full flex-col items-center justify-center gap-1 px-1 pb-7 pt-8 text-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:cursor-default"
            onmousedown={(event) => openApp(event, app)}
            onkeydown={(event) => handleOpenKey(event, app)}
            aria-label={defaultURL ? `Open ${app.name}` : `${app.name} has no published ports`}
            disabled={!defaultURL}
        >
            {#if app.iconUrl}
                <img src={app.iconUrl} alt="" class="w-16 h-16 rounded-lg object-cover" />
            {:else}
                <span class="w-16 h-16 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white/80 text-xl font-semibold">
                    {(app.name || '?').trim().charAt(0).toUpperCase()}
                </span>
            {/if}
            <span class="text-white/90 text-sm font-medium truncate w-full px-2" title={app.name}>{app.name}</span>
        </button>

        <div class="absolute bottom-2 left-2 right-2 flex items-center gap-1 overflow-hidden">
            {#if typeLabel(app.type)}
                <span class="px-1.5 py-1 rounded text-[10px] leading-none border border-white/20 bg-white/10 text-white/70 flex-shrink-0">{typeLabel(app.type)}</span>
            {/if}
            {#if app.project}
                <span class="app-card-hover-detail truncate px-1.5 py-1 rounded text-[10px] leading-none border border-white/15 bg-white/5 text-white/55" title={app.project}>{app.project}</span>
            {/if}
            {#if app.partition?.name}
                <span
                    class="shrink-0 rounded border bg-white/10 px-1.5 py-1 text-[10px] leading-none"
                    style:color={app.partition.color}
                    style:border-color={`${app.partition.color}66`}
                >{app.partition.name}</span>
            {/if}
        </div>

        <div class="app-card-actions absolute right-2 top-2 z-10 flex flex-col gap-1">
            <button
                type="button"
                title="Settings"
                aria-label={`Settings for ${app.name}`}
                class="rounded-md border border-white/20 bg-black/80 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 cursor-pointer"
                onmousedown={(event) => actionSettings(event, app)}
                onkeydown={(event) => handleActionKey(event, actionSettings, app)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true"><path d="M11.78 2.25c-.29 0-.57.02-.85.05a.75.75 0 0 0-.64.85l.13 1.03a8.97 8.97 0 0 0-1.84 1.06l-.9-.51a.75.75 0 0 0-1.02.27c-.26.45-.48.92-.66 1.41a.75.75 0 0 0 .36.92l.9.52c-.12.59-.18 1.2-.18 1.82 0 .62.06 1.23.18 1.82l-.9.52a.75.75 0 0 0-.36.92c.18.49.4.96.66 1.41.2.34.64.46 1.02.27l.9-.51c.57.42 1.2.77 1.84 1.06l-.13 1.03a.75.75 0 0 0 .64.85c.28.03.56.05.85.05.29 0 .57-.02.85-.05a.75.75 0 0 0 .64-.85l-.13-1.03c.64-.29 1.27-.64 1.84-1.06l.9.51a.75.75 0 0 0 1.02-.27c.26-.45.48-.92.66-1.41a.75.75 0 0 0-.36-.92l-.9-.52c.12-.59.18-1.2.18-1.82 0-.62-.06-1.23-.18-1.82l.9-.52a.75.75 0 0 0 .36-.92 8 8 0 0 0-.66-1.41.75.75 0 0 0-1.02-.27l-.9.51a8.97 8.97 0 0 0-1.84-1.06l.13-1.03a.75.75 0 0 0-.64-.85 9.7 9.7 0 0 0-1.7 0Zm.22 5.5a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5Z"/></svg>
            </button>
            <button
                type="button"
                title="Logs"
                aria-label={`Logs for ${app.name}`}
                class="rounded-md border border-white/20 bg-black/80 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 cursor-pointer"
                onmousedown={(event) => actionLogs(event, app)}
                onkeydown={(event) => handleActionKey(event, actionLogs, app)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true"><path fill-rule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd" /></svg>
            </button>
            <button
                type="button"
                title="Edit"
                aria-label={`Edit ${app.name}`}
                class="rounded-md border border-white/20 bg-black/80 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 cursor-pointer"
                onmousedown={(event) => actionEdit(event, app)}
                onkeydown={(event) => handleActionKey(event, actionEdit, app)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5" aria-hidden="true"><path d="M21.731 2.269a2.625 2.625 0 0 0-3.713 0l-1.157 1.157 3.713 3.713 1.157-1.157a2.625 2.625 0 0 0 0-3.713Z"/><path d="M3 21v-3.75a2.25 2.25 0 0 1 .659-1.591l9.75-9.75 3.713 3.713-9.75 9.75A2.25 2.25 0 0 1 6.75 21H3Z"/></svg>
            </button>
        </div>
    </article>
{/snippet}

<div class="absolute top-[-50px] left-1/2 transform -translate-x-1/2 flex items-center justify-between z-10" style="width: 100%;">
    <h2 class="text-white/90 text-2xl font-semibold ml-2 mt-[-10px]">
        Apps
        <button class="p-2 text-white/70 ml-4 relative t-[2px] hover:text-white/90 hover:bg-white/10 rounded-lg transition-colors z-20 cursor-pointer" onmousedown={() => showAddAppModal = true} aria-label="Add App" title="Add App">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M12 4.5a.75.75 0 0 1 .75.75v6h6a.75.75 0 0 1 0 1.5h-6v6a.75.75 0 0 1-1.5 0v-6h-6a.75.75 0 0 1 0-1.5h6v-6A.75.75 0 0 1 12 4.5Z"/></svg>
        </button>
    </h2>

    <button class="p-2 text-white/70 hover:text-white/90 mr-[-30px] mb-[-20px] opacity-50 hover:opacity-100 rounded-lg transition-colors cursor-pointer" onmousedown={onClose} aria-label="Close Apps" title="Close Apps">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M6.225 4.811a1 1 0 0 0-1.414 1.414L10.586 12 4.81 17.775a1 1 0 1 0 1.414 1.414L12 13.414l5.775 5.775a1 1 0 0 0 1.414-1.414L13.414 12l5.775-5.775a1 1 0 0 0-1.414-1.414L12 10.586 6.225 4.81Z"/></svg>
    </button>
</div>

<div class="w-full h-full px-6 pt-6 pb-4 select-none overflow-y-auto relative apps-content" style="transform: translateZ(0); will-change: scroll-position;">
    {#if composeLoading}
        <div class="mb-8 rounded-xl border border-white/8 bg-black/15 px-4 py-5 text-sm text-white/50" aria-live="polite">Reading Compose projects…</div>
    {:else if composeError}
        <div class="mb-8 flex items-center justify-between gap-4 rounded-xl border border-orange-300/15 bg-orange-300/5 px-4 py-3">
            <p class="text-sm text-orange-100/70">{composeError}</p>
            <button type="button" class="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 cursor-pointer" onmousedown={loadComposeApps}>Try again</button>
        </div>
    {:else if composeApps.length === 0}
        <div class="mb-8 rounded-xl border border-dashed border-white/12 bg-black/10 px-4 py-5">
            <p class="text-sm font-medium text-white/70">No Compose services found</p>
            <p class="mt-1 text-xs text-white/40">Add a repository with a Compose file to make its services appear here.</p>
        </div>
    {/if}

    {#if rootApps.length > 0}
        <section class="mb-7" aria-label="Root Compose services">
            <div class="flex flex-wrap gap-3">
                {#each rootApps as app (app.id)}
                    {@render AppCard(app)}
                {/each}
            </div>
        </section>
    {/if}

    {#each Object.keys(composeSections).sort() as section}
        <section class="mt-7 mb-6">
            {@render SectionHeader(section, composeSections[section].length)}
            {#if !collapsedSections[section]}
                <div class="flex flex-wrap gap-3">
                    {#each composeSections[section] as app (app.id)}
                        {@render AppCard(app)}
                    {/each}
                </div>
            {/if}
        </section>
    {/each}

    <section class="mt-7 mb-0">
        {@render SectionHeader('Examples', exampleApps.length)}
        {#if !collapsedSections.Examples}
            <div class="flex flex-wrap gap-3">
                {#each exampleApps as app (app.id)}
                    {@render AppCard(app)}
                {/each}
            </div>
        {/if}
    </section>
</div>

<AddAppModal
    show={showAddAppModal}
    installedApps={[...composeApps, ...exampleApps]}
    onAdd={addApp}
    onClose={() => showAddAppModal = false}
/>

<style>
    .app-card-actions,
    .app-card-hover-detail {
        opacity: 0;
        pointer-events: none;
        transition: opacity 200ms;
    }

    .app-card:hover .app-card-actions,
    .app-card:hover .app-card-hover-detail {
        opacity: 1;
        pointer-events: auto;
    }

    .app-card:hover .app-card-actions {
        transition-delay: 500ms;
    }

    .app-card:focus-within .app-card-actions,
    .app-card:focus-within .app-card-hover-detail {
        opacity: 1;
        pointer-events: auto;
        transition-delay: 0ms;
    }

    .app-status-tooltip {
        visibility: hidden;
        opacity: 0;
        transition: opacity 120ms;
    }

    .app-status:hover .app-status-tooltip,
    .app-status:focus-visible .app-status-tooltip {
        visibility: visible;
        opacity: 1;
    }

    .app-port-links {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    @media (hover: none) {
        .app-card-actions {
            opacity: 1;
            pointer-events: auto;
            transition: none;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .app-card-actions,
        .app-card-hover-detail,
        .app-status-tooltip {
            transition: none;
        }
    }

    .apps-content {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .apps-content::-webkit-scrollbar {
        width: 6px;
    }

    .apps-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .apps-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .apps-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
</style>

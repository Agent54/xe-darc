function normalizePath(path) {
    return String(path || '').replaceAll('\\', '/').replace(/\/+$/, '')
}

export function repositoryApps(app, localApps, repositoryPath) {
    if (app.appType !== 'repo') {
        return []
    }
    const repositoryName = app.githubUrl?.trim().replace(/\/+$/, '').split('/').at(-1)?.replace(/\.git$/, '')
    const root = normalizePath(repositoryPath || [app.checkoutPath?.trim(), repositoryName].filter(Boolean).join('/'))
    if (!root) {
        return []
    }
    const composePath = app.pathType === 'compose' ? app.path?.trim().replace(/^\.\//, '').replace(/^\/+/, '') : ''
    const target = composePath ? `${root}/${composePath}` : `${root}/`
    return localApps.filter(candidate => candidate.configFiles?.split(',').some(file => {
        const path = normalizePath(file.trim())
        return composePath ? path === target || path.endsWith(`/${target}`)
            : path.startsWith(target) || path.includes(`/${target}`)
    }))
}

export function appSections(docs, localApps, metadata = {}) {
    const matched = new Set()
    const saved = Object.values(docs).filter(doc => doc.type === 'app' && !doc._deleted && !doc.archive).map(doc => {
        const services = repositoryApps(doc, localApps, metadata[doc._id]?.repositoryPath)
        for (const service of services) {
            matched.add(service.id)
        }
        return {
            ...services[0],
            ...doc,
            id: doc._id,
            type: doc.appType === 'repo' ? doc.pathType === 'static' ? 'static' : 'docker' : 'weblink',
            hasComposeSetup: services.length > 0,
            composeApps: services,
            ...(services.length ? {
                endpoints: services.flatMap(service => service.endpoints || []),
                containers: services.flatMap(service => service.containers || []),
                containerStates: services.flatMap(service => service.containerStates || []),
                installedAt: services.reduce((earliest, service) => service.installedAt && (!earliest || service.installedAt < earliest) ? service.installedAt : earliest, 0)
            } : {})
        }
    })
    return { saved, computer: localApps.filter(app => !matched.has(app.id)) }
}

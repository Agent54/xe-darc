function parseWindowId(value) {
    return typeof value === 'string' ? value.trim() || null : null
}

export function getWindowSessionHints(url, windowName) {
    const location = new URL(url)
    const hintWindowId = parseWindowId(location.searchParams.get('darcWindowId')) || (
        typeof windowName === 'string' && windowName.startsWith('darc-window-')
            ? parseWindowId(windowName.slice('darc-window-'.length))
            : null
    )

    return { hintWindowId, newWindow: !hintWindowId && location.hash === '#new' }
}

export function getWindowBounds(window) {
    return {
        x: window.screenX ?? window.screenLeft ?? 0,
        y: window.screenY ?? window.screenTop ?? 0,
        width: window.outerWidth,
        height: window.outerHeight
    }
}

function validBounds(bounds) {
    return bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) && bounds.width > 0 && bounds.height > 0
}

export function rememberWindowBounds(windowId, bounds, storage) {
    if (!parseWindowId(windowId) || !validBounds(bounds)) {
        return
    }
    try {
        const key = `windowBounds:${windowId}`
        const serialized = JSON.stringify(bounds)
        if (storage.getItem(key) !== serialized) {
            storage.setItem(key, serialized)
        }
    } catch (error) {
        console.warn('Failed to save window bounds', error)
    }
}

export function getWindowSessionStartup(storage) {
    const savedWindowBounds = {}
    try {
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i)
            if (!key?.startsWith('windowBounds:')) {
                continue
            }
            try {
                const bounds = JSON.parse(storage.getItem(key))
                if (validBounds(bounds)) {
                    savedWindowBounds[key.slice('windowBounds:'.length)] = bounds
                }
            } catch {
                continue
            }
        }
    } catch (error) {
        console.warn('Failed to read saved window sessions', error)
    }
    return { savedWindowBounds }
}

export function fitWindowBounds(bounds, screens) {
    if (!validBounds(bounds)) {
        return null
    }
    const available = screens.filter(screen => Number.isFinite(screen.availLeft) && Number.isFinite(screen.availTop) && screen.availWidth > 0 && screen.availHeight > 0)
    if (!available.length) {
        return bounds
    }
    // Preserve legitimate windows spanning displays while keeping their title bar reachable.
    const reachable = available.some(screen => {
        const overlap = Math.min(bounds.x + bounds.width, screen.availLeft + screen.availWidth) - Math.max(bounds.x, screen.availLeft)
        return overlap >= Math.min(100, bounds.width) && bounds.y >= screen.availTop && bounds.y <= screen.availTop + screen.availHeight - Math.min(30, bounds.height)
    })
    if (reachable) {
        return bounds
    }
    const screen = available.find(screen => {
        return bounds.x < screen.availLeft + screen.availWidth && bounds.x + bounds.width > screen.availLeft &&
            bounds.y < screen.availTop + screen.availHeight && bounds.y + bounds.height > screen.availTop
    }) || available[0]
    const width = Math.min(bounds.width, screen.availWidth)
    const height = Math.min(bounds.height, screen.availHeight)
    return {
        x: Math.max(screen.availLeft, Math.min(bounds.x, screen.availLeft + screen.availWidth - width)),
        y: Math.max(screen.availTop, Math.min(bounds.y, screen.availTop + screen.availHeight - height)),
        width,
        height
    }
}

export function restoreWindowBounds(window, bounds, screens) {
    const fitted = fitWindowBounds(bounds, screens)
    if (fitted) {
        const current = getWindowBounds(window)
        if (current.width !== fitted.width || current.height !== fitted.height) {
            window.resizeTo(fitted.width, fitted.height)
        }
        if (current.x !== fitted.x || current.y !== fitted.y) {
            window.moveTo(fitted.x, fitted.y)
        }
    }
}

export function openWindowSession(window, session, screens) {
    const url = new URL(window.location.href)
    url.searchParams.set('darcWindowId', session.windowId)
    url.hash = ''
    const bounds = fitWindowBounds(session.bounds, screens)
    const features = bounds
        ? `popup,left=${bounds.x},top=${bounds.y},width=${bounds.width},height=${bounds.height}`
        : 'popup'
    return window.open(url.href, `darc-window-${session.windowId}`, features)
}

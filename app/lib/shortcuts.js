// App shortcuts work while typing too. Component keys (Enter, arrows, etc.) stay local.
// `mod` is Command on macOS and Control elsewhere; all modifiers match exactly.
export const shortcuts = [
    { id: 'new-tab', key: 't', mod: true, label: 'New tab in group', group: 'Tabs', holdId: 'new-tab-group', holdLabel: 'New tab group', holdMs: 650 },
    { id: 'close-tab', key: 'w', mod: true, label: 'Close tab or lightbox', group: 'Tabs' },
    { id: 'restore-tab', key: 't', mod: true, shift: true, label: 'Reopen closed tab', group: 'Tabs' },
    { id: 'reload-tab', key: 'r', mod: true, label: 'Reload page', group: 'Navigation' },
    { id: 'reload-tab', key: 'F5' },
    { id: 'open-location', key: 'l', mod: true, label: 'Edit current URL', group: 'Navigation' },
    { id: 'reset-zoom', key: '0', mod: true, label: 'Reset zoom to 100%', group: 'Navigation' },
    ...Array.from({ length: 9 }, (_, index) => ({
        id: `space-${index + 1}`, key: String(index + 1), mod: true,
        ...(index === 0 ? { label: 'Switch space', group: 'Spaces & view', displayKey: '1–9' } : {})
    })),
    { id: 'previous-active-tab', key: 'Tab', ctrl: true, repeat: true, label: 'Previous active tab', group: 'Tabs' },
    { id: 'previous-tab', key: 'ArrowLeft', mod: true, alt: true, repeat: true, label: 'Previous tab', group: 'Tabs' },
    { id: 'next-tab', key: 'ArrowRight', mod: true, alt: true, repeat: true, label: 'Next tab', group: 'Tabs' },
    { id: 'pin-left', key: 'ArrowLeft', mod: true, alt: true, shift: true, label: 'Pin to the left', group: 'Spaces & view' },
    { id: 'pin-right', key: 'ArrowRight', mod: true, alt: true, shift: true, label: 'Pin to the right', group: 'Spaces & view' },
    { id: 'escape', key: 'Escape', label: 'Dismiss overlay or lightbox', group: 'Spaces & view' },
    { id: 'overview', key: 'F18', label: 'Tab overview', group: 'Spaces & view' }
]

export const shortcutActionIds = new Set([
    ...shortcuts.flatMap(binding => [binding.id, binding.holdId].filter(Boolean)),
    'show-shortcuts', 'hide-shortcuts'
])

export function getShortcutHelp(isMac) {
    const groups = new Map()
    for (const binding of shortcuts) {
        if (!binding.label) continue
        const keys = [
            binding.ctrl ? '⌃' : null,
            binding.mod ? (isMac ? '⌘' : 'Ctrl') : null,
            binding.alt ? (isMac ? '⌥' : 'Alt') : null,
            binding.shift ? '⇧' : null,
            binding.displayKey || ({ ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Tab: 'Tab' }[binding.key] || binding.key.toUpperCase())
        ].filter(Boolean).map(key => key === '⌃' && !isMac ? 'Ctrl' : key === '⇧' && !isMac ? 'Shift' : key)
        if (!groups.has(binding.group)) groups.set(binding.group, [])
        groups.get(binding.group).push({ id: binding.id, label: binding.label, keys })
        if (binding.holdId) groups.get(binding.group).push({ id: binding.holdId, label: binding.holdLabel, keys, hold: true })
    }
    return Array.from(groups, ([title, items]) => ({ title, items }))
}

// Self-contained so the exact same matcher can run in isolated controlled frames.
export function createShortcutMatcher(bindings, isMac) {
    return function matchShortcut(event) {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.getModifierState?.('AltGraph')) return null
        return bindings.find(binding => {
            if (!!event.metaKey !== !!(binding.mod && isMac)) return false
            if (!!event.ctrlKey !== !!(binding.ctrl || (binding.mod && !isMac))) return false
            if (!!event.altKey !== !!binding.alt || !!event.shiftKey !== !!binding.shift) return false
            // Option can change event.key on macOS. Use physical letter/digit codes
            // as a fallback only for command combinations, never for plain typing.
            return event.key?.toLowerCase() === binding.key.toLowerCase() ||
                (binding.mod && /^[a-z0-9]$/i.test(binding.key) &&
                    event.code === (/^[0-9]$/.test(binding.key) ? `Digit${binding.key}` : `Key${binding.key.toUpperCase()}`))
        }) || null
    }
}

export function createShortcutHandler(matchShortcut, runShortcut, { schedule = setTimeout, cancel = clearTimeout } = {}) {
    let modifier = null
    let helpTimer = null
    let helpVisible = false
    let pendingTab = null
    let tabHeld = false

    function hideHelp(event) {
        cancel(helpTimer)
        helpTimer = null
        const wasVisible = helpVisible
        if (helpVisible) runShortcut('hide-shortcuts', event)
        helpVisible = false
        return wasVisible
    }

    function finishTab() {
        if (!pendingTab) return
        const { event, timer } = pendingTab
        cancel(timer)
        pendingTab = null
        runShortcut('new-tab', event)
    }

    function consume(event) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        return true
    }

    function handleShortcut(event) {
        if (event.key === 'Meta' || event.key === 'Control') {
            if (!event.repeat && !modifier && !event.altKey && !event.shiftKey && !(event.metaKey && event.ctrlKey)) {
                modifier = event.key
                helpTimer = schedule(() => {
                    helpTimer = null
                    helpVisible = runShortcut('show-shortcuts', event) !== false
                }, 2000)
            } else if (!event.repeat) hideHelp(event)
            return false
        }
        const wasShowingHelp = hideHelp(event)
        if (wasShowingHelp && event.key === 'Escape') return consume(event)
        const binding = matchShortcut(event)
        if (pendingTab && binding?.id !== 'new-tab') finishTab()
        if (!binding) return false
        if (binding.holdId) {
            if (!event.repeat && !tabHeld) {
                tabHeld = true
                const timer = schedule(() => {
                    pendingTab = null
                    runShortcut(binding.holdId, event)
                }, binding.holdMs)
                pendingTab = { timer, event }
            }
            return consume(event)
        }
        // Consume repeats of destructive actions without running them again.
        if ((!event.repeat || binding.repeat) && runShortcut(binding.id, event) === false) return false
        return consume(event)
    }

    handleShortcut.keyup = event => {
        if (event.key === modifier || (modifier === 'Meta' && !event.metaKey) || (modifier === 'Control' && !event.ctrlKey)) {
            hideHelp(event)
            modifier = null
        }
        // macOS can omit letter keyup while Command is down. Modifier release
        // must also finish a quick Cmd+T, without creating a second tab after a hold.
        if (event.key?.toLowerCase() === 't' || event.code === 'KeyT' || event.key === 'Meta' || event.key === 'Control') {
            finishTab()
            tabHeld = false
        }
    }

    handleShortcut.reset = () => {
        hideHelp()
        cancel(pendingTab?.timer)
        pendingTab = null
        tabHeld = false
        modifier = null
    }

    return handleShortcut
}

export function isMacPlatform() {
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

export function getFrameShortcutScript(tabId) {
    return `(() => {
        const match = (${createShortcutMatcher.toString()})(${JSON.stringify(shortcuts)}, ${isMacPlatform()});
        const handle = (${createShortcutHandler.toString()})(match, (id) => {
            console.log('iwa:shortcut:' + JSON.stringify({ id, tabId: ${JSON.stringify(tabId)} }));
            // The shell decides whether Escape has an app target. Ordinary pages
            // must still receive it, including previews later promoted to lightboxes.
            return id !== 'escape';
        });
        window.addEventListener('keydown', handle, { capture: true, passive: false });
        window.addEventListener('keyup', handle.keyup, true);
        window.addEventListener('blur', handle.reset);
    })();`
}

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
    'show-shortcuts', 'hide-shortcuts', 'finish-tab-switch'
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

function createShortcutHelpHandler(runShortcut, { schedule = setTimeout, cancel = clearTimeout } = {}) {
    let modifier = null
    let helpTimer = null
    let helpVisible = false
    let helpAborted = false
    const pressedKeys = new Map()

    function hideHelp(event) {
        cancel(helpTimer)
        helpTimer = null
        const wasVisible = helpVisible
        if (helpVisible) runShortcut('hide-shortcuts', event)
        helpVisible = false
        return wasVisible
    }

    function cancelHelp(event) {
        if (modifier || event?.metaKey || event?.ctrlKey) {
            helpAborted = true
        }
        return hideHelp(event)
    }

    function helpKeydown(event) {
        if (event.key === 'Meta' || event.key === 'Control') {
            if (!modifier) {
                modifier = event.key
                if (!helpAborted && !event.repeat && !pressedKeys.size && !(event.pressedKeyCount > 1) && !event.altKey && !event.shiftKey && !(event.metaKey && event.ctrlKey)) {
                    helpTimer = schedule(() => {
                        helpTimer = null
                        if (!helpAborted && modifier) {
                            helpVisible = runShortcut('show-shortcuts', event) !== false
                        }
                    }, 2000)
                } else {
                    cancelHelp(event)
                }
            } else if (!event.repeat) {
                cancelHelp(event)
            }
            return false
        }
        pressedKeys.set(event.code || event.key, !!(modifier || event.metaKey || event.ctrlKey))
        const wasVisible = hideHelp(event)
        if (modifier || event.metaKey || event.ctrlKey) {
            helpAborted = true
        }
        return wasVisible
    }

    function helpKeyup(event) {
        if (!(event.pressedKeyCount > Number(!!event.metaKey) + Number(!!event.ctrlKey))) {
            pressedKeys.delete(event.code || event.key)
        }
        if (!event.metaKey && !event.ctrlKey) {
            hideHelp(event)
            modifier = null
            helpAborted = false
            // macOS can omit letter keyup during Command combinations.
            for (const [key, duringHold] of pressedKeys) {
                if (duringHold) {
                    pressedKeys.delete(key)
                }
            }
        } else if (event.key === 'Meta' || event.key === 'Control') {
            cancelHelp(event)
        }
    }

    helpKeydown.keyup = helpKeyup
    helpKeydown.cancel = cancelHelp
    helpKeydown.reset = () => {
        hideHelp()
        modifier = null
        helpAborted = false
        pressedKeys.clear()
    }
    return helpKeydown
}

function createShortcutDispatcher(matchShortcut, runShortcut, { schedule = setTimeout, cancel = clearTimeout } = {}) {
    let pendingTab = null
    let tabHeld = false

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
            return false
        }
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
        // macOS can omit letter keyup while Command is down. Modifier release
        // must also finish a quick Cmd+T, without creating a second tab after a hold.
        if (event.key?.toLowerCase() === 't' || event.code === 'KeyT' || event.key === 'Meta' || event.key === 'Control') {
            finishTab()
            tabHeld = false
        }
    }

    handleShortcut.reset = () => {
        cancel(pendingTab?.timer)
        pendingTab = null
        tabHeld = false
    }

    return handleShortcut
}

export function createShortcutHandler(matchShortcut, runShortcut, options) {
    const dispatch = createShortcutDispatcher(matchShortcut, runShortcut, options)
    // One shell timer owns the hold across all guest documents and previews.
    const help = createShortcutHelpHandler(runShortcut, options)
    const handle = event => {
        const wasVisible = help(event)
        if (wasVisible && event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            return true
        }
        return dispatch(event)
    }
    handle.keyup = event => {
        help.keyup(event)
        dispatch.keyup(event)
    }
    handle.reset = () => {
        help.reset()
        dispatch.reset()
    }
    handle.cancelHelp = help.cancel
    handle.helpKeydown = help
    handle.helpKeyup = help.keyup
    return handle
}

export function listenForShortcutHelpCancellation(target, cancelHelp) {
    const events = ['pointerdown', 'mousedown', 'click', 'auxclick', 'contextmenu', 'wheel', 'scroll', 'touchstart', 'touchmove',
        'darc-controlled-frame-mousedown', 'darc-controlled-frame-click', 'darc-link-preview']
    for (const type of events) {
        target.addEventListener(type, cancelHelp, { capture: true, passive: true })
    }
    return () => {
        for (const type of events) {
            target.removeEventListener(type, cancelHelp, true)
        }
    }
}

export function isMacPlatform() {
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}

export function getFrameShortcutScript(tabId) {
    return `(() => {
        const match = (${createShortcutMatcher.toString()})(${JSON.stringify(shortcuts)}, ${isMacPlatform()});
        const handle = (${createShortcutDispatcher.toString()})(match, (id) => {
            console.log('iwa:shortcut:' + JSON.stringify({ id, tabId: ${JSON.stringify(tabId)} }));
            // The shell decides whether Escape has an app target. Ordinary pages
            // must still receive it, including previews later promoted to lightboxes.
            return id !== 'escape';
        });
        window.addEventListener('keydown', event => { if (event.isTrusted) handle(event); }, { capture: true, passive: false });
        window.addEventListener('keyup', event => { if (event.isTrusted) handle.keyup(event); }, true);
        // Release may arrive in a newly focused frame that did not receive Tab.
        window.addEventListener('keyup', event => {
            if (event.isTrusted && event.key === 'Control') console.log('iwa:shortcut:' + JSON.stringify({ id: 'finish-tab-switch', tabId: ${JSON.stringify(tabId)} }));
        }, true);
        window.addEventListener('blur', handle.reset);
    })();`
}

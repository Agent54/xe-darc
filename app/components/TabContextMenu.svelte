<script>
    import data from '../data.svelte.js'
    import { tick } from 'svelte'
    import EmojiPicker from './EmojiPicker.svelte'
    import TabActionButtons from './TabActionButtons.svelte'
    import { openTabDevTools } from '../lib/tab-devtools.js'
    import { snoozeTime } from '../lib/pending-tabs.js'
    
    let {
        menu = { visible: false, x: 0, y: 0, tab: null, index: null },
        onHide = () => {},
        onReload = null,
        onNavigateHistory = null,
        onSettings = null,
        showDevTools = false,
        defaultPinScope = 'group',
        partitions = ['persist:1', 'persist:2', 'persist:3', 'ephemeral:1', 'ephemeral:2', 'ephemeral:3'],
        contextMenuOpenTime = 0,
        onToggleCertificateMonitor = null
    } = $props()
    
    let menuElement = $state(null)
    let adjustedY = $state(0)
    let adjustedX = $state(0)
    let groupMenuView = $state('menu')
    let groupNameInput = $state(null)
    let moveSpaceOpen = $state(false)
    let moveSpaceTrigger = $state(null)
    let moveSpaceSubmenu = $state(null)
    let snoozeMode = $state('relative')
    let snoozeAmount = $state(1)
    let snoozeUnit = $state('hours')
    let snoozeDate = $state('')
    let snoozeError = $state('')
    const isGroup = $derived(menu.tab?.type === 'tabgroup')
    const sourceSpaceId = $derived(menu.tab?.spaceId || data.docs[menu.tab?.id]?.spaceId)
    const targetTabs = $derived((isGroup ? menu.tab.tabs : menu.tab ? [menu.tab] : []).map(tab => data.docs[tab.id] || tab))
    const allMuted = $derived(targetTabs.length > 0 && targetTabs.every(tab => tab.muted))
    const hasLoadedTabs = $derived(targetTabs.some(tab => data.frames[tab.id]?.frame))
    const hasSleepingTabs = $derived(targetTabs.some(tab => !data.frames[tab.id]?.frame))
    const container = $derived.by(() => {
        const partition = targetTabs[0]?.partition || 'default'
        return targetTabs.every(tab => (tab.partition || 'default') === partition) ? partition : 'Mixed'
    })
    const customName = $derived(isGroup ? menu.tab?.name : (data.docs[menu.tab?.id] || menu.tab)?.titleOverride)
    const customEmoji = $derived(isGroup ? menu.tab?.metadata?.emoji : (data.docs[menu.tab?.id] || menu.tab)?.emojiOverride)
    const customFavicon = $derived(isGroup ? menu.tab?.metadata?.favicon : (data.docs[menu.tab?.id] || menu.tab)?.faviconOverride)
    const editorTitle = $derived(groupMenuView.startsWith('snooze') ? (isGroup ? 'Snooze group' : 'Snooze tab') : groupMenuView === 'rename' ? (isGroup ? 'Rename group' : 'Rename tab') : (isGroup ? 'Group icon' : 'Tab icon'))

    $effect(() => {
        if (menu.visible && menu.tab) {
            groupMenuView = 'menu'
            moveSpaceOpen = false
            snoozeError = ''
        }
    })
    
    $effect(() => {
        if (menu.visible) {
            groupMenuView // Reposition when a group editor changes the menu size.
            adjustedY = menu.y
            adjustedX = menu.x
            if (menuElement) {
                requestAnimationFrame(() => {
                    if (!menuElement) return
                    const menuHeight = menuElement.offsetHeight
                    const viewportHeight = window.innerHeight
                    const margin = 8
                    adjustedX = Math.max(margin, Math.min(menu.x, window.innerWidth - menuElement.offsetWidth - margin))
                    if (menu.y + menuHeight + margin > viewportHeight) {
                        adjustedY = Math.max(margin, viewportHeight - menuHeight - margin)
                    }
                })
            }
        }
    })
    
    function reloadTab(tab) {
        const frame = data.frames[tab.id]?.frame
        if (!frame) {
            data.unhibernate(tab.id)
            onHide()
            return
        }
        if (onReload) {
            onReload(tab)
        } else {
            data.reloadTab(tab.id)
        }
        onHide()
    }

    function runTabAction(action) {
        const tab = menu.tab
        onHide()
        return action(tab)
    }

    async function snooze(wakeAt, reason = 'snooze') {
        snoozeError = ''
        try {
            await data.snoozeTab(targetTabs[0].id, wakeAt, { scope: isGroup ? 'group' : 'tab', reason })
            onHide()
        } catch (error) {
            snoozeError = error.message
        }
    }

    function saveCustomSnooze(event) {
        event.preventDefault()
        const units = { minutes: 60000, hours: 3600000, days: 86400000 }
        const wakeAt = snoozeMode === 'absolute' ? new Date(snoozeDate).getTime()
            : Number(snoozeAmount) > 0 ? Date.now() + Number(snoozeAmount) * units[snoozeUnit] : NaN
        if (!Number.isFinite(wakeAt) || wakeAt <= Date.now()) {
            snoozeError = 'Choose a future date or a positive duration.'
            return
        }
        snooze(wakeAt)
    }
    
    function toggleCertificateMonitor(tab) {
        if (onToggleCertificateMonitor) {
            onToggleCertificateMonitor(tab)
        }
        onHide()
    }
    
    function pinTabLeft(tab) {
        if (!data.spaceMeta.activeSpace || !tab) return
        data.pin({ tabId: tab.id, pinned: 'left', scope: defaultPinScope })
        onHide()
    }
    
    function pinTabRight(tab) {
        data.pin({ tabId: tab.id, pinned: 'right', scope: defaultPinScope })
        onHide()
    }
    
    function unpinTab(tab) {
        data.pin({ tabId: tab.id, pinned: null })
        onHide()
    }

    function toggleSidebarPin(tab) {
        const anchor = isGroup ? tab.tabs[0] : tab
        data.pinSidebarTab({ tabId: anchor.id, pinned: !anchor.sidebarPinned, ...(isGroup ? { scope: 'group' } : {}) })
        onHide()
    }

    function setSidebarPin(fixed) {
        const anchor = targetTabs[0]
        if (anchor) data.pinSidebarTab({ tabId: anchor.id, fixed, ...(isGroup ? { scope: 'group' } : {}) })
        onHide()
    }

    function setPin(scope, mode) {
        data.pin({ tabId: menu.tab.id, scope, pinned: mode })
        onHide()
    }

    function bumpToTop() {
        const tab = isGroup ? data.getGroupActiveTab(menu.tab, menu.tab.spaceId) : menu.tab
        if (tab) data.bumpTabActivity(tab.id)
        onHide()
    }

    function setPinScope(scope) {
        data.pin({ tabId: menu.tab.id, pinned: menu.tab.pinned, scope,
            ...(scope !== 'global' ? { targetSpaceId: data.spaceMeta.activeSpace } : {}),
            ...(scope === 'group' ? { groupTabId: data.getLastActiveNonPinnedTabId() } : {}) })
        onHide()
    }
    
    function toggleMuteTabs() {
        const muted = !allMuted
        for (const tab of targetTabs) {
            tab.muted = muted
            data.frames[tab.id]?.frame?.setAudioMuted?.(muted)
        }
        onHide()
    }
    
    function selectPartition(partition) {
        for (const tab of targetTabs) tab.partition = partition
        onHide()
    }

    function hibernateTabs() {
        for (const tab of targetTabs) {
            if (data.frames[tab.id]?.frame) data.hibernate(tab.id, data.spaceMeta.activeTabId === tab.id)
        }
        onHide()
    }

    function unhibernateTabs() {
        for (const tab of targetTabs) {
            if (!data.frames[tab.id]?.frame) data.unhibernate(tab.id)
        }
        onHide()
    }

    function hibernateOthers() {
        const keep = new Set(targetTabs.map(tab => tab.id))
        for (const [id, frame] of Object.entries(data.frames)) {
            if (frame?.frame && !keep.has(id) && !data.docs[id]?.pinned) {
                data.hibernate(id, data.spaceMeta.activeTabId === id)
            }
        }
        onHide()
    }
    
    async function copyTabUrl(tab) {
        try {
            await navigator.clipboard.writeText(tab.url)
            console.log('URL copied to clipboard:', tab.url)
        } catch (error) {
            console.error('Failed to copy URL:', error)
            const textArea = document.createElement('textarea')
            textArea.value = tab.url
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
        }
        onHide()
    }
    
    function closeTabFromMenu(tab) {
        if (tab) {
            data.closeTab(tab.spaceId, tab.id)
        }
        onHide()
    }

    function removeDividerFromMenu(divider) {
        data.removeDivider(divider.id)
        onHide()
    }
    
    async function takeScreenshot(tab) {
        if (tab) {
            await data.captureScreenshot(tab.id)
        }
        onHide()
    }

    async function saveGroupName(event) {
        event.preventDefault()
        const name = new FormData(event.currentTarget).get('groupName')
        if (isGroup) {
            await data.updateTabGroup(menu.tab.tabGroupId, { name }, menu.tab.spaceId)
        } else {
            await data.updateTabOverrides(menu.tab.id, { titleOverride: name })
        }
        onHide()
    }

    async function resetGroupName() {
        if (isGroup) {
            await data.updateTabGroup(menu.tab.tabGroupId, { name: null }, menu.tab.spaceId)
        } else {
            await data.updateTabOverrides(menu.tab.id, { titleOverride: null })
        }
        onHide()
    }

    async function showGroupView(view) {
        groupMenuView = view
        await tick()
        if (view === 'rename') {
            groupNameInput?.focus()
            groupNameInput?.select()
        } else if (view === 'menu') {
            menuElement?.querySelector('button')?.focus()
        }
    }

    async function saveGroupEmoji(emoji) {
        if (isGroup) {
            await data.updateTabGroup(menu.tab.tabGroupId, { emoji, favicon: null }, menu.tab.spaceId)
        } else {
            await data.updateTabOverrides(menu.tab.id, { emojiOverride: emoji, faviconOverride: null })
        }
        onHide()
    }

    async function saveFavicon(event) {
        event.preventDefault()
        const favicon = new FormData(event.currentTarget).get('favicon')
        if (isGroup) {
            await data.updateTabGroup(menu.tab.tabGroupId, { favicon, emoji: null }, menu.tab.spaceId)
        } else {
            await data.updateTabOverrides(menu.tab.id, { faviconOverride: favicon, emojiOverride: null })
        }
        onHide()
    }

    function ungroup() {
        const group = menu.tab
        onHide()
        return data.ungroupTabGroup(group.tabs[0].id, group.spaceId)
    }

    function closeGroup() {
        const group = menu.tab
        onHide()
        return data.closeTabGroup(group.tabs[0].id, group.spaceId)
    }

    function moveToSpace(targetSpaceId) {
        const tabId = isGroup ? menu.tab.tabs[0]?.id : menu.tab.id
        if (!tabId || targetSpaceId === sourceSpaceId) {
            return
        }
        const moving = data.moveTab(tabId, {
            targetSpaceId, scope: isGroup ? 'group' : 'tab', placement: 'start', preservePins: true
        })
        onHide()
        return moving
    }

    function positionMoveSubmenu(node) {
        const anchor = moveSpaceTrigger.getBoundingClientRect()
        const parent = node.parentElement.getBoundingClientRect()
        const rect = node.getBoundingClientRect()
        const left = anchor.right + rect.width + 8 > window.innerWidth ? anchor.left - rect.width : anchor.right
        node.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)) - parent.left}px`
        node.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - rect.height - 8)) - parent.top}px`
    }

    async function openMoveSubmenu(focus = false) {
        moveSpaceOpen = true
        if (focus) {
            await tick()
            moveSpaceSubmenu?.querySelector('button:not(:disabled)')?.focus()
        }
    }

    function handleMoveKey(event) {
        if (event.key === 'ArrowRight' && event.target === moveSpaceTrigger) {
            event.preventDefault()
            event.stopPropagation()
            openMoveSubmenu(true)
        } else if (moveSpaceOpen && (event.key === 'ArrowLeft' || event.key === 'Escape')) {
            event.preventDefault()
            event.stopPropagation()
            moveSpaceOpen = false
            moveSpaceTrigger?.focus()
        } else if (moveSpaceOpen && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            event.stopPropagation()
            const buttons = [...moveSpaceSubmenu.querySelectorAll('button:not(:disabled)')]
            const index = buttons.indexOf(document.activeElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
                (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
        }
    }
</script>

{#if menu.visible && menu.tab}
    <div class="context-menu-scrim" 
         role="button"
         tabindex="0"
         onmousedowncapture={onHide}
         onmouseup={() => {
             if (Date.now() - contextMenuOpenTime > 500) {
                 onHide()
             }
         }}
         oncontextmenu={(e) => { e.preventDefault(); onHide(); }}></div>
    
    <div class="context-menu menu-surface"
         bind:this={menuElement}
         role={groupMenuView !== 'menu' ? 'dialog' : 'menu'}
         aria-label={groupMenuView !== 'menu' ? editorTitle : undefined}
         tabindex="-1"
         style="left: {adjustedX}px; top: {adjustedY}px;"
         onclick={(e) => e.stopPropagation()}
         onkeydown={(e) => {
             if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
             if (e.key === 'Escape' && groupMenuView !== 'menu') {
                 e.preventDefault()
                 e.stopPropagation()
                 showGroupView('menu')
             }
         }}
         oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation() }}>
        {#if groupMenuView !== 'menu'}
            <button class="group-editor-back" type="button"
                    onmouseup={() => showGroupView('menu')}
                    onclick={(e) => { if (e.detail === 0) showGroupView('menu') }}>← {editorTitle}</button>
            {#if groupMenuView === 'snooze'}
                {#each [['1h', '1 hour'], ['4h', '4 hours'], ['tomorrow', 'Tomorrow morning · 9:00'], ['week', 'Next week · 9:00']] as [option, label]}
                    <button class="context-menu-item menu-action" type="button" onclick={() => snooze(snoozeTime(option))}>{label}</button>
                {/each}
                <button class="context-menu-item menu-action" type="button" onclick={() => showGroupView('snooze-custom')}>Custom…</button>
                <div class="context-menu-separator menu-divider"></div>
                <button class="context-menu-item menu-action" type="button" onclick={() => snooze(null, 'external')}>Wait for external action</button>
                {#if snoozeError}<p class="snooze-error" role="alert">{snoozeError}</p>{/if}
            {:else if groupMenuView === 'snooze-custom'}
                <form class="group-name-form snooze-form" onsubmit={saveCustomSnooze}>
                    <label for="snooze-mode">Wake up</label>
                    <select id="snooze-mode" bind:value={snoozeMode}>
                        <option value="relative">After a duration</option>
                        <option value="absolute">At a date and time</option>
                    </select>
                    {#if snoozeMode === 'absolute'}
                        <label for="snooze-date">Local date and time</label>
                        <input id="snooze-date" type="datetime-local" bind:value={snoozeDate} required />
                    {:else}
                        <label for="snooze-amount">Duration</label>
                        <div class="group-name-fields">
                            <input id="snooze-amount" type="number" min="0.01" step="any" bind:value={snoozeAmount} required />
                            <select aria-label="Duration unit" bind:value={snoozeUnit}>
                                <option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option>
                            </select>
                        </div>
                    {/if}
                    {#if snoozeError}<p class="snooze-error" role="alert">{snoozeError}</p>{/if}
                    <button class="context-menu-item menu-action" type="submit">Snooze {isGroup ? 'group' : 'tab'}</button>
                </form>
            {:else if groupMenuView === 'rename'}
                <form class="group-name-form" onsubmit={saveGroupName}>
                    <label for="tab-group-name">{isGroup ? 'Group name' : 'Tab title'}</label>
                    <div class="group-name-fields">
                        <input bind:this={groupNameInput} id="tab-group-name" name="groupName" value={customName || (isGroup ? '' : (data.docs[menu.tab?.id]?.title || menu.tab?.title || ''))} placeholder={isGroup ? 'Use tab titles' : 'Use page title'} autocomplete="off" />
                        <button type="submit">Save</button>
                    </div>
                </form>
                {#if customName}
                    <button class="context-menu-item menu-action" type="button"
                            onmouseup={resetGroupName}
                            onclick={(e) => { if (e.detail === 0) resetGroupName() }}>{isGroup ? 'Use tab titles' : 'Use page title'}</button>
                {/if}
            {:else}
                <EmojiPicker value={customEmoji} label={isGroup ? 'Group emoji' : 'Tab emoji'} resetLabel={isGroup ? 'Use tab favicons' : 'Use page favicon'} onSelect={saveGroupEmoji} />
                <form class="group-name-form" onsubmit={saveFavicon}>
                    <label for="tab-icon-url">Icon URL</label>
                    <div class="group-name-fields">
                        <input id="tab-icon-url" name="favicon" type="url" value={customFavicon || ''} placeholder="https://…" required />
                        <button type="submit">Use</button>
                    </div>
                </form>
            {/if}
        {:else if menu.tab.type !== 'divider'}
            {#if !isGroup}
                <TabActionButtons variant="menu" {showDevTools} showSettingsButton={!!onSettings}
                    loading={data.frames[menu.tab.id]?.loading ?? false}
                    onStop={() => runTabAction(tab => data.stopTab(tab.id))}
                    onGoBack={() => runTabAction(tab => onNavigateHistory?.(tab.id, 'back'))}
                    onGoForward={() => runTabAction(tab => onNavigateHistory?.(tab.id, 'forward'))}
                    onReload={() => reloadTab(menu.tab)}
                    onDevTools={() => runTabAction(tab => openTabDevTools(data, tab.id))}
                    onSettings={() => runTabAction(() => onSettings?.())}
                    onCopyUrl={() => copyTabUrl(menu.tab)}
                    onCloseTab={() => closeTabFromMenu(menu.tab)} />
                <div class="context-menu-separator menu-divider"></div>
            {/if}
            {#if data.ui.tabActivityMode}
                <button class="context-menu-item menu-action" role="menuitem" type="button"
                        onmouseup={bumpToTop}
                        onclick={(e) => { if (e.detail === 0) bumpToTop() }}>Bump to top</button>
            {/if}
            <button class="context-menu-item menu-action" role="menuitem" type="button"
                    onmouseup={() => showGroupView('snooze')}
                    onclick={(e) => { if (e.detail === 0) showGroupView('snooze') }}>Snooze…</button>
            <button class="context-menu-item menu-action" role="menuitem" type="button"
                        onmouseup={() => showGroupView('rename')}
                        onclick={(e) => { if (e.detail === 0) showGroupView('rename') }}>
                <span class="context-menu-icon" aria-hidden="true">
                    <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 0 1 2.652 2.652L9.582 17.07a4.5 4.5 0 0 1-1.897 1.13L4.5 19.125l.925-3.185a4.5 4.5 0 0 1 1.13-1.897L16.862 4.487Zm0 0 2.651 2.651M4.5 21h15" /></svg>
                </span>
                <span>Rename…</span>
            </button>
            <button class="context-menu-item menu-action" role="menuitem" type="button"
                        onmouseup={() => showGroupView('emoji')}
                        onclick={(e) => { if (e.detail === 0) showGroupView('emoji') }}>
                <span class="context-menu-icon" aria-hidden="true">
                    <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m3 16.5 5.25-5.25a1.5 1.5 0 0 1 2.12 0L15 15.879m-1.5-1.5 1.63-1.63a1.5 1.5 0 0 1 2.12 0L21 16.5M5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V5.25A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25v13.5A2.25 2.25 0 0 0 5.25 21ZM15 8.25h.008v.008H15V8.25Z" /></svg>
                </span>
                <span>Change icon…</span>
            </button>
            <div class="context-menu-item has-submenu move-space-menu" role="presentation"
                 onmouseenter={() => openMoveSubmenu()}
                 onmouseleave={(event) => { if (!event.currentTarget.contains(document.activeElement)) { moveSpaceOpen = false } }}
                 onfocusout={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { moveSpaceOpen = false } }}
                 onkeydown={handleMoveKey}>
                <button class="context-menu-item menu-action" role="menuitem" type="button"
                        bind:this={moveSpaceTrigger}
                        aria-haspopup="menu" aria-expanded={moveSpaceOpen}
                        onmouseup={() => openMoveSubmenu()}
                        onclick={(event) => { if (event.detail === 0) { openMoveSubmenu(true) } }}>
                    <span class="context-menu-icon" aria-hidden="true">
                        <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3H5.25A2.25 2.25 0 0 0 3 5.25v13.5A2.25 2.25 0 0 0 5.25 21H9m6-16.5L22.5 12 15 19.5M22.5 12H9" /></svg>
                    </span>
                    <span>Move to Space</span>
                    <span class="submenu-arrow" aria-hidden="true">›</span>
                </button>
                {#if moveSpaceOpen}
                    <div class="context-submenu move-space-submenu menu-surface" role="menu" aria-label="Move to Space"
                         bind:this={moveSpaceSubmenu} use:positionMoveSubmenu>
                        {#each data.spaceMeta.spaceOrder as spaceId (spaceId)}
                            {#if data.spaces[spaceId]}
                                <button class="context-submenu-item menu-action" type="button" role="menuitem"
                                        disabled={spaceId === sourceSpaceId}
                                        onmouseup={() => { if (spaceId !== sourceSpaceId) moveToSpace(spaceId) }}
                                        onclick={(event) => { if (event.detail === 0) { moveToSpace(spaceId) } }}>
                                    <span class="space-color" style:background-color={data.spaces[spaceId].color || '#888'} aria-hidden="true"></span>
                                    <span class="space-name">{data.spaces[spaceId].name || 'Untitled Space'}</span>
                                    {#if spaceId === sourceSpaceId}<span class="current-space" aria-label="Current space">✓</span>{/if}
                                </button>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>
            {#if menu.tab.type === 'tabgroup'}
                <button class="context-menu-item menu-action" role="menuitem" type="button"
                        onmouseup={ungroup}
                        onclick={(e) => { if (e.detail === 0) ungroup() }}>Ungroup</button>
                <button class="context-menu-item menu-action" role="menuitem" type="button"
                        onmouseup={closeGroup}
                        onclick={(e) => { if (e.detail === 0) closeGroup() }}>Close all</button>
            {/if}
        {/if}
        {#if groupMenuView === 'menu' && menu.tab.type === 'divider'}
            <div class="context-menu-item menu-action" role="menuitem" tabindex="0"
                    onmouseup={() => removeDividerFromMenu(menu.tab)}
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); removeDividerFromMenu(menu.tab) } }}>
                <span class="context-menu-icon">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14H6L5 6m5 4v7m4-7v7" />
                    </svg>
                </span>
                <span>Remove spacer</span>
            </div>
        {:else if groupMenuView === 'menu'}
        {#each [[false, 'Pin in scrolling sidebar'], [true, 'Pin above New Tab']] as [fixed, label]}
            <button class="context-menu-item menu-action" type="button" role="menuitem"
                    onmouseup={() => setSidebarPin(fixed)}
                    onclick={(e) => { if (e.detail === 0) setSidebarPin(fixed) }}>{label}</button>
        {/each}
        {#if targetTabs.some(tab => tab.sidebarPinned)}
            <button class="context-menu-item menu-action" type="button" role="menuitem"
                    onmouseup={() => toggleSidebarPin(menu.tab)}
                    onclick={(e) => { if (e.detail === 0) toggleSidebarPin(menu.tab) }}>Unpin from Sidebar</button>
        {/if}
        {#if !isGroup}
        <div class="context-menu-item menu-action"
             role="menuitem"
             tabindex="0"
             onmouseup={() => toggleCertificateMonitor(menu.tab)}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCertificateMonitor(menu.tab) } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.623 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
            </span>
            <span>Certificate Info</span>
        </div>
        
        {#if !menu.tab.pinned}
            {#each [['space', 'Pin to Space'], ['global', 'Pin Globally']] as [scope, label]}
                <button class="context-menu-item menu-action" type="button" role="menuitem"
                        onmouseup={() => setPin(scope, 'normal')}
                        onclick={(e) => { if (e.detail === 0) setPin(scope, 'normal') }}>{label}</button>
            {/each}
        {:else}
            <div class="pin-scope-label">Pin display</div>
            {#each (data.getPinScope(menu.tab) === 'group' ? [['left', 'Left sidepin'], ['right', 'Right sidepin']] : [['normal', 'Normal'], ['menu', 'Menu'], ['left', 'Left sidepin'], ['right', 'Right sidepin']]) as [mode, label]}
                <button class="context-menu-item menu-action" type="button" role="menuitemradio" aria-checked={menu.tab.pinned === mode || (mode === 'left' && menu.tab.pinned === true)}
                        onmouseup={() => setPin(data.getPinScope(menu.tab), mode)}
                        onclick={(e) => { if (e.detail === 0) setPin(data.getPinScope(menu.tab), mode) }}>{label}</button>
            {/each}
        {/if}
        {#if menu.tab.pinned}
            <div class="context-menu-item menu-action"
                 role="menuitem"
                 tabindex="0"
                 onmouseup={() => unpinTab(menu.tab)}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unpinTab(menu.tab) } }}>
                <span class="context-menu-icon">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                    </svg>
                </span>
                <span>Unpin Tab</span>
            </div>
            <div class="pin-scope-label">Pin scope</div>
            {#each [['group', 'Tab group'], ['space', 'Space'], ['global', 'Global']] as [scope, label]}
                <button class="context-menu-item menu-action" type="button" role="menuitemradio" aria-checked={data.getPinScope(menu.tab) === scope}
                        onmouseup={() => setPinScope(scope)}
                        onclick={(e) => { if (e.detail === 0) setPinScope(scope) }}>
                    <span class="context-menu-icon" aria-hidden="true">{data.getPinScope(menu.tab) === scope ? '✓' : ''}</span>
                    <span>{label}</span>
                </button>
            {/each}
        {:else}
            <div class="context-menu-item-row menu-action-row">
                <div class="context-menu-item context-menu-item-left menu-action"
                     role="menuitem"
                     tabindex="0"
                     onmouseup={() => pinTabLeft(menu.tab)}
                     onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinTabLeft(menu.tab) } }}>
                    <span class="context-menu-icon">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                        </svg>
                    </span>
                    <span>Left sidepin in {defaultPinScope === 'group' ? 'Tab Group' : 'Space'}</span>
                </div>
                <div class="context-menu-item context-menu-item-right menu-action"
                     role="menuitem"
                     tabindex="0"
                     onmouseup={() => pinTabRight(menu.tab)}
                     onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pinTabRight(menu.tab) } }}>
                    <span class="context-menu-icon">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                        </svg>
                    </span>
                    <span>Right sidepin in {defaultPinScope === 'group' ? 'Tab Group' : 'Space'}</span>
                </div>
            </div>
        {/if}
        
        {/if}

        <div class="context-menu-item menu-action"
             role="menuitem"
             tabindex="0"
             onmouseup={toggleMuteTabs}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMuteTabs() } }}>
            <span class="context-menu-icon">
                {#if allMuted}
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.79-1.59-1.76V9.51c0-.97.71-1.76 1.59-1.76h2.24Z" />
                    </svg>
                {:else}
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.59-.79-1.59-1.76V9.51c0-.97.71-1.76 1.59-1.76h2.24Z" />
                    </svg>
                {/if}
            </span>
            <span>{allMuted ? 'Unmute' : 'Mute'} {isGroup ? 'Group' : 'Tab'}</span>
        </div>

        {#if !isGroup}
        <div class="context-menu-item menu-action"
             role="menuitem"
             tabindex="0"
             onmouseup={toggleMuteTabs}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMuteTabs() } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
            </span>
            <span>Load at startup</span>
        </div>
        {/if}

        {#if hasLoadedTabs}
            <div class="context-menu-item menu-action"
                 role="menuitem"
                 tabindex="0"
                 onmouseup={hibernateTabs}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hibernateTabs() } }}>
                <span class="context-menu-icon">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                    </svg>
                </span>
                <span>Hibernate</span>
            </div>
        {/if}
        {#if hasSleepingTabs}
            <div class="context-menu-item menu-action"
                 role="menuitem"
                 tabindex="0"
                 onmouseup={unhibernateTabs}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unhibernateTabs() } }}>
                <span class="context-menu-icon">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                    </svg>
                </span>
                <span>{isGroup ? 'Unhibernate' : 'Wake Up Tab'}</span>
            </div>
        {/if}

        <div class="context-menu-item menu-action"
             role="menuitem"
             tabindex="0"
             onmouseup={hibernateOthers}
             onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hibernateOthers() } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
                </svg>
            </span>
            <span>Hibernate others</span>
        </div>

        <div class="context-menu-item has-submenu menu-action"
             role="menuitem"
             tabindex="0">
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                </svg>
            </span>
            <span>Container: {container}</span>
            <span class="submenu-arrow">
                <svg class="w-2 h-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8.25 4.5l7.5 7.5-7.5 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                </svg>
            </span>
            <div class="context-submenu menu-surface">
                {#each partitions as partition}
                    <div class="context-submenu-item menu-action"
                         class:active={container === partition}
                         role="menuitem"
                         tabindex="0"
                         onmouseup={() => selectPartition(partition)}
                         onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPartition(partition) } }}>
                        <span class="partition-icon">
                            {#if partition.startsWith('persist')}
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                                </svg>
                            {:else}
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5 10 3.75 16.25 13.5h-12.5Z" />
                                </svg>
                            {/if}
                        </span>
                        <span>{partition}</span>
                        {#if container === partition}
                            <span class="checkmark">•</span>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>

        {#if !isGroup}
        <!-- TODO: use fullscreen capture via CDP -->
        <div class="context-menu-item menu-action"
             class:disabled={!data.frames[menu.tab.id]?.frame}
             role="menuitem"
             tabindex={!data.frames[menu.tab.id]?.frame ? -1 : 0}
             title={!data.frames[menu.tab.id]?.frame ? 'Tab hibernated' : null}
             onmouseup={() => data.frames[menu.tab.id]?.frame && takeScreenshot(menu.tab)}
             onkeydown={(e) => { if (data.frames[menu.tab.id]?.frame && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); takeScreenshot(menu.tab) } }}>
            <span class="context-menu-icon">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
            </span>
            <span>Take Screenshot</span>
        </div>
        {/if}
        {/if}
    </div>
{/if}

<style>
    .snooze-form { width: min(310px, calc(100vw - 20px)); box-sizing: border-box; white-space: normal; }
    .snooze-form select, .snooze-form input { min-width: 0; max-width: 100%; padding: 8px; border: 1px solid #ffffff1f; border-radius: 6px; background: #151515; color: #e5e5e5; font: inherit; color-scheme: dark; }
    .snooze-form .group-name-fields input { flex: 1; width: 80px; }
    .snooze-form :is(input, select):focus-visible { outline: 1px solid #a3a3a3; outline-offset: 1px; }
    .snooze-error { margin: 8px 12px; color: #f0a7a7; font-size: 12px; white-space: normal; }
    .context-menu-item.move-space-menu {
        padding: 0;
    }

    .context-submenu.move-space-submenu {
        min-width: min(200px, calc(100vw - 16px));
        max-width: min(300px, calc(100vw - 16px));
        max-height: calc(100vh - 16px);
        overflow-y: auto;
        opacity: 1;
        visibility: visible;
        transform: none;
    }

    .space-color {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .space-name {
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .current-space {
        margin-left: auto;
    }

    .pin-scope-label {
        padding: 10px 14px 6px;
        border-top: 1px solid #ffffff14;
        color: #888;
        font-size: 11px;
    }

    .group-editor-back {
        display: block;
        width: 100%;
        padding: 11px 12px;
        border: 0;
        border-bottom: 1px solid #ffffff14;
        border-radius: 8px 8px 0 0;
        background: transparent;
        color: #b8b8b8;
        font: inherit;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
    }

    .group-editor-back:hover { background: #ffffff0f; }
    .group-editor-back:focus-visible { outline: 1px solid #a3a3a3; outline-offset: -2px; }

    .group-name-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        color: #b8b8b8;
        font-size: 12px;
    }

    .group-name-fields {
        display: flex;
        gap: 6px;
    }

    .group-name-fields input {
        appearance: none;
        outline: none;
        box-shadow: none;
        min-width: 0;
        width: 170px;
        padding: 7px 8px;
        border: 1px solid rgb(255 255 255 / 2%);
        border-radius: 6px;
        background: #151515;
        color: #e5e5e5;
        font: inherit;
    }

    .group-name-fields input:focus {
        background: var(--tab-active-background, #212121);
    }

    .group-name-fields button {
        padding: 7px 9px;
        border: 1px solid #ffffff1f;
        border-radius: 6px;
        background: #252525;
        color: #e5e5e5;
        font: inherit;
        cursor: pointer;
    }

    .group-name-fields button:focus-visible {
        outline: 1px solid #a3a3a3;
        outline-offset: 2px;
    }

    .context-menu-scrim {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        z-index: 10001;
    }

    .context-menu {
        position: fixed;
        z-index: 10002;
        min-width: 200px;
        overflow: visible;
        animation: context-menu-appear 0.1s ease-out;
        white-space: nowrap;
    }

    @keyframes context-menu-appear {
        from {
            opacity: 0;
            transform: scale(0.9) translateY(-8px);
        }
        to {
            opacity: 1;
            transform: scale(1) translateY(0);
        }
    }

    .context-menu-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 12px;
        transform: translateZ(0);
        color: rgba(255, 255, 255, 0.85);
    }

    .context-menu-icon :global(svg) {
        width: 16px;
        height: 16px;
    }

    .context-menu-item-row {
        display: flex;
        width: 100%;
    }

    .context-menu-item-left,
    .context-menu-item-right {
        flex: 1;
    }

    .context-menu-item-left {
        border-right: 1px solid transparent;
    }

    .context-menu-item.has-submenu {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .submenu-arrow {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        margin-left: auto;
    }

    .context-menu-item.has-submenu:hover .submenu-arrow {
        color: rgba(255, 255, 255, 0.8);
    }

    .context-submenu {
        position: absolute;
        left: calc(100% + 4px);
        top: -1px;
        min-width: 180px;
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transition: opacity 70ms ease-out;
        z-index: 10003;
        pointer-events: auto;
        white-space: nowrap;
    }

    .context-menu-item.has-submenu:hover .context-submenu,
    .context-menu-item.has-submenu:focus-within .context-submenu,
    .context-submenu:hover {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
    }

    /* Extend hover area to prevent submenu from disappearing */
    .context-menu-item.has-submenu::after {
        content: '';
        position: absolute;
        top: 0;
        right: -4px;
        width: 8px;
        height: 100%;
        background: transparent;
        z-index: 10002;
    }

    .context-submenu-item {
        position: relative;
    }

    .partition-icon {
        font-size: 12px;
        flex-shrink: 0;
        opacity: 0.8;
    }

    .context-submenu-item .checkmark {
        margin-left: auto;
        color: var(--menu-active-color);
        font-weight: bold;
        font-size: 14px;
    }
</style>

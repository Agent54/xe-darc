<script>
    import { tick } from 'svelte'
    import { configValues, demoModels, getModelConfig, harnessIcon, providerGlyph } from '../lib/agent-models.js'

    let { agentStatus, chat, selectedModel, disabled, onModel, onConnection, onConfig, onLoad } = $props()
    let trigger
    let panel = $state(null)
    let searchInput = $state(null)
    let opened = $state(false)
    let search = $state('')
    let starred = $state(false)
    let favorites = $state(JSON.parse(localStorage.getItem('agentStarredModels') || '[]'))
    let openingPress = null
    const menuId = $props.id()
    const modelConfig = $derived(getModelConfig(chat?.configOptions))
    const isDemo = $derived(!agentStatus.connections?.length)
    const effort = $derived(chat?.configOptions?.find(option => option.type === 'select' && option.category === 'thought_level'))
    const mode = $derived(chat?.configOptions?.find(option => option.type === 'select' && (option.category === 'mode' || option.id === 'mode')))
    const connection = $derived(agentStatus.connections?.find(item => item.id === agentStatus.connectionId))
    const harnessName = $derived(agentStatus.agentName || connection?.title || 'Demo')
    const modelName = $derived(!modelConfig && !isDemo ? 'Choose model' : (modelConfig ? configValues(modelConfig) : demoModels).find(model => model.value === selectedModel)?.name || selectedModel)
    const currentGlyph = $derived(providerGlyph(modelConfig || isDemo ? selectedModel : '', modelName))
    const rows = $derived.by(() => {
        const models = (agentStatus.connections || []).flatMap(harness => {
            const config = harness.id === agentStatus.connectionId ? modelConfig : getModelConfig(harness.configOptions)
            return config ? configValues(config).map(model => ({ ...model, harness, demo: false })) : []
        })
        if (isDemo) {
            models.push(...demoModels.map(model => ({ ...model, harness: { id: agentStatus.connectionId || '', title: 'Demo', agentName: 'Demo' }, demo: true })))
        }
        return models.map(model => ({ ...model, key: JSON.stringify([model.harness.id, model.demo, model.value]) }))
            .filter(model => (starred ? favorites.includes(model.key) : model.harness.id === (agentStatus.connectionId || ''))
                && `${model.name} ${model.harness.title} ${model.harness.agentName || ''}`.toLowerCase().includes(search.toLowerCase().trim()))
    })

    function close(restore = true) {
        opened = false
        openingPress = null
        if (restore) { trigger?.focus() }
    }

    async function open(event) {
        if (opened) { close(); return }
        if (event?.button !== undefined && event.button !== 0) { return }
        event?.preventDefault()
        opened = true
        search = ''
        openingPress = event?.type === 'mousedown' ? { time: Date.now(), x: event.clientX, y: event.clientY } : null
        await tick()
        if (!opened || !panel) { return }
        panel.showPopover()
        position()
        searchInput.focus()
    }

    function position() {
        if (!panel || !trigger) { return }
        const anchor = trigger.getBoundingClientRect()
        const rect = panel.getBoundingClientRect()
        panel.style.left = `${Math.max(8, Math.min(anchor.right - rect.width, innerWidth - rect.width - 8))}px`
        panel.style.top = `${Math.max(8, Math.min(anchor.top - rect.height - 6, innerHeight - rect.height - 8))}px`
    }

    function outside(event) {
        if (opened && !panel?.contains(event.target) && !trigger?.contains(event.target)) { close(false) }
    }

    function release(event) {
        if (!openingPress) { return }
        const press = openingPress
        openingPress = null
        const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('button[data-menu-action]:not(:disabled)')
        if (moved && panel?.contains(target)) { target.click() }
        else if (Date.now() - press.time > 500) { close() }
    }

    function activate(event, action) {
        if (event.type === 'mousedown') {
            if (event.button !== 0 || openingPress) { return }
            event.preventDefault()
        } else if (event.detail !== 0) { return }
        action()
    }

    function toggleStar(model) {
        favorites = favorites.includes(model.key) ? favorites.filter(key => key !== model.key) : [...favorites, model.key]
        localStorage.setItem('agentStarredModels', JSON.stringify(favorites))
    }

    function choose(model) {
        onModel(model.value, model.harness.id)
        close()
    }

    function keydown(event) {
        if (!opened) { return }
        event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); close(); return }
        if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) {
            const model = rows[Number(event.key) - 1]
            if (model && !disabled && !model.harness.processing) { event.preventDefault(); choose(model) }
            return
        }
        if (event.key === 'Enter' && event.target === searchInput) {
            if (rows[0] && !disabled && !rows[0].harness.processing) { event.preventDefault(); choose(rows[0]) }
            return
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            if (event.target === searchInput && ['Home', 'End'].includes(event.key)) { return }
            event.preventDefault()
            const section = event.target.closest('[data-menu-section]') || panel.querySelector('.model-list')
            const buttons = [...section.querySelectorAll('button[data-menu-action]:not(:disabled)')]
            const index = buttons.indexOf(document.activeElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
                (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
        }
    }
</script>

{#snippet icon(name, glyph)}
    <span class="harness-icon" aria-hidden="true">
        {@html harnessIcon(name)}
        {#if glyph}<span class="provider-glyph" title={glyph.name}>{@html glyph.icon}</span>{/if}
    </span>
{/snippet}

{#snippet star(filled)}
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path stroke-linejoin="round" d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2L3 9.6l6.2-.9Z"/></svg>
{/snippet}

<svelte:window onmousedown={outside} onmouseup={release} onresize={() => { if (opened) { position() } }} onblur={() => { if (opened) { close(false) } }} />

<button bind:this={trigger} class="agent-model-trigger" type="button" aria-label="Harness, model and thinking effort"
    aria-haspopup="dialog" aria-expanded={opened} aria-controls={opened ? menuId : undefined} data-model={selectedModel}
    onmousedown={open} onclick={event => { if (event.detail === 0) { open(event) } }}>
    {@render icon(`${harnessName} ${connection?.title || ''}`, currentGlyph)}
    <span class="trigger-name">{modelName}</span>
    {#if effort}<span class="trigger-effort">{configValues(effort).find(item => item.value === effort.currentValue)?.name}</span>{/if}
    <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg>
</button>

{#if opened}
    <div bind:this={panel} id={menuId} class="agent-model-menu" popover="manual" role="dialog" aria-label="Harness, model and thinking effort" tabindex="-1" onkeydown={keydown}
        onfocusout={event => { if (event.relatedTarget && !panel.contains(event.relatedTarget) && event.relatedTarget !== trigger) { close(false) } }}>
        <nav class="harness-rail" aria-label="Harnesses" data-menu-section>
            <button type="button" class="starred-filter" class:active={starred} aria-label="Starred models" aria-pressed={starred} title="Starred models" data-menu-action
                onmousedown={event => activate(event, () => { starred = !starred })} onclick={event => activate(event, () => { starred = !starred })}>{@render star(true)}</button>
            {#each agentStatus.connections || [] as harness (harness.id)}
                {@const config = getModelConfig(harness.configOptions)}
                {@const currentModel = config && configValues(config).find(model => model.value === config.currentValue)}
                <button type="button" class:active={!starred && harness.id === agentStatus.connectionId} aria-label={harness.title} aria-pressed={!starred && harness.id === agentStatus.connectionId}
                    title={`${harness.title}${harness.agentName ? ` · ${harness.agentName}` : ''}${harness.approvals ? ' · Permission requested' : ''}`} data-menu-action
                    onmousedown={event => activate(event, () => { starred = false; onConnection(harness.id) })}
                    onclick={event => activate(event, () => { starred = false; onConnection(harness.id) })}>
                    {@render icon(`${harness.agentName || ''} ${harness.title}`, providerGlyph(currentModel?.value, currentModel?.name))}
                    {#if harness.approvals}<span class="approval-dot"></span>{/if}
                </button>
            {/each}
        </nav>
        <div class="model-column">
            <label class="model-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>
                <input bind:this={searchInput} bind:value={search} placeholder="Search models…" aria-label="Search models" />
            </label>
            <div class="model-list" data-menu-section>
                {#each rows as model, index (model.key)}
                    {@const selected = model.harness.id === (agentStatus.connectionId || '') && model.value === selectedModel}
                    <div class="model-row" class:selected>
                        <button type="button" class="model-choice" data-model-value={model.value} data-harness-id={model.harness.id} data-menu-action aria-pressed={selected}
                            disabled={disabled || model.harness.processing} title={model.description || model.name}
                            onmousedown={event => activate(event, () => choose(model))} onclick={event => activate(event, () => choose(model))}>
                            {@render icon(`${model.harness.agentName || ''} ${model.harness.title}`, providerGlyph(model.value, model.name))}
                            <span class="model-name">{model.name}</span><span class="harness-name">{model.harness.title}</span>
                            {#if selected}<span class="model-check" aria-hidden="true">✓</span>
                            {:else if index < 9}<kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl '}{index + 1}</kbd>{/if}
                        </button>
                        <button type="button" class="model-star" class:saved={favorites.includes(model.key)} aria-label={`${favorites.includes(model.key) ? 'Unstar' : 'Star'} ${model.name}`} aria-pressed={favorites.includes(model.key)} data-menu-action
                            onmousedown={event => activate(event, () => toggleStar(model))} onclick={event => activate(event, () => toggleStar(model))}>{@render star(favorites.includes(model.key))}</button>
                    </div>
                {:else}
                    {#if !starred && !search && !modelConfig && !isDemo}
                        <button type="button" class="load-models" data-menu-action disabled={disabled || agentStatus.status === 'connecting'}
                            onmousedown={event => activate(event, () => { onLoad(); close() })} onclick={event => activate(event, () => { onLoad(); close() })}>Connect to load models</button>
                    {:else}<p class="empty-models">{starred ? 'No starred models' : 'No matching models'}</p>{/if}
                {/each}
            </div>
        </div>
        <div class="reasoning-column" data-menu-section>
            <div class="reasoning-heading"><span>Reasoning</span><span title={modelName}>{modelName}</span></div>
            {#if effort}
                {#each configValues(effort) as choice (choice.value)}
                    <button type="button" class="effort-choice" data-effort-value={choice.value} data-menu-action aria-pressed={effort.currentValue === choice.value} disabled={disabled}
                        onmousedown={event => activate(event, () => { onConfig(effort.id, choice.value); close() })}
                        onclick={event => activate(event, () => { onConfig(effort.id, choice.value); close() })}>
                        <span>{choice.name}</span><span aria-hidden="true">{effort.currentValue === choice.value ? '✓' : ''}</span>
                    </button>
                {/each}
            {:else}<p class="empty-models">No reasoning options</p>{/if}
        </div>
        <div class="model-footer">
            <span>{starred ? 'Starred models' : isDemo ? 'Demo models' : harnessName}</span>
            {#if mode}
                <label title={mode.description || mode.name}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                    <select aria-label={mode.name} value={mode.currentValue} disabled={disabled} onchange={event => onConfig(mode.id, event.currentTarget.value)}>
                        {#each configValues(mode) as choice (choice.value)}<option value={choice.value}>{choice.name}</option>{/each}
                    </select>
                </label>
            {/if}
        </div>
    </div>
{/if}

<style>
    .agent-model-trigger { display: flex; align-items: center; gap: 9px; max-width: 100%; padding: 7px 9px; border: 1px solid #ffffff12; border-radius: 7px; background: #ffffff08; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
    .trigger-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .trigger-effort { color: #999; font-size: 11px; }
    .chevron { width: 12px; height: 12px; flex: none; }
    .harness-icon { position: relative; display: inline-flex; width: 22px; height: 22px; flex: none; }
    .harness-icon :global(svg) { width: 100%; height: 100%; }
    .provider-glyph { position: absolute; right: -5px; top: -5px; width: 12px; height: 12px; padding: 1px; border-radius: 3px; background: #171717; box-shadow: 0 0 0 1px #171717; }
    .agent-model-menu { position: fixed; inset: auto; margin: 0; padding: 0; width: min(700px, calc(100vw - 16px)); height: min(420px, calc(100dvh - 24px)); display: grid; grid-template-columns: 48px minmax(0, 1fr) 190px; grid-template-rows: minmax(0, 1fr) 42px; overflow: hidden; background: #141414; color: #eee; border: 1px solid #ffffff20; border-radius: 12px; box-shadow: 0 12px 40px #0006; font-size: 13px; }
    button, input, select { font: inherit; color: inherit; }
    button { cursor: pointer; }
    button:disabled { opacity: .4; cursor: default; }
    button:focus-visible, select:focus-visible { outline: 2px solid #6687ff; outline-offset: -2px; }
    .harness-rail { border-right: 1px solid #ffffff10; padding: 8px 5px; display: flex; flex-direction: column; gap: 5px; overflow-y: auto; }
    .harness-rail button { position: relative; display: flex; align-items: center; justify-content: center; min-height: 38px; flex-shrink: 0; width: 100%; border: 0; border-radius: 5px; background: transparent; color: #999; }
    .harness-rail button.active { color: #eee; background: #ffffff12; }
    .harness-rail .starred-filter { margin-bottom: 8px; }
    .starred-filter > svg { width: 23px; height: 23px; }
    .approval-dot { position: absolute; right: 3px; top: 3px; width: 5px; height: 5px; border-radius: 50%; background: #b3c1ff; }
    .model-column { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 0 10px; }
    .model-search { height: 52px; display: flex; align-items: center; gap: 7px; border-bottom: 1px solid #ffffff10; flex: none; }
    .model-search:focus-within { border-color: #6687ff; }
    .model-search svg { width: 19px; height: 19px; flex: none; color: #777; }
    .model-search input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; padding: 8px 0; }
    .model-list { overflow-y: auto; padding: 9px 0; }
    .model-row { display: flex; border-radius: 5px; min-width: 0; }
    .model-row:hover, .model-row:focus-within, .harness-rail button:hover, .effort-choice:hover, .agent-model-trigger:hover { background: #ffffff0c; }
    .model-choice { border: 0; background: transparent; display: flex; align-items: center; gap: 10px; text-align: left; padding: 10px 5px; min-width: 0; flex: 1; }
    .model-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .harness-name { font-size: 12px; color: #777; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: auto; }
    kbd { background: #ffffff08; border-radius: 4px; padding: 2px 4px; color: #888; font: inherit; font-size: 11px; flex: none; }
    .model-check { margin-left: auto; color: #bbb; }
    .model-star { border: 0; background: transparent; padding: 5px; width: 25px; flex: none; color: #888; opacity: 0; }
    .model-star svg { width: 15px; height: 15px; }
    .model-star.saved, .model-row:hover .model-star, .model-row:focus-within .model-star { opacity: 1; }
    .reasoning-column { border-left: 1px solid #ffffff10; padding: 0 12px; overflow-y: auto; }
    .reasoning-heading { height: 52px; display: flex; align-items: center; gap: 10px; justify-content: space-between; color: #999; border-bottom: 1px solid #ffffff10; margin-bottom: 9px; }
    .reasoning-heading span:last-child { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .effort-choice { display: flex; justify-content: space-between; width: 100%; padding: 11px 5px; background: transparent; border: 0; border-radius: 5px; }
    .empty-models { color: #777; padding: 8px 4px; font-size: 12px; }
    .load-models { border: 0; border-radius: 5px; background: #ffffff0c; padding: 9px; margin: 8px 0; }
    .model-footer { grid-column: 1 / -1; border-top: 1px solid #ffffff10; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 14px; color: #999; font-size: 12px; }
    .model-footer label { display: flex; align-items: center; gap: 5px; }
    .model-footer svg { width: 16px; height: 16px; }
    .model-footer select { background: #141414; border: 0; max-width: 190px; padding: 5px; }
    @media (max-width: 560px) {
        .agent-model-menu { grid-template-columns: 42px minmax(0, 1fr) 125px; }
        .harness-name, kbd, .reasoning-heading span:last-child { display: none; }
        .reasoning-column { padding: 0 8px; }
        .model-choice { gap: 8px; }
    }
    @media (max-width: 380px) {
        .agent-model-menu { grid-template-columns: 42px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto 42px; }
        .harness-rail { grid-row: 1 / 3; }
        .reasoning-column { grid-column: 2; display: flex; flex-wrap: wrap; border-left: 0; border-top: 1px solid #ffffff10; padding: 6px; }
        .reasoning-heading { height: auto; width: 100%; border: 0; margin: 0 0 4px; font-size: 11px; }
        .effort-choice { width: auto; gap: 8px; padding: 7px; }
    }
</style>

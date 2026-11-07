<script>
    import { resolveNewTabInput } from '../lib/new-tab-input.js'

    let { active = false, openVersion = 0, partitions = [], onCreate, onPartition } = $props()
    let clipboardInput = $state(null)
    let clipboardStatus = $state('Reading clipboard…')
    const preview = $derived(clipboardInput?.text.replace(/\s+/g, ' '))

    $effect(() => {
        if (!active) return
        openVersion
        let cancelled = false
        clipboardInput = null
        clipboardStatus = 'Reading clipboard…'
        async function readClipboard() {
            try {
                const text = await navigator.clipboard.readText()
                if (cancelled) return
                clipboardInput = resolveNewTabInput(text)
                clipboardStatus = 'Clipboard is empty'
            } catch {
                if (!cancelled) clipboardStatus = 'Clipboard unavailable'
            }
        }
        readClipboard()
        return () => { cancelled = true }
    })
</script>

<button class="new-tab-menu-item menu-action" role="menuitem"
        disabled={!clipboardInput} title={clipboardInput?.text || clipboardStatus}
        onclick={(event) => { event.stopPropagation(); if (clipboardInput) onCreate(clipboardInput.url) }}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="item-icon"><path d="M15.75 3a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-7.5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h7.5Zm0 1.5h-7.5A1.5 1.5 0 0 0 6.75 6v9A1.5 1.5 0 0 0 8.25 16.5h7.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5Z"/><path d="M8.25 6A2.25 2.25 0 0 1 10.5 3.75h3a.75.75 0 0 1 0 1.5h-3A.75.75 0 0 0 9.75 6v.75H8.25V6Z"/></svg>
    <span class="clipboard-label">
        {#if clipboardInput}
            {clipboardInput.isSearch ? 'Search for' : 'New tab from'} "{preview}"
        {:else}
            {clipboardStatus}
        {/if}
    </span>
</button>
<div class="new-tab-menu-item has-submenu menu-action" role="menuitem" aria-haspopup="true" tabindex="0">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="item-icon"><path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></svg>
    <span>New tab in container…</span>
    <svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1-.02-1.06L10.94 10 7.19 6.29a.75.75 0 1 1 1.06-1.06l4.5 4.25a.75.75 0 0 1 0 1.06l-4.5 4.25a.75.75 0 0 1-1.06 0Z" clip-rule="evenodd"/></svg>
    <div class="new-tab-menu-submenu menu-surface" role="menu">
        {#each partitions as partition}
            <button class="menu-action" role="menuitem" onclick={(event) => { event.stopPropagation(); onPartition(partition) }}>
                <span class="partition-dot" data-variant={partition.startsWith('persist') ? 'persist' : 'ephemeral'}></span>
                <span>{partition}</span>
            </button>
        {/each}
    </div>
</div>

<style>
    .new-tab-menu-item { position: relative; min-width: 0; }
    button { width: 100%; text-align: left; }
    button:disabled { opacity: 0.5; cursor: default; }
    .clipboard-label { flex: 1; min-width: 0; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .has-submenu { padding-right: 26px; }
    .item-icon, .chevron { width: 14px; height: 14px; flex-shrink: 0; }
    .chevron { position: absolute; right: 8px; color: rgba(255, 255, 255, 0.5); }
    .new-tab-menu-submenu {
        position: absolute; top: 95%; right: 5px; min-width: 170px; z-index: 1;
        opacity: 0; visibility: hidden; pointer-events: none;
        transition: opacity 120ms ease, visibility 120ms ease;
    }
    .has-submenu:hover .new-tab-menu-submenu,
    .has-submenu:focus-within .new-tab-menu-submenu { opacity: 1; visibility: visible; pointer-events: auto; }
    .partition-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .partition-dot[data-variant="persist"] { background: #4ade80; }
    .partition-dot[data-variant="ephemeral"] { background: #f59e0b; }
</style>

<script>
    import { untrack } from 'svelte'
    import data from '../data.svelte.js'
    import { getPendingPermissionRequests, groupPermissionCards } from '../lib/permissions.js'
    import PermissionToast from './PermissionToast.svelte'

    let { visible = true, headerPartOfMain = false, sidebarWidth = 0, onOpenResources, pendingCards } = $props()
    let hiddenRequests = $state(new Set())
    const pending = $derived(pendingCards ?? groupPermissionCards(getPendingPermissionRequests(data.permissions, window.darcWindowId)))
    const shown = $derived(pending.filter(resource => !hiddenRequests.has(resource.ruleId || resource.requestId)))

    // Hiding a toast leaves its request pending in Resources.
    $effect(() => {
        const pendingIds = new Set(pending.map(resource => resource.ruleId || resource.requestId))
        untrack(() => {
            if ([...hiddenRequests].some(id => !pendingIds.has(id))) {
                hiddenRequests = new Set([...hiddenRequests].filter(id => pendingIds.has(id)))
            }
        })
    })
</script>

{#if visible && shown.length}
    <section class="permission-toasts" class:window-controls-overlay={headerPartOfMain} style:--sidebar-width={`${sidebarWidth}px`} aria-label="Permission requests" aria-live="polite" aria-relevant="additions">
        {#each shown as resource (resource.ruleId || resource.requestId)}
            <PermissionToast {resource} onOpen={onOpenResources}
                onHide={() => { hiddenRequests = new Set([...hiddenRequests, resource.ruleId || resource.requestId]) }} />
        {/each}
    </section>
{/if}

<style>
    .permission-toasts {
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        right: calc(var(--sidebar-width) + 16px + env(safe-area-inset-right, 0px));
        z-index: 10002;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 350px;
        max-width: calc(100vw - var(--sidebar-width) - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
        max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px));
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        filter: drop-shadow(0 8px 18px rgb(0 0 0 / 55%));
        padding: 0 0 8px;
        -webkit-app-region: no-drag;
    }
    .permission-toasts.window-controls-overlay {
        top: calc(env(titlebar-area-height, 35px) + 16px);
        max-height: calc(100dvh - env(titlebar-area-height, 35px) - 32px);
    }
</style>

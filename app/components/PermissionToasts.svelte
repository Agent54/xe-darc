<script>
    import { untrack } from 'svelte'
    import data from '../data.svelte.js'
    import { getPendingPermissionRequests } from '../lib/permissions.js'
    import PermissionToast from './PermissionToast.svelte'

    let { visible = true, headerPartOfMain = false, onOpenResources } = $props()
    let hiddenRequests = $state(new Set())
    const pending = $derived(getPendingPermissionRequests(data.permissions, window.darcWindowId))
    const shown = $derived(pending.filter(resource => !hiddenRequests.has(resource.requestId)))

    // Hiding a toast leaves its request pending in Resources.
    $effect(() => {
        const pendingIds = new Set(pending.map(resource => resource.requestId))
        untrack(() => {
            if ([...hiddenRequests].some(id => !pendingIds.has(id))) {
                hiddenRequests = new Set([...hiddenRequests].filter(id => pendingIds.has(id)))
            }
        })
    })
</script>

{#if visible && shown.length}
    <section class="permission-toasts" class:window-controls-overlay={headerPartOfMain} aria-label="Permission requests" aria-live="polite" aria-relevant="additions">
        {#each shown as resource (resource.requestId)}
            <PermissionToast {resource} onOpen={onOpenResources}
                onHide={() => { hiddenRequests = new Set([...hiddenRequests, resource.requestId]) }} />
        {/each}
    </section>
{/if}

<style>
    .permission-toasts {
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        right: calc(16px + env(safe-area-inset-right, 0px));
        z-index: 10002;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 350px;
        max-width: calc(100vw - 32px - env(safe-area-inset-right, 0px));
        max-height: calc(100dvh - 32px - env(safe-area-inset-top, 0px));
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        padding: 0 0 8px;
        -webkit-app-region: no-drag;
    }
    .permission-toasts.window-controls-overlay {
        top: calc(env(titlebar-area-height, 35px) + 16px);
        max-height: calc(100dvh - env(titlebar-area-height, 35px) - 32px);
    }
</style>

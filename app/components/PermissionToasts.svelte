<script>
    import data from '../data.svelte.js'
    import { getPendingPermissionRequests } from '../lib/permissions.js'
    import PermissionCard from './PermissionCard.svelte'

    let { visible = true, headerPartOfMain = false, onOpenResources } = $props()
    const pending = $derived(getPendingPermissionRequests(data.permissions, window.darcWindowId))
</script>

{#if visible && pending.length}
    <section class="permission-toasts" class:window-controls-overlay={headerPartOfMain} aria-label="Permission requests" aria-live="polite" aria-relevant="additions">
        {#each pending as resource (resource.requestId)}
            <div class="permission-toast">
                <PermissionCard {resource} onOpen={onOpenResources} dismissible />
            </div>
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
    .permission-toast { flex: 0 0 auto; background: rgb(0 0 0 / 95%); border-radius: 6px; backdrop-filter: blur(20px); }
</style>

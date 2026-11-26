<script>
    import Favicon from './Favicon.svelte'
    import { getTabDisplayLabel, getTabTitle } from '../lib/tab-title.js'

    let { parent, lightbox } = $props()
</script>

<span class="lightbox-tab-title" title={getTabDisplayLabel(parent, lightbox)}>
    <span class="parent-title">{getTabTitle(parent)}</span>
    <span class="divider" aria-hidden="true"></span>
    <Favicon tab={lightbox} showButton={false} />
    <span class="page-title">{getTabTitle(lightbox)}</span>
</span>

<style>
    .lightbox-tab-title {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        overflow: hidden;
    }

    .parent-title {
        flex: 0 1 38%;
    }

    .parent-title,
    .page-title {
        min-width: 0;
        overflow: hidden;
        mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
        -webkit-mask: linear-gradient(to right, black 0%, black 85%, transparent 100%);
    }

    .divider {
        align-self: center;
        flex: 0 0 1px;
        height: 12px;
        background: currentColor;
        opacity: 0.24;
    }

    .page-title {
        flex: 1;
    }
</style>

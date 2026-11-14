<script>
    import Favicon from './Favicon.svelte'
    import { getTabTitle } from '../lib/tab-title.js'

    let { parent, lightbox } = $props()
</script>

<span class="lightbox-tab-title" title={`${getTabTitle(parent)} · ${getTabTitle(lightbox)}`}>
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
        flex: 1;
        min-width: 0;
        text-align: left;
        line-height: 1.2;
        white-space: nowrap;
    }

    .parent-title {
        flex: 0 1 38%;
        min-width: 0;
        overflow: hidden;
        opacity: 0.72;
        mask-image: linear-gradient(to right, black calc(100% - 12px), transparent);
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
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>

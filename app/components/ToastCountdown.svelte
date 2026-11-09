<script>
    let { remaining, duration } = $props()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timeRemaining = $derived(reducedMotion ? Math.ceil(remaining / 1000) * 1000 : remaining)
    const progress = $derived(Math.max(0, Math.min(1, timeRemaining / duration)))
</script>

<svg class="toast-countdown" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle class="track" cx="8" cy="8" r="6" />
    <circle class="remaining" cx="8" cy="8" r="6" pathLength="1"
        stroke-dasharray="1" stroke-dashoffset={1 - progress} transform="rotate(-90 8 8)" />
</svg>

<style>
    .toast-countdown {
        position: absolute;
        top: 12px;
        right: 12px;
        width: 14px;
        height: 14px;
        pointer-events: none;
        stroke-width: 1.5;
    }
    .track { stroke: rgb(160 160 160 / 12%); }
    .remaining { stroke: rgb(160 160 160 / 45%); }
</style>

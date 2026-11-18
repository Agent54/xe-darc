<script>
    let { remaining, duration } = $props()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timeRemaining = $derived(reducedMotion ? Math.ceil(remaining / 1000) * 1000 : remaining)
    const progress = $derived(Math.max(0, Math.min(1, timeRemaining / duration)))
</script>

<svg class="toast-countdown" width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <circle class="track" cx="13" cy="13" r="12" />
    <circle class="remaining" cx="13" cy="13" r="12" pathLength="1"
        stroke-dasharray="1" stroke-dashoffset={1 - progress} transform="rotate(-90 13 13)" />
</svg>

<style>
    .toast-countdown {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        stroke-width: 1.5;
    }
    .track { stroke: rgb(160 160 160 / 12%); }
    .remaining { stroke: rgb(160 160 160 / 45%); }
</style>

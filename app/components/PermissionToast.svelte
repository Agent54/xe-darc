<script>
    import PermissionCard from './PermissionCard.svelte'
    import ToastCountdown from './ToastCountdown.svelte'

    let { resource, onOpen, onHide } = $props()
    const duration = 10_000
    let remaining = $state(duration)
    let hovered = $state(false)
    let focused = $state(false)
    let inspecting = $state(false)

    $effect(() => {
        if (hovered || focused || inspecting) return
        let lastTick = Date.now()
        const interval = setInterval(() => {
            const now = Date.now()
            remaining = Math.max(0, remaining - (now - lastTick))
            lastTick = now
            if (!remaining) onHide()
        }, 50)
        return () => clearInterval(interval)
    })
</script>

<section class="permission-toast" aria-label="Permission notification"
    onmouseenter={() => { hovered = true }}
    onmouseleave={() => { hovered = false }}
    onfocusin={() => { focused = true }}
    onfocusout={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) focused = false
    }}>
    <PermissionCard {resource} {onOpen} bind:inspecting />
    <ToastCountdown {remaining} {duration} />
</section>

<style>
    .permission-toast {
        position: relative;
        flex: 0 0 auto;
        background: rgb(0 0 0 / 95%);
        border-radius: 6px;
        backdrop-filter: blur(20px);
    }

    .permission-toast :global(.toast-countdown) { right: 38px; }
</style>

<script>
    import { agentState } from '../lib/agent.js'
</script>

<!--
Previous voice bridge, kept as a reference for a future audio adapter.
The hidden iframe loaded /agent_app. Comlink exposed the example add
method to the iframe through its contentWindow.

<script>
    import * as Comlink from "comlink"

    const agentIframeUrl = $derived.by(() => {
        const elevenlabsToken = localStorage.getItem('aiToken_elevenlabs')

        const url = new URL('https://localhost:5194/agent_app')
        url.searchParams.set('agent_id', elevenlabsToken)
        return url.toString()
    })

    let iframe = $state(null)

    $effect(() => {
        if (iframe) {
            function add(a, b) {
                return a + b
            }

            Comlink.expose({ add }, Comlink.windowEndpoint(iframe.contentWindow, window))

            // return () => {
            //     proxy[Comlink.releaseProxy]();
            // }
        }
    })
</script>

<iframe bind:this={iframe} style="background-color: #000; width: 0px; visibility: hidden; height: 0px;" title="voice-agent" src={agentIframeUrl} allow="microphone; clipboard-read; clipboard-write; screen-wake-lock 'self'"></iframe>
-->

<!-- TODO: orange microphone indicator and background mic when sidebar closed, secure uri -->
<span class="sr-only" role="status" data-agent-host="acp">
    Voice controls enabled for {$agentState.agentName || 'the external agent'}. Voice input is not connected yet.
</span>

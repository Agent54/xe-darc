<script>
    import { formatToolValue } from '../lib/agent-tool-display.js'
    let { value } = $props()
    const tokens = $derived(formatToolValue(value))
</script>

<pre class="tool-value"><code>{#each tokens as token}<span class={token.kind}>{token.text}</span>{/each}</code></pre>

<style>
    .tool-value { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; tab-size: 2 }
    code { font: inherit }
    .key { color: #93c5fd }
    .string { color: #a7d7aa }
    .number { color: #f3c78a }
    .boolean { color: #c4b5fd }
    .null { color: #f0abcf }
    .punctuation { color: #aaa }
</style>

<script>
    import { onMount } from 'svelte'

    let { value = null, onSelect = () => {} } = $props()
    let query = $state('')
    let customEmoji = $state('')
    let searchInput = $state(null)

    const emojis = [
        ['💼', 'Work business briefcase'], ['📁', 'Folder files'], ['📚', 'Books reading study'], ['📝', 'Notes writing'],
        ['📌', 'Pin important'], ['📅', 'Calendar planning'], ['✅', 'Done tasks check'], ['🎯', 'Target goals'],
        ['💡', 'Idea light bulb'], ['🔍', 'Search research'], ['🧪', 'Science experiments'], ['💻', 'Computer coding'],
        ['⚙️', 'Settings tools gear'], ['🔧', 'Tools repair wrench'], ['🧩', 'Puzzle projects'], ['📊', 'Charts analytics'],
        ['🎨', 'Art design palette'], ['📷', 'Photography camera'], ['🎬', 'Movies video film'], ['🎵', 'Music'],
        ['🎮', 'Games gaming'], ['🎧', 'Audio headphones'], ['✨', 'Sparkles favorites'], ['⭐', 'Star favorites'],
        ['🚀', 'Rocket launch'], ['🌍', 'Earth world travel'], ['✈️', 'Airplane flights travel'], ['🏠', 'Home house'],
        ['🏖️', 'Beach holidays vacation'], ['⛰️', 'Mountain outdoors'], ['🗺️', 'Map places'], ['🧭', 'Compass explore'],
        ['🌱', 'Plant growth seedling'], ['🌿', 'Herb nature leaves'], ['🌸', 'Flower blossom'], ['🌻', 'Sunflower garden'],
        ['🌙', 'Moon night'], ['☀️', 'Sun day'], ['🌈', 'Rainbow colors'], ['🔥', 'Fire hot'],
        ['☕', 'Coffee cafe'], ['🍵', 'Tea drink'], ['🍕', 'Pizza food'], ['🍜', 'Noodles ramen food'],
        ['🍋', 'Lemon fruit'], ['🥑', 'Avocado food'], ['🎂', 'Cake birthday'], ['🛒', 'Shopping cart'],
        ['🐈', 'Cat animal'], ['🐕', 'Dog animal'], ['🦊', 'Fox animal'], ['🐼', 'Panda animal'],
        ['🐙', 'Octopus animal'], ['🦋', 'Butterfly insect'], ['🐝', 'Bee insect'], ['🐳', 'Whale ocean'],
        ['❤️', 'Heart love'], ['💜', 'Purple heart'], ['💎', 'Diamond gem'], ['🎁', 'Gift present'],
        ['💬', 'Chat messages'], ['🤝', 'Team handshake'], ['🏆', 'Trophy achievements'], ['🔒', 'Lock private security']
    ]
    const matches = $derived(emojis.filter(([emoji, label]) => `${emoji} ${label}`.toLowerCase().includes(query.trim().toLowerCase())))
    const validCustomEmoji = $derived.by(() => {
        const emoji = customEmoji.trim()
        return /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(emoji) &&
            [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji)].length === 1
    })

    onMount(() => searchInput?.focus())
</script>

<div class="emoji-picker">
    <input class="emoji-search" bind:this={searchInput} bind:value={query} type="search" aria-label="Search emojis" placeholder="Search emojis" />
    <div class="emoji-grid" role="group" aria-label="Group emoji">
        {#each matches as [emoji, label] (emoji)}
            <button type="button" class:selected={value === emoji} aria-pressed={value === emoji} aria-label={label} title={label} onclick={() => onSelect(emoji)}>{emoji}</button>
        {:else}
            <p>No matching emojis</p>
        {/each}
    </div>
    <form class="custom-emoji" onsubmit={(event) => { event.preventDefault(); if (validCustomEmoji) onSelect(customEmoji.trim()) }}>
        <input bind:value={customEmoji} aria-label="Paste an emoji" placeholder="Or paste an emoji" />
        <button type="submit" disabled={!validCustomEmoji}>Use</button>
    </form>
    <button class="reset-emoji" type="button" onclick={() => onSelect(null)}>Use tab favicons</button>
</div>

<style>
    .emoji-picker { width: 280px; padding: 10px; }
    input { min-width: 0; padding: 7px 8px; border: 1px solid #ffffff1f; border-radius: 6px; background: #151515; color: #e5e5e5; font: inherit; font-size: 12px; }
    .emoji-search { width: 100%; }
    .emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; max-height: 216px; overflow-y: auto; margin: 10px 0; scrollbar-width: thin; }
    button { border: 0; border-radius: 5px; background: transparent; color: #e5e5e5; cursor: pointer; font: inherit; }
    .emoji-grid button { display: grid; place-items: center; height: 30px; padding: 0; font-size: 19px; }
    .emoji-grid button:hover, .emoji-grid button.selected { background: #ffffff1a; }
    .emoji-grid button.selected { box-shadow: inset 0 0 0 1px #ffffff40; }
    .emoji-grid p { grid-column: 1 / -1; padding: 10px 0; text-align: center; color: #999; font-size: 12px; }
    .custom-emoji { display: flex; gap: 6px; }
    .custom-emoji input { flex: 1; }
    .custom-emoji button { padding: 7px 10px; background: #252525; font-size: 12px; }
    button:disabled { opacity: 0.4; cursor: default; }
    .reset-emoji { width: 100%; margin-top: 6px; padding: 8px; text-align: left; font-size: 12px; color: #b8b8b8; }
    .reset-emoji:hover { background: #ffffff0f; }
    :focus-visible { outline: 1px solid #a3a3a3; outline-offset: -1px; }
</style>

<script>
    import { Canvas } from '@threlte/core'
    import Scene from './components/InteractiveLineScene.svelte'
    
    let { tab, class: className = '' } = $props()
    
    let inputValue = $state('')
    let mouseX = $state(0)
    let mouseY = $state(0)
    
    // Shader controls
    let grainOpacity = $state(0.04)
    let grainAmount = $state(38)
    let grainSize = $state(450)
    let grainFlicker = $state(0)
    let grainSpread = $state(0.01)
    let showControls = $state(false)
    
    function handleSubmit(event) {
        event.preventDefault()
        
        if (!inputValue.trim()) {
            return
        }
        
        try {
            let url = new URL(inputValue)
            tab.url = url
        } catch {
            // Not a valid URL, search with Google
            let searchUrl = new URL('https://www.google.com/search')
            searchUrl.searchParams.set('q', inputValue)
            tab.url = searchUrl
        }
    }
    
    function handleMouseMove(event) {
        mouseX = (event.clientX / window.innerWidth) * 2 - 1
        mouseY = -(event.clientY / window.innerHeight) * 2 + 1
    }
</script>

<div id="tab_{tab.id}" class="{className} new-tab flex flex-col items-center min-h-screen bg-black" role="application" onmousemove={handleMouseMove}>
    
    <div class="content-container relative z-10 pt-[20vh] w-full">
        <div class="omnibar-container max-w-xl w-full mx-auto px-6">
            
            <!-- 3D Scene Container - positioned above input -->
            <div class="threlte-container relative w-full h-64 mb-6 pointer-events-none">
                <Canvas>
                    <Scene {mouseX} {mouseY} {grainOpacity} {grainAmount} {grainSize} {grainFlicker} {grainSpread} />
                </Canvas>
            </div>
            
            <form onsubmit={handleSubmit} class="relative">
                <div class="input-wrapper relative">
                    <input
                        type="text"
                        bind:value={inputValue}
                        placeholder="Search, enter URL, or ask AI..."
                        class="omnibar-input w-full px-5 py-3 text-base bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl text-white/80 placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/10 focus:ring-opacity-60 focus:border-white/20 focus:text-white transition-all duration-300 hover:border-white/20"
                        autocomplete="off"
                        spellcheck="false"
                    />
                    <!-- <div class="input-accent absolute inset-0 rounded-xl bg-gradient-to-r from-gray-400/20 to-slate-400/20 opacity-0 transition-opacity duration-300 pointer-events-none"></div> -->
                </div>
            </form>
            
            <div class="action-buttons flex gap-3 justify-center mt-4">
                <button class="action-btn search-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    search
                </button>
                <button class="action-btn ask-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    ask
                </button>
                <button class="action-btn do-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    do
                </button>
                <button class="action-btn do-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    listen
                </button>
                <button onclick={() => showControls = !showControls} class="action-btn controls-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    {showControls ? 'hide' : 'shader'}
                </button>
            </div>
            
            {#if showControls}
                <div class="shader-controls max-w-sm mx-auto mt-6 p-4 bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl">
                    <div class="control-group mb-4">
                        <label class="block text-white/80 text-sm mb-2">Opacity: {grainOpacity.toFixed(2)}</label>
                        <input type="range" min="0" max="1" step="0.001" bind:value={grainOpacity} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label class="block text-white/80 text-sm mb-2">Grain Amount: {grainAmount.toFixed(2)}</label>
                        <input type="range" min="0" max="100" step="0.01" bind:value={grainAmount} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label class="block text-white/80 text-sm mb-2">Grain Size: {grainSize.toFixed(1)}</label>
                        <input type="range" min="0.01" max="500" step="0.01" bind:value={grainSize} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label class="block text-white/80 text-sm mb-2">Flicker: {grainFlicker.toFixed(2)}</label>
                        <input type="range" min="0" max="50" step="0.01" bind:value={grainFlicker} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group">
                        <label class="block text-white/80 text-sm mb-2">Grain Spread: {grainSpread.toFixed(2)}</label>
                        <input type="range" min="0.0001" max="2" step="0.0001" bind:value={grainSpread} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                </div>
            {/if}
            
            <!-- <div class="suggestions-hint text-center mt-6">
                <p class="text-white/40 text-sm">Press Enter to search, navigate, or chat with AI</p>
            </div> -->
        </div>
    </div>
</div>

<style>
    .omnibar-input:focus + .input-accent {
        opacity: 1;
    }
    
    .omnibar-input::selection {
        background-color: rgba(156, 163, 175, 0.3);
    }
    
    .new-tab {
        background: radial-gradient(ellipse 1200px 400px at center 40%, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 25%, rgba(255, 255, 255, 0.02) 50%, transparent 100%), black;
    }
    
    /* Custom slider styling */
    .slider::-webkit-slider-thumb {
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        border: 2px solid rgba(255, 255, 255, 0.2);
        transition: all 0.2s ease;
    }
    
    .slider::-webkit-slider-thumb:hover {
        background: white;
        border-color: rgba(255, 255, 255, 0.4);
        transform: scale(1.1);
    }
    
    .slider::-webkit-slider-track {
        height: 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
    }
    
    .slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        border: 2px solid rgba(255, 255, 255, 0.2);
        transition: all 0.2s ease;
    }
    
    .slider::-moz-range-track {
        height: 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.1);
    }
</style>

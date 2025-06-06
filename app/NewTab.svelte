<script>
    let { tab, class: className = '' } = $props()
    
    let inputValue = $state('')
    
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
</script>

<div id="tab_{tab.id}" class="{className} new-tab flex flex-col items-center min-h-screen bg-black pt-[40vh]">
    <div class="omnibar-container max-w-xl w-full mx-auto px-6">
        
        <form onsubmit={handleSubmit} class="relative">
            <div class="input-wrapper relative">
                <input
                    type="text"
                    bind:value={inputValue}
                    placeholder="Search, enter URL, or ask AI..."
                    class="omnibar-input w-full px-5 py-3 text-base bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl text-white/80 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-opacity-60 focus:border-white/20 focus:bg-black/80 focus:text-white transition-all duration-300 hover:bg-black/90 hover:border-white/20"
                    autocomplete="off"
                    spellcheck="false"
                />
                <div class="input-accent absolute inset-0 rounded-xl bg-gradient-to-r from-gray-400/20 to-slate-400/20 opacity-0 transition-opacity duration-300 pointer-events-none"></div>
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
        </div>
        
        <!-- <div class="suggestions-hint text-center mt-6">
            <p class="text-white/40 text-sm">Press Enter to search, navigate, or chat with AI</p>
        </div> -->
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
</style>

<script>
    import { Canvas } from '@threlte/core'
    import Scene from './InteractiveLineScene.svelte'
    // import { sandbox } from './sandbox.js'
    
    let { tab } = $props()
    
    let inputValue = $state('')
    let mouseX = $state(0)
    let mouseY = $state(0)
    
    // AI completions with proper cancellation and tracking
    let completions = $state([])
    let isGeneratingCompletions = $state(false)
    let aiWriter = $state(null)
    let aiSupported = $state(false)
    let selectedCompletionIndex = $state(-1)
    let currentAbortController = null
    let completionTimeout = null
    let generationId = 0
    
    // Shader controls
    let grainOpacity = $state(0.2) //0.16)
    let grainAmount = $state(31.7)// 36.57)
    let grainSize = $state(310.1) //395)
    let grainFlicker = $state(0)
    let grainSpread = $state(0.02)
    let animationSpeed = $state(1.7)
    let lineThickness = $state(0.025)
    let blur = $state(0)
    let showControls = $state(false)
    
    // Audio controls
    let isListening = $state(false)
    let audioLevel = $state(0)
    let audioFrequency = $state(0)
    let audioContext = null
    let analyser = null
    let microphone = null
    let animationFrame = null

    async function initializeAI() {
        console.log('🔄 Starting AI initialization...')
        
        try {
            await tryWriterAPI()
        } catch (error) {
            console.error('❌ Failed to initialize any AI API:', error)
            aiSupported = false
        }
        
        console.log('🏁 AI initialization complete. Supported:', aiSupported)
    }

    const modelOptions = {
        // sharedContext: 'I am a user entering text into the browser search box. Give the top 5 possible completions separated by newlines. Do not add order numbers, just pure text completions. Include the exact text from this prompt at the start. Do not add any other titles or explanations or other headers.',
        tone: 'neutral',
        format: 'plain-text',
        length: 'medium',
        // inputQuota: 10000,
        // outputLanguage: "en",
        // expectedInputLanguages: ["en"],
        // expectedContextLanguages: ["en"],
    }

    async function tryWriterAPI() {
        console.log('🔍 Trying Writer API...')
        console.log('Available APIs:', Object.keys(self))
        
        if ('Writer' in self) {
            console.log('✅ Writer API detected')
            
            try {
                const availability = await Writer.availability()
                console.log('🤖 Writer availability:', availability)
                
                if (availability === 'available') {
                    console.log('📝 Creating Writer instance...')
                    
                    try {
                        aiWriter = await Writer.create({
                            ...modelOptions
                        })
                        
                        // Test the writer immediately
                        // console.log('🧪 Testing Writer with simple prompt...')
                        // const testResult = await aiWriter.write('Complete: hello')
                        // console.log('🧪 Writer test successful:', testResult)
                        
                        aiSupported = true
                        console.log('✅ Writer initialized and tested successfully')
                        return true
                        
                    } catch (createError) {
                        console.error('❌ Writer creation/test failed:', createError)
                        if (createError.message?.includes('execution config')) {
                            console.log('💡 Writer API execution config issue detected')
                            console.log('💡 This usually means:')
                            console.log('   1. Missing origin trial token')
                            console.log('   2. Feature not fully enabled')
                            console.log('   3. Try: chrome://flags/#writer-api-for-gemini-nano')
                        }
                        return false
                    }
                    
                } else if (availability === 'downloadable') {
                    console.log('📥 Downloading Writer model...')
                    aiWriter = await Writer.create({
                        ...modelOptions,
                        monitor(m) {
                            m.addEventListener("downloadprogress", e => {
                                console.log(`📥 Downloaded ${(e.loaded / e.total * 100).toFixed(1)}%`)
                            })
                        }
                    })
                    aiSupported = true
                    console.log('✅ Writer initialized after download')
                    return true
                } else {
                    console.log('❌ Writer not available:', availability)
                    return false
                }
                
            } catch (availabilityError) {
                console.error('❌ Writer availability check failed:', availabilityError)
                return false
            }
            
        } else {
            console.log('❌ Writer API not available in this browser')
            return false
        }
    }

    // Generate AI completions with streaming and cancellation tracking
    async function generateCompletions(text) {
        // Assign a unique ID to this generation
        
        console.log(`🤖 [Starting generation for:`, text)
        
        if (!aiWriter || !text.trim() || text.length < 2) {
            console.log(`⚠️ [Gen Skipping generation - requirements not met`)            
            completions = []
            return
        }

        // Create new AbortController for this generation
        currentAbortController = new AbortController()
        const signal = currentAbortController.signal
        
        console.log(`🤖 [Gen Starting streaming completion generation with cancellation support...`)
        isGeneratingCompletions = true
        
        try {
            // Check if already cancelled before starting
            if (signal.aborted) {
                console.log(`🛑 [Gen Generation cancelled before starting`)
                return
            }
    
           await generate(text, signal)
            
            // Check if cancelled after promises complete
            if (signal.aborted) {
                console.log('🛑 Generation cancelled after completion')
                return
            }
            
            // Final check before setting results
            if (signal.aborted) {
                console.log('🛑 Generation cancelled before setting results')
                return
            }
        } catch (error) {
            if (error.name === 'AbortError' || signal.aborted) {
                console.log('🛑 Generation cancelled:', error.message)
                completions = []
            } else {
                console.error('❌ Error generating streaming completions:', error)
                completions = []
            }
        } finally {
            isGeneratingCompletions = false
            // Clear the current controller if it's the same one
            if (currentAbortController?.signal === signal) {
                currentAbortController = null
            }
            console.log('🤖 Streaming generation complete')
        }
    }

    let pendingText = ''
    async function generate(prompt, signal) {
        try {
            console.log(`📡 Starting Writer stream... ${prompt}`)
            
            // Check if already cancelled
            if (signal.aborted) {
                console.log(`🛑 Writer stream cancelled before starting`)
                return null
            }

            let responseNumber = 0
            completions[0] = ''
            let result = ''
            
            const stream = aiWriter.writeStreaming(`Give the top 5 possible completions separated by newlines. Do not add order numbers, just pure text completions. Include the exact text from this prompt at the start. Do not add any other titles or explanations or other headers. Try to complete to a full search phrase not just completing the current word. The text to complete is: "${prompt}"`, { signal , context: 'I am a user entering text into the browser search box.'  }) // context
            
            for await (const chunk of stream) {
                result += chunk
                // Check for cancellation on each chunk
                if (signal.aborted) {
                    console.log(`🛑 Writer stream cancelled during streaming`)
                    return null
                }
                
               if (chunk.includes('\n')) {
                    const [previous, current] = chunk.split('\n')
                    completions[responseNumber] += previous
                    responseNumber++
                    completions[responseNumber] = current
               } else {
                    completions[responseNumber] += chunk
               }
            }
            console.log({prompt, result})
        } catch (error) {
            if (error.name === 'AbortError' || signal.aborted) {
                console.log(`🛑 Writer stream aborted:`, error.message)
                return null
            } else {
                console.warn(`❌ Writer stream  failed:`, error)
                return null
            }
        }

        if (pendingText) {
            const lastPending = pendingText
            pendingText = ''
            await generate(lastPending, signal)
            
        }
    }

    // Handle input changes with better cancellation
    function handleInputChange(event) {
        const newValue = event.target.value
        
        inputValue = newValue
        
        // Clear completions if input is empty
        if (!newValue.trim()) {
            completions = []
            selectedCompletionIndex = -1
            
            // Cancel any running AI generation
            if (currentAbortController) {
                currentAbortController.abort()
                currentAbortController = null
                isGeneratingCompletions = false
            }
            return
        }
        
        if (aiSupported && aiWriter) {
            console.log('🤖 Triggering debounced completion generation...')
            debouncedGenerateCompletions(newValue)
        }
    }

    // Debounced completion generation with cancellation and better logging
    function debouncedGenerateCompletions(text) {
        console.log('⏰ Setting up debounced generation for:', text)

        if (currentAbortController) {
            pendingText = text
            return
        }
        
        // Cancel any existing timeout
        // if (completionTimeout) {
        //     clearTimeout(completionTimeout)
        //     console.log('⏰ Cleared previous timeout')
        // }
        
        // // Cancel any running AI generation
        // if (currentAbortController) {
        //     console.log('🛑 Cancelling running AI generation for new input...')
        //     currentAbortController.abort()
        //     currentAbortController = null
        //     isGeneratingCompletions = false
        // }

        // Clear completions immediately when input changes
        // if (text.length < 3) {
        //     completions = []
        //     console.log('🧹 Cleared completions due to short input')
        // }
        
        // Set new timeout with longer delay for better UX
        //completionTimeout = setTimeout(() => {
            console.log(`⏰ Debounce timeout triggered for "${text}", generating completions...`)
            generateCompletions(text)
        //}, 500) // 500ms for better debouncing
        
        //console.log('⏰ Timeout set for 500ms')
    }

    function handleKeyDown(event) {
        const filteredCompletions = completions.filter(c => c.trim().length > 0)
        if (filteredCompletions.length === 0) {
            return
        }

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault()
                selectedCompletionIndex = Math.min(selectedCompletionIndex + 1, filteredCompletions.length - 1)
                break
            case 'ArrowUp':
                event.preventDefault()
                selectedCompletionIndex = Math.max(selectedCompletionIndex - 1, -1)
                break
            case 'Tab':
            case 'Enter':
                if (selectedCompletionIndex >= 0) {
                    event.preventDefault()
                    selectCompletion(selectedCompletionIndex)
                }
                break
            case 'Escape':
                event.preventDefault()
                completions = []
                selectedCompletionIndex = -1
                
                // Cancel any running AI generation
                if (currentAbortController) {
                    currentAbortController.abort()
                    currentAbortController = null
                    isGeneratingCompletions = false
                }
                break
        }
    }

    function selectCompletion(index) {
        const filteredCompletions = completions.filter(c => c.trim().length > 0)
        if (index >= 0 && index < filteredCompletions.length) {
            inputValue = filteredCompletions[index]
            selectedCompletionIndex = -1
            
            const input = document.querySelector('.omnibar-input')
            if (input) {
                input.focus()
            }
        }
    }

    // Handle clicks outside input/dropdown to clear completions
    function handleClickOutside(event) {
        const inputContainer = event.target.closest('.input-wrapper')
        const dropdown = event.target.closest('.completions-dropdown')
        const actionButtons = event.target.closest('.action-buttons')
        const omnibarContainer = event.target.closest('.omnibar-container')
        
        // If click is outside input container, dropdown, action buttons, and omnibar area, clear completions
        if (!inputContainer && !dropdown && !actionButtons && !omnibarContainer && completions.length > 0) {
            completions = []
            selectedCompletionIndex = -1
            
            // Cancel any running AI generation
            if (currentAbortController) {
                currentAbortController.abort()
                currentAbortController = null
                isGeneratingCompletions = false
            }
        }
    }

    function handleSubmit(event) {
        event.preventDefault()
        
        if (!inputValue.trim()) {
            return
        }
        
        try {
            let url = new URL(inputValue)
            tab.url = url
        } catch {
            // Not a valid URL, check for Kagi prefix or use default search engine
            if (inputValue.toLowerCase().startsWith('k ')) {
                // Use Kagi search, remove the "k " prefix
                let searchUrl = new URL('https://kagi.com/search')
                searchUrl.searchParams.set('q', inputValue.slice(2))
                tab.url = searchUrl
            } else {
                // Use default search engine from settings
                const defaultSearchEngine = localStorage.getItem('defaultSearchEngine') || 'google'
                let searchUrl
                
                switch (defaultSearchEngine) {
                    case 'kagi':
                        searchUrl = new URL('https://kagi.com/search')
                        break
                    case 'custom':
                        const customUrl = localStorage.getItem('customSearchUrl')
                        if (customUrl) {
                            try {
                                searchUrl = new URL(customUrl + encodeURIComponent(inputValue))
                                tab.url = searchUrl
                                return
                            } catch {
                                // Fallback to Google if custom URL is invalid
                                searchUrl = new URL('https://www.google.com/search')
                            }
                        } else {
                            searchUrl = new URL('https://www.google.com/search')
                        }
                        break
                    default: // google
                        searchUrl = new URL('https://www.google.com/search')
                        break
                }
                
                searchUrl.searchParams.set('q', inputValue)
                tab.url = searchUrl
            }
        }
    }
    
    function handleMouseMove(event) {
        mouseX = (event.clientX / window.innerWidth) * 2 - 1
        mouseY = -(event.clientY / window.innerHeight) * 2 + 1
    }
    
    async function toggleListen() {
        if (!isListening) {
            try {
                // Request microphone access
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                
                // Set up Web Audio API
                audioContext = new (window.AudioContext || window.webkitAudioContext)()
                analyser = audioContext.createAnalyser()
                analyser.fftSize = 256
                analyser.smoothingTimeConstant = 0.8
                
                microphone = audioContext.createMediaStreamSource(stream)
                microphone.connect(analyser)
                
                isListening = true
                analyzeAudio()
            } catch (error) {
                console.error('Microphone access denied:', error)
                
                // Provide user feedback
                if (error.name === 'NotAllowedError') {
                    alert('Microphone access was denied. Please check your browser permissions and try again.')
                } else if (error.name === 'NotFoundError') {
                    alert('No microphone found. Please connect a microphone and try again.')
                } else {
                    alert(`Error accessing microphone: ${error.message}`)
                }
            }
        } else {
            stopListening()
        }
    }
    
    function analyzeAudio() {
        if (!isListening) return
        
        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        const frequencyData = new Float32Array(bufferLength)
        
        analyser.getByteFrequencyData(dataArray)
        analyser.getFloatFrequencyData(frequencyData)
        
        // Calculate average volume level
        let sum = 0
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i]
        }
        audioLevel = (sum / bufferLength) / 255 // Normalize to 0-1
        
        // Find dominant frequency
        let maxIndex = 0
        let maxValue = -Infinity
        for (let i = 0; i < bufferLength; i++) {
            if (frequencyData[i] > maxValue) {
                maxValue = frequencyData[i]
                maxIndex = i
            }
        }
        
        // Convert index to frequency (sample rate / 2) / bins
        const nyquist = audioContext.sampleRate / 2
        audioFrequency = (maxIndex * nyquist) / bufferLength / 1000 // Convert to kHz for easier use
        
        animationFrame = requestAnimationFrame(analyzeAudio)
    }
    
    function stopListening() {
        isListening = false
        
        if (animationFrame) {
            cancelAnimationFrame(animationFrame)
        }
        
        if (microphone) {
            microphone.disconnect()
            microphone.mediaStream.getTracks().forEach(track => track.stop())
        }
        
        if (audioContext) {
            audioContext.close()
        }
        
        audioLevel = 0
        audioFrequency = 0
    }
    
    $effect(() => {
        return () => {
            if (isListening) {
                stopListening()
            }
            
            // Cancel any running AI generation
            if (currentAbortController) {
                console.log('🛑 Cancelling AI generation on cleanup')
                currentAbortController.abort()
                currentAbortController = null
            }
            
            // Clear any pending timeouts
            if (completionTimeout) {
                clearTimeout(completionTimeout)
                completionTimeout = null
            }
            
            // Destroy AI writer
            if (aiWriter) {
                aiWriter.destroy()
            }
        }
    })

    let newTabContainer = null
    $effect(() => {
        if (tab.shouldFocus) {
            newTabContainer.scrollIntoView({ behavior: 'smooth' })
            tab.tabButton.scrollIntoView({ behavior: 'smooth' })
            tab.shouldFocus = false
        }
        initializeAI()
    })
</script>

<div bind:this={newTabContainer} class="new-tab flex flex-col items-center min-h-screen bg-black" role="application" onmousemove={handleMouseMove} onclick={handleClickOutside} onkeydown={(e) => { if (e.key === 'Escape') handleClickOutside(e) }} tabindex="-1">

    <div class="content-container relative pt-[15vh] w-full">
        <div class="omnibar-container max-w-xl w-full mx-auto px-6">
            
            <!-- 3D Scene Container - positioned above input -->
            <div class="threlte-container relative w-full h-64 pointer-events-none" style="filter: blur({blur}px);">
                <Canvas>
                    <Scene {mouseX} {mouseY} {grainOpacity} {grainAmount} {grainSize} {grainFlicker} {grainSpread} {animationSpeed} {lineThickness} {audioLevel} {audioFrequency} />
                </Canvas>
            </div>
            
            <form onsubmit={handleSubmit} class="relative">
                <div class="input-wrapper relative" onclick={(e) => e.stopPropagation()}>
                    <input
                        type="text"
                        bind:value={inputValue}
                        oninput={handleInputChange}
                        onkeydown={handleKeyDown}
                        placeholder="We can do anything..."
                        class="omnibar-input w-full px-5 py-3 text-base bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl text-white/80 placeholder-white/15 focus:outline-none focus:ring-1 focus:ring-white/10 focus:ring-opacity-60 focus:border-white/20 focus:text-white transition-all duration-300 hover:border-white/20"
                        autocomplete="off"
                        spellcheck="false"
                    />
                    
                    {#if isGeneratingCompletions}
                        <div class="ai-indicator absolute right-3 top-1/2 transform -translate-y-1/2" title="Generating AI completions...">
                            <div class="ai-spinner w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
                        </div>
                    {:else if aiSupported && aiWriter}
                        <!-- <div class="ai-badge absolute right-3 top-1/2 transform -translate-y-1/2 px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-md" title="AI completions ready">
                            AI ✓
                        </div> -->
                    {:else if aiSupported && !aiWriter}
                        <div class="ai-badge absolute right-3 top-1/2 transform -translate-y-1/2 px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-md" title="AI initializing...">
                            AI ?
                        </div>
                    {:else}
                        <div class="ai-badge absolute right-3 top-1/2 transform -translate-y-1/2 px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-md" title="AI Writer API not available. Check console for setup instructions.">
                            AI ✗
                        </div>
                    {/if}
                    
                    {#if completions.length > 0}
                        <div class="completions-dropdown absolute top-full left-0 right-0 mt-2 mb-20 bg-black/90 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden z-50" onclick={(e) => e.stopPropagation()}>
                            {#each completions.filter(c => c.trim().length > 0) as completion, index}
                                <button
                                    type="button"
                                    class="completion-item w-full px-4 py-3 text-left text-white/80 hover:bg-white/10 transition-colors duration-150 border-b border-white/5 last:border-b-0 {selectedCompletionIndex === index ? 'bg-white/10' : ''}"
                                    onclick={() => selectCompletion(index)}
                                >
                                    <span class="completion-text">{completion}</span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                    
                    <!-- <div class="input-accent absolute inset-0 rounded-xl bg-gradient-to-r from-gray-400/20 to-slate-400/20 opacity-0 transition-opacity duration-300 pointer-events-none"></div> -->
                </div>
            </form>
            
            <div class="action-buttons flex gap-3 justify-center mt-4">
                <button class="action-btn search-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    go
                </button>

                <button class="action-btn search-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    search
                </button>
                <button class="action-btn ask-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    ask
                </button>
                <button class="action-btn do-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    do
                </button>
                <button onclick={toggleListen} class="action-btn listen-btn px-4 py-2 text-sm {isListening ? 'bg-white/20' : 'bg-black/80'} text-white/80 rounded-lg border {isListening ? 'border-white/30' : 'border-white/10'} hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200 relative overflow-hidden">
                    {#if isListening}
                        <div class="absolute inset-0 bg-white/20 origin-left transition-transform duration-100" style="transform: scaleX({audioLevel})"></div>
                    {/if}
                    <span class="relative z-10">{isListening ? 'listening' : 'listen'}</span>
                </button>
                
                <button onclick={() => showControls = !showControls} class="action-btn controls-btn px-4 py-2 text-sm bg-black/80 text-white/80 rounded-lg border border-white/10 hover:bg-black/90 hover:text-white hover:border-white/20 hover:cursor-pointer transition-all duration-200">
                    {showControls ? 'see' : 'see'}
                </button>
            </div>
            
            {#if showControls}
                <div class="shader-controls max-w-sm mx-auto mt-6 p-4 bg-black/80 backdrop-blur-sm border border-white/10 rounded-xl">
                    
                    <div class="control-group mb-4">
                        <label for="opacity-control" class="block text-white/80 text-sm mb-2">Opacity: {grainOpacity.toFixed(2)}</label>
                        <input id="opacity-control" type="range" min="0" max="1" step="0.001" bind:value={grainOpacity} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label for="grain-amount-control" class="block text-white/80 text-sm mb-2">Grain Amount: {grainAmount.toFixed(2)}</label>
                        <input id="grain-amount-control" type="range" min="0" max="100" step="0.01" bind:value={grainAmount} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label for="grain-size-control" class="block text-white/80 text-sm mb-2">Grain Size: {grainSize.toFixed(1)}</label>
                        <input id="grain-size-control" type="range" min="0.01" max="500" step="0.01" bind:value={grainSize} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label for="flicker-control" class="block text-white/80 text-sm mb-2">Flicker: {grainFlicker.toFixed(2)}</label>
                        <input id="flicker-control" type="range" min="0" max="50" step="0.01" bind:value={grainFlicker} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label for="grain-spread-control" class="block text-white/80 text-sm mb-2">Grain Spread: {grainSpread.toFixed(2)}</label>
                        <input id="grain-spread-control" type="range" min="0.0001" max="2" step="0.0001" bind:value={grainSpread} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label for="animation-speed-control" class="block text-white/80 text-sm mb-2">Animation Speed: {animationSpeed.toFixed(2)}</label>
                        <input id="animation-speed-control" type="range" min="0.1" max="5" step="0.1" bind:value={animationSpeed} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group mb-4">
                        <label for="line-thickness-control" class="block text-white/80 text-sm mb-2">Line Thickness: {lineThickness.toFixed(3)}</label>
                        <input id="line-thickness-control" type="range" min="0.005" max="1" step="0.001" bind:value={lineThickness} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
                    </div>
                    
                    <div class="control-group">
                        <label for="blur-control" class="block text-white/80 text-sm mb-2">Blur: {blur.toFixed(1)}px</label>
                        <input id="blur-control" type="range" min="0" max="20" step="0.1" bind:value={blur} class="slider w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer">
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
    /* .omnibar-input:focus + .input-accent {
        opacity: 1;
    } */

    :global(body) {
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        -webkit-font-smoothing: subpixel-antialiased;
        text-rendering: optimizeLegibility;
    }
    
    .omnibar-input::selection {
        background-color: rgba(156, 163, 175, 0.3);
    }
    
    .new-tab {
        background-color: black;
        position: relative;
        /* -webkit-app-region: drag; breaks pointer events */
    }
    
    .new-tab::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(ellipse 1200px 400px at 50% calc(15vh + 285px), rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 25%, rgba(255, 255, 255, 0.02) 50%, transparent 100%);
        pointer-events: none;
        z-index: 0;
    }
    
    .content-container {
        position: relative;
        z-index: 1;
        -webkit-app-region: no-drag;
    }

    /* AI Features Styling */
    .ai-spinner {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    /* Tailwind animate-spin fallback */
    .animate-spin {
        animation: spin 1s linear infinite;
    }

    .ai-badge {
        font-family: 'SF Mono', Consolas, monospace;
        font-weight: 600;
        letter-spacing: 0.5px;
        backdrop-filter: blur(8px);
        transition: all 0.2s ease;
    }

    .ai-badge:hover {
        transform: scale(1.05);
    }

    .bg-yellow-500\/20 {
        background-color: rgba(234, 179, 8, 0.2);
    }
    .text-yellow-400 {
        color: rgb(250, 204, 21);
    }
    .bg-red-500\/20 {
        background-color: rgba(239, 68, 68, 0.2);
    }
    .text-red-400 {
        color: rgb(248, 113, 113);
    }

    .completions-dropdown {
        margin-top: 75px;
        box-shadow: 
            0 20px 40px rgba(0, 0, 0, 0.4),
            0 8px 16px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        animation: dropdown-appear 0.2s ease-out;
        max-height: 280px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        margin-bottom: 80px;
    }

    .completions-dropdown::-webkit-scrollbar {
        width: 6px;
    }

    .completions-dropdown::-webkit-scrollbar-track {
        background: transparent;
    }

    .completions-dropdown::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .completions-dropdown::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    @keyframes dropdown-appear {
        from {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
        }
        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }

    .completion-item {
        font-size: 14px;
        line-height: 1.4;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        min-height: 48px;
        display: flex;
        align-items: center;
    }

    .completion-item:hover .completion-text {
        color: rgba(255, 255, 255, 0.95);
    }

    .completion-item:focus {
        background: rgba(255, 255, 255, 0.15) !important;
        outline: none;
    }

    .completion-text {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        transition: color 0.15s ease;
        width: 100%;
        min-height: 1.4em;
        line-height: 1.4;
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

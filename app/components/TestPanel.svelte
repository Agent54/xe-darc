<script>
    import { onMount } from 'svelte'
    
    let { testFramework } = $props()
    
    let panel = $state(null)
    let scrollContainer = $state(null)
    let isVisible = $state(false)
    let currentTest = $state(null)
    let actions = $state([])
    let isCollapsed = $state(false)
    let position = $state({ top: 20, right: 20 })
    let isDragging = $state(false)
    let dragStart = $state({ x: 0, y: 0, startLeft: 0, startTop: 0 })
    let isRunning = $state(false)
    
    onMount(() => {
        // Load saved position
        const savedPosition = localStorage.getItem('testPanelPosition')
        if (savedPosition) {
            try {
                position = JSON.parse(savedPosition)
            } catch (e) {
                console.warn('Failed to parse saved test panel position:', e)
            }
        }
        
        // Register with test framework
        if (testFramework) {
            testFramework.registerPanel({
                show: () => isVisible = true,
                hide: () => isVisible = false,
                updateTest: (testName) => {
                    currentTest = testName
                    actions = []
                },
                addAction: (action, details = '') => {
                    const timestamp = new Date().toLocaleTimeString()
                    actions = [...actions, { action, details, timestamp }]
                    // Keep only last 10 actions
                    if (actions.length > 10) {
                        actions = actions.slice(-10)
                    }
                    // Auto-scroll to bottom after actions update
                    setTimeout(() => {
                        if (scrollContainer && !isCollapsed) {
                            scrollContainer.scrollTop = scrollContainer.scrollHeight
                        }
                    }, 10)
                },
                setRunning: (running) => {
                    isRunning = running
                }
            })
        }
    })
    
    function startDrag(e) {
        if (e.target.closest('.close-button')) return
        
        isDragging = true
        dragStart = {
            x: e.clientX,
            y: e.clientY,
            startLeft: panel.getBoundingClientRect().left,
            startTop: panel.getBoundingClientRect().top
        }
        
        const handleMouseMove = (e) => {
            if (!isDragging) return
            
            const deltaX = e.clientX - dragStart.x
            const deltaY = e.clientY - dragStart.y
            
            const newLeft = dragStart.startLeft + deltaX
            const newTop = dragStart.startTop + deltaY
            
            // Keep within viewport bounds
            const maxLeft = window.innerWidth - panel.offsetWidth
            const maxTop = window.innerHeight - panel.offsetHeight
            
            const clampedLeft = Math.max(0, Math.min(maxLeft, newLeft))
            const clampedTop = Math.max(0, Math.min(maxTop, newTop))
            
            position = {
                top: clampedTop,
                right: window.innerWidth - clampedLeft - panel.offsetWidth
            }
        }
        
        const handleMouseUp = () => {
            isDragging = false
            localStorage.setItem('testPanelPosition', JSON.stringify(position))
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
        
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }
    
    function toggleCollapse() {
        isCollapsed = !isCollapsed
    }
    
    function closePanel() {
        isVisible = false
    }
    
    async function restartAllTests() {
        if (testFramework) {
            await testFramework.restartAllTests()
        }
    }
    
    async function restartCurrentTest() {
        if (testFramework && currentTest) {
            await testFramework.restartTest(currentTest)
        }
    }
</script>

{#if isVisible}
    <div 
        bind:this={panel}
        class="test-panel"
        style="top: {position.top}px; right: {position.right}px;"
    >
        <div 
            class="panel-header"
            onmousedown={startDrag}
        >
            <div class="status-indicator"></div>
            <span class="title">🧪 Test Runner</span>
            <button 
                class="restart-button"
                onclick={restartAllTests}
                title="Restart All Tests"
            >
                🔄
            </button>
            <div class="drag-handle">⋮⋮</div>
            <button 
                class="close-button"
                onclick={closePanel}
                title="Close Test Panel"
            >
                ×
            </button>
        </div>
        
        <div class="panel-content" bind:this={scrollContainer}>
            {#if currentTest}
                <div 
                    class="test-header"
                    onclick={toggleCollapse}
                >
                    <strong>📋 Test: </strong>
                    <span class="test-name">{currentTest}</span>
                    <button 
                        class="restart-test-button"
                        onclick={(e) => {
                            e.stopPropagation()
                            restartCurrentTest()
                        }}
                        title="Restart This Test"
                    >
                        🔄
                    </button>
                    <span class="collapse-icon">
                        {isCollapsed ? '▶' : '▼'}
                    </span>
                </div>
                
                {#if !isCollapsed}
                    <div class="test-actions">
                        {#each actions as { action, details, timestamp }}
                            <div class="action-item">
                                <div class="action-timestamp">{timestamp}</div>
                                <div class="action-text">{action}</div>
                                {#if details}
                                    <div class="action-details">{details}</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            {:else if isRunning}
                <div class="placeholder">
                    <div class="placeholder-title">📋 Test: Running tests</div>
                    <div class="placeholder-content">
                        <div class="placeholder-status">Active</div>
                        <div class="placeholder-text">⚡ Tests are executing</div>
                        <div class="placeholder-hint">Watch for actions below</div>
                    </div>
                </div>
                
                {#if actions.length > 0}
                    <div class="test-actions">
                        {#each actions as { action, details, timestamp }}
                            <div class="action-item">
                                <div class="action-timestamp">{timestamp}</div>
                                <div class="action-text">{action}</div>
                                {#if details}
                                    <div class="action-details">{details}</div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/if}
            {:else}
                <div class="placeholder">
                    <div class="placeholder-title">📋 Test: Ready to run tests</div>
                    <div class="placeholder-content">
                        <div class="placeholder-status">Ready</div>
                        <div class="placeholder-text">⏳ Waiting for test execution</div>
                        <div class="placeholder-hint">Click "Run Test Suite" to start</div>
                    </div>
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .test-panel {
        position: fixed;
        width: 350px;
        max-height: 400px;
        background: rgb(0 0 0 / 96%);
        backdrop-filter: blur(21px);
        border: 1px solid hsl(0 0% 12% / 1);
        border-radius: 9px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 1px rgba(0, 0, 0, 0.5);
        color: #fff;
        font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        font-size: 12px;
        line-height: 1.4;
        z-index: 999998;
        user-select: none;
        overflow: hidden;
    }
    
    .panel-header {
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: move;
        user-select: none;
        font-weight: 600;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: rgba(255, 255, 255, 0.9);
    }
    
    .status-indicator {
        width: 8px;
        height: 8px;
        background: #10b981;
        border-radius: 50%;
        animation: pulse 2s infinite;
    }
    
    .title {
        flex: 1;
    }
    
    .drag-handle {
        opacity: 0.7;
        margin-left: auto;
    }
    
    .close-button {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 16px;
        padding: 0 8px;
        margin-left: 8px;
        line-height: 1;
        border-radius: 3px;
        transition: all 0.2s ease;
    }
    
    .close-button:hover {
        color: #fff;
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    .restart-button {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 14px;
        padding: 4px 8px;
        line-height: 1;
        border-radius: 3px;
        transition: all 0.2s ease;
        margin-left: 8px;
    }
    
    .restart-button:hover {
        color: #fff;
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    .restart-test-button {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        font-size: 12px;
        padding: 4px 6px;
        line-height: 1;
        border-radius: 3px;
        transition: all 0.2s ease;
        margin-left: 8px;
    }
    
    .restart-test-button:hover {
        color: #fff;
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    .panel-content {
        padding: 20px;
        padding-top: 12px;
        max-height: 320px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }
    
    .panel-content::-webkit-scrollbar {
        width: 6px;
    }
    
    .panel-content::-webkit-scrollbar-track {
        background: transparent;
    }
    
    .panel-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }
    
    .panel-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
    
    .test-header {
        margin-bottom: 12px;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        transition: all 0.2s ease;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    
    .test-header:hover {
        background: rgba(255, 255, 255, 0.06);
    }
    
    .test-name {
        color: rgba(255, 255, 255, 0.7);
        flex: 1;
    }
    
    .collapse-icon {
        color: rgba(255, 255, 255, 0.5);
        font-size: 10px;
    }
    
    .test-actions {
        margin-left: 16px;
        font-size: 11px;
        line-height: 1.3;
    }
    
    .action-item {
        margin-bottom: 6px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 4px;
        transition: all 0.2s ease;
        border-left: 2px solid rgba(255, 255, 255, 0.1);
    }
    
    .action-timestamp {
        color: rgba(255, 255, 255, 0.3);
        font-size: 9px;
        margin-bottom: 3px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .action-text {
        color: rgba(255, 255, 255, 0.9);
        font-weight: 500;
        font-size: 11px;
    }
    
    .action-details {
        color: rgba(255, 255, 255, 0.5);
        font-size: 9px;
        margin-top: 3px;
    }
    
    .placeholder {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 12px 14px;
        margin-bottom: 12px;
    }
    
    .placeholder-title {
        color: rgba(255, 255, 255, 0.9);
        margin-bottom: 8px;
    }
    
    .placeholder-content {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 12px 14px;
        font-size: 11px;
        line-height: 1.3;
    }
    
    .placeholder-status {
        color: rgba(255, 255, 255, 0.3);
        font-size: 10px;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .placeholder-text {
        color: rgba(255, 255, 255, 0.9);
        font-weight: 500;
        margin-bottom: 4px;
    }
    
    .placeholder-hint {
        color: rgba(255, 255, 255, 0.5);
        font-size: 10px;
    }
    
    @keyframes pulse {
        0%, 100% { 
            opacity: 1; 
        }
        50% { 
            opacity: 0.5; 
        }
    }
</style> 
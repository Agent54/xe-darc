// In-Browser Testing Framework
// Playwright-like API that runs entirely within the browser without external dependencies
// Includes visual feedback for mouse movements and clicks

class InBrowserTestingFramework {
    constructor() {
        this.tests = []
        this.results = []
        this.isRunning = false
        this.mouseTracker = null
        this.clickIndicators = []
        this.currentHoverElement = null
        this.testPanel = null
        this.currentTestName = null
        this.setupMouseTracking()
        this.setupClickVisualization()
        this.setupHoverSimulation()
        this.setupTestPanel()
    }

    // Setup visual mouse tracking
    setupMouseTracking() {
        // Create mouse cursor indicator
        this.mouseTracker = document.createElement('div')
        this.mouseTracker.id = 'test-mouse-tracker'
        this.mouseTracker.style.cssText = `
            position: fixed;
            width: 16px;
            height: 16px;
            background: radial-gradient(circle, rgba(255,0,0,0.8) 0%, rgba(255,0,0,0.4) 50%, transparent 70%);
            border-radius: 50%;
            pointer-events: none;
            z-index: 999999;
            display: none;
            transition: all 0.1s ease;
            box-shadow: 0 0 10px rgba(255,0,0,0.5);
        `
        document.body.appendChild(this.mouseTracker)

        // Track actual mouse movements
        this.realMouseHandler = (event) => {
            if (!this.isRunning) return
            this.mouseTracker.style.left = (event.clientX - 8) + 'px'
            this.mouseTracker.style.top = (event.clientY - 8) + 'px'
            this.mouseTracker.style.display = 'block'
        }

        document.addEventListener('mousemove', this.realMouseHandler)
    }

    // Setup click visualization
    setupClickVisualization() {
        this.clickStyle = document.createElement('style')
        this.clickStyle.textContent = `
            .test-click-indicator {
                position: fixed;
                width: 40px;
                height: 40px;
                border: 3px solid #ff0000;
                border-radius: 50%;
                pointer-events: none;
                z-index: 1000000;
                animation: clickRipple 0.6s ease-out;
            }
            
            @keyframes clickRipple {
                0% {
                    transform: scale(0.5);
                    opacity: 1;
                }
                100% {
                    transform: scale(2);
                    opacity: 0;
                }
            }
        `
        document.head.appendChild(this.clickStyle)
    }

    // Setup hover simulation with .hover-xe class management
    setupHoverSimulation() {
        this.hoverStyle = document.createElement('style')
        this.hoverStyle.textContent = `
            .hover-xe {
                /* Add visual feedback for hover state */
                filter: brightness(1.1) !important;
                transition: filter 0.1s ease !important;
            }
        `
        document.head.appendChild(this.hoverStyle)
    }

    // Manage hover state
    updateHoverState(element) {
        // Remove hover class from previous element
        if (this.currentHoverElement && this.currentHoverElement !== element) {
            this.currentHoverElement.classList.remove('hover-xe')
        }
        
        // Add hover class to new element
        if (element && element !== this.currentHoverElement) {
            element.classList.add('hover-xe')
        }
        
        this.currentHoverElement = element
    }

    // Setup floating test panel
    setupTestPanel() {
        this.testPanel = document.createElement('div')
        this.testPanel.id = 'test-panel'
        
        // Load saved position from localStorage
        const savedPosition = localStorage.getItem('testPanelPosition')
        let position = { top: 20, right: 20 }
        if (savedPosition) {
            try {
                position = JSON.parse(savedPosition)
            } catch (e) {
                console.warn('Failed to parse saved test panel position:', e)
            }
        }
        
        this.testPanel.style.cssText = `
            position: fixed;
            top: ${position.top}px;
            right: ${position.right}px;
            width: 350px;
            max-height: 400px;
            background: rgb(0 0 0 / 96%);
            backdrop-filter: blur(21px);
            border: 1px solid hsl(0 0% 12% / 1);
            border-radius: 9px;
            box-shadow: 0 0 2px 0 #000, -18px 0px 2px 1px #000;
            color: #fff;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
            z-index: 999998;
            display: none;
            user-select: none;
            overflow: hidden;
        `
        
        // Panel header (draggable)
        const header = document.createElement('div')
        header.style.cssText = `
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
        `
        header.innerHTML = `
            <div style="width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></div>
            <span>🧪 Test Runner</span>
            <div style="margin-left: auto; opacity: 0.7;">⋮⋮</div>
        `
        
        // Make header draggable
        this.makeDraggable(header)
        
        // Panel content
        const content = document.createElement('div')
        content.id = 'test-content'
        content.style.cssText = `
            padding: 20px;
            padding-top: 0;
            max-height: 320px;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
        `
        
        // Add pulse animation and scrollbar styles
        const style = document.createElement('style')
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            #test-content::-webkit-scrollbar {
                width: 6px;
            }
            #test-content::-webkit-scrollbar-track {
                background: transparent;
            }
            #test-content::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;
            }
            #test-content::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }
        `
        document.head.appendChild(style)
        
        this.testPanel.appendChild(header)
        this.testPanel.appendChild(content)
        document.body.appendChild(this.testPanel)
        
        // Initialize with placeholder content
        this.initializeTestPanel()
    }
    
    // Initialize test panel with placeholder content
    initializeTestPanel() {
        const content = document.getElementById('test-content')
        if (content) {
            content.innerHTML = `
                <div style="margin-bottom: 12px; padding: 12px 14px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; transition: all 0.2s ease;">
                    <strong style="color: rgba(255, 255, 255, 0.9);">📋 Test: </strong><span style="color: rgba(255, 255, 255, 0.7);">Ready to run tests</span>
                </div>
                <div id="test-actions" style="font-size: 11px; line-height: 1.3;">
                    <div style="margin-bottom: 6px; padding: 12px 14px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; transition: all 0.2s ease;">
                        <div style="color: rgba(255, 255, 255, 0.3); font-size: 10px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Ready</div>
                        <div style="color: rgba(255, 255, 255, 0.9); font-weight: 500;"><strong>⏳ Waiting for test execution</strong></div>
                        <div style="color: rgba(255, 255, 255, 0.5); font-size: 10px; margin-top: 4px;">Click "Run Test Suite" to start</div>
                    </div>
                </div>
            `
        }
    }

    // Make panel draggable
    makeDraggable(header) {
        let isDragging = false
        let startX, startY, startLeft, startTop
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true
            startX = e.clientX
            startY = e.clientY
            
            const rect = this.testPanel.getBoundingClientRect()
            startLeft = rect.left
            startTop = rect.top
            
            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
            
            e.preventDefault()
        })
        
        const onMouseMove = (e) => {
            if (!isDragging) return
            
            const deltaX = e.clientX - startX
            const deltaY = e.clientY - startY
            
            const newLeft = startLeft + deltaX
            const newTop = startTop + deltaY
            
            // Keep within viewport bounds
            const maxLeft = window.innerWidth - this.testPanel.offsetWidth
            const maxTop = window.innerHeight - this.testPanel.offsetHeight
            
            const clampedLeft = Math.max(0, Math.min(maxLeft, newLeft))
            const clampedTop = Math.max(0, Math.min(maxTop, newTop))
            
            this.testPanel.style.left = clampedLeft + 'px'
            this.testPanel.style.top = clampedTop + 'px'
            this.testPanel.style.right = 'auto' // Remove right positioning
        }
        
        const onMouseUp = () => {
            isDragging = false
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
            
            // Save position to localStorage
            const rect = this.testPanel.getBoundingClientRect()
            const position = {
                top: rect.top,
                right: window.innerWidth - rect.right
            }
            localStorage.setItem('testPanelPosition', JSON.stringify(position))
        }
    }

    // Update test panel with current test info
    updateTestPanel(testName, action, details = '') {
        console.log('📋 updateTestPanel called:', { testName, action, details, panelExists: !!this.testPanel })
        
        if (!this.testPanel) {
            console.warn('Test panel not found!')
            return
        }
        
        const content = document.getElementById('test-content')
        if (!content) {
            console.warn('Test content div not found!')
            return
        }
        
        // Update current test name
        if (testName && testName !== this.currentTestName) {
            this.currentTestName = testName
            content.innerHTML = `
                <div style="margin-bottom: 12px; padding: 12px 14px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; transition: all 0.2s ease;">
                    <strong style="color: rgba(255, 255, 255, 0.9);">📋 Test: </strong><span style="color: rgba(255, 255, 255, 0.7);">${testName}</span>
                </div>
                <div id="test-actions" style="font-size: 11px; line-height: 1.3;"></div>
            `
            console.log('Test name updated:', testName)
        }
        
        // Add action
        if (action) {
            const actionsDiv = document.getElementById('test-actions')
            if (actionsDiv) {
                const timestamp = new Date().toLocaleTimeString()
                const actionElement = document.createElement('div')
                actionElement.style.cssText = `
                    margin-bottom: 6px;
                    padding: 12px 14px;
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    transition: all 0.2s ease;
                `
                actionElement.innerHTML = `
                    <div style="color: rgba(255, 255, 255, 0.3); font-size: 10px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${timestamp}</div>
                    <div style="color: rgba(255, 255, 255, 0.9); font-weight: 500;"><strong>${action}</strong></div>
                    ${details ? `<div style="color: rgba(255, 255, 255, 0.5); font-size: 10px; margin-top: 4px;">${details}</div>` : ''}
                `
                actionsDiv.appendChild(actionElement)
                
                // Auto-scroll to bottom
                content.scrollTop = content.scrollHeight
                
                // Keep only last 10 actions
                const actions = actionsDiv.children
                if (actions.length > 10) {
                    actionsDiv.removeChild(actions[0])
                }
                
                console.log('Action added:', action)
            } else {
                console.warn('Actions div not found!')
            }
        }
    }

    // Show test panel
    showTestPanel() {
        console.log('📋 showTestPanel called, panel exists:', !!this.testPanel)
        if (this.testPanel) {
            this.testPanel.style.display = 'block'
            console.log('Test panel shown')
        } else {
            console.warn('Test panel not found when trying to show!')
        }
    }

    // Hide test panel
    hideTestPanel() {
        if (this.testPanel) {
            this.testPanel.style.display = 'none'
        }
    }

    // Add visual click indicator
    showClickIndicator(x, y) {
        const indicator = document.createElement('div')
        indicator.className = 'test-click-indicator'
        indicator.style.left = (x - 20) + 'px'
        indicator.style.top = (y - 20) + 'px'
        document.body.appendChild(indicator)
        
        this.clickIndicators.push(indicator)
        
        // Remove after animation
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator)
            }
            const index = this.clickIndicators.indexOf(indicator)
            if (index > -1) {
                this.clickIndicators.splice(index, 1)
            }
        }, 600)
    }

    // Add a test to the suite
    test(name, testFn) {
        this.tests.push({ name, testFn })
        return this
    }

    // Run all tests
    async runAll() {
        this.isRunning = true
        this.results = []
        
        // Show test panel
        this.showTestPanel()
        this.updateTestPanel(null, '🚀 Starting Test Suite', `Running ${this.tests.length} test(s)`)
        
        console.log(`🧪 Starting in-browser test suite with ${this.tests.length} test(s)...`)
        console.log('🎯 Visual feedback enabled - mouse movements and clicks will be highlighted')
        
        for (const { name, testFn } of this.tests) {
            try {
                console.log(`🔍 Running test: ${name}`)
                this.updateTestPanel(name, '🔍 Test Started', 'Initializing test environment')
                
                const page = new BrowserPage()
                page.framework = this // Give page access to framework for logging
                // Also set global reference for components that need it
                window.testFramework = this
                await testFn(page)
                
                console.log(`✅ Test passed: ${name}`)
                this.updateTestPanel(name, '✅ Test Passed', 'All assertions successful')
                this.results.push({ name, status: 'passed' })
            } catch (error) {
                console.error(`❌ Test failed: ${name}`, error)
                this.updateTestPanel(name, '❌ Test Failed', error.message)
                this.results.push({ name, status: 'failed', error: error.message })
            }
        }
        
        this.isRunning = false
        this.mouseTracker.style.display = 'none'
        
        const passed = this.results.filter(r => r.status === 'passed').length
        const failed = this.results.filter(r => r.status === 'failed').length
        
        console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`)
        this.updateTestPanel(null, '📊 Test Suite Complete', `${passed} passed, ${failed} failed`)
        
        if (failed > 0) {
            console.log('\n❌ Failed tests:')
            this.results.filter(r => r.status === 'failed').forEach(r => {
                console.log(`  - ${r.name}: ${r.error}`)
            })
        }
        
        // Keep panel visible for 5 seconds after completion
        setTimeout(() => {
            this.hideTestPanel()
        }, 5000)
        
        return { passed, failed, results: this.results }
    }

    // Cleanup
    cleanup() {
        if (this.mouseTracker) {
            document.removeEventListener('mousemove', this.realMouseHandler)
            this.mouseTracker.remove()
        }
        if (this.clickStyle) {
            this.clickStyle.remove()
        }
        if (this.hoverStyle) {
            this.hoverStyle.remove()
        }
        if (this.testPanel) {
            this.testPanel.remove()
        }
        // Remove hover class from current element
        if (this.currentHoverElement) {
            this.currentHoverElement.classList.remove('hover-xe')
            this.currentHoverElement = null
        }
        this.clickIndicators.forEach(indicator => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator)
            }
        })
        this.clickIndicators = []
    }
}

// Browser page class that mimics Playwright's page API
class BrowserPage {
    constructor() {
        this.viewport = { width: window.innerWidth, height: window.innerHeight }
        this.framework = null // Will be set by test runner
        
        // Track current mouse position
        this.currentMouseX = this.viewport.width / 2
        this.currentMouseY = this.viewport.height / 2
        
        // Initialize mouse position at center and show tracker
        this.initializeMouse()
    }
    
    // Initialize mouse position and visual tracker
    initializeMouse() {
        if (this.framework && this.framework.mouseTracker) {
            this.framework.mouseTracker.style.left = (this.currentMouseX - 8) + 'px'
            this.framework.mouseTracker.style.top = (this.currentMouseY - 8) + 'px'
            this.framework.mouseTracker.style.display = 'block'
            
            console.log(`🖱️  Mouse cursor initialized at center: (${this.currentMouseX}, ${this.currentMouseY})`)
        }
    }
    
    // Get current mouse position
    getCurrentMousePosition() {
        return { x: this.currentMouseX, y: this.currentMouseY }
    }

    // Mouse actions with visual feedback
    async mouse() {
        const framework = this.framework
        const page = this // Reference to page instance
        
        const mouseActions = {
            move: async (targetX, targetY) => {
                console.log(`🖱️  Moving mouse from (${page.currentMouseX}, ${page.currentMouseY}) to (${targetX}, ${targetY})`)
                
                // Log to test panel
                if (framework) {
                    framework.updateTestPanel(null, '🖱️ Mouse Move', `Moving to (${targetX}, ${targetY})`)
                }
                
                // Calculate movement path with curve and easing
                const steps = 30 // Number of animation steps
                const duration = 800 // Total duration in ms
                const stepDuration = duration / steps
                
                for (let i = 0; i <= steps; i++) {
                    const progress = i / steps
                    
                    // Easing function (ease-in-out)
                    const easeInOut = progress < 0.5 
                        ? 2 * progress * progress 
                        : 1 - Math.pow(-2 * progress + 2, 3) / 2
                    
                    // Add slight curve to movement (bezier-like)
                    const curveOffset = Math.sin(progress * Math.PI) * 20 // Curve height
                    
                    // Calculate position with curve
                    const x = page.currentMouseX + (targetX - page.currentMouseX) * easeInOut
                    const y = page.currentMouseY + (targetY - page.currentMouseY) * easeInOut - curveOffset
                    
                    // Update visual tracker
                    if (framework && framework.mouseTracker) {
                        framework.mouseTracker.style.left = (x - 8) + 'px'
                        framework.mouseTracker.style.top = (y - 8) + 'px'
                        framework.mouseTracker.style.display = 'block'
                    }
                    
                    // Update page's current position
                    page.currentMouseX = x
                    page.currentMouseY = y
                    
                    // Find element at current position and manage hover state
                    const element = document.elementFromPoint(x, y)
                    if (element) {
                        // Update hover state using framework
                        if (framework) {
                            framework.updateHoverState(element)
                        }
                        
                        // Dispatch mouse events
                        const mouseOverEvent = new MouseEvent('mouseover', {
                            clientX: x,
                            clientY: y,
                            bubbles: true,
                            cancelable: true,
                            target: element
                        })
                        const mouseEnterEvent = new MouseEvent('mouseenter', {
                            clientX: x,
                            clientY: y,
                            bubbles: true,
                            cancelable: true,
                            target: element
                        })
                        const mouseMoveEvent = new MouseEvent('mousemove', {
                            clientX: x,
                            clientY: y,
                            bubbles: true,
                            cancelable: true,
                            target: element
                        })
                        
                        element.dispatchEvent(mouseOverEvent)
                        element.dispatchEvent(mouseEnterEvent)
                        element.dispatchEvent(mouseMoveEvent)
                        
                        // Also dispatch on document for global listeners
                        document.dispatchEvent(mouseMoveEvent)
                    }
                    
                    await page.wait(stepDuration)
                }
                
                // Final position update
                page.currentMouseX = targetX
                page.currentMouseY = targetY
            },
            
            click: async (targetX, targetY) => {
                // First move to the target position if not already there
                if (page.currentMouseX !== targetX || page.currentMouseY !== targetY) {
                    await mouseActions.move(targetX, targetY)
                }
                
                // Always use the current mouse position for clicking
                const clickX = page.currentMouseX
                const clickY = page.currentMouseY
                
                console.log(`🖱️  Clicking at current cursor position: (${clickX}, ${clickY})`)
                
                // Log to test panel
                if (framework) {
                    framework.updateTestPanel(null, '🖱️ Mouse Click', `Clicking at (${clickX}, ${clickY})`)
                    framework.showClickIndicator(clickX, clickY)
                }
                
                // Find element and click it at current cursor position
                const element = document.elementFromPoint(clickX, clickY)
                if (element) {
                    // Dispatch mouse events in proper sequence with proper event details
                    const mouseDown = new MouseEvent('mousedown', {
                        clientX: clickX, 
                        clientY: clickY, 
                        bubbles: true, 
                        cancelable: true,
                        target: element,
                        button: 0,
                        buttons: 1
                    })
                    const mouseUp = new MouseEvent('mouseup', {
                        clientX: clickX, 
                        clientY: clickY, 
                        bubbles: true, 
                        cancelable: true,
                        target: element,
                        button: 0,
                        buttons: 0
                    })
                    const clickEvent = new MouseEvent('click', {
                        clientX: clickX, 
                        clientY: clickY, 
                        bubbles: true, 
                        cancelable: true,
                        target: element,
                        button: 0,
                        buttons: 0
                    })
                    
                    element.dispatchEvent(mouseDown)
                    await page.wait(50)
                    element.dispatchEvent(mouseUp)
                    await page.wait(50)
                    element.dispatchEvent(clickEvent)
                    
                    // Focus if focusable
                    if (element.focus && typeof element.focus === 'function') {
                        element.focus()
                    }
                } else {
                    throw new Error(`No element found at coordinates (${clickX}, ${clickY})`)
                }
                
                await page.wait(100)
            }
        }
        
        return mouseActions
    }

    // Wait for selector with timeout
    async waitForSelector(selector, options = {}) {
        const timeout = options.timeout || 5000
        const startTime = Date.now()
        
        // Log to test panel
        if (this.framework) {
            this.framework.updateTestPanel(null, '🔍 Wait for Element', `Looking for: ${selector}`)
        }
        
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector)
            if (element) {
                console.log(`✅ Found element: ${selector}`)
                if (this.framework) {
                    this.framework.updateTestPanel(null, '✅ Element Found', `Found: ${selector}`)
                }
                return element
            }
            await this.wait(100)
        }
        
        if (this.framework) {
            this.framework.updateTestPanel(null, '❌ Element Not Found', `Timeout: ${selector}`)
        }
        throw new Error(`Element not found: ${selector}`)
    }

    // Click element by selector
    async click(selector, options = {}) {
        const element = await this.waitForSelector(selector, options)
        const rect = element.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        
        console.log(`🖱️  Clicking element: ${selector} at (${x}, ${y})`)
        
        // Move to element first, then click at current position
        const mouse = await this.mouse()
        await mouse.click(x, y)
    }

    // Type text into element
    async type(selector, text, options = {}) {
        const element = await this.waitForSelector(selector, options)
        console.log(`⌨️  Typing "${text}" into ${selector}`)
        
        // Focus the element first
        element.focus()
        
        // Clear existing content if specified
        if (options.clear !== false) {
            element.value = ''
        }
        
        // Simulate typing character by character
        for (let i = 0; i < text.length; i++) {
            const char = text[i]
            element.value += char
            
            // Dispatch input events
            const inputEvent = new Event('input', { bubbles: true })
            element.dispatchEvent(inputEvent)
            
            await this.wait(50 + Math.random() * 50) // Variable typing speed
        }
        
        // Dispatch change event
        const changeEvent = new Event('change', { bubbles: true })
        element.dispatchEvent(changeEvent)
    }

    // Wait for element with specific text
    async waitForText(text, options = {}) {
        const timeout = options.timeout || 5000
        const startTime = Date.now()
        
        // Log to test panel
        if (this.framework) {
            this.framework.updateTestPanel(null, '🔍 Wait for Text', `Looking for text: "${text}"`)
        }
        
        while (Date.now() - startTime < timeout) {
            const elements = Array.from(document.querySelectorAll('*'))
            const element = elements.find(el => 
                el.textContent && el.textContent.toLowerCase().includes(text.toLowerCase())
            )
            if (element) {
                console.log(`✅ Found element with text: "${text}"`)
                if (this.framework) {
                    this.framework.updateTestPanel(null, '✅ Text Found', `Found: "${text}"`)
                }
                return element
            }
            await this.wait(100)
        }
        
        if (this.framework) {
            this.framework.updateTestPanel(null, '❌ Text Not Found', `Timeout: "${text}"`)
        }
        throw new Error(`Element with text "${text}" not found`)
    }

    // Wait for function to return truthy value
    async waitForFunction(fn, options = {}) {
        const timeout = options.timeout || 5000
        const startTime = Date.now()
        
        while (Date.now() - startTime < timeout) {
            try {
                const result = await fn()
                if (result) {
                    return result
                }
            } catch (error) {
                // Continue waiting
            }
            await this.wait(100)
        }
        
        throw new Error('Function did not return truthy value within timeout')
    }

    // Get page title
    async title() {
        return document.title
    }

    // Get page URL
    url() {
        return window.location.href
    }

    // Navigate to URL
    async goto(url, options = {}) {
        console.log(`🌐 Navigating to: ${url}`)
        window.location.href = url
        
        if (options.waitUntil !== 'domcontentloaded') {
            await this.waitForLoadState('load')
        }
    }

    // Wait for page load state
    async waitForLoadState(state = 'load') {
        return new Promise(resolve => {
            if (document.readyState === 'complete' && state === 'load') {
                resolve()
            } else {
                const handler = () => {
                    if (document.readyState === 'complete' && state === 'load') {
                        document.removeEventListener('readystatechange', handler)
                        resolve()
                    }
                }
                document.addEventListener('readystatechange', handler)
            }
        })
    }

    // Screenshot (returns data URL)
    async screenshot(options = {}) {
        return new Promise((resolve, reject) => {
            html2canvas(document.body, {
                allowTaint: true,
                useCORS: true,
                ...options
            }).then(canvas => {
                resolve(canvas.toDataURL())
            }).catch(reject)
        })
    }

    // Evaluate JavaScript in page context
    async evaluate(fn, ...args) {
        try {
            return await fn(...args)
        } catch (error) {
            throw new Error(`Evaluation failed: ${error.message}`)
        }
    }

    // Wait utility
    async wait(ms) {
        if (this.framework && ms > 500) {
            this.framework.updateTestPanel(null, '⏱️ Waiting', `Waiting ${ms}ms`)
        }
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    // Get viewport size
    viewportSize() {
        return this.viewport
    }

    // Set viewport size
    async setViewportSize(size) {
        this.viewport = size
        // Note: Cannot actually resize browser window from JavaScript for security reasons
        console.log(`📏 Viewport size set to: ${size.width}x${size.height}`)
    }

    // Get element text content
    async textContent(selector) {
        const element = await this.waitForSelector(selector)
        return element.textContent
    }

    // Get element attribute
    async getAttribute(selector, name) {
        const element = await this.waitForSelector(selector)
        return element.getAttribute(name)
    }

    // Check if element is visible
    async isVisible(selector) {
        try {
            const element = await this.waitForSelector(selector, { timeout: 1000 })
            const rect = element.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
        } catch (error) {
            return false
        }
    }

    // Check if element is enabled
    async isEnabled(selector) {
        try {
            const element = await this.waitForSelector(selector, { timeout: 1000 })
            return !element.disabled
        } catch (error) {
            return false
        }
    }

    // Fill input field
    async fill(selector, value, options = {}) {
        const element = await this.waitForSelector(selector, options)
        console.log(`📝 Filling "${value}" into ${selector}`)
        
        // Click on the element first to focus it properly
        await this.click(selector, options)
        
        // Clear and fill value
        element.value = value
        
        // Dispatch events
        const inputEvent = new Event('input', { bubbles: true })
        const changeEvent = new Event('change', { bubbles: true })
        element.dispatchEvent(inputEvent)
        element.dispatchEvent(changeEvent)
    }

    // Select option from dropdown
    async selectOption(selector, value, options = {}) {
        const element = await this.waitForSelector(selector, options)
        console.log(`📋 Selecting option "${value}" from ${selector}`)
        
        element.value = value
        const changeEvent = new Event('change', { bubbles: true })
        element.dispatchEvent(changeEvent)
    }

    // Check/uncheck checkbox
    async check(selector, options = {}) {
        const element = await this.waitForSelector(selector, options)
        console.log(`☑️  Checking ${selector}`)
        
        if (!element.checked) {
            element.click()
        }
    }

    async uncheck(selector, options = {}) {
        const element = await this.waitForSelector(selector, options)
        console.log(`☐ Unchecking ${selector}`)
        
        if (element.checked) {
            element.click()
        }
    }

    // Hover over element
    async hover(selector, options = {}) {
        const element = await this.waitForSelector(selector, options)
        const rect = element.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        
        console.log(`🎯 Hovering over ${selector} at (${x}, ${y})`)
        
        // Use the mouse move method to get realistic movement and hover triggering
        const mouse = await this.mouse()
        await mouse.move(x, y)
        
        // Give a moment for hover effects to be visible
        await this.wait(200)
    }
}

// Export the testing framework
export { InBrowserTestingFramework, BrowserPage }

// Create and export a default instance
const testFramework = new InBrowserTestingFramework()
window.testFramework = testFramework // Make available globally for mouse tracking

export default testFramework 
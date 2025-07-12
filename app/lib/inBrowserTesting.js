// In-Browser Testing Framework
// Playwright-like API that runs entirely within the browser without external dependencies
// Includes visual feedback for mouse movements and clicks

import TestPanel from '../components/TestPanel.svelte'
import { mount, unmount } from 'svelte'

class InBrowserTestingFramework {
    constructor() {
        this.tests = []
        this.results = []
        this.isRunning = false
        this.mouseTracker = null
        this.clickIndicators = []
        this.currentHoverElement = null
        this.testPanel = null
        this.testPanelComponent = null
        this.currentTestName = null
        this.originalConsoleError = null
        this.consoleErrors = []
        this.isClicking = false
        this.isHumanTime = true
        this.isManualMode = false
        this.isPaused = false
        this.isStopped = false
        this.setupMouseTracking()
        this.setupClickVisualization()
        this.setupHoverSimulation()
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

        // Track actual mouse movements - only in manual mode
        this.realMouseHandler = (event) => {
            if (!this.isRunning) return
            // Only move the virtual mouse tracker with real mouse in manual mode
            if (this.isManualMode) {
                this.mouseTracker.style.left = (event.clientX - 8) + 'px'
                this.mouseTracker.style.top = (event.clientY - 8) + 'px'
                this.mouseTracker.style.display = 'block'
            }
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
            
            .test-found-element {
                box-shadow: 0 0 20px rgba(16, 185, 129, 0.6), 0 0 0 3px rgba(16, 185, 129, 0.8) !important;
                animation: foundPulse 2s ease-in-out !important;
                position: relative !important;
                z-index: 999999 !important;
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
            
            @keyframes foundPulse {
                0% {
                    opacity: 1;
                    transform: scale(1);
                }
                50% {
                    opacity: 0.8;
                    transform: scale(1.05);
                }
                100% {
                    opacity: 1;
                    transform: scale(1);
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

    // Setup console error tracking
    setupConsoleErrorTracking() {
        if (this.originalConsoleError) return // Already setup
        
        this.originalConsoleError = window.console.error
        this.consoleErrors = []
        
        window.console.error = (...args) => {
            // Store error details
            const errorMessage = args.map(arg => 
                typeof arg === 'string' ? arg : JSON.stringify(arg)
            ).join(' ')
            
            const errorInfo = {
                message: errorMessage,
                timestamp: new Date().toISOString(),
                stack: new Error().stack,
                args: args
            }
            
            this.consoleErrors.push(errorInfo)
            
            // Log to test panel
            if (this.testPanel) {
                this.testPanel.addAction('❌ Console Error', errorMessage)
            }
            
            // Call original console.error
            this.originalConsoleError.apply(console, args)
        }
        
        console.log('🔍 Console error tracking enabled')
    }

    // Teardown console error tracking
    teardownConsoleErrorTracking() {
        if (this.originalConsoleError) {
            window.console.error = this.originalConsoleError
            this.originalConsoleError = null
            console.log('🔍 Console error tracking disabled')
        }
    }

    // Clear console errors for a test
    clearConsoleErrors() {
        this.consoleErrors = []
    }

    // Check if there are console errors for current test
    hasConsoleErrors() {
        return this.consoleErrors.length > 0
    }

    // Get console errors for current test
    getConsoleErrors() {
        return [...this.consoleErrors]
    }

    // Set human time mode
    setHumanTime(enabled) {
        this.isHumanTime = enabled
        console.log(`🎯 Speed mode: ${enabled ? 'SLOW (realistic speed)' : 'FAST (maximum speed)'}`)
        
        // Update test panel with mode change
        if (this.testPanel) {
            this.testPanel.addAction('⚙️ Mode Change', `${enabled ? 'Slow' : 'Fast'} mode enabled`)
        }
    }

    // Set manual mode
    setManualMode(enabled) {
        this.isManualMode = enabled
        console.log(`👤 Manual mode: ${enabled ? 'ON (manual control)' : 'OFF (automated)'}`)
        
        // Update test panel with mode change
        if (this.testPanel) {
            this.testPanel.addAction('⚙️ Mode Change', `${enabled ? 'Manual' : 'Auto'} mode enabled`)
        }
    }

    // Pause tests
    async pauseTests() {
        this.isPaused = true
        console.log('⏸️ Tests paused')
        
        if (this.testPanel) {
            this.testPanel.addAction('⏸️ Tests Paused', 'Test execution paused by user')
            this.testPanel.setPaused(true)
        }
    }

    // Stop tests
    async stopTests() {
        this.isStopped = true
        this.isRunning = false
        this.isPaused = false
        console.log('⏹️ Tests stopped')
        
        // Hide mouse tracker
        if (this.mouseTracker) {
            this.mouseTracker.style.display = 'none'
        }
        
        // Clear hover state
        if (this.currentHoverElement && this.currentHoverElement.isConnected) {
            this.currentHoverElement.classList.remove('hover-xe')
            this.currentHoverElement = null
        }
        
        if (this.testPanel) {
            this.testPanel.addAction('⏹️ Tests Stopped', 'Test execution stopped by user')
            this.testPanel.setRunning(false)
            this.testPanel.setPaused(false)
        }
    }

    // Manage hover state
    updateHoverState(element) {
        // Only update hover state if we're actually running tests
        if (!this.isRunning) {
            console.log('🔧 updateHoverState: Not running, skipping')
            return
        }
        
        // Don't update hover state during click operations to prevent glitches
        if (this.isClicking) {
            console.log('🔧 updateHoverState: Currently clicking, skipping hover update')
            return
        }
        
        // Skip if this is a test indicator element
        if (element && (element.classList.contains('test-click-indicator') || element.classList.contains('test-found-indicator'))) {
            console.log('🔧 updateHoverState: Skipping test indicator element')
            return
        }
        
        // Log current state
        const elementInfo = element ? (element.tagName + (element.id ? '#' + element.id : '') + (element.className ? '.' + String(element.className).split(' ').join('.') : '')) : 'null'
        const currentInfo = this.currentHoverElement ? (this.currentHoverElement.tagName + (this.currentHoverElement.id ? '#' + this.currentHoverElement.id : '') + (this.currentHoverElement.className ? '.' + String(this.currentHoverElement.className).split(' ').join('.') : '')) : 'null'
        
        console.log(`🔧 updateHoverState: Changing from ${currentInfo} to ${elementInfo}`)
        
        // Remove hover class from previous element only if we're changing to a different element
        if (this.currentHoverElement && this.currentHoverElement !== element && this.currentHoverElement.isConnected) {
            console.log(`🔧 updateHoverState: Removing hover-xe from ${currentInfo}`)
            this.currentHoverElement.classList.remove('hover-xe')
        }
        
        // Add hover class to new element
        if (element && element !== this.currentHoverElement && element.isConnected) {
            console.log(`🔧 updateHoverState: Adding hover-xe to ${elementInfo}`)
            element.classList.add('hover-xe')
        }
        
        this.currentHoverElement = element
    }

    // Register the Svelte test panel component
    registerPanel(panelMethods) {
        console.log('📋 Test panel registering with methods:', Object.keys(panelMethods))
        this.testPanel = panelMethods
        console.log('✅ Test panel registered successfully')
    }

    // Restart all tests
    async restartAllTests() {
        // If paused, resume instead of restart
        if (this.isPaused) {
            this.isPaused = false
            console.log('▶️ Resuming tests...')
            
            if (this.testPanel) {
                this.testPanel.addAction('▶️ Tests Resumed', 'Test execution resumed')
                this.testPanel.setPaused(false)
            }
            return
        }
        
        console.log('🔄 Restarting all tests...')
        
        // Reset states
        this.isPaused = false
        this.isStopped = false
        
        // Clear current results and console errors
        this.results = []
        this.clearConsoleErrors()
        
        // Clear test panel and reset current test
        if (this.testPanel) {
            this.testPanel.updateTest(null) // Clear current test and actions
            this.testPanel.addAction('🔄 Restarting All Tests', 'Clearing results and reinitializing')
        }
        
        // Reset current test name
        this.currentTestName = null
        
        // Run all tests again
        return await this.runAll()
    }

    // Restart a specific test by name
    async restartTest(testName) {
        console.log(`🔄 Restarting test: ${testName}`)
        
        // Find the test
        const test = this.tests.find(t => t.name === testName)
        if (!test) {
            console.error(`❌ Test not found: ${testName}`)
            return
        }
        
        // Remove old result for this test
        this.results = this.results.filter(r => r.name !== testName)
        
        // Setup test environment
        this.isRunning = true
        
        // Setup console error tracking if not already active
        this.setupConsoleErrorTracking()
        
        // Set running state in test panel
        if (this.testPanel && this.testPanel.setRunning) {
            this.testPanel.setRunning(true)
        }
        
        // Clear actions for this test and update
        if (this.testPanel) {
            this.testPanel.updateTest(testName) // This clears actions
        }
        
        this.updateTestPanel(testName, '🔄 Restarting Test', 'Reinitializing test environment')
        
        try {
            console.log(`🔍 Rerunning test: ${testName}`)
            
            // Clear console errors for this test
            this.clearConsoleErrors()
            
            const page = new BrowserPage()
            page.framework = this
            window.testFramework = this
            
            await test.testFn(page)
            
            // Check for console errors after test execution
            if (this.hasConsoleErrors()) {
                const errors = this.getConsoleErrors()
                const errorMessages = errors.map(e => e.message).join('; ')
                throw new Error(`Test failed due to console errors: ${errorMessages}`)
            }
            
            console.log(`✅ Test passed: ${testName}`)
            this.updateTestPanel(testName, '✅ Test Passed', 'All assertions successful')
            this.results.push({ name: testName, status: 'passed' })
            
        } catch (error) {
            console.error(`❌ Test failed: ${testName}`, error)
            this.updateTestPanel(testName, '❌ Test Failed', error.message)
            this.results.push({ name: testName, status: 'failed', error: error.message })
        } finally {
            this.isRunning = false
            this.mouseTracker.style.display = 'none'
            
            // Clear hover state when test finishes
            if (this.currentHoverElement && this.currentHoverElement.isConnected) {
                this.currentHoverElement.classList.remove('hover-xe')
                this.currentHoverElement = null
            }
            
            // Clear running state in test panel
            if (this.testPanel && this.testPanel.setRunning) {
                this.testPanel.setRunning(false)
            }
        }
        
        return this.results.find(r => r.name === testName)
    }

    // Mount the test panel to dev mode mount point
    async setupTestPanel() {
        if (this.testPanelComponent) {
            console.log('✅ Test panel already loaded')
            return // Already loaded
        }
        
        try {
            // Find the mount point provided by App.svelte in dev mode
            const mountPoint = document.getElementById('test-panel-mount')
            if (!mountPoint) {
                console.error('❌ Test panel mount point not found. Make sure dev mode is enabled.')
                return
            }
            
            // Mount the component
            this.testPanelComponent = mount(TestPanel, {
                target: mountPoint,
                props: {
                    testFramework: this
                }
            })
            
            // Wait a bit for the component to mount and register
            await new Promise(resolve => setTimeout(resolve, 100))
            
            console.log('✅ Test panel loaded and mounted (ready to run tests)')
        } catch (error) {
            console.error('❌ Failed to load test panel:', error)
        }
    }
    


    // Get region name for coordinates
    getRegionName(x, y) {
        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const centerX = viewport.width / 2
        const centerY = viewport.height / 2
        const margin = 50 // Pixels from edge to consider "edge"
        
        // Determine horizontal position
        let horizontal = 'center'
        if (x < margin) horizontal = 'left edge'
        else if (x > viewport.width - margin) horizontal = 'right edge'
        else if (x < viewport.width / 3) horizontal = 'left side'
        else if (x > viewport.width * 2 / 3) horizontal = 'right side'
        
        // Determine vertical position
        let vertical = 'center'
        if (y < margin) vertical = 'top'
        else if (y > viewport.height - margin) vertical = 'bottom'
        else if (y < viewport.height / 3) vertical = 'upper'
        else if (y > viewport.height * 2 / 3) vertical = 'lower'
        
        // Combine for descriptive region names
        if (horizontal === 'center' && vertical === 'center') return 'center of screen'
        if (horizontal === 'left edge' && vertical === 'top') return 'top left corner'
        if (horizontal === 'right edge' && vertical === 'top') return 'top right corner'
        if (horizontal === 'left edge' && vertical === 'bottom') return 'bottom left corner'
        if (horizontal === 'right edge' && vertical === 'bottom') return 'bottom right corner'
        if (vertical === 'top') return `top of screen (${horizontal})`
        if (vertical === 'bottom') return `bottom of screen (${horizontal})`
        if (horizontal === 'left edge') return 'left edge of screen'
        if (horizontal === 'right edge') return 'right edge of screen'
        
        return `${vertical} ${horizontal} of screen`
    }

    // Convert region name to coordinates
    getRegionCoordinates(regionName) {
        if (!regionName) {
            throw new Error('regionName cannot be null, undefined, or empty')
        }
        
        if (typeof regionName !== 'string') {
            throw new Error(`regionName must be a string, got ${typeof regionName}`)
        }
        
        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const centerX = viewport.width / 2
        const centerY = viewport.height / 2
        const margin = 50 // Same margin as in getRegionName
        
        // Normalize region name
        const normalizedRegion = regionName.toLowerCase().trim()
        
        // Map region names to coordinates
        const regionMap = {
            'center': [centerX, centerY],
            'center of screen': [centerX, centerY],
            'left edge': [margin / 2, centerY],
            'left edge of screen': [margin / 2, centerY],
            'right edge': [viewport.width - margin / 2, centerY],
            'right edge of screen': [viewport.width - margin / 2, centerY],
            'top': [centerX, margin / 2],
            'top of screen': [centerX, margin / 2],
            'bottom': [centerX, viewport.height - margin / 2],
            'bottom of screen': [centerX, viewport.height - margin / 2],
            'top left corner': [margin / 2, margin / 2],
            'top right corner': [viewport.width - margin / 2, margin / 2],
            'bottom left corner': [margin / 2, viewport.height - margin / 2],
            'bottom right corner': [viewport.width - margin / 2, viewport.height - margin / 2],
            'left side': [viewport.width / 6, centerY],
            'right side': [viewport.width * 5 / 6, centerY],
            'upper center': [centerX, viewport.height / 6],
            'lower center': [centerX, viewport.height * 5 / 6]
        }
        
        const coordinates = regionMap[normalizedRegion]
        if (!coordinates) {
            throw new Error(`Unknown region name: "${regionName}". Available regions: ${Object.keys(regionMap).join(', ')}`)
        }
        
        return coordinates
    }

    // Convert region name to area constraint function
    getRegionConstraint(regionName) {
        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const margin = 50 // Same margin as in getRegionName
        
        // Normalize region name
        const normalizedRegion = regionName.toLowerCase().trim()
        
        // Map region names to constraint functions
        const constraintMap = {
            'center': (rect) => {
                const centerX = viewport.width / 2
                const centerY = viewport.height / 2
                const threshold = 100 // pixels from center
                return Math.abs(rect.left + rect.width / 2 - centerX) < threshold && 
                       Math.abs(rect.top + rect.height / 2 - centerY) < threshold
            },
            'left third': (rect) => {
                const leftThirdEnd = viewport.width / 3
                const result = rect.left < leftThirdEnd
                if (this.isRunning) {
                    console.log(`🔍 Left third check: element at ${rect.left}, threshold ${leftThirdEnd}, result: ${result}`)
                }
                return result
            },
            'right third': (rect) => {
                const rightThirdStart = viewport.width * 2 / 3
                const result = rect.left >= rightThirdStart
                if (this.isRunning) {
                    console.log(`🔍 Right third check: element at ${rect.left}, threshold ${rightThirdStart}, result: ${result}`)
                }
                return result
            },
            'center third': (rect) => {
                const leftThirdEnd = viewport.width / 3
                const rightThirdStart = viewport.width * 2 / 3
                const result = rect.left >= leftThirdEnd && rect.left < rightThirdStart
                if (this.isRunning) {
                    console.log(`🔍 Center third check: element at ${rect.left}, range ${leftThirdEnd}-${rightThirdStart}, result: ${result}`)
                }
                return result
            },
            'left half': (rect) => {
                const halfWidth = viewport.width / 2
                return rect.left < halfWidth
            },
            'right half': (rect) => {
                const halfWidth = viewport.width / 2
                return rect.left >= halfWidth
            },
            'upper third': (rect) => {
                const upperThirdEnd = viewport.height / 3
                return rect.top < upperThirdEnd
            },
            'lower third': (rect) => {
                const lowerThirdStart = viewport.height * 2 / 3
                return rect.top >= lowerThirdStart
            },
            'center vertical third': (rect) => {
                const upperThirdEnd = viewport.height / 3
                const lowerThirdStart = viewport.height * 2 / 3
                return rect.top >= upperThirdEnd && rect.top < lowerThirdStart
            },
            'left edge': (rect) => rect.left < margin,
            'right edge': (rect) => rect.left > viewport.width - margin,
            'top edge': (rect) => rect.top < margin,
            'bottom edge': (rect) => rect.top > viewport.height - margin,
            'top left corner': (rect) => rect.left < margin && rect.top < margin,
            'top right corner': (rect) => rect.left > viewport.width - margin && rect.top < margin,
            'bottom left corner': (rect) => rect.left < margin && rect.top > viewport.height - margin,
            'bottom right corner': (rect) => rect.left > viewport.width - margin && rect.top > viewport.height - margin
        }
        
        const constraint = constraintMap[normalizedRegion]
        if (!constraint) {
            throw new Error(`Unknown region name: "${regionName}". Available regions: ${Object.keys(constraintMap).join(', ')}`)
        }
        
        return constraint
    }

    // Update test panel with current test info
    updateTestPanel(testName, action, details = '') {
        if (!this.testPanel) {
            console.warn('Test panel not registered!')
            return
        }
        
        // Update current test name
        if (testName && testName !== this.currentTestName) {
            this.currentTestName = testName
            this.testPanel.updateTest(testName)
        }
        
        // Add action
        if (action) {
            this.testPanel.addAction(action, details)
        }
    }

    // Show test panel
    showTestPanel() {
        console.log('🔍 showTestPanel called, testPanel exists:', !!this.testPanel)
        if (this.testPanel) {
            console.log('📱 Calling testPanel.show()')
            this.testPanel.show()
        } else {
            console.warn('❌ Test panel not loaded yet')
        }
    }

    // Hide test panel
    hideTestPanel() {
        if (this.testPanel) {
            this.testPanel.hide()
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

    // Add visual found element indicator
    showFoundIndicator(element) {
        if (!element || !element.isConnected) {
            console.warn('Cannot show found indicator: element is null or not connected to DOM')
            return
        }
        
        const elementInfo = element.tagName + (element.id ? '#' + element.id : '') + (element.className ? '.' + String(element.className).split(' ').join('.') : '')
        console.log(`🔧 showFoundIndicator: Adding highlight class to ${elementInfo}`)
        
        // Add the CSS class directly to the element
        element.classList.add('test-found-element')
        
        // Remove the class after animation duration
        setTimeout(() => {
            if (element.isConnected) {
                element.classList.remove('test-found-element')
                console.log(`🔧 showFoundIndicator: Removed highlight class from ${elementInfo}`)
            }
        }, 2000)
    }

    // Add a test to the suite
    test(name, testFn) {
        this.tests.push({ name, testFn })
        return this
    }

    // Run all tests
    async runAll() {
        this.isRunning = true
        this.isPaused = false
        this.isStopped = false
        this.results = []
        
        // Setup console error tracking and clear any existing errors
        this.setupConsoleErrorTracking()
        this.clearConsoleErrors()
        
        // Dynamically load and show test panel
        await this.setupTestPanel()
        this.showTestPanel()
        
        // Set running state in test panel
        if (this.testPanel && this.testPanel.setRunning) {
            this.testPanel.setRunning(true)
        }
        
        // Only clear current test if we're starting fresh (not restarting)
        if (!this.currentTestName) {
            this.updateTestPanel(null, '🚀 Starting Test Suite', `Running ${this.tests.length} test(s)`)
        } else {
            this.updateTestPanel(this.currentTestName, '🚀 Starting Test Suite', `Running ${this.tests.length} test(s)`)
        }
        
        console.log(`🧪 Starting in-browser test suite with ${this.tests.length} test(s)...`)
        console.log('🎯 Visual feedback enabled - mouse movements and clicks will be highlighted')
        
        for (const { name, testFn } of this.tests) {
            // Check if tests were stopped
            if (this.isStopped) {
                console.log('⏹️ Test execution stopped by user')
                break
            }
            
            // Wait while paused
            while (this.isPaused && !this.isStopped) {
                await new Promise(resolve => setTimeout(resolve, 100))
            }
            
            // Check again if stopped after pause
            if (this.isStopped) {
                console.log('⏹️ Test execution stopped by user')
                break
            }
            
            try {
                console.log(`🔍 Running test: ${name}`)
                this.updateTestPanel(name, '🔍 Test Started', 'Initializing test environment')
                
                // Clear console errors for this test
                this.clearConsoleErrors()
                
                const page = new BrowserPage()
                page.framework = this // Give page access to framework for logging
                // Also set global reference for components that need it
                window.testFramework = this
                await testFn(page)
                
                // Check for console errors after test execution
                if (this.hasConsoleErrors()) {
                    const errors = this.getConsoleErrors()
                    const errorMessages = errors.map(e => e.message).join('; ')
                    throw new Error(`Test failed due to console errors: ${errorMessages}`)
                }
                
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
        
        // Clear hover state when tests finish
        if (this.currentHoverElement && this.currentHoverElement.isConnected) {
            this.currentHoverElement.classList.remove('hover-xe')
            this.currentHoverElement = null
        }
        
        // Teardown console error tracking
        this.teardownConsoleErrorTracking()
        
        // Clear running state in test panel
        if (this.testPanel && this.testPanel.setRunning) {
            this.testPanel.setRunning(false)
        }
        
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
        
        // Keep panel visible after completion (user can manually close it)
        
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
        // Teardown console error tracking
        this.teardownConsoleErrorTracking()
        
        if (this.testPanelComponent) {
            unmount(this.testPanelComponent)
            this.testPanelComponent = null
            this.testPanel = null
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
        this.initializeMouseTracker()
        
        // Initialize mouse actions
        this.initializeMouse()
    }
    
    // Initialize mouse position and visual tracker
    initializeMouseTracker() {
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

    // Mouse actions with visual feedback - initialize in constructor
    initializeMouse() {
        const page = this // Reference to page instance
        
        this.mouse = {
            move: async (targetOrOptions, targetY) => {
                let targetX, regionName
                
                // Handle region-based API: mouse.move({ regionName: 'right edge' })
                if (typeof targetOrOptions === 'object' && targetOrOptions.regionName) {
                    if (!targetOrOptions.regionName) {
                        throw new Error('regionName cannot be null or undefined')
                    }
                    if (!page.framework) {
                        throw new Error('Framework not available for region-based mouse movement')
                    }
                    const coordinates = page.framework.getRegionCoordinates(targetOrOptions.regionName)
                    targetX = coordinates[0]
                    targetY = coordinates[1]
                    regionName = targetOrOptions.regionName
                    
                    // Validate region coordinates
                    if (!isFinite(targetX) || !isFinite(targetY)) {
                        throw new Error(`Invalid region coordinates: (${targetX}, ${targetY}) for region: ${regionName}`)
                    }
                } else {
                    // Handle coordinate-based API: mouse.move(x, y)
                    targetX = targetOrOptions
                    regionName = page.framework ? page.framework.getRegionName(targetX, targetY) : `(${targetX}, ${targetY})`
                }
                
                console.log(`🖱️  Moving mouse from (${page.currentMouseX}, ${page.currentMouseY}) to (${targetX}, ${targetY})`)
                
                // Log to test panel
                if (page.framework) {
                    page.framework.updateTestPanel(null, '🖱️ Mouse Move', `Moving to ${regionName}`)
                }
                
                // Handle manual mode - show the action and wait for manual mouse movement
                if (page.framework && page.framework.isManualMode) {
                    console.log(`👤 Manual Mode: Please move mouse to ${regionName} manually`)
                    
                    if (page.framework.testPanel) {
                        page.framework.testPanel.addAction('👤 Manual Mouse Move Required', `Move mouse to ${regionName} manually`)
                    }
                    
                    // Wait for manual mouse movement to the target area
                    await page.waitForManualMouseMove(targetX, targetY, regionName)
                    return
                }
                
                // Calculate movement path with curve and easing
                // Use different speeds based on mode
                const steps = page.framework.isHumanTime ? 30 : 5 // Number of animation steps
                const duration = page.framework.isHumanTime ? 800 : 100 // Total duration in ms
                const stepDuration = duration / steps
                
                for (let i = 0; i <= steps; i++) {
                    const progress = i / steps
                    
                    // Easing function (ease-in-out)
                    const easeInOut = progress < 0.5 
                        ? 2 * progress * progress 
                        : 1 - Math.pow(-2 * progress + 2, 3) / 2
                    
                    // Calculate position with smooth direct movement (removed curve to fix up-down bug)
                    const x = page.currentMouseX + (targetX - page.currentMouseX) * easeInOut
                    const y = page.currentMouseY + (targetY - page.currentMouseY) * easeInOut
                    
                    // Update visual tracker
                    if (page.framework && page.framework.mouseTracker) {
                        page.framework.mouseTracker.style.left = (x - 8) + 'px'
                        page.framework.mouseTracker.style.top = (y - 8) + 'px'
                        page.framework.mouseTracker.style.display = 'block'
                    }
                    
                    // Update page's current position
                    page.currentMouseX = x
                    page.currentMouseY = y
                    
                    // Validate coordinates before using elementFromPoint
                    if (!isFinite(x) || !isFinite(y)) {
                        console.warn(`Invalid coordinates for elementFromPoint: (${x}, ${y})`)
                        continue
                    }
                    
                    // Find element at current position and manage hover state
                    const element = document.elementFromPoint(x, y)
                    if (element) {
                        // Update hover state using framework
                        if (page.framework) {
                            console.log(`🔧 MouseMove: Element at (${x}, ${y}):`, element.tagName + (element.id ? '#' + element.id : ''))
                            page.framework.updateHoverState(element)
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
            
            click: async (targetXOrElement, targetY) => {
                let targetElement = null
                let targetX, finalClickX, finalClickY
                
                // Check if first parameter is a selector string
                if (typeof targetXOrElement === 'string') {
                    // First parameter is a selector string
                    targetElement = await page.waitForSelector(targetXOrElement)
                    
                    // Verify element still exists and is connected to DOM
                    if (!targetElement.isConnected) {
                        throw new Error('Target element is no longer connected to the DOM')
                    }
                    
                    // Calculate initial position from element
                    const rect = targetElement.getBoundingClientRect()
                    targetX = rect.left + rect.width / 2
                    targetY = rect.top + rect.height / 2
                    
                    // Validate calculated coordinates
                    if (!isFinite(targetX) || !isFinite(targetY)) {
                        throw new Error(`Invalid element coordinates: (${targetX}, ${targetY}) from rect: ${JSON.stringify(rect)}`)
                    }
                    
                    console.log(`🖱️  Clicking element: ${targetXOrElement} at calculated position (${targetX}, ${targetY})`)
                } else if (targetXOrElement && typeof targetXOrElement === 'object' && targetXOrElement.nodeType === 1) {
                    // First parameter is an element
                    targetElement = targetXOrElement
                    
                    // Verify element still exists and is connected to DOM
                    if (!targetElement.isConnected) {
                        throw new Error('Target element is no longer connected to the DOM')
                    }
                    
                    // Calculate initial position from element
                    const rect = targetElement.getBoundingClientRect()
                    targetX = rect.left + rect.width / 2
                    targetY = rect.top + rect.height / 2
                    
                    // Validate calculated coordinates
                    if (!isFinite(targetX) || !isFinite(targetY)) {
                        throw new Error(`Invalid element coordinates: (${targetX}, ${targetY}) from rect: ${JSON.stringify(rect)}`)
                    }
                    
                    console.log(`🖱️  Clicking element: ${targetElement.tagName.toLowerCase()} at calculated position (${targetX}, ${targetY})`)
                } else {
                    // First parameter is X coordinate
                    targetX = targetXOrElement
                    console.log(`🖱️  Clicking at coordinates: (${targetX}, ${targetY})`)
                }
                
                // First move to the target position if not already there
                if (page.currentMouseX !== targetX || page.currentMouseY !== targetY) {
                    await page.mouse.move(targetX, targetY)
                }
                
                // Handle manual mode - show the action and wait for manual input
                if (page.framework && page.framework.isManualMode) {
                    const elementInfo = targetElement ? 
                        (targetElement.title || targetElement.getAttribute('aria-label') || targetElement.textContent?.trim() || targetElement.tagName.toLowerCase()) : 
                        'unknown element'
                    
                    console.log(`👤 Manual Mode: Please click on "${elementInfo}" manually`)
                    
                    if (page.framework.testPanel) {
                        page.framework.testPanel.addAction('👤 Manual Click Required', `Click on "${elementInfo}" manually`)
                    }
                    
                    // Wait for manual click on the target element
                    await page.waitForManualClick(targetElement || document.elementFromPoint(targetX, targetY))
                    return
                }
                
                // If we have a target element, always get fresh position right before clicking
                if (targetElement) {
                    // Verify element still exists and is connected to DOM
                    if (!targetElement.isConnected) {
                        throw new Error('Target element was removed from DOM before click could be executed')
                    }
                    
                    // Always get the most current position right before clicking
                    const freshRect = targetElement.getBoundingClientRect()
                    finalClickX = freshRect.left + freshRect.width / 2
                    finalClickY = freshRect.top + freshRect.height / 2
                    
                    // Validate fresh coordinates
                    if (!isFinite(finalClickX) || !isFinite(finalClickY)) {
                        throw new Error(`Invalid fresh coordinates: (${finalClickX}, ${finalClickY}) from rect: ${JSON.stringify(freshRect)}`)
                    }
                    
                    // Always move mouse to the fresh position (no threshold check)
                    console.log(`🖱️  Moving to fresh element position: (${finalClickX}, ${finalClickY})`)
                    await page.mouse.move(finalClickX, finalClickY)
                    
                    // Show updated found indicator at new position
                    if (page.framework) {
                        page.framework.showFoundIndicator(targetElement)
                    }
                    
                    // Small delay to ensure mouse position is updated
                    await page.wait(50)
                    
                    // Get the position one final time right before clicking
                    const finalRect = targetElement.getBoundingClientRect()
                    finalClickX = finalRect.left + finalRect.width / 2
                    finalClickY = finalRect.top + finalRect.height / 2
                    
                    // Validate final coordinates
                    if (!isFinite(finalClickX) || !isFinite(finalClickY)) {
                        throw new Error(`Invalid final coordinates: (${finalClickX}, ${finalClickY}) from rect: ${JSON.stringify(finalRect)}`)
                    }
                    
                                    // Update current mouse position to match final click position
                page.currentMouseX = finalClickX
                page.currentMouseY = finalClickY
                
                // Add delay before clicking in human time mode
                if (page.framework && page.framework.isHumanTime) {
                    await page.wait(20)
                }
                } else {
                    // Use current mouse position for coordinate-based clicks
                    finalClickX = page.currentMouseX
                    finalClickY = page.currentMouseY
                }
                
                // Get element info for better logging
                const elementAtClick = targetElement || document.elementFromPoint(finalClickX, finalClickY)
                const elementInfo = elementAtClick ? 
                    (elementAtClick.title || elementAtClick.getAttribute('aria-label') || elementAtClick.textContent?.trim() || elementAtClick.tagName.toLowerCase()) : 
                    'unknown element'
                const regionName = page.framework ? page.framework.getRegionName(finalClickX, finalClickY) : `(${finalClickX}, ${finalClickY})`
                
                console.log(`🖱️  Executing click at final position: (${finalClickX}, ${finalClickY})`)
                
                // Log to test panel
                if (page.framework) {
                    page.framework.updateTestPanel(null, '🖱️ Mouse Click', `Clicking "${elementInfo}" at ${regionName}`)
                    page.framework.showClickIndicator(finalClickX, finalClickY)
                }
                
                // Validate final click coordinates
                if (!isFinite(finalClickX) || !isFinite(finalClickY)) {
                    throw new Error(`Invalid click coordinates: (${finalClickX}, ${finalClickY})`)
                }
                
                // Find element and click it at final click position
                const element = targetElement || document.elementFromPoint(finalClickX, finalClickY)
                console.log(`🔧 Click: Found element at (${finalClickX}, ${finalClickY}):`, element)
                if (element) {
                    // Set clicking flag to prevent hover state interference
                    if (page.framework) {
                        console.log('🔧 Click: Setting isClicking = true')
                        page.framework.isClicking = true
                    }
                    
                    try {
                        // Preserve hover state during click sequence
                        const wasHovered = element.classList.contains('hover-xe')
                        console.log(`🔧 Click: Element was hovered: ${wasHovered}`)
                        
                        // Dispatch mouse events in proper sequence with proper event details
                        const mouseDown = new MouseEvent('mousedown', {
                            clientX: finalClickX, 
                            clientY: finalClickY, 
                            bubbles: true, 
                            cancelable: true,
                            target: element,
                            button: 0,
                            buttons: 1
                        })
                        const mouseUp = new MouseEvent('mouseup', {
                            clientX: finalClickX, 
                            clientY: finalClickY, 
                            bubbles: true, 
                            cancelable: true,
                            target: element,
                            button: 0,
                            buttons: 0
                        })
                        const clickEvent = new MouseEvent('click', {
                            clientX: finalClickX, 
                            clientY: finalClickY, 
                            bubbles: true, 
                            cancelable: true,
                            target: element,
                            button: 0,
                            buttons: 0
                        })
                        
                        console.log('🔧 Click: Dispatching mousedown')
                        element.dispatchEvent(mouseDown)
                        
                        // Restore hover state if it was lost during mousedown
                        const hasHoverAfterMouseDown = element.classList.contains('hover-xe')
                        console.log(`🔧 Click: After mousedown, element has hover-xe: ${hasHoverAfterMouseDown}`)
                        if (wasHovered && !hasHoverAfterMouseDown) {
                            console.log('🔧 Click: Restoring hover state after mousedown')
                            element.classList.add('hover-xe')
                        }
                        
                        await page.wait(50)
                        console.log('🔧 Click: Dispatching mouseup')
                        element.dispatchEvent(mouseUp)
                        
                        // Restore hover state if it was lost during mouseup
                        const hasHoverAfterMouseUp = element.classList.contains('hover-xe')
                        console.log(`🔧 Click: After mouseup, element has hover-xe: ${hasHoverAfterMouseUp}`)
                        if (wasHovered && !hasHoverAfterMouseUp) {
                            console.log('🔧 Click: Restoring hover state after mouseup')
                            element.classList.add('hover-xe')
                        }
                        
                        await page.wait(50)
                        console.log('🔧 Click: Dispatching click event')
                        element.dispatchEvent(clickEvent)
                        
                        // Final hover state restoration
                        const hasHoverAfterClick = element.classList.contains('hover-xe')
                        console.log(`🔧 Click: After click, element has hover-xe: ${hasHoverAfterClick}`)
                        if (wasHovered && !hasHoverAfterClick) {
                            console.log('🔧 Click: Restoring hover state after click')
                            element.classList.add('hover-xe')
                        }
                        
                        // Focus if focusable
                        if (element.focus && typeof element.focus === 'function') {
                            element.focus()
                        }
                    } finally {
                        // Always clear clicking flag after click sequence completes
                        if (page.framework) {
                            console.log('🔧 Click: Clearing isClicking = false')
                            page.framework.isClicking = false
                        }
                    }
                } else {
                    throw new Error(`No element found at coordinates (${finalClickX}, ${finalClickY})`)
                }
                
                await page.wait(100)
            }
        }
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
                    this.framework.showFoundIndicator(element) // Show found indicator
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

    // Click element by selector or element object
    async click(selectorOrElement, options = {}) {
        let element, description
        
        if (typeof selectorOrElement === 'string') {
            // It's a selector string
            element = await this.waitForSelector(selectorOrElement, options)
            description = selectorOrElement
        } else if (selectorOrElement && typeof selectorOrElement === 'object' && selectorOrElement.nodeType === 1) {
            // It's an element object
            element = selectorOrElement
            description = element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') + (element.className ? '.' + String(element.className).split(' ').join('.') : '')
        } else {
            throw new Error('click() requires either a selector string or an element object')
        }
        
        console.log(`🖱️  Clicking element: ${description}`)
        
        // Use element-based clicking with position rechecking
        await this.mouse.click(element)
    }

    // Type text into element
    async type(selector, text, options = {}) {
        const element = await this.waitForSelector(selector, options)
        console.log(`⌨️  Typing "${text}" into ${selector}`)
        
        // Handle manual mode - show the action and wait for manual input
        if (this.framework && this.framework.isManualMode) {
            console.log(`👤 Manual Mode: Please type "${text}" into ${selector} manually`)
            
            if (this.framework.testPanel) {
                this.framework.testPanel.addAction('👤 Manual Type Required', `Type "${text}" into ${selector} manually`)
            }
            
            // Wait for manual typing by monitoring the element value
            await this.waitForManualType(element, text)
            return
        }
        
        // Focus the element first
        element.focus()
        
        // Clear existing content if specified
        if (options.clear !== false) {
            element.value = ''
        }
        
        // Use different typing speeds based on mode
        const baseDelay = this.framework && this.framework.isHumanTime ? 50 : 10
        const randomDelay = this.framework && this.framework.isHumanTime ? 50 : 10
        
        // Simulate typing character by character
        for (let i = 0; i < text.length; i++) {
            const char = text[i]
            element.value += char
            
            // Dispatch input events
            const inputEvent = new Event('input', { bubbles: true })
            element.dispatchEvent(inputEvent)
            
            await this.wait(baseDelay + Math.random() * randomDelay) // Variable typing speed
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
            
            // Find elements that contain the text, then find the most specific one
            const candidates = elements.filter(el => 
                el.textContent && el.textContent.toLowerCase().includes(text.toLowerCase())
            )
            
            if (candidates.length > 0) {
                // Find the most specific element (one with the shortest textContent that still contains the text)
                // This prevents selecting parent elements that contain the text through their children
                const element = candidates.reduce((best, current) => {
                    const bestTextLength = best.textContent.trim().length
                    const currentTextLength = current.textContent.trim().length
                    
                    // Prefer elements with shorter text content (more specific)
                    // But only if they actually contain the text directly, not just through children
                    const bestDirectText = best.childNodes.length === 1 && best.childNodes[0].nodeType === Node.TEXT_NODE
                    const currentDirectText = current.childNodes.length === 1 && current.childNodes[0].nodeType === Node.TEXT_NODE
                    
                    // Prefer elements that have the text directly in their text node
                    if (currentDirectText && !bestDirectText) {
                        return current
                    }
                    if (bestDirectText && !currentDirectText) {
                        return best
                    }
                    
                    // If both have direct text or both don't, prefer the shorter one
                    return currentTextLength < bestTextLength ? current : best
                })
                
                console.log(`✅ Found element with text: "${text}"`)
                if (this.framework) {
                    this.framework.updateTestPanel(null, '✅ Text Found', `Found: "${text}"`)
                    this.framework.showFoundIndicator(element) // Show found indicator
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

    // Wait for text with custom area constraints
    async waitForTextInArea(text, areaConstraint, options = {}) {
        const timeout = options.timeout || 5000
        const startTime = Date.now()
        const selector = options.selector || '*' // Default to all elements, but allow specifying like 'button'
        
        // Convert region name to constraint function if needed
        let constraintFunction = areaConstraint
        let areaDescription = 'specified area'
        
        if (typeof areaConstraint === 'string') {
            // It's a region name, convert to constraint function
            constraintFunction = this.framework ? this.framework.getRegionConstraint(areaConstraint) : null
            areaDescription = areaConstraint
            
            if (!constraintFunction) {
                throw new Error(`Cannot convert region name "${areaConstraint}" to constraint function - framework not available`)
            }
        }
        
        // Log to test panel
        if (this.framework) {
            this.framework.updateTestPanel(null, '🔍 Wait for Text in Area', `Looking for text: "${text}" in ${selector} elements in ${areaDescription}`)
        }
        
        while (Date.now() - startTime < timeout) {
            const elements = Array.from(document.querySelectorAll(selector))
            
            // Find elements that contain the text and are in the specified area
            const candidates = elements.filter(el => {
                if (!el || !el.isConnected || !el.textContent || !el.textContent.toLowerCase().includes(text.toLowerCase())) {
                    return false
                }
                
                const rect = el.getBoundingClientRect()
                if (rect.width === 0 || rect.height === 0) {
                    return false
                }
                
                // Check area constraint function
                if (constraintFunction && typeof constraintFunction === 'function') {
                    try {
                        return constraintFunction(rect)
                    } catch (error) {
                        console.warn(`Area constraint function failed for element:`, el, error)
                        return false
                    }
                }
                
                return true
            })
            
            if (candidates.length > 0) {
                // Debug logging for multiple candidates
                if (candidates.length > 1) {
                    console.log(`🔍 Found ${candidates.length} ${selector} elements with text "${text}" in ${areaDescription}:`, candidates.map(el => ({
                        element: el,
                        text: el.textContent.trim(),
                        rect: el.getBoundingClientRect()
                    })))
                }
                
                // Find the most specific element (shortest text content)
                const element = candidates.reduce((best, current) => {
                    const bestTextLength = best.textContent.trim().length
                    const currentTextLength = current.textContent.trim().length
                    return currentTextLength < bestTextLength ? current : best
                })
                
                console.log(`✅ Found ${selector} element with text: "${text}" in ${areaDescription}`)
                if (this.framework) {
                    this.framework.updateTestPanel(null, '✅ Text Found in Area', `Found: "${text}" in ${selector} in ${areaDescription}`)
                    this.framework.showFoundIndicator(element)
                }
                return element
            }
            await this.wait(100)
        }
        
        // Better error reporting - show what was found
        const allElements = Array.from(document.querySelectorAll(selector))
        const textMatches = allElements.filter(el => 
            el && el.isConnected && el.textContent && el.textContent.toLowerCase().includes(text.toLowerCase())
        )
        
        if (textMatches.length > 0) {
            console.log(`❌ Found ${textMatches.length} elements with text "${text}" but none in ${areaDescription}:`, textMatches.map(el => ({
                element: el,
                text: el.textContent.trim(),
                rect: el.getBoundingClientRect()
            })))
        }
        
        if (this.framework) {
            this.framework.updateTestPanel(null, '❌ Text Not Found in Area', `Timeout: "${text}" in ${selector} in ${areaDescription}`)
        }
        throw new Error(`${selector} element with text "${text}" not found in ${areaDescription}`)
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
        
        // Check for pause/stop during wait
        const startTime = Date.now()
        while (Date.now() - startTime < ms) {
            // Exit early if stopped
            if (this.framework && this.framework.isStopped) {
                throw new Error('Test stopped by user')
            }
            
            // Pause while tests are paused
            if (this.framework && this.framework.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 100))
                continue
            }
            
            // Wait for remaining time or 100ms, whichever is shorter
            const remainingTime = ms - (Date.now() - startTime)
            const waitTime = Math.min(remainingTime, 100)
            await new Promise(resolve => setTimeout(resolve, waitTime))
        }
    }

    // Wait for manual click on target element
    async waitForManualClick(targetElement) {
        return new Promise((resolve) => {
            if (!targetElement) {
                console.error('No target element provided for manual click')
                resolve()
                return
            }
            
            const elementInfo = targetElement.title || targetElement.getAttribute('aria-label') || targetElement.textContent?.trim() || targetElement.tagName.toLowerCase()
            
            // Show visual indicator for the target element
            if (this.framework) {
                this.framework.showFoundIndicator(targetElement)
            }
            
            // Set up click listener
            const handleClick = (event) => {
                // Check if the clicked element is the target or contains the target
                if (event.target === targetElement || targetElement.contains(event.target) || event.target.contains(targetElement)) {
                    console.log(`👤 Manual click detected on target: ${elementInfo}`)
                    
                    if (this.framework && this.framework.testPanel) {
                        this.framework.testPanel.addAction('✅ Manual Click Completed', `Clicked on "${elementInfo}"`)
                    }
                    
                    document.removeEventListener('click', handleClick, true)
                    resolve()
                }
            }
            
            // Add click listener to capture phase
            document.addEventListener('click', handleClick, true)
            
            console.log(`👤 Waiting for manual click on: ${elementInfo}`)
        })
    }

    // Wait for manual type into element
    async waitForManualType(element, expectedText) {
        return new Promise((resolve) => {
            if (!element) {
                console.error('No element provided for manual type')
                resolve()
                return
            }
            
            // Show visual indicator for the target element
            if (this.framework) {
                this.framework.showFoundIndicator(element)
            }
            
            // Focus the element
            element.focus()
            
            // Set up input listener
            const handleInput = () => {
                const currentValue = element.value
                
                // Check if the current value contains the expected text
                if (currentValue.includes(expectedText)) {
                    console.log(`👤 Manual typing completed: "${currentValue}"`)
                    
                    if (this.framework && this.framework.testPanel) {
                        this.framework.testPanel.addAction('✅ Manual Type Completed', `Typed "${currentValue}"`)
                    }
                    
                    element.removeEventListener('input', handleInput)
                    resolve()
                }
            }
            
            // Add input listener
            element.addEventListener('input', handleInput)
            
            console.log(`👤 Waiting for manual typing of: "${expectedText}"`)
        })
    }

    // Wait for manual mouse movement to target area
    async waitForManualMouseMove(targetX, targetY, regionName) {
        return new Promise((resolve) => {
            const threshold = 100 // Distance threshold in pixels
            
            // Set up mouse move listener
            const handleMouseMove = (event) => {
                const currentX = event.clientX
                const currentY = event.clientY
                
                // Calculate distance from target
                const distance = Math.sqrt(
                    Math.pow(currentX - targetX, 2) + 
                    Math.pow(currentY - targetY, 2)
                )
                
                // Check if mouse is close enough to target
                if (distance <= threshold) {
                    console.log(`👤 Manual mouse move completed to ${regionName}`)
                    
                    if (this.framework && this.framework.testPanel) {
                        this.framework.testPanel.addAction('✅ Manual Mouse Move Completed', `Moved to ${regionName}`)
                    }
                    
                    // Update logical position
                    this.currentMouseX = targetX
                    this.currentMouseY = targetY
                    
                    document.removeEventListener('mousemove', handleMouseMove)
                    resolve()
                }
            }
            
            // Add mouse move listener
            document.addEventListener('mousemove', handleMouseMove)
            
            console.log(`👤 Waiting for manual mouse movement to ${regionName} (within ${threshold}px of target)`)
        })
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
            
            // Check if element exists and is connected to DOM
            if (!element || !element.isConnected) {
                return false
            }
            
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
        
        // Handle manual mode - show the action and wait for manual input
        if (this.framework && this.framework.isManualMode) {
            console.log(`👤 Manual Mode: Please fill "${value}" into ${selector} manually`)
            
            if (this.framework.testPanel) {
                this.framework.testPanel.addAction('👤 Manual Fill Required', `Fill "${value}" into ${selector} manually`)
            }
            
            // Wait for manual typing by monitoring the element value
            await this.waitForManualType(element, value)
            return
        }
        
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
        
        // Verify element still exists and is connected to DOM
        if (!element || !element.isConnected) {
            throw new Error(`Element ${selector} is no longer connected to the DOM`)
        }
        
        const rect = element.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        
        console.log(`🎯 Hovering over ${selector} at (${x}, ${y})`)
        
        // Use the mouse move method to get realistic movement and hover triggering
        await this.mouse.move(x, y)
        
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
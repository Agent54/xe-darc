/**
 * Window Controls API
 * Provides cross-platform window control functionality for PWA and native environments
 */

// Store window state for restore functionality
let windowStateHistory = {
    isMaximized: false,
    isMinimized: false,
    previousState: null,
    minimizedState: null
}

// Get current desktop/screen dimensions
async function getScreenDimensions() {
    try {
        // Try Window Management API (Chrome 100+)
        if (window.screen && window.screen.availWidth && window.screen.availHeight) {
            return {
                width: window.screen.availWidth,
                height: window.screen.availHeight,
                workAreaWidth: window.screen.availWidth,
                workAreaHeight: window.screen.availHeight
            }
        }
        
        // Fallback to basic screen dimensions
        return {
            width: window.screen.width || 1920,
            height: window.screen.height || 1080,
            workAreaWidth: window.screen.width || 1920,
            workAreaHeight: window.screen.height || 1080
        }
    } catch (error) {
        console.warn('Could not get screen dimensions:', error)
        return {
            width: 1920,
            height: 1080,
            workAreaWidth: 1920,
            workAreaHeight: 1080
        }
    }
}

// Golden ratio constant
const GOLDEN_RATIO = 1.618

// Close window
export function closeWindow() {
    if (window.electronAPI?.close) {
        window.electronAPI.close()
    } else if (window.close) {
        window.close()
    }
}

// Minimize window
export async function minimizeWindow() {
    try {
        console.log('Attempting to minimize window...')
        
        // Try Electron API first
        if (window.electronAPI?.minimize) {
            console.log('Using Electron minimize API')
            window.electronAPI.minimize()
            return true
        }
        
        // Try Window Controls Overlay API
        if (window.windowControlsOverlay?.minimize) {
            console.log('Using Window Controls Overlay minimize API')
            window.windowControlsOverlay.minimize()
            return true
        }
        
        if (navigator.windowControlsOverlay?.minimize) {
            console.log('Using Navigator Window Controls Overlay minimize API')
            navigator.windowControlsOverlay.minimize()
            return true
        }
        
        // Try Chrome App API (for Chrome Apps)
        if (window.chrome?.app?.window) {
            console.log('Using Chrome App minimize API')
            const currentWindow = window.chrome.app.window.current()
            if (currentWindow?.minimize) {
                currentWindow.minimize()
                return true
            }
        }
        
        // Try PWA Window Controls API
        if (window.launchQueue && 'windowControlsOverlay' in navigator) {
            console.log('PWA Window Controls detected, trying minimize')
            try {
                // This might work in some PWA contexts
                window.blur()
                return true
            } catch (e) {
                console.log('PWA minimize attempt failed:', e)
            }
        }
        
        // Alternative: Try to "hide" the window by moving it off screen
        if (window.moveTo && window.resizeTo) {
            console.log('Fallback: Moving window off-screen')
            const originalState = {
                x: window.screenX,
                y: window.screenY,
                width: window.outerWidth,
                height: window.outerHeight
            }
            
            // Store state to restore later
            windowStateHistory.minimizedState = originalState
            windowStateHistory.isMinimized = true
            
            // Move window off-screen
            window.moveTo(-10000, -10000)
            window.resizeTo(1, 1)
            
            // Show notification to user
            console.log('Window "minimized" by moving off-screen. This is a fallback method.')
            return true
        }
        
        // Last resort: Just blur focus
        window.blur()
        console.warn('⚠️ True minimize not available. Browser security prevents window minimizing.')
        console.log('📝 To enable minimize:')
        console.log('   • Use as PWA with window controls overlay')
        console.log('   • Use in Electron app')
        console.log('   • Use as Chrome extension with window management permissions')
        
        return false
        
    } catch (error) {
        console.warn('Minimize window failed:', error)
        return false
    }
}

// Save current window state
async function saveCurrentState() {
    if (!windowStateHistory.isMaximized) {
        const x = window.screenLeft ?? window.screenX ?? 0
        const y = window.screenTop ?? window.screenY ?? 0
        
        const state = {
            width: window.outerWidth,
            height: window.outerHeight,
            x: x,
            y: y
        }
        
        console.log('Saving state:', state)
        windowStateHistory.previousState = state
    }
}

// Position verification and retry system
async function verifyAndRetryPosition(targetX, targetY, targetWidth, targetHeight, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        // Wait a moment for the browser to complete the positioning
        await new Promise(resolve => setTimeout(resolve, 100 + (attempt * 50)))
        
        const currentX = window.screenX ?? window.screenLeft
        const currentY = window.screenY ?? window.screenTop
        const currentW = window.outerWidth
        const currentH = window.outerHeight
        
        // Check if position is close enough (within 10 pixels tolerance)
        const positionOk = Math.abs(currentX - targetX) < 10 && Math.abs(currentY - targetY) < 10
        const sizeOk = Math.abs(currentW - targetWidth) < 10 && Math.abs(currentH - targetHeight) < 10
        
        console.log(`Position attempt ${attempt + 1}:`, {
            current: { x: currentX, y: currentY, w: currentW, h: currentH },
            target: { x: targetX, y: targetY, w: targetWidth, h: targetHeight },
            positionOk,
            sizeOk
        })
        
        if (positionOk && sizeOk) {
            console.log('✅ Position verified successfully')
            return true
        }
        
        // Retry positioning
        if (attempt < maxRetries - 1) {
            console.log(`🔄 Retrying position (attempt ${attempt + 2})...`)
            window.moveTo(Math.round(targetX), Math.round(targetY))
            window.resizeTo(Math.round(targetWidth), Math.round(targetHeight))
        }
    }
    
    console.warn('❌ Position verification failed after all retries')
    return false
}

// Restore window to previous state
async function restoreWindow() {
    try {
        if (window.electronAPI?.restore) {
            window.electronAPI.restore()
            windowStateHistory.isMaximized = false
            return
        }
        
        if (document.fullscreenElement) {
            await document.exitFullscreen()
        }
        
        if (windowStateHistory.previousState) {
            const { width, height, x, y } = windowStateHistory.previousState
            console.log('Restoring to:', { width, height, x, y })
            
            if (window.moveTo && window.resizeTo) {
                window.moveTo(Math.round(x), Math.round(y))
                window.resizeTo(Math.round(width), Math.round(height))
                
                // Verify and retry if needed
                await verifyAndRetryPosition(x, y, width, height)
            }
        }
        
        windowStateHistory.isMaximized = false
        
    } catch (error) {
        console.warn('Restore failed:', error.message)
    }
}

// Maximize window to current screen size
export async function maximizeWindow() {
    try {
        // Check if minimized, restore from minimize first
        if (windowStateHistory.isMinimized) {
            await restoreFromMinimize()
            return
        }
        
        // Check if already maximized, then restore
        if (windowStateHistory.isMaximized) {
            await restoreWindow()
            return
        }
        
        // Save current state before maximizing
        await saveCurrentState()
        
        // Try Electron API first
        if (window.electronAPI?.maximize) {
            window.electronAPI.maximize()
            windowStateHistory.isMaximized = true
            return
        }
        
        // Try native window controls overlay API
        if (window.windowControlsOverlay?.maximize) {
            window.windowControlsOverlay.maximize()
            windowStateHistory.isMaximized = true
            return
        }
        
        if (navigator.windowControlsOverlay?.maximize) {
            navigator.windowControlsOverlay.maximize()
            windowStateHistory.isMaximized = true
            return
        }
        
        // Manual maximize using screen dimensions
        const dimensions = await getScreenDimensions()
        
        if (window.resizeTo && window.moveTo) {
            // Move to top-left corner
            window.moveTo(0, 0)
            // Resize to available screen area
            window.resizeTo(dimensions.workAreaWidth, dimensions.workAreaHeight)
            windowStateHistory.isMaximized = true
        } else {
            console.warn('Window resize not supported in this environment')
        }
        
    } catch (error) {
        console.warn('Maximize window failed:', error)
    }
}

// Restore from minimize
async function restoreFromMinimize() {
    try {
        if (windowStateHistory.minimizedState) {
            const { x, y, width, height } = windowStateHistory.minimizedState
            console.log('Restoring from minimize to:', { x, y, width, height })
            
            if (window.moveTo && window.resizeTo) {
                window.moveTo(x, y)
                setTimeout(() => {
                    window.resizeTo(width, height)
                    window.focus()
                    console.log('Restored from minimize')
                }, 50)
            }
        }
        
        windowStateHistory.isMinimized = false
        windowStateHistory.minimizedState = null
    } catch (error) {
        console.warn('Restore from minimize failed:', error)
    }
}

// Window positioning functions
export async function maximizeLeft() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        const halfWidth = Math.round(dimensions.workAreaWidth / 2)
        window.moveTo(0, 0)
        window.resizeTo(halfWidth, dimensions.workAreaHeight)
        
        // Verify positioning
        await verifyAndRetryPosition(0, 0, halfWidth, dimensions.workAreaHeight)
    }
    windowStateHistory.isMaximized = false
}

export async function maximizeRight() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        const halfWidth = Math.round(dimensions.workAreaWidth / 2)
        window.moveTo(halfWidth, 0)
        window.resizeTo(halfWidth, dimensions.workAreaHeight)
        
        // Verify positioning
        await verifyAndRetryPosition(halfWidth, 0, halfWidth, dimensions.workAreaHeight)
    }
    windowStateHistory.isMaximized = false
}

export async function maximizeTop() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        const halfHeight = Math.round(dimensions.workAreaHeight / 2)
        window.moveTo(0, 0)
        window.resizeTo(dimensions.workAreaWidth, halfHeight)
        
        // Verify positioning
        await verifyAndRetryPosition(0, 0, dimensions.workAreaWidth, halfHeight)
    }
    windowStateHistory.isMaximized = false
}

export async function maximizeBottom() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        const halfHeight = Math.round(dimensions.workAreaHeight / 2)
        window.moveTo(0, halfHeight)
        window.resizeTo(dimensions.workAreaWidth, halfHeight)
        
        // Verify positioning
        await verifyAndRetryPosition(0, halfHeight, dimensions.workAreaWidth, halfHeight)
    }
    windowStateHistory.isMaximized = false
}

export async function centerGoldenRatio() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        // Calculate golden ratio dimensions
        const maxWidth = dimensions.workAreaWidth * 0.75
        const maxHeight = dimensions.workAreaHeight * 0.75
        
        let width, height
        
        // Use golden ratio for aspect ratio: width/height = golden ratio
        if (maxWidth / maxHeight > GOLDEN_RATIO) {
            // Height is the constraint
            height = maxHeight
            width = height * GOLDEN_RATIO
        } else {
            // Width is the constraint  
            width = maxWidth
            height = width / GOLDEN_RATIO
        }
        
        // Simply center the window on screen
        const x = Math.round((dimensions.workAreaWidth - width) / 2)
        const y = Math.round((dimensions.workAreaHeight - height) / 2)
        
        window.moveTo(x, y)
        window.resizeTo(Math.round(width), Math.round(height))
        
        // Verify positioning
        await verifyAndRetryPosition(x, y, Math.round(width), Math.round(height))
    }
    windowStateHistory.isMaximized = false
}

export async function bottomRightPane() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        // Quarter size in bottom right
        const width = Math.round(dimensions.workAreaWidth / 3)
        const height = Math.round(dimensions.workAreaHeight / 3)
        const x = Math.round(dimensions.workAreaWidth - width)
        const y = Math.round(dimensions.workAreaHeight - height)
        
        window.moveTo(x, y)
        window.resizeTo(width, height)
        
        // Verify positioning
        await verifyAndRetryPosition(x, y, width, height)
    }
    windowStateHistory.isMaximized = false
}

// Get window state information
export function getWindowState() {
    return {
        isFullscreen: document.fullscreenElement !== null,
        isMaximized: windowStateHistory.isMaximized,
        isMinimized: windowStateHistory.isMinimized,
        dimensions: {
            width: window.outerWidth,
            height: window.outerHeight,
            x: window.screenX,
            y: window.screenY
        },
        screen: {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight
        }
    }
}

// Get just the maximize state for reactive UI
export function isWindowMaximized() {
    return windowStateHistory.isMaximized
}

// Toggle maximize/restore
export async function toggleMaximize() {
    const state = getWindowState()
    
    if (state.isMaximized || state.isFullscreen) {
        // Restore window
        if (document.fullscreenElement) {
            await document.exitFullscreen()
        } else if (window.electronAPI?.restore) {
            window.electronAPI.restore()
        } else {
            // Restore to a reasonable size
            if (window.resizeTo && window.moveTo) {
                window.moveTo(100, 100)
                window.resizeTo(1200, 800)
            }
        }
    } else {
        // Maximize window
        await maximizeWindow()
    }
}

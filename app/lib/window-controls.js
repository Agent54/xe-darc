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
                // Force immediate execution - browsers may ignore rapid calls
                window.moveTo(Math.round(x), Math.round(y))
                window.resizeTo(Math.round(width), Math.round(height))
                
                // Also try with requestAnimationFrame for better browser compatibility
                requestAnimationFrame(() => {
                    window.moveTo(Math.round(x), Math.round(y))
                    window.resizeTo(Math.round(width), Math.round(height))
                })
                
                // Final verification
                setTimeout(() => {
                    const currentX = window.screenX ?? window.screenLeft
                    const currentY = window.screenY ?? window.screenTop
                    console.log('Result:', {
                        current: { x: currentX, y: currentY, w: window.outerWidth, h: window.outerHeight },
                        target: { x, y, w: width, h: height }
                    })
                }, 200)
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
        window.moveTo(0, 0)
        setTimeout(() => window.resizeTo(dimensions.workAreaWidth / 2, dimensions.workAreaHeight), 10)
    }
    windowStateHistory.isMaximized = false // These aren't "maximized" states
}

export async function maximizeRight() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        window.moveTo(dimensions.workAreaWidth / 2, 0)
        setTimeout(() => window.resizeTo(dimensions.workAreaWidth / 2, dimensions.workAreaHeight), 10)
    }
    windowStateHistory.isMaximized = false
}

export async function maximizeTop() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        window.moveTo(0, 0)
        setTimeout(() => window.resizeTo(dimensions.workAreaWidth, dimensions.workAreaHeight / 2), 10)
    }
    windowStateHistory.isMaximized = false
}

export async function maximizeBottom() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        window.moveTo(0, dimensions.workAreaHeight / 2)
        setTimeout(() => window.resizeTo(dimensions.workAreaWidth, dimensions.workAreaHeight / 2), 10)
    }
    windowStateHistory.isMaximized = false
}

export async function centerGoldenRatio() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        // Calculate golden ratio dimensions
        const maxWidth = dimensions.workAreaWidth * 0.8
        const maxHeight = dimensions.workAreaHeight * 0.8
        
        let width, height
        if (maxWidth / maxHeight > GOLDEN_RATIO) {
            height = maxHeight
            width = height * GOLDEN_RATIO
        } else {
            width = maxWidth
            height = width / GOLDEN_RATIO
        }
        
        const x = (dimensions.workAreaWidth - width) / 2
        const y = (dimensions.workAreaHeight - height) / 2
        
        window.moveTo(x, y)
        setTimeout(() => window.resizeTo(width, height), 10)
    }
    windowStateHistory.isMaximized = false
}

export async function bottomRightPane() {
    await saveCurrentState()
    const dimensions = await getScreenDimensions()
    if (window.resizeTo && window.moveTo) {
        // Quarter size in bottom right
        const width = dimensions.workAreaWidth / 3
        const height = dimensions.workAreaHeight / 3
        const x = dimensions.workAreaWidth - width
        const y = dimensions.workAreaHeight - height
        
        window.moveTo(x, y)
        setTimeout(() => window.resizeTo(width, height), 10)
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

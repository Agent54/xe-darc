// Test suite for DARC browser
// Uses the advanced in-browser testing framework with visual feedback

import testFramework from '../app/lib/inBrowserTesting.js'

// Define the main test using the advanced testing framework
testFramework.test('Agent button and search test', async (page) => {
    // Get viewport dimensions
    const viewport = page.viewportSize()
    
    // Calculate very right edge center position
    const rightEdgeX = viewport.width - 1 // Very right edge
    const middleY = viewport.height / 2
    
    console.log(`📏 Viewport: ${viewport.width}x${viewport.height}`)
    console.log(`🎯 Moving to right edge: (${rightEdgeX}, ${middleY})`)
    
    // Move mouse to very right edge in the center with visual feedback
    const mouse = await page.mouse()
    await mouse.move(rightEdgeX, middleY)
    
    // Look for the agent button near the right edge
    let agentButton = null
    
    // Try different ways to find the agent button
    try {
        // First look for button with title="Agent"
        agentButton = document.querySelector('button[title="Agent"], [role="button"][title="Agent"]')
        if (agentButton) {
            console.log('🤖 Found agent button by title attribute')
        } else {
            // Look for button with "Agent" text
            agentButton = await page.waitForText('agent', { timeout: 2000 })
            console.log('🤖 Found agent button by text')
        }
    } catch (error) {
        console.log('⚠️  Agent button not found by text or title, trying other methods...')
        
        // Look for buttons near the right edge
        const rightEdgeButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
            .filter(btn => {
                const rect = btn.getBoundingClientRect()
                return rect.right > viewport.width - 100 && rect.top < viewport.height * 0.75 // Right side, upper 3/4
            })
        
        if (rightEdgeButtons.length > 0) {
            agentButton = rightEdgeButtons[0]
            console.log('🤖 Found button near right edge')
        } else {
            // Look for any button with agent-related attributes
            const agentRelatedButtons = Array.from(document.querySelectorAll('button, [role="button"]'))
                .filter(btn => {
                    const text = (btn.textContent || btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase()
                    const classList = btn.className.toLowerCase()
                    return text.includes('agent') || classList.includes('agent') || 
                           text.includes('ai') || classList.includes('ai') ||
                           text.includes('assistant') || classList.includes('assistant')
                })
            
            if (agentRelatedButtons.length > 0) {
                agentButton = agentRelatedButtons[0]
                console.log('🤖 Found agent-related button')
            }
        }
    }
    
    if (agentButton) {
        // Click the agent button
        const rect = agentButton.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        
        await mouse.click(centerX, centerY)
        console.log('🤖 Clicked agent button')
    } else {
        console.log('⚠️  No agent button found, showing available buttons...')
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
        const buttonInfo = buttons.map(btn => ({
            text: btn.textContent?.trim() || btn.getAttribute('aria-label') || btn.getAttribute('title') || 'No text',
            classes: btn.className,
            position: btn.getBoundingClientRect()
        }))
        console.log('Available buttons:', buttonInfo)
        
        throw new Error('Agent button not found')
    }
    
    // Wait for search button to appear
    await page.wait(1000)
    
    // Look for a button that says "search" (case insensitive)
    const searchButton = await page.waitForText('search', { timeout: 5000 })
    console.log(`🔍 Found search button: ${searchButton.tagName}`)
    
    // Click the search button with visual feedback
    const rect = searchButton.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    
    await mouse.click(centerX, centerY)
    console.log('✅ Clicked search button')
    
    // Wait a moment to see the result
    await page.wait(1000)
})

// Export the runAll function
export async function runAll() {
    return await testFramework.runAll()
}

// Export the test framework for additional functionality
export { testFramework }

// Cleanup function
export function cleanup() {
    if (testFramework) {
        testFramework.cleanup()
    }
} 
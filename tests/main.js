// Test suite for DARC browser
// Uses the advanced in-browser testing framework with visual feedback

import testFramework from '../app/lib/inBrowserTesting.js'

// Define the main test using the advanced testing framework
testFramework.test('Agent button and search test', async (page) => {
    // Move mouse to right edge using named region
    await page.mouse.move({ regionName: 'right edge' })
    
    // Find and click the agent button


    await page.mouse.click('button[title="Agent"]')
    
    // Find search button specifically in the right third of the screen
    const searchButton = await page.waitForTextInArea('search', 'right third', { 
        timeout: 5000,
        selector: 'button' 
    })
    
    // Click the search button using mouse API
    await page.mouse.click(searchButton)
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

// Make runAll available globally for easy testing
if (typeof window !== 'undefined') {
    window.runTests = runAll
    window.restartTests = () => testFramework.restartAllTests()
    window.restartTest = (testName) => testFramework.restartTest(testName)
    window.testFramework = testFramework
    console.log('🧪 Tests available! Run window.runTests() to start the test suite')
    console.log('🔄 Restart available! Run window.restartTests() to restart all tests')
} 
import puppeteer from 'puppeteer'

const CDP_PORT = '8787'
async function listTabs () {
  try {
    // Connect to the CDP proxy running on port 
    console.log('Connecting to CDP proxy on localhost:...', CDP_PORT)
    
    // Connect to browser endpoint
    const browser = await puppeteer.connect({
        browserURL: `http://localhost:${CDP_PORT}`,
    })
    
    console.log('Connected to browser via CDP proxy!')
    
    // Get browser contexts using Puppeteer
    // const contexts = await browser.browserContexts()
    // console.log(`\nBrowser Contexts: ${contexts.length}`)
    
    // Get all targets using Puppeteer
    const targets = await browser.targets()
    console.log(`\nFound ${targets.length} targets:\n`)
    
    // Display information about each target
    for (const [index, target] of targets.entries()) {
      const targetInfo = target._targetInfo || {}
      console.log(`[${index + 1}] ${target.type().toUpperCase()}`)
      console.log(`    Title: ${targetInfo.title || '(no title)'}`)
      console.log(`    URL: ${target.url() || '(no url)'}`)
      console.log(`    ID: ${targetInfo.targetId}`)
      if (targetInfo['xe-meta']) {
        console.log(`    Original Type: ${targetInfo['xe-meta'].originalType}`)
      }
      console.log('')
    }

    await new Promise(resolve => setTimeout(resolve, 10000))

    const targets2 = await browser.targets()
    console.log(`\nFound ${targets.length} targets:\n`)
    
    // Display information about each target
    for (const [index, target] of targets2.entries()) {
      const targetInfo = target._targetInfo || {}
      console.log(`[${index + 1}] ${target.type().toUpperCase()}`)
      console.log(`    Title: ${targetInfo.title || '(no title)'}`)
      console.log(`    URL: ${target.url() || '(no url)'}`)
      console.log(`    ID: ${targetInfo.targetId}`)
      if (targetInfo['xe-meta']) {
        console.log(`    Original Type: ${targetInfo['xe-meta'].originalType}`)
      }
      console.log('')
    }
    
    // Get all pages using Puppeteer
    // const pages = await browser.pages()
    // console.log(`Active pages: ${pages.length}`)
    
    // for (const page of pages) {
    //   const title = await page.title()
    //   const url = page.url()
    //   console.log(`  - ${title || '(no title)'} | ${url}`)
    // }
    
    // Disconnect
    await browser.disconnect()
    console.log('\nDisconnected from CDP proxy')
    
  } catch (error) {
    console.error('Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
  }
}

// Run the script
listTabs()

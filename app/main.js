if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    // Create the policy directly - if it already exists, the browser will throw an error
    window.trustedTypes.createPolicy('default', {
      createHTML: (input) => {
        // console.log('createHTML', input)
        return input // DOMPurify.sanitize(input)
      }, 
      createScript: (input) => { 
        console.log('createScript', input)
        return input
      },
      createScriptURL: (url) => { 
        console.log('trusted origin check', url)
        // if( url.startsWith('https://') || url.startsWith('http://') || url.startsWith('isolated-app://')) {
        return url
        // }
        // throw new Error('Untrusted script URL blocked')
      }
    })
  } catch (e) {
    // If the error is because the policy already exists, that's fine
    if (e.name === 'TypeError' && e.message.includes('already exists')) {
      console.log('Default trusted types policy already exists')
    } else {
      console.warn('Could not create default trusted types policy:', e)
    }
  }
}

document.addEventListener('touchmove', function (event) {
  console.log('touchmove', event)
  if (event.scale !== 1) { event.preventDefault() }
}, { passive: false })


document.addEventListener("wheel", e => {

  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    
    // Determine zoom direction based on deltaY
    const zoomDirection = e.deltaY < 0 ? 'in' : 'out'
    
    if (zoomDirection === 'out') {
      // Check if we're at minimum zoom using visualViewport scale
      const currentScale = window.visualViewport?.scale || 1.0
      
      if (currentScale <= 1.0) {        
        window.dispatchEvent(new CustomEvent('darc-zoom-out-at-max-internal', {
          detail: { 
            source: 'app-shell',
            currentScale: currentScale,
            direction: zoomDirection
          }
        }))
      }
    }
  }
}, { passive: false })


window.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('gesturechange', e => e.preventDefault());
window.addEventListener('gestureend', e => e.preventDefault());

// Global Cmd+W / Ctrl+W interceptor to prevent window closing
// Global Cmd+R / Ctrl+R interceptor to prevent full page reload
document.addEventListener('keydown', function(event) {
  // Check for Cmd+W (Mac) or Ctrl+W (Windows/Linux)
  if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
    // Prevent the browser's default behavior (closing window/tab)
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    
    // Dispatch a custom event that the Svelte app can listen for
    window.dispatchEvent(new CustomEvent('darc-close-tab', {
      detail: { originalEvent: event }
    }))
    
    console.log('Intercepted Cmd+W/Ctrl+W - delegating to app')
    return false
  }
  
  // Check for Cmd+R (Mac) or Ctrl+R (Windows/Linux) or F5
  if (((event.metaKey || event.ctrlKey) && event.key === 'r') || event.key === 'F5') {
    // Prevent the browser's default behavior (reloading page)
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    
    // Dispatch a custom event that the Svelte app can listen for
    window.dispatchEvent(new CustomEvent('darc-reload-tab', {
      detail: { originalEvent: event }
    }))
    
    return false
  }
}, { capture: true, passive: false })

import { mount } from 'svelte'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app

// start the service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(registration => {
    console.log('Service worker registered', registration)
  }).catch(error => {
    console.error('Service worker registration failed', error)
  })
}


if (typeof window !== 'undefined' && window.location.protocol === 'isolated-app:') { 
  import(/* @vite-ignore */ `/${'app'}/test.js`).then(({default: test}) => test())
} 
// isolated-app://kktqp5b4ad3rk7liu3s3svirby266incu7xsds2l56zwzm3op5aaaaac
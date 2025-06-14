// Initialize trusted types policy for IWA compatibility
if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    // Create the policy directly - if it already exists, the browser will throw an error
    window.trustedTypes.createPolicy('default', {
      createHTML: (input) => input,
      createScript: (input) => input,
      createScriptURL: (input) => input,
    })
    console.log('Default trusted types policy created')
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
  console.log(event)
  if (event.scale !== 1) { event.preventDefault() }
}, { passive: false })

document.addEventListener("wheel", e => {
  if (e.ctrlKey) {
    e.preventDefault()
  }

}, { passive: false })


window.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('gesturechange', e => e.preventDefault());
window.addEventListener('gestureend', e => e.preventDefault());

// Global Cmd+W / Ctrl+W interceptor to prevent window closing
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

// Initialize trusted types policy for IWA compatibility
if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    // Create the policy directly - if it already exists, the browser will throw an error
    window.trustedTypes.createPolicy('default', {
      createHTML: (input) => input,
      createScript: (input) => input,
      createScriptURL: (input) => input
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

import { mount } from 'svelte'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app

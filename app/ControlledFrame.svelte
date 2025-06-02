<script>
  import { onMount } from 'svelte'
  
  let {
    src = 'https://google.com',
    partition = 'persist:myapp',
    allowtransparency = false,
    autosize = true,
    name = 'controlled-frame-view',
    style = '',
    onclose,
    onconsolemessage,
    oncontentload,
    ondialog,
    onexit,
    onloadabort,
    onloadcommit,
    onloadredirect,
    onloadstart,
    onloadstop,
    onnewwindow,
    onpermissionrequest,
    onresponsive,
    onsizechanged,
    onunresponsive,
    onzoomchange,
    onnavigation,
    onerror
  } = $props()
  
  let controlledFrame = $state()
  let container = $state()
  let trustedTypesPolicy = $state()
  let isReady = $state(false)
  
  function initTrustedTypesPolicy() {
    if (typeof window.trustedTypes !== 'undefined' && window.trustedTypes.createPolicy) {
      try {
        // Check if policy already exists
        const existingPolicies = window.trustedTypes.getPolicyNames()
        if (existingPolicies.includes('controlled-frame-policy')) {
          console.log('Trusted types policy already exists')
          return
        }
        
        trustedTypesPolicy = window.trustedTypes.createPolicy('controlled-frame-policy', {
          createHTML: (string) => string,
          createScript: (string) => string,
          createScriptURL: (string) => string
        })
        console.log('Trusted types policy created successfully')
      } catch (e) {
        console.warn('Could not create trusted types policy:', e)
        // Continue without trusted types - the browser will handle CSP violations
      }
    } else {
      console.log('Trusted Types not available in this environment')
    }
  }
  
  function checkCSPCompatibility() {
    try {
      // Check if we can create elements
      const testDiv = document.createElement('div')
      if (!testDiv) {
        throw new Error('Cannot create DOM elements')
      }
      
      // Check for ControlledFrame API
      if (typeof ControlledFrame === 'undefined') {
        const error = 'ControlledFrame API not available - ensure this is running in a compatible IWA environment'
        console.error(error)
        onerror?.(new Error(error))
        return false
      }
      
      return true
    } catch (error) {
      console.error('CSP compatibility check failed:', error)
      onerror?.(error)
      return false
    }
  }
  
  function isValidUrl(str) {
    let url
    try {
      url = new URL(str)
    } catch (_) {
      return false
    }
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  
  function createControlledFrame() {
    if (!checkCSPCompatibility()) {
      return
    }
    
    if (controlledFrame) {
      try {
        controlledFrame.remove()
      } catch (e) {
        console.warn('Error removing existing controlled frame:', e)
      }
    }
    
    try {
      // Create the controlled frame element
      controlledFrame = document.createElement('ControlledFrame')
      console.log('ControlledFrame element created:', controlledFrame)
      
      // Set basic attributes before appending
      if (partition) controlledFrame.partition = partition
      if (allowtransparency) controlledFrame.allowtransparency = 'on'
      if (autosize) controlledFrame.autosize = 'on'
      if (name) controlledFrame.name = name
      
      // Append to container
      if (container) {
        container.appendChild(controlledFrame)
        console.log('ControlledFrame appended to container')
      } else {
        throw new Error('Container not available')
      }
      
      // Set src after appending
      if (src && isValidUrl(src)) {
        controlledFrame.src = src
        console.log('ControlledFrame src set to:', src)
      } else if (src) {
        console.error(`Invalid URL for src: ${src}`)
      }
      
      // Add event listeners
      addEventListeners()
      
      isReady = true
      console.log('ControlledFrame setup complete')
      
    } catch (error) {
      console.error('Error creating controlled frame:', error)
      onerror?.(error)
      
      // Try to provide helpful error messages
      if (error.message.includes('TrustedHTML')) {
        console.error('TrustedHTML error detected. This is likely due to CSP restrictions in the IWA.')
        console.error('Make sure your IWA manifest has the correct permissions and CSP settings.')
      }
    }
  }
  
  function addEventListeners() {
    if (!controlledFrame) return
    
    try {
      const events = [
        'close', 'consolemessage', 'contentload', 'dialog', 'exit',
        'loadabort', 'loadcommit', 'loadredirect', 'loadstart', 'loadstop',
        'newwindow', 'permissionrequest', 'responsive', 'sizechanged',
        'unresponsive', 'zoomchange'
      ]
      
      events.forEach(eventName => {
        const handler = getEventHandler(eventName)
        if (handler) {
          controlledFrame.addEventListener(eventName, handler)
        }
      })
      
      console.log('Event listeners added successfully')
      
    } catch (error) {
      console.error('Error adding event listeners:', error)
      onerror?.(error)
    }
  }
  
  function getEventHandler(eventName) {
    const handlers = {
      close: (e) => onclose?.(e),
      consolemessage: (e) => onconsolemessage?.(e),
      contentload: (e) => oncontentload?.(e),
      dialog: (e) => {
        ondialog?.(e)
        e.dialog.ok()
      },
      exit: (e) => onexit?.(e),
      loadabort: (e) => onloadabort?.(e),
      loadcommit: (e) => onloadcommit?.(e),
      loadredirect: (e) => onloadredirect?.(e),
      loadstart: (e) => onloadstart?.(e),
      loadstop: (e) => onloadstop?.(e),
      newwindow: (e) => {
        onnewwindow?.(e)
        handleNewWindow(e)
      },
      permissionrequest: (e) => {
        onpermissionrequest?.(e)
        e.request.allow()
      },
      responsive: (e) => onresponsive?.(e),
      sizechanged: (e) => onsizechanged?.(e),
      unresponsive: (e) => onunresponsive?.(e),
      zoomchange: (e) => onzoomchange?.(e)
    }
    
    return handlers[eventName]
  }
  
  function handleNewWindow(e) {
    try {
      const newFrame = document.createElement('controlledframe')
      newFrame.id = `frame-${Date.now()}`
      // newFrame.style.width = `${e.initialWidth || 500}px`
      // newFrame.style.height = `${e.initialHeight || 550}px`
      newFrame.allowpopups = "true"
      newFrame.allowpopupstoescapesandbox = "true"
      
      if (container) {
        container.appendChild(newFrame)
        e.window.attach(newFrame)
        console.log('New window handled successfully')
      }
    } catch (error) {
      console.error('Error handling new window:', error)
      onerror?.(error)
    }
  }
  
  // Public methods with improved error handling
  export function navigate(url) {
    if (!isReady) {
      console.warn('ControlledFrame not ready yet')
      return false
    }
    
    if (!isValidUrl(url)) {
      console.error(`Invalid URL for navigation: ${url}`)
      return false
    }
    
    if (controlledFrame) {
      try {
        controlledFrame.src = url
        return true
      } catch (error) {
        console.error('Error navigating:', error)
        onerror?.(error)
        return false
      }
    }
    return false
  }
  
  export function back() {
    if (!isReady || !controlledFrame || typeof controlledFrame.back !== 'function') {
      return false
    }
    
    try {
      controlledFrame.back((success) => {
        onnavigation?.({ action: 'back', success })
      })
      return true
    } catch (error) {
      console.error('Error going back:', error)
      onerror?.(error)
      return false
    }
  }
  
  export function forward() {
    if (!isReady || !controlledFrame || typeof controlledFrame.forward !== 'function') {
      return false
    }
    
    try {
      controlledFrame.forward((success) => {
        onnavigation?.({ action: 'forward', success })
      })
      return true
    } catch (error) {
      console.error('Error going forward:', error)
      onerror?.(error)
      return false
    }
  }
  
  export function reload() {
    if (!isReady || !controlledFrame || typeof controlledFrame.reload !== 'function') {
      return false
    }
    
    try {
      controlledFrame.reload()
      return true
    } catch (error) {
      console.error('Error reloading:', error)
      onerror?.(error)
      return false
    }
  }
  
  export function stop() {
    if (!isReady || !controlledFrame || typeof controlledFrame.stop !== 'function') {
      return false
    }
    
    try {
      controlledFrame.stop()
      return true
    } catch (error) {
      console.error('Error stopping:', error)
      onerror?.(error)
      return false
    }
  }
  
  export function executeScript(details) {
    if (!isReady || !controlledFrame || typeof controlledFrame.executeScript !== 'function') {
      return Promise.reject(new Error('ControlledFrame not ready or executeScript not available'))
    }
    
    try {
      return controlledFrame.executeScript(details)
    } catch (error) {
      console.error('Error executing script:', error)
      onerror?.(error)
      return Promise.reject(error)
    }
  }
  
  export function insertCSS(details) {
    if (!isReady || !controlledFrame || typeof controlledFrame.insertCSS !== 'function') {
      return Promise.reject(new Error('ControlledFrame not ready or insertCSS not available'))
    }
    
    try {
      return controlledFrame.insertCSS(details)
    } catch (error) {
      console.error('Error inserting CSS:', error)
      onerror?.(error)
      return Promise.reject(error)
    }
  }
  
  export function setZoom(zoomFactor) {
    if (!isReady || !controlledFrame || typeof controlledFrame.setZoom !== 'function') {
      return Promise.reject(new Error('ControlledFrame not ready or setZoom not available'))
    }
    
    try {
      return controlledFrame.setZoom(zoomFactor)
    } catch (error) {
      console.error('Error setting zoom:', error)
      onerror?.(error)
      return Promise.reject(error)
    }
  }
  
  export function getZoom() {
    if (!isReady || !controlledFrame || typeof controlledFrame.getZoom !== 'function') {
      return Promise.reject(new Error('ControlledFrame not ready or getZoom not available'))
    }
    
    try {
      return controlledFrame.getZoom()
    } catch (error) {
      console.error('Error getting zoom:', error)
      onerror?.(error)
      return Promise.reject(error)
    }
  }
  
  export function setAudioMuted(muted) {
    if (!isReady || !controlledFrame || typeof controlledFrame.setAudioMuted !== 'function') {
      return false
    }
    
    try {
      controlledFrame.setAudioMuted(muted)
      return true
    } catch (error) {
      console.error('Error setting audio muted:', error)
      onerror?.(error)
      return false
    }
  }
  
  export function isAudioMuted() {
    if (!isReady || !controlledFrame || typeof controlledFrame.isAudioMuted !== 'function') {
      return Promise.reject(new Error('ControlledFrame not ready or isAudioMuted not available'))
    }
    
    try {
      return controlledFrame.isAudioMuted()
    } catch (error) {
      console.error('Error checking audio muted:', error)
      onerror?.(error)
      return Promise.reject(error)
    }
  }
  
  export function getAudioState() {
    if (!isReady || !controlledFrame || typeof controlledFrame.getAudioState !== 'function') {
      return Promise.reject(new Error('ControlledFrame not ready or getAudioState not available'))
    }
    
    try {
      return controlledFrame.getAudioState()
    } catch (error) {
      console.error('Error getting audio state:', error)
      onerror?.(error)
      return Promise.reject(error)
    }
  }
  
  export function canGoBack() {
    if (!isReady || !controlledFrame || typeof controlledFrame.canGoBack !== 'function') {
      return false
    }
    
    try {
      return controlledFrame.canGoBack()
    } catch (error) {
      console.error('Error checking can go back:', error)
      onerror?.(error)
      return false
    }
  }
  
  export function canGoForward() {
    if (!isReady || !controlledFrame || typeof controlledFrame.canGoForward !== 'function') {
      return false
    }
    
    try {
      return controlledFrame.canGoForward()
    } catch (error) {
      console.error('Error checking can go forward:', error)
      onerror?.(error)
      return false
    }
  }
  
  // Getter for ready state
  export function getReadyState() {
    return isReady
  }
  
  onMount(() => {
    console.log('ControlledFrame component mounting...')
    initTrustedTypesPolicy()
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      createControlledFrame()
    })
    
    return () => {
      if (controlledFrame) {
        try {
          controlledFrame.remove()
          console.log('ControlledFrame removed on unmount')
        } catch (error) {
          console.warn('Error removing controlled frame on unmount:', error)
        }
      }
    }
  })
  
  // Reactive effects
  $effect(() => {
    if (controlledFrame && src && isReady) {
      if (isValidUrl(src)) {
        try {
          controlledFrame.src = src
        } catch (error) {
          console.error('Error updating src:', error)
          onerror?.(error)
        }
      }
    }
  })
  
  $effect(() => {
    if (controlledFrame && isReady) {
      try {
        controlledFrame.partition = partition
        controlledFrame.allowtransparency = allowtransparency ? 'on' : ''
        controlledFrame.autosize = autosize ? 'on' : ''
        controlledFrame.name = name
      } catch (error) {
        console.error('Error updating attributes:', error)
        onerror?.(error)
      }
    }
  })
</script>

<div 
  bind:this={container} 
  class="controlled-frame-container browser-frame w-full h-full"
  class:loading={!isReady}
  {style}
>
  {#if !isReady}
    <div class="loading-indicator">
      <div class="loading-spinner"></div>
      <p>Initializing ControlledFrame...</p>
    </div>
  {/if}
</div>

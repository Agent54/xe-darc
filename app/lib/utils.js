export function thottle (func, window = 100) {
  let lastCall = 0
  let timeoutId = null
  let pendingArgs = null
  let hasPendingCall = false

  return function (...args) {
    const now = Date.now()
    
    // First call or enough time has passed - execute immediately
    if (now - lastCall >= window) {
      lastCall = now
      func.apply(this, args)
      return
    }
    
    // Store the latest call arguments
    pendingArgs = args
    hasPendingCall = true
    
    // If no timeout is set, schedule the trailing call
    if (!timeoutId) {
      timeoutId = setTimeout(() => {
        if (hasPendingCall) {
          lastCall = Date.now()
          func.apply(this, pendingArgs)
        }
        timeoutId = null
        hasPendingCall = false
        pendingArgs = null
      }, window - (now - lastCall))
    }
  }
}

export function origin(url) {
  try {
    return new URL(url).origin
  } catch (error) {
    // Handle internal pages with proper origin designators
    if (url?.startsWith('about:')) {
      return 'about'
    }
  }
}

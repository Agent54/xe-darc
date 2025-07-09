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
    // Return a fallback for invalid URLs
    return 'unknown'
  }
}

export const colors = [
  { name: "Magenta", color: "#b800bb" },
  { name: "Yellow", color: "#ffc100" },
  { name: "Green Apple", color: "#71be00" },
  { name: "Turquoise", color: "#00a3d6" },
  { name: "Red", color: "#d82b00" },
  { name: "Grape", color: "#8100ea" },
  { name: "Orange", color: "#ce9f00" },
  { name: "Swamp Green", color: "#91a400" },
  { name: "Ice Blue", color: "#74a4d7" },
  { name: "Peach", color: "#e46642" },
  { name: "Violet", color: "#ba6eff" },
  { name: "Pea Green", color: "#6e7306" },
  { name: "Tan", color: "#908675" },
  { name: "Aquamarine", color: "#008c8d" },
  { name: "Maroon", color: "#ac3f65" },
  { name: "Light Gray", color: "#cccccc" },
  { name: "Medium Gray", color: "#818182" },
  { name: "Dark Gray", color: "#555555" },
  { name: "Ocean Blue", color: "#155f8b" },
  { name: "Pink", color: "#ee61f0" },
]

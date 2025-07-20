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
  if (url?.startsWith('about:')) {
    return 'about'
  }
  try {
    return new URL(url).origin
  } catch (error) {   
    return 'null'
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

 // Simple diff algorithm to generate additions/deletions
export function generateDiff(oldText, newText) {
    const diff = []
    let i = 0, j = 0
    
    while (i < oldText.length || j < newText.length) {
        if (i >= oldText.length) {
            // Remaining characters are additions
            diff.push({ type: 'add', char: newText[j] })
            j++
        } else if (j >= newText.length) {
            // Remaining characters are deletions
            diff.push({ type: 'delete', char: oldText[i] })
            i++
        } else if (oldText[i] === newText[j]) {
            // Characters match
            diff.push({ type: 'same', char: oldText[i] })
            i++
            j++
        } else {
            // Characters differ - look ahead to see if it's insert/delete/replace
            let foundMatch = false
            
            // Check if next few chars in new text match current old char (insertion)
            for (let k = j + 1; k < Math.min(j + 5, newText.length); k++) {
                if (newText[k] === oldText[i]) {
                    // Found match - insert the characters before it
                    for (let l = j; l < k; l++) {
                        diff.push({ type: 'add', char: newText[l] })
                    }
                    diff.push({ type: 'same', char: oldText[i] })
                    i++
                    j = k + 1
                    foundMatch = true
                    break
                }
            }
            
            if (!foundMatch) {
                // Check if next few chars in old text match current new char (deletion)
                for (let k = i + 1; k < Math.min(i + 5, oldText.length); k++) {
                    if (oldText[k] === newText[j]) {
                        // Found match - delete the characters before it
                        for (let l = i; l < k; l++) {
                            diff.push({ type: 'delete', char: oldText[l] })
                        }
                        diff.push({ type: 'same', char: newText[j] })
                        i = k + 1
                        j++
                        foundMatch = true
                        break
                    }
                }
            }
            
            if (!foundMatch) {
                // Treat as replacement
                diff.push({ type: 'delete', char: oldText[i] })
                diff.push({ type: 'add', char: newText[j] })
                i++
                j++
            }
        }
    }
    
    return diff
}
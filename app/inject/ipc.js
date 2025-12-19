window.addEventListener('focus', () => { 
    console.log('####### 🎯 [FOCUS] Frame window received focus event | tabId:', tabId);
    console.log('iwa:focus');
}, false);

window.addEventListener('blur', () => { 
    console.log('####### 😴 [BLUR] Frame window received blur event | tabId:', tabId);
    console.log('iwa:blur');
}, false);

document.addEventListener('keyup', function(event) {
    // Track command key state
    if (event.key === 'Meta' || event.key === 'Control') {
        console.log(`iwa:command-key-up:${tabId}`);
    }
}, { capture: true, passive: false });


// Global keyboard event listener for controlled frame
document.addEventListener('keydown', function(event) {
    // Track command key state
    if (event.metaKey || event.ctrlKey) {
        console.log(`iwa:command-key-down:${tabId}`);
    }
    
    // Check for Cmd+W (Mac) or Ctrl+W (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
        console.log(`iwa:close-tab:${tabId}`);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
    }
    
    // Check for Cmd+T (Mac) or Ctrl+T (Windows/Linux) 
    if ((event.metaKey || event.ctrlKey) && event.key === 't') {
        console.log(`iwa:new-tab:${tabId}`);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
    }
    
    // Check for Cmd+R (Mac) or Ctrl+R (Windows/Linux) or F5
    if (((event.metaKey || event.ctrlKey) && event.key === 'r') || event.key === 'F5') {
        console.log(`iwa:reload-tab:${tabId}`);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
    }
}, { capture: true, passive: false });

// Global mouse event listeners for controlled frame
document.addEventListener('mousedown', function(event) {
    // Track modifier key state with mousedown for link clicks
    // This ensures we capture cmd+click before navigation starts
    const hasModifier = event.metaKey || event.ctrlKey;
    console.log(`iwa:mousedown:${tabId}:${event.button}:${hasModifier ? 'mod' : ''}`);
}, { capture: true, passive: true });

document.addEventListener('mouseup', function(event) {
    // console.log('🖱️ [CONTROLLED-FRAME] mouseup detected in tab ${tab.id}', {
    //     button: event.button,
    //     target: event.target?.tagName,
    //     clientX: event.clientX,
    //     clientY: event.clientY
    // });
    console.log(`iwa:mouseup:${tabId}`);
}, { capture: true, passive: true });



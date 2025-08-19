window.addEventListener('focus', () => { console.log('iwa:focus') }, false);

window.addEventListener('blur', () => { console.log('iwa:blur') }, false);

document.addEventListener('keyup', function(event) {
    // Track command key state
    if (event.key === 'Meta' || event.key === 'Control') {
        console.log(`iwa:command-key-up:${tabId}`);
    }
}, { capture: true, passive: false });

// Global wheel event listener for controlled frame zoom control
// document.onwheel = function(event) {
//     // Check for Ctrl key (Windows/Linux) or Cmd key (Mac) - same as zoom prevention in main app
//     if (event.ctrlKey || event.metaKey) {
//         event.preventDefault();
//         event.stopPropagation();
//         event.stopImmediatePropagation();       
//         // Determine zoom direction based on deltaY
//         const zoomDirection = event.deltaY < 0 ? 'in' : 'out';
//         // Log zoom direction to console IPC system
//         console.log('iwa:zoom:${tabId}:' + zoomDirection);
//         return false;
//     }
// }, { capture: true, passive: false });

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
}, { capture: true, passive: false });

// Global mouse event listeners for controlled frame
document.addEventListener('mousedown', function(event) {
    // console.log('🖱️ [CONTROLLED-FRAME] mousedown detected in tab ${tabId}', {
    //     button: event.button,
    //     target: event.target?.tagName,
    //     clientX: event.clientX,
    //     clientY: event.clientY
    // });
    console.log(`iwa:mousedown:${tabId}`);
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



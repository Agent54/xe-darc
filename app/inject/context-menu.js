// Context menu protection - force native context menu when cmd/ctrl is held
document.addEventListener('contextmenu', function(event) {
    // Only force native context menu if cmd (Mac) or ctrl (Windows/Linux) key is held down
    const forceNative = event.metaKey || event.ctrlKey;
    
    if (forceNative) {
        // Stop any other handlers from running first
        event.stopImmediatePropagation();
        
        // Override preventDefault to make it ineffective
        const originalPreventDefault = event.preventDefault;
        event.preventDefault = function() {
            console.log(`iwa:contextmenu-forced-native:${tabId}`);
            // Don't actually prevent default - let native context menu show
        };
        
        console.log(`iwa:contextmenu-native-forced:${tabId}`);
    }
    // If cmd/ctrl not held, allow normal website context menu behavior
}, { capture: true, passive: false });

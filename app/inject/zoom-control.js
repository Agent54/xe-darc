let zoomDisabled = false

// TODO: use scoped IPC handler for state
window.darcZoomControl = {
    disable: function() {
        zoomDisabled = true
    },
    enable: function() {
        zoomDisabled = false
    }
}

document.addEventListener('wheel', function(event) {
    // console.log('wheel', { zoomDisabled, event})
    if (event.ctrlKey || event.metaKey) {
        if (zoomDisabled) {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
            // return false
        }
        
        const zoomDirection = event.deltaY < 0 ? 'in' : 'out'
        console.log(`iwa:zoom:${tabId}:${zoomDirection}`)
    }
}, { passive: false, capture: false })

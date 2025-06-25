<script>
    // Tab sidebar component with Firefox-like hover behavior
    let { isDragEnabled = true } = $props()
    
    let isHovered = $state(false)
    
    function handleMouseEnter() {
        isHovered = true
    }
    
    function handleMouseLeave() {
        isHovered = false
    }
</script>

<div class="sidebar-box" 
     class:hovered={isHovered}
     onmouseenter={handleMouseEnter} 
     onmouseleave={handleMouseLeave}
     role="complementary"
     aria-label="Tab Sidebar">
    <div class="sidebar">
        <div class="sidebar-content">

        </div>
    </div>
</div>

<style>
    .sidebar-box {
        background: transparent;
        position: fixed;
        /* height: 100vh; */
        z-index: 100000;
        border-radius: 8px;
        bottom: 9px;
        top: 43px;
        left: 0px;
        overflow: hidden;
        transition: transform 190ms 340ms cubic-bezier(.78,-0.01,.34,1.04);
        padding-right: 15px;
        transform: translateX(-248px);
        backface-visibility: hidden;
        padding-left: 9px;
        width: 263px;
        pointer-events: auto;
    }

    .sidebar-box.hovered, .sidebar-box:hover {
        transition: transform 190ms 0ms cubic-bezier(.78,-0.01,.34,1.04);
        transform: translateX(0px);
    }

    .sidebar {
        flex: 1;
        border-radius: 8px;
        box-shadow: 0 0 2px 0 #000;
        border: 1px solid hsl(0 0% 12% / 1);
        overflow: hidden;
        height: 100%;
        backdrop-filter: blur(24px);
        background: rgba(0, 0, 0, 0.7);
    }

    .sidebar-content {
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        background: transparent;
    }

    /* .sidebar-placeholder {
        padding: 20px;
        color: rgba(255, 255, 255, 0.8);
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
        text-align: center;
        margin-top: 40px;
    }

    .sidebar-placeholder p {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 500;
    }

    .sidebar-hint {
        font-size: 12px;
        opacity: 0.6;
        font-weight: 400;
    } */

    /* .sidebar-content::-webkit-scrollbar {
        width: 6px;
    }

    .sidebar-content::-webkit-scrollbar-track {
        background: transparent;
    }

    .sidebar-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .sidebar-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    } */
</style>

<!-- <div class="drag-handle-left" class:drag-enabled={isDragEnabled}></div> -->

<!-- 

.deck-previewed {
  visibility: visible;
  padding: 67px !important;
  z-index: 180 !important;
  background: #000000c4;
  display: block;
  position: relative;
  -moz-subtree-hidden-only-visually: 0;
}

.deck-previewed > .browserContainer {
    width: 100%;
    height: 100%;
    border-radius: 9px;
    overflow: hidden;
    box-shadow: 0px 0px 13px #00000087;
}

#appcontent {
    margin-left: 14px;
    border-radius: 9px;
    overflow: hidden;
    border-left: 1px solid #cecece1a !important;
    border-top: none;
}

#TabsToolbar {
     visibility: collapse;
}

#urlbar-container {
   min-width: 30vw !important;
}

#urlbar {
    top: 4px!important;
}

#nav-bar.browser-toolbar {
    position: absolute!important;
    z-index: 100000;
    border-bottom-right-radius: 10px;
/*     box-shadow: 0px 0px 20px 0px #000000e3 !important; */
    padding: 16px!important;
    background: rgb(8,8,8) !important;
    padding-left: 50px;
    border: none;
    padding-left: 26px!important;
}

#navigator-toolbox {
    position: absolute!important;
    z-index: 10000;
    transition: transform 90ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateY(-72px);
    width: 100%;
    height: 84px;
    border: none !important;
    background-image: none !important;
    background: transparent !important;
}

#navigator-toolbox:hover {
    transition: transform 90ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateY(0px);
}


#navigator-toolbox:not(:hover) #downloads-indicator-progress-inner {
    position: fixed;
    top: 84px;
    left: 4px;
    z-index: 10000;
    width: 7px!important;
    height: 7px!important;
    visibility: visible;
    display: block;
/*     box-shadow: 0px 0px 5px blue; */
}

.certErrorPage.notSecureText:before {
    display: block;
    content: '';
    position: fixed;
    height: 5px;
    width: 5px;
    background: red;
    top: 74px;
    left: 5px;
    border-radius: 100%;
    box-shadow: 0px 0px 5px #f00;
}

.notSecure:before { 
    display: block;
    content: '';
    position: fixed;
    height: 5px;
    width: 5px;
    background: orange;
    top: 74px;
    left: 5px;
    border-radius: 100%;
    box-shadow: 0px 0px 5px #f00;
}

/* #navigator-toolbox:hover .certErrorPage.notSecureText:before {
   top: 6px; 
}
     */
#sidebar-header {
    display: none;
}

#sidebar {
    -moz-box-flex: 1;
    border-radius: 9px;
    box-shadow: 0 0 2px 0 #000;
    border: 1px solid rgb(41, 41, 43);
    overflow: hidden;
    height: 100%;
    background: transparent;
  }

#sidebar-box {
    background: transparent !important;
    position: absolute;
    height: unset !important;
    z-index: 100000;
    border-radius: 9px;
    bottom: 0px !important;
    top: 0px !important;
    overflow: hidden !important;
    transition: transform 190ms 340ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    padding-right: 15px;
/*     cursor: grab; */
    transform: translateX(-248px);
    backface-visibility: hidden;
    padding-left: 12px;
    background:  transparent !important;
    width: 263px !important;
}

#sidebar-box:hover  {
    transition: transform 190ms 0ms cubic-bezier(.78,-0.01,.34,1.04) !important;
    transform: translateX(0px);
}



/* #sidebar-box:hover  {
 padding-right: 55px;
} */ -->
<!-- @namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");

/* TODO: show number of tabs */

#browser {
    background: #131313 !important;
}

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
<script>
  import { onMount, mount, unmount } from 'svelte'
  import React from 'react'
  import ReactDOM from 'react-dom/client'
  import { Excalidraw as ExcalidrawReact } from '@excalidraw/excalidraw'
  import '@excalidraw/excalidraw/index.css'
  import ControlledFrame from './ControlledFrame.svelte'

  // Create a React component that mounts the Svelte ControlledFrame
  class ControlledFrameWrapper extends React.Component {
          constructor(props) {
            super(props)
            this.containerRef = React.createRef()
            this.frameInstance = null
          }
          
          componentDidMount() {
            if (this.containerRef.current) {  
              // Mount the Svelte ControlledFrame component using Svelte 5 syntax
              this.frameInstance = mount(ControlledFrame, {
                target: this.containerRef.current,
                props: {
                  style: 'width: 100%; height: 100%;',
                  tab: this.props.tabs.find(tab => tab.id === this.props.element.id),
                  tabs: this.props.tabs,
                  headerPartOfMain: false,
                  isScrolling: false,
                  captureTabScreenshot: () => {},
                  onFrameFocus: this.props.onFrameFocus || (() => {}),
                  onFrameBlur: this.props.onFrameBlur || (() => {}),
                  userMods: this.props.getEnabledUserMods(this.props.tabs[0])
                }
              })
            }
          }
          
          componentWillUnmount() {
            if (this.frameInstance) {
              unmount(this.frameInstance)
            }
          }
          
          render() {
            return React.createElement('div', {
              ref: this.containerRef,
              style: {
                width: '100%',
                height: '100%',
                position: 'relative'
              }
            })
          }
        }
  
  let {
    tabs = [],
    initialData = {
        "type": "excalidraw",
        "version": 2,
        "source": "isolated-app://kxhwjzichcfrfquwsmlthx2rhpjc75si7v22zajhnudxktjbvvtqaaac",
        "elements": tabs.map((tab, index) => {
            // Arrange tabs in 5-column grid layout, centered on canvas
            const tabWidth = 600
            const tabHeight = 400  
            const columnSpacing = 80
            const rowSpacing = 160
            
            const columnsPerRow = 5
            const totalWidth = (columnsPerRow * tabWidth) + ((columnsPerRow - 1) * columnSpacing)
            
            const row = Math.floor(index / columnsPerRow)
            const col = index % columnsPerRow
            
            // Position tabs starting from top-left with positive coordinates
            const startX = 200
            const startY = 200
            
            const x = startX + (col * (tabWidth + columnSpacing))  
            const y = startY + (row * (tabHeight + rowSpacing))
            
            return {
                "id": tab.id,
                "type": "embeddable",
                
                "x": x,
                "y": y,
                "width": tabWidth,
                "height": tabHeight,
                "angle": tab.angle || 0,
                
                "strokeColor": "none",
                "backgroundColor": "none",
                "fillStyle": "solid",
                "strokeWidth": 2,
                "strokeStyle": "solid",
                "roughness": 0,
                "opacity": 100,
                "groupIds": [],
                "frameId": null,
                "index": "a2",
                "roundness": {
                    "type": 4
                },
                "seed": 1218149059,
                "version": 104,
                "versionNonce": 1873698765,
                "isDeleted": tab.closed,
                "boundElements": null,
                "updated": 1749946396932,
                "link": tab.url,
                "locked": false
            }
        }),
        "appState": {
            "gridSize": 20,
            "gridStep": 5,
            "gridModeEnabled": false,
            "viewBackgroundColor": "#0000",
            "zoom": { "value": 0.35 },
            "scrollX": -100,
            "scrollY": 0
        },
        "files": {}
        },
    onChange = () => {},
    onPointerUpdate = () => {},
    UIOptions = {
      canvasActions: {
        loadScene: false,
        export: false,
        saveToActiveFile: false,
        saveAsImage: false,
        theme: false,
        changeViewBackgroundColor: false,
        clearCanvas: false
      }
    },
    renderTopRightUI = null,
    viewModeEnabled = false,
    zenModeEnabled = true,
    gridModeEnabled = false,
    theme = 'light',
    langCode = 'en',
    autoFocus = true,
    detectScroll = true,
    handleKeyboardGlobally = false,
    width = '100%',
    height = '100%',
    onFrameFocus = () => {},
    onFrameBlur = () => {},
    getEnabledUserMods = () => { return { css: [], js: [] } },
    ...restProps
  } = $props()
  
  let container
  let root
  let excalidrawAPI = $state(null)
  
  function renderExcalidraw () {
    if (!container || !root) return

      // For shapes:
      // {
      // "id": "BIU3Ng9qVuSrm_gBelQ4v",
      // "type": "rectangle",
      // "x": 191.38671875,
      // "y": 157.23046875,
      // "width": 175.98828125,
      // "height": 156.90234375,
      // "angle": 0,
      // "strokeColor": "#1e1e1e",
      // "backgroundColor": "transparent",
      // "fillStyle": "solid",
      // "strokeWidth": 2,
      // "strokeStyle": "solid",
      // "roughness": 0,
      // "opacity": 100,
      // "groupIds": [],
      // "frameId": null,
      // "index": "a0",
      // "roundness": {
      //     "type": 3
      // },
      // "seed": 1943070669,
      // "version": 188,
      // "versionNonce": 657353517,
      // "isDeleted": false,
      // "boundElements": null,
      // "updated": 1749946352449,
      // "link": null,
      // "locked": false
      // },
    
    // Merge default app state for precise drawing with user's initialData
    const mergedInitialData = {
      ...initialData,
      appState: {
        currentItemRoughness: 0, // 0 = precise/architect style
        currentItemStrokeColor: "#6c757d", // Default line color to mid gray
        viewBackgroundColor: "#0000",
        zoom: { value: 0.35 }, // Set zoom to 35% for double-sized tiles
        scrollX: -300, // Center horizontally for larger tiles  
        scrollY: 0, // Position tabs properly on screen
        ...initialData.appState
      }
    }
    
    const props = {
      initialData: mergedInitialData,
      onChange: (elements, appState, files) => {
        onChange(elements, appState, files)
      },
      onPointerUpdate,
      UIOptions,
      viewModeEnabled,
      zenModeEnabled,
      gridModeEnabled,
      theme,
      langCode,
      autoFocus,
      detectScroll,
      handleKeyboardGlobally,
      validateEmbeddable: true, // Disable embed validation true means dont validate, false is enabled validation, do not change.
      renderEmbeddable: (element, appState) => {
        // Custom render using React wrapper for Svelte ControlledFrame
        const link = element.link
        if (!link) {
            console.log('no link', element)
            return null
        }
        
        return React.createElement(ControlledFrameWrapper, {
          tabs,
          element,
          onFrameFocus,
          onFrameBlur,
          getEnabledUserMods
        })
      },
      ...restProps
    }
    
    if (renderTopRightUI) {
      props.renderTopRightUI = renderTopRightUI
    }
    
    if (excalidrawAPI === null) {
      props.excalidrawAPI = (api) => {
        excalidrawAPI = api
      }
    }
    
    const element = React.createElement(ExcalidrawReact, props)
    root.render(element)
  }
  
  $effect(() => {
    // Re-render when props change
    if (root) {
      renderExcalidraw()
    }
  })
  
  onMount(() => {
    root = ReactDOM.createRoot(container)
    renderExcalidraw()
    
    return () => {
      if (root) {
        root.unmount()
      }
    }
  })
  
  export function getExcalidrawAPI () {
    return excalidrawAPI
  }

  let loaded = $state(false)
  setTimeout(() => {
    loaded = true
  }, 100)
</script>

<div 
  bind:this={container} 
  class="excalidraw-container"
  class:loaded={loaded}
  style="width: {width}; height: {height};"
></div>

<style>
    :global(.excalidraw-container .undo-redo-buttons) {
        position: fixed !important;
        top: calc(100vh - 153px) !important;
        left: 162px !important;
        display: none !important;
        /* fixme: when to show this? */
    }

    :global(.excalidraw-container .scroll-back-to-content) {
        bottom: 76px !important;
    }

    :global(.excalidraw-container section.shapes-section) {
        position: fixed;
        bottom: 21px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 4;
    }

    :global(.App-menu_top__left) {
        visibility: hidden !important;
    }

    .excalidraw-container {
        position: relative;
        border-radius: 10px;
        background-color: #000000;
        opacity: 0;
        transition: opacity 0.2s ease-in-out 0.1s;
    }

    .excalidraw-container.loaded {
        opacity: 1;
        transition: opacity 0.2s ease-in-out 0.1s;
    }
    
    :global(.excalidraw-container .excalidraw) {
        width: 100%;
        height: 100%;
        border-radius: 10px;
    }
  
  /* Override light theme to use neutral colors */
  /* :global(.excalidraw-container .excalidraw:not(.theme--dark)) {
    --color-primary: #495057;
    --color-primary-darker: #343a40;
    --color-primary-darkest: #212529;
    --color-primary-light: #adb5bd;
    --color-primary-hover: #6c757d;
    --color-brand-hover: #6c757d;
    --focus-highlight-color: #495057;
    --link-color: #495057;
    --select-highlight-color: #495057;
  } */

  :global(.excalidraw .App-toolbar__extra-tools-dropdown) {
    top: unset !important;
    bottom: 55px !important;
  }
  
  /* Override dark theme to be less bright and remove purple tint */
  :global(.excalidraw-container .excalidraw) {
    --icon-fill-color: #e2e6e985 !important;
    --color-on-surface: #e2e6e985 !important;

    /* Remove color inversion to prevent red showing as cyan */
    /* --theme-filter: none; */
    
    /* Neutral gray primary colors instead of purple */
    --color-primary: #868e96;
    --color-primary-darker: #6c757d;
    --color-primary-darkest: #495057;
    --color-primary-light: #495057;
    --color-primary-light-darker: #343a40;
    --color-primary-hover: #adb5bd;
    --color-primary-contrast-offset: #868e96;
    
    /* Brand and selection colors */
    --color-brand-hover: #adb5bd;
    --color-brand-active: #ced4da;
    --focus-highlight-color: #6c757d;
    --link-color: #868e96;
    --select-highlight-color: #6c757d;
    --color-selection: #1f1f1f;
    
    /* Text and logo colors */
    --color-logo-text: #e9ecef;
    --color-on-primary-container: #e9ecef;
    
    /* Background colors - darker for less brightness */
    --default-bg-color: #000000;
    --color-canvas-background: #000000;
    --input-bg-color: #0a0a0a;
    --input-hover-bg-color: #141414;
    --island-bg-color: hsl(0 0% 6% / 1);
    --popup-secondary-bg-color: #101010;
    
    /* Button grays */
    --button-gray-1: #2a2a2a;
    --button-gray-2: #1f1f1f;
    --button-gray-3: #171717;
    
    /* Surface colors */
    --color-surface-primary-container: #2a2a2a;
    --color-surface-high: hsl(0, 0%, 14%);
    --color-surface-low: hsl(0, 0%, 8%);
    --color-surface-mid: hsl(0, 0%, 6%);
    --color-surface-lowest: hsl(0, 0%, 3%);
    
    /* Border colors */
    --color-border-outline: #495057;
    --color-border-outline-variant: #343a40;
    
    /* Muted colors */
    --color-muted: #6c757d;
    --color-muted-darker: #495057;
    --color-muted-darkest: #343a40;
    --color-muted-background: #212529;
    --color-muted-background-darker: #101010;
  }
</style>

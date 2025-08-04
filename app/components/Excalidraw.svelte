<script>
  import { onMount } from 'svelte'
  import React from 'react'
  import ReactDOM from 'react-dom/client'
  import { Excalidraw as ExcalidrawReact } from '@excalidraw/excalidraw'
  import '@excalidraw/excalidraw/index.css'
  import FrameWrapper from './ReactFrameWrapper.js'
  import { throttle } from '../lib/utils'
  import data from '../data.svelte.js'
  import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

  let tabs = $derived(((data.spaceMeta.activeSpace && data.spaces[data.spaceMeta.activeSpace]?.tabs.filter(tab => !tab.pinned)) || []))
  
  function saveViewState(spaceId, scrollX, scrollY, zoom) {
    if (!spaceId) return
    const key = `excalidraw-view-${spaceId}`
    const viewState = { scrollX, scrollY, zoom }
    localStorage.setItem(key, JSON.stringify(viewState))
  }

  function loadViewState(spaceId) {
    if (!spaceId) return null
    const key = `excalidraw-view-${spaceId}`
    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse saved view state:', e)
        return null
      }
    }
    return null
  }

  const versions = new Map()

  let elements = $derived.by(() => {
    const elems = {}
    const arrows = []
    const tabWidth = 1000
    const tabHeight = 700  
    const columnSpacing = 80
    const rowSpacing = 160

    tabs.forEach((tab, index) => {
      const columnsPerRow = 5
      // const totalWidth = (columnsPerRow * tabWidth) + ((columnsPerRow - 1) * columnSpacing)

      const canvasData = tab.canvas?.[data.spaceMeta.activeSpace]
      let width
      let height 
      let x
      let y
      if (canvasData) {
        x = canvasData.x
        y = canvasData.y
        width = canvasData.width
        height = canvasData.height
      } else {
        const row = Math.floor(index / columnsPerRow)
        const col = index % columnsPerRow
        
        const startX = 200
        const startY = 200
        
        x = startX + (col * (tabWidth + columnSpacing))  
        y = startY + (row * (tabHeight + rowSpacing))
        data.updateTab(tab.id, { canvas: { [data.spaceMeta.activeSpace]: { x, y, width, height } } })
      }

      versions.set(tab.id, 1)
      
      elems[tab.id] = {
          "id": tab.id,
          "type": "embeddable",
          
          "x": x,
          "y": y,
          "width": width || tabWidth,
          "height": height || tabHeight,
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
              "type": 3
          },
          "seed": 1218149059,
          "version": 1,
          "versionNonce": 1873698765,
          "isDeleted": tab.closed,
          "boundElements": null,
          "updated": tab.modified || Date.now(),
          "link": tab.url,
          "locked": false
      }

      if (tab.opener) {
        // arrows.push({
        //     "id": "opener:" + tab.id,
        //     "type": "arrow",
        //     // "x": 3365.8187378196412,
        //     // "y": 259.1689134737774,
        //     "strokeColor": "#6c757d",
        //     "backgroundColor": "transparent",
        //     "fillStyle": "solid",
        //     "strokeWidth": 5,
        //     "strokeStyle": "solid",
        //     "roughness": 0,
        //     "opacity": 100,
        //     "groupIds": [],
        //     "frameId": null,
        //     // label: {
        //     //   text: "W!",
        //     // },
        //     "roundness": {
        //         "type": 2
        //     },
        //     "seed": 558669987,
        //     "version": 104,
        //     "versionNonce": 129937571,
        //     "isDeleted": false,
        //     // "boundElements": null,
        //     "updated": Date.now(),
        //     "link": null,
        //     "locked": false,
        //     "points": [
        //         [
        //             0,
        //             0
        //         ],
        //         // [
        //         //     1593.6763340305283,
        //         //     479.6479390634465
        //         // ]
        //     ],
        //     "lastCommittedPoint": null,
        //     // start: { id: tab.opener },
        //     // end: { id: tab.id },
        //     "startBinding": {
        //         "elementId": tab.opener,
        //         "focus": -0.8789630348629817,
        //         "gap": 8.425658980278058
        //     },
        //     "endBinding": {
        //         "elementId": tab.id,
        //         "focus": 0.3518163611168617,
        //         "gap": 6.8672376511322
        //     },
        //     "startArrowhead": null,
        //     "endArrowhead": "arrow",
        //     // "elbowed": false
        // })
      }
    })

    arrows.forEach(arrow => {
      if (!elems[arrow.startBinding.elementId]) {
        return
      }
      arrow.x = elems[arrow.startBinding.elementId].x + tabWidth
      arrow.y = elems[arrow.startBinding.elementId].y

      arrow.points.push([
        elems[arrow.endBinding.elementId].x, elems[arrow.endBinding.elementId].y
      ])
    })
    return [...Object.values(elems), ...(arrows)] // convertToExcalidrawElements
  })
  
  let savedState
  let excalidrawData = $derived({
    "type": "excalidraw",
    "version": 2,
    "source": "isolated-app://q7gwzstrnayerkwkmc37jaj3dtytlmwtg3skjal6bmqkhcedq6mqaaac",
    elements,
    "files": {},
    appState: (() => {
      // Load saved view state from localStorage
      savedState = loadViewState(data.spaceMeta.activeSpace)
      
      return {
        currentItemRoughness: 0, // 0 = precise/architect style
        currentItemStrokeColor: "#6c757d", // Default line color to mid gray
        currentItemFontSize: 40, // Double the standard font size (20px -> 40px)
        viewBackgroundColor: "#0000",
        gridSize: 20,
        gridStep: 5,
        gridModeEnabled: false,
        zoom: { value: savedState?.zoom ?? 0.35 }, // Use saved zoom or default to 35%
        scrollX: savedState?.scrollX ?? -100, // Use saved scrollX or default
        scrollY: savedState?.scrollY ?? 0 // Use saved scrollY or default
      }
    })()
  })

  let {
    onChange = (e) => {},
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
    onFrameFocus = () => {},
    onFrameBlur = () => {},
    getEnabledUserMods = () => { return { css: [], js: [] } },
    controlledFrameSupported
  } = $props()
  
  let container
  let root
  let excalidrawAPI = $state(null)
  let currentZoom = $derived(excalidrawData?.appState?.zoom?.value || 0.35)

  $effect(() => {
    excalidrawAPI?.updateScene(excalidrawData)
  })
  
  onMount(() => {
    root = ReactDOM.createRoot(container)
    const element = React.createElement(ExcalidrawReact, {
      initialData: excalidrawData,
      onChange: throttle((elements, appState, files) => {
        // Update zoom level for CSS custom property
        if (appState?.zoom?.value !== undefined) {
          currentZoom = appState.zoom.value
        }
        
        // Save view state to localStorage
        if (appState?.scrollX !== undefined && appState?.scrollY !== undefined && appState?.zoom?.value !== undefined) {
          if (savedState?.scrollX !== appState.scrollX || savedState?.scrollY !== appState.scrollY || savedState?.zoom?.value !== appState.zoom.value) {
            saveViewState(data.spaceMeta.activeSpace, appState.scrollX, appState.scrollY, appState.zoom.value)
          }
        }

        for (const elem of elements) {
          if (elem.isDeleted) {
            data.closeTab(data.spaceMeta.activeSpace, elem.id)
            continue
          }
          const version = versions.get(elem.id)
          if (version && elem.version !== version) {
            const elemCanvData = data.docs[elem.id]?.canvas?.[data.spaceMeta.activeSpace]
            if (!elemCanvData || elemCanvData.x !== elem.x || elemCanvData.y !== elem.y || elemCanvData.width !== elem.width || elemCanvData.height !== elem.height) {
              data.updateTab(elem.id, { canvas: { [data.spaceMeta.activeSpace]: { x: elem.x, y: elem.y, width: elem.width, height: elem.height } } })
            } else {
              versions.set(elem.id, elem.version)
            }
          }
        }

        onChange(elements, appState, files)
        console.log('onChange', elements, appState)
      }, 1000),
      onPointerUpdate,
      excalidrawAPI: (api) => {
        if (excalidrawAPI === null) {
          excalidrawAPI = api
        }
      },
      UIOptions,
      renderTopRightUI: null,
      viewModeEnabled: false,
      zenModeEnabled: true,
      gridModeEnabled: false,
      theme: 'light',
      langCode: 'en',
      autoFocus: true,
      detectScroll: true,
      handleKeyboardGlobally: false,
      validateEmbeddable: true, // Disable embed validation true means dont validate, false is enabled validation, do not change.
      renderEmbeddable: (element, appState) => {
        const link = element.link
        if (!link) {
            console.log('no link', element)
            return null
        }
        
        return React.createElement(FrameWrapper, {
          element,
          controlledFrameSupported,
          onFrameFocus,
          onFrameBlur,
          getEnabledUserMods
        })
      }
    })
    root.render(element)
  })

  let loaded = $state(false)
  setTimeout(() => {
    loaded = true
  }, 100)

  function detach () {
    if (root) {
        root.unmount()
    }

		return {
			duration: 0
		}
	}
</script>

<div 
  out:detach|global
  bind:this={container} 
  class="excalidraw-container"
  class:loaded={loaded}
  style="width: 100%; height: 100%; --excalidraw-zoom: {currentZoom};"
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

    :global(.excalidraw__embeddable-container) {
      border-radius: var(--embeddable-radius, 8px); 
      border: 1px solid #bababa;
    }

    :global(.excalidraw__embeddable-container.is-hovered::after) {
        content: '↗︎';
        color: rgba(255, 255, 255, 0.7);
        position: absolute;
        top: -16px;
        right: -17px;
        width: 20px;
        height: 20px;
        /* background-color: red; */
        border-radius: 10px;
        /* border: 1px solid green; */
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        transform: scale(calc(1 / var(--excalidraw-zoom, 0.35)));
        transform-origin: center;
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


<!-- // For shapes:
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

// console.log(convertToExcalidrawElements([{
  //         type: "rectangle",
  //         id: 'a',
  //         x: 50,
  //         y: 250,
  //         width: 200,
  //         height: 100,
  //         backgroundColor: "#c0eb75",
  //         strokeWidth: 2,
  //       },
  //       {
  //         id: 'b',
  //         type: "ellipse",
  //         x: 300,
  //         y: 250,
  //         width: 200,
  //         height: 100,
  //         backgroundColor: "#ffc9c9",
  //         strokeStyle: "dotted",
  //         fillStyle: "solid",
  //         strokeWidth: 2,
  //       },
  //       {
  //         id: 'c',
  //         type: "diamond",
  //         x: 550,
  //         y: 250,
  //         width: 200,
  //         height: 100,
  //         backgroundColor: "#a5d8ff",
  //         strokeColor: "#1971c2",
  //         strokeStyle: "dashed",
  //         fillStyle: "cross-hatch",
  //         strokeWidth: 2,
  //       },
  //       {
  //         "id": "opener:a:b",
  //         "type": "arrow",
  //         x: 50,
  //         y: 250,
  //         start: { id: 'a' },
  //         end: { id: 'b' }
  //       }
  // ])) -->
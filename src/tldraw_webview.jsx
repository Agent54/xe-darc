import React from 'react'
import ReactDOM from 'react-dom/client'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { WebViewShapeUtil } from './shapes/WebViewShape'
import { getAssetUrls } from '@tldraw/assets/selfHosted'

const customShapeUtils = [WebViewShapeUtil]

function TLDrawWebViewExample() {


  const onMount = (instance) => {


    const snapshot = instance.getSnapshot();

    console.log(snapshot);
    
    if(instance.getRenderingShapes().length === 0) {

      // // Create a webview shape at a random position
      instance.createShape({
        type: 'webview',
        x: Math.random() * 500,
        y: Math.random() * 500,
        props: { url:  'https://google.com' }
      })

      instance.createShape({
        type: 'webview',
        x: Math.random() * 500,
        y: Math.random() * 500,
        props: { url:  'https://claude.ai/new' }
      })

      instance.createShape({
        type: 'webview',
        x: Math.random() * 500,
        y: Math.random() * 500,
        props: { url:  'https://userandagents.com' }
      })
    }
  
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw
        persistenceKey="tldraw-webview"
        assetUrls={getAssetUrls()}
        shapeUtils={customShapeUtils}
        onMount={onMount}
      />
    </div>
  )
}

// Mount the app
const app = document.getElementById('app')
if (app) {
  ReactDOM.createRoot(app).render(
    <React.StrictMode>
      <TLDrawWebViewExample />
    </React.StrictMode>
  )
} 
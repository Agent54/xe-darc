import React from 'react'
import ReactDOM from 'react-dom/client'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { ReactTestShapeUtil } from './shapes/ReactTestShape'

const customShapeUtils = [ReactTestShapeUtil]

function ReactTest() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw 
        shapeUtils={customShapeUtils}
        onMount={(editor) => {
          // Create our custom shape when the editor mounts
          editor.createShapes([
            {
              type: 'react-test',
              x: 100,
              y: 100,
            }
          ])
        }}
      />
    </div>
  )
}

// Mount the app
const app = document.getElementById('app')
if (app) {
  ReactDOM.createRoot(app).render(
    <React.StrictMode>
      <ReactTest />
    </React.StrictMode>
  )
} 
import React from 'react'
import { BaseBoxShapeTool, createCustomShapeId } from 'tldraw'

export const WebViewTool = {
  ...BaseBoxShapeTool,
  id: 'webview',
  icon: 'browser',
  label: 'WebView',
  
  onCreate: (shape) => {
    return {
      id: createCustomShapeId(),
      type: 'webview',
      x: shape.x,
      y: shape.y,
      props: {
        url: 'https://google.com',
        w: shape.props.w,
        h: shape.props.h
      }
    }
  }
} 
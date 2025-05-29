import React from 'react'
import { BaseBoxShape, createCustomShapeId } from 'tldraw'

// Define the WebView shape
export const WebViewShape = {
  ...BaseBoxShape,
  type: 'webview',
  props: {
    url: { type: 'string', default: 'https://google.com' },
    w: { type: 'number', default: 500 },
    h: { type: 'number', default: 400 }
  },

  // Component that renders the shape
  component: function WebViewComponent(props) {
    const { 
      shape,
      events,
      isEditing,
      isGhost,
      meta,
      opacity,
      scale
    } = props

    return (
      <div 
        {...events} 
        style={{ 
          width: shape.props.w,
          height: shape.props.h,
          opacity,
          pointerEvents: isGhost ? 'none' : 'all'
        }}
      >
        <controlledframe
          id={`frame-${shape.id}`}
          src={shape.props.url}
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
      </div>
    )
  }
} 
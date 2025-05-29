import React from 'react'
import { HTMLContainer, ShapeUtil, Rectangle2d, TLBaseShape } from 'tldraw'

// Define the shape type
export type ReactTestShape = TLBaseShape<
  'react-test',
  {
    w: number
    h: number
    message: string
  }
>

// Create the shape util
export class ReactTestShapeUtil extends ShapeUtil<ReactTestShape> {
  static type = 'react-test'

  getDefaultProps(): ReactTestShape['props'] {
    return {
      w: 200,
      h: 100,
      message: 'Hello from React!'
    }
  }

  getGeometry(shape: ReactTestShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  component(shape: ReactTestShape) {
    return (
      <HTMLContainer style={{ 
        width: shape.props.w,
        height: shape.props.h,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '2em',
        background: 'white',
        border: '1px solid black',
        borderRadius: '8px'
      }}>
        <h1>{shape.props.message}</h1>
      </HTMLContainer>
    )
  }

  indicator(shape: ReactTestShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
} 
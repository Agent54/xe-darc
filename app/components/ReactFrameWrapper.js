import {mount, unmount} from 'svelte'
import React from 'react'
import Frame from './Frame.svelte'

// Create a React component that mounts the Svelte ControlledFrame
export default  class FrameWrapper extends React.Component {
    constructor(props) {
      super(props)
      this.containerRef = React.createRef()
      this.frameInstance = null
    }
    
    componentDidMount() {
      if (this.containerRef.current) {  
        this.frameInstance = mount(Frame, {
          target: this.containerRef.current,
          props: {
            style: 'width: 100%; height: 100%;',
            tabId: this.props.element.id,
            headerPartOfMain: false,
            isScrolling: false,
            onFrameFocus: () => this.props.onFrameFocus(this.props.element.id),
            onFrameBlur: this.props.onFrameBlur || (() => {}),
            controlledFrameSupported: this.props.controlledFrameSupported,
           //  userMods: this.props.getEnabledUserMods(this.props.tabs[0])
          }
        })
      }
    }
    
    async componentWillUnmount() {
      if (this.frameInstance) {
        await unmount(this.frameInstance, { outro: true })
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

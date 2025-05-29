import React from 'react'
import { HTMLContainer, BaseBoxShapeUtil, Rectangle2d, TLBaseShape, useEditor } from 'tldraw'

// Define the shape type
export type WebViewShape = TLBaseShape<
  'webview',
  {
    w: number
    h: number
    url: string
    title?: string
    isMinimized?: boolean
  }
>
  
// Create the shape util
export class WebViewShapeUtil extends BaseBoxShapeUtil<WebViewShape> {
  static type = 'webview'

  getDefaultProps(): WebViewShape['props'] {
    return {
      w: 500,
      h: 400,
      url: 'https://google.com',
      title: '',
      isMinimized: false
    }
  }

  component(shape: WebViewShape) {
    const editor = useEditor()
    const [title, setTitle] = React.useState(shape.props.title || '')
    const [isLoading, setIsLoading] = React.useState(false)
    const [loadingProgress, setLoadingProgress] = React.useState(0)
    const [isDarkMode, setIsDarkMode] = React.useState(false)
    const iframeRef = React.useRef(null)
    const parentId = React.useRef<string | null>(null)
    
    console.log(`[WebViewShape] Rendering component for shape ${shape.id}`, { url: shape.props.url, title })
    
    // Handle title updates and loading state
    React.useEffect(() => {
      console.log(`[WebViewShape] Setting up effect for ${shape.id}`)
      const frame = iframeRef.current as HTMLIFrameElement | null
      if (!frame) {
        console.warn(`[WebViewShape] No frame reference found for ${shape.id}`)
        return
      }

      let titleCheckInterval: number | null = null

      const checkTitle = async () => {
        try {
          const result = await (frame as any).executeScript({
            code: 'document.title'
          })
          const newTitle = result[0]
          if (newTitle && newTitle !== title) {
            console.log(`[WebViewShape] Title updated for ${shape.id}:`, newTitle)
            setTitle(newTitle)
          }
        } catch (e) {
          console.warn(`[WebViewShape] Error getting title for ${shape.id}:`, e)
        }
      }

      const handleLoadStart = (e: any) => {
        console.log(`[WebViewShape] Load started for ${shape.id}`)
        setIsLoading(true)
        setLoadingProgress(0)
      }

      const handleLoadCommit = (e: any) => {
        console.log(`[WebViewShape] Load committed for ${shape.id}`, { url: e.url })
        setLoadingProgress(30)
      }

      const handleContentLoad = () => {
        console.log(`[WebViewShape] Content loaded for ${shape.id}`)
        setLoadingProgress(70)
        setTimeout(checkTitle, 100)
      }

      const handleLoadStop = () => {
        console.log(`[WebViewShape] Load stopped for ${shape.id}`)
        setIsLoading(false)
        setLoadingProgress(100)
        // Fade out progress bar after completion
        setTimeout(() => setLoadingProgress(0), 500)
        
        // Set up periodic title checks after load is complete
        if (titleCheckInterval) {
          window.clearInterval(titleCheckInterval)
        }
        titleCheckInterval = window.setInterval(checkTitle, 1000)
      }

      const handleLoadAbort = (e: any) => {
        console.log(`[WebViewShape] Load aborted for ${shape.id}`, e)
        setIsLoading(false)
        setLoadingProgress(0)
      }

      const handleLoadError = (e: any) => {
        console.log(`[WebViewShape] Load error for ${shape.id}`, e)
        setIsLoading(false)
        setLoadingProgress(0)
      }

      // Add all relevant load event listeners
      frame.addEventListener('loadstart', handleLoadStart)
      frame.addEventListener('loadcommit', handleLoadCommit)
      frame.addEventListener('contentload', handleContentLoad)
      frame.addEventListener('loadstop', handleLoadStop)
      frame.addEventListener('loadabort', handleLoadAbort)
      frame.addEventListener('loaderror', handleLoadError)

      return () => {
        console.log(`[WebViewShape] Cleaning up effect for ${shape.id}`)
        frame.removeEventListener('loadstart', handleLoadStart)
        frame.removeEventListener('loadcommit', handleLoadCommit)
        frame.removeEventListener('contentload', handleContentLoad)
        frame.removeEventListener('loadstop', handleLoadStop)
        frame.removeEventListener('loadabort', handleLoadAbort)
        frame.removeEventListener('loaderror', handleLoadError)
        if (titleCheckInterval) {
          window.clearInterval(titleCheckInterval)
        }
      }
    }, [shape.id, shape.props.url, title])

    // // Handle messages from the frame
    // React.useEffect(() => {
    //   const frame = iframeRef.current as any
    //   if (!frame) return

    //   const handleMessage = (e: any) => {
    //     console.log(`[WebViewShape] Message received for ${shape.id}`, e.data)
        
    //     try {
    //       if (e.data.type === 'POPUP_CLOSE') {
    //         // If this is a popup window, notify parent and close self
    //         if (parentId.current) {
    //           // Find parent window and send message
    //           const parentFrame = document.querySelector(`#frame-${parentId.current}`) as any
    //           if (parentFrame?.contentWindow) {
    //             parentFrame.contentWindow.postMessage({ type: 'POPUP_CLOSED', data: e.data }, '*')
    //           }
    //           // Delete this shape
    //           editor.deleteShape(shape.id)
    //         }
    //       }
    //       else if (e.data.type === 'POPUP_READY') {
    //         // Send initialization data to popup
    //         frame.contentWindow?.postMessage({
    //           type: 'POPUP_INIT',
    //           parentId: shape.id
    //         }, '*')
    //       }
    //     } catch (err) {
    //       console.warn(`[WebViewShape] Error handling message for ${shape.id}:`, err)
    //     }
    //   }

    //   frame.addEventListener('message', handleMessage)
    //   return () => frame.removeEventListener('message', handleMessage)
    // }, [editor, shape.id, parentId])

    // Handle new window events
    React.useEffect(() => {
      const frame = iframeRef.current as any
      if (!frame) return

      const handleNewWindow = (e: any) => {
        console.log(`[WebViewShape] New window requested for ${shape.id}`, {
          targetUrl: e.targetUrl,
          initialWidth: e.initialWidth,
          initialHeight: e.initialHeight,
          name: e.name
        })

        // Create a new webview shape for the popup
        const popupShape = editor.createShape({
          type: 'webview',
          x: shape.x + 50,
          y: shape.y + 50,
          props: {
            url: e.targetUrl,
            w: e.initialWidth || 800,
            h: e.initialHeight || 600
          }
        })

        // Create a new controlledframe element first
        const newFrame = document.createElement('controlled-frame')
        newFrame.id = `frame-${popupShape.id}`
        newFrame.style.width = '100%'
        newFrame.style.height = '100%'
        newFrame.style.border = 'none'
        newFrame.setAttribute('allowpopups', 'true')
        newFrame.setAttribute('allowpopupstoescapesandbox', 'true')
        newFrame.setAttribute('partition', 'persist:myapp')

        // Find the frame container in the popup shape
        const container = document.querySelector(`#shape-${popupShape.id}`)?.querySelector('.frame-container')
        if (container) {
          // Add frame to container
          container.appendChild(newFrame)

          // Then attach the window
          e.window.attach(newFrame)

          // Focus the new window
          editor.select(popupShape.id)
          editor.bringToFront([popupShape.id])
        }

        // Prevent default
        e.preventDefault()
      }

      frame.addEventListener('newwindow', handleNewWindow)

      return () => {
        frame.removeEventListener('newwindow', handleNewWindow)
      }
    }, [editor, shape.id, shape.x, shape.y])

    const handleFocus = React.useCallback(() => {
      console.log(`[WebViewShape] Focus event for ${shape.id}`)
      editor.select(shape.id)
      editor.bringToFront([shape.id])
    }, [editor, shape.id])

    const handleClose = React.useCallback((e: React.SyntheticEvent) => {
      console.log(`[WebViewShape] Close event for ${shape.id}`)
      e.stopPropagation()
      editor.deleteShape(shape.id)
    }, [editor, shape.id])

    const handleMinimize = React.useCallback((e: React.SyntheticEvent) => {
      console.log(`[WebViewShape] Minimize event for ${shape.id}`, { isMinimized: !shape.props.isMinimized })
      e.stopPropagation()
      editor.updateShape<WebViewShape>({
        id: shape.id,
        type: 'webview',
        props: { ...shape.props, isMinimized: !shape.props.isMinimized }
      })
    }, [editor, shape.id, shape.props.isMinimized])

    const handleMaximize = React.useCallback((e: React.SyntheticEvent) => {
      console.log(`[WebViewShape] Maximize event for ${shape.id}`)
      e.stopPropagation()
      editor.updateShape<WebViewShape>({
        id: shape.id,
        type: 'webview',
        props: { ...shape.props, w: 800, h: 600 }
      })
    }, [editor, shape.id])

    const handleReload = React.useCallback((e: React.SyntheticEvent) => {
      console.log(`[WebViewShape] Reload triggered for ${shape.id}`)
      e.stopPropagation()
      const frame = iframeRef.current as any
      if (frame) {
        frame.reload()
      }
    }, [shape.id])

    const handleDarkMode = React.useCallback(async (e: React.MouseEvent) => {
      console.log(`[WebViewShape] Dark mode toggle for ${shape.id}`)
      e.stopPropagation()
      const frame = iframeRef.current as any
      if (!frame) return

      const newDarkMode = !isDarkMode
      setIsDarkMode(newDarkMode)

      try {
        // Set color scheme preference
        await frame.executeScript({
          code: `
            (function() {
              // Override the prefers-color-scheme media query
              const colorScheme = '${newDarkMode ? 'dark' : 'light'}';
              const meta = document.querySelector('meta[name="color-scheme"]') 
                || document.createElement('meta');
              meta.name = 'color-scheme';
              meta.content = colorScheme;
              if (!meta.parentNode) {
                document.head.appendChild(meta);
              }

              // Force immediate re-evaluation of media queries
              document.documentElement.style.colorScheme = colorScheme;
            })();
          `
        });
      } catch (e) {
        console.warn(`[WebViewShape] Error toggling dark mode for ${shape.id}:`, e)
      }
    }, [shape.id, isDarkMode])

    const handleFullscreen = React.useCallback((e: React.SyntheticEvent) => {
      console.log(`[WebViewShape] Fullscreen toggle for ${shape.id}`)
      e.stopPropagation()
      const frame = iframeRef.current as HTMLElement
      if (!frame) return

      try {
        if (!document.fullscreenElement) {
          console.log(`[WebViewShape] Requesting fullscreen for ${shape.id}`)
          frame.requestFullscreen().catch(e => {
            console.warn(`[WebViewShape] Error requesting fullscreen:`, e)
          })
        } else {
          console.log(`[WebViewShape] Exiting fullscreen for ${shape.id}`)
          document.exitFullscreen().catch(e => {
            console.warn(`[WebViewShape] Error exiting fullscreen:`, e)
          })
        }
      } catch (e) {
        console.warn(`[WebViewShape] Error toggling fullscreen:`, e)
      }
    }, [shape.id])

    React.useEffect(() => {
      console.log(`[WebViewShape] URL changed for ${shape.id}`, { url: shape.props.url })
    }, [shape.props.url, shape.id])

    const height = shape.props.isMinimized ? 40 : shape.props.h

    return (
      <HTMLContainer style={{ 
        width: shape.props.w,
        height,
        pointerEvents: 'all',
        display: 'flex',
        flexDirection: 'column',
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'height 0.2s ease-in-out',
        position: 'relative'
      }}>
        <div 
          onPointerDown={handleFocus}
          style={{
            padding: '8px',
            background: '#f5f5f5',
            borderBottom: shape.props.isMinimized ? 'none' : '1px solid #ccc',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            userSelect: 'none',
            cursor: 'move',
            position: 'relative'
          }}
        >
          {/* Loading Progress Bar */}
          {loadingProgress > 0 && (
            <div style={{
              position: 'absolute',
              bottom: -1,
              left: 0,
              width: `${loadingProgress}%`,
              height: '2px',
              background: '#2196f3',
              transition: 'width 0.3s ease-out',
              zIndex: 2
            }} />
          )}

          <div style={{ 
            display: 'flex', 
            gap: '8px',
            position: 'relative',
            zIndex: 1 
          }}>
            <button 
              onClick={handleClose}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '12px', 
                height: '12px',
                borderRadius: '50%', 
                background: '#ff5f57',
                border: 'none', 
                cursor: 'pointer',
                padding: 0
              }} 
            />
            <button 
              onClick={handleMinimize}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '12px', 
                height: '12px',
                borderRadius: '50%', 
                background: '#ffbd2e',
                border: 'none', 
                cursor: 'pointer',
                padding: 0
              }} 
            />
            <button 
              onClick={handleMaximize}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                width: '12px', 
                height: '12px',
                borderRadius: '50%', 
                background: '#28c940',
                border: 'none', 
                cursor: 'pointer',
                padding: 0
              }} 
            />
          </div>

          <div style={{
            flex: 1,
            textAlign: 'center',
            fontSize: '12px',
            color: '#666',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: '36px',
            marginLeft: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            {isLoading && (
              <div style={{
                width: '12px',
                height: '12px',
                border: '2px solid #f3f3f3',
                borderTop: '2px solid #2196f3',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            )}
            {shape.props.url}{title && ` - ${title}`}
          </div>

          {/* Right side controls */}
          <div style={{ 
            display: 'flex', 
            gap: '8px',
            position: 'relative',
            zIndex: 1 
          }}>
            <button 
              onClick={handleReload}
              onPointerDown={(e) => e.stopPropagation()}
              title="Reload"
              style={{
                width: '12px', 
                height: '12px',
                borderRadius: '50%', 
                background: '#2196f3',
                border: 'none', 
                cursor: 'pointer',
                padding: 0,
                transition: 'transform 0.2s ease'
              }} 
            />
            <button 
              onClick={handleFullscreen}
              onPointerDown={(e) => e.stopPropagation()}
              title="Toggle Fullscreen"
              style={{
                width: '12px', 
                height: '12px',
                borderRadius: '50%', 
                background: '#9c27b0',
                border: 'none', 
                cursor: 'pointer',
                padding: 0,
                opacity: document.fullscreenElement ? 1 : 0.5,
                transition: 'opacity 0.2s ease'
              }} 
            />
            <button 
              onClick={handleDarkMode}
              onPointerDown={(e) => e.stopPropagation()}
              title={isDarkMode ? "Disable Dark Mode" : "Enable Dark Mode"}
              style={{
                width: '12px', 
                height: '12px',
                borderRadius: '50%', 
                background: '#333',
                border: 'none', 
                cursor: 'pointer',
                padding: 0,
                opacity: isDarkMode ? 1 : 0.5,
                transition: 'opacity 0.2s ease'
              }} 
            />
          </div>
        </div>

        {!shape.props.isMinimized && (
          <div style={{ flex: 1, position: 'relative' }}>
            <controlledframe
              ref={iframeRef}
              id={`frame-${shape.id}`}
              src={shape.props.url}
              partition={'persist:myapp'}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                opacity: isLoading ? 0.7 : 1,
                transition: 'opacity 0.2s ease-out'
              }}
            />
          </div>
        )}

        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </HTMLContainer>
    )
  }

  indicator(shape: WebViewShape) {
    return (
      <rect 
        width={shape.props.w} 
        height={shape.props.h}
        rx={8}
        ry={8}
      />
    )
  }
} 
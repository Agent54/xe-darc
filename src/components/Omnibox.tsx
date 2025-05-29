import React from 'react'
import { Editor } from 'tldraw'

export function Omnibox({ editor }: { editor: Editor }) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [url, setUrl] = React.useState('')

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && e.metaKey) {
        e.preventDefault()
        setIsOpen(true)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url) {
      editor.createShapes([{
        type: 'webview',
        x: 100,
        y: 100,
        props: { url }
      }])
      setUrl('')
      setIsOpen(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: '20%',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'white',
      padding: '16px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      zIndex: 1000,
      width: '400px'
    }}>
      <form onSubmit={handleSubmit}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL (⌘+K)"
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
          autoFocus
        />
      </form>
    </div>
  )
} 
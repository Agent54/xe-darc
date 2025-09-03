(() => {
  // FIXME: opening in devtools
    if (window.SELECT_NATIVE_FIX) window.SELECT_NATIVE_FIX.disable()
  
    const MOVE_EPS = 3
    let openMenu = null
    const off = []
  
    const within = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    const findSelectInPath = e => {
      const path = e.composedPath?.() || []
      for (const n of path) {
        if (n && n.tagName === 'SELECT') return n
        if (n && n.shadowRoot) {
          // if retargeted, try deeper
          const t = n.querySelector?.('select')
          if (t) return t
        }
      }
      return null
    }
  
    const copyTypography = (from, to) => {
      const cs = getComputedStyle(from)
      to.style.fontFamily = cs.fontFamily
      to.style.fontSize = cs.fontSize
      to.style.lineHeight = cs.lineHeight
      to.style.letterSpacing = cs.letterSpacing
      to.style.fontWeight = cs.fontWeight
    }
  
    const applyValue = (sel, idx) => {
      const opts = Array.from(sel.options)
      if (idx < 0 || idx >= opts.length) return
      opts.forEach((o, i) => o.selected = i === idx)
      sel.value = opts[idx].value
      sel.dispatchEvent(new Event('input', { bubbles: true }))
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    }
  
    const placeOverlayToRect = (overlay, rect) => {
      overlay.style.left = rect.left + 'px'
      overlay.style.width = rect.width + 'px'
      const maxH = Math.min(320, Math.floor(window.innerHeight * 0.6))
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < 200 && rect.top > maxH) {
        overlay.style.top = rect.top - 3 - maxH + 'px'
        overlay.style.maxHeight = maxH + 'px'
      } else {
        overlay.style.top = rect.bottom + 3 + 'px'
        overlay.style.maxHeight = maxH + 'px'
      }
    }
  
    const buildOverlay = sel => {
      const overlay = document.createElement('div')
      overlay.style.position = 'fixed'
      overlay.style.zIndex = '2147483647'
      overlay.style.overflowY = 'auto'
      overlay.style.background = '#0a0a0ae0'
      overlay.style.border = '1px solid rgba(255,255,255,0.15)'
      overlay.style.borderRadius = '10px'
      overlay.style.boxShadow = '0 16px 40px rgba(0,0,0,0.5)'
      overlay.style.backdropFilter = 'blur(4px)'
    //   overlay.style.padding = '4px'
      overlay.style.userSelect = 'none'
      overlay.style.whiteSpace = 'nowrap'
      overlay.style.maxWidth = 'calc(100vw - 16px)'
      copyTypography(sel, overlay)
      overlay.setAttribute('role', 'listbox')
      overlay.setAttribute('aria-labelledby', sel.id || '')
  
      const opts = Array.from(sel.options)
      let activeIndex = Math.max(0, opts.findIndex(o => o.selected))
  
      const render = () => {
        overlay.innerHTML = ''
        opts.forEach((o, idx) => {
          const item = document.createElement('div')
          item.setAttribute('role', 'option')
          item.dataset.index = String(idx)
          item.textContent = o.textContent
          item.style.display = 'block'
          item.style.padding = '6px 8px'
          item.style.borderRadius = '6px'
          item.style.cursor = 'default'
          item.style.whiteSpace = 'nowrap'
          item.style.overflow = 'hidden'
          item.style.textOverflow = 'ellipsis'
          copyTypography(sel, item)
          item.style.color = idx === activeIndex ? '#fff' : '#d1d5db'
          item.style.background = idx === activeIndex ? 'rgba(255,255,255,0.08)' : 'transparent'
          overlay.appendChild(item)
        })
        const active = overlay.children[activeIndex]
        if (active) {
          const r = active.getBoundingClientRect()
          const or = overlay.getBoundingClientRect()
          if (r.top < or.top) overlay.scrollTop += r.top - or.top
          else if (r.bottom > or.bottom) overlay.scrollTop += r.bottom - or.bottom
        }
      }
  
      const highlightFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y)
        if (!el || el.parentNode !== overlay) return
        const idx = Number(el.dataset.index)
        if (!Number.isNaN(idx) && idx !== activeIndex) {
          activeIndex = idx
          render()
        }
      }
  
      const selectFromPoint = (x, y) => {
        const el = document.elementFromPoint(x, y)
        if (el && el.parentNode === overlay) {
          const idx = Number(el.dataset.index)
          if (!Number.isNaN(idx)) applyValue(sel, idx)
          return true
        }
        return false
      }
  
      const rect = sel.getBoundingClientRect()
      placeOverlayToRect(overlay, rect)
      render()
      document.body.appendChild(overlay)
  
      return { overlay, highlightFromPoint, selectFromPoint, setIndex: i => { activeIndex = i; render() } }
    }
  
    const close = () => {
      if (!openMenu) return
      window.removeEventListener('pointermove', onWindowPointerMove, true)
      window.removeEventListener('pointerup', onWindowPointerUp, true)
      window.removeEventListener('pointerdown', onWindowOutsideDown, true)
      window.removeEventListener('keydown', onWindowKey, true)
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition, true)
      openMenu.overlay.remove()
      openMenu = null
    }
  
    const onReposition = () => {
      if (!openMenu) return
      const r = openMenu.sel.getBoundingClientRect()
      placeOverlayToRect(openMenu.overlay, r)
    }
  
    const onWindowKey = e => {
      if (!openMenu) return
      const opts = openMenu.sel.options
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        openMenu.active = Math.min(openMenu.active + 1, opts.length - 1)
        openMenu.setIndex(openMenu.active)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        openMenu.active = Math.max(openMenu.active - 1, 0)
        openMenu.setIndex(openMenu.active)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        applyValue(openMenu.sel, openMenu.active)
        close()
      }
    }
  
    const onWindowPointerMove = e => {
      if (!openMenu || !openMenu.down) return
      const dx = Math.abs(e.clientX - openMenu.down.x)
      const dy = Math.abs(e.clientY - openMenu.down.y)
      if (dx > MOVE_EPS || dy > MOVE_EPS) {
        openMenu.moved = true
        openMenu.highlightFromPoint(e.clientX, e.clientY)
      }
    }
  
    const onWindowPointerUp = e => {
      if (!openMenu) return
      const inSelect = within(openMenu.sel.getBoundingClientRect(), e.clientX, e.clientY)
      const moved = !!openMenu.moved
  
      // toggle close when already open and user just clicks the select again
      if (openMenu.toggleRequest && inSelect && !moved) {
        close()
        return
      }
  
      // initial simple click → keep menu open
      if (openMenu.openingClick && inSelect && !moved) {
        openMenu.openingClick = false
        return
      }
  
      // mouseup over item selects and closes, else just close
      if (openMenu.selectFromPoint(e.clientX, e.clientY)) {
        close()
      } else {
        close()
      }
    }
  
    const onWindowOutsideDown = e => {
      if (!openMenu) return
      const path = e.composedPath?.() || []
      if (path.includes(openMenu.overlay) || path.includes(openMenu.sel)) return
      close()
    }
  
    const openForSelect = (sel, e) => {
      const { overlay, highlightFromPoint, selectFromPoint, setIndex } = buildOverlay(sel)
      const active = Math.max(0, Array.from(sel.options).findIndex(o => o.selected))
      openMenu = {
        sel,
        overlay,
        highlightFromPoint,
        selectFromPoint,
        setIndex,
        active,
        down: { x: e.clientX, y: e.clientY, t: performance.now() },
        moved: false,
        openingClick: true,
        toggleRequest: false
      }
      window.addEventListener('pointermove', onWindowPointerMove, true)
      window.addEventListener('pointerup', onWindowPointerUp, true)
      window.addEventListener('pointerdown', onWindowOutsideDown, true)
      window.addEventListener('keydown', onWindowKey, true)
      window.addEventListener('scroll', onReposition, true)
      window.addEventListener('resize', onReposition, true)
    }
  
    const onGlobalPointerDown = e => {
      // close on outside down if menu open and click is outside overlay/select
      if (openMenu) {
        const path = e.composedPath?.() || []
        if (!path.includes(openMenu.overlay) && !path.includes(openMenu.sel)) {
          close()
        }
      }
  
      const sel = findSelectInPath(e)
      if (!sel) return
  
      // block native popup
      e.preventDefault()
      e.stopPropagation()
      sel.focus()
  
      if (openMenu && openMenu.sel === sel) {
        // request toggle on simple click
        openMenu.toggleRequest = true
        openMenu.down = { x: e.clientX, y: e.clientY, t: performance.now() }
        openMenu.moved = false
        return
      }
  
      if (openMenu) close()
      openForSelect(sel, e)
    }
  
    window.addEventListener('pointerdown', onGlobalPointerDown, { capture: true })
    off.push(() => window.removeEventListener('pointerdown', onGlobalPointerDown, { capture: true }))
  
    window.SELECT_NATIVE_FIX = {
      disable () {
        close()
        off.splice(0).forEach(fn => { try { fn() } catch {} })
      }
    }
  })()
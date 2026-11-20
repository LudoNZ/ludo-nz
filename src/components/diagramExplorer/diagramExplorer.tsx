"use client"

import { ReactNode, useCallback, useEffect, useRef, useState } from "react"
import styles from "./diagramExplorer.module.scss"

const MIN_SCALE = 1
const MAX_SCALE = 20
/** keep at least this share of the drawing on screen when panning */
const KEEP_ON_SCREEN = 0.2
/** a press that moves less than this is a tap, left to the drawing */
const DRAG_THRESHOLD_PX = 4

type Mode = "rotate" | "pan"
interface View {
  s: number
  tx: number
  ty: number
}
const FIT: View = { s: 1, tx: 0, ty: 0 }

/** Wraps a drawing (an <svg>) so it can be explored: a button in its
 * corner opens it full-screen, where it zooms and pans — and, for a 3D
 * view, orbits.
 *
 * Out of explore mode it's just the drawing, so the page scrolls over it
 * as normal and nothing is trapped. In explore mode:
 *  - touch: one finger rotates (or pans, with the Rotate/Pan switch),
 *    pinch zooms, two fingers pan
 *  - mouse: drag rotates (or pans), right- or shift-drag pans, the wheel
 *    zooms at the cursor, double-click zooms in there
 *  - +, − and fit buttons; Esc or Done to leave
 *
 * Zoom and pan are a CSS transform on the drawing, so any SVG works as
 * is, stays crisp, and anything inside it that maps pointer positions
 * with getScreenCTM (e.g. the wall plan's draggable corners) still lines
 * up. Elements marked data-explore-skip keep their own drags. */
const DiagramExplorer: React.FC<{
  /** the drawing — or a function of the zoom (1 = fitted, and out of
   * explore mode), for a drawing that keeps its line weights and text the
   * same size on screen and shows things at their true size as it's
   * zoomed in */
  children: ReactNode | ((zoom: number) => ReactNode)
  /** what the drawing is, for the button's label and the full-screen title */
  label: string
  /** a 3D view: one-finger / mouse drag turns it, by this many pixels */
  onOrbit?: (dxPx: number, dyPx: number) => void
  /** shown along the bottom in full-screen (e.g. the 3D view's toggles) */
  toolbar?: ReactNode
  /** fill the parent's height (a fixed-height pane) */
  fill?: boolean
}> = ({ children, label, onOrbit, toolbar, fill = false }) => {
  const [exploring, setExploring] = useState(false)
  const [mode, setMode] = useState<Mode>(onOrbit ? "rotate" : "pan")
  const [view, setView] = useState<View>(FIT)
  const viewRef = useRef(view)
  viewRef.current = view
  const viewportRef = useRef<HTMLDivElement>(null)
  const enterButtonRef = useRef<HTMLButtonElement>(null)

  /** pointers down on the drawing, where each was last */
  const pointers = useRef(new Map<number, { x: number; y: number; pan: boolean; dragging: boolean }>())
  /** a two-finger gesture's starting point */
  const pinch = useRef<{ dist: number; cx: number; cy: number; view: View } | null>(null)

  // orbiting rebuilds the whole 3D scene: at most once a frame
  const orbitAcc = useRef({ dx: 0, dy: 0, frame: 0 })
  const orbit = useCallback(
    (dx: number, dy: number) => {
      if (!onOrbit) return
      const acc = orbitAcc.current
      acc.dx += dx
      acc.dy += dy
      if (acc.frame) return
      acc.frame = requestAnimationFrame(() => {
        onOrbit(acc.dx, acc.dy)
        acc.dx = 0
        acc.dy = 0
        acc.frame = 0
      })
    },
    [onOrbit],
  )

  const clampView = useCallback((v: View): View => {
    const el = viewportRef.current
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s))
    if (!el) return { ...v, s }
    const w = el.clientWidth
    const h = el.clientHeight
    const clamp = (t: number, size: number) => Math.min(size * (1 - KEEP_ON_SCREEN), Math.max(size * KEEP_ON_SCREEN - size * s, t))
    return { s, tx: clamp(v.tx, w), ty: clamp(v.ty, h) }
  }, [])

  /** zoom by k about a point in the viewport */
  const zoomAt = useCallback(
    (k: number, px: number, py: number) => {
      const v = viewRef.current
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * k))
      const r = s / v.s
      setView(clampView({ s, tx: px - (px - v.tx) * r, ty: py - (py - v.ty) * r }))
    },
    [clampView],
  )
  const zoomCentre = (k: number) => {
    const el = viewportRef.current
    if (el) zoomAt(k, el.clientWidth / 2, el.clientHeight / 2)
  }

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewportRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()]
    pinch.current = { dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: viewRef.current }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!exploring) return
    if ((e.target as Element).closest("[data-explore-skip]")) return
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return
    // not captured yet: a tap still reaches what's under it (a post, a wall)
    const p = local(e)
    pointers.current.set(e.pointerId, { ...p, pan: e.button === 2 || e.shiftKey, dragging: false })
    if (pointers.current.size === 2) {
      pointers.current.forEach((q, id) => {
        q.dragging = true
        if (!e.currentTarget.hasPointerCapture(id)) e.currentTarget.setPointerCapture(id)
      })
      startPinch()
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const p = local(e)
    if (!prev.dragging) {
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < DRAG_THRESHOLD_PX) return
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    pointers.current.set(e.pointerId, { ...p, pan: prev.pan, dragging: true })
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const st = pinch.current
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.view.s * (dist / st.dist)))
      const r = s / st.view.s
      // the point under the fingers' first midpoint follows the midpoint
      setView(clampView({ s, tx: cx - (st.cx - st.view.tx) * r, ty: cy - (st.cy - st.view.ty) * r }))
      return
    }
    const dx = p.x - prev.x
    const dy = p.y - prev.y
    if (onOrbit && mode === "rotate" && !prev.pan) orbit(dx, dy)
    else setView((v) => clampView({ s: v.s, tx: v.tx + dx, ty: v.ty + dy }))
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    // two fingers down to one: carry on from where it is, no jump
    if (pointers.current.size === 2) startPinch()
    else pinch.current = null
  }

  // the wheel needs a non-passive listener to stop the page zooming
  useEffect(() => {
    const el = viewportRef.current
    if (!exploring || !el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      // trackpad pinches arrive as ctrl+wheel with small deltas
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      zoomAt(k, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [exploring, zoomAt])

  // full-screen: the page behind doesn't scroll, Esc leaves
  useEffect(() => {
    if (!exploring) return
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExploring(false)
      else if (e.key === "+" || e.key === "=") zoomCentre(1.4)
      else if (e.key === "-") zoomCentre(1 / 1.4)
      else if (e.key === "0") setView(FIT)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      root.style.overflow = before
      window.removeEventListener("keydown", onKey)
    }
    // zoomCentre only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploring])

  const enter = () => {
    setView(FIT)
    setExploring(true)
  }
  const leave = () => {
    setExploring(false)
    setView(FIT)
    pointers.current.clear()
    pinch.current = null
    requestAnimationFrame(() => enterButtonRef.current?.focus())
  }

  const hint = onOrbit
    ? mode === "rotate"
      ? "Drag to turn · pinch or scroll to zoom · two fingers or right-drag to pan"
      : "Drag to pan · pinch or scroll to zoom"
    : "Drag to pan · pinch or scroll to zoom · double-click to zoom in"

  return (
    <div
      className={`${styles.root} ${fill ? styles.fill : ""} ${exploring ? styles.exploring : ""}`}
      role={exploring ? "dialog" : undefined}
      aria-modal={exploring || undefined}
      aria-label={exploring ? label : undefined}
    >
      {exploring && (
        <div className={styles.topBar}>
          <strong className={styles.title}>{label}</strong>
          {onOrbit && (
            <div className={styles.modeSwitch} role="radiogroup" aria-label="One-finger drag">
              {(["rotate", "pan"] as Mode[]).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? styles.modeActive : ""} onClick={() => setMode(m)}>
                  {m === "rotate" ? "Turn" : "Pan"}
                </button>
              ))}
            </div>
          )}
          <button type="button" className={styles.done} onClick={leave}>
            Done
          </button>
        </div>
      )}

      <div
        ref={viewportRef}
        className={styles.viewport}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={exploring ? (e) => e.preventDefault() : undefined}
        onDoubleClick={
          exploring && !onOrbit
            ? (e) => {
                if ((e.target as Element).closest("[data-explore-skip]")) return
                const p = local(e)
                zoomAt(2, p.x, p.y)
              }
            : undefined
        }
      >
        <div className={styles.content} style={exploring ? { transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` } : undefined}>
          {typeof children === "function" ? children(exploring ? view.s : 1) : children}
        </div>
        {exploring && (
          <div className={styles.zoomButtons} data-explore-skip>
            <button type="button" aria-label="Zoom in" onClick={() => zoomCentre(1.4)}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 4v12M4 10h12" />
              </svg>
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => zoomCentre(1 / 1.4)}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 10h12" />
              </svg>
            </button>
            <button type="button" aria-label="Fit to screen" onClick={() => setView(FIT)} disabled={view.s === 1 && view.tx === 0 && view.ty === 0}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {exploring ? (
        <>
          <div className={styles.bottomBar}>
            <p className={styles.hint}>{hint}</p>
            {toolbar}
          </div>
        </>
      ) : (
        <button
          ref={enterButtonRef}
          type="button"
          className={styles.enter}
          onClick={enter}
          aria-label={`Explore ${label.toLowerCase()} full screen: zoom and pan`}
          title="Zoom & pan"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M12.5 12.5 17 17M8.5 6v5M6 8.5h5" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default DiagramExplorer

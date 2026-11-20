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
  /** degrees clockwise a turnable drawing's turned about its middle */
  r: number
}
const FIT: View = { s: 1, tx: 0, ty: 0, r: 0 }

/** what a drawing given as a function is told about how it's explored */
export interface ExploreState {
  /** 1 = fitted, and out of explore mode */
  zoom: number
  /** full screen with editing off (see `editable`) */
  locked: boolean
  /** degrees clockwise to turn the drawing about its middle, on top of
   * however it's drawn (see `turnable`) — 0 out of explore mode, and
   * never saved: Done or Fit puts it back */
  turn: number
  /** turn by `deg` about the middle of the screen */
  turnBy: (deg: number) => void
  /** turn to `deg` (as `turn`) about the middle of the screen */
  setTurn: (deg: number) => void
}

/** A 3D view that flies its own camera: zooming and panning full screen
 * move the camera (see render3d/perspective.ts) instead of enlarging the
 * picture. Points are client (screen) pixels. */
export interface ExploreCamera {
  /** zoom by `k` (more than 1 = closer) toward the screen point */
  zoom: (k: number, clientX: number, clientY: number) => void
  /** slide so the scene follows a drag of (dx, dy) pixels */
  pan: (dxPx: number, dyPx: number) => void
  /** back to the fitted view */
  reset: () => void
  /** away from the fitted view (so Fit does something) */
  moved: boolean
}

const normDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

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
  /** the drawing — or a function of how it's being explored: `zoom` (1 =
   * fitted, and out of explore mode), for a drawing that keeps its line
   * weights and text the same size on screen and shows things at their
   * true size as it's zoomed in; `locked`, true while full-screen with
   * editing off (see `editable`) */
  children: ReactNode | ((view: ExploreState) => ReactNode)
  /** a drawing that can be edited (dragged corners and the like): full
   * screen it opens locked, so a drag always pans, with an Edit switch
   * beside Done to turn editing back on */
  editable?: boolean
  /** what the drawing is, for the button's label and the full-screen title */
  label: string
  /** a 3D view: one-finger / mouse drag turns it, by this many pixels */
  onOrbit?: (dxPx: number, dyPx: number) => void
  /** a 3D view that zooms and pans its own camera, flying in, rather than
   * being enlarged */
  camera?: ExploreCamera
  /** shown along the bottom in full-screen (e.g. the 3D view's toggles) */
  toolbar?: ReactNode | ((view: ExploreState) => ReactNode)
  /** a drawing that turns (given as a function, it draws itself turned
   * by `turn` about its middle): two fingers twist it full screen */
  turnable?: boolean
  /** fill the parent's height (a fixed-height pane) */
  fill?: boolean
}> = ({ children, label, onOrbit, camera, toolbar, fill = false, editable = false, turnable = false }) => {
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const [exploring, setExploring] = useState(false)
  const [editing, setEditing] = useState(false)
  const locked = exploring && editable && !editing
  const [mode, setMode] = useState<Mode>(onOrbit ? "rotate" : "pan")
  const [view, setView] = useState<View>(FIT)
  const viewRef = useRef(view)
  viewRef.current = view
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const enterButtonRef = useRef<HTMLButtonElement>(null)

  /** pointers down on the drawing, where each was last */
  const pointers = useRef(new Map<number, { x: number; y: number; pan: boolean; dragging: boolean }>())
  /** a two-finger gesture's starting point */
  const pinch = useRef<{ dist: number; angle: number; cx: number; cy: number; view: View } | null>(null)

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
    return { s, tx: clamp(v.tx, w), ty: clamp(v.ty, h), r: v.r }
  }, [])

  /** zoom by k about a point in the viewport */
  const zoomAt = useCallback(
    (k: number, px: number, py: number) => {
      const cam = cameraRef.current
      const el = viewportRef.current
      if (cam) {
        const r = el?.getBoundingClientRect()
        cam.zoom(k, px + (r?.left ?? 0), py + (r?.top ?? 0))
        return
      }
      const v = viewRef.current
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * k))
      const r = s / v.s
      setView(clampView({ s, tx: px - (px - v.tx) * r, ty: py - (py - v.ty) * r, r: v.r }))
    },
    [clampView],
  )
  /** `from` moved so the screen point (m0x, m0y) lands on (mx, my), with
   * the drawing scaled to `s` about it and turned `deg` more — the drawing
   * turns about its own middle, so the shift makes up the difference */
  const moved = (from: View, s: number, deg: number, m0x: number, m0y: number, mx: number, my: number): View => {
    const el = contentRef.current
    const cx = (el?.offsetWidth ?? 0) / 2
    const cy = (el?.offsetHeight ?? 0) / 2
    const k = s / from.s
    const th = (deg * Math.PI) / 180
    const vx = from.tx + from.s * cx - m0x
    const vy = from.ty + from.s * cy - m0y
    return {
      s,
      tx: mx + k * (vx * Math.cos(th) - vy * Math.sin(th)) - s * cx,
      ty: my + k * (vx * Math.sin(th) + vy * Math.cos(th)) - s * cy,
      r: normDeg(from.r + deg),
    }
  }
  const turnBy = (deg: number) => {
    const el = viewportRef.current
    if (!el) return
    const mx = el.clientWidth / 2
    const my = el.clientHeight / 2
    // off the latest view, so quick taps each count
    setView((v) => clampView(moved(v, v.s, deg, mx, my, mx, my)))
  }
  const setTurn = (deg: number) => turnBy(normDeg(deg - viewRef.current.r))

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
    pinch.current = {
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      view: viewRef.current,
    }
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
      if (camera) {
        // a camera takes the pinch a step at a time: the change since the
        // last move, about where the fingers are now
        camera.pan(cx - st.cx, cy - st.cy)
        zoomAt(dist / st.dist, cx, cy)
        pinch.current = { ...st, dist: dist || 1, cx, cy }
        return
      }
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, st.view.s * (dist / st.dist)))
      // a twist turns a turnable drawing, as freely as the fingers go
      const twist = turnable ? normDeg(((Math.atan2(b.y - a.y, b.x - a.x) - st.angle) * 180) / Math.PI) : 0
      // the point under the fingers' first midpoint follows the midpoint
      setView(clampView(moved(st.view, s, twist, st.cx, st.cy, cx, cy)))
      return
    }
    const dx = p.x - prev.x
    const dy = p.y - prev.y
    if (onOrbit && mode === "rotate" && !prev.pan) orbit(dx, dy)
    else if (camera) camera.pan(dx, dy)
    else setView((v) => clampView({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
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
      else if (e.key === "0") fit()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      root.style.overflow = before
      window.removeEventListener("keydown", onKey)
    }
    // zoomCentre only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploring])

  const fit = () => {
    setView(FIT)
    cameraRef.current?.reset()
  }
  const enter = () => {
    fit()
    setEditing(false)
    setExploring(true)
  }
  const leave = () => {
    setExploring(false)
    fit()
    pointers.current.clear()
    pinch.current = null
    requestAnimationFrame(() => enterButtonRef.current?.focus())
  }

  const exploreState: ExploreState = { zoom: exploring ? view.s : 1, locked, turn: exploring ? view.r : 0, turnBy, setTurn }

  const hint = onOrbit
    ? mode === "rotate"
      ? camera
        ? "Drag to turn · pinch or scroll to fly in · two fingers or right-drag to pan"
        : "Drag to turn · pinch or scroll to zoom · two fingers or right-drag to pan"
      : "Drag to pan · pinch or scroll to zoom"
    : turnable
      ? "Drag to pan · pinch or scroll to zoom · twist two fingers to turn (not saved) · double-click to zoom in"
      : "Drag to pan · pinch or scroll to zoom · double-click to zoom in"
  const lockHint = editable ? (editing ? " · Edit is on: drag corners to move them" : " · Editing locked — turn on Edit to change it") : ""

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
          {editable && (
            <button
              type="button"
              className={`${styles.editToggle} ${editing ? styles.editOn : ""}`}
              aria-pressed={editing}
              onClick={() => setEditing((v) => !v)}
              title={editing ? "Lock editing: drags only pan" : "Turn on editing: drag corners and handles"}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                {editing ? <path d="M6 9V6.5a4 4 0 0 1 7.6-1.7M4.5 9h11v8h-11z" /> : <path d="M6 9V6.5a4 4 0 0 1 8 0V9M4.5 9h11v8h-11z" />}
              </svg>
              Edit
            </button>
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
        <div ref={contentRef} className={styles.content} style={exploring && !camera ? { transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` } : undefined}>
          {typeof children === "function" ? children(exploreState) : children}
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
            <button
              type="button"
              aria-label="Fit to screen"
              onClick={fit}
              disabled={camera ? !camera.moved : view.s === 1 && view.tx === 0 && view.ty === 0 && view.r === 0}
            >
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
            <p className={styles.hint}>
              {hint}
              {lockHint}
            </p>
            {typeof toolbar === "function" ? toolbar(exploreState) : toolbar}
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

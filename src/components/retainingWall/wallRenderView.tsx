"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { BoardHighlight, WallProfile } from "./postProfile"
import { CalcSettings } from "./calcSettings"
import { PlanPoint, RetainedSide } from "./wallPlan"
import { buildRenderScene, RenderExtra } from "./wallRender3d"
import DiagramExplorer from "@/components/diagramExplorer/diagramExplorer"
import { useFlyCamera } from "@/components/render3d/useFlyCamera"
import type { CameraFrame } from "@/components/render3d/perspective"
import styles from "./wallRenderView.module.scss"

/** the attribute on <html> that tells the print stylesheet to print just
 * this view (see wallRenderView.module.scss) */
const PRINT_ATTR = "data-print-render"
// a stable default, so the scene isn't rebuilt every render
const EMPTY_HIGHLIGHT: BoardHighlight[] = []
const EMPTY_EXTRAS: RenderExtra[] = []

/** A shaded 3D view of the wall, for showing a client: the ground in
 * front, the earth it holds back, every post and board course, from a
 * camera you can swing round and tilt. It prints on its own (to save as
 * a PDF from the browser's print dialog) or downloads as a PNG.
 *
 * Every colour is an inline attribute rather than a class, so the SVG
 * stays the same when it's serialised for the PNG. */
const WallRenderView: React.FC<{
  profile: WallProfile
  planPoints: PlanPoint[]
  retainedSide: RetainedSide
  settings: CalcSettings
  topCapEnabled: boolean
  /** shown under the drawing on the printed page */
  caption?: string
  /** boards picked out from the board order, tinted blue */
  highlight?: BoardHighlight[]
  /** a post picked out in blue, with a "#n" marker over it */
  focusPostIndex?: number | null
  /** tapping a post (or its footing) */
  onSelectPost?: (index: number) => void
  /** fill the parent's height, with just the turn/tilt/footings controls
   * (no print or download) — for the concrete speed run's top half */
  compact?: boolean
  showFootingsInitially?: boolean
  /** things from other calculators drawn with the wall (stairs) */
  extras?: RenderExtra[]
}> = ({
  profile,
  planPoints,
  retainedSide,
  settings,
  topCapEnabled,
  caption,
  highlight = EMPTY_HIGHLIGHT,
  focusPostIndex = null,
  onSelectPost,
  compact = false,
  showFootingsInitially = false,
  extras = EMPTY_EXTRAS,
}) => {
  const [azimuthDeg, setAzimuthDeg] = useState(-32)
  const [elevationDeg, setElevationDeg] = useState(26)
  const [showFootings, setShowFootings] = useState(showFootingsInitially)
  const svgRef = useRef<SVGSVGElement>(null)
  // full screen, zooming flies the camera in (the page's view is the fit)
  const frameRef = useRef<CameraFrame | null>(null)
  const { camera, explore, beforeTurn } = useFlyCamera(svgRef, frameRef)
  // dragging right swings the wall round to the right; down tips it toward
  // you — within the sliders' range
  const handleOrbit = useCallback((dx: number, dy: number) => {
    beforeTurn()
    setAzimuthDeg((a) => Math.min(75, Math.max(-75, a - dx * 0.4)))
    setElevationDeg((e) => Math.min(60, Math.max(5, e + dy * 0.3)))
  }, [beforeTurn])

  const scene = useMemo(
    () => buildRenderScene(profile, planPoints, retainedSide, settings, topCapEnabled, { azimuthDeg, elevationDeg, showFootings, focusPostIndex, camera }, highlight, extras),
    [profile, planPoints, retainedSide, settings, topCapEnabled, azimuthDeg, elevationDeg, showFootings, focusPostIndex, highlight, extras, camera]
  )
  frameRef.current = scene?.frame ?? null

  const handlePrint = () => {
    const root = document.documentElement
    // landscape suits a wall, and nothing else on the page is printed —
    // only while this view is what's printing (a CSS module can't hold
    // the bare `body *` rule, so it goes in here)
    const pageStyle = document.createElement("style")
    pageStyle.textContent = "@page { size: landscape; margin: 12mm; } @media print { body * { visibility: hidden; } }"
    document.head.appendChild(pageStyle)
    root.setAttribute(PRINT_ATTR, "")
    const done = () => {
      root.removeAttribute(PRINT_ATTR)
      pageStyle.remove()
      window.removeEventListener("afterprint", done)
    }
    window.addEventListener("afterprint", done)
    window.print()
  }

  const handleDownloadPng = () => {
    const svg = svgRef.current
    if (!svg || !scene) return
    const widthPx = 3000
    const heightPx = Math.round((widthPx * scene.viewBox.h) / scene.viewBox.w)
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    clone.setAttribute("width", String(widthPx))
    clone.setAttribute("height", String(heightPx))
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = widthPx
      canvas.height = heightPx
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(img, 0, 0, widthPx, heightPx)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = "retaining-wall.png"
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }, "image/png")
    }
    img.src = url
  }

  const footingsToggle = (
    <label className={styles.check}>
      <input type="checkbox" checked={showFootings} onChange={(e) => setShowFootings(e.target.checked)} />
Show footings
    </label>
  )

  if (!scene) return null
  const { viewBox: vb, strokeW } = scene
  const markerR = Math.max(vb.w, vb.h) * 0.028

  return (
    <div className={`${styles.renderRoot} ${compact ? styles.compact : ""}`}>
      <div className={styles.printArea}>
        <DiagramExplorer label="3D view" onOrbit={handleOrbit} camera={explore} fill={compact} headerTools={footingsToggle}>
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            className={styles.svg}
            role="img"
            aria-label="Shaded 3D view of the wall"
          >
            <defs>
              <linearGradient id="wallRenderSky" gradientUnits="userSpaceOnUse" x1="0" y1={vb.y} x2="0" y2={vb.y + vb.h}>
                <stop offset="0" stopColor="#eef3f7" />
                <stop offset="1" stopColor="#ffffff" />
              </linearGradient>
            </defs>
            <rect x={vb.x - vb.w * 10} y={vb.y - vb.h * 10} width={vb.w * 21} height={vb.h * 21} fill="url(#wallRenderSky)" />
            {scene.polygons.map((p, i) => (
              <polygon
                key={i}
                points={p.points}
                fill={p.fill}
                stroke={p.stroke}
                strokeWidth={strokeW}
                strokeLinejoin="round"
                opacity={p.opacity}
                className={p.clearance ? styles.clearance : undefined}
                onClick={onSelectPost && p.post !== undefined ? () => onSelectPost(p.post!) : undefined}
                style={onSelectPost && p.post !== undefined ? { cursor: "pointer" } : undefined}
              />
            ))}
            {scene.focus && focusPostIndex !== null && (
              // a pin over the focused post: its number in a blue disc
              <g pointerEvents="none">
                <line
                  x1={scene.focus.x}
                  y1={scene.focus.y - markerR * 0.3}
                  x2={scene.focus.x}
                  y2={scene.focus.y - markerR * 1.6}
                  stroke="#2a78d6"
                  strokeWidth={strokeW * 2}
                />
                <circle cx={scene.focus.x} cy={scene.focus.y - markerR * 2.4} r={markerR} fill="#2a78d6" stroke="#ffffff" strokeWidth={strokeW * 2} />
                <text
                  x={scene.focus.x}
                  y={scene.focus.y - markerR * 2.4}
                  fill="#ffffff"
                  fontSize={markerR * 1.05}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {focusPostIndex + 1}
                </text>
              </g>
            )}
          </svg>
        </DiagramExplorer>
        {caption && <p className={styles.caption}>{caption}</p>}
      </div>
      {highlight.length > 0 && (
        <p className={styles.highlightNote}>
          <span className={styles.highlightSwatch} /> Boards cut from the length picked in the board order
        </p>
      )}

      <div className={styles.controls}>
        <label className={styles.slider}>
          <span>Turn</span>
          <input type="range" min={-75} max={75} step={1} value={azimuthDeg} onChange={(e) => setAzimuthDeg(Number(e.target.value))} />
        </label>
        <label className={styles.slider}>
          <span>Tilt</span>
          <input type="range" min={5} max={60} step={1} value={elevationDeg} onChange={(e) => setElevationDeg(Number(e.target.value))} />
        </label>
        {footingsToggle}
        {!compact && (
          <div className={styles.actions}>
            <button type="button" className={styles.actionButton} onClick={handlePrint}>
              Print / save PDF
            </button>
            <button type="button" className={styles.actionButton} onClick={handleDownloadPng}>
              Download PNG
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default WallRenderView

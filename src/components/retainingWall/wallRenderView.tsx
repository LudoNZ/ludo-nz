"use client"

import { useMemo, useRef, useState } from "react"
import { WallProfile } from "./postProfile"
import { CalcSettings } from "./calcSettings"
import { PlanPoint, RetainedSide } from "./wallPlan"
import { buildRenderScene } from "./wallRender3d"
import styles from "./wallRenderView.module.scss"

/** the attribute on <html> that tells the print stylesheet to print just
 * this view (see wallRenderView.module.scss) */
const PRINT_ATTR = "data-print-render"

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
}> = ({ profile, planPoints, retainedSide, settings, topCapEnabled, caption }) => {
  const [azimuthDeg, setAzimuthDeg] = useState(-32)
  const [elevationDeg, setElevationDeg] = useState(26)
  const [showFootings, setShowFootings] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const scene = useMemo(
    () => buildRenderScene(profile, planPoints, retainedSide, settings, topCapEnabled, { azimuthDeg, elevationDeg, showFootings }),
    [profile, planPoints, retainedSide, settings, topCapEnabled, azimuthDeg, elevationDeg, showFootings]
  )

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

  if (!scene) return null
  const { viewBox: vb, strokeW } = scene

  return (
    <div className={styles.renderRoot}>
      <div className={styles.printArea}>
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className={styles.svg}
          role="img"
          aria-label="Shaded 3D view of the wall"
        >
          <defs>
            <linearGradient id="wallRenderSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#eef3f7" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#wallRenderSky)" />
          {scene.polygons.map((p, i) => (
            <polygon
              key={i}
              points={p.points}
              fill={p.fill}
              stroke={p.stroke}
              strokeWidth={strokeW}
              strokeLinejoin="round"
              opacity={p.opacity}
            />
          ))}
        </svg>
        {caption && <p className={styles.caption}>{caption}</p>}
      </div>

      <div className={styles.controls}>
        <label className={styles.slider}>
          <span>Turn</span>
          <input type="range" min={-75} max={75} step={1} value={azimuthDeg} onChange={(e) => setAzimuthDeg(Number(e.target.value))} />
        </label>
        <label className={styles.slider}>
          <span>Tilt</span>
          <input type="range" min={5} max={60} step={1} value={elevationDeg} onChange={(e) => setElevationDeg(Number(e.target.value))} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={showFootings} onChange={(e) => setShowFootings(e.target.checked)} />
          Show footings
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={handlePrint}>
            Print / save PDF
          </button>
          <button type="button" className={styles.actionButton} onClick={handleDownloadPng}>
            Download PNG
          </button>
        </div>
      </div>
    </div>
  )
}

export default WallRenderView

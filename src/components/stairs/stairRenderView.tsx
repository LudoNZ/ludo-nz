"use client"

import { useMemo, useRef, useState } from "react"
import { StairInput } from "./stairs"
import { StairLayout } from "./layout"
import { buildStairScene } from "./stairRender3d"
import styles from "./stairRenderView.module.scss"

/** the attribute on <html> that tells the print stylesheet to print just
 * this view (see stairRenderView.module.scss) */
const PRINT_ATTR = "data-print-stair-render"

/** A shaded 3D view of the stair, for showing a client or seeing how the
 * framing goes together: every stringer, wedge, frame, post and board,
 * the ground under it and the deck at the top, from a camera you can
 * swing round and tilt. It prints on its own (to save as a PDF from the
 * browser's print dialog) or downloads as a PNG.
 *
 * Every colour is an inline attribute rather than a class, so the SVG
 * stays the same when it's serialised for the PNG. */
const StairRenderView: React.FC<{
  input: StairInput
  layout: StairLayout
  /** shown under the drawing on the printed page */
  caption?: string
}> = ({ input, layout, caption }) => {
  const [azimuthDeg, setAzimuthDeg] = useState(-35)
  const [elevationDeg, setElevationDeg] = useState(28)
  const [showBoards, setShowBoards] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)

  const scene = useMemo(
    () => buildStairScene(input, layout, { azimuthDeg, elevationDeg, showBoards }),
    [input, layout, azimuthDeg, elevationDeg, showBoards],
  )

  const handlePrint = () => {
    const root = document.documentElement
    // nothing else on the page is printed — only while this view is what's
    // printing (a CSS module can't hold the bare `body *` rule)
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
        a.download = "stairs.png"
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
        <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className={styles.svg} role="img" aria-label="Shaded 3D view of the stair">
          <defs>
            <linearGradient id="stairRenderSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#eef3f7" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#stairRenderSky)" />
          {scene.polygons.map((p, i) => (
            <polygon key={i} points={p.points} fill={p.fill} stroke={p.stroke} strokeWidth={strokeW} strokeLinejoin="round" />
          ))}
        </svg>
        {caption && <p className={styles.caption}>{caption}</p>}
      </div>

      <div className={styles.controls}>
        <label className={styles.slider}>
          <span>Turn</span>
          <input type="range" min={-180} max={180} step={1} value={azimuthDeg} onChange={(e) => setAzimuthDeg(Number(e.target.value))} />
        </label>
        <label className={styles.slider}>
          <span>Tilt</span>
          <input type="range" min={5} max={75} step={1} value={elevationDeg} onChange={(e) => setElevationDeg(Number(e.target.value))} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={showBoards} onChange={(e) => setShowBoards(e.target.checked)} />
          Show decking
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

export default StairRenderView

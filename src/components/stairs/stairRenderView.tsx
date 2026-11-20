"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { StairInput } from "./stairs"
import { StairLayout } from "./layout"
import { STAIR_MEMBER_LABELS, StairMember, buildStairScene, stairMembers } from "./stairRender3d"
import DiagramExplorer from "@/components/diagramExplorer/diagramExplorer"
import { useFlyCamera } from "@/components/render3d/useFlyCamera"
import type { CameraFrame } from "@/components/render3d/perspective"
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
  const [hidden, setHidden] = useState<ReadonlySet<StairMember>>(() => new Set())
  const members = useMemo(() => stairMembers(input, layout), [input, layout])
  const toggle = (m: StairMember) =>
    setHidden((h) => {
      const next = new Set(h)
      if (!next.delete(m)) next.add(m)
      return next
    })
  const svgRef = useRef<SVGSVGElement>(null)
  // full screen, zooming flies the camera in (the page's view is the fit)
  const frameRef = useRef<CameraFrame | null>(null)
  const { camera, explore, beforeTurn } = useFlyCamera(svgRef, frameRef)
  // dragging right swings the stair round to the right; down tips it toward you
  const handleOrbit = useCallback((dx: number, dy: number) => {
    beforeTurn()
    setAzimuthDeg((a) => ((((a - dx * 0.4 + 180) % 360) + 360) % 360) - 180)
    setElevationDeg((e) => Math.min(75, Math.max(5, e + dy * 0.3)))
  }, [beforeTurn])

  const scene = useMemo(() => buildStairScene(input, layout, { azimuthDeg, elevationDeg, hidden, camera }), [input, layout, azimuthDeg, elevationDeg, hidden, camera])
  frameRef.current = scene?.frame ?? null

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
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], {
        type: "image/svg+xml",
      }),
    )
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

  const memberToggles = (
    <div className={styles.members} role="group" aria-label="Members shown">
      {members.map((m) => (
        <label key={m} className={styles.memberToggle}>
          <input type="checkbox" checked={!hidden.has(m)} onChange={() => toggle(m)} />
          {STAIR_MEMBER_LABELS[m]}
        </label>
      ))}
    </div>
  )

  return (
    <div className={styles.renderRoot}>
      {/* stays mounted with everything hidden, so full-screen doesn't drop out */}
      <div className={styles.printArea}>
        <DiagramExplorer label="3D view" onOrbit={handleOrbit} camera={explore} toolbar={memberToggles}>
          {scene ? (
            <svg
              ref={svgRef}
              viewBox={`${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.w} ${scene.viewBox.h}`}
              className={styles.svg}
              role="img"
              aria-label="Shaded 3D view of the stair"
            >
              <defs>
                <linearGradient id="stairRenderSky" gradientUnits="userSpaceOnUse" x1="0" y1={scene.viewBox.y} x2="0" y2={scene.viewBox.y + scene.viewBox.h}>
                  <stop offset="0" stopColor="#eef3f7" />
                  <stop offset="1" stopColor="#ffffff" />
                </linearGradient>
              </defs>
              <rect x={scene.viewBox.x - scene.viewBox.w * 10} y={scene.viewBox.y - scene.viewBox.h * 10} width={scene.viewBox.w * 21} height={scene.viewBox.h * 21} fill="url(#stairRenderSky)" />
              {scene.polygons.map((p, i) => (
                <polygon key={i} points={p.points} fill={p.fill} stroke={p.stroke} strokeWidth={scene.strokeW} strokeLinejoin="round" />
              ))}
            </svg>
          ) : (
            <p className={styles.empty}>Everything&apos;s hidden — tick a member to show it.</p>
          )}
        </DiagramExplorer>
        {caption && <p className={styles.caption}>{caption}</p>}
      </div>

      {memberToggles}

      <div className={styles.controls}>
        <label className={styles.slider}>
          <span>Turn</span>
          <input type="range" min={-180} max={180} step={1} value={azimuthDeg} onChange={(e) => setAzimuthDeg(Number(e.target.value))} />
        </label>
        <label className={styles.slider}>
          <span>Tilt</span>
          <input type="range" min={5} max={75} step={1} value={elevationDeg} onChange={(e) => setElevationDeg(Number(e.target.value))} />
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

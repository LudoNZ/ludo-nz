"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import DiagramExplorer from "@/components/diagramExplorer/diagramExplorer"
import { useFlyCamera } from "@/components/render3d/useFlyCamera"
import type { CameraFrame } from "@/components/render3d/perspective"
import { buildFrameScene, FRAME_MEMBER_LABELS, FrameRenderInput, FrameRenderMember, frameRenderMembers } from "./frameRender3d"
// the same look, print and controls as the stairs' 3D view
import styles from "../stairs/stairRenderView.module.scss"

const PRINT_ATTR = "data-print-stair-render"

/** A shaded 3D view of a floor frame, and what's on it: swing it round,
 * tilt it, hide a layer to see how it goes together, fly in full screen,
 * print it or save a PNG. */
const FrameRenderView: React.FC<{ input: FrameRenderInput; fileName?: string; caption?: string }> = ({ input, fileName = "floor-frame", caption }) => {
  const [azimuthDeg, setAzimuthDeg] = useState(-30)
  const [elevationDeg, setElevationDeg] = useState(32)
  const [hidden, setHidden] = useState<ReadonlySet<FrameRenderMember>>(() => new Set())
  const members = useMemo(() => frameRenderMembers(input), [input])
  const toggle = (m: FrameRenderMember) =>
    setHidden((h) => {
      const next = new Set(h)
      if (!next.delete(m)) next.add(m)
      return next
    })
  const svgRef = useRef<SVGSVGElement>(null)
  const frameRef = useRef<CameraFrame | null>(null)
  const { camera, explore, beforeTurn } = useFlyCamera(svgRef, frameRef)
  const handleOrbit = useCallback(
    (dx: number, dy: number) => {
      beforeTurn()
      setAzimuthDeg((a) => ((((a - dx * 0.4 + 180) % 360) + 360) % 360) - 180)
      setElevationDeg((e) => Math.min(80, Math.max(5, e + dy * 0.3)))
    },
    [beforeTurn],
  )
  const scene = useMemo(() => buildFrameScene(input, { azimuthDeg, elevationDeg, hidden, camera }), [input, azimuthDeg, elevationDeg, hidden, camera])
  frameRef.current = scene?.frame ?? null

  const handlePrint = () => {
    const root = document.documentElement
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
        a.download = `${fileName}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }, "image/png")
    }
    img.src = url
  }

  const memberToggles = (
    <div className={styles.members} role="group" aria-label="Parts shown">
      {members.map((m) => (
        <label key={m} className={styles.memberToggle}>
          <input type="checkbox" checked={!hidden.has(m)} onChange={() => toggle(m)} />
          {m === "covering" && input.boards ? "Decking boards" : FRAME_MEMBER_LABELS[m]}
        </label>
      ))}
    </div>
  )

  return (
    <div className={styles.renderRoot}>
      <div className={styles.printArea}>
        <DiagramExplorer label="3D view" onOrbit={handleOrbit} camera={explore} headerTools={memberToggles}>
          {scene ? (
            <svg ref={svgRef} viewBox={`${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.w} ${scene.viewBox.h}`} className={styles.svg} role="img" aria-label="Shaded 3D view of the floor frame">
              <defs>
                <linearGradient id="frameRenderSky" gradientUnits="userSpaceOnUse" x1="0" y1={scene.viewBox.y} x2="0" y2={scene.viewBox.y + scene.viewBox.h}>
                  <stop offset="0" stopColor="#eef3f7" />
                  <stop offset="1" stopColor="#ffffff" />
                </linearGradient>
              </defs>
              <rect x={scene.viewBox.x - scene.viewBox.w * 10} y={scene.viewBox.y - scene.viewBox.h * 10} width={scene.viewBox.w * 21} height={scene.viewBox.h * 21} fill="url(#frameRenderSky)" />
              {scene.polygons.map((p, i) => (
                <polygon key={i} points={p.points} fill={p.fill} stroke={p.stroke} strokeWidth={scene.strokeW} strokeLinejoin="round" />
              ))}
            </svg>
          ) : (
            <p className={styles.empty}>Everything&apos;s hidden — tick a part to show it.</p>
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
          <input type="range" min={5} max={80} step={1} value={elevationDeg} onChange={(e) => setElevationDeg(Number(e.target.value))} />
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

export default FrameRenderView

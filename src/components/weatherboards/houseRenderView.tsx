"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import DiagramExplorer from "@/components/diagramExplorer/diagramExplorer"
import { useFlyCamera } from "@/components/render3d/useFlyCamera"
import type { CameraFrame } from "@/components/render3d/perspective"
import { buildHouseScene, HOUSE_MEMBER_LABELS, HOUSE_MEMBERS, HouseRenderInput, HouseRenderMember, housePieces } from "./houseRender3d"
// the same look, print and controls as the stairs' 3D view
import styles from "../stairs/stairRenderView.module.scss"

const PRINT_ATTR = "data-print-stair-render"

/** The house in 3D, its walls set out on plan: swing it round, tilt it,
 * hide a layer, fly in full screen, print it or save a PNG. */
const HouseRenderView: React.FC<{
  input: HouseRenderInput
  fileName?: string
  /** picking: a tap on a wall says which, and where on it (x from its left end, z up) */
  picking?: boolean
  onPick?: (hit: { wallId: string; x: number; z: number }) => void
}> = ({ input, fileName = "house", picking, onPick }) => {
  const [azimuthDeg, setAzimuthDeg] = useState(-35)
  const [elevationDeg, setElevationDeg] = useState(25)
  const [hidden, setHidden] = useState<ReadonlySet<HouseRenderMember>>(() => new Set())
  const toggle = (m: HouseRenderMember) =>
    setHidden((h) => {
      const next = new Set(h)
      if (!next.delete(m)) next.add(m)
      return next
    })
  const svgRef = useRef<SVGSVGElement>(null)
  const downAt = useRef<[number, number] | null>(null)
  const frameRef = useRef<CameraFrame | null>(null)
  const { camera, explore, beforeTurn } = useFlyCamera(svgRef, frameRef)
  const handleOrbit = useCallback(
    (dx: number, dy: number) => {
      beforeTurn()
      setAzimuthDeg((a) => ((((a - dx * 0.4 + 180) % 360) + 360) % 360) - 180)
      setElevationDeg((e) => Math.min(85, Math.max(2, e + dy * 0.3)))
    },
    [beforeTurn],
  )
  // the model's built once per change; turning only redoes the camera
  const model = useMemo(() => housePieces(input, hidden), [input, hidden])
  const scene = useMemo(() => buildHouseScene(model, { azimuthDeg, elevationDeg, camera }), [model, azimuthDeg, elevationDeg, camera])
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
      {HOUSE_MEMBERS.filter((m) => (m !== "inside" || !!input.extras?.length) && (m !== "upper" || !!input.upper)).map((m) => (
        <label key={m} className={styles.memberToggle}>
          <input type="checkbox" checked={!hidden.has(m)} onChange={() => toggle(m)} />
          {HOUSE_MEMBER_LABELS[m]}
        </label>
      ))}
    </div>
  )

  return (
    <div className={styles.renderRoot}>
      <div className={styles.printArea}>
        <DiagramExplorer label="3D view" onOrbit={handleOrbit} camera={explore} headerTools={memberToggles}>
          {scene ? (
            <svg
              ref={svgRef}
              viewBox={`${scene.viewBox.x} ${scene.viewBox.y} ${scene.viewBox.w} ${scene.viewBox.h}`}
              className={styles.svg}
              role="img"
              aria-label="Shaded 3D view of the house"
              style={picking ? { cursor: "copy" } : undefined}
              onPointerDown={(e) => {
                downAt.current = [e.clientX, e.clientY]
              }}
              onClick={(e) => {
                // (a tap, not the end of a turn)
                const d = downAt.current
                if (!picking || !onPick || !svgRef.current || (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 5)) return
                const pt = svgRef.current.createSVGPoint()
                pt.x = e.clientX
                pt.y = e.clientY
                const p = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse())
                const hit = scene.pick([p.x, p.y])
                if (hit) onPick(hit)
              }}
            >
              <defs>
                <linearGradient id="houseRenderSky" gradientUnits="userSpaceOnUse" x1="0" y1={scene.viewBox.y} x2="0" y2={scene.viewBox.y + scene.viewBox.h}>
                  <stop offset="0" stopColor="#eef3f7" />
                  <stop offset="1" stopColor="#ffffff" />
                </linearGradient>
              </defs>
              <rect x={scene.viewBox.x - scene.viewBox.w * 10} y={scene.viewBox.y - scene.viewBox.h * 10} width={scene.viewBox.w * 21} height={scene.viewBox.h * 21} fill="url(#houseRenderSky)" />
              {scene.items.map((p, i) =>
                p.kind === "poly" ? (
                  <polygon key={i} points={p.points} fill={p.fill} stroke={p.stroke} strokeWidth={scene.strokeW} strokeLinejoin="round" />
                ) : (
                  <path key={i} d={p.d} stroke={p.stroke} strokeWidth={scene.strokeW * 0.8} fill="none" />
                ),
              )}
            </svg>
          ) : (
            <p className={styles.empty}>No walls placed on plan yet.</p>
          )}
        </DiagramExplorer>
      </div>

      {memberToggles}

      <div className={styles.controls}>
        <label className={styles.slider}>
          <span>Turn</span>
          <input type="range" min={-180} max={180} step={1} value={azimuthDeg} onChange={(e) => setAzimuthDeg(Number(e.target.value))} />
        </label>
        <label className={styles.slider}>
          <span>Tilt</span>
          <input type="range" min={2} max={85} step={1} value={elevationDeg} onChange={(e) => setElevationDeg(Number(e.target.value))} />
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

export default HouseRenderView

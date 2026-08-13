"use client"

import { useId, useMemo, useRef, useState } from "react"
import { BoardDirection } from "./types"
import { DeckPoint, insertMidpointOnLongestEdge, isSimplePolygon, polygonBounds, polygonOutlinePath, removePoint } from "./polygon"
import { RotateIcon } from "./deckShapeEditor"
import styles from "./polygonShapeEditor.module.scss"

/** Same tap-vs-drag threshold as deckShapeEditor's edge chips — below this
 * many screen pixels of movement, a pointer-down-then-up on a corner is
 * still a tap (select it), not a drag. */
const DRAG_THRESHOLD_PX = 5

/** Polygon-mode counterpart to deckShapeEditor.tsx: instead of four named,
 * length-editable edges, every corner is a free 2D drag handle (the
 * trapezoid's edge-drag becomes a special case of this once there are only
 * 4 points forming a right-trapezoid — this component doesn't know or care
 * that history, it's just N points). Reached from deckForm.tsx's "+ Add
 * corner" button, which seeds the first 4 points from the current
 * sideA/sideB/width the moment it's pressed — see deckForm.tsx. */
const PolygonShapeEditor: React.FC<{
  points: DeckPoint[]
  boardDirection: BoardDirection
  onPointsChange: (points: DeckPoint[]) => void
  onDirectionChange: (d: BoardDirection) => void
}> = ({ points, boardDirection, onPointsChange, onDirectionChange }) => {
  const intoRake = boardDirection !== "alongRake"
  const clipId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const bounds = useMemo(() => polygonBounds(points), [points])
  const simple = useMemo(() => isSimplePolygon(points), [points])
  const outlinePath = useMemo(() => polygonOutlinePath(points), [points])

  const { viewBox, strokeW, vbW, vbH } = useMemo(() => {
    const w = Math.max(bounds.maxX - bounds.minX, 1)
    const h = Math.max(bounds.maxY - bounds.minY, 1)
    const scale = Math.max(w, h)
    const pad = scale * 0.18
    const vbW = w + pad * 2
    const vbH = h + pad * 2
    return { viewBox: `${bounds.minX - pad} ${bounds.minY - pad} ${vbW} ${vbH}`, strokeW: scale * 0.006, vbW, vbH }
  }, [bounds])

  // faint parallel lines previewing which way the boards will run — same
  // "draw full-span, let the clip path trim it" trick deckPlanView.tsx's
  // joist grid uses, so no per-position geometry is needed here either
  const lineCount = 7
  const previewLines = Array.from({ length: lineCount }, (_, i) => (i + 1) / (lineCount + 1))

  const getMmPerPixel = () => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return 1
    const scale = Math.min(rect.width / vbW, rect.height / vbH)
    return scale > 0 ? 1 / scale : 1
  }

  const dragRef = useRef<{
    index: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    mmPerPixel: number
    dragging: boolean
  } | null>(null)

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      index,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: points[index].x,
      startY: points[index].y,
      mmPerPixel: getMmPerPixel(),
      dragging: false,
    }
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dxPx = e.clientX - d.startClientX
    const dyPx = e.clientY - d.startClientY
    if (!d.dragging && Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD_PX) return
    d.dragging = true
    const nextX = Math.round(d.startX + dxPx * d.mmPerPixel)
    const nextY = Math.round(d.startY + dyPx * d.mmPerPixel)
    onPointsChange(points.map((p, i) => (i === d.index ? { x: nextX, y: nextY } : p)))
  }
  const handlePointerUp = (index: number) => (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d?.dragging) setSelected((s) => (s === index ? null : index))
  }

  const selectedPoint = selected != null ? points[selected] : null

  return (
    <div className={styles.editor}>
      <div className={styles.shapeWrap}>
        <svg ref={svgRef} viewBox={viewBox} className={styles.svg} role="img" aria-label="Deck shape, drag a corner to reshape">
          <defs>
            <clipPath id={clipId}>
              <path d={outlinePath} />
            </clipPath>
          </defs>

          <path d={outlinePath} className={`${styles.outline} ${simple ? "" : styles.invalidOutline}`} strokeWidth={strokeW * 1.6} />

          <g clipPath={`url(#${clipId})`}>
            {intoRake
              ? previewLines.map((f) => {
                  const x = bounds.minX + f * (bounds.maxX - bounds.minX)
                  return <line key={f} x1={x} y1={bounds.minY} x2={x} y2={bounds.maxY} className={styles.previewLine} strokeWidth={strokeW} />
                })
              : previewLines.map((f) => {
                  const y = bounds.minY + f * (bounds.maxY - bounds.minY)
                  return <line key={f} x1={bounds.minX} y1={y} x2={bounds.maxX} y2={y} className={styles.previewLine} strokeWidth={strokeW} />
                })}
          </g>

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={strokeW * 3.5}
                strokeWidth={strokeW * 0.6}
                className={`${styles.vertex} ${selected === i ? styles.vertexSelected : ""}`}
              />
              {/* generous invisible tap target — the visible dot is often
                  too small to reliably grab on a phone */}
              <circle
                cx={p.x}
                cy={p.y}
                r={strokeW * 9}
                className={styles.hitArea}
                onPointerDown={handlePointerDown(i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp(i)}
                role="button"
                tabIndex={0}
                aria-label={`Corner ${i + 1} — drag to move, tap to set exact position or remove it`}
              />
            </g>
          ))}
        </svg>

        <button
          type="button"
          className={styles.rotateBtn}
          onClick={() => onDirectionChange(intoRake ? "alongRake" : "intoRake")}
          aria-label={`Boards currently run ${intoRake ? "one way" : "the other way"} across the shape — tap to rotate 90°`}
        >
          <RotateIcon className={intoRake ? undefined : styles.rotated} />
          <span>{intoRake ? "Boards run this way" : "Boards run the other way"}</span>
        </button>
      </div>

      {!simple && (
        <p className={styles.warning}>
          ⚠ This shape crosses itself — drag a corner until the outline stops overlapping. A crossed shape
          can&apos;t be saved.
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.addBtn} onClick={() => onPointsChange(insertMidpointOnLongestEdge(points))}>
          + Add corner
        </button>
      </div>

      {selectedPoint && selected != null && (
        <div className={styles.pointPanel}>
          <div className={styles.pointHeader}>
            <span>Corner {selected + 1}</span>
            <button type="button" className={styles.closeBtn} onClick={() => setSelected(null)} aria-label="Close">
              ✕
            </button>
          </div>
          <div className={styles.pointFields}>
            <label>
              X (mm)
              <input
                type="number"
                inputMode="numeric"
                value={selectedPoint.x}
                onChange={(e) => {
                  const x = Math.round(Number(e.target.value) || 0)
                  onPointsChange(points.map((p, i) => (i === selected ? { ...p, x } : p)))
                }}
              />
            </label>
            <label>
              Y (mm)
              <input
                type="number"
                inputMode="numeric"
                value={selectedPoint.y}
                onChange={(e) => {
                  const y = Math.round(Number(e.target.value) || 0)
                  onPointsChange(points.map((p, i) => (i === selected ? { ...p, y } : p)))
                }}
              />
            </label>
          </div>
          {points.length > 3 && (
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => {
                onPointsChange(removePoint(points, selected))
                setSelected(null)
              }}
            >
              Remove this corner
            </button>
          )}
        </div>
      )}

      <p className={styles.hint}>
        Drag any corner to reshape the deck — tap one to set an exact position or remove it. Boards all run
        one consistent direction across the whole shape.
      </p>
    </div>
  )
}

export default PolygonShapeEditor

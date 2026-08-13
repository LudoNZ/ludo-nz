"use client"

import { useId, useMemo, useRef, useState } from "react"
import { BoardDirection, formatLength } from "./types"
import {
  DeckPoint,
  insertMidpointOnLongestEdge,
  interiorAngleDeg,
  isSimplePolygon,
  polygonBounds,
  polygonOutlinePath,
  removePoint,
  solvePolygon,
} from "./polygon"
import { RotateIcon } from "./deckShapeEditor"
import styles from "./polygonShapeEditor.module.scss"

/** Same tap-vs-drag threshold as deckShapeEditor's edge chips — below this
 * many screen pixels of movement, a pointer-down-then-up on a corner is
 * still a tap (select it), not a drag. */
const DRAG_THRESHOLD_PX = 5

const edgeLength = (points: DeckPoint[], i: number): number => {
  const a = points[i]
  const b = points[(i + 1) % points.length]
  return Math.hypot(b.x - a.x, b.y - a.y)
}

type Selection = { kind: "vertex" | "edge"; index: number } | null

/** Polygon-mode counterpart to deckShapeEditor.tsx. Every corner is a free
 * 2D drag handle (the trapezoid's edge-drag becomes a special case of this
 * once there are only 4 points forming a right-trapezoid — this component
 * doesn't know or care about that history, it's just N points), and any
 * side's length or corner's angle can also be typed exactly — see
 * polygon.ts's solvePolygon for how the rest of the shape recalculates
 * around a locked value. Reached from deckForm.tsx's "+ Add corner"
 * button, which seeds the first 4 points from the current sideA/sideB/
 * width the moment it's pressed — see deckForm.tsx. */
const PolygonShapeEditor: React.FC<{
  points: DeckPoint[]
  lockedEdgeLengths: Record<string, number>
  lockedVertexAngles: Record<string, number>
  boardDirection: BoardDirection
  onShapeChange: (points: DeckPoint[], lockedEdgeLengths: Record<string, number>, lockedVertexAngles: Record<string, number>) => void
  onDirectionChange: (d: BoardDirection) => void
}> = ({ points, lockedEdgeLengths, lockedVertexAngles, boardDirection, onShapeChange, onDirectionChange }) => {
  const intoRake = boardDirection !== "alongRake"
  const clipId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const n = points.length

  const bounds = useMemo(() => polygonBounds(points), [points])
  const simple = useMemo(() => isSimplePolygon(points), [points])
  const outlinePath = useMemo(() => polygonOutlinePath(points), [points])

  // A closed shape can't have every side length *and* every corner angle
  // independently fixed at once (same reason a triangle's three angles
  // always sum to 180°) — exactly one side and one corner always stay
  // automatic so solvePolygon's walk is always well-defined. Which ones:
  // see solvePolygon's own doc comment for why it's these two specifically.
  const autoEdgeIndex = n - 1
  const autoAngleIndex = 0
  const hasAnyLock = Object.keys(lockedEdgeLengths).length > 0 || Object.keys(lockedVertexAngles).length > 0

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

  // A direct move (drag, or typing X/Y) is a deliberate free-form
  // override — clears any lock on this vertex's own angle and its two
  // adjacent edges' lengths, same "a direct edit always wins over a
  // stale automatic value" reasoning the rest of this app follows
  // (join scroller's manual rows, the trapezoid's sideB reset, etc).
  const setVertexPosition = (index: number, next: DeckPoint) => {
    const nextPoints = points.map((p, i) => (i === index ? next : p))
    const nextEdges = { ...lockedEdgeLengths }
    delete nextEdges[String((index - 1 + n) % n)]
    delete nextEdges[String(index)]
    const nextAngles = { ...lockedVertexAngles }
    delete nextAngles[String(index)]
    onShapeChange(nextPoints, nextEdges, nextAngles)
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
    setVertexPosition(d.index, { x: nextX, y: nextY })
  }
  const handlePointerUp = (index: number) => (e: React.PointerEvent) => {
    const d = dragRef.current
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (!d?.dragging) setSelection((s) => (s?.kind === "vertex" && s.index === index ? null : { kind: "vertex", index }))
  }

  // Typing an exact length/angle: the *first* lock ever set on this shape
  // scales the whole thing uniformly (preserving proportions) rather than
  // distorting it — with nothing else constrained yet, "resize to this"
  // is the only sensible reading. Every lock after that recalculates just
  // what's downstream of it via solvePolygon, leaving everything already
  // locked exactly where it was.
  const setEdgeLength = (index: number, newLength: number) => {
    if (!hasAnyLock) {
      const current = edgeLength(points, index)
      const factor = current > 0 ? newLength / current : 1
      onShapeChange(
        points.map((p) => ({ x: Math.round(points[0].x + (p.x - points[0].x) * factor), y: Math.round(points[0].y + (p.y - points[0].y) * factor) })),
        { [String(index)]: newLength },
        {}
      )
      return
    }
    const nextEdges = { ...lockedEdgeLengths, [String(index)]: newLength }
    onShapeChange(solvePolygon(points, nextEdges, lockedVertexAngles), nextEdges, lockedVertexAngles)
  }
  const setVertexAngle = (index: number, newAngleDeg: number) => {
    const nextAngles = { ...lockedVertexAngles, [String(index)]: newAngleDeg }
    onShapeChange(solvePolygon(points, lockedEdgeLengths, nextAngles), lockedEdgeLengths, nextAngles)
  }
  const resetEdge = (index: number) => {
    const nextEdges = { ...lockedEdgeLengths }
    delete nextEdges[String(index)]
    onShapeChange(solvePolygon(points, nextEdges, lockedVertexAngles), nextEdges, lockedVertexAngles)
  }
  const resetAngle = (index: number) => {
    const nextAngles = { ...lockedVertexAngles }
    delete nextAngles[String(index)]
    onShapeChange(solvePolygon(points, lockedEdgeLengths, nextAngles), lockedEdgeLengths, nextAngles)
  }

  // Adding or removing a corner changes the shape's whole structure —
  // every existing lock's index would need remapping (and any lock on an
  // edge that just got split in two no longer means anything), so this
  // simply starts fresh rather than risking a stale/misapplied lock.
  const handleAddCorner = () => onShapeChange(insertMidpointOnLongestEdge(points), {}, {})
  const handleRemoveCorner = (index: number) => {
    onShapeChange(removePoint(points, index), {}, {})
    setSelection(null)
  }

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

          {/* edge-length markers, one per side at its midpoint */}
          {points.map((p, i) => {
            const next = points[(i + 1) % n]
            const midX = (p.x + next.x) / 2
            const midY = (p.y + next.y) / 2
            const locked = lockedEdgeLengths[String(i)] !== undefined
            return (
              <g key={`edge-${i}`}>
                <circle
                  cx={midX}
                  cy={midY}
                  r={strokeW * 2.6}
                  strokeWidth={strokeW * 0.5}
                  className={`${styles.edgeMarker} ${locked ? styles.edgeMarkerLocked : ""} ${selection?.kind === "edge" && selection.index === i ? styles.edgeMarkerSelected : ""}`}
                />
                <circle
                  cx={midX}
                  cy={midY}
                  r={strokeW * 8}
                  className={styles.hitArea}
                  onClick={() => setSelection((s) => (s?.kind === "edge" && s.index === i ? null : { kind: "edge", index: i }))}
                  role="button"
                  tabIndex={0}
                  aria-label={`Side ${i + 1}, ${formatLength(edgeLength(points, i))} — tap to set an exact length`}
                />
              </g>
            )
          })}

          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={strokeW * 3.5}
                strokeWidth={strokeW * 0.6}
                className={`${styles.vertex} ${selection?.kind === "vertex" && selection.index === i ? styles.vertexSelected : ""} ${lockedVertexAngles[String(i)] !== undefined ? styles.vertexLocked : ""}`}
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
                aria-label={`Corner ${i + 1} — drag to move, tap to set exact position, angle, or remove it`}
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
          ⚠ This shape crosses itself — drag a corner (or adjust a locked length/angle) until the outline
          stops overlapping. A crossed shape can&apos;t be saved.
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.addBtn} onClick={handleAddCorner}>
          + Add corner
        </button>
      </div>

      {selection?.kind === "vertex" &&
        (() => {
          const i = selection.index
          const p = points[i]
          const angleLocked = lockedVertexAngles[String(i)] !== undefined
          return (
            <div className={styles.pointPanel}>
              <div className={styles.pointHeader}>
                <span>Corner {i + 1}</span>
                <button type="button" className={styles.closeBtn} onClick={() => setSelection(null)} aria-label="Close">
                  ✕
                </button>
              </div>
              <div className={styles.pointFields}>
                <label>
                  X (mm)
                  <input
                    type="number"
                    inputMode="numeric"
                    value={p.x}
                    onChange={(e) => setVertexPosition(i, { x: Math.round(Number(e.target.value) || 0), y: p.y })}
                  />
                </label>
                <label>
                  Y (mm)
                  <input
                    type="number"
                    inputMode="numeric"
                    value={p.y}
                    onChange={(e) => setVertexPosition(i, { x: p.x, y: Math.round(Number(e.target.value) || 0) })}
                  />
                </label>
              </div>
              {i === autoAngleIndex ? (
                <p className={styles.autoNote}>This corner&apos;s angle stays automatic so the shape can close.</p>
              ) : (
                <>
                  <div className={styles.pointFields}>
                    <label>
                      Angle (°)
                      <input
                        type="number"
                        inputMode="decimal"
                        step={0.1}
                        value={interiorAngleDeg(points, i).toFixed(1)}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          if (!isNaN(v)) setVertexAngle(i, v)
                        }}
                      />
                    </label>
                  </div>
                  {angleLocked && (
                    <button type="button" className={styles.resetBtn} onClick={() => resetAngle(i)}>
                      Reset angle to auto
                    </button>
                  )}
                </>
              )}
              {n > 3 && (
                <button type="button" className={styles.removeBtn} onClick={() => handleRemoveCorner(i)}>
                  Remove this corner
                </button>
              )}
            </div>
          )
        })()}

      {selection?.kind === "edge" &&
        (() => {
          const i = selection.index
          const locked = lockedEdgeLengths[String(i)] !== undefined
          return (
            <div className={styles.pointPanel}>
              <div className={styles.pointHeader}>
                <span>Side {i + 1}</span>
                <button type="button" className={styles.closeBtn} onClick={() => setSelection(null)} aria-label="Close">
                  ✕
                </button>
              </div>
              {i === autoEdgeIndex ? (
                <p className={styles.autoNote}>This side stays automatic so the shape can close.</p>
              ) : (
                <>
                  <div className={styles.pointFields}>
                    <label>
                      Length (mm)
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={Math.round(edgeLength(points, i))}
                        onChange={(e) => {
                          const v = Math.round(Number(e.target.value) || 0)
                          if (v > 0) setEdgeLength(i, v)
                        }}
                      />
                    </label>
                  </div>
                  {locked && (
                    <button type="button" className={styles.resetBtn} onClick={() => resetEdge(i)}>
                      Reset to auto
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })()}

      <p className={styles.hint}>
        Drag any corner to reshape the deck, or tap a corner or a side&apos;s midpoint to type an exact
        angle or length — everything still unset just follows the shape. Boards all run one consistent
        direction across the whole shape.
      </p>
    </div>
  )
}

export default PolygonShapeEditor

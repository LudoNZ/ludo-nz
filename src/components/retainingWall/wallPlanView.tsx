"use client"

import DiagramExplorer from "@/components/diagramExplorer/diagramExplorer"
import { ReactNode, useRef, useState } from "react"
import Button from "@/components/button/button"
import NumField from "@/components/weatherboards/numField"
import { WallProfile } from "./postProfile"
import { MAX_ANGLE_DEG, MIN_ANGLE_DEG, Obstruction, OBSTRUCTION_TYPES } from "./obstructions"
import {
  appendSegment,
  MAX_SEGMENT_M,
  prependSegment,
  insertCorner,
  offsetPolyline,
  PlanPoint,
  pointAtDistance,
  removeCorner,
  RetainedSide,
  segmentLabel,
  segmentLengths,
  setSegmentLength,
  setTurn,
  turnDeg,
} from "./wallPlan"
import { placeLabels } from "./planLabels"
import styles from "./wallPlanView.module.scss"

/** dragged corners land on a 100mm grid… */
const GRID_M = 0.1
/** …unless they're this close to lining up square with a neighbouring
 * corner, in which case they snap dead in line with it instead */
const ALIGN_SNAP_M = 0.15
const MIN_SEGMENT_M = 0.1
const NEW_SEGMENT_M = 2
const DRAG_THRESHOLD_PX = 4

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

function fitViewBox(points: PlanPoint[]): ViewBox {
  const xs = points.map((p) => p.xM)
  const ys = points.map((p) => p.yM)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const extent = Math.max(maxX - minX, maxY - minY, 1)
  const pad = extent * 0.18
  let w = maxX - minX + pad * 2
  let h = maxY - minY + pad * 2
  // a dead-straight wall would otherwise be a sliver with no room to
  // drag a corner out sideways
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  w = Math.max(w, h * 0.8)
  h = Math.max(h, w * 0.5)
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** Top-down plan of the wall: drag a corner to reshape, tap a run's "+"
 * to add a corner to it, tap a run to pick which elevation to look at.
 * The table underneath is the same shape as numbers — each run's length
 * and the turn at the end of it — for when a measured figure matters
 * more than a drag. Owns no shape state of its own: every change goes up
 * through onChange. */
const WallPlanView: React.FC<{
  points: PlanPoint[]
  retainedSide: RetainedSide
  /** for drawing posts where they'll actually land — null while the
   * inputs don't make a valid wall yet */
  profile: WallProfile | null
  selectedSegment: number | null
  selectedPostIndex: number | null
  onChange: (points: PlanPoint[]) => void
  onRetainedSideChange: (side: RetainedSide) => void
  onSelectSegment: (index: number) => void
  /** sets how many bays (posts − 1) a wall is divided into */
  onSetBayCount: (segmentIndex: number, bayCount: number) => void
  /** locked: the plan can be looked at (and a wall picked) but not changed */
  readOnly?: boolean
  /** the obstruction picked out (its handles show), and what moving or
   * turning one does */
  selectedObstructionId?: string | null
  onSelectObstruction?: (id: string) => void
  onObstructionChange?: (id: string, patch: Partial<Obstruction>) => void
  /** more to draw on the plan (stairs off the wall, say), in plan metres,
   * given the line weight and text size the plan's drawn at */
  overlay?: (sizes: { strokeW: number; fontSize: number }) => ReactNode
  /** the shapes the overlay draws, so the view fits them in and the
   * wall labels keep clear of them */
  overlayShapes?: PlanPoint[][]
}> = ({ points, retainedSide, profile, selectedSegment, selectedPostIndex, onChange, onRetainedSideChange, onSelectSegment,
  onSetBayCount,
  selectedObstructionId = null,
  onSelectObstruction,
  onObstructionChange,
  overlay,
  overlayShapes = [],
  readOnly = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  // the view is held still for the length of a drag — refitting it to the
  // moving corner every frame would slide the drawing out from under the
  // finger
  const [frozenView, setFrozenView] = useState<ViewBox | null>(null)
  // the wall cards show as one-line summaries until "Edit walls" is pressed
  const [editingWalls, setEditingWalls] = useState(false)
  const editing = editingWalls && !readOnly
  const dragRef = useRef<{ index: number; startClientX: number; startClientY: number; dragging: boolean } | null>(null)

  const view = frozenView ?? fitViewBox([...points, ...overlayShapes.flat()])
  const scale = Math.max(view.w, view.h)
  const fontSize = scale * 0.028
  const strokeW = scale * 0.008
  const handleR = scale * 0.02
  const lengths = segmentLengths(points)
  const lowSide: RetainedSide = retainedSide === "left" ? "right" : "left"
  const labelTexts = lengths.map((l, i) => `${segmentLabel(i)} · ${l.toFixed(2)} m`)
  const labelSpots = placeLabels(points, labelTexts, lowSide, retainedSide, fontSize, view, overlayShapes)

  const toPlan = (clientX: number, clientY: number): PlanPoint | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const local = pt.matrixTransform(ctm.inverse())
    return { xM: local.x, yM: local.y }
  }

  const snap = (index: number, raw: PlanPoint): PlanPoint => {
    const next = { xM: Math.round(raw.xM / GRID_M) * GRID_M, yM: Math.round(raw.yM / GRID_M) * GRID_M }
    for (const neighbour of [points[index - 1], points[index + 1]]) {
      if (!neighbour) continue
      if (Math.abs(raw.xM - neighbour.xM) < ALIGN_SNAP_M) next.xM = neighbour.xM
      if (Math.abs(raw.yM - neighbour.yM) < ALIGN_SNAP_M) next.yM = neighbour.yM
    }
    return { xM: Math.round(next.xM * 1000) / 1000, yM: Math.round(next.yM * 1000) / 1000 }
  }

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    if (readOnly) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { index, startClientX: e.clientX, startClientY: e.clientY, dragging: false }
    setFrozenView(fitViewBox([...points, ...overlayShapes.flat()]))
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    if (!d.dragging && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < DRAG_THRESHOLD_PX) return
    d.dragging = true
    const raw = toPlan(e.clientX, e.clientY)
    if (!raw) return
    const next = snap(d.index, raw)
    const current = points[d.index]
    if (next.xM === current.xM && next.yM === current.yM) return
    // never let a corner land on top of its neighbour — a zero-length
    // run has no direction, and nothing downstream can lay posts on it
    const tooClose = [points[d.index - 1], points[d.index + 1]].some(
      (n) => n && Math.hypot(n.xM - next.xM, n.yM - next.yM) < MIN_SEGMENT_M
    )
    if (tooClose) return
    // nor stretch a run past the longest a run can be
    const tooFar = [points[d.index - 1], points[d.index + 1]].some(
      (n) => n && Math.hypot(n.xM - next.xM, n.yM - next.yM) > MAX_SEGMENT_M
    )
    if (tooFar) return
    onChange(points.map((p, i) => (i === d.index ? next : p)))
  }
  const handlePointerUp = (e: React.PointerEvent) => {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setFrozenView(null)
  }

  // ── obstructions: dragged along their wall, or turned by a handle ──
  const obDrag = useRef<{ id: string; mode: "move" | "turn"; pointerId: number } | null>(null)
  /** an obstruction's wall: its start, unit direction, length, and unit
   * normal toward the retained ground */
  const runFrame = (segmentIndex: number) => {
    const a = points[segmentIndex]
    const b = points[segmentIndex + 1]
    if (!a || !b) return null
    const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
    const u = { xM: (b.xM - a.xM) / len, yM: (b.yM - a.yM) / len }
    const n = { xM: 0, yM: 0 }
    // toward the retained side of travel: "left" of (1, 0) on screen is up
    if (retainedSide === "left") Object.assign(n, { xM: u.yM, yM: -u.xM })
    else Object.assign(n, { xM: -u.yM, yM: u.xM })
    return { a, u, n, len }
  }
  const obstructionDraw = (profile?.obstructions ?? [])
    .filter((z) => z.onWall)
    .map((z) => {
      const o = z.obstruction
      const f = runFrame(o.segmentIndex)
      if (!f) return null
      const at = pointAtDistance(points, z.centreXM)
      const th = (o.angleDeg * Math.PI) / 180
      // along the obstruction, and square across it
      const d = { xM: Math.cos(th) * f.u.xM + Math.sin(th) * f.n.xM, yM: Math.cos(th) * f.u.yM + Math.sin(th) * f.n.yM }
      const e = { xM: -d.yM, yM: d.xM }
      const reach = Math.max(1.2, scale * 0.12)
      const strip = (half: number) =>
        [
          [-reach, -half],
          [reach, -half],
          [reach, half],
          [-reach, half],
        ]
          .map(([s, w]) => `${at.xM + d.xM * s + e.xM * w},${at.yM + d.yM * s + e.yM * w}`)
          .join(" ")
      return { z, o, at, d, reach, core: strip(o.sizeM / 2), zone: strip(o.sizeM / 2 + z.clearanceM), f }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const startObDrag = (id: string, mode: "move" | "turn") => (e: React.PointerEvent) => {
    if (readOnly || !onObstructionChange) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    obDrag.current = { id, mode, pointerId: e.pointerId }
    setFrozenView(fitViewBox([...points, ...overlayShapes.flat()]))
    onSelectObstruction?.(id)
  }
  const moveObDrag = (e: React.PointerEvent) => {
    const drag = obDrag.current
    if (!drag || !onObstructionChange) return
    const q = toPlan(e.clientX, e.clientY)
    const item = obstructionDraw.find((x) => x.o.id === drag.id)
    if (!q || !item) return
    const { f, o, at } = item
    if (drag.mode === "move") {
      const t = Math.max(0, Math.min(f.len, (q.xM - f.a.xM) * f.u.xM + (q.yM - f.a.yM) * f.u.yM))
      const distanceM = Math.round((o.from === "start" ? t : f.len - t) * 100) / 100
      if (distanceM !== o.distanceM) onObstructionChange(o.id, { distanceM })
    } else {
      const vx = q.xM - at.xM
      const vy = q.yM - at.yM
      let deg = (Math.atan2(vx * f.n.xM + vy * f.n.yM, vx * f.u.xM + vy * f.u.yM) * 180) / Math.PI
      // either end of the line will do
      if (deg < 0) deg += 180
      const angleDeg = Math.min(MAX_ANGLE_DEG, Math.max(MIN_ANGLE_DEG, Math.round(deg / 5) * 5))
      if (angleDeg !== o.angleDeg) onObstructionChange(o.id, { angleDeg })
    }
  }
  const endObDrag = (e: React.PointerEvent) => {
    obDrag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setFrozenView(null)
  }

  const band = [...points, ...offsetPolyline(points, retainedSide, scale * 0.05).reverse()]
  const postSize = (widthM: number) => Math.max(widthM, scale * 0.022)

  return (
    <div className={styles.planRoot}>
      <DiagramExplorer label="Wall plan">
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={styles.svg}
          role="img"
          aria-label="Plan view of the wall, seen from above"
        >
          {/* retained ground: a band of soil along the uphill side */}
          <polygon points={band.map((p) => `${p.xM},${p.yM}`).join(" ")} className={styles.retainedBand} />

          {points.slice(0, -1).map((a, i) => {
            const b = points[i + 1]
            const selected = selectedSegment === i
            return (
              <g key={`seg-${i}`}>
                <line
                  x1={a.xM}
                  y1={a.yM}
                  x2={b.xM}
                  y2={b.yM}
                  className={selected ? styles.wallLineSelected : styles.wallLine}
                  strokeWidth={strokeW * (selected ? 1.6 : 1)}
                />
                {/* fat invisible stroke so a run is tappable on a phone */}
                <line
                  x1={a.xM}
                  y1={a.yM}
                  x2={b.xM}
                  y2={b.yM}
                  className={styles.wallHit}
                  strokeWidth={handleR * 3}
                  onClick={() => onSelectSegment(i)}
                  role="button"
                  aria-label={`Wall ${segmentLabel(i)}, ${lengths[i].toFixed(2)} metres — tap to view its elevation`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onSelectSegment(i)
                    }
                  }}
                />
              </g>
            )
          })}

          {/* obstructions in the ground: the thing itself, its clearance
              zone dashed either side */}
          {obstructionDraw.map(({ o, core, zone }) => {
            const color = OBSTRUCTION_TYPES[o.type].color
            const picked = o.id === selectedObstructionId
            return (
              <g
                key={`ob-${o.id}`}
                className={styles.obstruction}
                onClick={() => onSelectObstruction?.(o.id)}
                role={onSelectObstruction ? "button" : undefined}
                aria-label={`${o.label || OBSTRUCTION_TYPES[o.type].label} — tap to pick it out`}
              >
                <polygon
                  points={zone}
                  fill={color}
                  fillOpacity={picked ? 0.22 : 0.1}
                  stroke={color}
                  strokeWidth={strokeW * 0.35}
                  strokeDasharray={`${strokeW * 1.2} ${strokeW}`}
                />
                <polygon points={core} fill={color} fillOpacity={0.85} />
              </g>
            )
          })}

          {/* posts, where the layout actually puts them */}
          {profile?.posts.map((post) => {
            const at = pointAtDistance(points, post.xM)
            const size = postSize(post.widthM)
            return (
              <g key={`post-${post.index}`}>
                <rect
                  x={at.xM - size / 2}
                  y={at.yM - size / 2}
                  width={size}
                  height={size}
                  className={post.index === selectedPostIndex ? styles.postSelected : post.needsEngineer ? styles.postBlocked : styles.post}
                  strokeWidth={strokeW * 0.4}
                />
                {/* a post pinned at a set distance: ringed */}
                {post.fixed && <circle cx={at.xM} cy={at.yM} r={size * 1.1} className={styles.postFixedRing} strokeWidth={strokeW * 0.5} />}
              </g>
            )
          })}

          {overlay?.({ strokeW, fontSize })}

          {/* run labels, placed clear of each other and of the walls (see
              placeLabels) — on the low side where there's room */}
          {labelTexts.map((text, i) => {
            const at = labelSpots[i]
            return (
              <text
                key={`label-${i}`}
                x={at.xM}
                y={at.yM}
                fontSize={fontSize}
                textAnchor="middle"
                dominantBaseline="middle"
                className={selectedSegment === i ? styles.labelSelected : styles.label}
              >
                {text}
              </text>
            )
          })}

          {/* "+" on each run: adds a corner there, ready to drag out */}
          {(readOnly ? [] : points.slice(0, -1)).map((a, i) => {
            const b = points[i + 1]
            const cx = (a.xM + b.xM) / 2
            const cy = (a.yM + b.yM) / 2
            const arm = handleR * 0.55
            return (
              <g
                key={`add-${i}`}
                className={styles.addHandle}
                onClick={() => onChange(insertCorner(points, i))}
                role="button"
                aria-label={`Add a corner to wall ${segmentLabel(i)}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onChange(insertCorner(points, i))
                  }
                }}
              >
                <circle cx={cx} cy={cy} r={handleR * 2} className={styles.handleHit} />
                <circle cx={cx} cy={cy} r={handleR} className={styles.addHandleDot} strokeWidth={strokeW * 0.5} />
                <line x1={cx - arm} y1={cy} x2={cx + arm} y2={cy} className={styles.addHandleCross} strokeWidth={strokeW * 0.6} />
                <line x1={cx} y1={cy - arm} x2={cx} y2={cy + arm} className={styles.addHandleCross} strokeWidth={strokeW * 0.6} />
              </g>
            )
          })}

          {/* draggable ends and corners */}
          {points.map((p, i) => (
            <g
              key={`vertex-${i}`}
              className={styles.vertex}
              // its own drag, not the explorer's pan
              data-explore-skip
              onPointerDown={handlePointerDown(i)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <circle cx={p.xM} cy={p.yM} r={handleR * 2.4} className={styles.handleHit} />
              <circle cx={p.xM} cy={p.yM} r={handleR * 1.15} className={styles.vertexDot} strokeWidth={strokeW * 0.6} />
            </g>
          ))}
          {/* the picked obstruction's handles: drag the middle one along
              the wall, the round one at its end to turn it */}
          {!readOnly &&
            onObstructionChange &&
            obstructionDraw
              .filter(({ o }) => o.id === selectedObstructionId)
              .map(({ o, at, d, reach }) => {
                const color = OBSTRUCTION_TYPES[o.type].color
                const tip = { xM: at.xM + d.xM * reach, yM: at.yM + d.yM * reach }
                return (
                  <g key={`ob-handles-${o.id}`}>
                    <line x1={at.xM} y1={at.yM} x2={tip.xM} y2={tip.yM} stroke={color} strokeWidth={strokeW * 0.3} />
                    <g
                      className={styles.obstructionHandle}
                      data-explore-skip
                      onPointerDown={startObDrag(o.id, "move")}
                      onPointerMove={moveObDrag}
                      onPointerUp={endObDrag}
                      onPointerCancel={endObDrag}
                      aria-label="Drag to move it along the wall"
                    >
                      <circle cx={at.xM} cy={at.yM} r={handleR * 2.4} className={styles.handleHit} />
                      <rect
                        x={at.xM - handleR}
                        y={at.yM - handleR}
                        width={handleR * 2}
                        height={handleR * 2}
                        fill="#fff"
                        stroke={color}
                        strokeWidth={strokeW * 0.6}
                      />
                    </g>
                    <g
                      className={styles.obstructionHandle}
                      data-explore-skip
                      onPointerDown={startObDrag(o.id, "turn")}
                      onPointerMove={moveObDrag}
                      onPointerUp={endObDrag}
                      onPointerCancel={endObDrag}
                      aria-label="Drag to turn it"
                    >
                      <circle cx={tip.xM} cy={tip.yM} r={handleR * 2.4} className={styles.handleHit} />
                      <circle cx={tip.xM} cy={tip.yM} r={handleR} fill="#fff" stroke={color} strokeWidth={strokeW * 0.6} />
                    </g>
                    <text x={tip.xM} y={tip.yM - handleR * 1.8} fontSize={fontSize * 0.8} textAnchor="middle" fill={color}>
                      {o.angleDeg}°
                    </text>
                  </g>
                )
              })}
        </svg>
      </DiagramExplorer>

      <div className={styles.legend}>
        <span>
          <span className={styles.vertexSwatch} /> Drag to move an end or corner
        </span>
        <span>
          <span className={styles.addSwatch}>+</span> Add a corner to that wall
        </span>
        <span>
          <span className={styles.retainedSwatch} /> Retained ground side
        </span>
        {obstructionDraw.length > 0 && (
          <span>
            <span className={styles.obstructionSwatch} /> Obstruction and its clearance — tap one, then drag its square to
            move it or its circle to turn it
          </span>
        )}
      </div>

      <div className={styles.segmentTableHead}>
        <span>Walls</span>
        <div className={styles.actions}>
          {editing && (
            <>
              <Button size="small" variant="secondary" onClick={() => onChange(prependSegment(points, retainedSide, NEW_SEGMENT_M))}>
                + Wall at start
              </Button>
              <Button size="small" variant="secondary" onClick={() => onChange(appendSegment(points, retainedSide, NEW_SEGMENT_M))}>
                + Wall at end
              </Button>
            </>
          )}
          <Button size="small" variant="secondary" disabled={readOnly} onClick={() => onRetainedSideChange(lowSide)}>
            Flip side
          </Button>
          <Button size="small" variant={editing ? "primary" : "secondary"} disabled={readOnly} onClick={() => setEditingWalls((v) => !v)}>
            {editing ? "Done" : "Edit walls"}
          </Button>
        </div>
      </div>
      <div className={styles.segmentTable}>
        {lengths.map((lengthM, i) => {
          const isLast = i === lengths.length - 1
          const seg = profile?.segments.length === lengths.length ? profile.segments[i] : undefined
          const bays = seg ? seg.endPostIndex - seg.startPostIndex : 0
          const tooWide = seg ? seg.postSpacingM > seg.tableMaxSpacingM + 1e-6 : false
          if (!editing) {
            const turn = isLast ? 0 : turnDeg(points, i + 1)
            return (
              <div key={i} className={`${styles.segmentSummary} ${selectedSegment === i ? styles.segmentRowSelected : ""}`}>
                <button type="button" className={styles.segmentSummaryName} onClick={() => onSelectSegment(i)}>
                  Wall {segmentLabel(i)}
                </button>
                <span>{lengthM.toFixed(2)} m</span>
                {!isLast && (
                  <span className={styles.segmentSummaryMuted}>
                    {Math.abs(turn) < 0.05 ? "then straight on" : `then ${Math.abs(Number(turn.toFixed(1)))}° ${turn > 0 ? "left" : "right"}`}
                  </span>
                )}
                {seg && (
                  <span className={`${styles.segmentSummaryPosts} ${tooWide ? styles.postSpacingWarn : ""}`}>
                    {bays + 1} posts at {Math.round(seg.postSpacingM * 1000)}mm{seg.spacingOverridden ? " (by hand)" : ""}
                    {tooWide ? " ⚠" : ""}
                  </span>
                )}
              </div>
            )
          }
          return (
            <div key={i} className={`${styles.segmentRow} ${selectedSegment === i ? styles.segmentRowSelected : ""}`}>
              <button type="button" className={styles.segmentName} onClick={() => onSelectSegment(i)}>
                Wall {segmentLabel(i)}
              </button>
              <label className={styles.segmentField}>
                <span>Length (m)</span>
                <NumField
                  value={Number(lengthM.toFixed(3))}
                  min={MIN_SEGMENT_M}
                  max={MAX_SEGMENT_M}
                  step={1}
                  snapToStep
                  onChange={(v) => onChange(setSegmentLength(points, i, v))}
                  ariaLabel={`Wall ${segmentLabel(i)} length in metres`}
                  disabled={readOnly}
                />
              </label>
              {!isLast && (
                <>
                  <div className={styles.segmentField}>
                    <span>Then turn (°)</span>
                    <span className={styles.turnInput}>
                      <NumField
                        value={Math.abs(Number(turnDeg(points, i + 1).toFixed(1)))}
                        min={0}
                        step={5}
                        onChange={(v) => {
                          const sign = turnDeg(points, i + 1) < 0 ? -1 : 1
                          if (v < 180) onChange(setTurn(points, i + 1, sign * v))
                        }}
                        ariaLabel={`Turn after wall ${segmentLabel(i)} in degrees`}
                        disabled={readOnly}
                      />
                      <span className={styles.turnSide} role="group" aria-label={`Turn direction after wall ${segmentLabel(i)}`}>
                        {(["left", "right"] as const).map((dir) => {
                          const turn = turnDeg(points, i + 1)
                          const active = dir === "left" ? turn > 0.05 : turn < -0.05
                          return (
                            <button
                              key={dir}
                              type="button"
                              aria-pressed={active}
                              className={active ? styles.turnSideActive : undefined}
                              disabled={readOnly}
                              onClick={() => {
                                const mag = Math.abs(turn) < 0.05 ? 90 : Math.abs(turn)
                                onChange(setTurn(points, i + 1, dir === "left" ? mag : -mag))
                              }}
                            >
                              {dir === "left" ? "Left" : "Right"}
                            </button>
                          )
                        })}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.removeCorner}
                    disabled={readOnly}
                    onClick={() => onChange(removeCorner(points, i + 1))}
                    aria-label={`Remove the corner between walls ${segmentLabel(i)} and ${segmentLabel(i + 1)}`}
                  >
                    Remove corner
                  </button>
                </>
              )}
              {seg && (
                <div className={styles.segmentPosts}>
                  <span className={styles.segmentPostsLabel}>
                    Posts{seg.spacingOverridden ? " (set by hand)" : ""}
                  </span>
                  <span className={styles.postStepper}>
                    <button
                      type="button"
                      aria-label={`One post fewer on wall ${segmentLabel(i)}`}
                      disabled={readOnly || bays <= 1}
                      onClick={() => onSetBayCount(i, bays - 1)}
                    >
                      −
                    </button>
                    <strong>{bays + 1}</strong>
                    <button
                      type="button"
                      aria-label={`One post more on wall ${segmentLabel(i)}`}
                      disabled={readOnly}
                      onClick={() => onSetBayCount(i, bays + 1)}
                    >
                      +
                    </button>
                    <span className={tooWide ? styles.postSpacingWarn : styles.postSpacing}>
                      at {Math.round(seg.postSpacingM * 1000)}mm{tooWide ? " ⚠" : ""}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {editing && (
        <p className={styles.hint}>
          Turns are measured walking the wall from A onward: pick Left or Right and the angle, 90 is a square corner. A corner post is shared, so each wall&apos;s post count includes both of its ends. Tap a wall&apos;s
          name to see its elevation, where its spacing can be set or cleared.
        </p>
      )}

    </div>
  )
}

export default WallPlanView

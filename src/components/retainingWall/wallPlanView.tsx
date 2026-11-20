"use client"

import DiagramExplorer, { ExploreState } from "@/components/diagramExplorer/diagramExplorer"
import { ReactNode, useRef, useState } from "react"
import Button from "@/components/button/button"
import NumField from "@/components/weatherboards/numField"
import { ProfilePost, WallProfile } from "./postProfile"
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
  levelRotationFor,
  normalizeDeg,
  rotatePoint,
  segmentLengths,
  setSegmentLength,
  sideNormal,
  setTurn,
  turnDeg,
} from "./wallPlan"
import { placeLabels } from "./planLabels"
import { BOARD_THICKNESS_M, isRoundPost, shortPostSize } from "./calcSettings"
import PlanTurnModal from "./planTurnModal"
import styles from "./wallPlanView.module.scss"

/** dragged corners land on a 100mm grid… */
const GRID_M = 0.1
/** …unless they're this close to lining up square with a neighbouring
 * corner, in which case they snap dead in line with it instead */
const ALIGN_SNAP_M = 0.15
const MIN_SEGMENT_M = 0.1
const NEW_SEGMENT_M = 2
const DRAG_THRESHOLD_PX = 4
/** ms the "Wall … level" button is held to open every turn option */
const HOLD_MS = 450
/** a post's never drawn smaller than this share of the view, so it shows
 * on a long wall — zoomed in, its true size takes over */
const POST_MIN_SCREEN = 0.022
/** when each layer of detail fades in, from first showing to fully shown,
 * by the smallest real post's size as a share of the view (POST_MIN_SCREEN
 * is where posts are first drawn true size) */
const DETAIL: Record<"holes" | "boards" | "tags", [number, number]> = {
  holes: [0.018, 0.026],
  boards: [0.022, 0.032],
  tags: [0.03, 0.04],
}

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
  overlay?: (sizes: { strokeW: number; fontSize: number; rotationDeg: number }) => ReactNode
  /** the shapes the overlay draws, so the view fits them in and the
   * wall labels keep clear of them */
  overlayShapes?: PlanPoint[][]
  /** degrees clockwise the drawing's turned on screen (a view setting:
   * the wall's shape is the same either way) */
  rotationDeg?: number
  /** turns the view — without it there's no turn control */
  onRotationChange?: (deg: number) => void
}> = ({ points, retainedSide, profile, selectedSegment, selectedPostIndex, onChange, onRetainedSideChange, onSelectSegment,
  onSetBayCount,
  selectedObstructionId = null,
  onSelectObstruction,
  onObstructionChange,
  overlay,
  overlayShapes = [],
  readOnly = false,
  rotationDeg = 0,
  onRotationChange,
}) => {
  /** the turned group the drawing's in: pointer positions map through it
   * back to plan metres */
  const planGroupRef = useRef<SVGGElement>(null)
  /** what the view's fitted to, turned the way it's shown */
  const fitShown = () => fitViewBox([...points, ...overlayShapes.flat()].map((p) => rotatePoint(p, rotationDeg)))
  // the view is held still for the length of a drag — refitting it to the
  // moving corner every frame would slide the drawing out from under the
  // finger
  const [frozenView, setFrozenView] = useState<ViewBox | null>(null)
  // Measure: tap two posts for the distance between them
  const [measuring, setMeasuring] = useState(false)
  const [measurePicks, setMeasurePicks] = useState<number[]>([])
  const postCount = profile?.posts.length ?? 0
  // a wall reshaped down to fewer posts drops picks that no longer exist
  const picks = measurePicks.filter((i) => i < postCount)
  const pickPost = (i: number) => setMeasurePicks((p) => (p.length >= 2 ? [i] : p.includes(i) ? p : [...p, i]))
  /** the two picked posts' centres: straight across, and along the wall */
  const measured = (() => {
    if (picks.length < 2 || !profile) return null
    const [pa, pb] = picks.map((i) => profile.posts[i])
    const a = pointAtDistance(points, pa.xM)
    const b = pointAtDistance(points, pb.xM)
    return { pa, pb, a, b, straightM: Math.hypot(b.xM - a.xM, b.yM - a.yM), alongM: Math.abs(pb.xM - pa.xM) }
  })()
  // the wall cards show as one-line summaries until "Edit walls" is pressed
  const [editingWalls, setEditingWalls] = useState(false)
  const editing = editingWalls && !readOnly
  const dragRef = useRef<{ index: number; startClientX: number; startClientY: number; dragging: boolean } | null>(null)

  const view = frozenView ?? fitShown()
  const scale = Math.max(view.w, view.h)
  // labels are placed at the fitted text size, so they hold still while
  // the drawing's zoomed (they only get smaller on screen-size terms)
  const baseFontSize = scale * 0.028
  const lengths = segmentLengths(points)
  const lowSide: RetainedSide = retainedSide === "left" ? "right" : "left"
  const labelTexts = lengths.map((l, i) => `${segmentLabel(i)} · ${l.toFixed(2)} m`)
  // placed on screen terms (in the turned frame), so they stay level and
  // clear of each other whichever way the plan's turned
  const labelSpots = placeLabels(
    points.map((p) => rotatePoint(p, rotationDeg)),
    labelTexts,
    lowSide,
    retainedSide,
    baseFontSize,
    view,
    overlayShapes.map((shape) => shape.map((p) => rotatePoint(p, rotationDeg))),
  )

  const toPlan = (clientX: number, clientY: number): PlanPoint | null => {
    const group = planGroupRef.current
    const svg = group?.ownerSVGElement
    const ctm = group?.getScreenCTM()
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
    setFrozenView(fitShown())
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
    setFrozenView(fitShown())
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

  /** The drawing at a zoom (1 = fitted). Line weights, text and handles
   * are sized in screen terms (`px`, the fitted drawing's size over the
   * zoom), so they stay the same on screen as it's zoomed; posts, holes
   * and boards are real things, drawn at least big enough to see and at
   * their true size once the zoom shows it — with more detail coming in
   * the closer it gets. */
  const drawPlan = ({ zoom, locked, turn: liveTurn }: ExploreState) => {
    // full screen, two fingers twist the view on top of the saved turn —
    // about the drawing's middle, and never saved
    const shownDeg = normalizeDeg(rotationDeg + liveTurn)
    const liveTransform = liveTurn ? `rotate(${liveTurn} ${view.x + view.w / 2} ${view.y + view.h / 2})` : undefined
    // full-screen with editing off: looked at, not changed — a drag pans
    const fixed = readOnly || locked
    const px = scale / zoom
    const fontSize = px * 0.028
    const strokeW = px * 0.008
    const handleR = px * 0.02
    const postSize = (widthM: number) => Math.max(widthM, px * POST_MIN_SCREEN)
    const posts = profile?.posts ?? []
    // how far into each layer of detail: 0 hidden, 1 fully shown — a
    // real post's size on screen (as a share of the drawing) sets them
    const smallestPostM = Math.min(...posts.map((p) => p.widthM), 1)
    const postScreen = smallestPostM / px
    // nothing extra at the fitted view (it's the page's drawing): it comes
    // in as soon as it's zoomed
    const zoomedIn = Math.min(1, Math.max(0, (zoom - 1) / 0.4))
    const ramp = (lo: number, hi: number) => zoomedIn * Math.min(1, Math.max(0, (postScreen - lo) / (hi - lo)))
    const holeShow = ramp(...DETAIL.holes)
    const boardShow = ramp(...DETAIL.boards)
    // the backfill: from the wall line, or — once the boards are drawn —
    // from the back of the boards, where the ground actually starts (the
    // widest post's back face plus a board: one line for the whole wall)
    const backfillFrom = boardShow * (Math.max(0, ...posts.map((p) => p.widthM)) / 2 + BOARD_THICKNESS_M)
    const band = [
      ...offsetPolyline(points, retainedSide, backfillFrom),
      ...offsetPolyline(points, retainedSide, backfillFrom + px * 0.05).reverse(),
    ]
    const tagShow = ramp(...DETAIL.tags)
    const lowNormal = (a: PlanPoint, b: PlanPoint) => sideNormal(a, b, lowSide)
    const turn = rotationDeg ? `rotate(${rotationDeg})` : undefined
    /** turns text at `at` back level, inside the turned drawing */
    const upright = (at: PlanPoint) => (shownDeg ? `rotate(${-shownDeg} ${at.xM} ${at.yM})` : undefined)
    /** screen-up, in plan terms */
    const up = rotatePoint({ xM: 0, yM: -1 }, -shownDeg)
    /** the run a post sits on, and its two ends */
    const runOf = (postIndex: number) => {
      const seg = profile?.segments.find((g) => postIndex >= g.startPostIndex && postIndex <= g.endPostIndex)
      const i = seg?.index ?? 0
      return { a: points[i], b: points[i + 1] ?? points[i] }
    }
    /** a post's label, close in: its number and size ("7 · □150"), and
     * under it how far it is from the start of its wall — at a corner,
     * where it ends one wall and starts the next, both ("2000 · E 0") */
    const postLabel = (post: ProfilePost) => {
      const runs = (profile?.segments ?? []).filter((g) => post.index >= g.startPostIndex && post.index <= g.endPostIndex)
      const running = runs
        .map((g) => (post.index === g.startPostIndex ? `${segmentLabel(g.index)} 0` : `${Math.round((post.xM - g.startXM) * 1000)}`))
        .join(" · ")
      return { tag: `${post.index + 1} · ${shortPostSize(post.sizeLabel)}`, running }
    }
    const labelFont = fontSize * 0.7
    const labelLine = labelFont * 1.2
    /** how far the two-line label reaches out from its middle along the
     * plan direction `n` — it's level on screen, so that's half its width
     * across a wall running up the screen, half its height across one
     * running along it */
    const labelReach = (lines: string[], n: PlanPoint) => {
      const ns = rotatePoint(n, shownDeg)
      // the site font's monospace: about 0.6 of the size per character
      const width = Math.max(...lines.map((l) => l.length)) * 0.6 * labelFont
      return (Math.abs(ns.xM) * width) / 2 + (Math.abs(ns.yM) * labelLine * lines.length) / 2
    }
    /** the run a bay's on — for a bay starting at a corner post, the run
     * it starts, not the one the corner post ends */
    const runOfBay = (left: number, right: number) => {
      const seg = profile?.segments.find((g) => left >= g.startPostIndex && right <= g.endPostIndex)
      const i = seg?.index ?? 0
      return { a: points[i], b: points[i + 1] ?? points[i] }
    }
    return (
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={styles.svg}
          role="img"
          aria-label="Plan view of the wall, seen from above"
          // twisted, its corners reach past the box: the screen's the edge
          style={liveTurn ? { overflow: "visible" } : undefined}
        >
          <g transform={liveTransform}>
          {/* the drawing in plan metres, turned as it's shown; text in it
              turns back to stay level (see upright) */}
          <g ref={planGroupRef} transform={turn}>
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
                  className={selected ? styles.wallLineSelected : boardShow >= 1 ? styles.wallLineSetout : styles.wallLine}
                  // with the boards drawn, the wall line is just the setting-out line
                  strokeWidth={strokeW * (selected ? 1.6 : 1) * (1 - boardShow * 0.7)}
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

          {/* the facing boards, at their real thickness, on the retained
              side of each bay's posts — once they're big enough to see */}
          {boardShow > 0 &&
            profile?.bays.map((bay) => {
              const pa = posts[bay.leftIndex]
              const pb = posts[bay.rightIndex]
              if (!pa || !pb) return null
              const a = pointAtDistance(points, pa.xM)
              const b = pointAtDistance(points, pb.xM)
              const { a: ra, b: rb } = runOfBay(bay.leftIndex, bay.rightIndex)
              const n = sideNormal(ra, rb, retainedSide)
              const near = Math.max(pa.widthM, pb.widthM) / 2
              const far = near + BOARD_THICKNESS_M
              const corners = [
                [a, near],
                [b, near],
                [b, far],
                [a, far],
              ] as const
              return (
                <polygon
                  key={`board-${bay.leftIndex}`}
                  points={corners.map(([p, o]) => `${p.xM + n.xM * o},${p.yM + n.yM * o}`).join(" ")}
                  className={bay.needsEngineer ? styles.boardBlocked : styles.board}
                  strokeWidth={strokeW * 0.25}
                  opacity={boardShow}
                />
              )
            })}

          {/* each hole, dashed round its post, once a post is drawn true size */}
          {holeShow > 0 &&
            posts.map((post) => {
              const at = pointAtDistance(points, post.xM)
              return (
                <circle
                  key={`hole-${post.index}`}
                  cx={at.xM}
                  cy={at.yM}
                  r={post.holeDiameterM / 2}
                  className={styles.hole}
                  strokeWidth={strokeW * 0.3}
                  strokeDasharray={`${strokeW * 0.8} ${strokeW * 0.6}`}
                  opacity={holeShow}
                />
              )
            })}

          {/* posts, where the layout actually puts them: poles round,
              sawn posts square */}
          {posts.map((post) => {
            const at = pointAtDistance(points, post.xM)
            const size = postSize(post.widthM)
            const className = post.index === selectedPostIndex ? styles.postSelected : post.needsEngineer ? styles.postBlocked : styles.post
            return (
              <g key={`post-${post.index}`}>
                {isRoundPost(post.sizeLabel) ? (
                  <circle cx={at.xM} cy={at.yM} r={size / 2} className={className} strokeWidth={strokeW * 0.4} />
                ) : (
                  <rect
                    x={at.xM - size / 2}
                    y={at.yM - size / 2}
                    width={size}
                    height={size}
                    className={className}
                    strokeWidth={strokeW * 0.4}
                    // squared to its run, as it's set out
                    transform={(() => {
                      const { a, b } = runOf(post.index)
                      const deg = (Math.atan2(b.yM - a.yM, b.xM - a.xM) * 180) / Math.PI
                      return `rotate(${deg} ${at.xM} ${at.yM})`
                    })()}
                  />
                )}
                {/* a post pinned at a set distance: ringed */}
                {post.fixed && (
                  <circle cx={at.xM} cy={at.yM} r={size * 1.1} className={styles.postFixedRing} strokeWidth={strokeW * 0.5} />
                )}
                {measuring && picks.includes(post.index) && (
                  <circle cx={at.xM} cy={at.yM} r={Math.max(size * 0.8, handleR * 1.1)} className={styles.measurePick} strokeWidth={strokeW * 0.7} />
                )}
                {/* measuring, every post's tappable */}
                {measuring && (
                  <circle
                    cx={at.xM}
                    cy={at.yM}
                    r={Math.max(size * 0.7, handleR * 1.6)}
                    className={styles.postHit}
                    onClick={() => pickPost(post.index)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Post ${post.index + 1} — measure ${picks.length === 1 ? "to" : "from"} here`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        pickPost(post.index)
                      }
                    }}
                  />
                )}
              </g>
            )
          })}

          {/* measured: a line between the two picked posts, and how far */}
          {measuring &&
            measured &&
            (() => {
              const { a, b } = measured
              const mid = { xM: (a.xM + b.xM) / 2, yM: (a.yM + b.yM) / 2 }
              const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
              const nx = -(b.yM - a.yM) / len
              const ny = (b.xM - a.xM) / len
              const tick = handleR * 0.8
              const at = { xM: mid.xM + up.xM * fontSize * 0.9, yM: mid.yM + up.yM * fontSize * 0.9 }
              return (
                <g className={styles.measure}>
                  <line x1={a.xM} y1={a.yM} x2={b.xM} y2={b.yM} strokeWidth={strokeW * 0.6} strokeDasharray={`${strokeW * 2} ${strokeW * 1.2}`} />
                  {[a, b].map((p, k) => (
                    <line key={k} x1={p.xM - nx * tick} y1={p.yM - ny * tick} x2={p.xM + nx * tick} y2={p.yM + ny * tick} strokeWidth={strokeW * 0.6} />
                  ))}
                  <text
                    x={at.xM}
                    y={at.yM}
                    fontSize={fontSize * 0.85}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.measureLabel}
                    strokeWidth={fontSize * 0.25}
                    transform={upright(at)}
                  >
                    {Math.round(measured.straightM * 1000)} mm
                  </text>
                </g>
              )
            })()}

          {/* each picked pile's centre, where it's measured from — over the line */}
          {measuring &&
            picks.map((i) => {
              const post = posts[i]
              const at = pointAtDistance(points, post.xM)
              return (
                <circle
                  key={`measure-point-${i}`}
                  cx={at.xM}
                  cy={at.yM}
                  r={Math.min(handleR * 0.45, postSize(post.widthM) * 0.3)}
                  className={styles.measurePoint}
                  strokeWidth={strokeW * 0.3}
                />
              )
            })}

          {/* close in: each post's number and size on the low side, and
              each bay's post centres along the retained side */}
          {tagShow > 0 &&
            posts.map((post) => {
              const at = pointAtDistance(points, post.xM)
              const { a, b } = runOf(post.index)
              const n = lowNormal(a, b)
              const { tag, running } = postLabel(post)
              const off = Math.max(post.holeDiameterM, postSize(post.widthM)) / 2 + fontSize * 0.25 + labelReach([tag, running], n)
              const mid = { xM: at.xM + n.xM * off, yM: at.yM + n.yM * off }
              // the tag half a line up the screen, the running measurement
              // half a line down
              const line = (k: number) => ({ xM: mid.xM + up.xM * labelLine * k, yM: mid.yM + up.yM * labelLine * k })
              const top = line(0.5)
              const bottom = line(-0.5)
              return (
                <g key={`tag-${post.index}`} opacity={tagShow} className={styles.postLabel}>
                  <text
                    x={top.xM}
                    y={top.yM}
                    fontSize={labelFont}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={post.index === selectedPostIndex ? styles.postTagSelected : styles.postTag}
                    transform={upright(top)}
                  >
                    {tag}
                  </text>
                  <text
                    x={bottom.xM}
                    y={bottom.yM}
                    fontSize={labelFont}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.runningDim}
                    transform={upright(bottom)}
                  >
                    {running}
                  </text>
                </g>
              )
            })}
          {tagShow > 0 &&
            profile?.bays.map((bay) => {
              const pa = posts[bay.leftIndex]
              const pb = posts[bay.rightIndex]
              if (!pa || !pb) return null
              const a = pointAtDistance(points, pa.xM)
              const b = pointAtDistance(points, pb.xM)
              const { a: ra, b: rb } = runOfBay(bay.leftIndex, bay.rightIndex)
              const n = sideNormal(ra, rb, retainedSide)
              const off = Math.max(pa.widthM, pb.widthM) / 2 + BOARD_THICKNESS_M + fontSize * 0.75
              const mid = { xM: (a.xM + b.xM) / 2 + n.xM * off, yM: (a.yM + b.yM) / 2 + n.yM * off }
              // along the run as it's shown on screen, never upside down
              let deg = (Math.atan2(rb.yM - ra.yM, rb.xM - ra.xM) * 180) / Math.PI + shownDeg
              deg = normalizeDeg(deg)
              if (deg > 90) deg -= 180
              if (deg <= -90) deg += 180
              return (
                <text
                  key={`bay-${bay.leftIndex}`}
                  x={mid.xM}
                  y={mid.yM}
                  fontSize={fontSize * 0.65}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={styles.bayDim}
                  transform={`rotate(${deg - shownDeg} ${mid.xM} ${mid.yM})`}
                  opacity={tagShow}
                >
                  {Math.round(Math.abs(pb.xM - pa.xM) * 1000)}
                </text>
              )
            })}

          {overlay?.({ strokeW, fontSize, rotationDeg: shownDeg })}
          </g>

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
                transform={liveTurn ? `rotate(${-liveTurn} ${at.xM} ${at.yM})` : undefined}
              >
                {text}
              </text>
            )
          })}

          <g transform={turn}>
          {/* "+" on each run: adds a corner there, ready to drag out */}
          {(fixed ? [] : points.slice(0, -1)).map((a, i) => {
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
              className={fixed ? styles.vertexFixed : styles.vertex}
              // its own drag, not the explorer's pan
              data-explore-skip={fixed ? undefined : true}
              onPointerDown={fixed ? undefined : handlePointerDown(i)}
              onPointerMove={fixed ? undefined : handlePointerMove}
              onPointerUp={fixed ? undefined : handlePointerUp}
              onPointerCancel={fixed ? undefined : handlePointerUp}
            >
              <circle cx={p.xM} cy={p.yM} r={handleR * 2.4} className={styles.handleHit} />
              <circle cx={p.xM} cy={p.yM} r={handleR * 1.15} className={styles.vertexDot} strokeWidth={strokeW * 0.6} />
            </g>
          ))}
          {/* the picked obstruction's handles: drag the middle one along
              the wall, the round one at its end to turn it */}
          {!fixed &&
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
                    {(() => {
                      const at = { xM: tip.xM + up.xM * handleR * 1.8, yM: tip.yM + up.yM * handleR * 1.8 }
                      return (
                        <text x={at.xM} y={at.yM} fontSize={fontSize * 0.8} textAnchor="middle" fill={color} transform={upright(at)}>
                          {o.angleDeg}°
                        </text>
                      )
                    })()}
                  </g>
                )
              })}
          </g>
          </g>
        </svg>
    )
  }

  const measureBar = profile && profile.posts.length >= 2 && (
    <div className={styles.measureBar}>
      <button
        type="button"
        className={`${styles.turnText} ${measuring ? styles.measureOn : ""}`}
        aria-pressed={measuring}
        onClick={() => {
          setMeasuring((m) => !m)
          setMeasurePicks([])
        }}
        title="Tap two posts for the distance between their centres"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.measureIcon}>
          <path d="M2.5 13.5 13.5 2.5l4 4-11 11zM6 10l1.5 1.5M8.5 7.5l1.5 1.5M11 5l1.5 1.5" />
        </svg>
        Measure
      </button>
      {measuring && (
        <span className={styles.measureText} aria-live="polite">
          {picks.length === 0 && "Tap a post to measure from"}
          {picks.length === 1 && `From post ${picks[0] + 1} — now tap another`}
          {measured && (
            <>
              Post {measured.pa.index + 1} → {measured.pb.index + 1}: <strong>{Math.round(measured.straightM * 1000)} mm</strong> straight
              {Math.abs(measured.alongM - measured.straightM) > 0.0005 && <> · {Math.round(measured.alongM * 1000)} mm along the wall</>}
            </>
          )}
        </span>
      )}
    </div>
  )
  const levelSegment = selectedSegment ?? 0
  // holding the level button opens every turn option — under the plan
  // ("page") or full screen ("explore"), each with its own copy
  const [turnModal, setTurnModal] = useState<"page" | "explore" | null>(null)
  const [holding, setHolding] = useState<"page" | "explore" | null>(null)
  const hold = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false })
  const endHold = () => {
    if (hold.current.timer !== null) window.clearTimeout(hold.current.timer)
    hold.current.timer = null
    setHolding(null)
  }
  const holdHandlers = (where: "page" | "explore", onTap: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      endHold()
      hold.current.fired = false
      setHolding(where)
      hold.current.timer = window.setTimeout(() => {
        hold.current.fired = true
        hold.current.timer = null
        setHolding(null)
        setTurnModal(where)
      }, HOLD_MS)
    },
    onPointerUp: endHold,
    onPointerLeave: endHold,
    onPointerCancel: endHold,
    // a long press on a phone, or a right-click: the options straight away
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      endHold()
      hold.current.fired = true
      setTurnModal(where)
    },
    onClick: () => {
      // the press that opened the options isn't also a tap
      if (hold.current.fired) {
        hold.current.fired = false
        return
      }
      onTap()
    },
  })
  /** the turn controls: under the plan they turn it and save it with the
   * wall; full screen (`ex`) they only turn the view, like a twist does */
  const turnControls = (ex?: ExploreState) => {
    if (!onRotationChange) return null
    const shown = ex ? normalizeDeg(rotationDeg + ex.turn) : rotationDeg
    const turnBy = (deg: number) => (ex ? ex.turnBy(deg) : onRotationChange(normalizeDeg(rotationDeg + deg)))
    const turnTo = (deg: number) => (ex ? ex.setTurn(normalizeDeg(deg - rotationDeg)) : onRotationChange(deg))
    const canReset = ex ? Math.round(ex.turn) !== 0 : rotationDeg !== 0
    return (
      <div className={styles.turnBar} role="group" aria-label="Turn the plan view">
        <span className={styles.turnLabel}>{ex ? "Turn (not saved)" : "Turn view"}</span>
        <button type="button" className={styles.turnButton} onClick={() => turnBy(-15)} aria-label="Turn the plan 15° anticlockwise" title="15° anticlockwise">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5.5 7.5A6 6 0 1 1 4 11.5M5.5 3.5v4h4" />
          </svg>
        </button>
        <button type="button" className={styles.turnButton} onClick={() => turnBy(15)} aria-label="Turn the plan 15° clockwise" title="15° clockwise">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M14.5 7.5A6 6 0 1 0 16 11.5M14.5 3.5v4h-4" />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.turnText} ${styles.holdable} ${holding === (ex ? "explore" : "page") ? styles.holding : ""}`}
          {...holdHandlers(ex ? "explore" : "page", () => turnTo(levelRotationFor(points, levelSegment, retainedSide)))}
          title="Tap: lay this wall level, its retained side at the top. Hold: every way to turn the plan"
          aria-haspopup="dialog"
        >
          Wall {segmentLabel(levelSegment)} level
        </button>
        <span className={styles.turnAngle}>{Math.round(shown)}°</span>
        {canReset && (
          <button type="button" className={styles.turnText} onClick={() => (ex ? ex.setTurn(0) : onRotationChange(0))}>
            {ex ? "Back to saved" : "Reset"}
          </button>
        )}
        <PlanTurnModal
          isOpen={turnModal === (ex ? "explore" : "page")}
          onClose={() => setTurnModal(null)}
          points={points}
          retainedSide={retainedSide}
          shownDeg={shown}
          savedDeg={rotationDeg}
          onTurnTo={turnTo}
          onSaveDefault={
            ex
              ? () => {
                  onRotationChange(Math.round(shown))
                  ex.setTurn(0)
                }
              : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className={styles.planRoot}>
      <DiagramExplorer label="Wall plan" editable={!readOnly} turnable toolbar={(ex) => (
          <>
            {measureBar}
            {turnControls(ex)}
          </>
        )}
      >
        {drawPlan}
      </DiagramExplorer>
      {measureBar}
      {turnControls()}

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

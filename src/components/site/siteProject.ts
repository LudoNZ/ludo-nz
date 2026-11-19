/** A site project: output from more than one calculator on one site. For
 * now that's a retaining wall with stairs coming down in front of it —
 * each stair's top tread pinned to a point along the wall, its total rise
 * taken from the wall's height there.
 *
 * Plan coordinates are the wall plan's: metres, y down (as on screen).
 * The stairs calculator works in mm with its own origin (see
 * stairs/layout.ts); `placeStair` maps one onto the other. */

import { DEFAULT_INPUT, FlightSpec, FramingType, FRAMING_LABELS, StairInput, StairResult, TurnSpec, calculateStairs } from "../stairs/stairs"
import { StairLayout, calculateLayout } from "../stairs/layout"
import { newBlankWall, wallFromData, WallProject } from "../retainingWall/wallProject"
import { WallProfile } from "../retainingWall/postProfile"
import { PlanPoint, pointAtDistance, RetainedSide, sideNormal } from "../retainingWall/wallPlan"
import type { Pt } from "../stairs/stairs"
import { StairMember, stairSolids } from "../stairs/stairRender3d"
import type { RenderExtra } from "../retainingWall/wallRender3d"
import type { ElevationExtra } from "../retainingWall/wallProfileDiagram"

export const MIN_STAIR_ANGLE_DEG = 30
export const MAX_STAIR_ANGLE_DEG = 150

/** which part of the top tread sits at the fixed point */
export type StairAnchor = "centre" | "near" | "far"

export const STAIR_ANCHOR_LABELS: Record<StairAnchor, string> = {
  centre: "Its centre line",
  near: "Its nearer edge",
  far: "Its farther edge",
}

/** how the stair meets the top of the wall */
export type StairTop = "wallRiser" | "onWall"

export const STAIR_TOP_LABELS: Record<StairTop, string> = {
  wallRiser: "The wall is the last riser — the top tread stops at the wall's face",
  onWall: "The top tread is level with the top — the stair has its own last riser",
}

export interface SiteStair {
  id: string
  /** e.g. "Steps to the lawn" */
  label: string
  /** the wall (run) it comes down from */
  segmentIndex: number
  /** the fixed point is `distanceM` from this end of that wall */
  from: "start" | "end"
  distanceM: number
  /** which part of the top tread sits on the fixed point */
  anchor: StairAnchor
  /** degrees between the wall (walking from its start to its end) and the
   * way down the stair: 90 comes straight out from the wall */
  angleDeg: number
  /** mm above the wall's ground where the stair finishes at the bottom —
   * the ground there's often built up with fill */
  bottomOffsetMm: number
  /** mm above (or below, negative) the top of the wall where it finishes
   * at the top */
  topOffsetMm: number
  top: StairTop
  /** the stairs calculator's inputs; totalRise is overwritten from the wall */
  input: StairInput
}

export interface SiteProject {
  wall: WallProject
  stairs: SiteStair[]
}

export const newBlankSite = (wall: WallProject = newBlankWall()): SiteProject => ({ wall, stairs: [] })

const randomId = () => Math.random().toString(36).slice(2, 10)

export const newSiteStair = (segmentIndex: number, segLengthM: number): SiteStair => ({
  id: randomId(),
  label: "",
  segmentIndex,
  from: "start",
  distanceM: Math.round((segLengthM / 2) * 100) / 100,
  anchor: "centre",
  angleDeg: 90,
  bottomOffsetMm: 0,
  topOffsetMm: 0,
  top: "wallRiser",
  input: { ...DEFAULT_INPUT },
})

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const numOrNull = (v: unknown, fallback: number | null) => (v === null ? null : typeof v === "number" && Number.isFinite(v) ? v : fallback)

/** A saved StairInput, anything missing or the wrong shape taken from the
 * calculator's defaults. */
export const stairInputFromData = (raw: unknown): StairInput => {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  const D = DEFAULT_INPUT
  const flights: FlightSpec[] =
    Array.isArray(d.flights) && d.flights.length > 0 ? d.flights.map((f) => ({ treads: numOrNull((f as Record<string, unknown>)?.treads, null) })) : D.flights
  const turns: TurnSpec[] = Array.isArray(d.turns)
    ? d.turns
        .filter((t) => typeof t === "object" && t !== null)
        .map((t) => ({
          kind: t.kind === "winders" ? "winders" : "landing",
          direction: t.direction === "right" ? "right" : "left",
          angle: num(t.angle, 90),
          winders: num(t.winders, 3),
        }))
    : D.turns
  return {
    totalRise: num(d.totalRise, D.totalRise),
    risers: numOrNull(d.risers, D.risers),
    going: num(d.going, D.going),
    width: num(d.width, D.width),
    framing: typeof d.framing === "string" && d.framing in FRAMING_LABELS ? (d.framing as FramingType) : D.framing,
    stringerDepth: numOrNull(d.stringerDepth, D.stringerDepth),
    stringerThickness: num(d.stringerThickness, D.stringerThickness),
    maxStringerSpacing: num(d.maxStringerSpacing, D.maxStringerSpacing),
    boardWidth: num(d.boardWidth, D.boardWidth),
    boardGap: num(d.boardGap, D.boardGap),
    boardThickness: num(d.boardThickness, D.boardThickness),
    nosing: numOrNull(d.nosing, D.nosing),
    riserBoards: typeof d.riserBoards === "boolean" ? d.riserBoards : D.riserBoards,
    // one more flight than turns, always
    flights: flights.length === turns.length + 1 ? flights : [...turns.map(() => ({ treads: null })), { treads: null }],
    turns,
  }
}

export const siteFromData = (raw: unknown): SiteProject => {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  const stairs = (Array.isArray(d.stairs) ? d.stairs : [])
    .filter((s) => typeof s === "object" && s !== null)
    .map(
      (s): SiteStair => ({
        id: typeof s.id === "string" && s.id ? s.id : randomId(),
        label: typeof s.label === "string" ? s.label : "",
        segmentIndex: typeof s.segmentIndex === "number" && s.segmentIndex >= 0 ? Math.round(s.segmentIndex) : 0,
        from: s.from === "end" ? "end" : "start",
        distanceM: Math.max(0, num(s.distanceM, 0)),
        anchor: s.anchor === "near" || s.anchor === "far" ? s.anchor : "centre",
        angleDeg: Math.min(MAX_STAIR_ANGLE_DEG, Math.max(MIN_STAIR_ANGLE_DEG, num(s.angleDeg, 90))),
        bottomOffsetMm: num(s.bottomOffsetMm, 0),
        topOffsetMm: num(s.topOffsetMm, 0),
        top: s.top === "onWall" ? "onWall" : "wallRiser",
        input: stairInputFromData(s.input),
      }),
    )
  return { wall: wallFromData(d.wall), stairs }
}

/** The wall's levels at a point along it (m), straight-line between the
 * posts either side. */
export const levelsAt = (profile: WallProfile, xM: number): { groundLevelM: number; topLevelM: number; postWidthM: number } | null => {
  const posts = profile.posts
  if (!posts.length) return null
  if (xM <= posts[0].xM) return { groundLevelM: posts[0].groundLevelM, topLevelM: posts[0].topLevelM, postWidthM: posts[0].widthM }
  for (let i = 1; i < posts.length; i++) {
    const a = posts[i - 1]
    const b = posts[i]
    if (xM <= b.xM) {
      const t = b.xM > a.xM ? (xM - a.xM) / (b.xM - a.xM) : 0
      const lerp = (p: number, q: number) => p + (q - p) * t
      return { groundLevelM: lerp(a.groundLevelM, b.groundLevelM), topLevelM: lerp(a.topLevelM, b.topLevelM), postWidthM: Math.max(a.widthM, b.widthM) }
    }
  }
  const last = posts[posts.length - 1]
  return { groundLevelM: last.groundLevelM, topLevelM: last.topLevelM, postWidthM: last.widthM }
}

/** A stair worked out where it sits on the wall. */
export interface StairPlacement {
  stair: SiteStair
  /** m along the unfolded wall, the middle of the top tread's back edge */
  centreXM: number
  /** the fixed point itself, m along the unfolded wall */
  fixedXM: number
  /** m, the ground in front of the wall and the top of the wall there */
  groundLevelM: number
  topLevelM: number
  /** m, where the stair finishes at the bottom and the top: the wall's
   * levels with the stair's offsets */
  bottomLevelM: number
  stairTopLevelM: number
  /** the calculator's inputs with the rise taken off the wall */
  input: StairInput
  result: StairResult
  layout: StairLayout
  /** stair-plan mm → wall plan m */
  toPlan: (p: Pt) => PlanPoint
  /** in wall plan coordinates: every tread, landing and winder */
  treads: PlanPoint[][]
  /** the edge it lands on at the top, where it meets the wall */
  topEdge: [PlanPoint, PlanPoint]
  /** the fixed point on the wall's face */
  fixedPoint: PlanPoint
  /** what's wrong with where it is, if anything */
  problems: string[]
}

const clampAngle = (deg: number) => Math.min(MAX_STAIR_ANGLE_DEG, Math.max(MIN_STAIR_ANGLE_DEG, deg))

/** Works out a stair where it's pinned: the wall's height there sets its
 * rise, and its plan is turned and moved so the top step meets the low
 * face of the wall with the chosen part of it on the fixed point. Null
 * while the wall isn't worked out, or the stair's wall is gone. */
export function placeStair(stair: SiteStair, points: PlanPoint[], retainedSide: RetainedSide, profile: WallProfile | null): StairPlacement | null {
  if (!profile) return null
  const seg = profile.segments[stair.segmentIndex]
  const a = points[stair.segmentIndex]
  const b = points[stair.segmentIndex + 1]
  if (!seg || !a || !b) return null
  const problems: string[] = []

  const theta = (clampAngle(stair.angleDeg) * Math.PI) / 180
  const sin = Math.sin(theta)
  // half the top tread measured along the wall (longer when it comes off
  // at an angle)
  const halfAlongM = stair.input.width / 2000 / sin
  const along = stair.from === "end" ? seg.lengthM - stair.distanceM : stair.distanceM
  // toward the far end from the end it's measured from
  const awaySign = stair.from === "end" ? -1 : 1
  const shift = stair.anchor === "near" ? halfAlongM * awaySign : stair.anchor === "far" ? -halfAlongM * awaySign : 0
  const centreAlong = along + shift
  const centreXM = seg.startXM + centreAlong
  const fixedXM = seg.startXM + along

  if (centreAlong - halfAlongM < -1e-6 || centreAlong + halfAlongM > seg.lengthM + 1e-6)
    problems.push("It runs past the end of its wall — move it in, or make it narrower.")

  const levels = levelsAt(profile, Math.min(seg.endXM, Math.max(seg.startXM, centreXM)))
  if (!levels) return null
  const bottomLevelM = levels.groundLevelM + stair.bottomOffsetMm / 1000
  const stairTopLevelM = levels.topLevelM + stair.topOffsetMm / 1000
  const riseMm = Math.round((stairTopLevelM - bottomLevelM) * 1000)
  if (riseMm < 100) problems.push(`It's only ${Math.max(0, riseMm)} mm from the bottom to the top there — too little for a step.`)
  const input: StairInput = { ...stair.input, totalRise: Math.max(100, riseMm) }
  const result = calculateStairs(input)
  const layout = calculateLayout(input, result)

  // the wall's frame there: along it, and out toward the low ground
  const lowSide: RetainedSide = retainedSide === "left" ? "right" : "left"
  const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
  const u = { xM: (b.xM - a.xM) / len, yM: (b.yM - a.yM) / len }
  const n = sideNormal(a, b, lowSide)
  // the way down the stair, and the way up
  const down = { xM: Math.cos(theta) * u.xM + Math.sin(theta) * n.xM, yM: Math.cos(theta) * u.yM + Math.sin(theta) * n.yM }
  const up = { x: -down.xM, y: -down.yM }

  // where the top tread meets the wall: on the low face of the posts
  const onLine = pointAtDistance(points, centreXM)
  const faceM = levels.postWidthM / 2
  // off at an angle the top edge isn't along the wall: push it out till
  // its back corner touches the face (the gap at the other corner is
  // filled in on site)
  const outM = faceM + (stair.input.width / 2000) * Math.abs(Math.cos(theta))
  // a top tread level with the top sits in front of the wall, so the
  // stair's own last riser is a going further out
  const topTreadM = stair.top === "onWall" ? result.going / 1000 : 0
  const topMid = { xM: onLine.xM + n.xM * outM + down.xM * topTreadM, yM: onLine.yM + n.yM * outM + down.yM * topTreadM }
  const fixedOnLine = pointAtDistance(points, fixedXM)
  const fixedPoint = { xM: fixedOnLine.xM + n.xM * faceM, yM: fixedOnLine.yM + n.yM * faceM }

  // turn the stair's plan so its climb runs `up`, then move the middle
  // of its top edge onto topMid (both y down: a turn, never a mirror)
  const [eL, eR] = layout.deckEdge
  const mid = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 }
  const rot = Math.atan2(up.y, up.x) - Math.atan2(layout.deckDir.y, layout.deckDir.x)
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const toPlan = (p: Pt): PlanPoint => {
    const x = (p.x - mid.x) / 1000
    const y = (p.y - mid.y) / 1000
    return { xM: topMid.xM + x * c - y * s, yM: topMid.yM + x * s + y * c }
  }

  const treads = [...layout.flights.flatMap((f) => f.treadPolys), ...layout.turns.map((t) => t.polygon)].map((poly) => poly.map(toPlan))
  if (topTreadM > 0) {
    // the top tread, between the wall and the last riser
    const [l, r] = [toPlan(eL), toPlan(eR)]
    const back = (q: PlanPoint) => ({ xM: q.xM - down.xM * topTreadM, yM: q.yM - down.yM * topTreadM })
    treads.push([l, r, back(r), back(l)])
  }
  if (layout.errors.length) problems.push(...layout.errors)

  return {
    stair,
    centreXM,
    fixedXM,
    groundLevelM: levels.groundLevelM,
    topLevelM: levels.topLevelM,
    bottomLevelM,
    stairTopLevelM,
    input,
    result,
    layout,
    toPlan,
    treads,
    topEdge: [toPlan(eL), toPlan(eR)],
    fixedPoint,
    problems,
  }
}

// ── the stair in the wall's 3D view ────────────────────────────────────

const FILL_COLOR = "#a0805a"
/** the fill under a raised bottom runs this far past the stair */
const FILL_MARGIN_M = 0.3

/** convex hull of plan points */
const hullOf = (pts: PlanPoint[]): PlanPoint[] => {
  const p = [...pts].sort((a, b) => a.xM - b.xM || a.yM - b.yM)
  if (p.length < 3) return p
  const turn = (o: PlanPoint, a: PlanPoint, b: PlanPoint) => (a.xM - o.xM) * (b.yM - o.yM) - (a.yM - o.yM) * (b.xM - o.xM)
  const half = (list: PlanPoint[]) => {
    const h: PlanPoint[] = []
    for (const q of list) {
      while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop()
      h.push(q)
    }
    h.pop()
    return h
  }
  return [...half(p), ...half([...p].reverse())]
}

/** A placed stair as solids in the wall's 3D world (metres, y = −plan y,
 * z = level): every part from the stairs calculator's model (less its
 * deck — the wall is the top), standing on its bottom level, and a pad of
 * fill under it where the ground's built up. */
export function stairRenderExtra(p: StairPlacement): RenderExtra {
  type V3 = [number, number, number]
  const toWall = ([x, y, z]: V3): V3 => {
    const q = p.toPlan({ x, y: -y })
    return [q.xM, -q.yM, p.bottomLevelM + z / 1000]
  }
  const solids: RenderExtra["solids"] = []
  const fillUp = p.bottomLevelM - p.groundLevelM
  if (fillUp > 0.005) {
    const hull = hullOf(p.treads.flat())
    const mid = hull.reduce((acc, q) => ({ xM: acc.xM + q.xM / hull.length, yM: acc.yM + q.yM / hull.length }), { xM: 0, yM: 0 })
    const out = hull.map((q) => {
      const d = Math.hypot(q.xM - mid.xM, q.yM - mid.yM) || 1
      return { xM: q.xM + ((q.xM - mid.xM) / d) * FILL_MARGIN_M, yM: q.yM + ((q.yM - mid.yM) / d) * FILL_MARGIN_M }
    })
    const bottom = out.map((q): V3 => [q.xM, -q.yM, p.groundLevelM + 0.004])
    const top = out.map((q): V3 => [q.xM, -q.yM, p.bottomLevelM])
    const faces = [
      { pts: bottom, color: FILL_COLOR },
      { pts: top, color: FILL_COLOR },
      ...out.map((_, i) => {
        const j = (i + 1) % out.length
        return { pts: [bottom[i], bottom[j], top[j], top[i]], color: FILL_COLOR }
      }),
    ]
    solids.push(faces)
  }
  for (const s of stairSolids(p.input, p.layout, NO_DECK)) solids.push(s.faces.map((f) => ({ pts: f.pts.map(toWall), color: f.color })))
  return { solids }
}

const NO_DECK: ReadonlySet<StairMember> = new Set<StairMember>(["deck"])

// ── the stair on the wall's elevation ──────────────────────────────────

/** A placed stair as seen on the wall's elevation, looking at the face of
 * the wall from the low side. */
export function stairElevationExtra(p: StairPlacement, points: PlanPoint[], profile: WallProfile): ElevationExtra | null {
  const seg = profile.segments[p.stair.segmentIndex]
  const a = points[p.stair.segmentIndex]
  const b = points[p.stair.segmentIndex + 1]
  if (!seg || !a || !b) return null
  const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
  const along = (q: PlanPoint) => seg.startXM + ((q.xM - a.xM) * (b.xM - a.xM) + (q.yM - a.yM) * (b.yM - a.yM)) / len
  const xs = p.treads.flat().map(along)
  const rise = p.result.rise / 1000
  const levels = Array.from({ length: Math.max(0, p.result.risers - 1) }, (_, k) => p.bottomLevelM + (k + 1) * rise)
  return {
    id: p.stair.id,
    segmentIndex: p.stair.segmentIndex,
    fromXM: Math.min(...xs),
    toXM: Math.max(...xs),
    groundM: p.groundLevelM,
    bottomM: p.bottomLevelM,
    topM: p.stairTopLevelM,
    treadLevelsM: levels,
    fixedXM: p.fixedXM,
    label: `${p.stair.label || "Stairs"} · ${p.result.risers} × ${Math.round(p.result.rise)}`,
  }
}

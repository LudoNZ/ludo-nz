/** The house in 3D, from its walls set out on plan (housePlan.ts): every
 * wall stood up on its side of the house with its raked top and bottom,
 * the windows and doors cut through, the weatherboard courses and joins
 * drawn on its face as the take-off lays them, and the facings over the
 * corners and round the joinery.
 *
 * Each wall is cut into vertical strips at every rake break and every
 * jamb, so each piece is a convex slab the painter's sort (stairs/
 * stairRender3d.ts) can order; the courses are lines drawn on a piece's
 * face rather than solids of their own, which keeps a whole house quick
 * enough to swing round. World mm, x east, y north, z up from the
 * elevations' datum. Pure — no React. */

import { FIT_CAMERA, makeCamera, surfaceAtCentre, type CameraFrame, type CameraState, type V2, type V3 } from "../render3d/perspective"
import { makeSolid, orderSolids, worldBox, type Solid } from "../stairs/stairRender3d"
import { HouseLayout, outwardOf, P2, PlanSide } from "./housePlan"
import { Roof, ROOF_DEPTH, zAt } from "./roof"
import { Opening, Wall, WeatherboardSettings } from "./types"
import { edgePoints, WallResult } from "./weatherboardCalc"

export type HouseRenderMember = "roof" | "upper" | "inside" | "boards" | "trims" | "joinery" | "foundation" | "floor" | "subfloor" | "midfloor" | "slab" | "pods" | "steel" | "boxing" | "dpm" | "framing" | "spouting" | "deck" | "landscape"

export const HOUSE_MEMBER_LABELS: Record<HouseRenderMember, string> = {
  roof: "Roof",
  upper: "First floor",
  inside: "Inside walls",
  boards: "Board lines",
  trims: "Facings",
  joinery: "Windows & doors",
  foundation: "Foundation",
  floor: "Floor",
  subfloor: "Subfloor",
  midfloor: "Midfloor",
  slab: "Slab",
  pods: "Pods",
  steel: "Steel & mesh",
  boxing: "Boxing",
  dpm: "DPM",
  framing: "Framing",
  spouting: "Spouting",
  deck: "Decks",
  landscape: "Landscaping",
}

export const HOUSE_MEMBERS: HouseRenderMember[] = ["roof", "upper", "inside", "boards", "trims", "joinery", "foundation", "floor", "subfloor", "midfloor", "slab", "pods", "steel", "boxing", "dpm", "framing", "spouting", "deck", "landscape"]

const COLORS = {
  cladding: "#e9e4d8",
  plain: "#ddd7c9",
  /** a party wall's Integra panels, standing bare */
  party: "#b8b3aa",
  trim: "#fbfbf8",
  glass: "#5d7486",
  frame: "#3c4248",
  foundation: "#a9a6a0",
  floor: "#c9b79a",
  grass: "#9cc46e",
  line: "#000000",
}

/** wall depth behind the cladding's face: boards, cavity, studs, lining */
const WALL_T = 140
/** facings stand proud of the boards by this much */
const TRIM_PROUD = 20
/** glass sits this far back from the face */
const GLASS_BACK = 60
/** the roof's depth, sheet to soffit: what shows as the fascia */
const ROOF_T = ROOF_DEPTH
/** sheet ribs, this far apart across the fall */
const RIB_MM = 300

/** the lawn sits this far below the lowest wall bottom */
const GROUND_DROP = 200

const EPS = 0.5

export interface HouseRenderInput {
  /** party (intertenancy) walls, by id: drawn bare, as the panels */
  party?: ReadonlySet<string>
  layout: HouseLayout
  walls: Map<string, Wall>
  results: Map<string, WallResult>
  settings: WeatherboardSettings
  roof: Roof | null
  roofColour: string
  /** walls inside the house (the House calculator's): a line on plan
   * (world mm), standing on its floor (z0, default 0) */
  /** inside walls, as plain slabs; with an id they can be tapped (x along from `along`) */
  extras?: { a: P2; b: P2; height: number; thickness: number; color: string; z0?: number; upper?: boolean; id?: string; along?: number; member?: "inside" | "joinery" }[]
  /** more roofs: with a first floor, the lower ones over the ground floor */
  moreRoofs?: Roof[]
  /** a storey above: its own walls round (in `walls`), its floor (cells on
   * plan, world mm) at `floorZ` */
  upper?: { layout: HouseLayout; floorZ: number; floorCells: { x0: number; x1: number; y0: number; y1: number }[] }
  /** more solids, ready made, each under a part (the House's subfloor and midfloor framing) */
  solids?: { solid: Solid; member: HouseRenderMember; upper?: boolean; tag?: string }[]
  /** the ground's level, where it's lower than under the walls (a timber floor up on piles) */
  groundZ?: number
  /** leave the plain ground floor out (it's framed and floored in `solids`) */
  noFloor?: boolean
  /** no foundation band under the walls (a slab's in `solids`: its edge is the foundation) */
  noFoundation?: boolean
  /** the eaves' width: how far a downpipe steps back in to the wall (unset: no spouting) */
  eavesMm?: number
}

// ── wall heights ───────────────────────────────────────────────────────

type Pts = { x: number; y: number }[]
const valueAt = (pts: Pts, x: number): number => {
  if (x <= pts[0].x) return pts[0].y
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x)
  }
  return pts[pts.length - 1].y
}

interface Edges {
  top: Pts
  bottom: Pts
}
const edgesOf = (w: Wall): Edges => ({ top: edgePoints(w.top, w.lengthMm), bottom: edgePoints(w.bottom, w.lengthMm) })

const headAt = (o: Opening, x: number) => o.sill + o.height + ((o.heightRight ?? o.height) - o.height) * ((x - o.x) / (o.width || 1))

// ── a side's own frame ─────────────────────────────────────────────────

/** wall coordinates on one side → world: `x` along the wall (mm from its
 * left end), `y` height above datum, `off` out from the face (+ outside) */
interface SideFrame {
  at: (x: number, y: number, off: number) => V3
  /** how far the back of the wall shifts along at each end, per mm of
   * depth in: mitres the corners so neighbouring walls meet, not overlap */
  mitreA: number
  mitreB: number
  x0: number
  x1: number
}

const turnAt = (into: PlanSide, out: PlanSide) => {
  const d1 = { x: into.b.x - into.a.x, y: into.b.y - into.a.y }
  const d2 = { x: out.b.x - out.a.x, y: out.b.y - out.a.y }
  return Math.atan2(d1.x * d2.y - d1.y * d2.x, d1.x * d2.x + d1.y * d2.y)
}
/** how far along the back of a wall moves per mm in, at a turn: a left
 * turn (an outside corner, going anticlockwise) cuts it short, a right
 * one (an inside corner) runs it on */
const mitre = (turn: number) => Math.max(-3, Math.min(3, Math.tan(turn / 2)))

function sideFrame(s: PlanSide, prev: PlanSide | null, next: PlanSide | null): SideFrame {
  const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1
  const d: P2 = { x: (s.b.x - s.a.x) / len, y: (s.b.y - s.a.y) / len }
  const n = outwardOf(s)
  const span = s.wallId ? s.x1 - s.x0 : len
  const x0 = s.wallId ? s.x0 : 0
  return {
    at: (x, y, off) => {
      const t = ((x - x0) / span) * len
      return [s.a.x + d.x * t + n.x * off, s.a.y + d.y * t + n.y * off, y]
    },
    mitreA: prev ? mitre(turnAt(prev, s)) : 0,
    mitreB: next ? mitre(turnAt(s, next)) : 0,
    x0,
    x1: x0 + span,
  }
}

// ── solids on a side ───────────────────────────────────────────────────

export interface Piece {
  solid: Solid
  member: HouseRenderMember | "wall"
  /** lines on the solid's first face (its outside), drawn over it */
  lines?: [V3, V3][]
  lineColor?: string
  /** part of the storey above (hidden with it) */
  upper?: boolean
  /** which house of a group (a terrace) it's part of */
  group?: number
  /** a finer kind, for the showcase's stages (framing: "frame0", "frame1", "frameIn") */
  tag?: string
}

/** A convex profile in wall coords (x along, y up) made a slab from
 * `off0` to `off1` out from the face. With `mitre`, the slab's back is
 * pulled or pushed along at the side's ends to meet the next wall. */
function slab(f: SideFrame, profile: Pts, off0: number, off1: number, color: string, mitreEnds = false): Solid | null {
  const pts: Pts = []
  for (const p of profile) {
    const last = pts[pts.length - 1]
    if (!last || Math.abs(last.x - p.x) > EPS || Math.abs(last.y - p.y) > EPS) pts.push(p)
  }
  if (pts.length > 2 && Math.abs(pts[0].x - pts[pts.length - 1].x) < EPS && Math.abs(pts[0].y - pts[pts.length - 1].y) < EPS) pts.pop()
  if (pts.length < 3 || off1 - off0 < 0.1) return null
  const shift = (x: number, off: number) => {
    if (!mitreEnds || off >= 0) return x
    const depth = -off
    if (Math.abs(x - f.x0) < EPS) return x + f.mitreA * depth
    if (Math.abs(x - f.x1) < EPS) return x - f.mitreB * depth
    return x
  }
  const front = pts.map((p) => f.at(shift(p.x, off1), p.y, off1))
  const back = pts.map((p) => f.at(shift(p.x, off0), p.y, off0))
  const faces = [
    { pts: front, color },
    { pts: back, color },
  ]
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    faces.push({ pts: [front[i], front[j], back[j], back[i]], color })
  }
  return makeSolid(faces)
}

/** a band [lo, hi] of a wall between two x's, each edge straight across it */
const quad = (u: number, v: number, loU: number, loV: number, hiU: number, hiV: number): Pts => [
  { x: u, y: loU },
  { x: v, y: loV },
  { x: v, y: hiV },
  { x: u, y: hiU },
]

/** Where a level line at height `y` crosses a band between `u` and `v`
 * whose bottom and top run straight from lo/hi at u to lo/hi at v. */
function levelAcross(u: number, v: number, loU: number, loV: number, hiU: number, hiV: number, y: number): [number, number] | null {
  let a = u
  let b = v
  const clip = (fu: number, fv: number) => {
    // keep where f(x) > 0, f linear from fu at u to fv at v
    if (fu <= 0 && fv <= 0) return false
    if (fu < 0 || fv < 0) {
      const x = u + ((v - u) * fu) / (fu - fv)
      if (fu < 0) a = Math.max(a, x)
      else b = Math.min(b, x)
    }
    return true
  }
  if (!clip(y - loU, y - loV) || !clip(hiU - y, hiV - y)) return null
  return b - a > EPS ? [a, b] : null
}

function sidePieces(
  s: PlanSide,
  f: SideFrame,
  heights: { top: (x: number) => number; bottom: (x: number) => number; breaks: number[] },
  wall: Wall | null,
  result: WallResult | null,
  settings: WeatherboardSettings,
  courseLevels: number[],
  /** null: no foundation under it (a storey above) */
  groundZ: number | null,
  /** a side without a wall of boards: its colour */
  plainColor: string = COLORS.plain,
): Piece[] {
  const out: Piece[] = []
  const push = (member: Piece["member"], solid: Solid | null, lines?: [V3, V3][]) => solid && out.push({ solid, member, lines })
  const { x0, x1 } = f
  const openings = (wall?.openings ?? []).filter((o) => o.x < x1 - EPS && o.x + o.width > x0 + EPS)
  const cuts = new Set<number>([x0, x1])
  for (const b of heights.breaks) if (b > x0 + EPS && b < x1 - EPS) cuts.add(b)
  for (const o of openings) for (const x of [o.x, o.x + o.width]) if (x > x0 + EPS && x < x1 - EPS) cuts.add(x)
  const xs = [...cuts].sort((a, b) => a - b)

  const courses = result?.courses ?? []
  const lineOf = (x: number, y: number): V3 => f.at(x, y, 0.5)

  for (let i = 0; i + 1 < xs.length; i++) {
    const u = xs[i]
    const v = xs[i + 1]
    const mid = (u + v) / 2
    const bands: [number, number, number, number][] = [] // loU, loV, hiU, hiV
    const holes = openings.filter((o) => o.x <= mid && o.x + o.width >= mid).sort((a, b) => a.sill - b.sill)
    let loU = heights.bottom(u)
    let loV = heights.bottom(v)
    const topU = heights.top(u)
    const topV = heights.top(v)
    for (const o of holes) {
      bands.push([loU, loV, Math.min(topU, Math.max(loU, o.sill)), Math.min(topV, Math.max(loV, o.sill))])
      loU = Math.max(loU, headAt(o, u))
      loV = Math.max(loV, headAt(o, v))
    }
    bands.push([loU, loV, topU, topV])
    for (const [lu, lv, hu, hv] of bands) {
      if (hu - lu < 1 && hv - lv < 1) continue
      const lines: [V3, V3][] = []
      if (wall) {
        for (const c of courses) {
          if (c.index === 0) continue
          const r = levelAcross(u, v, lu, lv, hu, hv, c.bottom)
          if (r) lines.push([lineOf(r[0], c.bottom), lineOf(r[1], c.bottom)])
        }
        for (const c of courses)
          for (const j of c.joins) {
            if (j <= u + EPS || j >= v - EPS) continue
            const t = (j - u) / (v - u)
            const lo = Math.max(c.bottom, lu + (lv - lu) * t)
            const hi = Math.min(c.top, hu + (hv - hu) * t)
            if (hi - lo > 5) lines.push([lineOf(j, lo), lineOf(j, hi)])
          }
      } else {
        for (const y of courseLevels) {
          const r = levelAcross(u, v, lu, lv, hu, hv, y)
          if (r) lines.push([lineOf(r[0], y), lineOf(r[1], y)])
        }
      }
      push("wall", slab(f, quad(u, v, lu, lv, hu, hv), -WALL_T, 0, wall ? COLORS.cladding : plainColor, true), lines)
    }
    // the foundation under it, down to the lawn
    const bu = heights.bottom(u)
    const bv = heights.bottom(v)
    if (groundZ !== null && (bu - groundZ > 1 || bv - groundZ > 1)) push("foundation", slab(f, quad(u, v, groundZ, groundZ, bu, bv), -WALL_T, -10, COLORS.foundation, true))
  }

  if (!wall) return out
  const fw = settings.facingWidthMm
  const clipX = (a: number, b: number): [number, number] | null => {
    const lo = Math.max(a, x0)
    const hi = Math.min(b, x1)
    return hi - lo > 1 ? [lo, hi] : null
  }
  /** a facing from a to b along the wall, following the wall's top and bottom */
  const facingOverWall = (a: number, b: number) => {
    const r = clipX(a, b)
    if (!r) return
    push("trims", slab(f, quad(r[0], r[1], heights.bottom(r[0]), heights.bottom(r[1]), heights.top(r[0]), heights.top(r[1])), 0, TRIM_PROUD, COLORS.trim))
  }
  // corner facings at the wall's ends and at the outside corners along it
  if (wall.leftEnd === "externalFacing" || wall.leftEnd === "externalBox") facingOverWall(0, fw)
  if (wall.rightEnd === "externalFacing" || wall.rightEnd === "externalBox") facingOverWall(wall.lengthMm - fw, wall.lengthMm)
  for (const c of wall.corners ?? [])
    if (c.type === "external") {
      facingOverWall(c.x - fw, c.x)
      facingOverWall(c.x, c.x + fw)
    }

  for (const o of openings) {
    const L = o.x
    const R = o.x + o.width
    const top = Math.max(heights.top(Math.max(x0, Math.min(x1, (L + R) / 2))), o.sill)
    // facings: a jamb each side, up to the head, and the head across over them
    for (const [a, b] of [
      [L - fw, L],
      [R, R + fw],
    ] as const) {
      const r = clipX(a, b)
      if (!r) continue
      const hu = Math.min(headAt(o, r[0]) + fw, heights.top(r[0]))
      const hv = Math.min(headAt(o, r[1]) + fw, heights.top(r[1]))
      push("trims", slab(f, quad(r[0], r[1], o.sill, o.sill, hu, hv), 0, TRIM_PROUD, COLORS.trim))
    }
    const hr = clipX(L, R)
    if (hr) {
      const [a, b] = hr
      const hu = Math.min(headAt(o, a) + fw, top)
      const hv = Math.min(headAt(o, b) + fw, top)
      push("trims", slab(f, quad(a, b, headAt(o, a), headAt(o, b), hu, hv), 0, TRIM_PROUD, COLORS.trim))
      // the glass, set back in the opening, with its frame round it
      const door = o.sill <= wall.bottom.left + 50
      const fr = 45
      const glassLines: [V3, V3][] = []
      const mullion = (L + R) / 2
      if (o.width > 1400 && mullion > a && mullion < b)
        glassLines.push([f.at(mullion, o.sill, -GLASS_BACK + 0.5), f.at(mullion, headAt(o, mullion), -GLASS_BACK + 0.5)])
      push("joinery", slab(f, quad(a, b, o.sill, o.sill, headAt(o, a), headAt(o, b)), -GLASS_BACK - 10, -GLASS_BACK, COLORS.glass), glassLines)
      // the frame: a sill, a head and two jambs, just in front of the glass
      push("joinery", slab(f, quad(a, b, o.sill, o.sill, o.sill + fr, o.sill + fr), -GLASS_BACK, -GLASS_BACK + 30, COLORS.frame))
      push("joinery", slab(f, quad(a, b, headAt(o, a) - fr, headAt(o, b) - fr, headAt(o, a), headAt(o, b)), -GLASS_BACK, -GLASS_BACK + 30, COLORS.frame))
      if (L >= x0) push("joinery", slab(f, quad(L, L + fr, o.sill + fr, o.sill + fr, headAt(o, L) - fr, headAt(o, L + fr) - fr), -GLASS_BACK, -GLASS_BACK + 30, COLORS.frame))
      if (R <= x1) push("joinery", slab(f, quad(R - fr, R, o.sill + fr, o.sill + fr, headAt(o, R - fr) - fr, headAt(o, R) - fr), -GLASS_BACK, -GLASS_BACK + 30, COLORS.frame))
      // a window's sill nosing, out past the boards
      if (!door) push("joinery", slab(f, quad(a, b, o.sill - 25, o.sill - 25, o.sill, o.sill), 0, 35, COLORS.trim))
    }
  }
  return out
}

// ── the roof ───────────────────────────────────────────────────────────

/** a roof plane's piece: sitting on its plane, ROOF_T deep, square-edged
 * (its sides are the fascia and barge) — the top face first */
function roofSlab(poly: P2[], z: (p: P2) => number, color: string): Solid | null {
  if (poly.length < 3) return null
  const bottom = poly.map((p): V3 => [p.x, p.y, z(p)])
  const top = poly.map((p): V3 => [p.x, p.y, z(p) + ROOF_T])
  const faces = [
    { pts: top, color },
    { pts: bottom, color },
    ...poly.map((_, i) => {
      const j = (i + 1) % poly.length
      return { pts: [bottom[i], bottom[j], top[j], top[i]], color }
    }),
  ]
  return makeSolid(faces)
}

/** the sheet's ribs: lines running down the fall, RIB_MM apart (on a grid
 * fixed to the plane, so they line up across pieces of it) */
function ribs(poly: P2[], plane: { a: number; b: number; c: number }): [V3, V3][] {
  const g = Math.hypot(plane.a, plane.b)
  if (g < 1e-6) return []
  const fall: P2 = { x: -plane.a / g, y: -plane.b / g }
  const across: P2 = { x: -fall.y, y: fall.x }
  const proj = poly.map((p) => p.x * across.x + p.y * across.y)
  const lo = Math.ceil(Math.min(...proj) / RIB_MM + 0.15)
  const hi = Math.floor(Math.max(...proj) / RIB_MM - 0.15)
  const out: [V3, V3][] = []
  const lift = (p: P2): V3 => [p.x, p.y, plane.a * p.x + plane.b * p.y + plane.c + ROOF_T + 0.5]
  for (let k = lo; k <= hi; k++) {
    // the line {across·p = k·RIB_MM}, cut to the (convex) piece
    const o: P2 = { x: across.x * k * RIB_MM, y: across.y * k * RIB_MM }
    let t0 = -Infinity
    let t1 = Infinity
    for (let i = 0; i < poly.length && t0 < t1; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      // inside: left of p → q (the pieces wind anticlockwise, or the other way)
      const nx = -(q.y - p.y)
      const ny = q.x - p.x
      const sgn = areaSign(poly)
      const f0 = sgn * (nx * (o.x - p.x) + ny * (o.y - p.y))
      const fd = sgn * (nx * fall.x + ny * fall.y)
      if (Math.abs(fd) < 1e-9) {
        if (f0 < 0) t1 = -Infinity
        continue
      }
      const tt = -f0 / fd
      if (fd > 0) t0 = Math.max(t0, tt)
      else t1 = Math.min(t1, tt)
    }
    if (t1 - t0 > 50) out.push([lift({ x: o.x + fall.x * t0, y: o.y + fall.y * t0 }), lift({ x: o.x + fall.x * t1, y: o.y + fall.y * t1 })])
  }
  return out
}

const areaSign = (poly: P2[]) => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return s >= 0 ? 1 : -1
}

// ── the scene ──────────────────────────────────────────────────────────

export interface HouseRenderOptions {
  azimuthDeg: number
  elevationDeg: number
  hidden: ReadonlySet<HouseRenderMember>
  camera?: CameraState
  /** fit the view (and the lawn) to these, not to what's shown (the showcase: framed on the finished house while it goes up) */
  fitTo?: V3[]
}

export interface HouseScene {
  /** polygons and line sets, back to front */
  items: ({ kind: "poly"; points: string; fill: string; stroke: string } | { kind: "lines"; d: string; stroke: string })[]
  viewBox: { x: number; y: number; w: number; h: number }
  strokeW: number
  frame: CameraFrame
  /** the wall under a point of the view (its id, x along it from its left end, z up), nearest first */
  pick: (at: V2) => { wallId: string; x: number; z: number } | null
}

const hexToRgb = (hex: string): V3 => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const rgbToHex = (c: V3) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** every piece of the house, as solids, with which side the camera
 * squares up to (the first wall's outside) */
export interface HouseModel {
  pieces: Piece[]
  /** each wall's face, to find what's under the pointer: along its plan side from `a` (at its x0) in `d`, x0 to x1 of the wall, z from lo to hi */
  faces: { wallId: string; a: P2; d: P2; x0: number; x1: number; lo: number; hi: number; upper: boolean }[]
  front: P2 | null
  groundZ: number
  floor: V3[] | null
}

const SPOUTING = "#e9e6df"

/** The spouting: a quad gutter along every eaves edge (a roof face's level,
 * lowest edge, on the outside of the roof), and a downpipe at its end —
 * stepped back to the wall, down to the ground, or to a lower roof under
 * it (onto a spreader). */
function spouting(roofs: Roof[], eaves: number, groundZ: number): Piece[] {
  const out: Piece[] = []
  const faces = roofs.flatMap((r) => r.faces)
  const roofUnder = (p: P2, below: number) => {
    let best: number | null = null
    for (const f of faces) {
      const z = zAt(f.plane, p) + ROOF_T
      if (z < below - 50 && inPoly(f.poly, p) && (best === null || z > best)) best = z
    }
    return best
  }
  const box = (a: P2, b: P2, n: P2, o0: number, o1: number, z0: number, z1: number) => {
    const at = (p: P2, o: number, z: number): V3 => [p.x + n.x * o, p.y + n.y * o, z]
    const base = [at(a, o0, z0), at(b, o0, z0), at(b, o1, z0), at(a, o1, z0)]
    const top = base.map(([x, y]): V3 => [x, y, z1])
    return makeSolid([{ pts: top, color: SPOUTING }, { pts: base, color: SPOUTING }, ...base.map((_, k) => ({ pts: [base[k], base[(k + 1) % 4], top[(k + 1) % 4], top[k]], color: SPOUTING }))])
  }
  for (const f of faces) {
    const zs = f.poly.map((p) => zAt(f.plane, p))
    const low = Math.min(...zs)
    const mid = { x: f.poly.reduce((t, p) => t + p.x, 0) / f.poly.length, y: f.poly.reduce((t, p) => t + p.y, 0) / f.poly.length }
    f.poly.forEach((a, i) => {
      const b = f.poly[(i + 1) % f.poly.length]
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L < 400 || Math.abs(zs[i] - low) > 5 || Math.abs(zs[(i + 1) % zs.length] - low) > 5) return
      // (outward: away from the face's middle)
      let n = { x: (b.y - a.y) / L, y: -(b.x - a.x) / L }
      if ((mid.x - a.x) * n.x + (mid.y - a.y) * n.y > 0) n = { x: -n.x, y: -n.y }
      // (not an edge another face of the roofs carries on past: a lower roof's against a wall)
      const probe = { x: (a.x + b.x) / 2 + n.x * 60, y: (a.y + b.y) / 2 + n.y * 60 }
      if (faces.some((g) => g !== f && inPoly(g.poly, probe) && Math.abs(zAt(g.plane, probe) - low) < 400)) return
      const zTop = low + ROOF_T - 30
      const g = box(a, b, n, 0, 125, zTop - 115, zTop)
      if (g) out.push({ solid: g, member: "spouting" })
      // a downpipe at an end of it (both, on a long run), stepped back under the eaves to the wall
      const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      for (const end of L > 9000 ? [a, b] : [b]) {
        const s = end === a ? 1 : -1
        const p0 = { x: end.x + d.x * s * 250, y: end.y + d.y * s * 250 }
        const wall = { x: p0.x - n.x * (eaves - 40), y: p0.y - n.y * (eaves - 40) }
        const neck = zTop - 300
        out.push({ solid: box({ x: p0.x - d.x * 40, y: p0.y - d.y * 40 }, { x: p0.x + d.x * 40, y: p0.y + d.y * 40 }, n, 20, 100, neck, zTop - 110), member: "spouting" })
        out.push({ solid: box({ x: p0.x - d.x * 40, y: p0.y - d.y * 40 }, { x: p0.x + d.x * 40, y: p0.y + d.y * 40 }, n, -(eaves - 40), 100, neck - 80, neck), member: "spouting" })
        const foot = roofUnder(wall, neck) ?? groundZ
        out.push({ solid: box({ x: wall.x - d.x * 40, y: wall.y - d.y * 40 }, { x: wall.x + d.x * 40, y: wall.y + d.y * 40 }, n, 0, 80, foot, neck - 80), member: "spouting" })
      }
    })
  }
  return out
}

/** a point in a convex polygon */
const inPoly = (poly: P2[], p: P2) => {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(c) < 1e-6) continue
    if (sign && Math.sign(c) !== sign) return false
    sign = Math.sign(c)
  }
  return true
}

export function housePieces(input: HouseRenderInput, hidden: ReadonlySet<HouseRenderMember>): HouseModel {
  const { layout, walls, results, settings } = input
  const sides = layout.sides
  const edges = new Map<string, Edges>()
  const edgeOf = (id: string) => {
    let e = edges.get(id)
    if (!e) {
      e = edgesOf(walls.get(id)!)
      edges.set(id, e)
    }
    return e
  }
  const placed = sides.filter((s) => s.wallId && walls.has(s.wallId))
  if (!placed.length) return { pieces: [], faces: [], front: null, groundZ: 0, floor: null }
  const faces: HouseModel["faces"] = []
  const groundZ = Math.min(input.groundZ ?? Infinity, Math.min(...placed.map((s) => Math.min(...edgeOf(s.wallId!).bottom.map((p) => p.y)))) - GROUND_DROP)

  const pieces: Piece[] = []
  /** a storey's walls round, from its layout */
  const storey = (layout: HouseLayout, upper: boolean) => {
    const sides = layout.sides
    const n = sides.length
    for (const s of sides) {
      if (!s.wallId || !walls.has(s.wallId) || input.party?.has(s.wallId)) continue
      const e = edgeOf(s.wallId)
      const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1
      faces.push({ wallId: s.wallId, a: s.a, d: { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L }, x0: s.x0, x1: s.x1, lo: Math.min(...e.bottom.map((p) => p.y)), hi: Math.max(...e.top.map((p) => p.y)), upper })
    }
    const near = (i: number, dir: 1 | -1): { wallId: string; x: number } | null => {
      for (let k = 1; k < n; k++) {
        const j = i + dir * k
        if (!layout.closed && (j < 0 || j >= n)) return null
        const s = sides[(j + n) % n]
        if (s.wallId && walls.has(s.wallId)) return { wallId: s.wallId, x: dir < 0 ? s.x1 : s.x0 }
      }
      return null
    }
    const found = upper || input.noFoundation ? null : groundZ
    const add = (ps: Piece[]) => pieces.push(...(upper ? ps.map((p) => ({ ...p, upper: true })) : ps))
    sides.forEach((s, i) => {
      const prev = layout.closed || i > 0 ? sides[(i - 1 + n) % n] : null
      const next = layout.closed || i < n - 1 ? sides[(i + 1) % n] : null
      const f = sideFrame(s, prev, next)
      const wall = s.wallId ? (walls.get(s.wallId) ?? null) : null
      if (wall && input.party?.has(wall.id)) {
        // a party wall: bare panels to its own height, no boards, trims or joinery
        const e = edgeOf(wall.id)
        add(sidePieces(s, f, { top: (x) => valueAt(e.top, x), bottom: (x) => valueAt(e.bottom, x), breaks: [...e.top, ...e.bottom].map((p) => p.x) }, null, null, settings, [], found, COLORS.party))
        return
      }
      if (wall) {
        const e = edgeOf(wall.id)
        const breaks = [...e.top, ...e.bottom].map((p) => p.x)
        add(sidePieces(s, f, { top: (x) => valueAt(e.top, x), bottom: (x) => valueAt(e.bottom, x), breaks }, wall, results.get(wall.id) ?? null, settings, [], found))
        return
      }
      // a plain side: its top and bottom run from the wall before to the wall after
      const a = near(i, -1)
      const b = near(i, 1) ?? a
      const from = a ?? b
      if (!from || !b) return
      const ea = edgeOf(from.wallId)
      const eb = edgeOf(b.wallId)
      const t0 = valueAt(ea.top, from.x)
      const t1 = valueAt(eb.top, b.x)
      const b0 = valueAt(ea.bottom, from.x)
      const b1 = valueAt(eb.bottom, b.x)
      const span = f.x1 - f.x0 || 1
      const lerp = (p: number, q: number) => (x: number) => p + ((q - p) * (x - f.x0)) / span
      const levels = (results.get(from.wallId)?.courses ?? []).filter((c) => c.index > 0).map((c) => c.bottom)
      add(sidePieces(s, f, { top: lerp(t0, t1), bottom: lerp(b0, b1), breaks: [] }, null, null, settings, levels, found))
    })
  }
  storey(layout, false)
  if (input.upper) {
    storey(input.upper.layout, true)
    // its floor, a slab on the walls below
    const z = input.upper.floorZ
    for (const c of input.upper.floorCells) {
      const solid = worldBox(c.x0, c.x1, c.y0, c.y1, z - 150, z, COLORS.floor)
      if (solid) pieces.push({ solid, member: "floor", upper: true })
    }
  }

  for (const x of input.extras ?? []) {
    const len = Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y)
    // (a door's leaf goes with its wall)
    if (len < 10 || (x.member === "joinery" && hidden.has("inside"))) continue
    const n = { x: (-(x.b.y - x.a.y) / len) * (x.thickness / 2), y: ((x.b.x - x.a.x) / len) * (x.thickness / 2) }
    const at = (p: P2, side: 1 | -1, z: number): V3 => [p.x + n.x * side, p.y + n.y * side, z]
    const z0 = x.z0 ?? 0
    // (only once they can be seen: under a roof, a tap is on the roof)
    if (x.id && !hidden.has(x.member ?? "inside") && hidden.has("roof"))
      faces.push({ wallId: x.id, a: x.a, d: { x: (x.b.x - x.a.x) / len, y: (x.b.y - x.a.y) / len }, x0: x.along ?? 0, x1: (x.along ?? 0) + len, lo: z0, hi: z0 + x.height, upper: !!x.upper })
    const base = [at(x.a, 1, z0), at(x.b, 1, z0), at(x.b, -1, z0), at(x.a, -1, z0)]
    const top = [at(x.a, 1, z0 + x.height), at(x.b, 1, z0 + x.height), at(x.b, -1, z0 + x.height), at(x.a, -1, z0 + x.height)]
    pieces.push({
      member: x.member ?? "inside",
      upper: x.upper,
      // (an inside wall's, door leaves too)
      tag: "in",
      solid: makeSolid([
        { pts: top, color: x.color },
        { pts: base, color: x.color },
        ...base.map((_, k) => ({ pts: [base[k], base[(k + 1) % 4], top[(k + 1) % 4], top[k]], color: x.color })),
      ]),
    })
  }

  for (const roof of [input.roof, ...(input.moreRoofs ?? [])]) {
    if (!roof) continue
    // ribs a shade darker on a light roof, lighter on a dark one
    const [r, g, b] = hexToRgb(input.roofColour)
    const ribColor = 0.299 * r + 0.587 * g + 0.114 * b > 120 ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.16)"
    for (const face of roof.faces) {
      const solid = roofSlab(face.poly, (p) => zAt(face.plane, p), input.roofColour)
      if (solid) pieces.push({ solid, member: "roof", lines: ribs(face.poly, face.plane), lineColor: ribColor })
    }
    for (const inf of roof.infills) {
      const back = inf.pts.map(([x, y, z]): V3 => [x + inf.inward.x * 10, y + inf.inward.y * 10, z])
      const faces = [
        { pts: inf.pts, color: COLORS.cladding },
        { pts: back, color: COLORS.cladding },
        ...inf.pts.map((p, k) => ({ pts: [p, inf.pts[(k + 1) % inf.pts.length], back[(k + 1) % back.length], back[k]], color: COLORS.cladding })),
      ]
      // weatherboard courses across it, so it reads as the gable's cladding
      const zs = inf.pts.map((p) => p[2])
      const lines: [V3, V3][] = []
      for (let z = Math.min(...zs) + 150; z < Math.max(...zs) - 20; z += 150) {
        const cuts: V3[] = []
        inf.pts.forEach((p, k) => {
          const q = inf.pts[(k + 1) % inf.pts.length]
          if ((p[2] - z) * (q[2] - z) < 0) {
            const f = (z - p[2]) / (q[2] - p[2])
            cuts.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z])
          }
        })
        if (cuts.length === 2) lines.push([cuts[0], cuts[1]].map(([x, y, zz]): V3 => [x - inf.inward.x * 0.5, y - inf.inward.y * 0.5, zz]) as [V3, V3])
      }
      pieces.push({ solid: makeSolid(faces), member: "roof", lines })
    }
  }

  if (input.eavesMm !== undefined && !hidden.has("spouting")) pieces.push(...spouting([input.roof, ...(input.moreRoofs ?? [])].filter((r): r is Roof => !!r), input.eavesMm, groundZ))
  const kept = pieces.filter((p) => (p.member === "wall" || !hidden.has(p.member)) && !(p.upper && hidden.has("upper")))
  if (hidden.has("boards")) kept.forEach((p) => p.member === "wall" && (p.lines = undefined))
  const s0 = placed[0]
  // (the floor framing, ready made)
  for (const x of input.solids ?? []) if (!hidden.has(x.member) && !(x.upper && hidden.has("upper"))) kept.push({ solid: x.solid, member: x.member, ...(x.upper ? { upper: true } : {}), ...(x.tag ? { tag: x.tag } : {}) })
  const floor = layout.closed && !hidden.has("floor") && !input.noFloor ? sides.map((s): V3 => [s.a.x, s.a.y, 0]) : null
  // (a hidden storey's walls can't be tapped)
  return { pieces: kept, faces: faces.filter((f) => !(f.upper && hidden.has("upper"))), front: outwardOf(s0), groundZ, floor }
}

/** a house of a terrace (or any group): its 3D input, and where it stands — world mm, x east, y north, z up */
export interface PlacedHouse {
  input: HouseRenderInput
  at: V3
}

const movedPiece = (p: Piece, [dx, dy, dz]: V3): Piece => ({
  ...p,
  solid: { ...p.solid, faces: p.solid.faces.map((f) => ({ ...f, pts: f.pts.map(([x, y, z]): V3 => [x + dx, y + dy, z + dz]) })) },
  ...(p.lines ? { lines: p.lines.map(([a, b]): [V3, V3] => [[a[0] + dx, a[1] + dy, a[2] + dz], [b[0] + dx, b[1] + dy, b[2] + dz]]) } : {}),
})

/** Several houses as one model — a terrace of townhouses, each its own
 * house project, stood side by side (and up or down to its own floor
 * level): every piece moved to where its house stands. The camera squares
 * up to the first house's front; the lawn runs under them all. */
export function groupPieces(units: PlacedHouse[], hidden: ReadonlySet<HouseRenderMember>, site: Piece[] = []): HouseModel {
  const models = units.map((u) => ({ u, m: housePieces(u.input, hidden) }))
  // (the lawn's at the houses' ground on average: one up a step, another down, both near enough)
  const groundZ = models.length ? models.reduce((t, { u, m }) => t + m.groundZ + u.at[2], 0) / models.length : 0
  const pieces = [
    ...models.flatMap(({ u, m }, group) => m.pieces.map((p) => ({ ...movedPiece(p, u.at), group }))),
    // the site round them (decks, paving, planting, fences…), from the lawn up
    ...site.filter((p) => !hidden.has(p.member as HouseRenderMember)).map((p) => movedPiece(p, [0, 0, groundZ])),
  ]
  const first = models.find(({ m }) => m.front)
  return {
    pieces,
    // (picking a wall's for one house at a time)
    faces: [],
    front: first?.m.front ?? null,
    groundZ,
    // (each house's floor's its own polygon: left out — the lawn shows through only with the roof off)
    floor: null,
  }
}

/** square-on is looking at the first wall's outside (the model is built
 * once by housePieces; this is what turning the camera redoes) */
export function buildHouseScene(model: HouseModel, options: Omit<HouseRenderOptions, "hidden">): HouseScene | null {
  const { pieces, faces, front, groundZ, floor } = model
  if (!pieces.length || !front) return null
  const solids = pieces.map((p) => p.solid)
  const az = Math.atan2(front.y, front.x) + (options.azimuthDeg * Math.PI) / 180
  const el = (options.elevationDeg * Math.PI) / 180
  const allPts = options.fitTo ?? solids.flatMap((sd) => sd.faces.flatMap((f) => f.pts))
  const cam = makeCamera(allPts, az, el, options.camera ?? FIT_CAMERA)
  const lightAz = az + (35 * Math.PI) / 180
  const lightEl = (50 * Math.PI) / 180
  const light: V3 = [Math.cos(lightEl) * Math.cos(lightAz), Math.cos(lightEl) * Math.sin(lightAz), Math.sin(lightEl)]

  const inView = pieces.filter((p) => p.solid.faces.some((f) => f.pts.some((q) => cam.ahead(q) > 0)))
  const order = orderSolids(
    inView.map((p) => p.solid),
    cam.toCam,
    cam.project,
    EPS,
    cam.eye,
  )

  const items: HouseScene["items"] = []
  const drawn: { pts: V3[]; normal: V3 }[] = []
  const fmt = ([x, y]: V2) => `${x.toFixed(1)},${y.toFixed(1)}`
  const emit = (pts: V3[], color: string, normal: V3, seamless = false) => {
    const cut = cam.clip(pts)
    if (cut.length < 3) return
    drawn.push({ pts: cut, normal })
    const shade = 0.55 + 0.55 * Math.max(0, dot(normal, light))
    const rgb = hexToRgb(color)
    const fill = rgbToHex(rgb.map((c) => c * shade) as V3)
    items.push({ kind: "poly", points: cut.map(cam.project).map(fmt).join(" "), fill, stroke: seamless ? fill : rgbToHex(rgb.map((c) => c * shade * 0.7) as V3) })
  }

  // the lawn, round everything, and the floor inside
  const gx0 = Math.min(...allPts.map((p) => p[0])) - 2000
  const gx1 = Math.max(...allPts.map((p) => p[0])) + 2000
  const gy0 = Math.min(...allPts.map((p) => p[1])) - 2000
  const gy1 = Math.max(...allPts.map((p) => p[1])) + 2000
  if (cam.eye[2] > groundZ) {
    emit(
      [
        [gx0, gy0, groundZ],
        [gx1, gy0, groundZ],
        [gx1, gy1, groundZ],
        [gx0, gy1, groundZ],
      ],
      COLORS.grass,
      [0, 0, 1],
      true,
    )
    if (floor && cam.eye[2] > 0) emit(floor, COLORS.floor, [0, 0, 1], true)
  }

  for (const k of order) {
    const p = inView[k]
    p.solid.faces.forEach((f, fi) => {
      if (!cam.sees(f.normal, f.pts[0])) return
      // walls (and their foundations) are cut into strips: no outline on their faces, so the cuts don't show
      // and a roof plane can be cut into pieces where other roofs cross it
      emit(f.pts, f.color, f.normal, ((p.member === "wall" || p.member === "foundation") && fi < 2) || (p.member === "roof" && fi === 0 && !!p.lines) || (p.member === "slab" && fi < 2))
      if (fi === 0 && p.lines?.length) {
        const d = p.lines
          .filter(([a, b]) => cam.ahead(a) > 0 && cam.ahead(b) > 0)
          .map(([a, b]) => `M${fmt(cam.project(a))}L${fmt(cam.project(b))}`)
          .join("")
        if (d) items.push({ kind: "lines", d, stroke: p.lineColor ?? "rgba(70,60,45,0.45)" })
      }
    })
  }

  // never taller than wide (a long thin house end-on would fill the page)
  const vb = cam.viewBox
  const minW = vb.h * 1.5
  const viewBox = vb.w >= minW ? vb : { ...vb, x: vb.x - (minW - vb.w) / 2, w: minW }
  return {
    items,
    viewBox,
    strokeW: cam.span * 0.0009,
    frame: { ...cam.frame, pivot: options.camera && options.camera !== FIT_CAMERA ? surfaceAtCentre(cam, drawn) : null },
    pick: (at) => {
      // each wall's face is a plane: find (x, z) on it that lands on the point (Newton's method), and keep the nearest
      let best: { wallId: string; x: number; z: number; dist: number } | null = null
      const tol = cam.span * 1e-4
      for (const f of faces) {
        const P = (x: number, z: number): V3 => [f.a.x + f.d.x * (x - f.x0), f.a.y + f.d.y * (x - f.x0), z]
        let x = (f.x0 + f.x1) / 2
        let z = (f.lo + f.hi) / 2
        let ok = false
        for (let k = 0; k < 30; k++) {
          if (cam.ahead(P(x, z)) <= 0) break
          const [u, v] = cam.project(P(x, z))
          const ex = u - at[0]
          const ey = v - at[1]
          if (Math.hypot(ex, ey) < tol) {
            ok = true
            break
          }
          const h = 10
          const [ux, vx] = cam.project(P(x + h, z))
          const [uz, vz] = cam.project(P(x, z + h))
          const a = (ux - u) / h
          const b = (uz - u) / h
          const c = (vx - v) / h
          const d = (vz - v) / h
          const det = a * d - b * c
          if (Math.abs(det) < 1e-12) break
          x -= (d * ex - b * ey) / det
          z -= (-c * ex + a * ey) / det
        }
        if (!ok || x < f.x0 - 1 || x > f.x1 + 1 || z < f.lo - 1 || z > f.hi + 1) continue
        const dist = cam.ahead(P(x, z))
        if (!best || dist < best.dist) best = { wallId: f.wallId, x, z, dist }
      }
      return best && { wallId: best.wallId, x: best.x, z: best.z }
    },
  }
}

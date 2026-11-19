/** A shaded 3D model of a retaining wall, for a presentation view: the
 * plan gives each post and board its place on the ground, the profile
 * gives every level, and this builds the solids (posts, board courses,
 * top board, cap), the ground in front and the retained earth behind,
 * then projects them axonometrically and sorts them back to front.
 *
 * Pure geometry, no React — wallRenderView.tsx draws the result as SVG.
 *
 * World axes: x east (= plan x), y north (= -plan y, since the plan's y
 * points down the screen), z up (= level). */

import { bayCourseLayout, BoardHighlight, ProfilePost, WallProfile } from "./postProfile"
import { CalcSettings } from "./calcSettings"
import { OBSTRUCTION_TYPES } from "./obstructions"
import { PlanPoint, RetainedSide, sideNormal } from "./wallPlan"
import { orderSolids } from "../stairs/stairRender3d"

type V3 = [number, number, number]

/** Something from another calculator to draw with the wall (a stair, say):
 * convex solids in the wall's world (metres; x east, y = −plan y, z =
 * level), drawn in front of the wall, in the order they're seen in. */
export interface RenderExtra {
  solids: { pts: V3[]; color: string }[][]
}

export interface RenderOptions {
  /** degrees, how far the camera swings round from square-on to the
   * wall's face (positive = round to the right) */
  azimuthDeg: number
  /** degrees above horizontal */
  elevationDeg: number
  /** posts and concrete below ground, drawn see-through */
  showFootings: boolean
  /** a post to pick out in blue (its footing too) — the pile in focus in
   * the concrete QA speed run */
  focusPostIndex?: number | null
}

export interface RenderPolygon {
  /** "x,y x,y …" in view space */
  points: string
  fill: string
  stroke: string
  opacity?: number
  /** the post this face belongs to (post or footing), for tapping */
  post?: number
  /** part of an obstruction's clearance shell: shown on screen, left off
   * printouts so only the thing itself is drawn */
  clearance?: boolean
}

export interface RenderScene {
  polygons: RenderPolygon[]
  viewBox: { x: number; y: number; w: number; h: number }
  /** a stroke width that reads at this scale */
  strokeW: number
  /** where the focused post's top lands in view space, for a marker */
  focus?: { x: number; y: number }
}

/** ~ a 150 × 50 board */
const BOARD_THICKNESS_M = 0.05
const CAP_THICKNESS_M = 0.045
const CAP_OVERHANG_M = 0.025
/** how far the ground runs out in front, and the earth back behind */
const GROUND_FRONT_M = 1.1
const EARTH_BACK_M = 1.0

const COLORS = {
  board: "#c9924f",
  topBoard: "#b07a3e",
  /** boards picked out from the order card — same blue as the elevation's */
  highlight: "#2a78d6",
  /** the focused post's concrete, a lighter blue so the post shows inside it */
  focusConcrete: "#86b6ef",
  cap: "#ddb06f",
  /** the dark seam where two top cap pieces butt together */
  capJoint: "#5a3a1c",
  post: "#93613a",
  grass: "#9cc46e",
  earthTop: "#5e7f3c",
  soil: "#8a6a4c",
  concrete: "#b9bcc0",
  blocked: "#d9534f",
}

// ── small vector helpers ───────────────────────────────────────────────
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const centroid = (pts: V3[]): V3 => scale(pts.reduce(add, [0, 0, 0] as V3), 1 / pts.length)

/** Newell's method — robust for any planar polygon */
const faceNormal = (pts: V3[]): V3 => {
  let n: V3 = [0, 0, 0]
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
  }
  return norm(n)
}

const hexToRgb = (hex: string): V3 => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
const rgbToHex = (c: V3) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")

// ── solids ─────────────────────────────────────────────────────────────
interface Face {
  pts: V3[]
  color: string
}

type V2 = [number, number]
/** convex hull of some points, anticlockwise */
const hull2 = (pts: V2[]): V2[] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (p.length < 3) return p
  const turn = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: V2[]) => {
    const h: V2[] = []
    list.forEach((q) => {
      while (h.length >= 2 && turn(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop()
      h.push(q)
    })
    h.pop()
    return h
  }
  return [...half(p), ...half([...p].reverse())]
}
/** two convex outlines overlap by more than tol (separating-axis test) */
const hullsOverlap = (a: V2[], b: V2[], tol: number) => {
  if (a.length < 3 || b.length < 3) return false
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const len = Math.hypot(q[0] - p[0], q[1] - p[1])
      if (len < 1e-12) continue
      const ax: V2 = [(p[1] - q[1]) / len, (q[0] - p[0]) / len]
      const proj = (poly2: V2[]) => poly2.map((r) => r[0] * ax[0] + r[1] * ax[1])
      const pa = proj(a)
      const pb = proj(b)
      if (Math.max(...pa) - tol <= Math.min(...pb) || Math.max(...pb) - tol <= Math.min(...pa)) return false
    }
  return true
}

/** One thing drawn as a unit: a convex solid (its faces facing away
 * from the camera are dropped, so what's left never overlaps itself) or
 * a single double-sided sheet (ground, earth). */
interface Item {
  faces: Face[]
  /** true = convex closed solid, so cull its back faces */
  solid: boolean
  /** what it's sorted on, back to front, within its layer */
  key: number
  layer: number
  opacity?: number
  /** the post it belongs to, passed through to its polygons */
  post?: number
  /** an obstruction's clearance shell, passed through to its polygons */
  clearance?: boolean
}

/** a convex solid: point each face's winding outward from the middle */
const orientOutward = (faces: Face[]): Face[] => {
  const mid = centroid(faces.flatMap((f) => f.pts))
  return faces.map((f) => (dot(faceNormal(f.pts), sub(centroid(f.pts), mid)) < 0 ? { ...f, pts: [...f.pts].reverse() } : f))
}

/** A run's local frame at a post: `u` along the run, `n` across it
 * toward the retained ground, z up. */
interface RunFrame {
  origin: V3
  dir: V3
  normal: V3
}

/** Extrudes a convex profile drawn in a run's (u, z) plane across the
 * run from n0 to n1 — a board, a post, a cap. */
const extrude = (frame: RunFrame, profile: [number, number][], n0: number, n1: number, color: string): Face[] => {
  const at = (u: number, z: number, n: number): V3 => {
    const p = add(add(frame.origin, scale(frame.dir, u)), scale(frame.normal, n))
    return [p[0], p[1], z]
  }
  const front = profile.map(([u, z]) => at(u, z, n0))
  const back = profile.map(([u, z]) => at(u, z, n1))
  const faces: Face[] = [
    { pts: front, color },
    { pts: back, color },
  ]
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length
    faces.push({ pts: [front[i], front[j], back[j], back[i]], color })
  }
  return orientOutward(faces)
}

/** a vertical prism on a footprint (world xy) — a round post */
const prism = (footprint: [number, number][], z0: number, z1: number, color: string): Face[] => {
  const bottom = footprint.map(([x, y]): V3 => [x, y, z0])
  const top = footprint.map(([x, y]): V3 => [x, y, z1])
  const faces: Face[] = [
    { pts: bottom, color },
    { pts: top, color },
  ]
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length
    faces.push({ pts: [bottom[i], bottom[j], top[j], top[i]], color })
  }
  return orientOutward(faces)
}

/** Cuts a convex (u, z) polygon down to the part at or under the line
 * z = z0 + slope·(u − u0). */
const clipUnder = (poly: [number, number][], u0: number, z0: number, slope: number): [number, number][] => {
  const f = ([u, z]: [number, number]) => z0 + slope * (u - u0) - z
  const out: [number, number][] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const fa = f(a)
    const fb = f(b)
    if (fa >= 0) out.push(a)
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** a one-sided cut face, wound to face `outward` so it's culled from behind */
const facing = (pts: V3[], outward: V3, color: string): Face => ({ pts: dot(faceNormal(pts), outward) < 0 ? [...pts].reverse() : pts, color })

const isRound = (p: ProfilePost) => /round/i.test(p.sizeLabel)

// ── the scene ──────────────────────────────────────────────────────────

/** Builds and projects the whole wall. Returns null if there's nothing
 * to draw. */
export function buildRenderScene(
  profile: WallProfile,
  planPoints: PlanPoint[],
  retainedSide: RetainedSide,
  settings: CalcSettings,
  topCapEnabled: boolean,
  options: RenderOptions,
  /** boards to pick out (those cut from a length chosen in the board
   * order), matched to courses and bays the same way the elevation does */
  highlight: BoardHighlight[] = [],
  extras: RenderExtra[] = []
): RenderScene | null {
  const { posts, bays, segments } = profile
  if (posts.length < 2 || planPoints.length < 2) return null

  const toWorld = (p: PlanPoint): V3 => [p.xM, -p.yM, 0]
  // each run's direction and its normal toward the retained ground, in world space
  const runs = segments.map((seg) => {
    const a = planPoints[seg.index]
    const b = planPoints[seg.index + 1]
    const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
    const dir: V3 = [(b.xM - a.xM) / len, -(b.yM - a.yM) / len, 0]
    const n = sideNormal(a, b, retainedSide)
    return { seg, start: toWorld(a), dir, normal: [n.xM, -n.yM, 0] as V3 }
  })
  const runOfBay = (leftIndex: number) => runs.find((r) => leftIndex >= r.seg.startPostIndex && leftIndex < r.seg.endPostIndex) ?? runs[runs.length - 1]
  const runOfPost = (i: number) => runOfBay(Math.min(i, posts.length - 2))
  /** the frame at a post, set in the given run */
  const frameAt = (postIndex: number, run = runOfPost(postIndex)): RunFrame => ({
    origin: add(run.start, scale(run.dir, posts[postIndex].xM - run.seg.startXM)),
    dir: run.dir,
    normal: run.normal,
  })
  const ch = settings.boardCourseHeightM
  const t = BOARD_THICKNESS_M
  // posts are centred on the wall line; the boards go on their retained
  // side, so the ground pushes them onto the posts
  const postHalf = (p: ProfilePost) => p.widthM / 2
  const boardFront = (p: ProfilePost) => postHalf(p)
  const maxHalf = Math.max(...posts.map(postHalf))
  const earthFrontN = maxHalf + t

  const lowestGround = Math.min(...posts.map((p) => p.groundLevelM))
  // obstructions always show, seen through the ground like the footings
  const shownObstructions = profile.obstructions.filter((z) => z.onWall && runs[z.obstruction.segmentIndex])
  const deepest = Math.min(...posts.map((p) => p.groundLevelM - p.embedmentM))
  const obstructionBottom = Math.min(...shownObstructions.map((z) => z.groundLevelM - z.zoneBottomDepthM))
  const slabBottom = Math.min(options.showFootings ? deepest - 0.15 : lowestGround - 0.3, obstructionBottom - 0.1)

  const items: Item[] = []
  /** drawn in this order: the low ground; any wall seen from behind
   * (the high ground in front of it hides most of it); the high ground;
   * the cut sides of the block; footings, see-through; the walls */
  const LAYER = { low: 0, backWall: 1, high: 2, skirt: 3, footing: 4, wall: 5, extra: 7 }

  /** where each bay's top is, at each of its two ends */
  const bayTops = bays.map((bay) => {
    const a = posts[bay.leftIndex]
    const b = posts[bay.rightIndex]
    return bay.stepTopM !== null ? [bay.stepTopM, bay.stepTopM] : [a.topAfterM, b.topBeforeM]
  })

  /** how far the wall's ends reach past the end posts' centres */
  const endReach = (i: number) => (i === 0 || i === posts.length - 1 ? postHalf(posts[i]) : 0)

  // ── camera ───────────────────────────────────────────────────────────
  // square-on is looking at the wall's face from the low side: the
  // length-weighted average of the runs' outward normals
  let face: V3 = [0, 0, 0]
  runs.forEach((r) => (face = add(face, scale(r.normal, -r.seg.lengthM))))
  if (Math.hypot(face[0], face[1]) < 1e-6) face = scale(runs[0].normal, -1)
  face = norm(face)
  const baseAz = Math.atan2(face[1], face[0])
  const az = baseAz + (options.azimuthDeg * Math.PI) / 180
  const el = (options.elevationDeg * Math.PI) / 180
  /** from the scene toward the camera */
  const toCam: V3 = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)]
  const right: V3 = norm([-toCam[1], toCam[0], 0])
  const up = cross(toCam, right)
  // a sun high and round to the left of the camera, so the face is lit
  // and the tops and ends read as different planes
  const lightAz = az + (35 * Math.PI) / 180
  const lightEl = (45 * Math.PI) / 180
  const light: V3 = [Math.cos(lightEl) * Math.cos(lightAz), Math.cos(lightEl) * Math.sin(lightAz), Math.sin(lightEl)]
  const depth = (p: V3) => dot(p, toCam)
  const project = (p: V3): [number, number] => [dot(p, right), -dot(p, up)]

  // ── the ground: one block under the whole wall ───────────────────────
  // A rectangle squared to the wall's face, cut into a fine grid. Every
  // point in it is on the low side or the retained side of whichever
  // stretch of wall is nearest it — so however the wall doubles back,
  // each patch of ground knows which side it's on — and stands at that
  // stretch's ground level, or just under its top. Grid squares the wall
  // line runs through are cut along it.
  const earthDrop = 0.02
  /** the retained ground's level at a post: just under the lower of the
   * tops either side of it (so with a stepped top it stays under both) */
  const highAt = (i: number) => Math.min(...[bayTops[i - 1]?.[1], bayTops[i]?.[0]].filter((z): z is number => z !== undefined)) - earthDrop
  const lastRunIndex = runs.length - 1
  /** about the nearest point on the wall to (x, y): how far it is to the
   * retained side of the back of the boards (negative = the low side),
   * whether it's past an end of the wall, and the two levels there */
  const groundAt = (x: number, y: number) => {
    let best = { dist: Infinity, side: 0, s: 0, pastEnd: false }
    runs.forEach((r, i) => {
      const along = (x - r.start[0]) * r.dir[0] + (y - r.start[1]) * r.dir[1]
      const t = Math.min(r.seg.lengthM, Math.max(0, along))
      const qx = r.start[0] + r.dir[0] * t
      const qy = r.start[1] + r.dir[1] * t
      const dist = Math.hypot(x - qx, y - qy)
      if (dist >= best.dist - 1e-12) return
      // at a corner the nearest point is shared by two runs: which side
      // of it is the retained side is told by the two normals together
      let normal = r.normal
      if (along <= 0 && i > 0) normal = add(r.normal, runs[i - 1].normal)
      if (along >= r.seg.lengthM && i < lastRunIndex) normal = add(r.normal, runs[i + 1].normal)
      const side = (x - qx) * normal[0] + (y - qy) * normal[1] >= 0 ? 1 : -1
      // past an end, the line between the sides carries straight on
      const pastEnd = (along < 0 && i === 0) || (along > r.seg.lengthM && i === lastRunIndex)
      const across = pastEnd ? (x - qx) * r.normal[0] + (y - qy) * r.normal[1] : side * dist
      best = { dist, side: across, s: r.seg.startXM + t, pastEnd }
    })
    let i = 0
    while (i < posts.length - 2 && posts[i + 1].xM < best.s) i++
    const a = posts[i]
    const b = posts[i + 1]
    const k = b.xM > a.xM ? Math.min(1, Math.max(0, (best.s - a.xM) / (b.xM - a.xM))) : 0
    return {
      g: best.side - earthFrontN,
      pastEnd: best.pastEnd,
      low: a.groundLevelM + (b.groundLevelM - a.groundLevelM) * k,
      high: highAt(i) + (highAt(i + 1) - highAt(i)) * k,
    }
  }

  const acrossV: [number, number] = [face[0], face[1]]
  const alongV: [number, number] = [-face[1], face[0]]
  const fromAC = (a: number, c: number): [number, number] => [a * alongV[0] + c * acrossV[0], a * alongV[1] + c * acrossV[1]]
  const wallPts = posts.flatMap((p, i) => {
    const o = frameAt(i).origin
    const r = endReach(i) + earthFrontN
    return [
      [o[0] + r, o[1] + r],
      [o[0] - r, o[1] - r],
      [o[0] + r, o[1] - r],
      [o[0] - r, o[1] + r],
    ]
  })
  const toAC = ([x, y]: number[]) => [x * alongV[0] + y * alongV[1], x * acrossV[0] + y * acrossV[1]]
  const acs = wallPts.map(toAC)
  // the ground reaches out under anything drawn with the wall too
  const extraAcs = extras.flatMap((e) => e.solids.flatMap((sd) => sd.flatMap((f) => f.pts.map(toAC))))
  const a0 = Math.min(...acs.map((p) => p[0]), ...extraAcs.map((p) => p[0] - 0.4))
  const a1 = Math.max(...acs.map((p) => p[0]), ...extraAcs.map((p) => p[0] + 0.4))
  const c0 = Math.min(...acs.map((p) => p[1])) - EARTH_BACK_M
  const c1 = Math.max(...acs.map((p) => p[1]), ...extraAcs.map((p) => p[1] + 0.4)) + GROUND_FRONT_M
  // ~3000 squares at most, none smaller than 15cm
  const cell = Math.max(0.15, Math.sqrt(((a1 - a0) * (c1 - c0)) / 3000))
  const na = Math.max(1, Math.ceil((a1 - a0) / cell))
  const nc = Math.max(1, Math.ceil((c1 - c0) / cell))
  type GV = { x: number; y: number; g: number; low: number; high: number; pastEnd: boolean }
  const gv = (a: number, c: number): GV => {
    const [x, y] = fromAC(a, c)
    return { x, y, ...groundAt(x, y) }
  }
  const grid: GV[][] = Array.from({ length: na + 1 }, (_, i) => Array.from({ length: nc + 1 }, (_, j) => gv(a0 + ((a1 - a0) * i) / na, c0 + ((c1 - c0) * j) / nc)))
  /** where the line between the sides crosses from u to v */
  const lerp = (u: GV, v: GV): GV => {
    const t = u.g / (u.g - v.g)
    const x = u.x + (v.x - u.x) * t
    const y = u.y + (v.y - u.y) * t
    return { x, y, ...groundAt(x, y), g: 0 }
  }
  const zOf = (v: GV, high: boolean) => (high ? v.high : v.low)
  const centre = fromAC((a0 + a1) / 2, (c0 + c1) / 2)
  /** the block's cut sides: along one edge of it, a face from the ground
   * down to the bottom of the block for each stretch on one side */
  const skirtAlong = (edge: GV[]) => {
    const pts: { v: GV; high: boolean; split?: boolean }[] = []
    edge.forEach((v, k) => {
      const prev = edge[k - 1]
      if (prev && prev.g >= 0 !== v.g >= 0) pts.push({ v: lerp(prev, v), high: false, split: true })
      pts.push({ v, high: v.g >= 0 })
    })
    let run: { v: GV; high: boolean }[] = []
    const flush = (high: boolean) => {
      if (run.length < 2) return
      const top = run.map(({ v }): V3 => [v.x, v.y, zOf(v, high)])
      const first = run[0].v
      const last = run[run.length - 1].v
      const face: V3[] = [...top, [last.x, last.y, slabBottom], [first.x, first.y, slabBottom]]
      const mid: V3 = [(first.x + last.x) / 2 - centre[0], (first.y + last.y) / 2 - centre[1], 0]
      items.push({ faces: [facing(face, mid, COLORS.soil)], solid: true, key: 0, layer: LAYER.skirt })
    }
    let side = pts[0].high
    pts.forEach((p) => {
      if (p.split) {
        run.push(p)
        flush(side)
        side = !side
        run = [p]
      } else run.push(p)
    })
    flush(side)
  }
  skirtAlong(grid.map((col) => col[0]))
  skirtAlong(grid.map((col) => col[nc]))
  skirtAlong(grid[0])
  skirtAlong(grid[na])

  const surface = (pts: V3[], high: boolean) =>
    items.push({ faces: [{ pts, color: high ? COLORS.earthTop : COLORS.grass }], solid: false, key: 0, layer: high ? LAYER.high : LAYER.low })
  for (let i = 0; i < na; i++) {
    // squares all on one side are run together, a strip at a time
    let stripFrom = -1
    let stripHigh = false
    const flushStrip = (to: number) => {
      if (stripFrom < 0) return
      const left = grid[i].slice(stripFrom, to + 1)
      const right = grid[i + 1].slice(stripFrom, to + 1).reverse()
      surface([...left, ...right].map((v): V3 => [v.x, v.y, zOf(v, stripHigh)]), stripHigh)
      stripFrom = -1
    }
    for (let j = 0; j < nc; j++) {
      // the square's corners, going round it
      const ring = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
      const highs = ring.map((v) => v.g >= 0)
      if (highs.every((h) => h === highs[0])) {
        if (stripFrom >= 0 && stripHigh !== highs[0]) flushStrip(j)
        if (stripFrom < 0) {
          stripFrom = j
          stripHigh = highs[0]
        }
        continue
      }
      flushStrip(j)
      // split it on the line between the sides
      const pieces: { pts: GV[]; high: boolean }[] = [
        { pts: [], high: false },
        { pts: [], high: true },
      ]
      const cuts: GV[] = []
      ring.forEach((u, k) => {
        const v = ring[(k + 1) % 4]
        const uHigh = u.g >= 0
        pieces[uHigh ? 1 : 0].pts.push(u)
        if (uHigh !== v.g >= 0) {
          const x = lerp(u, v)
          pieces[0].pts.push(x)
          pieces[1].pts.push(x)
          cuts.push(x)
        }
      })
      pieces.forEach(({ pts, high }) => pts.length >= 3 && surface(pts.map((v): V3 => [v.x, v.y, zOf(v, high)]), high))
      // past an end of the wall, the bank where the ground steps up
      if (cuts.length === 2) {
        const [u, v] = cuts
        const mid = groundAt((u.x + v.x) / 2, (u.y + v.y) / 2)
        if (mid.pastEnd && Math.max(u.high - u.low, v.high - v.low) > 1e-3) {
          const pts: V3[] = [
            [u.x, u.y, u.low],
            [v.x, v.y, v.low],
            [v.x, v.y, v.high],
            [u.x, u.y, u.high],
          ]
          // face it toward the low side: away from the higher ground
          const n = faceNormal(pts)
          const probe = groundAt((u.x + v.x) / 2 + n[0] * 0.05, (u.y + v.y) / 2 + n[1] * 0.05)
          items.push({ faces: [probe.g < 0 ? { pts, color: COLORS.soil } : { pts: [...pts].reverse(), color: COLORS.soil }], solid: true, key: 0, layer: LAYER.high })
        }
      }
    }
    flushStrip(nc)
  }

  // ── boards ───────────────────────────────────────────────────────────
  /** every wall item, with the posts/bays it touches, for sorting */
  const wallItems: { item: Item; bay?: number; post?: number }[] = []
  // posts where one top cap piece ends and the next begins
  const capJoints = new Set((topCapEnabled ? profile.topCap?.joints ?? [] : []).map((j) => j.postIndex))
  /** seams drawn over the cap, sorted after the caps either side */
  const capSeams: { item: Item; bay: number }[] = []
  bays.forEach((bay, k) => {
    const run = runOfBay(bay.leftIndex)
    const a = posts[bay.leftIndex]
    const b = posts[bay.rightIndex]
    const frame = frameAt(a.index, run)
    const width = b.xM - a.xM
    const overrun = bay.boardOverrunM
    // a board's overrun goes on whichever end is the end of a run of boards
    const prevBay = bays[k - 1]
    const nextBay = bays[k + 1]
    const runStart = !prevBay || prevBay.needsEngineer || a.isCorner
    const runEnd = !nextBay || nextBay.needsEngineer || b.isCorner
    const u0 = runStart ? -overrun : 0
    const u1 = runEnd ? width + overrun : width
    const n0 = Math.max(boardFront(a), boardFront(b))
    const n1 = n0 + t
    const [topA, topB] = bayTops[k]
    const slope = width > 0 ? (topB - topA) / width : 0

    if (bay.needsEngineer) {
      const faces = extrude(frame, [[0, Math.min(a.groundLevelM, b.groundLevelM)], [width, Math.min(a.groundLevelM, b.groundLevelM)], [width, topB], [0, topA]], n0, n1, COLORS.blocked)
      wallItems.push({ item: { faces, solid: true, key: 0, layer: LAYER.wall, opacity: 0.45 }, bay: k })
      return
    }

    const layout =
      bay.stepTopM !== null
        ? { baseLevelM: Math.min(a.groundLevelM, b.groundLevelM), courseCount: bay.levelCourseCount, undersideAM: bay.stepTopM, undersideBM: bay.stepTopM }
        : bayCourseLayout(a, b, ch, profile.rakedTopBoard)
    const { baseLevelM, undersideAM, undersideBM } = layout
    const underSlope = width > 0 ? (undersideBM - undersideAM) / width : 0
    for (let c = 0; c < layout.courseCount; c++) {
      const z0 = baseLevelM + c * ch
      const z1 = z0 + ch
      const rect: [number, number][] = [
        [u0, z0],
        [u1, z0],
        [u1, z1],
        [u0, z1],
      ]
      const prof = clipUnder(rect, 0, undersideAM, underSlope)
      if (prof.length < 3) continue
      const lit = highlight.some((h) => h.layer === "course" && h.courseRow === c && h.startPost <= bay.leftIndex && bay.leftIndex < h.endPost)
      wallItems.push({ item: { faces: extrude(frame, prof, n0, n1, lit ? COLORS.highlight : COLORS.board), solid: true, key: 0, layer: LAYER.wall }, bay: k })
    }
    // the top board: from the courses' underside line up to the top
    if (bay.stepTopM === null) {
      const prof: [number, number][] = [
        [u0, undersideAM + underSlope * u0],
        [u1, undersideAM + underSlope * u1],
        [u1, topA + slope * u1],
        [u0, topA + slope * u0],
      ]
      if (topA + slope * u0 - (undersideAM + underSlope * u0) > 1e-4 || topA + slope * u1 - (undersideAM + underSlope * u1) > 1e-4)
      {
        const lit = highlight.some((h) => h.layer === "topBoard" && h.startPost <= bay.leftIndex && bay.leftIndex < h.endPost)
        wallItems.push({ item: { faces: extrude(frame, prof, n0, n1, lit ? COLORS.highlight : COLORS.topBoard), solid: true, key: 0, layer: LAYER.wall }, bay: k })
      }
    }
    if (topCapEnabled) {
      const prof: [number, number][] = [
        [u0 - CAP_OVERHANG_M, topA + slope * (u0 - CAP_OVERHANG_M)],
        [u1 + CAP_OVERHANG_M, topA + slope * (u1 + CAP_OVERHANG_M)],
        [u1 + CAP_OVERHANG_M, topA + slope * (u1 + CAP_OVERHANG_M) + CAP_THICKNESS_M],
        [u0 - CAP_OVERHANG_M, topA + slope * (u0 - CAP_OVERHANG_M) + CAP_THICKNESS_M],
      ]
      const capN0 = -Math.max(postHalf(a), postHalf(b)) - CAP_OVERHANG_M
      const capN1 = n1 + CAP_OVERHANG_M
      const faces = extrude(frame, prof, capN0, capN1, COLORS.cap)
      wallItems.push({ item: { faces, solid: true, key: 0, layer: LAYER.wall + 1 }, bay: k })
      if (capJoints.has(bay.leftIndex)) {
        // a thin dark band just proud of the cap, across its top and faces
        const w = 0.008
        const seam: [number, number][] = [
          [-w, topA - w * slope - 0.002],
          [w, topA + w * slope - 0.002],
          [w, topA + w * slope + CAP_THICKNESS_M + 0.003],
          [-w, topA - w * slope + CAP_THICKNESS_M + 0.003],
        ]
        capSeams.push({ item: { faces: extrude(frame, seam, capN0 - 0.003, capN1 + 0.003, COLORS.capJoint), solid: true, key: 0, layer: LAYER.wall + 1 }, bay: k })
      }
    }
  })

  // ── posts ────────────────────────────────────────────────────────────
  let focusTop: V3 | null = null
  posts.forEach((p) => {
    const color = p.needsEngineer ? COLORS.blocked : COLORS.post
    const half = postHalf(p)
    // at a corner, square posts sit square to the wall after it
    const frame = frameAt(p.index)
    const footprint: [number, number][] = isRound(p)
      ? Array.from({ length: 12 }, (_, k) => {
          const a = (k / 12) * Math.PI * 2
          return [frame.origin[0] + Math.cos(a) * half, frame.origin[1] + Math.sin(a) * half]
        })
      : (
          [
            [-half, -half],
            [half, -half],
            [half, half],
            [-half, half],
          ] as [number, number][]
        ).map(([u, n]) => [frame.origin[0] + frame.dir[0] * u + frame.normal[0] * n, frame.origin[1] + frame.dir[1] * u + frame.normal[1] * n])
    const focused = options.focusPostIndex === p.index
    wallItems.push({
      item: { faces: prism(footprint, p.groundLevelM, p.topLevelM, focused ? COLORS.highlight : color), solid: true, key: 0, layer: LAYER.wall, opacity: p.needsEngineer ? 0.7 : undefined, post: p.index },
      post: p.index,
    })
    if (focused) focusTop = [frame.origin[0], frame.origin[1], p.topLevelM]

    if (options.showFootings) {
      const postBottom = p.groundLevelM - p.postDepthM
      const r = p.holeDiameterM / 2
      const hole: [number, number][] = Array.from({ length: 14 }, (_, k) => {
        const a = (k / 14) * Math.PI * 2
        return [frame.origin[0] + Math.cos(a) * r, frame.origin[1] + Math.sin(a) * r]
      })
      items.push({ faces: prism(hole, p.groundLevelM - p.embedmentM, p.groundLevelM - 0.005, focused ? COLORS.focusConcrete : COLORS.concrete), solid: true, key: 0, layer: LAYER.footing, opacity: focused ? 0.8 : 0.55, post: p.index })
      items.push({ faces: prism(footprint, postBottom, p.groundLevelM - 0.004, focused ? COLORS.highlight : COLORS.post), solid: true, key: 1, layer: LAYER.footing, opacity: 0.8, post: p.index })
    }
  })

  // ── obstructions in the ground, seen through it: the thing itself
  // and a faint shell for its clearance, running out under the ground in
  // front and the earth behind ──────────────────────────────────────
  shownObstructions.forEach((z) => {
    const o = z.obstruction
    const run = runs[o.segmentIndex]
    const th = (o.angleDeg * Math.PI) / 180
    const along = add(scale(run.dir, Math.cos(th)), scale(run.normal, Math.sin(th)))
    const across: V3 = [-along[1], along[0], 0]
    const at = add(run.start, scale(run.dir, z.centreXM - run.seg.startXM))
    const frame: RunFrame = { origin: at, dir: across, normal: along }
    const midZ = z.groundLevelM - o.depthM - o.sizeM / 2
    const reach = Math.max(GROUND_FRONT_M, EARTH_BACK_M) / Math.max(0.5, Math.sin(th))
    const outline = (half: number): [number, number][] =>
      OBSTRUCTION_TYPES[o.type].shape === "round"
        ? Array.from({ length: 12 }, (_, k) => {
            const a = (k / 12) * Math.PI * 2
            return [Math.cos(a) * half, midZ + Math.sin(a) * half]
          })
        : [
            [-half, midZ - half],
            [half, midZ - half],
            [half, midZ + half],
            [-half, midZ + half],
          ]
    const color = OBSTRUCTION_TYPES[o.type].color
    items.push({ faces: extrude(frame, outline(o.sizeM / 2), -reach, reach, color), solid: true, key: 2, layer: LAYER.footing, opacity: 0.9 })
    if (z.clearanceM > 0) {
      // the clearance shell, cut off at the ground
      const shell = outline(o.sizeM / 2 + z.clearanceM).map(([u, zz]): [number, number] => [u, Math.min(zz, z.groundLevelM - 0.01)])
      items.push({ faces: extrude(frame, shell, -reach, reach, color), solid: true, key: 3, layer: LAYER.footing, opacity: 0.22, clearance: true })
    }
    // marked out on the ground over it, like service paint: on the low
    // side at the ground, behind the wall on the retained earth
    const after = posts.findIndex((p) => p.xM >= z.centreXM - 1e-9)
    const pa = posts[Math.max(0, after - 1)]
    const pb = posts[Math.max(0, after)]
    const k = pb.xM > pa.xM ? (z.centreXM - pa.xM) / (pb.xM - pa.xM) : 0
    const retainedTop = pa.topAfterM + (pb.topBeforeM - pa.topAfterM) * k - earthDrop + 0.006
    const lowTop = z.groundLevelM + 0.006
    const half = Math.max(o.sizeM / 2, 0.04)
    // where the line meets the wall's two faces, along the obstruction
    const sin = Math.max(0.26, Math.sin(th))
    const frontAt = -(Math.max(pa.widthM, pb.widthM) / 2) / sin
    const backAt = (Math.max(pa.widthM, pb.widthM) / 2 + BOARD_THICKNESS_M) / sin
    const paint = (from: number, to: number, level: number): V3[] =>
      [
        [from, -half],
        [to, -half],
        [to, half],
        [from, half],
      ].map(([t2, w]) => {
        const q = add(add(at, scale(along, t2)), scale(across, w))
        return [q[0], q[1], level] as V3
      })
    items.push({ faces: [{ pts: paint(-reach, frontAt, lowTop), color }], solid: false, key: 4, layer: LAYER.footing, opacity: 0.95 })
    items.push({ faces: [{ pts: paint(backAt, reach, retainedTop), color }], solid: false, key: 4, layer: LAYER.footing, opacity: 0.95 })
  })

  // sort keys: back to front by depth; a post goes after the boards of
  // the bays either side of it (they're behind it), a cap after both
  wallItems.forEach((w) => (w.item.key = depth(centroid(w.item.faces.flatMap((f) => f.pts)))))
  const bayKey = new Map<number, number>()
  wallItems.forEach((w) => w.bay !== undefined && w.item.layer === LAYER.wall && bayKey.set(w.bay, Math.max(bayKey.get(w.bay) ?? -Infinity, w.item.key)))
  const postKey = new Map<number, number>()
  wallItems.forEach((w) => {
    if (w.post === undefined) return
    const around = [w.post - 1, w.post].map((k) => bayKey.get(k)).filter((k): k is number => k !== undefined)
    w.item.key = Math.max(w.item.key, ...around) + 1e-6
    postKey.set(w.post, w.item.key)
  })
  wallItems.forEach((w) => {
    if (w.bay === undefined || w.item.layer !== LAYER.wall + 1) return
    const bay = bays[w.bay]
    w.item.key = Math.max(w.item.key, postKey.get(bay.leftIndex) ?? -Infinity, postKey.get(bay.rightIndex) ?? -Infinity) + 2e-6
    w.item.layer = LAYER.wall
  })
  // a cap seam goes over the caps of the bays either side of its post
  {
    const capKey = new Map<number, number>()
    wallItems.forEach((w) => w.bay !== undefined && w.item.faces[0]?.color === COLORS.cap && capKey.set(w.bay, w.item.key))
    capSeams.forEach((s) => {
      s.item.key = Math.max(capKey.get(s.bay) ?? -Infinity, capKey.get(s.bay - 1) ?? -Infinity) + 3e-6
      s.item.layer = LAYER.wall
      wallItems.push(s)
    })
  }
  // a run seen from behind (the camera's round on its retained side) is
  // mostly hidden by the retained ground in front of it: draw it before
  // that ground, so the ground covers it — only a cap stays on top
  const backFacing = (run: (typeof runs)[number]) => dot(run.normal, toCam) > 0
  wallItems.forEach((w) => {
    if (w.item.layer !== LAYER.wall || w.item.faces[0]?.color === COLORS.cap || w.item.faces[0]?.color === COLORS.capJoint) return
    const behind =
      w.bay !== undefined
        ? backFacing(runOfBay(bays[w.bay].leftIndex))
        : [w.post! - 1, w.post!].filter((k) => k >= 0 && k < bays.length).every((k) => backFacing(runOfBay(bays[k].leftIndex)))
    if (behind) w.item.layer = LAYER.backWall
  })
  items.forEach((it) => (it.key = depth(centroid(it.faces.flatMap((f) => f.pts))) + it.key * 1e-6))
  // the extras, after the walls, each in its own order
  extras.forEach((extra, e) => {
    const solids = extra.solids.map((faces) => ({ faces: orientOutward(faces).map((f) => ({ ...f, normal: norm(faceNormal(f.pts)) })) }))
    orderSolids(solids, toCam, project, 1e-4).forEach((k, n) => {
      items.push({ faces: solids[k].faces.map(({ pts, color }) => ({ pts, color })), solid: true, key: e * 1e6 + n, layer: LAYER.extra })
    })
  })
  const byLayer = (a: Item, b: Item) => a.layer - b.layer || a.key - b.key

  // The layers put the retained ground under every wall seen from the
  // front, which is right for the ground behind that wall, but not for
  // high ground nearer the camera (where the wall doubles back): that
  // hides the wall's foot. So: a patch of high ground goes after a wall
  // piece when a vertical plane square to one of the runs has the ground
  // wholly on the camera's side and the piece wholly on the other.
  const axes = runs.map((r) => scale(r.normal, backFacing(r) ? 1 : -1))
  const across = (ax: V3, p: V3) => ax[0] * p[0] + ax[1] * p[1]
  const isGround = (it: Item) => it.layer === LAYER.high || it.layer === LAYER.skirt
  const bbox2 = (pts: V3[]) => {
    const p2 = pts.map(project)
    return {
      x0: Math.min(...p2.map((p) => p[0])),
      x1: Math.max(...p2.map((p) => p[0])),
      y0: Math.min(...p2.map((p) => p[1])),
      y1: Math.max(...p2.map((p) => p[1])),
    }
  }
  type Box = ReturnType<typeof bbox2>
  const overlaps = (A: Box, B: Box) => !(A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0)
  // a patch of high ground straddling the camera-side face of a run it
  // overlaps is cut along it, so each part can be ordered on its own
  {
    const cutters: { box: Box; ax: V3; at: number }[] = []
    runs.forEach((r, ri) => {
      const pts = wallItems
        .filter((w) => {
          const ks = w.bay !== undefined ? [w.bay] : [w.post! - 1, w.post!].filter((k) => k >= 0 && k < bays.length)
          return ks.some((k) => runOfBay(bays[k].leftIndex) === r)
        })
        .flatMap((w) => w.item.faces.flatMap((f) => f.pts))
      if (pts.length) cutters.push({ box: bbox2(pts), ax: axes[ri], at: Math.max(...pts.map((p) => across(axes[ri], p))) })
    })
    let queue = items.filter((it) => isGround(it) && it.faces.length === 1)
    const keep = items.filter((it) => !(isGround(it) && it.faces.length === 1))
    cutters.forEach(({ box, ax, at }) => {
      const nextQueue: Item[] = []
      queue.forEach((it) => {
        const pts = it.faces[0].pts
        const d = pts.map((p) => across(ax, p) - at)
        if (Math.min(...d) >= -1e-4 || Math.max(...d) <= 1e-4 || !overlaps(box, bbox2(pts))) return nextQueue.push(it)
        const sides: [V3[], V3[]] = [[], []]
        pts.forEach((p, i) => {
          const j = (i + 1) % pts.length
          if (d[i] <= 0) sides[0].push(p)
          if (d[i] >= 0) sides[1].push(p)
          if ((d[i] < 0 && d[j] > 0) || (d[i] > 0 && d[j] < 0)) {
            const s = d[i] / (d[i] - d[j])
            const q = add(p, scale(sub(pts[j], p), s))
            sides[0].push(q)
            sides[1].push(q)
          }
        })
        sides.forEach((sp) => sp.length >= 3 && nextQueue.push({ ...it, faces: [{ ...it.faces[0], pts: sp }] }))
      })
      queue = nextQueue
    })
    items.length = 0
    items.push(...keep, ...queue)
  }
  const low = items.filter((it) => it.layer === LAYER.low).sort(byLayer)
  // (anything wholly facing away from the camera isn't drawn, so isn't sorted)
  const shows = (it: Item) => !it.solid || it.faces.some((f) => dot(faceNormal(f.pts), toCam) > 1e-6)
  const rest = [...items.filter((it) => it.layer !== LAYER.low), ...wallItems.map((w) => w.item)].filter(shows).sort(byLayer)
  // pieces that only touch along an edge don't need ordering
  const overlapTol = Math.max(...items.map((it) => Math.max(...it.faces.flatMap((f) => f.pts.map((p) => Math.abs(p[0]) + Math.abs(p[1])))))) * 1e-5 + 1e-4
  const info = rest.map((it) => {
    const pts3 = it.faces.flatMap((f) => f.pts)
    const pts2 = pts3.map(project)
    return {
      pts3,
      hull: hull2(pts2),
      lo: axes.map((ax) => Math.min(...pts3.map((p) => across(ax, p)))),
      hi: axes.map((ax) => Math.max(...pts3.map((p) => across(ax, p)))),
      x0: Math.min(...pts2.map((p) => p[0])),
      x1: Math.max(...pts2.map((p) => p[0])),
      y0: Math.min(...pts2.map((p) => p[1])),
      y1: Math.max(...pts2.map((p) => p[1])),
    }
  })
  /** item g is wholly on the camera's side of item w, across some run */
  const inFront = (g: number, w: number) => axes.some((_, k) => info[g].lo[k] >= info[w].hi[k] - 1e-4)
  /** the see-through footings keep to their layer */
  const sorts = (i: number) => rest[i].layer !== LAYER.footing
  // draw-before edges between items that overlap on screen, then a
  // topological sort that otherwise keeps the layer order
  const n = rest.length
  const after: number[][] = rest.map(() => [])
  const indeg = new Array<number>(n).fill(0)
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const A = info[a]
      const B = info[b]
      if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue
      if (!hullsOverlap(A.hull, B.hull, overlapTol)) continue
      const ga = isGround(rest[a])
      const gb = isGround(rest[b])
      // where ground's involved and a plane square to a run parts them,
      // the one on the camera's side goes second; otherwise the layer
      // order (a first; the walls among themselves are already sorted),
      // except that patches of ground needn't be ordered among themselves
      const geo = (ga || gb) && sorts(a) && sorts(b)
      const aFront = geo && inFront(a, b)
      const bFront = geo && inFront(b, a)
      if (aFront === bFront && ga && gb) continue
      const [first, second] = aFront && !bFront ? [b, a] : [a, b]
      after[first].push(second)
      indeg[second]++
    }
  }
  const sorted: Item[] = []
  const done = new Array<boolean>(n).fill(false)
  let next = 0
  for (let count = 0; count < n; count++) {
    while (done[next]) next++
    let pick = -1
    for (let i = next; i < n; i++)
      if (!done[i] && indeg[i] === 0) {
        pick = i
        break
      }
    // a loop (shouldn't happen): take what's least held up
    if (pick < 0) {
      for (let i = next; i < n; i++) if (!done[i] && (pick < 0 || indeg[i] < indeg[pick])) pick = i
    }
    done[pick] = true
    sorted.push(rest[pick])
    after[pick].forEach((j) => indeg[j]--)
  }
  const all = [...low, ...sorted]

  const polygons: RenderPolygon[] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  all.forEach((it) => {
    it.faces.forEach((f) => {
      let n = faceNormal(f.pts)
      const towards = dot(n, toCam)
      if (it.solid && towards <= 1e-6) return
      if (!it.solid && towards < 0) n = scale(n, -1)
      if (!it.solid && Math.abs(towards) < 1e-6) return
      // the ground's surfaces are lit as if flat, so the triangles they're
      // made of all take the same shade and no seams show between them
      if (!it.solid) n = [0, 0, 1]
      const lambert = Math.max(0, dot(n, light))
      const shade = 0.5 + 0.6 * lambert
      const rgb = hexToRgb(f.color)
      const fill = rgbToHex(scale(rgb, shade))
      // the ground is drawn in pieces; outline them in their own colour
      // so they join up seamlessly
      const stroke = it.layer === LAYER.low || it.layer === LAYER.high || it.layer === LAYER.skirt ? fill : rgbToHex(scale(rgb, shade * 0.72))
      const pts2 = f.pts.map(project)
      pts2.forEach(([x, y]) => {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      })
      polygons.push({ points: pts2.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(" "), fill, stroke, opacity: it.opacity, post: it.post, clearance: it.clearance })
    })
  })
  if (!polygons.length) return null
  const focusXY = focusTop ? project(focusTop) : null
  if (focusXY) minY = Math.min(minY, focusXY[1] - (maxY - minY) * 0.12) // room for its marker above
  const span = Math.max(maxX - minX, maxY - minY)
  const pad = span * 0.05
  return {
    polygons,
    viewBox: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 },
    strokeW: span * 0.0012,
    focus: focusXY ? { x: focusXY[0], y: focusXY[1] } : undefined,
  }
}

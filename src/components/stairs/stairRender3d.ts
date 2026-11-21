/** A shaded 3D model of the stair, for a presentation view: every
 * stringer, wedge block, step frame, riser joist, nog, post, landing /
 * winder frame and decking board as its own solid, with the ground under
 * it and the deck it climbs to, projected axonometrically and sorted back
 * to front.
 *
 * Pure geometry, no React — stairRenderView.tsx draws the result as SVG.
 * Built off the same layout as the plan (calculateLayout), so straight and
 * turned stairs come out of one path.
 *
 * World axes, in mm: x east (= plan x), y north (= −plan y, since the
 * plan's y points down the screen), z up (0 = the ground). */

import { POST_SIZE, Pt, StairInput } from "./stairs"
import { StairLayout, overlapDepth, rightOf } from "./layout"
import { CameraFrame, CameraState, FIT_CAMERA, makeCamera, surfaceAtCentre } from "../render3d/perspective"

export type V3 = [number, number, number]
export type V2 = [number, number]

/** the kinds of part the model is made of, each shown or hidden as a set */
export type StairMember =
  | "stringers"
  | "wedges"
  | "frames"
  | "riserJoists"
  | "nogs"
  | "platforms"
  | "bearers"
  | "posts"
  | "treadBoards"
  | "riserBoards"
  | "deck"

export const STAIR_MEMBER_LABELS: Record<StairMember, string> = {
  stringers: "Stringers",
  wedges: "Wedge blocks",
  frames: "Step frames",
  riserJoists: "Riser joists",
  nogs: "Nogs",
  platforms: "Landing / winder frames",
  bearers: "Bearers",
  posts: "Posts",
  treadBoards: "Tread boards",
  riserBoards: "Riser boards",
  deck: "Deck",
}

/** Which members this stair has, in the order they're listed. */
export function stairMembers(input: StairInput, layout: StairLayout): StairMember[] {
  const stacked = input.framing === "stacked-frames"
  const outer = input.framing === "outer-stringers"
  const flights = layout.flights.filter((f) => f.treads > 0)
  const has: Record<StairMember, boolean> = {
    stringers: !stacked && flights.length > 0,
    wedges: !stacked && flights.length > 0,
    frames: stacked && flights.length > 0,
    riserJoists: outer && flights.length > 0,
    nogs: outer && flights.some((f) => f.sub.riserJoists.nogs.length > 0),
    platforms: layout.turns.length > 0,
    bearers: !stacked && flights.some((f) => f.sub.stringer.bearer && f.sub.stringer.posts.length > 0),
    posts: (!stacked && flights.some((f) => f.sub.stringer.posts.length > 0)) || layout.turns.some((t) => !t.onPads && t.posts.length > 0),
    treadBoards: true,
    riserBoards: input.riserBoards,
    deck: layout.flights.length > 0,
  }
  return (Object.keys(STAIR_MEMBER_LABELS) as StairMember[]).filter((m) => has[m])
}

export interface StairRenderOptions {
  /** degrees, how far the camera swings round from straight in front of
   * the bottom step (positive = round to the right) */
  azimuthDeg: number
  /** degrees above horizontal */
  elevationDeg: number
  /** members left out, to see how it goes together */
  hidden: ReadonlySet<StairMember>
  /** flown in (full screen); the fitted view if left out */
  camera?: CameraState
}

export interface StairRenderPolygon {
  /** "x,y x,y …" in view space */
  points: string
  fill: string
  stroke: string
}

export interface StairRenderScene {
  polygons: StairRenderPolygon[]
  viewBox: { x: number; y: number; w: number; h: number }
  /** a stroke width that reads at this scale */
  strokeW: number
  /** the camera's directions and what it's looking at (to fly it) */
  frame: CameraFrame
}

const COLORS = {
  decking: "#a8693f",
  /** H3.2 framing timber */
  framing: "#cbb37a",
  wedge: "#d6c08a",
  joist: "#bfa56c",
  post: "#8f7a50",
  deckTop: "#9c6038",
  deckFascia: "#b49a64",
  grass: "#9cc46e",
}

/** how deep the deck shown at the top runs back, and its framing depth */
const DECK_DEPTHS = [1200, 900, 600]
const DECK_MARGINS = [300, 150, 0]
const DECK_JOIST_DEPTH = 190
/** bearer under the stringers on a line of support posts */
const BEARER_WIDTH = 90
const BEARER_DEPTH = 140
/** solids closer than this (mm) count as touching, not overlapping */
const EPS = 0.5

// ── small vector helpers ───────────────────────────────────────────────
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
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
      if (len < 1e-9) continue
      const ax: V2 = [(p[1] - q[1]) / len, (q[0] - p[0]) / len]
      const proj = (poly2: V2[]) => poly2.map((r) => r[0] * ax[0] + r[1] * ax[1])
      const pa = proj(a)
      const pb = proj(b)
      if (Math.max(...pa) - tol <= Math.min(...pb) || Math.max(...pb) - tol <= Math.min(...pa)) return false
    }
  return true
}

// ── solids ─────────────────────────────────────────────────────────────
export interface Face {
  pts: V3[]
  color: string
  normal: V3
}

/** a convex closed solid, faces wound outward */
export interface Solid {
  faces: Face[]
}

export const makeSolid = (faces: { pts: V3[]; color: string }[]): Solid => {
  const mid = centroid(faces.flatMap((f) => f.pts))
  return {
    faces: faces.map((f) => {
      const n = faceNormal(f.pts)
      return dot(n, sub(centroid(f.pts), mid)) < 0
        ? { pts: [...f.pts].reverse(), color: f.color, normal: scale(n, -1) }
        : { pts: f.pts, color: f.color, normal: n }
    }),
  }
}

const toWorld = (p: Pt): V2 => [p.x, -p.y]

/** a vertical prism on a convex footprint (plan points) */
const prism = (footprint: Pt[], z0: number, z1: number, color: string, topColor = color): Solid | null => {
  if (footprint.length < 3 || z1 - z0 < 0.1) return null
  const bottom = footprint.map((p): V3 => [...toWorld(p), z0])
  const top = footprint.map((p): V3 => [...toWorld(p), z1])
  const faces = [
    { pts: bottom, color },
    { pts: top, color: topColor },
  ]
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length
    faces.push({ pts: [bottom[i], bottom[j], top[j], top[i]], color })
  }
  return makeSolid(faces)
}

/** A flight's own frame: `along` up the flight from its bottom riser,
 * `across` from its left edge, heights above `z0`. */
interface Frame {
  o: Pt
  d: Pt
  a: Pt
  z0: number
}
const planAt = (f: Frame, along: number, across: number): Pt => ({
  x: f.o.x + f.d.x * along + f.a.x * across,
  y: f.o.y + f.d.y * along + f.a.y * across,
})

/** Extrudes a convex side-view profile (x along the flight, y up) across
 * the flight from v0 to v1 — a stringer, a wedge, a board. */
const extrudeAcross = (f: Frame, profile: Pt[], v0: number, v1: number, color: string): Solid | null => {
  if (profile.length < 3 || v1 - v0 < 0.1) return null
  const at = (p: Pt, v: number): V3 => [...toWorld(planAt(f, p.x, v)), f.z0 + p.y]
  const front = profile.map((p) => at(p, v0))
  const back = profile.map((p) => at(p, v1))
  const faces = [
    { pts: front, color },
    { pts: back, color },
  ]
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length
    faces.push({ pts: [front[i], front[j], back[j], back[i]], color })
  }
  return makeSolid(faces)
}

const box = (f: Frame, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, color: string) =>
  u1 - u0 < 0.1 || y1 - y0 < 0.1
    ? null
    : extrudeAcross(
        f,
        [
          { x: u0, y: y0 },
          { x: u1, y: y0 },
          { x: u1, y: y1 },
          { x: u0, y: y1 },
        ],
        v0,
        v1,
        color,
      )

// ── the scene ──────────────────────────────────────────────────────────

/** Every part of the stair as its own convex solid, in world mm (z = 0
 * at the ground the stair starts from), less any hidden members. */
export function stairSolids(input: StairInput, layout: StairLayout, hidden: ReadonlySet<StairMember>): Solid[] {
  const W = input.width
  const t = input.boardThickness
  const b = input.stringerThickness
  const riserT = input.riserBoards ? t : 0
  const stacked = input.framing === "stacked-frames"
  const outer = input.framing === "outer-stringers"

  const solids: Solid[] = []
  const put = (kind: StairMember, s: Solid | null) => s && !hidden.has(kind) && solids.push(s)

  // ── flights ──────────────────────────────────────────────────────────
  layout.flights.forEach((fl) => {
    const s = fl.sub
    const k = fl.treads
    const R = s.rise
    const G = s.going
    const f: Frame = { o: fl.startL, d: fl.dir, a: rightOf(fl.dir), z0: fl.baseHeight }

    if (k > 0) {
      if (stacked) {
        s.frames.list.forEach((fr) => put("frames", box(f, fr.x0, fr.x1, 0, W, fr.y0, fr.y1, COLORS.framing)))
      } else {
        const lines = s.supports.positions.filter((_, i, all) => !outer || i === 0 || i === all.length - 1)
        lines.forEach((c) => {
          put("stringers", extrudeAcross(f, s.stringer.polygon, c - b / 2, c + b / 2, COLORS.framing))
          s.wedges.polygons.forEach((w) => put("wedges", extrudeAcross(f, w, c - b / 2, c + b / 2, COLORS.wedge)))
        })
        if (outer) {
          s.riserJoists.list.forEach((j) => put("riserJoists", box(f, j.x0, j.x1, b, W - b, j.y0, j.y1, COLORS.joist)))
          const nl = s.riserJoists.nogLines
          s.riserJoists.nogs.forEach((n, i) => {
            const c = nl[i % nl.length]
            put("nogs", box(f, n.x0, n.x1, c - b / 2, c + b / 2, n.y0, n.y1, COLORS.joist))
          })
        }
        // posts part way up, their tops at the stringer's underside (taken
        // at the post's low edge, so the sloping stringer never cuts into it)
        const slope = R / G
        s.stringer.posts.forEach((p) => {
          if (s.stringer.bearer) {
            const top = p.height - slope * (BEARER_WIDTH / 2)
            put("bearers", box(f, p.x - BEARER_WIDTH / 2, p.x + BEARER_WIDTH / 2, 0, W, top - BEARER_DEPTH, top, COLORS.joist))
            const n = s.stringer.postsPerLine
            for (let i = 0; i < n; i++) {
              const c = POST_SIZE / 2 + ((W - POST_SIZE) * i) / Math.max(1, n - 1)
              put("posts", box(f, p.x - POST_SIZE / 2, p.x + POST_SIZE / 2, c - POST_SIZE / 2, c + POST_SIZE / 2, -fl.baseHeight, top - BEARER_DEPTH, COLORS.post))
            }
          } else {
            const top = p.height - slope * (POST_SIZE / 2)
            lines.forEach((c) =>
              put("posts", box(f, p.x - POST_SIZE / 2, p.x + POST_SIZE / 2, c - POST_SIZE / 2, c + POST_SIZE / 2, -fl.baseHeight, top, COLORS.post)),
            )
          }
        })
      }
    }

    for (let i = 1; i <= k; i++) {
      const front = (i - 1) * G - riserT - s.nosing
      s.treadBoards.forEach((bd) => put("treadBoards", box(f, front + bd.offset, front + bd.offset + bd.width, 0, W, i * R - t, i * R, COLORS.decking)))
    }
    // every riser up the flight, the top one onto the turn or the deck
    if (input.riserBoards)
      for (let i = 1; i <= k + 1; i++) {
        const base = (i - 1) * R
        s.riserBoardPieces.forEach((p) =>
          put("riserBoards", box(f, (i - 1) * G - t, (i - 1) * G, 0, W, base + p.offset, base + p.offset + p.width, COLORS.decking)),
        )
      }
  })

  // ── turns: a platform on posts, winder frames stacked on it ──────────
  layout.turns.forEach((tn) => {
    tn.frames.forEach((fm, j) => {
      const top = tn.regions[j].height - t
      const bottom = j === 0 ? Math.max(0, top - tn.joistDepth) : tn.regions[j - 1].height - t
      put("platforms", prism(fm.poly, bottom, top, COLORS.framing))
    })
    if (!tn.onPads) {
      const mid = tn.polygon.reduce((acc, p) => ({ x: acc.x + p.x / tn.polygon.length, y: acc.y + p.y / tn.polygon.length }), { x: 0, y: 0 })
      const d = layout.flights[tn.index].dir
      const a = rightOf(d)
      const h = POST_SIZE / 2
      tn.posts.forEach(({ p, height }) => {
        // pulled in off every edge it sits on, so the post stands wholly
        // under the platform and clear of the flights butting up to it
        const c = { ...p }
        tn.polygon.forEach((a, i) => {
          const e = tn.polygon[(i + 1) % tn.polygon.length]
          const l = Math.hypot(e.x - a.x, e.y - a.y)
          if (l < 1) return
          let nx = -(e.y - a.y) / l
          let ny = (e.x - a.x) / l
          if ((mid.x - a.x) * nx + (mid.y - a.y) * ny < 0) {
            nx = -nx
            ny = -ny
          }
          if (Math.abs((p.x - a.x) * nx + (p.y - a.y) * ny) > 1) return
          c.x += nx * (h + 1)
          c.y += ny * (h + 1)
        })
        const foot = [
          [-h, -h],
          [h, -h],
          [h, h],
          [-h, h],
        ].map(([u, v]) => ({ x: c.x + d.x * u + a.x * v, y: c.y + d.y * u + a.y * v }))
        put("posts", prism(foot, 0, height, COLORS.post))
      })
    }
    tn.regions.forEach((rg, j) => {
      rg.boards.forEach((st) => put("treadBoards", prism(st.poly, rg.height - t, rg.height, COLORS.decking)))
      // the riser up onto each winder past the first (the first's is the
      // flight's top riser)
      if (input.riserBoards && j > 0) {
        const n = rg.normal
        const back = (p: Pt) => ({ x: p.x - n.x * t, y: p.y - n.y * t })
        put("riserBoards", prism([back(rg.frontA), back(rg.frontB), rg.frontB, rg.frontA], tn.regions[j - 1].height, rg.height - t, COLORS.decking))
      }
    })
  })

  // ── the deck at the top ──────────────────────────────────────────────
  const last = layout.flights[layout.flights.length - 1]
  if (last) {
    const f: Frame = { o: last.startL, d: last.dir, a: rightOf(last.dir), z0: 0 }
    const x0 = last.treads * last.sub.going
    const H = last.topHeight
    // as big as it can be without sitting over another part of the stair
    const others: Pt[][] = []
    layout.flights.forEach((fl) => {
      if (fl === last || fl.treads === 0) return
      const e = fl.treads * fl.sub.going
      others.push([fl.startL, { x: fl.startL.x + fl.dir.x * e, y: fl.startL.y + fl.dir.y * e }, { x: fl.startR.x + fl.dir.x * e, y: fl.startR.y + fl.dir.y * e }, fl.startR])
    })
    layout.turns.forEach((tn) => others.push(tn.polygon))
    const rect = (depth: number, mL: number, mR: number) => [planAt(f, x0, -mL), planAt(f, x0 + depth, -mL), planAt(f, x0 + depth, W + mR), planAt(f, x0, W + mR)]
    const clear = (poly: Pt[]) => others.every((o) => overlapDepth(o, poly) <= 5)
    const depth = DECK_DEPTHS.find((dp) => clear(rect(dp, 0, 0))) ?? DECK_DEPTHS[DECK_DEPTHS.length - 1]
    const mL = DECK_MARGINS.find((m) => clear(rect(depth, m, 0))) ?? 0
    const mR = DECK_MARGINS.find((m) => clear(rect(depth, mL, m))) ?? 0
    put("deck", prism(rect(depth, mL, mR), H - t, H, COLORS.deckTop))
    put("deck", prism(rect(depth, mL, mR), H - t - DECK_JOIST_DEPTH, H - t, COLORS.deckFascia))
    // posts under the deck's corners
    const p = POST_SIZE
    const postTop = H - t - DECK_JOIST_DEPTH
    if (postTop > 150)
      for (const u of [x0 + p, x0 + depth - p])
        for (const v of [-mL + p, W + mR - p])
          put("deck", box(f, u - p / 2, u + p / 2, v - p / 2, v + p / 2, 0, postTop, COLORS.post))
  }

  return solids
}

/** The order to draw convex solids in, back to front, seen from `toCam`
 * (unit, from the scene toward the camera) through `project`. Every solid
 * is convex and none cut into another, so for any two that overlap on
 * screen, a face plane of one of them has the other wholly on its
 * outside: whichever is on the camera's side of it goes second. `eps` is
 * how close counts as touching, in the solids' units. With `eye` (a
 * perspective camera, see render3d/perspective.ts) "toward the camera" is
 * toward that point, not along `toCam`. */
export function orderSolids(solids: Solid[], toCam: V3, project: (p: V3) => V2, eps = EPS, eye?: V3): number[] {
  const depthOf = (p: V3) => (eye ? -Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) : dot(p, toCam))
  const info = solids
    .map((s, index) => {
      const pts = s.faces.flatMap((f) => f.pts)
      const p2 = pts.map(project)
      return {
        index,
        s,
        pts,
        hull: hull2(p2),
        depth: depthOf(centroid(pts)),
        x0: Math.min(...p2.map((p) => p[0])),
        x1: Math.max(...p2.map((p) => p[0])),
        y0: Math.min(...p2.map((p) => p[1])),
        y1: Math.max(...p2.map((p) => p[1])),
      }
    })
    .sort((a, b) => a.depth - b.depth)
  /** -1: A goes first, 1: B goes first, 0: no face of A parts them */
  const parted = (A: (typeof info)[number], B: (typeof info)[number]) => {
    for (const f of A.s.faces) {
      const d = dot(f.normal, f.pts[0])
      const facing = eye ? dot(f.normal, eye) - d : dot(f.normal, toCam)
      if (Math.abs(facing) < 1e-6) continue
      if (B.pts.every((p) => dot(f.normal, p) - d >= -eps)) return facing > 0 ? -1 : 1
    }
    return 0
  }
  const n = info.length
  const after: number[][] = info.map(() => [])
  const indeg = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const A = info[i]
      const B = info[j]
      if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue
      if (!hullsOverlap(A.hull, B.hull, eps)) continue
      // otherwise the nearer centre goes second (they're sorted on it)
      const o = parted(A, B) || -parted(B, A) || -1
      const [first, second] = o < 0 ? [i, j] : [j, i]
      after[first].push(second)
      indeg[second]++
    }
  const order: number[] = []
  const done = new Array<boolean>(n).fill(false)
  for (let count = 0; count < n; count++) {
    let pick = -1
    for (let i = 0; i < n; i++)
      if (!done[i] && indeg[i] === 0) {
        pick = i
        break
      }
    // a loop (shouldn't happen): take what's least held up
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || indeg[i] < indeg[pick])) pick = i
    done[pick] = true
    order.push(info[pick].index)
    after[pick].forEach((j) => indeg[j]--)
  }
  return order
}

export function buildStairScene(input: StairInput, layout: StairLayout, options: StairRenderOptions): StairRenderScene | null {
  const solids = stairSolids(input, layout, options.hidden)
  if (!solids.length) return null

  // ── camera ───────────────────────────────────────────────────────────
  // square-on is standing in front of the bottom step, looking up it
  const d0 = layout.flights[0]?.dir ?? { x: 1, y: 0 }
  const baseAz = Math.atan2(d0.y, -d0.x) // world direction of −dir: (−d.x, +d.y)
  return sceneFromSolids(solids, baseAz + (options.azimuthDeg * Math.PI) / 180, (options.elevationDeg * Math.PI) / 180, options.camera)
}

/** Any set of solids drawn the way the stair is: a camera at this
 * azimuth and elevation (radians), lit from over its shoulder, a lawn
 * round them at z = 0, and every face sorted back to front. */
export function sceneFromSolids(solids: Solid[], az: number, el: number, camera?: CameraState): StairRenderScene | null {
  if (!solids.length) return null
  const allPts = solids.flatMap((sd) => sd.faces.flatMap((f) => f.pts))
  const cam = makeCamera(allPts, az, el, camera ?? FIT_CAMERA)
  const lightAz = az + (35 * Math.PI) / 180
  const lightEl = (50 * Math.PI) / 180
  const light: V3 = [Math.cos(lightEl) * Math.cos(lightAz), Math.cos(lightEl) * Math.sin(lightAz), Math.sin(lightEl)]

  // flown in close, whatever's wholly behind the camera is left out
  const inView = solids.filter((sd) => sd.faces.some((f) => f.pts.some((p) => cam.ahead(p) > 0)))
  const order = orderSolids(inView, cam.toCam, cam.project, EPS, cam.eye)

  // ── draw ─────────────────────────────────────────────────────────────
  const polygons: StairRenderPolygon[] = []
  const drawn: { pts: V3[]; normal: V3 }[] = []
  const emit = (pts: V3[], color: string, normal: V3, seamless = false) => {
    const cut = cam.clip(pts)
    if (cut.length < 3) return
    drawn.push({ pts: cut, normal })
    const shade = 0.5 + 0.6 * Math.max(0, dot(normal, light))
    const rgb = hexToRgb(color)
    const fill = rgbToHex(scale(rgb, shade))
    polygons.push({
      points: cut
        .map(cam.project)
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" "),
      fill,
      stroke: seamless ? fill : rgbToHex(scale(rgb, shade * 0.72)),
    })
  }

  // the ground: a lawn round the whole footprint, drawn first
  const all = allPts
  const gx0 = Math.min(...all.map((p) => p[0])) - 700
  const gx1 = Math.max(...all.map((p) => p[0])) + 700
  const gy0 = Math.min(...all.map((p) => p[1])) - 700
  const gy1 = Math.max(...all.map((p) => p[1])) + 700
  const ground: V3[] = [
    [gx0, gy0, 0],
    [gx1, gy0, 0],
    [gx1, gy1, 0],
    [gx0, gy1, 0],
  ]
  // (from underground, there's no lawn to see)
  if (cam.eye[2] > 0) emit(ground, COLORS.grass, [0, 0, 1], true)

  order.forEach((k) => inView[k].faces.forEach((f) => cam.sees(f.normal, f.pts[0]) && emit(f.pts, f.color, f.normal)))

  return {
    polygons,
    viewBox: cam.viewBox,
    strokeW: cam.span * 0.0012,
    // (only flown in is there anything to turn round but the middle)
    frame: { ...cam.frame, pivot: camera && camera !== FIT_CAMERA ? surfaceAtCentre(cam, drawn) : null },
  }
}

/** An axis-aligned box, in world mm (x east, y north, z up). */
export const worldBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string, topColor = color): Solid | null => {
  if (x1 - x0 < 0.1 || y1 - y0 < 0.1 || z1 - z0 < 0.1) return null
  const c = (x: number, y: number, z: number): V3 => [x, y, z]
  return makeSolid([
    { pts: [c(x0, y0, z0), c(x1, y0, z0), c(x1, y1, z0), c(x0, y1, z0)], color },
    { pts: [c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)], color: topColor },
    { pts: [c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1)], color },
    { pts: [c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), c(x1, y0, z1)], color },
    { pts: [c(x1, y1, z0), c(x0, y1, z0), c(x0, y1, z1), c(x1, y1, z1)], color },
    { pts: [c(x0, y1, z0), c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1)], color },
  ])
}

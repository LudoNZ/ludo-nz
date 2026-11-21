/** A roof over the house, worked out from its footprint and its walls.
 *
 * The footprint is split into wings — rectangles on the house's own
 * square (the way its longest side runs). The biggest is the main roof;
 * each part sticking out of it (an L's leg, a T's stem, a garage stepped
 * forward) gets a wing of its own, run back into the roof it joins until
 * it's buried, so where two meet there's a valley. Each wing is gable,
 * hip or skillion planes at one pitch, sprung from the eaves height; the
 * roof is whichever wing is highest at any point, and each plane is cut
 * to the part of it that shows — every piece convex, for the painter's
 * sort (stairs/stairRender3d.ts).
 *
 * "auto" reads it off the walls: a peaked wall is a gable end (the ridge
 * runs square to it, at its pitch), a wall sloping end to end is under a
 * skillion, all flat tops is a hip. Footprints that aren't all square
 * corners get one roof over their bounding rectangle. World mm, x east,
 * y north, z up from datum. Pure — no React. */

import { HouseLayout, P2 } from "./housePlan"
import { RoofPlan, RoofType, Wall } from "./types"
import { edgePoints } from "./weatherboardCalc"

export const DEFAULT_ROOF: RoofPlan = { type: "auto", pitchDeg: null, eavesMm: 450, vergeMm: 300, colour: "#3f4449" }

export const ROOF_COLOURS: { name: string; hex: string }[] = [
  { name: "Charcoal", hex: "#3f4449" },
  { name: "Slate grey", hex: "#6b7378" },
  { name: "Brick red", hex: "#8a3b2e" },
  { name: "Deep green", hex: "#3e5a46" },
  { name: "Sand", hex: "#b9a888" },
  { name: "Off white", hex: "#dcdad3" },
]

export const ROOF_TYPE_LABELS: Record<RoofType, string> = {
  auto: "From the walls",
  gable: "Gable",
  hip: "Hip",
  skillion: "Skillion",
  none: "No roof",
}

/** z = a·x + b·y + c */
export interface Plane {
  a: number
  b: number
  c: number
}
export const zAt = (pl: Plane, p: P2) => pl.a * p.x + pl.b * p.y + pl.c

export interface RoofFace {
  /** convex, on plan */
  poly: P2[]
  plane: Plane
}

export interface Roof {
  type: Exclude<RoofType, "auto">
  pitchDeg: number
  /** where the roof springs from the walls */
  eavesZ: number
  faces: RoofFace[]
  /** gable-end triangles over walls that don't reach the roof (no peaked
   * wall there): world points, flush with the wall line */
  infills: { pts: [number, number, number][]; inward: P2 }[]
  /** each wing's own rectangle (before it's run into the roof it joins:
   * together they tile the footprint), at the wall lines, and which way
   * its ridge runs — trusses, rafters and ceiling joists span square to it */
  wings: { corners: P2[]; ridge: P2 }[]
  notes: string[]
}

// ── the walls' tops ────────────────────────────────────────────────────

type TopShape = { kind: "flat" } | { kind: "peak"; pitchDeg: number } | { kind: "slope"; pitchDeg: number; risesToRight: boolean } | { kind: "other" }

export function topShape(w: Wall): TopShape {
  const pts = edgePoints(w.top, w.lengthMm)
  const ys = pts.map((p) => p.y)
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  if (hi - lo < 20) return { kind: "flat" }
  const top = pts.reduce((b, p) => (p.y > b.y ? p : b))
  const left = pts[0].y
  const right = pts[pts.length - 1].y
  if (top.x > 1 && top.x < w.lengthMm - 1 && top.y - left > 50 && top.y - right > 50) {
    const a1 = Math.atan2(top.y - left, top.x)
    const a2 = Math.atan2(top.y - right, w.lengthMm - top.x)
    return { kind: "peak", pitchDeg: (((a1 + a2) / 2) * 180) / Math.PI }
  }
  const steps = pts.slice(1).map((p, i) => p.y - pts[i].y)
  const up = steps.every((d) => d >= -1)
  const down = steps.every((d) => d <= 1)
  if ((up || down) && Math.abs(right - left) > 50) {
    // the steepest stretch (a rake that starts part way along is that steep)
    const steep = Math.max(...pts.slice(1).map((p, i) => Math.abs(Math.atan2(p.y - pts[i].y, p.x - pts[i].x || 1))))
    return { kind: "slope", pitchDeg: (steep * 180) / Math.PI, risesToRight: up }
  }
  return { kind: "other" }
}

/** the walls' eaves height: the commonest low end of a wall's top, by length */
function eavesHeight(walls: Wall[]): number {
  const weight = new Map<number, number>()
  for (const w of walls) {
    const h = Math.round(Math.min(w.top.left, w.top.right) / 10) * 10
    weight.set(h, (weight.get(h) ?? 0) + w.lengthMm)
  }
  let best = 2400
  let bw = -1
  for (const [h, wt] of weight) if (wt > bw) [best, bw] = [h, wt]
  return best
}

// ── convex polygons on plan ────────────────────────────────────────────

/** a half-plane: a·x + b·y + c ≤ 0 is inside */
interface Half {
  a: number
  b: number
  c: number
}

const clip = (poly: P2[], h: Half): P2[] => {
  const out: P2[] = []
  const f = (p: P2) => h.a * p.x + h.b * p.y + h.c
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const fp = f(p)
    const fq = f(q)
    if (fp <= 0) out.push(p)
    if (fp <= 0 !== fq <= 0) {
      const t = fp / (fp - fq)
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
    }
  }
  return out
}

const area = (poly: P2[]) => {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

/** a convex polygon (anticlockwise) as the half-planes it's inside of */
const halvesOf = (poly: P2[]): Half[] =>
  poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]
    // inside is left of p → q: (q−p)×(x−p) ≥ 0
    return { a: q.y - p.y, b: -(q.x - p.x), c: -(q.y - p.y) * p.x + (q.x - p.x) * p.y }
  })

/** what's left of a convex polygon once a convex region (its half-planes)
 * is taken out — as convex pieces */
const subtract = (poly: P2[], region: Half[]): P2[][] => {
  const out: P2[][] = []
  let rest = poly
  for (const h of region) {
    const outside = clip(rest, { a: -h.a, b: -h.b, c: -h.c })
    if (outside.length > 2 && Math.abs(area(outside)) > 2000) out.push(outside)
    rest = clip(rest, h)
    if (rest.length < 3) return out
  }
  return out
}

const inside = (pts: P2[], p: P2) => {
  let ins = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ins = !ins
  }
  return ins
}

// ── wings ──────────────────────────────────────────────────────────────

/** a rectangle on the house's square: u along its longest side, v across */
interface Rect {
  u0: number
  u1: number
  v0: number
  v1: number
}

type Side = "u0" | "u1" | "v0" | "v1"

interface Wing extends Rect {
  /** the ridge (or for a skillion, the level eaves) runs along u */
  alongU: boolean
  /** skillion only: rises toward the high (u1 / v1) side */
  risesToHigh: boolean
  /** sides run into the roof they join: no overhang, no gable end */
  buried: Set<Side>
}

/** Rectangles covering a footprint whose corners are all square on the
 * (u, v) frame: the biggest (favouring square over long and thin) first,
 * then the biggest of what's left, each one not overlapping those before. */
function rectangles(local: P2[]): Rect[] {
  const merge = (vals: number[]) => {
    const s = [...vals].sort((a, b) => a - b)
    return s.filter((v, i) => i === 0 || v - s[i - 1] > 5)
  }
  const us = merge(local.map((p) => p.x))
  const vs = merge(local.map((p) => p.y))
  const ni = us.length - 1
  const nj = vs.length - 1
  const inCell: boolean[][] = []
  for (let i = 0; i < ni; i++) {
    inCell.push([])
    for (let j = 0; j < nj; j++) inCell[i].push(inside(local, { x: (us[i] + us[i + 1]) / 2, y: (vs[j] + vs[j + 1]) / 2 }))
  }
  const taken = inCell.map((col) => col.map(() => false))
  const out: Rect[] = []
  for (;;) {
    let best: [number, number, number, number] | null = null
    let bestArea = 0
    for (let i0 = 0; i0 < ni; i0++)
      for (let j0 = 0; j0 < nj; j0++) {
        if (!inCell[i0][j0] || taken[i0][j0]) continue
        // widest-first: grow i1, and for each the tallest j1 that stays free
        let jMax = nj
        for (let i1 = i0 + 1; i1 <= ni; i1++) {
          let j = j0
          while (j < jMax && inCell[i1 - 1][j] && !taken[i1 - 1][j]) j++
          jMax = j
          if (jMax === j0) break
          // the biggest, but squarer first: an L splits into the house and
          // its wing, not a long strip and a sliver
          const w = us[i1] - us[i0]
          const h = vs[jMax] - vs[j0]
          const a = w * h * Math.sqrt(Math.min(w, h) / Math.max(w, h))
          if (a > bestArea + 1) {
            bestArea = a
            best = [i0, i1, j0, jMax]
          }
        }
      }
    if (!best) break
    const [i0, i1, j0, j1] = best
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) taken[i][j] = true
    out.push({ u0: us[i0], u1: us[i1], v0: vs[j0], v1: vs[j1] })
  }
  return out
}

const OPPOSITE: Record<Side, Side> = { u0: "u1", u1: "u0", v0: "v1", v1: "v0" }

/** how much of side `s` of `r` lies along `other` (touching it) */
function shared(r: Rect, s: Side, o: Rect): number {
  const near = (a: number, b: number) => Math.abs(a - b) < 5
  if (s === "u0" || s === "u1") {
    if (!near(r[s], o[OPPOSITE[s]])) return 0
    return Math.max(0, Math.min(r.v1, o.v1) - Math.max(r.v0, o.v0))
  }
  if (!near(r[s], o[OPPOSITE[s]])) return 0
  return Math.max(0, Math.min(r.u1, o.u1) - Math.max(r.u0, o.u0))
}

// ── the roof ───────────────────────────────────────────────────────────

const SIDES: Side[] = ["u0", "u1", "v0", "v1"]

/** `abut`: lines on plan (world) where this roof runs into a wall above
 * it — a storey over part of the house. No overhang along them, and a
 * skillion rises toward them: a lean-to. */
export function buildRoof(layout: HouseLayout, walls: Map<string, Wall>, plan: RoofPlan | undefined, opts: { abut?: { a: P2; b: P2 }[] } = {}): Roof | null {
  const r = plan ?? DEFAULT_ROOF
  if (r.type === "none" || !layout.closed || layout.sides.length < 3) return null
  const notes: string[] = []
  const outline = layout.sides.map((s) => s.a)
  const placed = layout.sides.filter((s) => s.wallId && walls.has(s.wallId))
  const placedWalls = [...new Set(placed.map((s) => s.wallId!))].map((id) => walls.get(id)!)
  if (!placedWalls.length) return null

  // the house's square: along its longest side
  const longest = layout.sides.reduce((b, s) => (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) ? s : b))
  const th = Math.atan2(longest.b.y - longest.a.y, longest.b.x - longest.a.x)
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  const toLocal = (p: P2): P2 => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos })
  const toWorld = (p: P2): P2 => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos })
  const local = outline.map(toLocal)

  const square = layout.sides.every((s) => {
    const a = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) - th
    return Math.abs(Math.sin(2 * a)) < 0.02
  })
  let rects: Rect[]
  if (square) rects = rectangles(local)
  else {
    const xs = local.map((p) => p.x)
    const ys = local.map((p) => p.y)
    rects = [{ u0: Math.min(...xs), u1: Math.max(...xs), v0: Math.min(...ys), v1: Math.max(...ys) }]
    notes.push("The footprint isn't all square corners, so the roof is one roof over the rectangle round it.")
  }
  if (!rects.length) return null

  // the walls' tops, and where each wall is on the house's square
  const shapes = placed.map((s) => {
    const a = toLocal(s.a)
    const b = toLocal(s.b)
    return { s, a, b, shape: topShape(walls.get(s.wallId!)!) }
  })
  const type: Exclude<RoofType, "auto"> =
    r.type !== "auto" ? r.type : shapes.some((w) => w.shape.kind === "peak") ? "gable" : shapes.some((w) => w.shape.kind === "slope") ? "skillion" : "hip"
  const fromWalls = shapes.find((w) => w.shape.kind === (type === "skillion" ? "slope" : "peak"))?.shape as { pitchDeg: number } | undefined
  const pitchDeg = Math.min(60, Math.max(1, r.pitchDeg ?? fromWalls?.pitchDeg ?? (type === "skillion" ? 10 : 25)))
  const t = Math.tan((pitchDeg * Math.PI) / 180)
  const H = eavesHeight(placedWalls)

  /** the wall (and its top) lying along side `s` of `rect`, if any */
  const wallOn = (rect: Rect, s: Side, kind: TopShape["kind"]) =>
    shapes.find((w) => {
      if (w.shape.kind !== kind) return false
      const k = s[0] === "u" ? "x" : "y"
      const o = k === "x" ? "y" : "x"
      const lo = k === "x" ? rect.v0 : rect.u0
      const hi = k === "x" ? rect.v1 : rect.u1
      const mid = (w.a[o] + w.b[o]) / 2
      return Math.abs(w.a[k] - rect[s]) < 30 && Math.abs(w.b[k] - rect[s]) < 30 && mid > lo && mid < hi
    })

  // ── the wings ────────────────────────────────────────────────────────
  const wings: Wing[] = []
  rects.forEach((rect, i) => {
    const wing: Wing = { ...rect, alongU: rect.u1 - rect.u0 >= rect.v1 - rect.v0, risesToHigh: true, buried: new Set() }
    if (i > 0) {
      // the side it joins the roof before it by, and how far to run it in
      let best: { s: Side; len: number; parent: Rect } | null = null
      for (const s of SIDES)
        for (const p of rects.slice(0, i)) {
          const len = shared(rect, s, p)
          if (len > (best?.len ?? 0)) best = { s, len, parent: p }
        }
      if (best) {
        const { s, parent } = best
        const across = s[0] === "u" // joins on a u side: the wing runs along u into it
        const depth = across ? rect.u1 - rect.u0 : rect.v1 - rect.v0
        const width = across ? rect.v1 - rect.v0 : rect.u1 - rect.u0
        // a leg sticking well out has its ridge running into the roof it joins;
        // a shallow step's runs along it
        wing.alongU = depth >= width * 0.5 ? across : !across
        const half = (across ? parent.u1 - parent.u0 : parent.v1 - parent.v0) / 2
        if (s === "u0") wing.u0 -= half
        if (s === "u1") wing.u1 += half
        if (s === "v0") wing.v0 -= half
        if (s === "v1") wing.v1 += half
        wing.buried.add(s)
      }
    }
    // up against a storey above: no overhang there, and a lean-to rises to it
    for (const seg of opts.abut ?? []) {
      const a = toLocal(seg.a)
      const b = toLocal(seg.b)
      for (const s of SIDES) {
        const k = s[0] === "u" ? "x" : "y"
        const o = k === "x" ? "y" : "x"
        const [lo, hi] = k === "x" ? [rect.v0, rect.v1] : [rect.u0, rect.u1]
        const overlap = Math.min(hi, Math.max(a[o], b[o])) - Math.max(lo, Math.min(a[o], b[o]))
        if (Math.abs(a[k] - rect[s]) < 5 && Math.abs(b[k] - rect[s]) < 5 && overlap > 100) {
          wing.buried.add(s)
          if (type === "skillion") {
            wing.alongU = k === "y"
            wing.risesToHigh = s.endsWith("1")
          }
        }
      }
    }
    if (type === "gable") {
      // a peaked wall on a side: the ridge runs square to it
      if (wallOn(rect, "u0", "peak") || wallOn(rect, "u1", "peak")) wing.alongU = true
      else if (wallOn(rect, "v0", "peak") || wallOn(rect, "v1", "peak")) wing.alongU = false
    }
    if (type === "skillion" && !(opts.abut ?? []).length) {
      // a wall sloping end to end on a side: the roof falls along it
      for (const s of SIDES) {
        const w = wallOn(rect, s, "slope")
        if (!w || w.shape.kind !== "slope") continue
        const k = s[0] === "u" ? "y" : "x" // the wall runs along this local axis
        const dir = (w.b[k] - w.a[k]) * (w.shape.risesToRight ? 1 : -1)
        wing.alongU = k === "y" // falls along v: the level eaves run along u
        wing.risesToHigh = dir > 0
        break
      }
    }
    wings.push(wing)
  })

  // ── each wing's planes and the area its roof covers ─────────────────
  const plane = (A: number, B: number, C: number): Plane => ({ a: A * cos - B * sin, b: A * sin + B * cos, c: C })
  const built = wings.map((w) => {
    // [lo, hi] across the ridge, and along it
    const [a0, a1, b0, b1] = w.alongU ? [w.v0, w.v1, w.u0, w.u1] : [w.u0, w.u1, w.v0, w.v1]
    const across = (k: number, c: number) => (w.alongU ? plane(0, k, c) : plane(k, 0, c))
    const along = (k: number, c: number) => (w.alongU ? plane(k, 0, c) : plane(0, k, c))
    const planes: Plane[] =
      type === "skillion"
        ? [w.risesToHigh ? across(t, H - a0 * t) : across(-t, H + a1 * t)]
        : [across(t, H - a0 * t), across(-t, H + a1 * t), ...(type === "hip" ? [along(t, H - b0 * t), along(-t, H + b1 * t)] : [])]
    const eaves = r.eavesMm
    const ends = type === "hip" ? r.eavesMm : r.vergeMm
    const over = (s: Side) => (w.buried.has(s) ? 0 : (s[0] === "u") === w.alongU ? ends : eaves)
    const corners: P2[] = [
      { x: w.u0 - over("u0"), y: w.v0 - over("v0") },
      { x: w.u1 + over("u1"), y: w.v0 - over("v0") },
      { x: w.u1 + over("u1"), y: w.v1 + over("v1") },
      { x: w.u0 - over("u0"), y: w.v1 + over("v1") },
    ].map(toWorld)
    return { w, planes, region: corners }
  })

  // ── each plane, cut to where it's the roof ──────────────────────────
  const faces: RoofFace[] = []
  built.forEach((A, ai) => {
    A.planes.forEach((P, pi) => {
      // where this plane is the wing's roof: below its other planes
      let poly = A.region
      A.planes.forEach((Q, qi) => qi !== pi && (poly = clip(poly, { a: P.a - Q.a, b: P.b - Q.b, c: P.c - Q.c })))
      if (poly.length < 3) return
      let pieces = [poly]
      built.forEach((B, bi) => {
        if (bi === ai) return
        // hidden where B's roof is above it (a tie goes to the earlier wing)
        const d = bi < ai ? -1 : 1
        const hidden: Half[] = [...halvesOf(B.region), ...B.planes.map((Q) => ({ a: P.a - Q.a, b: P.b - Q.b, c: P.c - Q.c + d }))]
        pieces = pieces.flatMap((pc) => subtract(pc, hidden))
      })
      for (const pc of pieces) if (pc.length > 2 && Math.abs(area(pc)) > 2000) faces.push({ poly: pc, plane: P })
    })
  })

  // ── gable ends that the walls don't fill ────────────────────────────
  const infills: Roof["infills"] = []
  if (type === "gable")
    for (const w of wings) {
      const ends: Side[] = w.alongU ? ["u0", "u1"] : ["v0", "v1"]
      const [lo, hi] = w.alongU ? [w.v0, w.v1] : [w.u0, w.u1]
      const peak = H + ((hi - lo) / 2) * t
      for (const s of ends) {
        // run into another roof, or a gable wall's already there
        if (w.buried.has(s) || wallOn(w, s, "peak")) continue
        const inward = s.endsWith("0") ? 1 : -1
        // flush with the wall's face, on top of it
        const at = w[s]
        const pt = (along: number, z: number): [number, number, number] => {
          const p = toWorld(w.alongU ? { x: at, y: along } : { x: along, y: at })
          return [p.x, p.y, z]
        }
        const dir = toWorld(w.alongU ? { x: inward, y: 0 } : { x: 0, y: inward })
        infills.push({ pts: [pt(lo, H), pt(hi, H), pt((lo + hi) / 2, peak)], inward: dir })
      }
    }

  const wingsOut = rects.map((rect, i) => ({
    corners: [
      { x: rect.u0, y: rect.v0 },
      { x: rect.u1, y: rect.v0 },
      { x: rect.u1, y: rect.v1 },
      { x: rect.u0, y: rect.v1 },
    ].map(toWorld),
    ridge: toWorld(wings[i].alongU ? { x: 1, y: 0 } : { x: 0, y: 1 }),
  }))
  if (wings.length > 1) notes.push(`${wings.length} roofs meeting in valleys, one over each wing of the footprint.`)
  return { type, pitchDeg, eavesZ: H, faces, infills, wings: wingsOut, notes }
}

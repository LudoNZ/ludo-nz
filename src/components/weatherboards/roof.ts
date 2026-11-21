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

/** how deep the roof is drawn, sheet to soffit (the fascia) — a roof
 * running under another closer than this is cut where they'd meet */
export const ROOF_DEPTH = 200

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
  /** each wing's own roof: its rectangle at the wall lines (as laid out,
   * not run on into another) and its planes, uncut — what the walls round
   * that wing stop under (see own) */
  own: { rect: P2[]; planes: Plane[] }[]
  notes: string[]
}

/** The roof a wall at `p` stops under: the wing whose own rectangle `p`
 * (nudged just inside the house) is in — the lowest of its planes there —
 * or null where it's under none. Not just the highest roof overhead: a
 * gable's verge overhanging a lower roof isn't what the wall below holds up. */
export function ownRoofAt(roof: Roof, p: P2, inside: P2, along: P2 = { x: 0, y: 0 }): number | null {
  // (nudged in, and along the wall toward its middle — a wall's end is on
  // the corner where its wing meets the next)
  const q = { x: p.x + inside.x * 10 + along.x * 10, y: p.y + inside.y * 10 + along.y * 10 }
  for (const w of roof.own) {
    // (the rectangles are square to the house, which may not be to north)
    const a = w.rect[0]
    const u = { x: w.rect[1].x - a.x, y: w.rect[1].y - a.y }
    const v = { x: w.rect[3].x - a.x, y: w.rect[3].y - a.y }
    const lu = Math.hypot(u.x, u.y) || 1
    const lv = Math.hypot(v.x, v.y) || 1
    const su = ((q.x - a.x) * u.x + (q.y - a.y) * u.y) / lu
    const sv = ((q.x - a.x) * v.x + (q.y - a.y) * v.y) / lv
    if (su > 0 && su < lu && sv > 0 && sv < lv) return Math.min(...w.planes.map((pl) => zAt(pl, p)))
  }
  return null
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
  /** its own roof: the house's, or a lean-to up against a gable end */
  type: "gable" | "hip" | "skillion"
  /** the ridge (or for a skillion, the level eaves) runs along u */
  alongU: boolean
  /** skillion only: rises toward the high (u1 / v1) side */
  risesToHigh: boolean
  /** a lean-to against a gable end: its high side at the eaves height (it
   * has to get under the gable's rake), falling away at its own pitch */
  underRake?: number
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
    const wing: Wing = { ...rect, type, alongU: rect.u1 - rect.u0 >= rect.v1 - rect.v0, risesToHigh: true, buried: new Set() }
    if (i > 0) {
      // the roof it joins (one before it), and the side it joins it by
      let best: { s: Side; len: number; parent: Wing } | null = null
      // (touching its rectangle as laid out, not as run on into another)
      for (const s of SIDES)
        rects.slice(0, i).forEach((p, k) => {
          const len = shared(rect, s, p)
          if (len > (best?.len ?? 0)) best = { s, len, parent: wings[k] }
        })
      if (best) {
        const { s, parent } = best as { s: Side; len: number; parent: Wing }
        const across = s[0] === "u" // joined on a u side: it sticks out along u
        const depth = across ? rect.u1 - rect.u0 : rect.v1 - rect.v0
        const width = across ? rect.v1 - rect.v0 : rect.u1 - rect.u0
        // what the roof it joins does along that side: slopes up away from
        // it (an eaves side, a hip end, a lean-to's low side), or stands as
        // a wall going on up above it (a gable end, a lean-to's high side or
        // its verge)
        const theirs = OPPOSITE[s]
        const theirsAlongRidge = (theirs[0] === "u") !== parent.alongU
        const slopes =
          type !== "skillion" &&
          (parent.type === "hip" ||
            (parent.type === "gable" && theirsAlongRidge) ||
            (parent.type === "skillion" && theirsAlongRidge && theirs.endsWith(parent.risesToHigh ? "0" : "1")))
        if (slopes) {
          // its ridge runs into that roof, and on in under it as far as it
          // takes to be buried (half its width, at the one pitch): valleys
          wing.type = type
          wing.alongU = across
          const run = Math.min(width / 2, (across ? parent.u1 - parent.u0 : parent.v1 - parent.v0) / 2)
          if (s === "u0") wing.u0 -= run
          if (s === "u1") wing.u1 += run
          if (s === "v0") wing.v0 -= run
          if (s === "v1") wing.v1 += run
        } else if (depth < width) {
          // a shallow one: a lean-to against the wall, its top edge at the
          // eaves (under the gable's rake, which comes down to the eaves at
          // the corners), falling away at no more than 15°
          wing.type = "skillion"
          wing.alongU = !across
          wing.risesToHigh = s.endsWith("1")
          wing.underRake = Math.tan((Math.min(pitchDeg, 15) * Math.PI) / 180)
        } else if (type === "skillion") {
          // a lean-to off a lean-to: rising to the wall it's against
          wing.type = "skillion"
          wing.alongU = !across
          wing.risesToHigh = s.endsWith("1")
        } else {
          // a lower roof of its own, running out from the wall
          wing.type = type
          wing.alongU = across
        }
        // either way, nothing hangs over (and no gable's filled) where it joins
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
          if (wing.type === "skillion") {
            wing.alongU = k === "y"
            wing.risesToHigh = s.endsWith("1")
          }
        }
      }
    }
    if (i === 0 && type === "gable") {
      // a peaked wall on a side: the ridge runs square to it
      if (wallOn(rect, "u0", "peak") || wallOn(rect, "u1", "peak")) wing.alongU = true
      else if (wallOn(rect, "v0", "peak") || wallOn(rect, "v1", "peak")) wing.alongU = false
    }
    if (i === 0 && type === "skillion" && !(opts.abut ?? []).length) {
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
    const lt = w.underRake
    const planes: Plane[] =
      w.type === "skillion"
        ? lt !== undefined
          ? // its high side at the eaves height, falling away from it
            [w.risesToHigh ? across(lt, H - a1 * lt) : across(-lt, H + a0 * lt)]
          : [w.risesToHigh ? across(t, H - a0 * t) : across(-t, H + a1 * t)]
        : [across(t, H - a0 * t), across(-t, H + a1 * t), ...(w.type === "hip" ? [along(t, H - b0 * t), along(-t, H + b1 * t)] : [])]
    const eaves = r.eavesMm
    const ends = w.type === "hip" ? r.eavesMm : r.vergeMm
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
        // cut where it runs into B's roof: under B's surface but within a
        // roof's depth of it (where they'd meet — a valley). Well below B
        // (a lower roof under another's verge) it carries on under, to its
        // wall. Taken face by face of B, so each piece cut out is convex;
        // a tie goes to the earlier wing.
        const d = bi < ai ? -1 : 1
        B.planes.forEach((Q, qi) => {
          const hidden: Half[] = [
            ...halvesOf(B.region),
            // where Q is B's surface
            ...B.planes.filter((_, k) => k !== qi).map((R) => ({ a: Q.a - R.a, b: Q.b - R.b, c: Q.c - R.c })),
            // under it…
            { a: P.a - Q.a, b: P.b - Q.b, c: P.c - Q.c + d },
            // …but not by more than a roof's depth
            { a: Q.a - P.a, b: Q.b - P.b, c: Q.c - P.c - ROOF_DEPTH },
          ]
          pieces = pieces.flatMap((pc) => subtract(pc, hidden))
        })
      })
      for (const pc of pieces) if (pc.length > 2 && Math.abs(area(pc)) > 2000) faces.push({ poly: pc, plane: P })
    })
  })

  // ── gable ends that the walls don't fill ────────────────────────────
  // Each gable end's triangle, less the stretches a wall along that line
  // already reaches up into (a gable wall); what's left is filled — say,
  // above a lower roof that runs out from the end.
  const infills: Roof["infills"] = []
  for (const w of wings)
    if (w.type === "gable") {
      const ends: Side[] = w.alongU ? ["u0", "u1"] : ["v0", "v1"]
      const [lo, hi] = w.alongU ? [w.v0, w.v1] : [w.u0, w.u1]
      const mid = (lo + hi) / 2
      const zAt2 = (v: number) => H + Math.min(v - lo, hi - v) * t
      for (const s of ends) {
        // run into another roof: nothing to fill
        if (w.buried.has(s)) continue
        const k = s[0] === "u" ? "x" : "y"
        const o = k === "x" ? "y" : "x"
        // the walls along this end, as stretches along it
        const covered = shapes
          .filter((x) => Math.abs(x.a[k] - w[s]) < 30 && Math.abs(x.b[k] - w[s]) < 30)
          .map((x) => [Math.min(x.a[o], x.b[o]), Math.max(x.a[o], x.b[o])] as [number, number])
          .sort((p, q) => p[0] - q[0])
        const gaps: [number, number][] = []
        let at0 = lo
        for (const [p, q] of covered) {
          if (p - at0 > 100) gaps.push([at0, Math.min(p, hi)])
          at0 = Math.max(at0, q)
        }
        if (hi - at0 > 100) gaps.push([at0, hi])
        const inward = s.endsWith("0") ? 1 : -1
        const at = w[s]
        const pt = (along: number, z: number): [number, number, number] => {
          const p = toWorld(w.alongU ? { x: at, y: along } : { x: along, y: at })
          return [p.x, p.y, z]
        }
        const dir = toWorld(w.alongU ? { x: inward, y: 0 } : { x: 0, y: inward })
        for (const [p, q] of gaps) {
          const top = [pt(q, zAt2(q)), ...(p < mid && mid < q ? [pt(mid, zAt2(mid))] : []), pt(p, zAt2(p))]
          // (at an eaves corner the top meets the bottom: one point, not two)
          const pts = [pt(p, H), pt(q, H), ...top].filter((a, i, all) => {
            const b = all[(i + 1) % all.length]
            return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1
          })
          if (pts.length >= 3) infills.push({ pts, inward: dir })
        }
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
  const own = rects.map((rect, i) => ({
    rect: [
      { x: rect.u0, y: rect.v0 },
      { x: rect.u1, y: rect.v0 },
      { x: rect.u1, y: rect.v1 },
      { x: rect.u0, y: rect.v1 },
    ].map(toWorld),
    planes: built[i].planes,
  }))
  return { type, pitchDeg, eavesZ: H, faces, infills, wings: wingsOut, own, notes }
}

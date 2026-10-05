/** Wall geometry → board courses → cut pieces. Pure math, no React.
 *
 * Every wall is a polygon bounded by a piecewise-linear top edge and
 * bottom edge. Courses are horizontal bands `cover` mm tall stacked up
 * from the wall's lowest point; within each band the board has to run
 * as far as the wall reaches anywhere inside that band (the long point
 * of any rake cut), so a band's runs are the x-ranges where the wall
 * overlaps it at all. An opening only breaks a course it covers top to
 * bottom; the head and sill courses it just clips run through and get
 * notched, so they stay full length. Runs longer than the longest board are split at
 * stud positions, staggered off the joins in the course below. */

import { Opening, Wall, WallCorner, WallEdge, WeatherboardSettings } from "./types"

/** A band has to overlap the wall by more than this to need a board —
 * keeps floating-point slivers at a peak or a sill from spawning pieces. */
const SLIVER_MM = 5

/** An offcut at least this long can still become a short piece elsewhere. */
const USEFUL_OFFCUT_MM = 900

/** A piece within this much of a stock length counts as using the whole
 * board — no meaningful offcut, just the ends trimmed. */
export const FULL_BOARD_TOLERANCE_MM = 50

export interface Run {
  start: number
  end: number
}

export interface CoursePiece {
  start: number
  end: number
  /** start→end length plus the cut allowance — what comes off a stock board. */
  cutLength: number
  /** marked "don't count" (wall.skips) — still laid out, left out of the order */
  skipped?: boolean
}

export interface Course {
  index: number
  bottom: number
  top: number
  runs: Run[]
  pieces: CoursePiece[]
  joins: number[]
}

export interface WallResult {
  wall: Wall
  coverMm: number
  minY: number
  maxY: number
  /** Gross area of the wall outline, before openings. */
  areaM2: number
  /** areaM2 less the openings (clipped to the outline's bounding box). */
  netAreaM2: number
  courses: Course[]
  studs: number[]
}

export const edgePoints = (edge: WallEdge, lengthMm: number): { x: number; y: number }[] => {
  const inner = edge.breaks
    .filter((b) => b.x > 0 && b.x < lengthMm)
    .map((b) => ({ x: b.x, y: b.y }))
    .sort((a, b) => a.x - b.x)
  return [{ x: 0, y: edge.left }, ...inner, { x: lengthMm, y: edge.right }]
}

const valueAt = (pts: { x: number; y: number }[], x: number): number => {
  if (x <= pts[0].x) return pts[0].y
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (x <= b.x) {
      if (b.x === a.x) return b.y
      return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x)
    }
  }
  return pts[pts.length - 1].y
}

/** x positions where a piecewise-linear edge crosses height `y`. */
const crossings = (pts: { x: number; y: number }[], y: number): number[] => {
  const xs: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if ((a.y - y) * (b.y - y) < 0) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
  }
  return xs
}

/** The x-ranges where the wall overlaps the band [lo, hi]. Exact for
 * piecewise-linear edges: the in/out test can only flip at an edge
 * vertex or where an edge crosses the band's top or bottom line, so
 * testing the midpoint of every gap between those is enough. */
export const runsInBand = (
  top: { x: number; y: number }[],
  bottom: { x: number; y: number }[],
  lengthMm: number,
  lo: number,
  hi: number,
): Run[] => {
  const xs = new Set<number>([0, lengthMm])
  for (const p of [...top, ...bottom]) xs.add(p.x)
  for (const x of crossings(top, lo + SLIVER_MM)) xs.add(x)
  for (const x of crossings(bottom, hi - SLIVER_MM)) xs.add(x)
  const sorted = [...xs].filter((x) => x >= 0 && x <= lengthMm).sort((a, b) => a - b)

  const runs: Run[] = []
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    if (b - a < 1e-6) continue
    const mid = (a + b) / 2
    const inside = valueAt(top, mid) > lo + SLIVER_MM && valueAt(bottom, mid) < hi - SLIVER_MM
    if (!inside) continue
    const last = runs[runs.length - 1]
    if (last && Math.abs(last.end - a) < 1e-6) last.end = b
    else runs.push({ start: a, end: b })
  }
  return runs.filter((r) => r.end - r.start > SLIVER_MM)
}

/** Shoelace area of the wall outline, clipped to top-above-bottom. */
const wallAreaM2 = (top: { x: number; y: number }[], bottom: { x: number; y: number }[]): number => {
  const xs = [...new Set([...top.map((p) => p.x), ...bottom.map((p) => p.x)])].sort((a, b) => a - b)
  let area = 0
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1]
    const b = xs[i]
    // heights are linear on [a,b]; split where they cross so negative
    // stretches (bottom above top) clip to zero
    const ha = valueAt(top, a) - valueAt(bottom, a)
    const hb = valueAt(top, b) - valueAt(bottom, b)
    if (ha >= 0 && hb >= 0) area += ((ha + hb) / 2) * (b - a)
    else if (ha > 0 || hb > 0) {
      const t = ha / (ha - hb)
      const w = ha > 0 ? t * (b - a) : (1 - t) * (b - a)
      area += (Math.max(ha, hb) / 2) * w
    }
  }
  return area / 1e6
}

/** Smallest stock length that fits `cut`, or null if none does. */
export const smallestFit = (cut: number, stock: number[]): number | null => {
  let best: number | null = null
  for (const s of stock) if (s >= cut && (best === null || s < best)) best = s
  return best
}

/** Splits one run into pieces no longer than the longest board, with
 * every join on a stud. In priority order it minimises the number of
 * joins, then maximises how much of the run is covered by whole,
 * uncut stock boards, then minimises unusable offcut — so an 8.4 m run
 * becomes 4.2 + 4.2 and a 7.2 m run 6.0 + 1.2, the short make-up piece
 * coming out of some other board's offcut in the cutting plan.
 * Joins on `avoid` studs (the course below's) are only used if there's
 * no other way to split the run. */
const splitRun = (run: Run, studs: number[], avoid: Set<number>, s: WeatherboardSettings): CoursePiece[] => {
  const maxStock = Math.max(...s.stockLengthsMm)
  const allow = s.cutAllowanceMm
  const piece = (start: number, end: number): CoursePiece => ({ start, end, cutLength: end - start + allow })
  if (run.end - run.start + allow <= maxStock) return [piece(run.start, run.end)]

  // keep joins at least one stud bay in from either end of the run so
  // neither end piece is an unfixable stub
  const minPiece = Math.min(s.studSpacingMm, maxStock / 2)
  const attempt = (useAvoided: boolean): CoursePiece[] | null => {
    const joins = studs.filter(
      (x) => x > run.start + minPiece - 1e-6 && x < run.end - minPiece + 1e-6 && (useAvoided || !avoid.has(x)),
    )
    const pts = [run.start, ...joins, run.end]
    const cost: number[] = pts.map(() => Infinity)
    const prev: number[] = pts.map(() => -1)
    cost[0] = 0
    for (let i = 0; i < pts.length; i++) {
      if (cost[i] === Infinity) continue
      for (let j = i + 1; j < pts.length; j++) {
        const cut = pts[j] - pts[i] + allow
        if (cut > maxStock) break
        const offcut = (smallestFit(cut, s.stockLengthsMm) ?? maxStock) - cut
        const full = offcut <= FULL_BOARD_TOLERANCE_MM
        // tiers: 1e10 per piece dwarfs everything, so fewer joins always
        // wins; then each mm of run on a whole board is worth more than any
        // offcut; an offcut long enough to yield another piece is mostly
        // recovered by the cutting optimiser, so only a short one counts in full
        const c =
          cost[i] + 1e10 - (full ? cut * 1e4 : 0) + (full ? 0 : offcut < USEFUL_OFFCUT_MM ? offcut : offcut * 0.1)
        if (c < cost[j]) {
          cost[j] = c
          prev[j] = i
        }
      }
    }
    const last = pts.length - 1
    if (cost[last] === Infinity) return null
    const pieces: CoursePiece[] = []
    for (let j = last; j > 0; j = prev[j]) pieces.unshift(piece(pts[prev[j]], pts[j]))
    return pieces
  }

  const pieces = attempt(false) ?? attempt(true)
  if (pieces) return pieces

  // studs too far apart to ever land a join (or none at all) — fall back
  // to full-length boards butted wherever they run out
  const out: CoursePiece[] = []
  for (let x = run.start; x < run.end - 1e-6; x += maxStock - allow) {
    out.push(piece(x, Math.min(run.end, x + maxStock - allow)))
  }
  return out
}

/** Cuts the openings that span the whole band [lo, hi] out of its runs.
 * Boards run under the facings right to the opening's edge, so the
 * facings never shorten them. */
const subtractOpenings = (runs: Run[], openings: Opening[], lo: number, hi: number): Run[] => {
  let out = runs
  for (const o of openings) {
    if (o.width <= 0 || o.sill > lo + SLIVER_MM || o.sill + o.height < hi - SLIVER_MM) continue
    const a = o.x
    const b = o.x + o.width
    out = out.flatMap((r) => {
      if (b <= r.start || a >= r.end) return [r]
      const parts: Run[] = []
      if (a > r.start) parts.push({ start: r.start, end: a })
      if (b < r.end) parts.push({ start: b, end: r.end })
      return parts
    })
  }
  return out.filter((r) => r.end - r.start > SLIVER_MM)
}

/** Splits runs wherever a corner falls inside them — boards stop at a corner. */
const splitAtCorners = (runs: Run[], corners: WallCorner[]): Run[] => {
  const xs = corners.map((c) => c.x).sort((a, b) => a - b)
  return runs.flatMap((r) => {
    const cuts = xs.filter((x) => x > r.start + SLIVER_MM && x < r.end - SLIVER_MM)
    const pts = [r.start, ...cuts, r.end]
    return pts.slice(1).map((end, i) => ({ start: pts[i], end }))
  })
}

export const calculateWall = (wall: Wall, s: WeatherboardSettings): WallResult => {
  const coverMm = Math.max(10, wall.coverMm ?? s.coverMm)
  const L = Math.max(0, wall.lengthMm)
  // projects saved before openings existed have none
  const openings = wall.openings ?? []
  const skips = wall.skips ?? []
  const top = edgePoints(wall.top, L)
  const bottom = edgePoints(wall.bottom, L)
  const minY = Math.min(...bottom.map((p) => p.y))
  const maxY = Math.max(...top.map((p) => p.y))

  // each stretch between corners is framed (and so joined) from its own start
  const corners = (wall.corners ?? []).filter((c) => c.x > 0 && c.x < L)
  const bounds = [0, ...corners.map((c) => c.x).sort((a, b) => a - b), L]
  const studs: number[] = []
  if (s.studSpacingMm > 0)
    for (let i = 1; i < bounds.length; i++)
      for (let x = bounds[i - 1] + s.studSpacingMm; x < bounds[i] - 1e-6; x += s.studSpacingMm) studs.push(x)

  const courses: Course[] = []
  if (L > 0 && maxY > minY && s.stockLengthsMm.length > 0) {
    const count = Math.ceil((maxY - minY - SLIVER_MM) / coverMm)
    let below = new Set<number>()
    for (let i = 0; i < count; i++) {
      const lo = minY + i * coverMm
      const hi = lo + coverMm
      const runs = splitAtCorners(subtractOpenings(runsInBand(top, bottom, L, lo, hi), openings, lo, hi), corners)
      const pieces = runs.flatMap((r) => splitRun(r, studs, below, s))
      for (const p of pieces)
        if (skips.some((k) => k.y >= lo && k.y < hi && k.x >= p.start && k.x <= p.end)) p.skipped = true
      const joins: number[] = []
      for (const r of runs) {
        for (const p of pieces) if (p.end < r.end - 1e-6 && p.end > r.start) joins.push(p.end)
      }
      courses.push({ index: i + 1, bottom: lo, top: hi, runs, pieces, joins })
      below = new Set(joins)
    }
  }

  const areaM2 = wallAreaM2(top, bottom)
  const openingM2 = openings.reduce((sum, o) => {
    const w = Math.max(0, Math.min(L, o.x + o.width) - Math.max(0, o.x))
    const h = Math.max(0, Math.min(maxY, o.sill + o.height) - Math.max(minY, o.sill))
    return sum + (w * h) / 1e6
  }, 0)

  return { wall, coverMm, minY, maxY, areaM2, netAreaM2: Math.max(0, areaM2 - openingM2), courses, studs }
}

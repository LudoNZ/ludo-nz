/** Plan-view (top-down) geometry for a retaining wall: the wall is an open
 * polyline of straight runs ("walls" A, B, C…) joined at corners. Pure
 * geometry only — post layout along each run lives in postProfile.ts,
 * which only ever needs the run lengths from here, since a wall unfolds
 * flat into its elevation regardless of how it turns in plan. */

/** A plan vertex, in metres. Screen-style axes: x to the right, y *down*,
 * so a point can go straight into an SVG without flipping. */
export interface PlanPoint {
  xM: number
  yM: number
}

/** Which side of the wall the retained ground is on, relative to walking
 * the wall from its first point to its last. */
export type RetainedSide = "left" | "right"

const round3 = (n: number) => Math.round(n * 1000) / 1000
const roundPoint = (p: PlanPoint): PlanPoint => ({ xM: round3(p.xM), yM: round3(p.yM) })

export const straightPlan = (lengthM: number): PlanPoint[] => [
  { xM: 0, yM: 0 },
  { xM: round3(lengthM), yM: 0 },
]

export const segmentLengths = (points: PlanPoint[]): number[] =>
  points.slice(1).map((p, i) => Math.hypot(p.xM - points[i].xM, p.yM - points[i].yM))

export const totalLength = (points: PlanPoint[]): number => segmentLengths(points).reduce((sum, l) => sum + l, 0)

/** A, B, … Z, then A2, B2, … */
export const segmentLabel = (index: number): string => {
  const letter = String.fromCharCode(65 + (index % 26))
  const lap = Math.floor(index / 26)
  return lap === 0 ? letter : `${letter}${lap + 1}`
}

/** Heading of the run from a to b in degrees, anticlockwise-positive as
 * seen on screen (0 = right, 90 = up). */
const headingDeg = (a: PlanPoint, b: PlanPoint): number => (Math.atan2(-(b.yM - a.yM), b.xM - a.xM) * 180) / Math.PI

/** How far the wall turns at interior vertex `vertexIndex`, in degrees:
 * positive = turns left (anticlockwise on screen), negative = right, 0 =
 * carries straight on. Normalised to (-180, 180]. */
export const turnDeg = (points: PlanPoint[], vertexIndex: number): number => {
  const before = headingDeg(points[vertexIndex - 1], points[vertexIndex])
  const after = headingDeg(points[vertexIndex], points[vertexIndex + 1])
  let turn = after - before
  while (turn > 180) turn -= 360
  while (turn <= -180) turn += 360
  return turn
}

/** Sets one run's length, keeping its direction — everything after it
 * shifts along with its end point, so later runs keep their own lengths
 * and angles. */
/** the longest one run of wall can be, m */
export const MAX_SEGMENT_M = 100

export const setSegmentLength = (points: PlanPoint[], segmentIndex: number, lengthM: number): PlanPoint[] => {
  lengthM = Math.min(MAX_SEGMENT_M, lengthM)
  const a = points[segmentIndex]
  const b = points[segmentIndex + 1]
  const current = Math.hypot(b.xM - a.xM, b.yM - a.yM)
  if (!(current > 0) || !(lengthM > 0)) return points
  const k = lengthM / current - 1
  const dx = (b.xM - a.xM) * k
  const dy = (b.yM - a.yM) * k
  return points.map((p, i) => (i > segmentIndex ? roundPoint({ xM: p.xM + dx, yM: p.yM + dy }) : p))
}

/** Sets the turn at an interior vertex by swinging everything after it
 * around that vertex — every run keeps its length, and every later
 * corner keeps its own angle. */
export const setTurn = (points: PlanPoint[], vertexIndex: number, deg: number): PlanPoint[] => {
  const delta = ((deg - turnDeg(points, vertexIndex)) * Math.PI) / 180
  const pivot = points[vertexIndex]
  const cos = Math.cos(delta)
  const sin = Math.sin(delta)
  return points.map((p, i) => {
    if (i <= vertexIndex) return p
    const x = p.xM - pivot.xM
    const y = p.yM - pivot.yM
    // anticlockwise on screen, where y points down
    return roundPoint({ xM: pivot.xM + x * cos + y * sin, yM: pivot.yM - x * sin + y * cos })
  })
}

/** Splits a run in two with a new corner at its midpoint (still in line,
 * until it's dragged or given a turn). */
export const insertCorner = (points: PlanPoint[], segmentIndex: number): PlanPoint[] => {
  const a = points[segmentIndex]
  const b = points[segmentIndex + 1]
  const mid = roundPoint({ xM: (a.xM + b.xM) / 2, yM: (a.yM + b.yM) / 2 })
  return [...points.slice(0, segmentIndex + 1), mid, ...points.slice(segmentIndex + 1)]
}

export const removeCorner = (points: PlanPoint[], vertexIndex: number): PlanPoint[] =>
  points.length <= 2 ? points : points.filter((_, i) => i !== vertexIndex)

/** Which way a new run added at one end should turn: opposite to the
 * corner next to that end, so adding runs again and again zigzags out
 * (left, right, left…) instead of folding back in on itself. With no
 * corner there yet, it turns toward the retained ground (a return into
 * the bank — the usual reason to turn). `neighbourTurn` is that corner's
 * turnDeg, or null if the wall has none. Both ends use the same sense:
 * "left" turns left walking the wall from A onward. */
const nextTurnSide = (neighbourTurn: number | null, retainedSide: RetainedSide): RetainedSide =>
  neighbourTurn === null || Math.abs(neighbourTurn) < 0.05 ? retainedSide : neighbourTurn > 0 ? "right" : "left"

/** Adds a new run onto the end of the wall, square to the last one. */
export const appendSegment = (points: PlanPoint[], retainedSide: RetainedSide, lengthM: number): PlanPoint[] => {
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  const len = Math.hypot(b.xM - a.xM, b.yM - a.yM)
  if (!(len > 0)) return points
  const side = nextTurnSide(points.length > 2 ? turnDeg(points, points.length - 2) : null, retainedSide)
  const n = sideNormal(a, b, side)
  return [...points, roundPoint({ xM: b.xM + n.xM * lengthM, yM: b.yM + n.yM * lengthM })]
}

/** Adds a new run before the start of the wall (it becomes wall A and the
 * others move up a letter), square to the first one. */
export const prependSegment = (points: PlanPoint[], retainedSide: RetainedSide, lengthM: number): PlanPoint[] => {
  const a = points[0]
  const b = points[1]
  const len = Math.hypot(b.xM - a.xM, b.yM - a.yM)
  if (!(len > 0)) return points
  const side = nextTurnSide(points.length > 2 ? turnDeg(points, 1) : null, retainedSide)
  // placed on that side of A, the new run then turns that way into the old wall A
  const n = sideNormal(a, b, side)
  return [roundPoint({ xM: a.xM + n.xM * lengthM, yM: a.yM + n.yM * lengthM }), ...points]
}

/** Unit normal of run a→b pointing to the given side of travel. */
export const sideNormal = (a: PlanPoint, b: PlanPoint, side: RetainedSide): PlanPoint => {
  const len = Math.hypot(b.xM - a.xM, b.yM - a.yM) || 1
  const dx = (b.xM - a.xM) / len
  const dy = (b.yM - a.yM) / len
  // travelling right on screen (1, 0), "left" is up: (0, -1)
  return side === "left" ? { xM: dy, yM: -dx } : { xM: -dy, yM: dx }
}

/** Plan position of the point `distanceM` along the unfolded wall. */
export const pointAtDistance = (points: PlanPoint[], distanceM: number): PlanPoint => {
  let remaining = distanceM
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const len = Math.hypot(b.xM - a.xM, b.yM - a.yM)
    if (remaining <= len + 1e-6 || i === points.length - 2) {
      const t = len > 0 ? Math.min(1, Math.max(0, remaining / len)) : 0
      return { xM: a.xM + (b.xM - a.xM) * t, yM: a.yM + (b.yM - a.yM) * t }
    }
    remaining -= len
  }
  return points[points.length - 1]
}

/** The wall line pushed sideways by `distanceM` toward `side`, mitred at
 * corners (capped, so a very sharp corner doesn't spike off to infinity). */
export const offsetPolyline = (points: PlanPoint[], side: RetainedSide, distanceM: number): PlanPoint[] =>
  points.map((p, i) => {
    const nPrev = i > 0 ? sideNormal(points[i - 1], p, side) : null
    const nNext = i < points.length - 1 ? sideNormal(p, points[i + 1], side) : null
    const a = nPrev ?? nNext!
    const b = nNext ?? nPrev!
    let mx = a.xM + b.xM
    let my = a.yM + b.yM
    const mLen = Math.hypot(mx, my)
    if (mLen < 1e-6) return { xM: p.xM + a.xM * distanceM, yM: p.yM + a.yM * distanceM }
    mx /= mLen
    my /= mLen
    const cosHalf = Math.max(mx * a.xM + my * a.yM, 0.6)
    return { xM: p.xM + (mx * distanceM) / cosHalf, yM: p.yM + (my * distanceM) / cosHalf }
  })

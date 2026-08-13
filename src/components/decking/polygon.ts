/** Shape-agnostic polygon math for the deck's outline, once it's more than
 * the classic 4-corner right-trapezoid (see types.ts's `points` field on
 * DeckConfig) — mirrors postRailCalc.ts's "no knowledge of what's being
 * built" reasoning: these functions know nothing about joists or boards,
 * just plain 2D geometry. Points are ordered around the polygon (either
 * winding direction works, every function here is winding-agnostic). */

export interface DeckPoint {
  x: number
  y: number
}

export function polygonBounds(points: DeckPoint[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

/** Every point where the polygon's boundary crosses the line `coord =
 * value` (a horizontal scanline for coord="y", vertical for coord="x"),
 * returning the *other* coordinate at each crossing. Half-open interval
 * convention (`a <= value && b > value`, or the reverse) so a scanline
 * passing exactly through a shared vertex is counted once, not twice. */
function crossingsAt(points: DeckPoint[], value: number, coord: "x" | "y"): number[] {
  const other: "x" | "y" = coord === "y" ? "x" : "y"
  const crossings: number[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const a1 = a[coord]
    const b1 = b[coord]
    if ((a1 <= value && b1 > value) || (b1 <= value && a1 > value)) {
      const t = (value - a1) / (b1 - a1)
      crossings.push(a[other] + t * (b[other] - a[other]))
    }
  }
  return crossings
}

/** The polygon's x-interval at a given y (null if the scanline misses the
 * polygon entirely — outside its y-range). For a simple polygon this is
 * almost always exactly one entry and one exit crossing; a non-convex
 * shape can produce more, in which case min/max of *every* crossing is a
 * conservative over-cover (the row spans any gap too) rather than true
 * multi-segment support — an accepted simplification for a single-
 * board-direction deck, not a bug. */
export function polygonSpanAtY(points: DeckPoint[], y: number): { xMin: number; xMax: number } | null {
  const xs = crossingsAt(points, y, "y")
  if (!xs.length) return null
  return { xMin: Math.min(...xs), xMax: Math.max(...xs) }
}

/** Mirror of polygonSpanAtY for the other board-run direction. */
export function polygonSpanAtX(points: DeckPoint[], x: number): { yMin: number; yMax: number } | null {
  const ys = crossingsAt(points, x, "x")
  if (!ys.length) return null
  return { yMin: Math.min(...ys), yMax: Math.max(...ys) }
}

/** SVG path `d` for the closed polygon outline — the one place this is
 * ever built, unlike the legacy trapezoid's hand-duplicated path string
 * in deckPlanView.tsx and deckShapeEditor.tsx. */
export function polygonOutlinePath(points: DeckPoint[]): string {
  if (!points.length) return ""
  const [first, ...rest] = points
  return `M${first.x},${first.y} ${rest.map((p) => `L${p.x},${p.y}`).join(" ")} Z`
}

const cross = (a: DeckPoint, b: DeckPoint, c: DeckPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

function segmentsIntersect(p1: DeckPoint, p2: DeckPoint, p3: DeckPoint, p4: DeckPoint): boolean {
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** False if any two non-adjacent edges cross — a self-intersecting
 * outline would otherwise silently feed nonsense row spans into the
 * scanline functions above rather than failing loudly. O(n²) edge-pair
 * check; fine at the vertex counts a deck outline actually has. */
export function isSimplePolygon(points: DeckPoint[]): boolean {
  const n = points.length
  if (n < 3) return false
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (adjacent) continue
      if (segmentsIntersect(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return false
    }
  }
  return true
}

/** "+ Add corner": always splits the longest edge, so there's no separate
 * "which edge?" decision to make — the new point can be dragged wherever
 * it's actually needed once it exists. */
export function insertMidpointOnLongestEdge(points: DeckPoint[]): DeckPoint[] {
  const n = points.length
  let longestIndex = 0
  let longestLen = -1
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > longestLen) {
      longestLen = len
      longestIndex = i
    }
  }
  const a = points[longestIndex]
  const b = points[(longestIndex + 1) % n]
  const mid: DeckPoint = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }
  const next = [...points]
  next.splice(longestIndex + 1, 0, mid)
  return next
}

/** Removes one corner — a no-op below 3 points, since a polygon can't
 * have fewer than that. */
export function removePoint(points: DeckPoint[], index: number): DeckPoint[] {
  if (points.length <= 3) return points
  return points.filter((_, i) => i !== index)
}

// ---- constrained editing: lock a side's length or a corner's angle,
// everything else recalculates to fit — see solvePolygon below ----

/** Sign of the shoelace sum — an opaque but self-consistent "which way
 * does this polygon wind" value, used only to keep interiorAngleDeg and
 * solvePolygon's turn application as exact inverses of each other. Not
 * meant to be read as "clockwise" or "counter-clockwise" by callers. */
export function polygonWinding(points: DeckPoint[]): 1 | -1 {
  let sum = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    sum += (b.x - a.x) * (b.y + a.y)
  }
  return sum >= 0 ? 1 : -1
}

/** Signed turn, in degrees (-180..180], from the direction of the edge
 * arriving at this vertex to the direction of the edge leaving it. */
function turnAngleDeg(points: DeckPoint[], index: number): number {
  const n = points.length
  const prev = points[(index - 1 + n) % n]
  const curr = points[index]
  const next = points[(index + 1) % n]
  const dirIn = Math.atan2(curr.y - prev.y, curr.x - prev.x)
  const dirOut = Math.atan2(next.y - curr.y, next.x - curr.x)
  let turn = ((dirOut - dirIn) * 180) / Math.PI
  while (turn > 180) turn -= 360
  while (turn <= -180) turn += 360
  return turn
}

/** The interior angle at one corner, in degrees — 90 at every corner of a
 * rectangle, under 180 for a normal ("convex") corner, over 180 for a
 * corner that's been pulled in past straight ("reflex"/concave). Winding-
 * aware so it reads as the actual inside angle regardless of which way
 * the points happen to be ordered. */
export function interiorAngleDeg(points: DeckPoint[], index: number): number {
  return 180 + turnAngleDeg(points, index) * polygonWinding(points)
}

/** Uniformly scales every point toward/away from `anchor` by `factor` —
 * the "first lock" special case: with nothing else constrained yet,
 * setting one side's length just resizes the whole shape, preserving its
 * proportions exactly rather than distorting it. */
export function scaleAroundPoint(points: DeckPoint[], anchor: DeckPoint, factor: number): DeckPoint[] {
  return points.map((p) => ({
    x: Math.round(anchor.x + (p.x - anchor.x) * factor),
    y: Math.round(anchor.y + (p.y - anchor.y) * factor),
  }))
}

/** Every edge that could currently serve as "the" automatic one (see
 * solvePolygon) — unlocked itself, and neither of its two corners has a
 * locked angle either, since an automatic edge's own two corners can't be
 * independently angled (same reason its length can't be independently
 * set). At least one always exists as long as nothing's over-constrained
 * — polygonShapeEditor.tsx is responsible for never offering a lock that
 * would empty this list (see its edgeForcedAuto/vertexForcedAuto). */
export function candidateAutoEdges(
  n: number,
  lockedEdgeLengths: Record<string, number>,
  lockedVertexAngles: Record<string, number>
): number[] {
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    if (lockedEdgeLengths[String(i)] !== undefined) continue
    if (lockedVertexAngles[String(i)] !== undefined) continue
    if (lockedVertexAngles[String((i + 1) % n)] !== undefined) continue
    indices.push(i)
  }
  return indices
}

/** Recomputes the polygon from a set of locked side lengths/corner angles
 * (keyed by index as a string, same as manualJoins elsewhere in this
 * app) — every unlocked side/angle just keeps its current value, so only
 * what's actually downstream of a lock moves.
 *
 * `autoEdgeIndex` is the one edge treated as the implicit "closer" —
 * never read from lockedEdgeLengths, and its own two corners are never
 * read from lockedVertexAngles either (see candidateAutoEdges above).
 * Walks the perimeter starting at that edge's *far* corner (`autoEdgeIndex
 * + 1`, which never moves) along that corner's outgoing edge's *current*
 * world direction (also preserved, so unrelated edits don't spontaneously
 * rotate the shape): each edge uses its locked length if set, else its
 * current length; the turn at each corner uses its locked angle if set,
 * else its current angle.
 *
 * A closed shape can't have every side and every angle independently
 * fixed at once (same reason a triangle's three angles always sum to
 * 180°); leaving exactly one side (and, as a consequence, its two end
 * corners) to always close the loop this way means the walk is always
 * well-defined — no solver, no iteration, no possible failure to
 * converge. Which side that is can move around freely (any edge, chosen
 * by the caller) — it's only ever *one* at a time that has to give. */
export function solvePolygon(
  points: DeckPoint[],
  lockedEdgeLengths: Record<string, number>,
  lockedVertexAngles: Record<string, number>,
  autoEdgeIndex: number
): DeckPoint[] {
  const n = points.length
  if (n < 3) return points
  const winding = polygonWinding(points)

  const currentEdgeLength = (i: number) => {
    const a = points[i]
    const b = points[(i + 1) % n]
    return Math.hypot(b.x - a.x, b.y - a.y)
  }

  const anchorIndex = (autoEdgeIndex + 1) % n
  const result: DeckPoint[] = new Array(n)
  result[anchorIndex] = points[anchorIndex]

  const anchorNext = points[(anchorIndex + 1) % n]
  let dir = Math.atan2(anchorNext.y - points[anchorIndex].y, anchorNext.x - points[anchorIndex].x)
  let prevPoint = points[anchorIndex]

  for (let step = 0; step < n - 1; step++) {
    const edgeIndex = (anchorIndex + step) % n
    const length = lockedEdgeLengths[String(edgeIndex)] ?? currentEdgeLength(edgeIndex)
    const nextIndex = (edgeIndex + 1) % n
    const nextPoint = {
      x: Math.round(prevPoint.x + length * Math.cos(dir)),
      y: Math.round(prevPoint.y + length * Math.sin(dir)),
    }
    result[nextIndex] = nextPoint

    if (step < n - 2) {
      const lockedAngle = lockedVertexAngles[String(nextIndex)]
      const turn = lockedAngle !== undefined ? (lockedAngle - 180) * winding : turnAngleDeg(points, nextIndex)
      dir += (turn * Math.PI) / 180
    }

    prevPoint = nextPoint
  }

  return result
}

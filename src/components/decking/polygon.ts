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

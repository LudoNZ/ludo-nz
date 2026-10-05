/** The "+ Add wall" quick form's model, and automatic window layout.
 * Pure, no React.
 *
 * Openings flagged `auto` were placed by the layout here and are fair
 * game to re-space; anything the user has dragged or typed numbers into
 * has `auto` cleared and is never moved again — new auto windows fit
 * into the space left around it. */

import { newId } from "./data"
import { Opening, QuickShape, Wall, WallEdge } from "./types"
import { edgePoints } from "./weatherboardCalc"

export type { QuickShape }

export const QUICK_SHAPE_LABELS: Record<QuickShape, string> = {
  rectangle: "Rectangle",
  gable: "Gable end",
  skillion: "Skillion",
  partRake: "Rake part way",
}

export interface QuickWallForm {
  shape: QuickShape
  name: string
  widthMm: number
  heightMm: number
  /** gable: ridge height */
  ridgeMm: number
  /** skillion / part rake: the high (right-hand) end */
  highMm: number
  /** part rake: where the rake starts, from the left end */
  rakeStartMm: number
  windows: number
  windowWidthMm: number
  windowHeightMm: number
  /** window head height above datum */
  headMm: number
  /** Dimensions this wall will be linked to (anchor measure keys); a
   * linked field shows — and the wall is built with — the anchor's value. */
  links: QuickLinks
  /** a measurement has been changed — the shape is settled, picker hidden */
  shapeLocked: boolean
}

export type QuickLinkField = "width" | "height" | "ridge"
export type QuickLinks = Partial<Record<QuickLinkField, string>>

const PITCH_DEG = 25
const rise = (run: number, deg = PITCH_DEG) => Math.round((run * Math.tan((deg * Math.PI) / 180)) / 10) * 10

/** Shape-dependent fields re-derived from width and height — used when a
 * shape is picked, so its extra heights start out sensible. */
export const shapeDefaults = (f: QuickWallForm, shape: QuickShape): QuickWallForm => ({
  ...f,
  shape,
  ridgeMm: f.heightMm + rise(f.widthMm / 2),
  highMm: shape === "skillion" ? f.heightMm + rise(f.widthMm, 10) : f.heightMm + rise(f.widthMm / 2),
  rakeStartMm: Math.round(f.widthMm / 2 / 100) * 100,
})

export const defaultQuickForm = (name: string): QuickWallForm =>
  shapeDefaults(
    {
      shape: "rectangle",
      name,
      widthMm: 4800,
      heightMm: 2400,
      ridgeMm: 0,
      highMm: 0,
      rakeStartMm: 0,
      windows: 1,
      windowWidthMm: 1200,
      windowHeightMm: 1200,
      headMm: 2100,
      links: {},
      shapeLocked: false,
    },
    "rectangle",
  )

const flat = (y: number): WallEdge => ({ left: y, right: y, breaks: [] })

const topEdge = (f: QuickWallForm): WallEdge => {
  const W = f.widthMm
  switch (f.shape) {
    case "gable":
      return { left: f.heightMm, right: f.heightMm, breaks: [{ id: newId(), x: Math.round(W / 2), y: f.ridgeMm }] }
    case "skillion":
      return { left: f.heightMm, right: f.highMm, breaks: [] }
    case "partRake":
      return {
        left: f.heightMm,
        right: f.highMm,
        breaks: [{ id: newId(), x: Math.min(Math.max(f.rakeStartMm, 1), W - 1), y: f.heightMm }],
      }
    default:
      return flat(f.heightMm)
  }
}

export const buildQuickWall = (f: QuickWallForm, id: string): Wall => {
  const wall: Wall = {
    id,
    name: f.name,
    lengthMm: Math.max(0, f.widthMm),
    top: topEdge(f),
    bottom: flat(0),
    openings: [],
    leftEnd: "externalFacing",
    rightEnd: "externalFacing",
    coverMm: null,
  }
  return {
    ...wall,
    openings: layoutOpenings(wall, f.windows, {
      width: f.windowWidthMm,
      height: f.windowHeightMm,
      head: f.headMm,
    }),
  }
}

export interface WindowTemplate {
  width: number
  height: number
  head: number
}

export const DEFAULT_WINDOW: WindowTemplate = { width: 1200, height: 1200, head: 2100 }

/** Keep auto windows this far from wall ends and from each other's edges. */
const EDGE_GAP_MM = 300
const SNAP = 10
const snap = (v: number) => Math.round(v / SNAP) * SNAP

const lowest = (pts: { x: number; y: number }[], a: number, b: number) => {
  // lowest point of a piecewise-linear edge over [a, b]: its vertices
  // inside the span plus the two ends
  let min = Infinity
  const at = (x: number) => {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]
      const q = pts[i]
      if (x <= q.x) return q.x === p.x ? q.y : p.y + ((q.y - p.y) * (x - p.x)) / (q.x - p.x)
    }
    return pts[pts.length - 1].y
  }
  for (const x of [a, b, ...pts.filter((p) => p.x > a && p.x < b).map((p) => p.x)]) min = Math.min(min, at(x))
  return min
}
const highest = (pts: { x: number; y: number }[], a: number, b: number) =>
  -lowest(
    pts.map((p) => ({ x: p.x, y: -p.y })),
    a,
    b,
  )

/** Sets `count` openings on the wall. Pinned (non-auto) openings stay put;
 * auto ones are (re)spread evenly through the free space around them.
 * Lowering the count drops auto windows first, newest last-in-first-out. */
export const layoutOpenings = (wall: Wall, count: number, template: WindowTemplate = DEFAULT_WINDOW): Opening[] => {
  const L = wall.lengthMm
  const existing = wall.openings ?? []
  let pinned = existing.filter((o) => !o.auto)
  let autos = existing.filter((o) => o.auto)
  const target = Math.max(0, Math.floor(count))

  while (pinned.length + autos.length > target && autos.length > 0) autos = autos.slice(0, -1)
  while (pinned.length > target) pinned = pinned.slice(0, -1)
  const nAuto = target - pinned.length
  if (nAuto === 0 || L <= 0) return [...pinned, ...autos.slice(0, nAuto)]

  // reuse existing auto ids left to right so React keeps their elements
  autos = [...autos].sort((a, b) => a.x - b.x)

  // auto windows share one size: the existing autos' if any, else the template
  const size = autos[0] ? { width: autos[0].width, height: autos[0].height } : template
  const w = Math.max(100, size.width)

  // free stretches of wall between the ends and the pinned openings
  // windows keep clear of pinned windows and of corners
  const blocked = [
    ...pinned.map((o) => [o.x - EDGE_GAP_MM, o.x + o.width + EDGE_GAP_MM] as const),
    ...(wall.corners ?? []).map((c) => [c.x - EDGE_GAP_MM, c.x + EDGE_GAP_MM] as const),
  ].sort((a, b) => a[0] - b[0])
  const free: [number, number][] = []
  let cursor = EDGE_GAP_MM
  for (const [a, b] of blocked) {
    if (a > cursor) free.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (L - EDGE_GAP_MM > cursor) free.push([cursor, L - EDGE_GAP_MM])
  if (free.length === 0) free.push([0, L]) // no room left — overlap rather than vanish

  // share the windows out by how many each stretch can hold, then by length
  const cap = free.map(([a, b]) => Math.max(0, Math.floor((b - a + EDGE_GAP_MM) / (w + EDGE_GAP_MM))))
  const shares = free.map(() => 0)
  for (let i = 0; i < nAuto; i++) {
    let best = 0
    let bestScore = -Infinity
    free.forEach(([a, b], j) => {
      const fits = shares[j] < cap[j]
      // prefer stretches that still fit one more, then the roomiest per window
      const score = (fits ? 1e9 : 0) + (b - a) / (shares[j] + 1)
      if (score > bestScore) {
        bestScore = score
        best = j
      }
    })
    shares[best]++
  }

  const top = edgePoints(wall.top, L)
  const bottom = edgePoints(wall.bottom, L)
  const xs: number[] = []
  free.forEach(([a, b], j) => {
    const k = shares[j]
    if (k === 0) return
    const gap = (b - a - k * w) / (k + 1)
    for (let i = 0; i < k; i++) xs.push(a + gap + i * (w + gap))
  })
  xs.sort((a, b) => a - b)

  const placed: Opening[] = xs.map((x0, i) => {
    const x = snap(Math.max(0, Math.min(x0, L - w)))
    // keep the head under the lowest bit of top edge over the window, and
    // the sill clear of the highest bit of the bottom edge
    const roof = lowest(top, x, x + w) - 150
    const floor = highest(bottom, x, x + w) + 300
    const head = Math.min(template.head, roof)
    const height = Math.max(200, Math.min(size.height, head - floor))
    const prev = autos[i]
    return { id: prev?.id ?? newId(), x, sill: snap(head - height), width: w, height: snap(height), auto: true }
  })
  return [...pinned, ...placed]
}

/** Re-spreads a wall's auto windows after its shape or length changed. */
export const relayoutAutoOpenings = (wall: Wall): Wall =>
  (wall.openings ?? []).some((o) => o.auto)
    ? { ...wall, openings: layoutOpenings(wall, (wall.openings ?? []).length, templateFrom(wall)) }
    : wall

const templateFrom = (wall: Wall): WindowTemplate => {
  const a = (wall.openings ?? []).find((o) => o.auto)
  return a ? { width: a.width, height: a.height, head: a.sill + a.height } : DEFAULT_WINDOW
}

export const setWindowCount = (wall: Wall, count: number): Wall => ({
  ...wall,
  openings: layoutOpenings(wall, count, templateFrom(wall)),
})

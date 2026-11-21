/** The house's grid: lines every `stepMm` (0.5 m to start) each way, any
 * of which can be moved to where a wall should go — the project's own
 * setting-out lines. The outside walls snap to them; inside walls and rooms
 * snap to them when they're near. Moving a line carries whatever's on it
 * along (corners, walls, room edges, on every storey). mm, y down. Pure. */

import { simplify } from "./floorPlan"
import type { FloorPlan, Pt } from "./houseTypes"

/** a crossing of two gridlines, by their keys — it goes where they go */
export interface GridPoint {
  x: string
  y: string
}

/** a measurement drawn between two grid points */
export interface GridDim {
  id: string
  a: GridPoint
  b: GridPoint
}

export interface ProjectGrid {
  stepMm: number
  /** a moved line, by its key ("x:7" — the 7th line along), to where it is now */
  moved: Record<string, number>
  /** the crossing everything's measured from (0,0); the plan's own 0,0 if unset */
  origin?: GridPoint
  /** measurements drawn on the plan */
  dims?: GridDim[]
}

export const DEFAULT_GRID: ProjectGrid = { stepMm: 500, moved: {} }

/** where a gridline is now, by its key */
export const lineAt = (grid: ProjectGrid, key: string) => grid.moved[key] ?? Number(key.split(":")[1]) * Math.max(50, grid.stepMm)
/** where a gridline would be unmoved */
export const lineHome = (grid: ProjectGrid, key: string) => Number(key.split(":")[1]) * Math.max(50, grid.stepMm)
/** where a grid point is now, on plan */
export const gridPointAt = (grid: ProjectGrid, p: GridPoint): Pt => ({ x: lineAt(grid, p.x), y: lineAt(grid, p.y) })
/** the 0,0 everything's measured from, on plan */
export const gridOrigin = (grid: ProjectGrid): Pt => gridPointAt(grid, grid.origin ?? { x: "x:0", y: "y:0" })

/** whatever storage held, made a grid */
export function gridFromData(d: unknown): ProjectGrid {
  const o = (d && typeof d === "object" ? d : {}) as Partial<ProjectGrid>
  if (typeof o.stepMm !== "number") return { ...DEFAULT_GRID }
  const gp = (v: unknown): GridPoint | null => {
    const q = v as GridPoint | null
    return q && typeof q === "object" && typeof q.x === "string" && typeof q.y === "string" && q.x.startsWith("x:") && q.y.startsWith("y:") ? { x: q.x, y: q.y } : null
  }
  const origin = gp(o.origin)
  const dims = (Array.isArray(o.dims) ? o.dims : []).flatMap((m) => {
    const a = gp(m?.a)
    const b = gp(m?.b)
    return a && b && typeof m.id === "string" ? [{ id: m.id, a, b }] : []
  })
  return { stepMm: o.stepMm, moved: o.moved && typeof o.moved === "object" ? o.moved : {}, ...(origin ? { origin } : {}), ...(dims.length ? { dims } : {}) }
}

export interface GridLine {
  key: string
  axis: "x" | "y"
  at: number
  moved: boolean
}

/** the grid's lines across a stretch of the plan (each way) */
export function gridLines(grid: ProjectGrid, x0: number, x1: number, y0: number, y1: number): { xs: GridLine[]; ys: GridLine[] } {
  const step = Math.max(50, grid.stepMm)
  const along = (axis: "x" | "y", lo: number, hi: number): GridLine[] => {
    const out: GridLine[] = []
    for (let n = Math.floor(lo / step); n <= Math.ceil(hi / step); n++) {
      const key = `${axis}:${n}`
      const moved = grid.moved[key]
      out.push({ key, axis, at: moved ?? n * step, moved: moved !== undefined })
    }
    // (a line moved in from further out still counts)
    for (const [key, at] of Object.entries(grid.moved)) if (key.startsWith(`${axis}:`) && !out.some((l) => l.key === key) && at >= lo && at <= hi) out.push({ key, axis, at, moved: true })
    return out.sort((a, b) => a.at - b.at)
  }
  return { xs: along("x", x0, x1), ys: along("y", y0, y1) }
}

/** the line nearest a value */
export const nearestLine = (v: number, lines: number[]) => lines.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), lines[0] ?? v)

/** the lines round a plan, with room to spare, for snapping */
export const linesAround = (grid: ProjectGrid, pts: Pt[]) => {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const g = gridLines(grid, Math.min(0, ...xs) - 10000, Math.max(0, ...xs) + 10000, Math.min(0, ...ys) - 10000, Math.max(0, ...ys) + 10000)
  return { xs: g.xs.map((l) => l.at), ys: g.ys.map((l) => l.at) }
}

/** An outline put back square and on the grid: each wall made level or
 * plumb on plan (whichever it's nearest), on the gridline nearest it, and
 * any corner that's no longer a corner taken out. */
export function squareUp(points: Pt[], lines: { xs: number[]; ys: number[] }): Pt[] {
  const pts = points.map((p) => ({ ...p }))
  const flat = (a: Pt, b: Pt) => Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  // two walls in a row the same way: one wall
  for (let pass = 0; pass < pts.length && pts.length > 4; pass++) {
    const k = pts.findIndex((p, i) => flat(pts[(i - 1 + pts.length) % pts.length], p) === flat(p, pts[(i + 1) % pts.length]))
    if (k < 0) break
    pts.splice(k, 1)
  }
  if (pts.length < 4 || pts.length % 2) {
    // nothing square to be had: the rectangle round it
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const [x0, x1, y0, y1] = [nearestLine(Math.min(...xs), lines.xs), nearestLine(Math.max(...xs), lines.xs), nearestLine(Math.min(...ys), lines.ys), nearestLine(Math.max(...ys), lines.ys)]
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]
  }
  const out = pts.map((p) => ({ ...p }))
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    if (flat(pts[i], pts[j])) {
      const y = nearestLine((pts[i].y + pts[j].y) / 2, lines.ys)
      out[i].y = y
      out[j].y = y
    } else {
      const x = nearestLine((pts[i].x + pts[j].x) / 2, lines.xs)
      out[i].x = x
      out[j].x = x
    }
  }
  return simplify(out)
}

/** A plan with whatever was on a gridline moved along with it. */
export function movePlanLine(plan: FloorPlan, axis: "x" | "y", from: number, to: number): FloorPlan {
  const on = (v: number) => Math.abs(v - from) < 1
  const pt = (p: Pt): Pt => (on(p[axis]) ? { ...p, [axis]: to } : p)
  return {
    ...plan,
    outline: plan.outline.map(pt),
    walls: plan.walls.map((w) => ({ ...w, a: pt(w.a), b: pt(w.b) })),
    tags: plan.tags.map((t) => t),
    boxes: plan.boxes.map((b) => {
      const [lo, size] = axis === "x" ? [b.x, b.w] : [b.y, b.h]
      let a = lo
      let z = lo + size
      if (on(a)) a = to
      if (on(z)) z = to
      if (z - a < 300) return b
      return axis === "x" ? { ...b, x: a, w: z - a } : { ...b, y: a, h: z - a }
    }),
  }
}

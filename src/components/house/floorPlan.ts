/** A ground floor plan, however it was started, as one thing: the
 * outline, the walls inside it and the rooms they make.
 *
 *  - outline mode: the outline as drawn, the inside walls as drawn, and
 *    each room the space the walls close off (named by the tag inside it);
 *  - rooms mode: the outline round all the boxes, a wall wherever two
 *    rooms meet, and each box a room.
 *
 * Plans are square-cornered for now: the plan's cut into a grid on every
 * wall line, and rooms are cells joined across any edge with no wall on
 * it. mm, y down. Pure — no React. */

import { FloorPlan, LoadBearing, Pt, RoomKind, RoomTag } from "./houseTypes"

export interface PlanWall {
  /** an inside wall's id (outline mode), or a key from where it is (rooms mode) */
  id: string
  a: Pt
  b: Pt
  loadBearing: LoadBearing
}

export interface PlanRoom {
  /** the tag's or box's id; "" for a space nobody's named yet */
  id: string
  name: string
  kind: RoomKind
  areaM2: number
  /** where the name goes: the middle of its biggest cell */
  label: Pt
  /** the room's cells, as rectangles */
  cells: { x: number; y: number; w: number; h: number }[]
}

export interface FloorGraph {
  outline: Pt[]
  walls: PlanWall[]
  rooms: PlanRoom[]
  warnings: string[]
}

const EPS = 1

export const isSquare = (pts: Pt[]) =>
  pts.length >= 4 &&
  pts.every((p, i) => {
    const q = pts[(i + 1) % pts.length]
    return Math.abs(p.x - q.x) < EPS || Math.abs(p.y - q.y) < EPS
  })

export const inside = (pts: Pt[], p: Pt) => {
  let ins = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ins = !ins
  }
  return ins
}

export const polygonArea = (pts: Pt[]) => {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

const sortedUnique = (vals: number[]) => {
  const s = [...vals].sort((a, b) => a - b)
  return s.filter((v, i) => i === 0 || v - s[i - 1] > EPS)
}

/** drop points that sit on a straight line between their neighbours */
export const simplify = (pts: Pt[]): Pt[] => {
  let out = pts
  for (let pass = 0; pass < 3; pass++) {
    out = out.filter((p, i) => {
      const a = out[(i - 1 + out.length) % out.length]
      const b = out[(i + 1) % out.length]
      const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)
      return Math.abs(cross) > EPS * 100 && Math.hypot(p.x - a.x, p.y - a.y) > EPS
    })
  }
  return out
}

interface Grid {
  xs: number[]
  ys: number[]
  /** room index per cell, −1 outside */
  room: number[][]
}

/** the cells of a grid as rectangles, per room, and each room's area and
 * label point */
function roomCells(g: Grid, count: number) {
  const out = Array.from({ length: count }, () => ({ cells: [] as PlanRoom["cells"], area: 0, label: { x: 0, y: 0 }, best: -1 }))
  for (let i = 0; i + 1 < g.xs.length; i++)
    for (let j = 0; j + 1 < g.ys.length; j++) {
      const r = g.room[i][j]
      if (r < 0) continue
      const c = { x: g.xs[i], y: g.ys[j], w: g.xs[i + 1] - g.xs[i], h: g.ys[j + 1] - g.ys[j] }
      const o = out[r]
      o.cells.push(c)
      o.area += c.w * c.h
      if (c.w * c.h > o.best) {
        o.best = c.w * c.h
        o.label = { x: c.x + c.w / 2, y: c.y + c.h / 2 }
      }
    }
  return out
}

/** the walls along grid lines wherever the cells either side are in
 * different rooms (both inside), joined into runs */
function wallsBetween(g: Grid): { a: Pt; b: Pt }[] {
  const out: { a: Pt; b: Pt }[] = []
  const ni = g.xs.length - 1
  const nj = g.ys.length - 1
  // vertical lines x = xs[i], between cell i−1 and i
  for (let i = 1; i < ni; i++) {
    let start: number | null = null
    for (let j = 0; j <= nj; j++) {
      const wall = j < nj && g.room[i - 1][j] >= 0 && g.room[i][j] >= 0 && g.room[i - 1][j] !== g.room[i][j]
      if (wall && start === null) start = j
      if (!wall && start !== null) {
        out.push({ a: { x: g.xs[i], y: g.ys[start] }, b: { x: g.xs[i], y: g.ys[j] } })
        start = null
      }
    }
  }
  for (let j = 1; j < nj; j++) {
    let start: number | null = null
    for (let i = 0; i <= ni; i++) {
      const wall = i < ni && g.room[i][j - 1] >= 0 && g.room[i][j] >= 0 && g.room[i][j - 1] !== g.room[i][j]
      if (wall && start === null) start = i
      if (!wall && start !== null) {
        out.push({ a: { x: g.xs[start], y: g.ys[j] }, b: { x: g.xs[i], y: g.ys[j] } })
        start = null
      }
    }
  }
  return out
}

/** the outside of a set of cells: the biggest loop of their boundary */
function outlineOf(g: Grid): Pt[] {
  const ni = g.xs.length - 1
  const nj = g.ys.length - 1
  const ins = (i: number, j: number) => i >= 0 && j >= 0 && i < ni && j < nj && g.room[i][j] >= 0
  // boundary edges, each cell's taken clockwise on screen (y down)
  const next = new Map<string, [number, number][]>()
  const add = (a: [number, number], b: [number, number]) => {
    const k = `${a[0]},${a[1]}`
    next.set(k, [...(next.get(k) ?? []), b])
  }
  for (let i = 0; i < ni; i++)
    for (let j = 0; j < nj; j++) {
      if (!ins(i, j)) continue
      if (!ins(i, j - 1)) add([i, j], [i + 1, j])
      if (!ins(i + 1, j)) add([i + 1, j], [i + 1, j + 1])
      if (!ins(i, j + 1)) add([i + 1, j + 1], [i, j + 1])
      if (!ins(i - 1, j)) add([i, j + 1], [i, j])
    }
  const loops: Pt[][] = []
  for (;;) {
    const startKey = [...next.keys()].find((k) => next.get(k)!.length)
    if (!startKey) break
    const loop: Pt[] = []
    let k = startKey
    for (let guard = 0; guard < 10000; guard++) {
      const outs = next.get(k)
      if (!outs?.length) break
      const [i, j] = outs.shift()!
      const [ci, cj] = k.split(",").map(Number)
      loop.push({ x: g.xs[ci], y: g.ys[cj] })
      k = `${i},${j}`
      if (k === startKey) break
    }
    if (loop.length > 2) loops.push(loop)
  }
  if (!loops.length) return []
  return simplify(loops.reduce((a, b) => (Math.abs(polygonArea(b)) > Math.abs(polygonArea(a)) ? b : a)))
}

/** The plan as drawn: outline, inside walls, rooms. */
export function floorGraph(floor: FloorPlan): FloorGraph {
  return floor.mode === "rooms" ? roomsGraph(floor) : outlineGraph(floor)
}

function outlineGraph(floor: FloorPlan): FloorGraph {
  const warnings: string[] = []
  const outline = floor.outline
  const walls: PlanWall[] = floor.walls.map((w) => ({ id: w.id, a: w.a, b: w.b, loadBearing: w.loadBearing }))
  if (outline.length < 3) return { outline, walls, rooms: [], warnings }
  if (!isSquare(outline)) {
    warnings.push("Rooms and load-bearing walls need a square-cornered outline for now — the outline has a corner that isn't 90°.")
    const area = Math.abs(polygonArea(outline)) / 1e6
    const tag = floor.tags[0]
    return {
      outline,
      walls,
      rooms: [{ id: tag?.id ?? "", name: tag?.name ?? "House", kind: tag?.kind ?? "other", areaM2: area, label: outline[0], cells: [] }],
      warnings,
    }
  }
  const vertical = walls.filter((w) => Math.abs(w.a.x - w.b.x) < EPS)
  const horizontal = walls.filter((w) => Math.abs(w.a.y - w.b.y) < EPS)
  const xs = sortedUnique([...outline.map((p) => p.x), ...vertical.map((w) => w.a.x), ...horizontal.flatMap((w) => [w.a.x, w.b.x])])
  const ys = sortedUnique([...outline.map((p) => p.y), ...horizontal.map((w) => w.a.y), ...vertical.flatMap((w) => [w.a.y, w.b.y])])
  const ni = xs.length - 1
  const nj = ys.length - 1
  const isIn = xs.slice(0, -1).map((x, i) => ys.slice(0, -1).map((y, j) => inside(outline, { x: (x + xs[i + 1]) / 2, y: (y + ys[j + 1]) / 2 })))
  const covers = (lo: number, hi: number, a: number, b: number) => Math.min(a, b) <= lo + EPS && Math.max(a, b) >= hi - EPS
  const blockedX = (i: number, j: number) => vertical.some((w) => Math.abs(w.a.x - xs[i]) < EPS && covers(ys[j], ys[j + 1], w.a.y, w.b.y))
  const blockedY = (i: number, j: number) => horizontal.some((w) => Math.abs(w.a.y - ys[j]) < EPS && covers(xs[i], xs[i + 1], w.a.x, w.b.x))
  const room = isIn.map((col) => col.map(() => -1))
  let count = 0
  for (let i0 = 0; i0 < ni; i0++)
    for (let j0 = 0; j0 < nj; j0++) {
      if (!isIn[i0][j0] || room[i0][j0] >= 0) continue
      const stack: [number, number][] = [[i0, j0]]
      room[i0][j0] = count
      while (stack.length) {
        const [i, j] = stack.pop()!
        const go = (a: number, b: number, open: boolean) => {
          if (a < 0 || b < 0 || a >= ni || b >= nj || !open || !isIn[a][b] || room[a][b] >= 0) return
          room[a][b] = count
          stack.push([a, b])
        }
        go(i + 1, j, i + 1 < ni && !blockedX(i + 1, j))
        go(i - 1, j, i > 0 && !blockedX(i, j))
        go(i, j + 1, j + 1 < nj && !blockedY(i, j + 1))
        go(i, j - 1, j > 0 && !blockedY(i, j))
      }
      count++
    }
  const cells = roomCells({ xs, ys, room }, count)
  // each space takes the name of the (first) tag inside it
  const cellOf = (p: Pt): number => {
    const i = xs.findIndex((x, k) => k < ni && p.x >= x && p.x <= xs[k + 1])
    const j = ys.findIndex((y, k) => k < nj && p.y >= y && p.y <= ys[k + 1])
    return i >= 0 && j >= 0 ? room[i][j] : -1
  }
  const named = new Map<number, RoomTag>()
  for (const t of floor.tags) {
    const r = cellOf(t.at)
    if (r >= 0 && !named.has(r)) named.set(r, t)
  }
  let unnamed = 0
  const rooms: PlanRoom[] = cells.map((c, r) => {
    const t = named.get(r)
    return {
      id: t?.id ?? "",
      name: t?.name ?? `Room ${++unnamed + named.size}`,
      kind: t?.kind ?? "other",
      areaM2: c.area / 1e6,
      label: c.label,
      cells: c.cells,
    }
  })
  return { outline, walls, rooms, warnings }
}

function roomsGraph(floor: FloorPlan): FloorGraph {
  const warnings: string[] = []
  const boxes = floor.boxes.filter((b) => b.w > 0 && b.h > 0)
  if (!boxes.length) return { outline: [], walls: [], rooms: [], warnings }
  const xs = sortedUnique(boxes.flatMap((b) => [b.x, b.x + b.w]))
  const ys = sortedUnique(boxes.flatMap((b) => [b.y, b.y + b.h]))
  const room: number[][] = []
  let overlap = false
  for (let i = 0; i + 1 < xs.length; i++) {
    room.push([])
    for (let j = 0; j + 1 < ys.length; j++) {
      const p = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 }
      const hits = boxes.map((b, k) => (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h ? k : -1)).filter((k) => k >= 0)
      if (hits.length > 1) overlap = true
      room[i].push(hits.length ? hits[0] : -1)
    }
  }
  if (overlap) warnings.push("Some rooms overlap — where they do, the one added first wins.")
  const g = { xs, ys, room }
  const cells = roomCells(g, boxes.length)
  const rooms: PlanRoom[] = boxes.map((b, k) => ({ id: b.id, name: b.name, kind: b.kind, areaM2: cells[k].area / 1e6, label: cells[k].label, cells: cells[k].cells }))
  const walls: PlanWall[] = wallsBetween(g).map((w) => {
    const id = wallKey(w.a, w.b)
    return { id, a: w.a, b: w.b, loadBearing: floor.overrides[id] ?? "auto" }
  })
  const outline = outlineOf(g)
  // more than one loop: rooms not all touching
  const total = boxes.reduce((s, b) => s + b.w * b.h, 0)
  if (!overlap && Math.abs(Math.abs(polygonArea(outline)) - total) > 1e4)
    warnings.push("The rooms don't all join up into one house (or leave a courtyard) — only the biggest joined-up part is the outline.")
  return { outline, walls, rooms, warnings }
}

/** a wall between rooms, keyed by where it is */
export const wallKey = (a: Pt, b: Pt) => `w:${Math.round(a.x)},${Math.round(a.y)}-${Math.round(b.x)},${Math.round(b.y)}`

/** The rooms laid out as boxes, turned into an outline and walls to carry
 * on drawing (rooms mode → outline mode). */
export function roomsToOutline(floor: FloorPlan): FloorPlan {
  const g = roomsGraph(floor)
  return {
    ...floor,
    mode: "outline",
    outline: g.outline,
    lockedEdgeLengths: {},
    lockedVertexAngles: {},
    walls: g.walls.map((w, i) => ({ id: `w${i}${Math.random().toString(36).slice(2, 6)}`, a: w.a, b: w.b, loadBearing: w.loadBearing })),
    tags: g.rooms.map((r) => ({ id: r.id, name: r.name, kind: r.kind, at: r.label })),
  }
}

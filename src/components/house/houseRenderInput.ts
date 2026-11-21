/** A house as the weatherboards' 3D view takes it (houseRender3d.ts): its
 * cladding's walls and roofs, the inside walls stood up on their floors
 * (load-bearing ones warm), and a first floor's slab. Shared by the House
 * calculator's own 3D step and the site's 3D view. World mm, x east, y
 * north (= −plan y), z up from the ground floor. Pure — no React. */

import { calculateWall } from "../weatherboards/weatherboardCalc"
import { DEFAULT_SETTINGS as WB_DEFAULTS } from "../weatherboards/data"
import type { HouseRenderInput } from "../weatherboards/houseRender3d"
import { FloorGraph, floorGraph, inside as isInside } from "./floorPlan"
import { Cladding, houseCladding } from "./houseCladding"
import { DEFAULT_SETTINGS, Door, HouseProject, Pt } from "./houseTypes"
import { buildFrame, DEFAULT_FRAME_INPUT } from "../floorFraming/frame"
import { frameSolids } from "../floorFraming/frameRender3d"
import type { Solid } from "../stairs/stairRender3d"
import { analyseHouse, Structure } from "./structure"

/** the first floor's floor as slabs, one per cell (world mm), held clear
 * of the walls — in from the outside walls by their depth, and either side
 * of an inside wall by half its — so no solid cuts through another */
const upperFloorCells = (g: FloorGraph) =>
  g.rooms.flatMap((r) =>
    r.cells.map((c) => {
      const outside = (p: Pt) => !isInside(g.outline, p)
      const inset = (p: Pt) => (outside(p) ? 141 : 56)
      const l = inset({ x: c.x - 10, y: c.y + c.h / 2 })
      const rt = inset({ x: c.x + c.w + 10, y: c.y + c.h / 2 })
      const t = inset({ x: c.x + c.w / 2, y: c.y - 10 })
      const b = inset({ x: c.x + c.w / 2, y: c.y + c.h + 10 })
      return { x0: c.x + l, x1: c.x + c.w - rt, y0: -(c.y + c.h - b), y1: -(c.y + t) }
    }),
  )

const onSeg = (p: Pt, a: Pt, b: Pt) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)
  return t >= -0.001 && t <= 1.001 && Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len < 5
}

/** each inside wall held short where it meets the outside walls, and where
 * it butts into another inside wall, so no solid runs through another */
const trim = (g: FloorGraph, w: FloorGraph["walls"][number]) => {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1
  const d = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len }
  const short = (p: Pt) => (g.outline.some((q, i) => onSeg(p, q, g.outline[(i + 1) % g.outline.length])) ? 141 : g.walls.some((o) => o !== w && onSeg(p, o.a, o.b)) ? 56 : 0)
  const sa = short(w.a)
  const sb = short(w.b)
  return { a: { x: w.a.x + d.x * sa, y: w.a.y + d.y * sa }, b: { x: w.b.x - d.x * sb, y: w.b.y - d.y * sb } }
}

/** a door's leaf, in the 3D view */
const DOOR_LEAF = "#a9825a"

/** the inside walls stood up, each cut round its doors: full height either
 * side, the wall over each door's head, and the door's leaf (closed, thin,
 * in the wall's middle) — every piece keeping the wall's id, so a tap on any
 * of it finds the wall (and the door) */
const insideWalls = (g: FloorGraph, st: Structure, z0: number, height: number, upper: boolean, doors: Door[]) =>
  g.walls
    .map((w) => ({ w, ...trim(g, w) }))
    .filter((x) => Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y) > 20)
    .flatMap(({ w, a, b }) => {
      const along = Math.hypot(a.x - w.a.x, a.y - w.a.y)
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      const at = (t: number) => ({ x: a.x + d.x * t, y: -(a.y + d.y * t) })
      const color = st.inside.get(w.id)?.loadBearing ? "#c98f7a" : "#ece8df"
      const id = `in:${upper ? 1 : 0}:${w.id}`
      const piece = (t0: number, t1: number, lo: number, hi: number, more: { color?: string; thickness?: number; member?: "inside" | "joinery" } = {}) => ({
        // (to find it again from the 3D view: its line, and how far along it this piece starts)
        id,
        along: along + t0,
        a: at(t0),
        b: at(t1),
        height: hi - lo,
        thickness: more.thickness ?? 110,
        z0: z0 + lo,
        upper,
        color: more.color ?? color,
        ...(more.member ? { member: more.member } : {}),
      })
      // its doors, along the trimmed wall, in order, kept on it and clear of each other
      const cuts = doors
        .filter((x) => x.wallId === w.id)
        .map((x) => ({ t0: Math.max(0, x.atMm - x.widthMm / 2 - along), t1: Math.min(L, x.atMm + x.widthMm / 2 - along), h: Math.min(height, x.heightMm) }))
        .filter((c) => c.t1 - c.t0 > 50)
        .sort((p, q) => p.t0 - q.t0)
      const out: ReturnType<typeof piece>[] = []
      let from = 0
      for (const c of cuts) {
        if (c.t0 < from) continue
        if (c.t0 - from > 1) out.push(piece(from, c.t0, 0, height))
        if (height - c.h > 1) out.push(piece(c.t0, c.t1, c.h, height))
        out.push(piece(c.t0, c.t1, 0, c.h, { color: DOOR_LEAF, thickness: 36, member: "joinery" }))
        from = c.t1
      }
      if (L - from > 1) out.push(piece(from, L, 0, height))
      return out
    })

/** joists span a floor the short way: along whichever plan axis it's narrower */
const joistsAlong = (pts: Pt[]): "x" | "y" => {
  const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
  const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
  return w >= h ? "y" : "x"
}

/** The floors' framing, as solids: a timber ground floor's subfloor (piles,
 * bearers, joists and sheet flooring, its top at the floor), and the first
 * floor's midfloor (joists between the ground floor's walls, under the
 * sheet flooring the storey above stands on). */
function floorFraming(house: HouseProject, graph: FloorGraph, upperGraph: FloorGraph | null) {
  const solids: { solid: Solid; member: "subfloor" | "midfloor" }[] = []
  const gf = house.settings.groundFloor ?? DEFAULT_SETTINGS.groundFloor
  const timber = gf.kind === "timber" && graph.outline.length >= 3
  if (timber) {
    const f = buildFrame(graph.outline, joistsAlong(graph.outline), { ...DEFAULT_FRAME_INPUT, support: "bearers", covering: "sheet", heightMm: gf.heightMm, joistSize: "140 x 45mm" })
    // (its ground at the ground, its floor at the house's)
    for (const solid of frameSolids({ frame: f }, new Set(), -f.floorTop)) solids.push({ solid, member: "subfloor" })
  }
  const midfloor = !!upperGraph && upperGraph.outline.length >= 3
  if (midfloor) {
    const f = buildFrame(upperGraph!.outline, joistsAlong(upperGraph!.outline), { ...DEFAULT_FRAME_INPUT, support: "walls", covering: "sheet" })
    // (its joists on the ground floor's top plates; the walls it spans between are the house's own)
    for (const solid of frameSolids({ frame: f }, new Set(["walls"]), house.settings.studHeightMm)) solids.push({ solid, member: "midfloor" })
  }
  return { solids, timber, midfloor, groundZ: timber ? -gf.heightMm : undefined }
}

/** The 3D input, from what the House calculator has already worked out. */
export function houseRenderInputFrom(
  house: HouseProject,
  graph: FloorGraph,
  upperGraph: FloorGraph | null,
  cladding: Cladding,
  structures: ReturnType<typeof analyseHouse>,
): HouseRenderInput {
  const walls = cladding.walls
  const results = new Map([...walls.values()].map((w) => [w.id, calculateWall(w, WB_DEFAULTS)]))
  const z1 = cladding.upperFloorZ
  const extras = [
    ...insideWalls(graph, structures.ground, 0, house.settings.studHeightMm, false, house.floor.doors),
    ...(upperGraph && structures.upper && house.upper ? insideWalls(upperGraph, structures.upper, z1, house.upper.studHeightMm, true, house.upper.plan.doors) : []),
  ]
  const floors = floorFraming(house, graph, upperGraph)
  // (framed, the first floor's own slab's left out: the midfloor's sheets are its floor)
  const upper = cladding.upper && upperGraph ? { layout: cladding.upper, floorZ: z1, floorCells: floors.midfloor ? [] : upperFloorCells(upperGraph) } : undefined
  return {
    layout: cladding.ground,
    walls,
    results,
    settings: WB_DEFAULTS,
    roof: cladding.roof,
    moreRoofs: cladding.lowerRoofs,
    roofColour: house.settings.roof.colour,
    extras,
    upper,
    solids: floors.solids,
    ...(floors.groundZ !== undefined ? { groundZ: floors.groundZ } : {}),
    noFloor: floors.timber,
  }
}

/** The 3D input straight from a saved house; null while it has no outline. */
export function houseRenderInput(house: HouseProject): HouseRenderInput | null {
  const graph = floorGraph(house.floor)
  const upperGraph = house.upper ? floorGraph(house.upper.plan) : null
  const cladding = houseCladding(house, graph, upperGraph)
  if (!cladding) return null
  const structures = analyseHouse(graph, upperGraph, house.settings, cladding.roof, cladding.lowerRoofs)
  return houseRenderInputFrom(house, graph, upperGraph, cladding, structures)
}

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
import { HouseProject, Pt } from "./houseTypes"
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

const insideWalls = (g: FloorGraph, st: Structure, z0: number, height: number, upper: boolean) =>
  g.walls
    .map((w) => ({ w, ...trim(g, w) }))
    .filter((x) => Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y) > 20)
    .map(({ w, a, b }) => ({
      a: { x: a.x, y: -a.y },
      b: { x: b.x, y: -b.y },
      height,
      thickness: 110,
      z0,
      upper,
      color: st.inside.get(w.id)?.loadBearing ? "#c98f7a" : "#ece8df",
    }))

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
    ...insideWalls(graph, structures.ground, 0, house.settings.studHeightMm, false),
    ...(upperGraph && structures.upper && house.upper ? insideWalls(upperGraph, structures.upper, z1, house.upper.studHeightMm, true) : []),
  ]
  const upper = cladding.upper && upperGraph ? { layout: cladding.upper, floorZ: z1, floorCells: upperFloorCells(upperGraph) } : undefined
  return { layout: cladding.ground, walls, results, settings: WB_DEFAULTS, roof: cladding.roof, moreRoofs: cladding.lowerRoofs, roofColour: house.settings.roof.colour, extras, upper }
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

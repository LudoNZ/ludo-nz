/** The house's outside walls as a weatherboard project: a wall for every
 * side of the outline, each in the elevation it faces (North, East…),
 * named after the room behind it, with its top traced off the roof — so
 * a gable end comes out raked — and facings or scribers at its corners
 * from which way the corner turns. The footprint and roof go across too,
 * so the weatherboards' 3D view is the same house.
 *
 * Linked, the house owns each wall's shape and the weatherboard project
 * keeps everything else: openings, skips, its settings, walls added there.
 * Pure — no React. */

import { DEFAULT_SETTINGS as WB_DEFAULTS } from "../weatherboards/data"
import { footprintSides, houseLayout, outwardOf, P2 } from "../weatherboards/housePlan"
import { buildRoof, Roof, zAt } from "../weatherboards/roof"
import { Elevation, Wall, WallEdge, WeatherboardProject } from "../weatherboards/types"
import { FloorGraph, simplify } from "./floorPlan"
import { HouseProject, Pt } from "./houseTypes"

const COMPASS = ["North", "East", "South", "West"] as const

/** the face a side looks out on: world outward normal → compass */
const compassOf = (n: P2): (typeof COMPASS)[number] =>
  Math.abs(n.y) >= Math.abs(n.x) ? (n.y > 0 ? "North" : "South") : n.x > 0 ? "East" : "West"

const inConvex = (poly: P2[], p: P2) => {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(c) < 1e-3 * Math.hypot(b.x - a.x, b.y - a.y)) continue
    const s = Math.sign(c)
    if (sign && s !== sign) return false
    sign = s
  }
  return true
}

/** the roof's underside over a point on plan (world) — the highest face
 * over it — or null where there's no roof */
const roofAt = (roof: Roof, p: P2): number | null => {
  let z: number | null = null
  for (const f of roof.faces) if (inConvex(f.poly, p)) z = Math.max(z ?? -Infinity, zAt(f.plane, p))
  return z
}

/** a wall's top, along the wall from a to b, traced off the roof */
function topFromRoof(roof: Roof, a: P2, b: P2, eaves: number): WallEdge {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const at = (x: number): P2 => ({ x: a.x + ((b.x - a.x) * x) / len, y: a.y + ((b.y - a.y) * x) / len })
  // every place the roof can bend over the wall: where the wall line
  // crosses a face's edge, and its ends
  const xs = new Set<number>([0, len])
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  for (const f of roof.faces)
    f.poly.forEach((p, i) => {
      const q = f.poly[(i + 1) % f.poly.length]
      const e = { x: q.x - p.x, y: q.y - p.y }
      const den = d.x * e.y - d.y * e.x
      if (Math.abs(den) < 1e-9) return
      const t = ((p.x - a.x) * e.y - (p.y - a.y) * e.x) / den
      const u = ((p.x - a.x) * d.y - (p.y - a.y) * d.x) / den
      if (t > 1 && t < len - 1 && u >= -1e-6 && u <= 1 + 1e-6) xs.add(Math.round(t))
    })
  const pts = [...xs]
    .sort((p, q) => p - q)
    .map((x) => ({ x, y: Math.round(Math.max(eaves, roofAt(roof, at(x)) ?? eaves)) }))
  // keep the bends only
  const kept = pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true
    const a0 = pts[i - 1]
    const b0 = pts[i + 1]
    const expect = a0.y + ((b0.y - a0.y) * (p.x - a0.x)) / (b0.x - a0.x || 1)
    return Math.abs(expect - p.y) > 2
  })
  return {
    left: kept[0].y,
    right: kept[kept.length - 1].y,
    breaks: kept.slice(1, -1).map((p, i) => ({ id: `r${i}`, x: p.x, y: p.y })),
  }
}

export interface Cladding {
  project: WeatherboardProject
  roof: Roof | null
}

/** The weatherboard project for the house as it stands (no openings yet). */
export function houseCladding(house: HouseProject, graph: FloorGraph): Cladding | null {
  const outline = simplify(graph.outline)
  if (outline.length < 3) return null
  const H = house.settings.studHeightMm
  const n = outline.length
  // which way each corner turns, going round with the outside on the right
  const sides = footprintSides({ points: outline, lockedEdgeLengths: {}, lockedVertexAngles: {}, sides: [] })
  const order = sides.map((s) => s.index)
  const turnAfter = new Map<number, number>()
  sides.forEach((s, k) => {
    const t = sides[(k + 1) % sides.length]
    const cross = (s.b.x - s.a.x) * (t.b.y - t.a.y) - (s.b.y - s.a.y) * (t.b.x - t.a.x)
    turnAfter.set(s.index, cross)
  })
  /** the room just inside a side, to name its wall after */
  const roomBehind = (i: number): string | null => {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const s = sides.find((x) => x.index === i)!
    const o = outwardOf(s)
    const mid: Pt = { x: (a.x + b.x) / 2 - o.x * 300, y: (a.y + b.y) / 2 + o.y * 300 }
    const r = graph.rooms.find((rm) => rm.cells.some((c) => mid.x >= c.x && mid.x <= c.x + c.w && mid.y >= c.y && mid.y <= c.y + c.h))
    return r?.name ?? null
  }

  const flat = (y: number): WallEdge => ({ left: y, right: y, breaks: [] })
  const walls: Wall[] = order.map((i, k) => {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const prev = order[(k - 1 + order.length) % order.length]
    return {
      id: `hs${i}`,
      name: "",
      lengthMm: Math.round(Math.hypot(b.x - a.x, b.y - a.y)),
      top: flat(H),
      bottom: flat(0),
      openings: [],
      // an outside corner gets a facing on each wall; an inside one a
      // scriber, on the wall before it
      leftEnd: (turnAfter.get(prev) ?? 1) > 0 ? "externalFacing" : "none",
      rightEnd: (turnAfter.get(i) ?? 1) > 0 ? "externalFacing" : "internalScriber",
      coverMm: null,
    }
  })
  // elevations by the way each wall faces, walls in order left to right
  const byFace = new Map<string, Wall[]>()
  order.forEach((i, k) => {
    const face = compassOf(outwardOf(sides[k]))
    const w = walls[k]
    byFace.set(face, [...(byFace.get(face) ?? []), w])
    const room = roomBehind(i)
    w.name = room ? `${room}` : `${face} wall`
  })
  const elevations: Elevation[] = COMPASS.filter((c) => byFace.has(c)).map((c) => {
    const ws = byFace.get(c)!
    // the same room behind two walls on one face: number them
    const counts = new Map<string, number>()
    for (const w of ws) counts.set(w.name, (counts.get(w.name) ?? 0) + 1)
    const seen = new Map<string, number>()
    for (const w of ws)
      if ((counts.get(w.name) ?? 0) > 1) {
        const k = (seen.get(w.name) ?? 0) + 1
        seen.set(w.name, k)
        w.name = `${w.name} ${k}`
      }
    return { id: `house-${c.toLowerCase()}`, name: c, walls: ws }
  })
  // (sides go round from the first stored one: put each face's walls in
  // order left to right, which is the way round, starting after a corner)
  for (const e of elevations) {
    const idx = (w: Wall) => order.indexOf(Number(w.id.slice(2)))
    e.walls.sort((p, q) => idx(p) - idx(q))
    // a face whose run wraps past the first side: rotate it to start after the gap
    const ids = e.walls.map(idx)
    const gap = ids.findIndex((v, k) => k > 0 && v !== ids[k - 1] + 1)
    if (gap > 0 && ids[0] === 0 && ids[ids.length - 1] === order.length - 1) e.walls = [...e.walls.slice(gap), ...e.walls.slice(0, gap)]
  }

  const project: WeatherboardProject = {
    settings: WB_DEFAULTS,
    elevations,
    plan: {
      method: "footprint",
      chain: { order: [], steps: {} },
      footprint: { points: outline, lockedEdgeLengths: {}, lockedVertexAngles: {}, sides: outline.map((_, i) => `hs${i}`) },
      roof: house.settings.roof,
    },
  }
  const layout = houseLayout(project)
  const byId = new Map(walls.map((w) => [w.id, w]))
  const first = buildRoof(layout, byId, house.settings.roof)
  if (!first) return { project, roof: null }
  for (const s of layout.sides) {
    const w = s.wallId ? byId.get(s.wallId) : undefined
    if (w) w.top = topFromRoof(first, s.a, s.b, H)
  }
  // again, now the gable walls are peaked (so it doesn't fill in gables
  // they already reach)
  return { project, roof: buildRoof(layout, byId, house.settings.roof) }
}

/** The house's cladding folded into the linked weatherboard project as it
 * stands: the house's walls take their shape from the house; what was
 * added on the weatherboard side stays. */
export function mergeCladding(existing: WeatherboardProject | null, generated: WeatherboardProject): WeatherboardProject {
  if (!existing) return generated
  const oldWalls = new Map(existing.elevations.flatMap((e) => e.walls).map((w) => [w.id, w]))
  const generatedIds = new Set(generated.elevations.map((e) => e.id))
  const elevations = generated.elevations.map((e) => ({
    ...(existing.elevations.find((x) => x.id === e.id) ?? {}),
    ...e,
    walls: e.walls.map((w) => {
      const old = oldWalls.get(w.id)
      if (!old) return w
      // the house owns the shape; keep what was added to it, as still fits
      return {
        ...w,
        openings: (old.openings ?? []).filter((o) => o.x + o.width <= w.lengthMm),
        ...(old.skips ? { skips: old.skips.filter((p) => p.x <= w.lengthMm) } : {}),
        ...(old.corners ? { corners: old.corners.filter((c) => c.x < w.lengthMm) } : {}),
        coverMm: old.coverMm,
      }
    }),
  }))
  return {
    settings: existing.settings,
    elevations: [...elevations, ...existing.elevations.filter((e) => !generatedIds.has(e.id))],
    plan: { ...(existing.plan ?? generated.plan!), ...generated.plan! },
  }
}

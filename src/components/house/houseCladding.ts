/** The house's outside walls as a weatherboard project: a wall for every
 * side of each storey's outline, each in the elevation it faces (North,
 * East…), named after the room behind it, with facings or scribers at its
 * corners from which way the corner turns.
 *
 * Tops come off the roof over them — so a gable end comes out raked: the
 * main roof over the top storey, and with a first floor, the lower roof
 * over the parts of the ground floor it doesn't cover. A first-floor wall
 * standing flush over a ground-floor one starts where that finishes (the
 * cladding runs on past the floor); one set back starts at the lower roof.
 *
 * Linked, the house owns each wall's shape and the weatherboard project
 * keeps everything else: openings, skips, its settings, walls added there.
 * Pure — no React. */

import { DEFAULT_SETTINGS as WB_DEFAULTS } from "../weatherboards/data"
import { footprintSides, houseLayout, HouseLayout, outwardOf, P2 } from "../weatherboards/housePlan"
import { buildRoof, ownRoofAt, Roof, zAt } from "../weatherboards/roof"
import { Elevation, RoofPlan, Wall, WallEdge, WeatherboardProject, WingSetting } from "../weatherboards/types"
import { FloorGraph, simplify, uncovered } from "./floorPlan"
import { HouseProject } from "./houseTypes"

const COMPASS = ["North", "East", "South", "West"] as const
type Face = (typeof COMPASS)[number]

/** the face a side looks out on: world outward normal → compass */
const compassOf = (n: P2): Face => (Math.abs(n.y) >= Math.abs(n.x) ? (n.y > 0 ? "North" : "South") : n.x > 0 ? "East" : "West")

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

/** the roofs' underside over a point on plan (world) — the highest face
 * over it — or null where there's no roof */
const roofAt = (roofs: Roof[], p: P2): number | null => {
  let z: number | null = null
  for (const r of roofs) for (const f of r.faces) if (inConvex(f.poly, p)) z = Math.max(z ?? -Infinity, zAt(f.plane, p))
  return z
}

/** where a wall line (a → b) crosses the edges of the roofs' faces, and of
 * their wings' own rectangles (where a wall passes from under one wing's
 * roof to the next), mm along it */
const roofBends = (roofs: Roof[], a: P2, b: P2): number[] => {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const out: number[] = []
  for (const r of roofs)
    for (const poly of [...r.faces.map((f) => f.poly), ...(r.own ?? []).map((o) => o.rect)])
      poly.forEach((p, i) => {
        const q = poly[(i + 1) % poly.length]
        const e = { x: q.x - p.x, y: q.y - p.y }
        const den = d.x * e.y - d.y * e.x
        if (Math.abs(den) < 1e-9) return
        const t = ((p.x - a.x) * e.y - (p.y - a.y) * e.x) / den
        const u = ((p.x - a.x) * d.y - (p.y - a.y) * d.x) / den
        if (t > 1 && t < len - 1 && u >= -1e-6 && u <= 1 + 1e-6) out.push(t)
      })
  return out
}

/** an edge along a wall from height samples: keep the bends only */
function edgeFrom(samples: { x: number; y: number }[]): WallEdge {
  // (one sample per place: a ridge is met by both its faces, and a doubled
  // point would hide the bend it's on)
  const pts = [...samples]
    .sort((p, q) => p.x - q.x)
    .map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
    .filter((p, i, all) => i === 0 || p.x !== all[i - 1].x)
  // drop the points that sit on the line between the ones either side of
  // them, the straightest first, measured against what's kept (close
  // samples either side of a bend mustn't hide it)
  const kept = [...pts]
  const off = (i: number) => {
    const a0 = kept[i - 1]
    const b0 = kept[i + 1]
    if (b0.x === a0.x) return Infinity
    return Math.abs(a0.y + ((b0.y - a0.y) * (kept[i].x - a0.x)) / (b0.x - a0.x) - kept[i].y)
  }
  for (;;) {
    let best = -1
    let bestOff = 2
    for (let i = 1; i < kept.length - 1; i++) {
      const o = off(i)
      if (o <= bestOff) {
        best = i
        bestOff = o
      }
    }
    if (best < 0) break
    kept.splice(best, 1)
  }
  // (a sheer step needs two points a hair apart)
  const out = kept.filter((p, i) => i === 0 || p.x !== kept[i - 1].x || p.y !== kept[i - 1].y)
  return { left: out[0].y, right: out[out.length - 1].y, breaks: out.slice(1, -1).map((p, i) => ({ id: `e${i}`, x: p.x, y: p.y })) }
}

/** a wall's top along it, off the roofs over it (eaves where there's
 * none, and wherever `held` says the storey above stands on it) */
function topFromRoofs(roofs: Roof[], a: P2, b: P2, eaves: number, held?: { at: (p: P2, a: P2, b: P2) => boolean; corners: P2[] }): WallEdge {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const at = (x: number): P2 => ({ x: a.x + ((b.x - a.x) * x) / len, y: a.y + ((b.y - a.y) * x) / len })
  // where it can change: the roofs' bends, and the storey above's corners
  // along it — either side of each too (a roof can start part way along)
  const cuts = [...roofBends(roofs, a, b), ...(held?.corners ?? []).map((p) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len).filter((t) => t > 1 && t < len - 1)]
  const xs = [0, len, ...cuts.flatMap((x) => [x - 10, x, x + 10])].filter((x) => x >= 0 && x <= len)
  // its own roof over it (even below the eaves height — a lean-to falling
  // away from a gable end), else the eaves; inside is to the left going a → b
  const inside = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
  const own = (p: P2, x: number) => {
    const toMid = x < len / 2 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: -(b.x - a.x) / len, y: -(b.y - a.y) / len }
    for (const r of roofs) {
      const z = ownRoofAt(r, p, inside, toMid)
      if (z !== null) return z
    }
    return roofAt(roofs, p)
  }
  return edgeFrom(xs.map((x) => ({ x, y: held?.at(at(x), a, b) ? eaves : (own(at(x), x) ?? eaves) })))
}

const onSegment = (p: P2, a: P2, b: P2, tol = 5) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len)
  if (t < -tol / len || t > 1 + tol / len) return false
  return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len < tol
}

/** a first-floor wall's bottom: where it stands flush over a ground-floor
 * wall, the top of that wall; elsewhere, the lower roof under it (or the
 * floor, where there's none) */
function bottomOver(ground: P2[], lowerRoofs: Roof[], a: P2, b: P2, groundTop: number, floorZ: number): WallEdge {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const at = (x: number): P2 => ({ x: a.x + ((b.x - a.x) * x) / len, y: a.y + ((b.y - a.y) * x) / len })
  const flush = (x: number) => ground.some((g, i) => onSegment(at(x), g, ground[(i + 1) % ground.length]))
  // the places it can change: ground corners along it, roof bends, its ends
  const cuts = new Set<number>([0, len, ...roofBends(lowerRoofs, a, b)])
  for (const g of ground) {
    const t = ((g.x - a.x) * (b.x - a.x) + (g.y - a.y) * (b.y - a.y)) / len
    if (t > 1 && t < len - 1 && onSegment(g, a, b, 5)) cuts.add(t)
  }
  const xs = [...cuts].sort((p, q) => p - q)
  const height = (x: number, mid: number) => (flush(mid) ? groundTop : Math.max(floorZ, roofAt(lowerRoofs, at(x)) ?? floorZ))
  const samples: { x: number; y: number }[] = []
  for (let k = 0; k + 1 < xs.length; k++) {
    const mid = (xs[k] + xs[k + 1]) / 2
    samples.push({ x: k === 0 ? xs[k] : xs[k] + 1, y: height(xs[k] + (k === 0 ? 0 : 1), mid) })
    samples.push({ x: k + 2 === xs.length ? xs[k + 1] : xs[k + 1] - 1, y: height(xs[k + 1] - (k + 2 === xs.length ? 0 : 1), mid) })
  }
  return edgeFrom(samples)
}

const flat = (y: number): WallEdge => ({ left: y, right: y, breaks: [] })

interface StoreyWalls {
  outline: P2[]
  walls: Wall[]
  /** wall ids in the order round the storey */
  layout: HouseLayout
  byFace: Map<Face, Wall[]>
}

/** a storey's walls: one per side of its outline, ids `${prefix}${side}` */
function storeyWalls(outline: P2[], graph: FloorGraph, prefix: string, bottom: number, top: number, suffix: string): StoreyWalls {
  const n = outline.length
  const sides = footprintSides({ points: outline, lockedEdgeLengths: {}, lockedVertexAngles: {}, sides: [] })
  const order = sides.map((s) => s.index)
  const turnAfter = new Map<number, number>()
  sides.forEach((s, k) => {
    const t = sides[(k + 1) % sides.length]
    turnAfter.set(s.index, (s.b.x - s.a.x) * (t.b.y - t.a.y) - (s.b.y - s.a.y) * (t.b.x - t.a.x))
  })
  /** the room just inside a side, to name its wall after */
  const roomBehind = (i: number, k: number): string | null => {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const o = outwardOf(sides[k])
    const mid = { x: (a.x + b.x) / 2 - o.x * 300, y: (a.y + b.y) / 2 + o.y * 300 }
    return graph.rooms.find((rm) => rm.cells.some((c) => mid.x >= c.x && mid.x <= c.x + c.w && mid.y >= c.y && mid.y <= c.y + c.h))?.name ?? null
  }
  const byFace = new Map<Face, Wall[]>()
  const walls: Wall[] = order.map((i, k) => {
    const a = outline[i]
    const b = outline[(i + 1) % n]
    const prev = order[(k - 1 + order.length) % order.length]
    const face = compassOf(outwardOf(sides[k]))
    const w: Wall = {
      id: `${prefix}${i}`,
      name: `${roomBehind(i, k) ?? `${face} wall`}${suffix}`,
      lengthMm: Math.round(Math.hypot(b.x - a.x, b.y - a.y)),
      top: flat(top),
      bottom: flat(bottom),
      openings: [],
      // an outside corner gets a facing on each wall; an inside one a
      // scriber, on the wall before it
      leftEnd: (turnAfter.get(prev) ?? 1) > 0 ? "externalFacing" : "none",
      rightEnd: (turnAfter.get(i) ?? 1) > 0 ? "externalFacing" : "internalScriber",
      coverMm: null,
    }
    byFace.set(face, [...(byFace.get(face) ?? []), w])
    return w
  })
  // each face's walls left to right: the way round, starting after a gap
  for (const [face, ws] of byFace) {
    const idx = (w: Wall) => order.indexOf(Number(w.id.slice(prefix.length)))
    ws.sort((p, q) => idx(p) - idx(q))
    const ids = ws.map(idx)
    const gap = ids.findIndex((v, k) => k > 0 && v !== ids[k - 1] + 1)
    if (gap > 0 && ids[0] === 0 && ids[ids.length - 1] === order.length - 1) byFace.set(face, [...ws.slice(gap), ...ws.slice(0, gap)])
  }
  const layout = houseLayout({
    settings: WB_DEFAULTS,
    elevations: [{ id: "x", name: "x", walls }],
    plan: { method: "footprint", chain: { order: [], steps: {} }, footprint: { points: outline, lockedEdgeLengths: {}, lockedVertexAngles: {}, sides: outline.map((_, i) => `${prefix}${i}`) } },
  })
  return { outline, walls, layout, byFace }
}

export interface Cladding {
  project: WeatherboardProject
  /** the main roof, over the top storey */
  roof: Roof | null
  /** with a first floor: the roofs over the ground floor it doesn't cover */
  lowerRoofs: Roof[]
  ground: HouseLayout
  upper: HouseLayout | null
  /** the first floor's floor level (z) */
  upperFloorZ: number
  walls: Map<string, Wall>
}

/** The weatherboard project for the house as it stands (no openings yet). */
export function houseCladding(house: HouseProject, graph: FloorGraph, upperGraph: FloorGraph | null = null): Cladding | null {
  const groundOutline = simplify(graph.outline)
  if (groundOutline.length < 3) return null
  const st = house.settings
  const H0 = st.studHeightMm
  const upperOutline = house.upper && upperGraph ? simplify(upperGraph.outline) : []
  const twoStorey = upperOutline.length >= 3
  const floorZ = H0 + st.floorDepthMm
  const top = twoStorey ? floorZ + (house.upper?.studHeightMm ?? H0) : H0

  const g = storeyWalls(groundOutline, graph, "hs", 0, H0, "")
  const u = twoStorey ? storeyWalls(upperOutline, upperGraph!, "us", floorZ, top, " (upstairs)") : null
  const walls = new Map([...g.walls, ...(u?.walls ?? [])].map((w) => [w.id, w]))

  // the main roof over the top storey: built once to trace the walls' tops
  // off, then again so it knows the gable walls are peaked now
  const topStorey = u ?? g
  const topWalls = new Map(topStorey.walls.map((w) => [w.id, w]))
  // (each wing turned by hand, by its key: see HouseSettings.turnedSpans)
  const sectionsOf = (prefix: string): Record<number, WingSetting> =>
    Object.fromEntries(Object.entries(st.roofSections ?? {}).flatMap(([k, v]) => (k.startsWith(prefix) && /^\d+$/.test(k.slice(prefix.length)) ? [[Number(k.slice(prefix.length)), v]] : [])))
  const mainPlan: RoofPlan = { ...st.roof, wingSet: sectionsOf("m:") }
  let roof = buildRoof(topStorey.layout, topWalls, mainPlan)
  if (roof) {
    for (const s of topStorey.layout.sides) {
      const w = s.wallId ? topWalls.get(s.wallId) : undefined
      if (w) w.top = topFromRoofs([roof], s.a, s.b, top)
    }
    roof = buildRoof(topStorey.layout, topWalls, mainPlan)
  }

  // the lower roofs, over what the first floor doesn't cover, up against it
  const lowerRoofs: Roof[] = []
  if (u) {
    const toWorld = (p: P2): P2 => ({ x: p.x, y: -p.y })
    const abut = u.layout.sides.map((s) => ({ a: s.a, b: s.b }))
    const lowerPlan: RoofPlan = { ...st.roof, type: st.lowerRoof.type, pitchDeg: st.lowerRoof.pitchDeg }
    for (const region of uncovered(groundOutline, upperOutline).regions) {
      // (stand-in walls along it at the ground floor's eaves: all the roof reads off them)
      const ws: Wall[] = region.map((p, i) => {
        const q = region[(i + 1) % region.length]
        return { id: `lr${i}`, name: "", lengthMm: Math.round(Math.hypot(q.x - p.x, q.y - p.y)), top: flat(H0), bottom: flat(0), openings: [], leftEnd: "none", rightEnd: "none", coverMm: null }
      })
      const layout = houseLayout({
        settings: WB_DEFAULTS,
        elevations: [{ id: "x", name: "x", walls: ws }],
        plan: { method: "footprint", chain: { order: [], steps: {} }, footprint: { points: region, lockedEdgeLengths: {}, lockedVertexAngles: {}, sides: ws.map((w) => w.id) } },
      })
      const r = buildRoof(layout, new Map(ws.map((w) => [w.id, w])), { ...lowerPlan, wingSet: sectionsOf(`l:${lowerRoofs.length}:`) }, { abut })
      if (r) lowerRoofs.push(r)
    }
    // the ground floor's walls: their tops off the lower roof (eaves
    // elsewhere) — bar those standing under the storey above
    const upperWorld = upperOutline.map(toWorld)
    // (a wall's held where it runs along one of the storey above's walls,
    // not where it only meets one end on)
    const parallel = (a: P2, b: P2, c: P2, d: P2) => Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)) < 1e-3 * Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(d.x - c.x, d.y - c.y)
    const held = {
      at: (p: P2, a: P2, b: P2) =>
        upperWorld.some((q, i) => {
          const r = upperWorld[(i + 1) % upperWorld.length]
          return parallel(a, b, q, r) && onSegment(p, q, r)
        }),
      corners: upperWorld,
    }
    for (const s of g.layout.sides) {
      const w = s.wallId ? walls.get(s.wallId) : undefined
      if (w) w.top = topFromRoofs(lowerRoofs, s.a, s.b, H0, held)
    }
    // the first floor's: their bottoms on the wall below, or the lower roof
    const groundWorld = groundOutline.map(toWorld)
    for (const s of u.layout.sides) {
      const w = s.wallId ? walls.get(s.wallId) : undefined
      if (w) w.bottom = bottomOver(groundWorld, lowerRoofs, s.a, s.b, H0, floorZ)
    }
  }

  const elevations: Elevation[] = COMPASS.filter((c) => g.byFace.has(c) || u?.byFace.has(c)).map((c) => {
    const ws = [...(g.byFace.get(c) ?? []), ...(u?.byFace.get(c) ?? [])]
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

  const project: WeatherboardProject = {
    settings: WB_DEFAULTS,
    elevations,
    plan: {
      method: "footprint",
      chain: { order: [], steps: {} },
      footprint: { points: groundOutline, lockedEdgeLengths: {}, lockedVertexAngles: {}, sides: groundOutline.map((_, i) => `hs${i}`) },
      // (the weatherboards' 3D view is one storey: two storeys go without its roof)
      roof: twoStorey ? { ...st.roof, type: "none" } : st.roof,
    },
  }
  return { project, roof, lowerRoofs, ground: g.layout, upper: u?.layout ?? null, upperFloorZ: floorZ, walls }
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

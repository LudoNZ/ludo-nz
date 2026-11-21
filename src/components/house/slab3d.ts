/** A slab ground floor's rib raft, as the 3D view and the showcase draw it:
 * the pods on the hardfill, the steel (bars in the beams and ribs, the
 * mesh over the top on its chairs), and the concrete — each a part of its
 * own, so the showcase can lay the pods, drop the steel, then pour. World
 * mm, x east, y north (= −plan y), z up from the finished floor. Pure. */

import { makeSolid, Solid } from "../stairs/stairRender3d"
import type { V3 } from "../render3d/perspective"
import { ribRaft, ribRaftFromData, RibRaftResult } from "../ribRaft/ribRaft"
import { FloorGraph, simplify } from "./floorPlan"
import { HouseProject, onParty, Pt } from "./houseTypes"
import type { Structure } from "./structure"

export const SLAB_COLOURS = { concrete: "#bdb9b0", pod: "#f3f3ee", bar: "#8b4a2b", mesh: "#5f5b55", boxing: "#c9a36b", peg: "#8f6a3c", dpm: "#2c3238" }

/** the rib raft under a house with a slab ground floor (null: it's timber, or has no plan yet) */
export function houseSlab(house: HouseProject, graph: FloorGraph, structure: Structure): { outline: Pt[]; result: RibRaftResult; beams: { a: Pt; b: Pt }[] } | null {
  if ((house.settings.groundFloor?.kind ?? "timber") !== "slab") return null
  const outline = simplify(graph.outline)
  if (outline.length < 4) return null
  const beams = graph.walls.filter((w) => structure.inside.get(w.id)?.loadBearing).map((w) => ({ a: w.a, b: w.b }))
  const joints = outline.flatMap((p, i) => (onParty(house.floor.party, p, outline[(i + 1) % outline.length]) ? [i] : []))
  return { outline, beams, result: ribRaft({ outline, beams, joints }, ribRaftFromData(house.settings.ribRaft)) }
}

/** a box on plan (x0–x1 across, y0–y1 down) from z0 to z1 */
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string): Solid => {
  const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)]
  const [c, d] = [-Math.max(y0, y1), -Math.min(y0, y1)]
  const p = (x: number, y: number, z: number): V3 => [x, y, z]
  return makeSolid([
    // (its top first: the face the seams are hidden on)
    { pts: [p(a, c, z1), p(b, c, z1), p(b, d, z1), p(a, d, z1)], color },
    { pts: [p(a, c, z0), p(a, d, z0), p(b, d, z0), p(b, c, z0)], color },
    { pts: [p(a, c, z0), p(b, c, z0), p(b, c, z1), p(a, c, z1)], color },
    { pts: [p(b, c, z0), p(b, d, z0), p(b, d, z1), p(b, c, z1)], color },
    { pts: [p(b, d, z0), p(a, d, z0), p(a, d, z1), p(b, d, z1)], color },
    { pts: [p(a, d, z0), p(a, c, z0), p(a, c, z1), p(a, d, z1)], color },
  ])
}

/** a bar along a plan line at height z (drawn thicker than it is, to be seen) */
const bar = (a: Pt, b: Pt, z: number, color: string, t = 30) =>
  Math.abs(a.x - b.x) < 1 ? box(a.x - t / 2, a.x + t / 2, a.y, b.y, z - t / 2, z + t / 2, color) : box(a.x, b.x, a.y - t / 2, a.y + t / 2, z - t / 2, z + t / 2, color)

const insidePoly = (pts: Pt[], p: Pt) => {
  let ins = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) ins = !ins
  }
  return ins
}

/** the outline as rectangles (strips between its corners' x, merged down each strip) */
export function outlineRects(outline: Pt[]): { x0: number; x1: number; y0: number; y1: number }[] {
  const xs = [...new Set(outline.map((p) => p.x))].sort((a, b) => a - b)
  const ys = [...new Set(outline.map((p) => p.y))].sort((a, b) => a - b)
  const out: { x0: number; x1: number; y0: number; y1: number }[] = []
  for (let i = 0; i + 1 < xs.length; i++) {
    let start: number | null = null
    for (let j = 0; j + 1 <= ys.length; j++) {
      const inside = j + 1 < ys.length && insidePoly(outline, { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 })
      if (inside && start === null) start = ys[j]
      if (!inside && start !== null) {
        out.push({ x0: xs[i], x1: xs[i + 1], y0: start, y1: ys[j] })
        start = null
      }
    }
  }
  return out
}

/** a straight run inside the outline along a line (horizontal at y, or vertical at x), as segments */
const runsAcross = (outline: Pt[], axis: "x" | "y", at: number, inset: number): [number, number][] => {
  const cuts = [...new Set(outline.map((p) => (axis === "y" ? p.x : p.y)))].sort((a, b) => a - b)
  const runs: [number, number][] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const mid = (cuts[i] + cuts[i + 1]) / 2
    const p = axis === "y" ? { x: mid, y: at } : { x: at, y: mid }
    if (!insidePoly(outline, p)) continue
    const last = runs[runs.length - 1]
    if (last && Math.abs(last[1] - cuts[i]) < 1) last[1] = cuts[i + 1]
    else runs.push([cuts[i], cuts[i + 1]])
  }
  return runs.map(([a, b]) => [a + inset, b - inset] as [number, number]).filter(([a, b]) => b - a > 50)
}

export type SlabMember = "pods" | "steel" | "slab" | "boxing" | "dpm"

/** The rib raft's parts as solids: pods, steel and mesh, concrete. The concrete's top is the floor (z 0). */
export function slabSolids(slab: NonNullable<ReturnType<typeof houseSlab>>, depthMm: number, toppingMm: number): { solid: Solid; member: SlabMember }[] {
  const { outline, result, beams } = slab
  const out: { solid: Solid; member: SlabMember }[] = []
  const z0 = -depthMm
  const podTop = -toppingMm
  // the pods, on the hardfill
  for (const p of result.pods) out.push({ solid: box(p.x, p.x + p.w, p.y, p.y + p.h, z0, podTop, SLAB_COLOURS.pod), member: "pods" })
  // the edge beams' bars: two at the bottom, one at the top, round the beam's middle
  const n = outline.length
  const area = outline.reduce((s, p, i) => s + p.x * outline[(i + 1) % n].y - outline[(i + 1) % n].x * p.y, 0)
  const sign = area > 0 ? 1 : -1
  const inward = (a: Pt, b: Pt, d: number) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: (-(b.y - a.y) / l) * sign * d, y: ((b.x - a.x) / l) * sign * d }
  }
  const ring = (d: number) =>
    outline.map((p, i) => {
      const n0 = inward(outline[(i - 1 + n) % n], p, d)
      const n1 = inward(p, outline[(i + 1) % n], d)
      return { x: p.x + n0.x + n1.x, y: p.y + n0.y + n1.y }
    })
  const cover = 50
  for (const [d, z] of [
    [cover + 20, z0 + cover + 20],
    [300 - cover - 20, z0 + cover + 20],
    [150, podTop - cover],
  ] as const) {
    const r = ring(d)
    r.forEach((p, i) => out.push({ solid: bar(p, r[(i + 1) % r.length], z, SLAB_COLOURS.bar), member: "steel" }))
  }
  // the internal beams' bars, and each rib's
  for (const b of beams)
    for (const off of [-60, 60]) {
      const v = Math.abs(b.a.x - b.b.x) < 1
      const a = v ? { x: b.a.x + off, y: b.a.y } : { x: b.a.x, y: b.a.y + off }
      const c = v ? { x: b.b.x + off, y: b.b.y } : { x: b.b.x, y: b.b.y + off }
      out.push({ solid: bar(a, c, z0 + cover + 20, SLAB_COLOURS.bar), member: "steel" })
    }
  for (const r of result.ribRuns) out.push({ solid: bar(r.a, r.b, z0 + cover + 20, SLAB_COLOURS.bar), member: "steel" })
  // the mesh, over the pods on its chairs (a wire every 600 drawn — it's 200 — so it reads)
  const zMesh = -toppingMm / 2
  const xs = outline.map((p) => p.x)
  const ys = outline.map((p) => p.y)
  for (let x = Math.min(...xs) + 300; x < Math.max(...xs) - 100; x += 600)
    for (const [a, b] of runsAcross(outline, "x", x, cover)) out.push({ solid: bar({ x, y: a }, { x, y: b }, zMesh, SLAB_COLOURS.mesh, 18), member: "steel" })
  for (let y = Math.min(...ys) + 300; y < Math.max(...ys) - 100; y += 600)
    for (const [a, b] of runsAcross(outline, "y", y, cover)) out.push({ solid: bar({ x: a, y }, { x: b, y }, zMesh, SLAB_COLOURS.mesh, 18), member: "steel" })
  // the boxing round the edge: a board just outside each side, from below the ground to a little over the floor, pegged
  const boardT = 40
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % n]
    const o = inward(p, q, -boardT / 2)
    const a = { x: p.x + o.x, y: p.y + o.y }
    const b = { x: q.x + o.x, y: q.y + o.y }
    // (a level side's board runs the corners' width further, to close them)
    const level = Math.abs(a.y - b.y) < 1
    const ext = level ? boardT : 0
    const [x0, x1] = [Math.min(a.x, b.x) - ext, Math.max(a.x, b.x) + ext]
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)]
    out.push({ solid: level ? box(x0, x1, a.y - boardT / 2, a.y + boardT / 2, z0, 40, SLAB_COLOURS.boxing) : box(a.x - boardT / 2, a.x + boardT / 2, y0, y1, z0, 40, SLAB_COLOURS.boxing), member: "boxing" })
    const L = Math.hypot(q.x - p.x, q.y - p.y)
    const po = inward(p, q, -boardT - 30)
    for (let d = 300; d < L - 100; d += 1200) {
      const c = { x: p.x + ((q.x - p.x) * d) / L + po.x, y: p.y + ((q.y - p.y) * d) / L + po.y }
      out.push({ solid: box(c.x - 25, c.x + 25, c.y - 25, c.y + 25, z0 - 150, 250, SLAB_COLOURS.peg), member: "boxing" })
    }
  })
  // the DPM under it all, lapped out past the edge
  for (const r of outlineRects(outline)) out.push({ solid: box(r.x0 - 150, r.x1 + 150, r.y0 - 150, r.y1 + 150, z0 - 12, z0 - 2, SLAB_COLOURS.dpm), member: "dpm" })
  // the concrete, as rectangles (their tops run on seamless)
  for (const r of outlineRects(outline)) out.push({ solid: box(r.x0, r.x1, r.y0, r.y1, z0, 0, SLAB_COLOURS.concrete), member: "slab" })
  return out
}

/** the showcase's lines for the slab's stages, from the rib raft(s) under the house (or each house of a terrace) */
export function slabFacts(rs: RibRaftResult[], mpa: number): { boxing: string; dpm: string; pods: string; steel: string; pour: string } {
  const sum = (f: (r: RibRaftResult) => number) => rs.reduce((t, r) => t + f(r), 0)
  const many = rs.length > 1
  return {
    boxing: `The site's set out: ${sum((r) => r.boxingM)} m of boxing round ${many ? `${rs.length} slabs` : "the slab"}, pegged, hardfill compacted inside.`,
    dpm: `${sum((r) => r.dpmM2)} m² of DPM over the sand blinding, lapped and taped, up the edges.`,
    pods: `${sum((r) => r.fullPods + r.cutPods)} polystyrene pods go down on the hardfill${many ? ` across ${rs.length} slabs` : ""}, a rib's width apart.`,
    steel: `${sum((r) => r.barMetres).toFixed(0)} m of HD12 in the beams and ribs, and ${sum((r) => r.meshSheets)} sheets of mesh on chairs over the top.`,
    pour: `The truck's here: ${sum((r) => r.concreteToOrderM3).toFixed(1)} m³ of ${mpa} MPa concrete${many ? ", slab by slab" : ""}, poured in one go.`,
  }
}

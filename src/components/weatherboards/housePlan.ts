/** Where every wall sits on plan, for the 3D view. A project's plan can be
 * set out either way (see HousePlan in types.ts):
 *
 *  - "chain": the elevations joined up round the house in order, each
 *    running on from where the last one finished and turning a corner
 *    between them, with any steps in or out along the way;
 *  - "footprint": an outline drawn on plan, and the wall that clads each
 *    of its sides.
 *
 * Either way it comes out as one layout: the sides of the house in order
 * round it, each one a stretch of a wall (from x0 to x1 along it) or a
 * plain side no wall here clads (a step's return, say). World mm, x east,
 * y north. Walking a wall from its left end to its right (as seen from
 * outside), its outside is to your right — so the sides run
 * anticlockwise round the house. Pure — no React. */

import { ChainPlan, Elevation, FootprintPlan, HousePlan, Wall, WeatherboardProject } from "./types"

export interface P2 {
  x: number
  y: number
}

/** a stretch of one wall, or a plain side between walls */
export interface PlanSide {
  a: P2
  b: P2
  /** null: a plain side (heights taken from the walls either side) */
  wallId: string | null
  /** for a wall's side: the stretch of the wall, mm from its left end */
  x0: number
  x1: number
}

export interface HouseLayout {
  sides: PlanSide[]
  /** the sides go right round and meet up */
  closed: boolean
  /** how far the outline misses closing, mm (chain only) */
  gapMm: number
  /** walls with no place on plan */
  unplaced: Wall[]
  warnings: string[]
}

export const DEFAULT_PLAN: HousePlan = { method: "chain", chain: { order: [], steps: {} }, footprint: null }

/** how close the ends of a chain have to come to count as closed */
const CLOSE_MM = 50

const fmt = (mm: number) => `${(mm / 1000).toFixed(2)} m`

// ── compass ─────────────────────────────────────────────────────────────

type Compass = "N" | "W" | "S" | "E"
/** going round anticlockwise (seen from above), this is the order the
 * faces come in: the north face runs west, then the west face south… */
const ROUND: Compass[] = ["N", "W", "S", "E"]
/** which way a face runs, left to right seen from outside */
const HEADING: Record<Compass, P2> = { N: { x: -1, y: 0 }, W: { x: 0, y: -1 }, S: { x: 1, y: 0 }, E: { x: 0, y: 1 } }

export const compassOf = (name: string): Compass | null => {
  const w = name.trim().toLowerCase()
  if (/^(n|north)\b/.test(w)) return "N"
  if (/^(s|south)\b/.test(w)) return "S"
  if (/^(e|east)\b/.test(w)) return "E"
  if (/^(w|west)\b/.test(w)) return "W"
  return null
}

/** The elevations in the order they meet going round: as set, or (not
 * yet set) the compass faces in their order round, then any others in
 * tab order. Elevations added since the order was set come at the end. */
export const chainOrder = (elevations: Elevation[], chain: ChainPlan): Elevation[] => {
  const byId = new Map(elevations.map((e) => [e.id, e]))
  let picked = chain.order.map((id) => byId.get(id)).filter((e): e is Elevation => !!e)
  if (!picked.length) {
    const compass = elevations.filter((e) => compassOf(e.name) && e.walls.length)
    const faces = new Set(compass.map((e) => compassOf(e.name)!))
    // start after a gap, so the faces there are run on from one another
    // (just North and East: East, then round the corner to North)
    const opener = compass.find((e) => !faces.has(ROUND[(ROUND.indexOf(compassOf(e.name)!) + 3) % 4])) ?? compass[0]
    const first = opener ? ROUND.indexOf(compassOf(opener.name)!) : 0
    const rank = (e: Elevation) => (ROUND.indexOf(compassOf(e.name)!) - first + 4) % 4
    picked = [...compass].sort((a, b) => rank(a) - rank(b) || elevations.indexOf(a) - elevations.indexOf(b))
  }
  return [...picked, ...elevations.filter((e) => !picked.includes(e))]
}

// ── geometry ────────────────────────────────────────────────────────────

const add = (a: P2, d: P2, k: number): P2 => ({ x: a.x + d.x * k, y: a.y + d.y * k })
const dist = (a: P2, b: P2) => Math.hypot(b.x - a.x, b.y - a.y)
/** a quarter turn anticlockwise */
const left = (d: P2): P2 => ({ x: -d.y, y: d.x })
/** outside of a side running a → b: to its right */
export const outwardOf = (s: { a: P2; b: P2 }): P2 => {
  const l = dist(s.a, s.b) || 1
  return { x: (s.b.y - s.a.y) / l, y: -(s.b.x - s.a.x) / l }
}

const sortedCorners = (w: Wall) => [...(w.corners ?? [])].filter((c) => c.x > 0 && c.x < w.lengthMm).sort((a, b) => a.x - b.x)

/** what a step key reads as, for the chain's list of steps */
export interface ChainStep {
  key: string
  label: string
  value: number
}

/** every place along the chain a step can go, in order */
export const chainSteps = (elevations: Elevation[], chain: ChainPlan): ChainStep[] => {
  const out: ChainStep[] = []
  for (const e of chainOrder(elevations, chain))
    e.walls.forEach((w, wi) => {
      sortedCorners(w).forEach((c) =>
        out.push({ key: `c:${c.id}`, label: `${e.name} · ${w.name}, corner at ${fmt(c.x)}`, value: chain.steps[`c:${c.id}`] ?? 0 }),
      )
      const next = e.walls[wi + 1]
      if (next) out.push({ key: w.id, label: `${e.name} · ${w.name} → ${next.name}`, value: chain.steps[w.id] ?? 0 })
    })
  return out
}

function chainLayout(elevations: Elevation[], chain: ChainPlan): HouseLayout {
  const sides: PlanSide[] = []
  const start: P2 = { x: 0, y: 0 }
  let pos = start
  let heading: P2 | null = null
  const step = (key: string) => {
    const depth = chain.steps[key] ?? 0
    if (Math.abs(depth) < 1 || !heading) return
    // out toward you is the face's outside: to the right of its heading
    const out = { x: heading.y, y: -heading.x }
    const b = add(pos, out, depth)
    sides.push({ a: pos, b, wallId: null, x0: 0, x1: 0 })
    pos = b
  }
  for (const e of chainOrder(elevations, chain)) {
    if (!e.walls.length) continue
    const c = compassOf(e.name)
    heading = c ? HEADING[c] : heading ? left(heading) : HEADING.S
    const d = heading
    e.walls.forEach((w, wi) => {
      const xs = [0, ...sortedCorners(w).map((k) => k.x), w.lengthMm]
      const corners = sortedCorners(w)
      for (let k = 0; k + 1 < xs.length; k++) {
        const b = add(pos, d, xs[k + 1] - xs[k])
        sides.push({ a: pos, b, wallId: w.id, x0: xs[k], x1: xs[k + 1] })
        pos = b
        if (k < corners.length) step(`c:${corners[k].id}`)
      }
      if (wi + 1 < e.walls.length) step(w.id)
    })
  }
  const gapMm = sides.length ? dist(pos, start) : 0
  const closed = sides.length > 2 && gapMm < CLOSE_MM
  const warnings: string[] = []
  const faces = new Set(elevations.filter((e) => e.walls.length).map((e) => compassOf(e.name)))
  const missing = ROUND.filter((c) => !faces.has(c))
  if (sides.length && !closed && missing.length && faces.size === elevations.filter((e) => e.walls.length).length)
    warnings.push(
      `Only part of the house so far — no ${missing.map((c) => ({ N: "north", W: "west", S: "south", E: "east" })[c]).join(" or ")} walls yet, so the outline's left open. Add them, or draw the footprint to close it up.`,
    )
  else if (sides.length && !closed)
    warnings.push(
      `The walls don't meet up round the house — the last one finishes ${fmt(gapMm)} from where the first starts. Check the lengths and steps, add the missing elevations, or draw the footprint instead.`,
    )
  return { sides, closed, gapMm, unplaced: [], warnings }
}

// ── footprint ───────────────────────────────────────────────────────────

/** the footprint's sides in world mm, anticlockwise, each with the index
 * of the stored side it came from */
export const footprintSides = (fp: FootprintPlan): { a: P2; b: P2; index: number }[] => {
  const pts = fp.points.map((p) => ({ x: p.x, y: -p.y }))
  const n = pts.length
  let area = 0
  for (let i = 0; i < n; i++) area += pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y
  const all = pts.map((a, i) => ({ a, b: pts[(i + 1) % n], index: i }))
  return area >= 0 ? all : all.reverse().map((s) => ({ a: s.b, b: s.a, index: s.index }))
}

function footprintLayout(walls: Wall[], fp: FootprintPlan): HouseLayout {
  const byId = new Map(walls.map((w) => [w.id, w]))
  const raw = footprintSides(fp)
  // start from a side that begins a run of one wall, so a wall wrapping
  // past the first side stays in one piece
  const wallAt = (i: number) => {
    const id = fp.sides[raw[(i + raw.length) % raw.length].index] ?? null
    return id && byId.has(id) ? id : null
  }
  let s0 = raw.findIndex((_, i) => wallAt(i) !== wallAt(i - 1))
  if (s0 < 0) s0 = 0
  const ordered = raw.map((_, i) => raw[(i + s0) % raw.length])
  const along = new Map<string, number>()
  const sides: PlanSide[] = []
  for (const s of ordered) {
    const id = fp.sides[s.index] ?? null
    const w = id ? byId.get(id) : undefined
    const len = dist(s.a, s.b)
    if (!w) {
      sides.push({ ...s, wallId: null, x0: 0, x1: 0 })
      continue
    }
    const x0 = along.get(w.id) ?? 0
    const x1 = Math.min(w.lengthMm, x0 + len)
    along.set(w.id, x0 + len)
    if (x1 - x0 < 1) {
      sides.push({ ...s, wallId: null, x0: 0, x1: 0 })
      continue
    }
    const b = add(s.a, { x: (s.b.x - s.a.x) / len, y: (s.b.y - s.a.y) / len }, x1 - x0)
    sides.push({ a: s.a, b, wallId: w.id, x0, x1 })
    // the side's longer than the wall: the rest of it is plain
    if (len - (x1 - x0) > 1) sides.push({ a: b, b: s.b, wallId: null, x0: 0, x1: 0 })
  }
  const warnings: string[] = []
  for (const [id, used] of along) {
    const w = byId.get(id)!
    if (Math.abs(used - w.lengthMm) > 20)
      warnings.push(
        used > w.lengthMm
          ? `${w.name} is ${fmt(w.lengthMm)} long, but the sides it's on add up to ${fmt(used)} — the rest is left plain.`
          : `${w.name} is ${fmt(w.lengthMm)} long, but the sides it's on only add up to ${fmt(used)} — the last ${fmt(w.lengthMm - used)} isn't shown.`,
      )
  }
  return { sides, closed: true, gapMm: 0, unplaced: walls.filter((w) => !along.has(w.id)), warnings }
}

// ── either way ─────────────────────────────────────────────────────────

export const planOf = (project: WeatherboardProject): HousePlan => project.plan ?? DEFAULT_PLAN

export function houseLayout(project: WeatherboardProject): HouseLayout {
  const plan = planOf(project)
  const walls = project.elevations.flatMap((e) => e.walls)
  if (plan.method === "footprint" && plan.footprint && plan.footprint.points.length >= 3) return footprintLayout(walls, plan.footprint)
  return chainLayout(project.elevations, plan.chain)
}

/** Every storey's layout, the ground floor's first, then each one above
 * (from its own footprint, over the same plan) — named. */
export function houseLayouts(project: WeatherboardProject): { name: string; layout: HouseLayout }[] {
  const walls = project.elevations.flatMap((e) => e.walls)
  const levels = (planOf(project).levels ?? []).filter((l) => l.footprint.points.length >= 3)
  return [{ name: "Ground floor", layout: houseLayout(project) }, ...levels.map((l) => ({ name: l.name, layout: footprintLayout(walls, l.footprint) }))]
}

/** The chain as a footprint to carry on drawing: its outline (closed up
 * if it didn't quite meet), each side keeping the wall it had. */
export function chainToFootprint(project: WeatherboardProject): FootprintPlan | null {
  const { sides } = chainLayout(project.elevations, planOf(project).chain)
  if (sides.length < 3) return null
  const points = sides.map((s) => ({ x: Math.round(s.a.x), y: Math.round(-s.a.y) }))
  return { points, lockedEdgeLengths: {}, lockedVertexAngles: {}, sides: sides.map((s) => s.wallId) }
}

/** The footprint with the walls laid round it in the chain's order, one
 * after another from the side facing the way the first elevation does —
 * each wall taking sides until it's used up its length. Where a wall ends
 * part way along a side, the side's split there (a straight-through
 * corner, which can then be dragged out into a step). */
export function fillInOrder(project: WeatherboardProject, fp: FootprintPlan): FootprintPlan {
  const order = chainOrder(project.elevations, planOf(project).chain).filter((e) => e.walls.length)
  const walls = order.flatMap((e) => e.walls)
  let sides = footprintSides(fp)
  // start on the side facing the way the first elevation does (the
  // north face on the side whose outside is north), else the first side
  const c = order[0] ? compassOf(order[0].name) : null
  if (c && sides.length) {
    const h = HEADING[c]
    const score = (s: { a: P2; b: P2 }) => ((s.b.x - s.a.x) * h.x + (s.b.y - s.a.y) * h.y) / (dist(s.a, s.b) || 1)
    const best = sides.reduce((bi, s, i) => (score(s) > score(sides[bi]) + 1e-6 ? i : bi), 0)
    sides = [...sides.slice(best), ...sides.slice(0, best)]
  }
  const points: P2[] = []
  const out: (string | null)[] = []
  let wi = 0
  let left = walls[0]?.lengthMm ?? 0
  for (const s of sides) {
    const len = dist(s.a, s.b)
    const d = { x: (s.b.x - s.a.x) / (len || 1), y: (s.b.y - s.a.y) / (len || 1) }
    let pos = 0
    while (len - pos > 1) {
      const w = walls[wi]
      points.push(add(s.a, d, pos))
      if (!w) {
        out.push(null)
        break
      }
      out.push(w.id)
      if (left < len - pos - CLOSE_MM) {
        // the wall finishes part way along: split the side there
        pos += left
        wi++
        left = walls[wi]?.lengthMm ?? 0
      } else {
        left -= len - pos
        pos = len
        if (left < CLOSE_MM) {
          wi++
          left = walls[wi]?.lengthMm ?? 0
        }
      }
    }
  }
  return {
    points: points.map((p) => ({ x: Math.round(p.x), y: Math.round(-p.y) })),
    lockedEdgeLengths: {},
    lockedVertexAngles: {},
    sides: out,
  }
}

/** A starting footprint for a project that's never had one: the chain's
 * outline if it closes, otherwise a rectangle round the longest walls. */
export function startingFootprint(project: WeatherboardProject): FootprintPlan {
  const fromChain = chainToFootprint(project)
  if (fromChain && chainLayout(project.elevations, planOf(project).chain).closed) return fromChain
  const lengths = project.elevations.map((e) => e.walls.reduce((s, w) => s + w.lengthMm, 0)).filter((l) => l > 0)
  const w = Math.max(6000, lengths[0] ?? 0)
  const d = Math.max(4000, lengths[1] ?? 0)
  const fp: FootprintPlan = {
    points: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ],
    lockedEdgeLengths: {},
    lockedVertexAngles: {},
    sides: [null, null, null, null],
  }
  return fillInOrder(project, fp)
}

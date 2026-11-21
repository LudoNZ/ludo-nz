/** The inside walls' framing: every wall laid out stick by stick — bottom
 * plate, top plate (doubled on a load-bearing wall), studs at centres,
 * rows of nogs between them, extra studs where walls meet (for the
 * lining), and round each door its trimming studs, a lintel (load-
 * bearing) or a head (not), and short cripple studs over it — then all of
 * it as cut pieces, ordered as stock lengths the way the decks' and
 * stairs' orders are (stairs/stairMaterials.ts).
 *
 * Each wall's frame is laid out in its own elevation: `x` along it from
 * the frame's start (mm), `z` up from its floor. Where a wall meets:
 *  - an outside wall: the frame stops at that wall's framing, OUTSIDE_IN
 *    in from the outline (the outline is the cladding's face);
 *  - the middle of another inside wall: it butts the other's face (half a
 *    stud depth short of the line), and the other gets two junction studs,
 *    one either side of it;
 *  - another wall's end, square to it: one runs through to the corner's
 *    far face and gets a stud beside its end stud; the other butts it. A
 *    wall carried on straight past the corner (two walls in line) runs to
 *    the point and the square one butts.
 *
 * Lintel sizes are a setting, not worked out: check them against NZS 3604
 * for the span and what's over it. mm, plan y down. Pure — no React. */

import { planMixedStock } from "../stairs/stairs"
import type { StairOrderLine } from "../stairs/stairMaterials"
import { makeSolid, Solid, type V3 } from "../stairs/stairRender3d"
import { FloorGraph } from "./floorPlan"
import { Door, FramingSettings, HouseProject, Pt } from "./houseTypes"
import type { Structure } from "./structure"

/** from the outline (the cladding's face) in to the outside wall's framing */
export const OUTSIDE_IN = 130
/** a stud at centres this close to one already there is left out */
const CLOSE = 100
/** the longest plate bought in one length; longer ones are joined */
const MAX_PLATE = 6000

export type MemberKind = "bottomPlate" | "topPlate" | "stud" | "trimmer" | "jack" | "cripple" | "lintel" | "head" | "nog" | "junction"

export const MEMBER_LABELS: Record<MemberKind, string> = {
  bottomPlate: "Bottom plates",
  topPlate: "Top plates",
  stud: "Studs",
  trimmer: "Trimming studs",
  jack: "Jack studs (under lintels)",
  cripple: "Cripple studs (over doors)",
  lintel: "Lintels",
  head: "Door heads",
  nog: "Nogs",
  junction: "Junction & corner studs",
}

export const MEMBER_COLOURS: Record<MemberKind, string> = {
  bottomPlate: "#b98a55",
  topPlate: "#b98a55",
  stud: "#dcbf8f",
  trimmer: "#c99a5e",
  jack: "#c08d52",
  cripple: "#e4cba0",
  lintel: "#9c6a38",
  head: "#b3824c",
  nog: "#cfa874",
  junction: "#d6a86c",
}

export interface WallMember {
  kind: MemberKind
  /** along the wall, from the frame's start */
  x0: number
  x1: number
  /** up from the floor */
  z0: number
  z1: number
  /** the piece cut (mm) — its length along its grain */
  length: number
  /** "190 × 45" etc.; how many of it side by side (a lintel's two) */
  size: string
  plies: number
}

export interface FramedDoor {
  door: Door
  /** the frame's opening, along the wall */
  x0: number
  x1: number
  heightMm: number
}

export interface FramedWall {
  id: string
  storey: 0 | 1
  name: string
  loadBearing: boolean
  /** the frame's two ends on plan */
  start: Pt
  end: Pt
  lengthMm: number
  heightMm: number
  /** where the drawn wall line starts, along the frame (−ve: before it) —
   * to turn a door's place on the line into the frame's */
  lineStartX: number
  members: WallMember[]
  doors: FramedDoor[]
  warnings: string[]
}

export interface HouseFraming {
  walls: FramedWall[]
  /** studs the outside walls need where inside walls meet them, by storey */
  outsideJunctions: { storey: 0 | 1; count: number; length: number }[]
  /** the floor level each storey's framing stands on */
  storeyZ: [number, number]
  settings: FramingSettings
}

const EPS = 5
const len = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)
const near = (a: Pt, b: Pt) => len(a, b) < EPS
const isH = (a: Pt, b: Pt) => Math.abs(a.y - b.y) <= Math.abs(a.x - b.x)
/** p on a → b, not at its ends; how far along */
const alongInterior = (p: Pt, a: Pt, b: Pt): number | null => {
  const L = len(a, b)
  if (L < 1) return null
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L
  const off = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L
  return off < EPS && t > EPS && t < L - EPS ? t : null
}
const onOutline = (p: Pt, outline: Pt[]) => outline.some((q, i) => {
  const r = outline[(i + 1) % outline.length]
  return near(p, q) || alongInterior(p, q, r) !== null
})

/** a length cut into as few near-equal pieces as it takes */
const split = (L: number, max = MAX_PLATE): number[] => {
  if (L <= 0) return []
  const n = Math.ceil(L / max)
  return Array.from({ length: n }, () => L / n)
}

/** room names either side of a wall */
const wallName = (g: FloorGraph, a: Pt, b: Pt, i: number) => {
  const L = len(a, b) || 1
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
  const roomAt = (p: Pt) => g.rooms.find((r) => r.cells.some((c) => p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h))?.name
  const s1 = roomAt({ x: m.x + n.x * 150, y: m.y + n.y * 150 })
  const s2 = roomAt({ x: m.x - n.x * 150, y: m.y - n.y * 150 })
  return s1 && s2 && s1 !== s2 ? `${s1} / ${s2}` : (s1 ?? s2 ?? `Wall ${i + 1}`)
}

interface EndInfo {
  /** how far in from the line's end the frame stops (−ve: past it) */
  off: number
  /** a stud beside its end stud (the corner's, or a T made at the end) */
  backing: boolean
  outside: boolean
}

function storeyFraming(
  g: FloorGraph,
  doors: Door[],
  structure: Structure | null,
  heightMm: number,
  storey: 0 | 1,
  st: FramingSettings,
): { walls: FramedWall[]; outsideMeets: number } {
  const D = st.studDepthMm
  const T = st.studThickMm
  const half = D / 2
  const walls = g.walls.filter((w) => len(w.a, w.b) > 50)
  const studSize = `${D} × ${T}`
  let outsideMeets = 0

  const endOf = (wi: number, p: Pt): EndInfo => {
    const w = walls[wi]
    if (g.outline.length >= 3 && onOutline(p, g.outline)) return { off: OUTSIDE_IN, backing: false, outside: true }
    if (walls.some((o, oi) => oi !== wi && alongInterior(p, o.a, o.b) !== null)) return { off: half, backing: false, outside: false }
    const meeting = walls.map((o, oi) => ({ o, oi })).filter(({ o }) => near(o.a, p) || near(o.b, p))
    const mine = isH(w.a, w.b)
    const same = meeting.filter(({ o }) => isH(o.a, o.b) === mine)
    const other = meeting.filter(({ o }) => isH(o.a, o.b) !== mine)
    if (!other.length) return { off: 0, backing: false, outside: false }
    if (same.length >= 2 && other.length >= 2) return mine ? { off: 0, backing: true, outside: false } : { off: half, backing: false, outside: false }
    if (same.length >= 2) return { off: 0, backing: true, outside: false }
    if (other.length >= 2) return { off: half, backing: false, outside: false }
    // a corner: the first drawn runs through
    return wi < other[0].oi ? { off: -half, backing: true, outside: false } : { off: half, backing: false, outside: false }
  }

  const framed = walls.map((w, wi): FramedWall => {
    const lineL = len(w.a, w.b)
    const d = { x: (w.b.x - w.a.x) / lineL, y: (w.b.y - w.a.y) / lineL }
    const e0 = endOf(wi, w.a)
    const e1 = endOf(wi, w.b)
    if (e0.outside) outsideMeets++
    if (e1.outside) outsideMeets++
    const L = Math.max(0, lineL - e0.off - e1.off)
    const start = { x: w.a.x + d.x * e0.off, y: w.a.y + d.y * e0.off }
    const end = { x: w.b.x - d.x * e1.off, y: w.b.y - d.y * e1.off }
    const lb = !!structure?.inside.get(w.id)?.loadBearing
    const tops = lb && st.doubleTopPlateLB ? 2 : 1
    const studTop = heightMm - tops * T
    const studLen = studTop - T
    const warnings: string[] = []
    const members: WallMember[] = []
    const piece = (kind: MemberKind, x0: number, x1: number, z0: number, z1: number, horizontal: boolean, size = studSize, plies = 1) =>
      members.push({ kind, x0, x1, z0, z1, length: Math.round(horizontal ? x1 - x0 : z1 - z0), size, plies })

    // ── the doors' openings ──
    const side = lb ? 2 * T : T
    const opens: FramedDoor[] = []
    for (const door of doors.filter((x) => x.wallId === w.id)) {
      const W = door.widthMm + st.doorWidthAllowanceMm
      const Hr = door.heightMm + st.doorHeightAllowanceMm
      let x0 = door.atMm - e0.off - W / 2
      if (L < W + 2 * side) {
        warnings.push(`A ${door.widthMm} mm door doesn't fit in this wall.`)
        continue
      }
      const clamped = Math.min(Math.max(x0, side), L - side - W)
      if (Math.abs(clamped - x0) > 1) warnings.push(`A door's too near the end of the wall for its trimming studs — it's framed ${Math.round(Math.abs(clamped - x0))} mm further in.`)
      x0 = clamped
      const x1 = x0 + W
      if (opens.some((o) => x0 - side < o.x1 + side && x1 + side > o.x0 - side)) {
        warnings.push("Two doors overlap (or leave no room for their studs between them) — the second is left out.")
        continue
      }
      const over = lb ? st.lintelDepthMm : T
      if (Hr + over > studTop) warnings.push(`A door's ${lb ? "lintel" : "head"} doesn't fit under the top plate — lower the door${lb ? " or the lintel" : ""}.`)
      opens.push({ door, x0, x1, heightMm: Math.min(Hr, studTop - over) })
    }
    opens.sort((p, q) => p.x0 - q.x0)

    // ── plates ──
    let at = 0
    const bottomRuns: [number, number][] = []
    for (const o of opens) {
      bottomRuns.push([at, o.x0])
      at = o.x1
    }
    bottomRuns.push([at, L])
    for (const [p, q] of bottomRuns)
      if (q - p > 1) {
        let x = p
        for (const s of split(q - p)) {
          piece("bottomPlate", x, x + s, 0, T, true)
          x += s
        }
      }
    for (let k = 0; k < tops; k++) {
      let x = 0
      for (const s of split(L)) {
        piece("topPlate", x, x + s, studTop + k * T, studTop + (k + 1) * T, true)
        x += s
      }
    }

    // ── studs that stand full height, and the doors' framing ──
    const full: [number, number, MemberKind][] = []
    const clash = (x0: number, x1: number) => full.some(([p, q]) => x0 < q - 1 && x1 > p + 1)
    const addFull = (x0: number, x1: number, kind: MemberKind) => {
      if (x0 < -1 || x1 > L + 1 || clash(x0, x1)) return
      full.push([x0, x1, kind])
    }
    for (const o of opens) {
      addFull(o.x0 - side, o.x0 - side + T, "trimmer")
      addFull(o.x1 + side - T, o.x1 + side, "trimmer")
      const top = o.heightMm
      if (lb) {
        piece("jack", o.x0 - T, o.x0, T, top, false)
        piece("jack", o.x1, o.x1 + T, T, top, false)
        piece("lintel", o.x0 - T, o.x1 + T, top, top + st.lintelDepthMm, true, `${st.lintelDepthMm} × ${T}`, 2)
      } else piece("head", o.x0, o.x1, top, top + T, true)
    }
    addFull(0, T, "stud")
    addFull(L - T, L, "stud")
    if (e0.backing) addFull(T, 2 * T, "junction")
    if (e1.backing) addFull(L - 2 * T, L - T, "junction")
    // other walls butting into this one's middle: a stud either side of each
    walls.forEach((o, oi) => {
      if (oi === wi) return
      for (const p of [o.a, o.b]) {
        const t = alongInterior(p, w.a, w.b)
        if (t === null) continue
        const x = t - e0.off
        addFull(x - half - T, x - half, "junction")
        addFull(x + half, x + half + T, "junction")
      }
    })
    // the rest at centres, measured from the start; over a door, cripples
    const C = Math.max(200, st.studCentresMm)
    for (let c = C; c < L - T; c += C) {
      const x0 = c - T / 2
      const x1 = c + T / 2
      const o = opens.find((op) => x1 > op.x0 - (lb ? T : 0) && x0 < op.x1 + (lb ? T : 0))
      if (o) {
        const bottom = o.heightMm + (lb ? st.lintelDepthMm : T)
        if (studTop - bottom >= 40 && x0 >= o.x0 - (lb ? T : 0) && x1 <= o.x1 + (lb ? T : 0)) piece("cripple", x0, x1, bottom, studTop, false)
        continue
      }
      // (one right beside a stud already there would only leave a sliver of a bay)
      if (full.some(([p, q]) => x0 < q + CLOSE && x1 > p - CLOSE)) continue
      addFull(x0, x1, "stud")
    }
    full.sort((p, q) => p[0] - q[0])
    for (const [x0, x1, kind] of full) piece(kind, x0, x1, T, studTop, false)

    // ── nogs: rows across each bay between full-height studs ──
    const rows = Math.max(0, Math.ceil(studLen / Math.max(200, st.nogMaxMm)) - 1)
    for (let i = 0; i + 1 < full.length; i++) {
      const p = full[i][1]
      const q = full[i + 1][0]
      if (q - p < 10) continue
      if (opens.some((o) => p < o.x1 && q > o.x0)) continue
      for (let k = 1; k <= rows; k++) {
        const z = T + (k * studLen) / (rows + 1)
        piece("nog", p, q, z - T / 2, z + T / 2, true)
      }
    }

    return {
      id: w.id,
      storey,
      name: wallName(g, w.a, w.b, wi),
      loadBearing: lb,
      start,
      end,
      lengthMm: Math.round(L),
      heightMm,
      lineStartX: -e0.off,
      members,
      doors: opens,
      warnings,
    }
  })
  return { walls: framed, outsideMeets }
}

/** Every inside wall of the house framed. `structures` says which are
 * load-bearing; `upperFloorZ` is where the first floor's framing stands. */
export function houseFraming(
  house: HouseProject,
  graph: FloorGraph,
  upperGraph: FloorGraph | null,
  structures: { ground: Structure; upper: Structure | null },
  upperFloorZ: number,
): HouseFraming {
  const st = house.settings.framing
  const outsideStud = house.settings.studHeightMm - st.studThickMm * (st.doubleTopPlateLB ? 3 : 2)
  const g = storeyFraming(graph, house.floor.doors, structures.ground, house.settings.studHeightMm, 0, st)
  const u =
    house.upper && upperGraph
      ? storeyFraming(upperGraph, house.upper.plan.doors, structures.upper, house.upper.studHeightMm, 1, st)
      : null
  const outsideJunctions: HouseFraming["outsideJunctions"] = [{ storey: 0 as const, count: g.outsideMeets * 2, length: outsideStud }]
  if (u && house.upper) outsideJunctions.push({ storey: 1, count: u.outsideMeets * 2, length: house.upper.studHeightMm - st.studThickMm * (st.doubleTopPlateLB ? 3 : 2) })
  return { walls: [...g.walls, ...(u?.walls ?? [])], outsideJunctions: outsideJunctions.filter((j) => j.count > 0), storeyZ: [0, upperFloorZ], settings: st }
}

// ── the order ──────────────────────────────────────────────────────────

const ORDER_USES: [MemberKind[], string][] = [
  [["bottomPlate", "topPlate"], "Plates"],
  [["stud"], "Studs"],
  [["trimmer", "jack", "cripple"], "Trimming, jack and cripple studs"],
  [["junction"], "Junction and corner studs"],
  [["nog"], "Nogs"],
  [["lintel"], "Lintels"],
  [["head"], "Door heads"],
]

/** What to buy, as the order card takes it: each use's pieces, planned
 * into stock lengths. */
export function framingOrder(f: HouseFraming): StairOrderLine[] {
  const st = f.settings
  const material = (size: string) => `${size} ${st.grade}`
  const lines: StairOrderLine[] = []
  const add = (use: string, size: string, pieces: number[]) => {
    if (!pieces.length) return
    const plan = planMixedStock(pieces)
    lines.push({
      kind: "timber",
      use,
      material: material(size),
      size: size.replace(" × ", " x "),
      count: plan ? plan.lengths : pieces.length,
      lengthM: plan ? plan.lengthM : Math.ceil(Math.max(...pieces) / 300) * 0.3,
      unit: "lengths",
      detail: `${pieces.length} piece${pieces.length === 1 ? "" : "s"}, ${(pieces.reduce((a, p) => a + p, 0) / 1000).toFixed(1)} m`,
      pieces: plan ? pieces : undefined,
    })
  }
  const all = f.walls.flatMap((w) => w.members)
  for (const [kinds, use] of ORDER_USES) {
    const bySize = new Map<string, number[]>()
    for (const m of all)
      if (kinds.includes(m.kind)) {
        const list = bySize.get(m.size) ?? []
        for (let k = 0; k < m.plies; k++) list.push(m.length)
        bySize.set(m.size, list)
      }
    for (const [size, pieces] of bySize) add(use, size, pieces)
  }
  const outside = f.outsideJunctions.flatMap((j) => Array.from({ length: j.count }, () => j.length))
  add("Junction studs in the outside walls, where inside walls meet them", `${st.studDepthMm} × ${st.studThickMm}`, outside)
  return lines
}

/** members of each kind (a two-ply lintel is one), for a summary */
export const memberCounts = (members: WallMember[]) => {
  const out = new Map<MemberKind, number>()
  for (const m of members) out.set(m.kind, (out.get(m.kind) ?? 0) + 1)
  return out
}

export interface CutListRow {
  kind: MemberKind
  size: string
  /** piece length (mm) → how many */
  lengths: [number, number][]
  pieces: number
  totalM: number
}

/** Every piece to cut, by member and size, with how many of each length. */
export function cutList(f: HouseFraming): CutListRow[] {
  const rows = new Map<string, CutListRow & { counts: Map<number, number> }>()
  const order = Object.keys(MEMBER_LABELS) as MemberKind[]
  const add = (kind: MemberKind, size: string, length: number, n: number) => {
    const key = `${kind}|${size}`
    const r = rows.get(key) ?? { kind, size, lengths: [], pieces: 0, totalM: 0, counts: new Map<number, number>() }
    r.counts.set(length, (r.counts.get(length) ?? 0) + n)
    r.pieces += n
    r.totalM += (length * n) / 1000
    rows.set(key, r)
  }
  for (const w of f.walls) for (const m of w.members) add(m.kind, m.size, m.length, m.plies)
  const st = f.settings
  for (const j of f.outsideJunctions) add("junction", `${st.studDepthMm} × ${st.studThickMm} (outside walls)`, j.length, j.count)
  return [...rows.values()]
    .map(({ counts, ...r }) => ({ ...r, lengths: [...counts].sort((a, b) => b[0] - a[0]) }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.size.localeCompare(b.size))
}

// ── 3D ─────────────────────────────────────────────────────────────────

export type FramingLayer = "plates" | "studs" | "openings" | "nogs" | "junctions" | "upper"

export const FRAMING_LAYER_LABELS: Record<FramingLayer, string> = {
  plates: "Plates",
  studs: "Studs",
  openings: "Lintels & trimmers",
  nogs: "Nogs",
  junctions: "Junction studs",
  upper: "First floor",
}

const LAYER_OF: Record<MemberKind, FramingLayer> = {
  bottomPlate: "plates",
  topPlate: "plates",
  stud: "studs",
  cripple: "studs",
  trimmer: "openings",
  jack: "openings",
  lintel: "openings",
  head: "openings",
  nog: "nogs",
  junction: "junctions",
}

/** a member of a wall as a box in the world (mm, x east, y north, z up) */
const memberSolid = (w: FramedWall, m: WallMember, depth: number, baseZ: number, color: string): Solid | null => {
  const L = len(w.start, w.end)
  if (L < 1 || m.x1 - m.x0 < 0.5 || m.z1 - m.z0 < 0.5) return null
  const d = { x: (w.end.x - w.start.x) / L, y: (w.end.y - w.start.y) / L }
  const n = { x: -d.y, y: d.x }
  const at = (x: number, s: number, z: number): V3 => {
    const px = w.start.x + d.x * x + n.x * s
    const py = w.start.y + d.y * x + n.y * s
    return [px, -py, baseZ + z]
  }
  const h = depth / 2
  const c = [
    [m.x0, -h],
    [m.x1, -h],
    [m.x1, h],
    [m.x0, h],
  ] as const
  const bottom = c.map(([x, s]) => at(x, s, m.z0))
  const top = c.map(([x, s]) => at(x, s, m.z1))
  return makeSolid([
    { pts: bottom, color },
    { pts: top, color },
    ...bottom.map((_, k) => ({ pts: [bottom[k], bottom[(k + 1) % 4], top[(k + 1) % 4], top[k]], color })),
  ])
}

/** Every member as a solid, bar the layers hidden. */
export function framingSolids(f: HouseFraming, hidden: ReadonlySet<FramingLayer>): Solid[] {
  const out: Solid[] = []
  for (const w of f.walls) {
    if (w.storey === 1 && hidden.has("upper")) continue
    for (const m of w.members) {
      if (hidden.has(LAYER_OF[m.kind])) continue
      const s = memberSolid(w, m, f.settings.studDepthMm, f.storeyZ[w.storey], MEMBER_COLOURS[m.kind])
      if (s) out.push(s)
    }
  }
  return out
}

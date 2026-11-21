/** The house's wall framing — the outside walls and the inside ones —
 * every wall laid out stick by stick: bottom plate, top plate (doubled on
 * a load-bearing wall), studs at centres, rows of nogs between them,
 * extra studs where walls meet (for the lining), and round each opening
 * its trimming studs, a lintel on jack studs (load-bearing) or a head
 * (not), a sill trimmer under a window, and short cripple studs over and
 * under it — then all of it as cut pieces, ordered as stock lengths the
 * way the decks' and stairs' orders are (stairs/stairMaterials.ts).
 *
 * Each wall's frame is laid out in its own elevation: `x` along it from
 * the frame's start (mm), `z` up from its storey's floor.
 *
 * Outside walls: the frame stands behind the cladding and its cavity, its
 * inside face OUTSIDE_IN in from the outline (the cladding's face). Going
 * round the house, each wall runs through the corner at its end (and gets
 * a corner stud beside its end stud) and the next one butts it. Windows
 * and doors come from the linked weatherboard project (the house's walls
 * keep their ids there). Where the cladding runs up past the top plate —
 * a gable end, or a lean-to's side — it's framed with raking top plates
 * and gable studs under rafters; under trusses it's the gable truss.
 *
 * Inside walls, where one meets:
 *  - an outside wall: it stops at that wall's framing, and the outside wall
 *    gets a junction stud either side of it;
 *  - the middle of another inside wall: it butts the other's face (half a
 *    stud depth short of the line), and the other gets two junction studs;
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
import type { Opening, WallEdge } from "../weatherboards/types"
import { edgePoints } from "../weatherboards/weatherboardCalc"
import { FloorGraph } from "./floorPlan"
import type { Cladding } from "./houseCladding"
import { Door, FramingSettings, HouseProject, Pt } from "./houseTypes"
import type { Structure } from "./structure"

/** from the outline (the cladding's face) in to the inside face of the
 * outside walls' framing: cladding and cavity, then the stud */
export const OUTSIDE_IN = 130
/** a stud at centres this close to one already there is left out */
const CLOSE = 100
/** the longest plate bought in one length; longer ones are joined */
const MAX_PLATE = 6000
/** an opening whose bottom is this close to the floor is a door */
export const DOOR_SILL = 100

export type MemberKind =
  | "bottomPlate"
  | "topPlate"
  | "rakingPlate"
  | "stud"
  | "gableStud"
  | "trimmer"
  | "jack"
  | "cripple"
  | "lintel"
  | "head"
  | "sill"
  | "nog"
  | "junction"

export const MEMBER_LABELS: Record<MemberKind, string> = {
  bottomPlate: "Bottom plates",
  topPlate: "Top plates",
  rakingPlate: "Raking top plates (gables)",
  stud: "Studs",
  gableStud: "Gable studs",
  trimmer: "Trimming studs",
  jack: "Jack studs (under lintels)",
  cripple: "Cripple studs (over & under openings)",
  lintel: "Lintels",
  head: "Heads",
  sill: "Sill trimmers",
  nog: "Nogs",
  junction: "Junction & corner studs",
}

export const MEMBER_COLOURS: Record<MemberKind, string> = {
  bottomPlate: "#b98a55",
  topPlate: "#b98a55",
  rakingPlate: "#a97d4b",
  stud: "#dcbf8f",
  gableStud: "#e2c696",
  trimmer: "#c99a5e",
  jack: "#c08d52",
  cripple: "#e4cba0",
  lintel: "#9c6a38",
  head: "#b3824c",
  sill: "#b3824c",
  nog: "#cfa874",
  junction: "#d6a86c",
}

export interface WallMember {
  kind: MemberKind
  /** its box in the wall's elevation: along from the frame's start, up
   * from the storey's floor */
  x0: number
  x1: number
  z0: number
  z1: number
  /** a raked member's actual shape, (x, z) round it (the box is its bounds) */
  poly?: [number, number][]
  /** the piece cut (mm) — its length along its grain */
  length: number
  /** "190 × 45" etc.; how many of it side by side (a lintel's two) */
  size: string
  plies: number
}

export interface FramedOpening {
  id: string
  /** "810 × 1980 door", "1200 × 1000 window" */
  label: string
  /** the frame's opening: along the wall, and up from the floor (sill
   * null for a door) */
  x0: number
  x1: number
  sill: number | null
  head: number
}

export interface FramedWall {
  id: string
  storey: 0 | 1
  outside: boolean
  name: string
  loadBearing: boolean
  /** the frame's two ends on plan, on its centre line */
  start: Pt
  end: Pt
  lengthMm: number
  /** top of the top plate (a gable's rake rises above it) */
  heightMm: number
  members: WallMember[]
  openings: FramedOpening[]
  warnings: string[]
  /** outside walls: the outline side it stands on (plan), to pick it by */
  side?: { a: Pt; b: Pt }
  /** where the frame's x is from: the wall line's (inside walls: a door's
   * atMm) or the cladding wall's (outside walls: an opening's x) is the
   * frame's x + along; and the frame's floor, up from the ground floor */
  along: number
  z0: number
}

export interface HouseFraming {
  walls: FramedWall[]
  /** the floor level each storey's framing stands on */
  storeyZ: [number, number]
  settings: FramingSettings
  notes: string[]
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
/** p on a → b, ends included; how far along */
const alongSide = (p: Pt, a: Pt, b: Pt): number | null => {
  if (near(p, a)) return 0
  if (near(p, b)) return len(a, b)
  return alongInterior(p, a, b)
}
const onOutline = (p: Pt, outline: Pt[]) => outline.some((q, i) => alongSide(p, q, outline[(i + 1) % outline.length]) !== null)

/** a length cut into as few near-equal pieces as it takes */
const split = (L: number, max = MAX_PLATE): number[] => {
  if (L <= 0) return []
  const n = Math.ceil(L / max)
  return Array.from({ length: n }, () => L / n)
}

/** room names either side of an inside wall */
export const wallName = (g: FloorGraph, a: Pt, b: Pt, i: number) => {
  const L = len(a, b) || 1
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
  const roomAt = (p: Pt) => g.rooms.find((r) => r.cells.some((c) => p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h))?.name
  const s1 = roomAt({ x: m.x + n.x * 150, y: m.y + n.y * 150 })
  const s2 = roomAt({ x: m.x - n.x * 150, y: m.y - n.y * 150 })
  return s1 && s2 && s1 !== s2 ? `${s1} / ${s2}` : (s1 ?? s2 ?? `Wall ${i + 1}`)
}

// ── one wall ───────────────────────────────────────────────────────────

/** an opening as the frame needs it: the frame's opening, in the wall's
 * own coordinates */
interface OpeningSpec {
  id: string
  label: string
  x0: number
  x1: number
  sill: number | null
  head: number
}

interface WallSpec {
  L: number
  /** top of the top plate */
  H: number
  lb: boolean
  openings: OpeningSpec[]
  /** a stud beside the end stud at its start / end */
  backing0: boolean
  backing1: boolean
  /** where other walls butt into its middle (their centre line, along it) */
  junctions: number[]
  /** the cladding's top, where it rakes up past the top plate (a gable),
   * in the wall's own coordinates; framed under rafters */
  rake: { x: number; z: number }[] | null
}

/** Every member of one wall's frame. */
function frameWall(spec: WallSpec, st: FramingSettings): { members: WallMember[]; openings: FramedOpening[]; warnings: string[] } {
  const { L, H, lb } = spec
  const D = st.studDepthMm
  const T = st.studThickMm
  const half = D / 2
  const studSize = `${D} × ${T}`
  const tops = lb && st.doubleTopPlateLB ? 2 : 1
  const studTop = H - tops * T
  const studLen = studTop - T
  const warnings: string[] = []
  const members: WallMember[] = []
  const piece = (kind: MemberKind, x0: number, x1: number, z0: number, z1: number, horizontal: boolean, size = studSize, plies = 1) =>
    members.push({ kind, x0, x1, z0, z1, length: Math.round(horizontal ? x1 - x0 : z1 - z0), size, plies })

  // ── the openings: kept to the wall, clear of each other ──
  const side = lb ? 2 * T : T
  const over = lb ? st.lintelDepthMm : T
  const opens: FramedOpening[] = []
  for (const o of [...spec.openings].sort((p, q) => p.x0 - q.x0)) {
    const W = o.x1 - o.x0
    if (L < W + 2 * side) {
      warnings.push(`The ${o.label} doesn't fit in this wall.`)
      continue
    }
    const x0 = Math.min(Math.max(o.x0, side), L - side - W)
    if (Math.abs(x0 - o.x0) > 1) warnings.push(`The ${o.label}'s too near the end of the wall for its trimming studs — it's framed ${Math.round(Math.abs(x0 - o.x0))} mm further in.`)
    const x1 = x0 + W
    if (opens.some((p) => x0 - side < p.x1 + side && x1 + side > p.x0 - side)) {
      warnings.push(`The ${o.label} overlaps another opening (or leaves no room for the studs between them) — it's left out.`)
      continue
    }
    if (o.head + over > studTop) warnings.push(`The ${o.label}'s ${lb ? "lintel" : "head"} doesn't fit under the top plate — lower it${lb ? " or the lintel" : ""}.`)
    const head = Math.min(o.head, studTop - over)
    const sill = o.sill === null ? null : Math.max(2 * T, Math.min(o.sill, head - 100))
    opens.push({ id: o.id, label: o.label, x0, x1, sill, head })
  }

  // ── plates ──
  let at = 0
  const bottomRuns: [number, number][] = []
  for (const o of opens)
    if (o.sill === null) {
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

  // ── studs that stand full height, and the openings' framing ──
  const full: [number, number, MemberKind][] = []
  const clash = (x0: number, x1: number) => full.some(([p, q]) => x0 < q - 1 && x1 > p + 1)
  const addFull = (x0: number, x1: number, kind: MemberKind) => {
    if (x0 < -1 || x1 > L + 1 || clash(x0, x1)) return
    full.push([x0, x1, kind])
  }
  for (const o of opens) {
    addFull(o.x0 - side, o.x0 - side + T, "trimmer")
    addFull(o.x1 + side - T, o.x1 + side, "trimmer")
    if (lb) {
      piece("jack", o.x0 - T, o.x0, T, o.head, false)
      piece("jack", o.x1, o.x1 + T, T, o.head, false)
      piece("lintel", o.x0 - T, o.x1 + T, o.head, o.head + st.lintelDepthMm, true, `${st.lintelDepthMm} × ${T}`, 2)
    } else piece("head", o.x0, o.x1, o.head, o.head + T, true)
    if (o.sill !== null) piece("sill", o.x0, o.x1, o.sill - T, o.sill, true)
  }
  addFull(0, T, "stud")
  addFull(L - T, L, "stud")
  if (spec.backing0) addFull(T, 2 * T, "junction")
  if (spec.backing1) addFull(L - 2 * T, L - T, "junction")
  for (const x of spec.junctions) {
    addFull(x - half - T, x - half, "junction")
    addFull(x + half, x + half + T, "junction")
  }
  // the rest at centres, measured from the start; over and under an opening, cripples
  const C = Math.max(200, st.studCentresMm)
  const reach = lb ? T : 0
  const layout: number[] = []
  for (let c = C; c < L - T; c += C) layout.push(c)
  for (const c of layout) {
    const x0 = c - T / 2
    const x1 = c + T / 2
    const o = opens.find((op) => x1 > op.x0 - reach && x0 < op.x1 + reach)
    if (o) {
      if (x0 < o.x0 - reach || x1 > o.x1 + reach) continue
      const above = o.head + (lb ? st.lintelDepthMm : T)
      if (studTop - above >= 40) piece("cripple", x0, x1, above, studTop, false)
      if (o.sill !== null && x0 >= o.x0 && x1 <= o.x1 && o.sill - T - T >= 40) piece("cripple", x0, x1, T, o.sill - T, false)
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

  // ── a gable: raking top plates on the top plate, and studs up to them ──
  if (spec.rake) {
    const pts = spec.rake
    const rakeAt = (x: number) => {
      if (x <= pts[0].x) return pts[0].z
      for (let i = 1; i < pts.length; i++) if (x <= pts[i].x) return pts[i - 1].z + ((pts[i].z - pts[i - 1].z) * (x - pts[i - 1].x)) / (pts[i].x - pts[i - 1].x || 1)
      return pts[pts.length - 1].z
    }
    const above = (x: number) => rakeAt(x) > H + 1
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      if (b.x - a.x < 1 || (a.z <= H + 1 && b.z <= H + 1)) continue
      const slope = (b.z - a.z) / (b.x - a.x)
      const t = T * Math.hypot(1, slope)
      // (down to the top plate, where the rake meets it)
      const za = Math.max(H, a.z - t)
      const zb = Math.max(H, b.z - t)
      const poly: [number, number][] = [
        [a.x, za],
        [b.x, zb],
        [b.x, b.z],
        [a.x, a.z],
      ]
      members.push({ kind: "rakingPlate", x0: a.x, x1: b.x, z0: Math.min(za, zb), z1: Math.max(a.z, b.z), poly, length: Math.round(Math.hypot(b.x - a.x, b.z - a.z)), size: studSize, plies: 1 })
    }
    const under = (x: number) => {
      const i = pts.findIndex((p, k) => k > 0 && x <= p.x)
      const k = i < 0 ? pts.length - 1 : i
      const slope = (pts[k].z - pts[k - 1].z) / (pts[k].x - pts[k - 1].x || 1)
      return rakeAt(x) - T * Math.hypot(1, slope)
    }
    for (const c of [T / 2, ...layout, L - T / 2]) {
      const x0 = Math.max(0, c - T / 2)
      const x1 = Math.min(L, c + T / 2)
      if (!above(c)) continue
      const z0 = under(x0)
      const z1 = under(x1)
      if (Math.max(z0, z1) - H < 60) continue
      const poly: [number, number][] = [
        [x0, H],
        [x1, H],
        [x1, Math.max(H, z1)],
        [x0, Math.max(H, z0)],
      ]
      members.push({ kind: "gableStud", x0, x1, z0: H, z1: Math.max(z0, z1), poly, length: Math.round(Math.max(z0, z1) - H), size: studSize, plies: 1 })
    }
  }

  return { members, openings: opens, warnings }
}

// ── the inside walls ───────────────────────────────────────────────────

interface EndInfo {
  /** how far in from the line's end the frame stops (−ve: past it) */
  off: number
  /** a stud beside its end stud (the corner's, or a T made at the end) */
  backing: boolean
  outside: boolean
}

function insideWalls(g: FloorGraph, doors: Door[], structure: Structure | null, heightMm: number, storey: 0 | 1, st: FramingSettings): FramedWall[] {
  const half = st.studDepthMm / 2
  const walls = g.walls.filter((w) => len(w.a, w.b) > 50)

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

  return walls.map((w, wi): FramedWall => {
    const lineL = len(w.a, w.b)
    const d = { x: (w.b.x - w.a.x) / lineL, y: (w.b.y - w.a.y) / lineL }
    const e0 = endOf(wi, w.a)
    const e1 = endOf(wi, w.b)
    const L = Math.max(0, lineL - e0.off - e1.off)
    const lb = !!structure?.inside.get(w.id)?.loadBearing
    const openings: OpeningSpec[] = doors
      .filter((x) => x.wallId === w.id)
      .map((door) => {
        const W = door.widthMm + st.doorWidthAllowanceMm
        const x0 = door.atMm - e0.off - W / 2
        return { id: door.id, label: `${door.name ? `${door.name} ` : ""}${door.widthMm} × ${door.heightMm} door`, x0, x1: x0 + W, sill: null, head: door.heightMm + st.doorHeightAllowanceMm }
      })
    const junctions: number[] = []
    walls.forEach((o, oi) => {
      if (oi === wi) return
      for (const p of [o.a, o.b]) {
        const t = alongInterior(p, w.a, w.b)
        if (t !== null) junctions.push(t - e0.off)
      }
    })
    const framed = frameWall({ L, H: heightMm, lb, openings, backing0: e0.backing, backing1: e1.backing, junctions, rake: null }, st)
    return {
      id: w.id,
      storey,
      outside: false,
      name: wallName(g, w.a, w.b, wi),
      loadBearing: lb,
      along: e0.off,
      z0: 0,
      start: { x: w.a.x + d.x * e0.off, y: w.a.y + d.y * e0.off },
      end: { x: w.b.x - d.x * e1.off, y: w.b.y - d.y * e1.off },
      lengthMm: Math.round(L),
      heightMm,
      ...framed,
    }
  })
}

// ── the outside walls ──────────────────────────────────────────────────

/** where two lines (each a point and a direction) cross; null if parallel */
const cross = (p: Pt, d: Pt, q: Pt, e: Pt): Pt | null => {
  const den = d.x * e.y - d.y * e.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den
  return { x: p.x + d.x * t, y: p.y + d.y * t }
}

function outsideWalls(
  layout: Cladding["ground"],
  walls: Cladding["walls"],
  g: FloorGraph,
  structure: Structure | null,
  openings: Map<string, Opening[]> | null,
  z0: number,
  heightMm: number,
  storey: 0 | 1,
  st: FramingSettings,
  frameGables: boolean,
): FramedWall[] {
  const half = st.studDepthMm / 2
  const inset = OUTSIDE_IN - half
  // the sides on plan (y down), round the house with the outside on the right
  const sides = layout.sides
    .filter((s) => s.wallId && walls.has(s.wallId))
    .map((s) => {
      const a = { x: s.a.x, y: -s.a.y }
      const b = { x: s.b.x, y: -s.b.y }
      const L = len(a, b) || 1
      const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      // (square to it; which way is in is worked out below)
      const inn = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
      return { s, a, b, L, d, inn, wall: walls.get(s.wallId!)! }
    })
  const n = sides.length
  if (n < 3 || !layout.closed) return []
  // which way is in: toward the middle of the outline
  const mid = { x: sides.reduce((a, s) => a + s.a.x, 0) / n, y: sides.reduce((a, s) => a + s.a.y, 0) / n }
  const flip = sides.reduce((acc, s) => acc + ((mid.x - s.a.x) * s.inn.x + (mid.y - s.a.y) * s.inn.y), 0) < 0 ? -1 : 1
  const lines = sides.map((s) => ({ p: { x: s.a.x + s.inn.x * flip * inset, y: s.a.y + s.inn.y * flip * inset }, d: s.d }))
  /** the centre lines' corner at the end of side k */
  const corner = (k: number) => cross(lines[k].p, lines[k].d, lines[(k + 1) % n].p, lines[(k + 1) % n].d) ?? { x: sides[k].b.x, y: sides[k].b.y }

  return sides.map((sd, k): FramedWall => {
    const { a, d, wall } = sd
    const P0 = corner((k - 1 + n) % n)
    const P1 = corner(k)
    // butts the wall before it at its start, runs through the corner at its end
    const start = { x: P0.x + d.x * half, y: P0.y + d.y * half }
    const end = { x: P1.x + d.x * half, y: P1.y + d.y * half }
    const L = Math.max(0, (end.x - start.x) * d.x + (end.y - start.y) * d.y)
    // the cladding's x (from the outline corner) → along the frame
    const shift = (start.x - a.x) * d.x + (start.y - a.y) * d.y
    // load-bearing, from the outline side it stands on
    const midPt = { x: (sd.a.x + sd.b.x) / 2, y: (sd.a.y + sd.b.y) / 2 }
    const oi = g.outline.findIndex((p, i) => alongSide(midPt, p, g.outline[(i + 1) % g.outline.length]) !== null)
    const lb = oi >= 0 ? !!structure?.outside[oi]?.loadBearing : true
    const ops: OpeningSpec[] = (openings?.get(wall.id) ?? []).map((o) => {
      const top = Math.max(o.sill + o.height, o.sill + (o.heightRight ?? o.height)) - z0
      const bottom = o.sill - z0
      const door = bottom < DOOR_SILL
      const x0 = o.x - shift - st.windowWidthAllowanceMm / 2
      return {
        id: o.id,
        label: `${o.code ? `${o.code} ` : ""}${Math.round(o.width)} × ${Math.round(Math.max(o.height, o.heightRight ?? 0))} ${door ? "door" : "window"}`,
        x0,
        x1: x0 + o.width + st.windowWidthAllowanceMm,
        sill: door ? null : bottom - st.windowHeightAllowanceMm / 2,
        head: top + (door ? st.windowHeightAllowanceMm : st.windowHeightAllowanceMm / 2),
      }
    })
    // inside walls meeting it: a junction stud either side
    const junctions: number[] = []
    for (const w of g.walls)
      for (const p of [w.a, w.b]) {
        const t = alongSide(p, sd.a, sd.b)
        if (t !== null) junctions.push(t - shift)
      }
    // the cladding's top past the top plate: a gable
    const topPts = edgePoints(wall.top as WallEdge, wall.lengthMm).map((p) => ({ x: p.x - shift, z: p.y - z0 }))
    const gable = topPts.some((p) => p.z > heightMm + 50)
    const zAt = (x: number) => {
      for (let i = 1; i < topPts.length; i++) {
        const p = topPts[i - 1]
        const q = topPts[i]
        if (x <= q.x) return q.x - p.x < 1e-6 ? q.z : p.z + ((q.z - p.z) * (x - p.x)) / (q.x - p.x)
      }
      return topPts[topPts.length - 1].z
    }
    const rake = gable && frameGables ? [{ x: 0, z: zAt(0) }, ...topPts.filter((p) => p.x > 0 && p.x < L), { x: L, z: zAt(L) }] : null
    const framed = frameWall({ L, H: heightMm, lb, openings: ops, backing0: false, backing1: true, junctions, rake }, st)
    if (gable && !frameGables) framed.warnings.push("The gable above the top plate is the truss maker's (a gable-end truss) — not framed here.")
    return {
      id: wall.id,
      storey,
      outside: true,
      name: wall.name,
      loadBearing: lb,
      start,
      end,
      lengthMm: Math.round(L),
      heightMm,
      side: { a: sd.a, b: sd.b },
      along: shift,
      z0,
      ...framed,
    }
  })
}

// ── the house ──────────────────────────────────────────────────────────

/** Every wall of the house framed. `structures` says which are load-
 * bearing; `cladding` gives the outside walls (null: inside walls only);
 * `openings` are the linked weatherboard project's windows and doors, by
 * wall id. */
export function houseFraming(
  house: HouseProject,
  graph: FloorGraph,
  upperGraph: FloorGraph | null,
  structures: { ground: Structure; upper: Structure | null },
  cladding: Cladding | null,
  openings: Map<string, Opening[]> | null,
): HouseFraming {
  const st = house.settings.framing
  const H0 = house.settings.studHeightMm
  const upperZ = cladding?.upperFloorZ ?? H0 + house.settings.floorDepthMm
  const frameGables = house.settings.roofFrame === "rafters"
  const walls: FramedWall[] = []
  if (cladding) walls.push(...outsideWalls(cladding.ground, cladding.walls, graph, structures.ground, openings, 0, H0, 0, st, frameGables))
  walls.push(...insideWalls(graph, house.floor.doors, structures.ground, H0, 0, st))
  if (house.upper && upperGraph) {
    if (cladding?.upper) walls.push(...outsideWalls(cladding.upper, cladding.walls, upperGraph, structures.upper, openings, upperZ, house.upper.studHeightMm, 1, st, frameGables))
    walls.push(...insideWalls(upperGraph, house.upper.plan.doors, structures.upper, house.upper.studHeightMm, 1, st))
  }
  const notes: string[] = []
  if (!cladding) notes.push("The outside walls need a closed outline to be framed.")
  else if (!openings) notes.push("No windows or outside doors yet — draw them on a wall here, or add them in the linked weatherboard project (Cladding step).")
  return { walls, storeyZ: [0, upperZ], settings: st, notes }
}

// ── the order ──────────────────────────────────────────────────────────

const ORDER_USES: [MemberKind[], string][] = [
  [["bottomPlate", "topPlate"], "Plates"],
  [["stud"], "Studs"],
  [["trimmer", "jack", "cripple"], "Trimming, jack and cripple studs"],
  [["junction"], "Junction and corner studs"],
  [["nog"], "Nogs"],
  [["sill"], "Sill trimmers"],
  [["lintel"], "Lintels"],
  [["head"], "Heads"],
  [["rakingPlate", "gableStud"], "Gable framing"],
]

/** What to buy, as the order card takes it: each use's pieces, planned
 * into stock lengths. */
export function framingOrder(f: HouseFraming): StairOrderLine[] {
  const st = f.settings
  const lines: StairOrderLine[] = []
  const all = f.walls.flatMap((w) => w.members)
  for (const [kinds, use] of ORDER_USES) {
    const bySize = new Map<string, number[]>()
    for (const m of all)
      if (kinds.includes(m.kind)) {
        const list = bySize.get(m.size) ?? []
        for (let k = 0; k < m.plies; k++) list.push(m.length)
        bySize.set(m.size, list)
      }
    for (const [size, pieces] of bySize) {
      const plan = planMixedStock(pieces)
      lines.push({
        kind: "timber",
        use,
        material: `${size} ${st.grade}`,
        size: size.replace(" × ", " x "),
        count: plan ? plan.lengths : pieces.length,
        lengthM: plan ? plan.lengthM : Math.ceil(Math.max(...pieces) / 300) * 0.3,
        unit: "lengths",
        detail: `${pieces.length} piece${pieces.length === 1 ? "" : "s"}, ${(pieces.reduce((a, p) => a + p, 0) / 1000).toFixed(1)} m`,
        pieces: plan ? pieces : undefined,
      })
    }
  }
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
  outside: boolean
  size: string
  /** piece length (mm) → how many */
  lengths: [number, number][]
  pieces: number
  totalM: number
}

/** Every piece to cut, by member, size and outside or inside walls, with
 * how many of each length. */
export function cutList(f: HouseFraming): CutListRow[] {
  const rows = new Map<string, CutListRow & { counts: Map<number, number> }>()
  const order = Object.keys(MEMBER_LABELS) as MemberKind[]
  for (const w of f.walls)
    for (const m of w.members) {
      const key = `${w.outside}|${m.kind}|${m.size}`
      const r = rows.get(key) ?? { kind: m.kind, outside: w.outside, size: m.size, lengths: [], pieces: 0, totalM: 0, counts: new Map<number, number>() }
      r.counts.set(m.length, (r.counts.get(m.length) ?? 0) + m.plies)
      r.pieces += m.plies
      r.totalM += (m.length * m.plies) / 1000
      rows.set(key, r)
    }
  return [...rows.values()]
    .map(({ counts, ...r }) => ({ ...r, lengths: [...counts].sort((a, b) => b[0] - a[0]) }))
    .sort((a, b) => Number(b.outside) - Number(a.outside) || order.indexOf(a.kind) - order.indexOf(b.kind) || a.size.localeCompare(b.size))
}

// ── 3D ─────────────────────────────────────────────────────────────────

export type FramingLayer = "outside" | "inside" | "plates" | "studs" | "openings" | "nogs" | "junctions" | "upper"

export const FRAMING_LAYER_LABELS: Record<FramingLayer, string> = {
  outside: "Outside walls",
  inside: "Inside walls",
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
  rakingPlate: "plates",
  stud: "studs",
  gableStud: "studs",
  cripple: "studs",
  trimmer: "openings",
  jack: "openings",
  lintel: "openings",
  head: "openings",
  sill: "openings",
  nog: "nogs",
  junction: "junctions",
}

/** a member of a wall as a solid in the world (mm, x east, y north, z up) */
const memberSolid = (w: FramedWall, m: WallMember, depth: number, baseZ: number, color: string): Solid | null => {
  const L = len(w.start, w.end)
  if (L < 1 || m.x1 - m.x0 < 0.5 || m.z1 - m.z0 < 0.5) return null
  const d = { x: (w.end.x - w.start.x) / L, y: (w.end.y - w.start.y) / L }
  const n = { x: -d.y, y: d.x }
  const at = (x: number, s: number, z: number): V3 => [w.start.x + d.x * x + n.x * s, -(w.start.y + d.y * x + n.y * s), baseZ + z]
  const h = depth / 2
  const shape: [number, number][] = m.poly ?? [
    [m.x0, m.z0],
    [m.x1, m.z0],
    [m.x1, m.z1],
    [m.x0, m.z1],
  ]
  const front = shape.map(([x, z]) => at(x, -h, z))
  const back = shape.map(([x, z]) => at(x, h, z))
  const k = shape.length
  return makeSolid([
    { pts: front, color },
    { pts: back, color },
    ...front.map((_, i) => ({ pts: [front[i], front[(i + 1) % k], back[(i + 1) % k], back[i]], color })),
  ])
}

/** Every member as a solid, bar the layers hidden. */
export function framingSolids(f: HouseFraming, hidden: ReadonlySet<FramingLayer>): Solid[] {
  const out: Solid[] = []
  for (const w of f.walls) {
    if (w.storey === 1 && hidden.has("upper")) continue
    if (hidden.has(w.outside ? "outside" : "inside")) continue
    for (const m of w.members) {
      if (hidden.has(LAYER_OF[m.kind])) continue
      const s = memberSolid(w, m, f.settings.studDepthMm, f.storeyZ[w.storey], MEMBER_COLOURS[m.kind])
      if (s) out.push(s)
    }
  }
  return out
}

/** Every member as a solid, with which storey it's on and whether it's an outside wall's (for the showcase's stages). */
export function framingPieces(f: HouseFraming): { solid: Solid; storey: 0 | 1; outside: boolean }[] {
  const out: { solid: Solid; storey: 0 | 1; outside: boolean }[] = []
  for (const w of f.walls)
    for (const m of w.members) {
      const s = memberSolid(w, m, f.settings.studDepthMm, f.storeyZ[w.storey], MEMBER_COLOURS[m.kind])
      if (s) out.push({ solid: s, storey: w.storey, outside: w.outside })
    }
  return out
}

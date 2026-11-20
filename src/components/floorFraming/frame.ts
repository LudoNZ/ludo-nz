/** The floor framing engine shared by the Floor Framing calculator and the
 * decking calculator: one frame, whatever goes on top of it.
 *
 * A frame is two independent choices:
 *
 * - what holds it up (`support`):
 *   - `walls`: joists span between two walls or beams — a mid-floor —
 *     sitting on top of the plates or hung in joist hangers.
 *   - `bearers`: joists sit on bearers, the bearers on piles — a ground
 *     floor or a free-standing deck.
 *   - `ledger`: one end of the joists is hung off a ledger bolted to the
 *     house, the rest is bearers on piles — a deck fixed to the house.
 * - what goes on top (`covering`):
 *   - `sheet`: ply or particleboard flooring, inside (H1.2). Sheet ends
 *     land on joists; square-edged ply wants nogs under its long edges.
 *   - `decking`: boards, outside (H3.2 framing, H5 piles). The boards are
 *     laid by the decking calculator, onto this frame's joists.
 *
 * Geometry is in the frame's own axes: `u` along the joists, `v` across
 * them (where each joist sits). The outline is any simple polygon in plan
 * (mm); `joistAxis` says which plan axis the joists run along. Pure — no
 * React. */

import { DeckPoint, polygonBounds, polygonSpanAtX, polygonSpanAtY } from "../decking/polygon"
import {
  bearerMaxSpanM,
  BEARER_SIZES,
  blockingRowsForSpan,
  DECK_JOIST_TABLE,
  DEFAULT_FRAME_SETTINGS,
  findJoistRow,
  FLOOR_JOIST_TABLE,
  FrameSettings,
  joistMaxSpanM,
  JoistSpecRow,
  parseSize,
} from "./frameTables"

export type FrameSupport = "walls" | "bearers" | "ledger"
export type FrameCovering = "sheet" | "decking"
export type SheetKind = "ply" | "particleboard"

export const SUPPORT_LABELS: Record<FrameSupport, string> = {
  walls: "Between walls or beams",
  bearers: "On bearers and piles",
  ledger: "Ledger on the house, bearers and piles",
}

export interface SheetSpec {
  kind: SheetKind
  lengthMm: number
  widthMm: number
  thicknessMm: number
}

export const SHEET_PRESETS: { label: string; sheet: SheetSpec; maxJoistSpacing: number }[] = [
  { label: "Ply 2400 × 1200 × 19", sheet: { kind: "ply", lengthMm: 2400, widthMm: 1200, thicknessMm: 19 }, maxJoistSpacing: 600 },
  { label: "Ply 2400 × 1200 × 17", sheet: { kind: "ply", lengthMm: 2400, widthMm: 1200, thicknessMm: 17 }, maxJoistSpacing: 450 },
  { label: "Particleboard T&G 3600 × 1200 × 20", sheet: { kind: "particleboard", lengthMm: 3600, widthMm: 1200, thicknessMm: 20 }, maxJoistSpacing: 450 },
  { label: "Particleboard T&G 2400 × 1200 × 20", sheet: { kind: "particleboard", lengthMm: 2400, widthMm: 1200, thicknessMm: 20 }, maxJoistSpacing: 450 },
]

export const sheetLabel = (s: SheetSpec) =>
  `${s.kind === "ply" ? "Ply" : "Particleboard T&G"} ${s.lengthMm} × ${s.widthMm} × ${s.thicknessMm}`

/** what the order calls a sheet */
export const sheetMaterial = (s: SheetSpec) => `${s.lengthMm} × ${s.widthMm} × ${s.thicknessMm} ${s.kind === "ply" ? "ply flooring" : "particleboard flooring (T&G)"}`

export interface FrameInput {
  support: FrameSupport
  covering: FrameCovering
  /** mm, most a joist's centres may be apart (they're re-spaced evenly to fit) */
  joistSpacing: number
  /** mm, the first bay only (off a ledger or edge), null for even */
  firstBaySpacing: number | null
  /** e.g. "140 x 45mm"; null = the smallest that spans (between walls), or
   * 140 x 45 on bearers */
  joistSize: string | null
  /** between walls: hung in joist hangers rather than sitting on top */
  hangers: boolean
  /** which end of the joists the ledger's on: the low-u end or the high */
  ledgerEnd: "start" | "end"
  /** mm, ground to the top of the finished floor (on bearers or a ledger) */
  heightMm: number
  /** e.g. "140 x 70mm"; null = the smallest that spans 1.3 m between piles */
  bearerSize: string | null
  /** mm, most piles may be apart along a bearer; null = as far as the bearer spans */
  maxPileSpacingMm: number | null
  /** under sheet flooring: the sheets */
  sheet: SheetSpec
  /** mm, decking board thickness (for heights) */
  boardThicknessMm: number
  /** the live order's pinned counts: per material, per length */
  orderPins: Record<string, Record<string, number>>
}

export const DEFAULT_FRAME_INPUT: FrameInput = {
  support: "walls",
  covering: "sheet",
  joistSpacing: 450,
  firstBaySpacing: null,
  joistSize: null,
  hangers: false,
  ledgerEnd: "start",
  heightMm: 600,
  bearerSize: null,
  maxPileSpacingMm: null,
  sheet: { ...SHEET_PRESETS[0].sheet },
  boardThicknessMm: 32,
  orderPins: {},
}

/** a deck's frame to start from: on bearers, at 450 off the ground */
export const DEFAULT_DECK_FRAME: FrameInput = {
  ...DEFAULT_FRAME_INPUT,
  support: "bearers",
  covering: "decking",
  joistSize: "140 x 45mm",
  heightMm: 450,
}

export type MemberKind = "joist" | "rim" | "ledger" | "bearer" | "blocking" | "nog" | "wall"

export interface FrameMember {
  kind: MemberKind
  /** the frame axis it runs along */
  runs: "u" | "v"
  /** its centre line, on the other axis */
  at: number
  from: number
  to: number
  /** mm, top to bottom */
  depth: number
  /** mm, side to side */
  thick: number
  /** mm, height of its top above the ground (walls: above the wall plates) */
  zTop: number
  /** the lengths it's bought as (mm) */
  pieces: number[]
  /** for a joist: which joist across (0 = first) */
  index?: number
}

export interface Pile {
  u: number
  v: number
  /** mm, ground to the underside of the bearer */
  aboveGround: number
  /** mm, the pile as cut: above ground plus what's in the ground */
  length: number
}

export interface SheetPiece {
  u0: number
  u1: number
  v0: number
  v1: number
  /** cut shorter than a full sheet */
  cut: boolean
}

export interface FrameLabour {
  setupHours: number
  joistHours: number
  hangerHours: number
  blockingHours: number
  pileHours: number
  bearerHours: number
  ledgerHours: number
  sheetHours: number
  totalHours: number
}

export interface FrameLayout {
  input: FrameInput
  joistAxis: "x" | "y"
  /** plan point of a frame (u, v) */
  toPlan: (u: number, v: number) => DeckPoint
  bounds: { uMin: number; uMax: number; vMin: number; vMax: number }
  table: JoistSpecRow[]
  /** H1.2 inside, H3.2 a deck */
  treatment: "H1.2" | "H3.2"
  joistSize: string
  joistDepth: number
  joistThick: number
  /** m, the most this size spans at these centres */
  joistMaxSpanM: number
  /** m, the longest clear span between supports any joist has */
  joistSpanM: number
  /** joist centres across (v) */
  joistPositions: number[]
  /** m, the evenly fitted centres (after the first bay) */
  actualSpacingMm: number
  /** support lines across the joists (u): walls, ledger face, bearer centres */
  supports: number[]
  bearerSize: string | null
  bearerDepth: number
  bearerThick: number
  /** m, the widest loaded dimension a bearer carries */
  loadedDimensionM: number
  bearerMaxSpanM: number
  /** mm, how far apart the piles are set */
  pileSpacingMm: number
  members: FrameMember[]
  piles: Pile[]
  sheets: SheetPiece[]
  /** sheets bought: the cut pieces packed into whole sheets */
  sheetCount: number
  /** mm, heights above the ground */
  joistTop: number
  floorTop: number
  coveringThickness: number
  hangerCount: number
  skewNails: number
  rimNails: number
  blockingNails: number
  wireDogs: number
  ledgerBolts: number
  sheetScrews: number
  /** set when it's past what this tool should specify; the reason */
  needsEngineer: string | null
  warnings: string[]
  labour: FrameLabour
}

const round = (n: number) => Math.round(n)

/** Joist centres across a run from vMin to vMax: one on each edge, the
 * first bay as given, and the rest evenly at or under `spacing`. */
export function joistPositionsAcross(vMin: number, vMax: number, spacing: number, firstBay: number | null): number[] {
  const out = [round(vMin)]
  let start = vMin
  if (firstBay && firstBay > 0 && Math.abs(firstBay - spacing) > 0.5 && vMin + firstBay < vMax - 1) {
    start = vMin + firstBay
    out.push(round(start))
  }
  const run = vMax - start
  if (run > 1 && spacing > 0) {
    const bays = Math.max(1, Math.ceil(run / spacing - 1e-9))
    for (let i = 1; i <= bays; i++) out.push(round(start + (run * i) / bays))
  }
  return [...new Set(out)]
}

/** The outline in frame axes, and how to get back. */
function frameAxes(outline: DeckPoint[], joistAxis: "x" | "y") {
  const b = polygonBounds(outline)
  const alongY = joistAxis === "y"
  const bounds = alongY ? { uMin: b.minY, uMax: b.maxY, vMin: b.minX, vMax: b.maxX } : { uMin: b.minX, uMax: b.maxX, vMin: b.minY, vMax: b.maxY }
  const clampV = (v: number) => Math.min(Math.max(v, bounds.vMin + 1), bounds.vMax - 1)
  const clampU = (u: number) => Math.min(Math.max(u, bounds.uMin + 1), bounds.uMax - 1)
  /** the outline's u-extent at this v */
  const spanAtV = (v: number): [number, number] | null => {
    if (alongY) {
      const s = polygonSpanAtX(outline, clampV(v))
      return s ? [s.yMin, s.yMax] : null
    }
    const s = polygonSpanAtY(outline, clampV(v))
    return s ? [s.xMin, s.xMax] : null
  }
  /** the outline's v-extent at this u */
  const spanAtU = (u: number): [number, number] | null => {
    if (alongY) {
      const s = polygonSpanAtY(outline, clampU(u))
      return s ? [s.xMin, s.xMax] : null
    }
    const s = polygonSpanAtX(outline, clampU(u))
    return s ? [s.yMin, s.yMax] : null
  }
  const toPlan = (u: number, v: number): DeckPoint => (alongY ? { x: v, y: u } : { x: u, y: v })
  return { bounds, spanAtV, spanAtU, toPlan }
}

/** A run from `from` to `to`, bought in lengths of up to `max`, joined
 * only at one of `joinAt` (or anywhere if none are given): the farthest
 * join point a length still reaches, each time. */
export function splitRun(from: number, to: number, max: number, joinAt: number[] = []): number[] {
  const len = to - from
  if (len <= 0) return []
  if (len <= max + 0.5) return [round(len)]
  const pieces: number[] = []
  let p = from
  const joins = [...joinAt].filter((j) => j > from + 1 && j < to - 1).sort((a, b) => a - b)
  while (to - p > max + 0.5) {
    const reach = joins.filter((j) => j > p + 1 && j <= p + max + 0.5)
    const next = joins.length ? (reach.length ? reach[reach.length - 1] : p + max) : p + max
    pieces.push(round(next - p))
    p = next
  }
  pieces.push(round(to - p))
  return pieces
}

/** First-fit decreasing: how many stock lengths `pieces` pack into. */
export function packCount(pieces: number[], stock: number, kerf = 0): number {
  const free: number[] = []
  for (const p of [...pieces].sort((a, b) => b - a)) {
    const i = free.findIndex((f) => f >= p - 0.5)
    if (i >= 0) free[i] -= p + kerf
    else free.push(stock - p - kerf)
  }
  return free.length
}

/** Lays out the whole frame. */
export function buildFrame(outline: DeckPoint[], joistAxis: "x" | "y", input: FrameInput, settings: FrameSettings = DEFAULT_FRAME_SETTINGS): FrameLayout {
  const { bounds, spanAtV, spanAtU, toPlan } = frameAxes(outline, joistAxis)
  const { uMin, uMax, vMin, vMax } = bounds
  const deck = input.covering === "decking"
  const table = deck ? DECK_JOIST_TABLE : FLOOR_JOIST_TABLE
  const walls = input.support === "walls"
  const ledgerAt = input.support === "ledger" ? input.ledgerEnd : null
  const warnings: string[] = []
  let needsEngineer: string | null = null
  const spacing = Math.max(100, input.joistSpacing || 450)
  const maxStock = settings.maxStockLengthMm
  const coveringThickness = deck ? input.boardThicknessMm : input.sheet.thicknessMm

  const joistPositions = joistPositionsAcross(vMin, vMax, spacing, input.firstBaySpacing)
  const lastBays = joistPositions.length > 2 ? joistPositions[joistPositions.length - 1] - joistPositions[joistPositions.length - 2] : vMax - vMin
  const actualSpacingMm = round(lastBays)

  // ── joist size, and (on bearers) how many bays it takes ──────────────
  const joistRuns = joistPositions.map((v) => spanAtV(v))
  const longestRun = Math.max(0, ...joistRuns.map((r) => (r ? r[1] - r[0] : 0)))
  let joistSize: string
  if (walls) {
    const row = input.joistSize ? null : findJoistRow(table, spacing, longestRun / 1000)
    joistSize = input.joistSize ?? row?.sizeLabel ?? "290 x 45mm"
  } else joistSize = input.joistSize ?? "140 x 45mm"
  const { depth: joistDepth, thick: joistThick } = parseSize(joistSize)
  const maxSpanM = joistMaxSpanM(table, spacing, joistSize)
  if (maxSpanM <= 0) needsEngineer = `${joistSize.replace("mm", "")} joists at ${spacing} mm centres aren't in this tool's table.`

  // ends of the frame across the joists: a ledger, a rim on an edge
  // bearer, or (between walls) the wall itself
  const RIM = joistThick
  const startIsLedger = ledgerAt === "start"
  const endIsLedger = ledgerAt === "end"
  const bearerSizeGuess = input.bearerSize ?? "140 x 70mm"
  const bearerThickGuess = parseSize(bearerSizeGuess).thick
  const supportAtStart = walls ? uMin : startIsLedger ? uMin + RIM : uMin + bearerThickGuess / 2
  const supportAtEnd = walls ? uMax : endIsLedger ? uMax - RIM : uMax - bearerThickGuess / 2
  const supports: number[] = [supportAtStart]
  if (!walls) {
    const clear = supportAtEnd - supportAtStart
    const bays = maxSpanM > 0 ? Math.max(1, Math.ceil(clear / (maxSpanM * 1000) - 1e-9)) : 1
    for (let i = 1; i < bays; i++) supports.push(supportAtStart + (clear * i) / bays)
  }
  supports.push(supportAtEnd)
  const bayLengths = supports.slice(1).map((s, i) => s - supports[i])
  const joistSpanM = Math.max(...bayLengths) / 1000
  if (walls && !input.joistSize && !findJoistRow(table, spacing, joistSpanM))
    needsEngineer = `A ${joistSpanM.toFixed(1)} m span at ${spacing} mm centres is beyond every joist size in this tool's table.`
  else if (walls && maxSpanM > 0 && joistSpanM > maxSpanM + 1e-6)
    needsEngineer = `${joistSize.replace("mm", "")} joists at ${spacing} mm centres span ${maxSpanM} m — this floor needs ${joistSpanM.toFixed(2)} m.`

  // heights, from the ground up
  const floorTop = walls ? joistDepth + coveringThickness : input.heightMm
  const joistTop = floorTop - coveringThickness

  // ── bearers ───────────────────────────────────────────────────────────
  const bearerLines = walls ? [] : supports.filter((u, i) => !((i === 0 && startIsLedger) || (i === supports.length - 1 && endIsLedger)))
  let loadedDimensionM = 0
  for (const u of bearerLines) {
    const i = supports.indexOf(u)
    const before = i > 0 ? u - supports[i - 1] : u - uMin
    const after = i < supports.length - 1 ? supports[i + 1] - u : uMax - u
    loadedDimensionM = Math.max(loadedDimensionM, (before + after) / 2000)
  }
  let bearerSize: string | null = null
  let bearerMax = 0
  if (bearerLines.length) {
    if (input.bearerSize) bearerSize = input.bearerSize
    else bearerSize = BEARER_SIZES.find((s) => bearerMaxSpanM(s, loadedDimensionM) >= 1.3) ?? [...BEARER_SIZES].reverse().find((s) => bearerMaxSpanM(s, loadedDimensionM) > 0) ?? BEARER_SIZES[BEARER_SIZES.length - 1]
    bearerMax = bearerMaxSpanM(bearerSize, loadedDimensionM)
    if (bearerMax <= 0) needsEngineer = needsEngineer ?? `Bearers carrying a ${loadedDimensionM.toFixed(2)} m loaded dimension are past this tool's bearer table — add a bearer line, or get it designed.`
  }
  const { depth: bearerDepth, thick: bearerThick } = bearerSize ? parseSize(bearerSize) : { depth: 0, thick: 0 }
  const pileSpacingMm = round(Math.min(input.maxPileSpacingMm ?? Infinity, (bearerMax || 1.2) * 1000))
  const bearerTop = joistTop - joistDepth

  const members: FrameMember[] = []
  const piles: Pile[] = []
  const pileAbove = bearerTop - bearerDepth
  if (bearerLines.length && pileAbove < 0) warnings.push(`At ${input.heightMm} mm the floor's too low for ${joistDepth} mm joists on ${bearerDepth} mm bearers — raise it, or use smaller framing.`)
  if (pileAbove > settings.maxOrdinaryPileHeightMm && bearerLines.length)
    warnings.push(`Piles stand ${Math.round(pileAbove)} mm out of the ground — past ${settings.maxOrdinaryPileHeightMm} mm they need bracing (braced or anchor piles), which this tool doesn't design.`)
  if (pileAbove > 3000) needsEngineer = needsEngineer ?? `Piles ${Math.round(pileAbove)} mm out of the ground are past what this tool should specify.`

  for (const u of bearerLines) {
    const span = spanAtU(u)
    if (!span) continue
    const [v0, v1] = span
    const p0 = v0 + settings.pileSize / 2
    const p1 = v1 - settings.pileSize / 2
    const n = Math.max(1, Math.ceil((p1 - p0) / pileSpacingMm - 1e-9))
    const at: number[] = []
    for (let i = 0; i <= n; i++) at.push(p0 + ((p1 - p0) * i) / n)
    for (const v of at) piles.push({ u, v, aboveGround: Math.max(0, pileAbove), length: round(Math.max(0, pileAbove) + settings.pileEmbedMm) })
    members.push({ kind: "bearer", runs: "v", at: u, from: v0, to: v1, depth: bearerDepth, thick: bearerThick, zTop: bearerTop, pieces: splitRun(v0, v1, maxStock, at) })
  }

  // ── ledger and rims across the joist ends ─────────────────────────────
  const endMember = (kind: "ledger" | "rim", u: number) => {
    const span = spanAtU(u)
    if (!span) return
    members.push({ kind, runs: "v", at: u, from: span[0], to: span[1], depth: joistDepth, thick: RIM, zTop: joistTop, pieces: splitRun(span[0], span[1], maxStock, joistPositions) })
  }
  if (!walls) {
    endMember(startIsLedger ? "ledger" : "rim", uMin + RIM / 2)
    endMember(endIsLedger ? "ledger" : "rim", uMax - RIM / 2)
  }
  const ledgerLength = members.filter((m) => m.kind === "ledger").reduce((a, m) => a + m.to - m.from, 0)

  // ── joists ────────────────────────────────────────────────────────────
  let hangerCount = 0
  let skewNails = 0
  let rimNails = 0
  let cantilever = 0
  joistPositions.forEach((v, index) => {
    const run = joistRuns[index]
    if (!run) return
    let [a, b] = run
    const reachesStart = a <= uMin + 1
    const reachesEnd = b >= uMax - 1
    if (!walls) {
      if (reachesStart) a += RIM
      if (reachesEnd) b -= RIM
    }
    if (b - a < 1) return
    // an edge bearer sits under the rim, just past the joist's end
    const reach = RIM + bearerThickGuess
    const crossing = supports.filter((s) => s >= a - reach && s <= b + reach)
    if (!walls) {
      const firstHold = startIsLedger && reachesStart ? a : crossing[0] ?? b
      const lastHold = endIsLedger && reachesEnd ? b : crossing[crossing.length - 1] ?? a
      cantilever = Math.max(cantilever, firstHold - a, b - lastHold)
    }
    const interior = walls ? [] : supports.filter((s) => s > a + 1 && s < b - 1)
    members.push({ kind: "joist", runs: "u", at: v, from: a, to: b, depth: joistDepth, thick: joistThick, zTop: joistTop, pieces: splitRun(a, b, maxStock, interior), index })
    if (walls) {
      if (input.hangers) hangerCount += 2
      else skewNails += 2 * settings.nailsPerSkewNailedEnd
    } else {
      // hung off a ledger; end-nailed through a rim; skew-nailed to each bearer
      if (startIsLedger && reachesStart) hangerCount++
      else if (reachesStart) rimNails += settings.nailsPerJoistToRim
      if (endIsLedger && reachesEnd) hangerCount++
      else if (reachesEnd) rimNails += settings.nailsPerJoistToRim
      skewNails += bearerLines.filter((u) => u > a - reach && u < b + reach).length * settings.nailsPerSkewNailedEnd
    }
  })
  if (cantilever > settings.maxCantileverMm)
    warnings.push(
      `Some joists run ${Math.round(cantilever)} mm past their last bearer — more than ${settings.maxCantileverMm} mm. An angled edge wants a bearer along it, which this tool doesn't lay out yet: allow for one (and its piles) on top of this order.`,
    )
  const joists = members.filter((m) => m.kind === "joist")
  if (joists.some((j) => j.pieces.some((p) => p > maxStock + 0.5)))
    warnings.push(`A joist is longer than ${maxStock / 1000} m — that's a special order length, not off the shelf.`)

  /** pieces between neighbouring joists at u, both of which run past it */
  const between = (u: number, kind: "blocking" | "nog", depth: number, zTop: number) => {
    let n = 0
    for (let i = 0; i + 1 < joists.length; i++) {
      const j0 = joists[i]
      const j1 = joists[i + 1]
      if (u < Math.max(j0.from, j1.from) + 1 || u > Math.min(j0.to, j1.to) - 1) continue
      const len = j1.at - j0.at - joistThick
      if (len < 10) continue
      members.push({ kind, runs: "v", at: u, from: j0.at + joistThick / 2, to: j1.at - joistThick / 2, depth, thick: joistThick, zTop, pieces: [round(len)] })
      n++
    }
    return n
  }

  // ── blocking: rows across each bay, more as the bay grows ─────────────
  let blockingPieces = 0
  const blockingRows: number[] = []
  bayLengths.forEach((len, i) => {
    const rows = blockingRowsForSpan(settings, len / 1000)
    for (let k = 1; k <= rows; k++) {
      const u = supports[i] + (len * k) / (rows + 1)
      blockingRows.push(u)
      blockingPieces += between(u, "blocking", joistDepth, joistTop)
    }
  })

  // ── sheet flooring ────────────────────────────────────────────────────
  const sheets: SheetPiece[] = []
  let sheetCount = 0
  let nogPieces = 0
  if (!deck) {
    const L = input.sheet.lengthMm
    const W = input.sheet.widthMm
    const preset = SHEET_PRESETS.find((p) => p.sheet.kind === input.sheet.kind && p.sheet.thicknessMm === input.sheet.thicknessMm)
    if (preset && spacing > preset.maxJoistSpacing)
      warnings.push(`${input.sheet.thicknessMm} mm ${input.sheet.kind === "ply" ? "ply" : "particleboard"} wants joists at ${preset.maxJoistSpacing} mm centres or closer.`)
    let unsupportedEnds = 0
    for (let row = 0; uMin + row * W < uMax - 1; row++) {
      const ru0 = uMin + row * W
      const ru1 = Math.min(ru0 + W, uMax)
      const s0 = spanAtU(ru0)
      const s1 = spanAtU(ru1)
      if (!s0 && !s1) continue
      const rv0 = Math.min(s0?.[0] ?? Infinity, s1?.[0] ?? Infinity)
      const rv1 = Math.max(s0?.[1] ?? -Infinity, s1?.[1] ?? -Infinity)
      // every other row starts on a half sheet, so the ends stagger
      let target = row % 2 ? L / 2 : L
      let p = rv0
      while (rv1 - p > 1) {
        if (rv1 - p <= target + 0.5) {
          sheets.push({ u0: ru0, u1: ru1, v0: p, v1: rv1, cut: rv1 - p < L - 1 || ru1 - ru0 < W - 1 })
          break
        }
        const reach = joistPositions.filter((j) => j > p + 300 && j <= p + target + 0.5)
        let next = reach.length ? reach[reach.length - 1] : p + target
        if (!reach.length) unsupportedEnds++
        if (next <= p + 1) next = p + target
        sheets.push({ u0: ru0, u1: ru1, v0: p, v1: next, cut: next - p < L - 1 || ru1 - ru0 < W - 1 })
        p = next
        target = L
      }
    }
    sheetCount = packCount(
      sheets.map((s) => s.v1 - s.v0),
      L,
    )
    if (unsupportedEnds) warnings.push(`${unsupportedEnds} sheet end${unsupportedEnds === 1 ? "" : "s"} can't land on a joist — add a nog under ${unsupportedEnds === 1 ? "it" : "them"}.`)
    else if (sheets.some((s) => !s.cut) && L % spacing > 1 && sheets.filter((s) => s.v1 - s.v0 < L - 1).length > sheets.length / 2)
      warnings.push(`${L} mm sheets don't divide into ${spacing} mm centres, so most are trimmed to land their ends on a joist.`)
    // square-edged ply: a nog under each long edge between joists (where
    // nothing else already sits under it)
    if (input.sheet.kind === "ply") {
      const taken = [...supports, uMin + RIM / 2, uMax - RIM / 2, ...blockingRows]
      for (let row = 1; uMin + row * W < uMax - 1; row++) {
        const u = uMin + row * W
        if (taken.some((t) => Math.abs(t - u) < 60)) continue
        nogPieces += between(u, "nog", Math.min(joistDepth, 90), joistTop)
      }
    }
  } else if (spacing > 450) warnings.push("Most decking boards want joists at 450 mm centres or closer — check the board maker's span.")
  if (deck && floorTop >= settings.barrierHeightMm) warnings.push(`At ${floorTop} mm off the ground this deck needs a barrier (NZBC F4: 1 m or more to fall).`)

  // ── walls under (or beside) the joist ends, for the drawings ─────────
  if (walls) {
    const wallThick = 90
    for (const u of [uMin, uMax]) {
      const span = spanAtU(u)
      if (!span) continue
      const at = input.hangers ? (u === uMin ? u - wallThick / 2 : u + wallThick / 2) : u === uMin ? u + wallThick / 2 : u - wallThick / 2
      members.push({ kind: "wall", runs: "v", at, from: span[0] - joistThick / 2, to: span[1] + joistThick / 2, depth: 600, thick: wallThick, zTop: input.hangers ? joistTop : 0, pieces: [] })
    }
  }

  const wireDogs = piles.length * settings.wireDogsPerPile
  const ledgerBolts = ledgerLength > 0 ? Math.ceil(ledgerLength / settings.ledgerBoltSpacingMm) + 1 : 0
  const sheetScrews = sheetCount * settings.screwsPerSheet
  const blockingNails = (blockingPieces + nogPieces) * settings.nailsPerBlockingPiece
  const bearerM = members.filter((m) => m.kind === "bearer").reduce((a, m) => a + (m.to - m.from) / 1000, 0)

  const labour: FrameLabour = {
    setupHours: settings.setupHours,
    joistHours: (joists.length + members.filter((m) => m.kind === "rim").length) * settings.hoursPerJoist,
    hangerHours: hangerCount * settings.hoursPerHanger,
    blockingHours: (blockingPieces + nogPieces) * settings.hoursPerBlockingPiece,
    pileHours: piles.length * settings.hoursPerPile,
    bearerHours: bearerM * settings.hoursPerBearerM,
    ledgerHours: (ledgerLength / 1000) * settings.hoursPerLedgerM,
    sheetHours: sheetCount * settings.hoursPerSheet,
    totalHours: 0,
  }
  labour.totalHours = labour.setupHours + labour.joistHours + labour.hangerHours + labour.blockingHours + labour.pileHours + labour.bearerHours + labour.ledgerHours + labour.sheetHours

  return {
    input,
    joistAxis,
    toPlan,
    bounds,
    table,
    treatment: deck ? "H3.2" : "H1.2",
    joistSize,
    joistDepth,
    joistThick,
    joistMaxSpanM: maxSpanM,
    joistSpanM,
    joistPositions,
    actualSpacingMm,
    supports,
    bearerSize,
    bearerDepth,
    bearerThick,
    loadedDimensionM,
    bearerMaxSpanM: bearerMax,
    pileSpacingMm: bearerLines.length ? pileSpacingMm : 0,
    members,
    piles,
    sheets,
    sheetCount,
    joistTop,
    floorTop,
    coveringThickness,
    hangerCount,
    skewNails,
    rimNails,
    blockingNails,
    wireDogs,
    ledgerBolts,
    sheetScrews,
    needsEngineer,
    warnings,
    labour,
  }
}

/** A plain rectangle outline: `lengthMm` along the joists, `widthMm`
 * across them — what the Floor Framing calculator draws. Joists run
 * along y. */
export const rectangleOutline = (lengthMm: number, widthMm: number): DeckPoint[] => [
  { x: 0, y: 0 },
  { x: widthMm, y: 0 },
  { x: widthMm, y: lengthMm },
  { x: 0, y: lengthMm },
]

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const numOrNull = (v: unknown, fallback: number | null) => (v === null ? null : typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback)
const strOrNull = (v: unknown, fallback: string | null) => (v === null ? null : typeof v === "string" && v ? v : fallback)

/** the order's pinned counts, read defensively: whole numbers ≥ 0 only */
export const pinsFromData = (raw: unknown): Record<string, Record<string, number>> => {
  if (typeof raw !== "object" || raw === null) return {}
  const out: Record<string, Record<string, number>> = {}
  for (const [key, lengths] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof lengths !== "object" || lengths === null) continue
    const row: Record<string, number> = {}
    for (const [len, n] of Object.entries(lengths as Record<string, unknown>)) if (typeof n === "number" && Number.isFinite(n) && n >= 0) row[len] = Math.floor(n)
    if (Object.keys(row).length) out[key] = row
  }
  return out
}

/** A saved FrameInput, anything missing or the wrong shape from `base`. */
export function frameInputFromData(raw: unknown, base: FrameInput = DEFAULT_FRAME_INPUT): FrameInput {
  const d = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  const s = (typeof d.sheet === "object" && d.sheet !== null ? d.sheet : {}) as Record<string, unknown>
  return {
    support: d.support === "walls" || d.support === "bearers" || d.support === "ledger" ? d.support : base.support,
    covering: d.covering === "sheet" || d.covering === "decking" ? d.covering : base.covering,
    joistSpacing: num(d.joistSpacing, base.joistSpacing),
    firstBaySpacing: numOrNull(d.firstBaySpacing, base.firstBaySpacing),
    joistSize: strOrNull(d.joistSize, base.joistSize),
    hangers: typeof d.hangers === "boolean" ? d.hangers : base.hangers,
    ledgerEnd: d.ledgerEnd === "end" ? "end" : d.ledgerEnd === "start" ? "start" : base.ledgerEnd,
    heightMm: num(d.heightMm, base.heightMm),
    bearerSize: strOrNull(d.bearerSize, base.bearerSize),
    maxPileSpacingMm: numOrNull(d.maxPileSpacingMm, base.maxPileSpacingMm),
    sheet: {
      kind: s.kind === "particleboard" ? "particleboard" : s.kind === "ply" ? "ply" : base.sheet.kind,
      lengthMm: num(s.lengthMm, base.sheet.lengthMm),
      widthMm: num(s.widthMm, base.sheet.widthMm),
      thicknessMm: num(s.thicknessMm, base.sheet.thicknessMm),
    },
    boardThicknessMm: num(d.boardThicknessMm, base.boardThicknessMm),
    orderPins: pinsFromData(d.orderPins),
  }
}

/**
 * "intoRake" — boards run parallel to the two long edges (sideA/sideB) and are
 *   trimmed by the raked end; every row is a different finished length.
 * "alongRake" — boards run parallel to the square end instead; most rows are a
 *   full board length, and only the rows nearest the raked side taper off,
 *   shrinking to nothing at the corner.
 */
export type BoardDirection = "intoRake" | "alongRake"

import { defaultExclusionCells, JoinExclusionCell } from "./joinRules"

/** A length of board you have on hand and how many of it. */
export interface StockItem {
  /** mm */
  length: number
  quantity: number
}

/** A row's board arrangement, snapshotted the moment any of its boards gets
 * marked as cut & placed — kept exactly as-is on every future recompute
 * (including reshuffles), so already-cut boards never stop matching the plan. */
export interface LockedRow {
  isSkeleton: boolean
  boards: { id: string; start: number; end: number; cutLength: number; stockLength: number | null }[]
  joins: { position: number; staggered: boolean; nearEdge: boolean }[]
}

/** One completed board's timing, logged in Cutting mode via the sequential
 * "Mark cut & placed" action (arbitrary taps elsewhere aren't timed). */
export interface CutLogEntry {
  segmentId: string
  rowIndex: number
  cutLength: number
  durationMs: number
  completedAt: Date
}

/** Freeform names for the deck's four edges (e.g. "House wall", "Front
 * door", "Fence line") — purely descriptive, shown alongside each edge's
 * measurement wherever the shape is drawn. */
export interface EdgeLabels {
  sideA: string
  sideB: string
  width: string
  rake: string
}

// plain, jargon-free placeholders — position-based (matching what's drawn)
// rather than a guess at real-world orientation, since every deck renames
// these to whatever's actually meaningful (e.g. "Front door", "Fence line")
export const DEFAULT_EDGE_LABELS: EdgeLabels = {
  sideA: "Top edge",
  sideB: "Bottom edge",
  width: "Width",
  rake: "Angled edge",
}

export interface DeckConfig {
  id: string
  name: string
  /** mm, across the deck — perpendicular to the square end */
  width: number
  /** mm, length along the square end (y = 0) */
  sideA: number
  /** mm, length along the raked end (y = width) */
  sideB: number
  /** when true, sideB mirrors sideA on every edit instead of standing on
   * its own — the shape editor's default for a new deck, so a plain
   * rectangle stays a rectangle as you adjust it until you deliberately
   * type a different value into the right side (which unlinks it) or the
   * angle (an equivalent way of setting sideB directly) */
  sideBLinked: boolean
  /** names for the sideA/sideB/width/diagonal edges, shown wherever the
   * shape is drawn — defaults to generic terms, editable per deck */
  edgeLabels: EdgeLabels
  /** mm, joist centres for every bay after the first */
  joistSpacing: number
  /** mm, centres for the first bay only (e.g. off a ledger/bearer) — defaults
   * to joistSpacing for a uniform grid */
  firstBaySpacing: number
  /** mm, board face width */
  boardWidth: number
  /** mm, gap between boards */
  boardGap: number
  /** board lengths on hand, with quantity of each */
  stock: StockItem[]
  /** which (rows-away, bays-away) combinations a join isn't allowed to
   * repeat in — freely toggled per-cell in the JoistExclusionMap editor.
   * See joinRules.ts. */
  joinExclusions: JoinExclusionCell[]
  /** @deprecated superseded by joinExclusions; kept only so older Firestore
   * documents (and the rules' required-field check) still validate. Not
   * read by the layout algorithm or shown in the form any more. */
  minStaggerJoists: number
  /** @deprecated superseded by joinExclusions; see minStaggerJoists */
  minSameRowJoinJoists: number
  /** no join may fall within this many joist bays of either end of a row */
  minEdgeJoists: number
  boardDirection: BoardDirection
  /** every Nth row is laid first as a "skeleton" from the longest stock,
   * staggered against the previous skeleton row; the rows in between are
   * filled in afterwards from a randomised mix of what's left */
  skeletonInterval: number
  /** -1..1, nudges which stock length the fill-in rows' random pick favours
   * when more than one on hand could reach the next join: negative skews
   * toward your shortest lengths (burn through offcuts first), positive
   * toward your longest, 0 is the plain uniform pick. Only affects that
   * random fill-in choice — skeleton rows (which deliberately maximise
   * reach to minimise joins) and any "finish the row in one board" pick
   * (which deliberately minimises waste) are unaffected either way. */
  lengthBias: number
  /** seeds the fill-in randomisation so the pattern is stable across
   * re-renders; change it (e.g. via a "shuffle" action) to get a new mix */
  layoutSeed: number
  /** ids (BoardSegment.id) of boards marked as physically cut & placed */
  completedSegmentIds: string[]
  /** rows with at least one completed board, frozen at the arrangement they
   * had when first marked — see LockedRow */
  lockedRows: Record<string, LockedRow>
  /** manual join-position overrides, keyed by row index (string), for rows
   * that haven't been secured yet — a sorted list of joist positions (mm)
   * where you want a join, replacing whatever the auto-layout picked for
   * that row. An empty array means "no joins, one full board." Ignored
   * once a row is locked (its LockedRow snapshot takes over instead). */
  manualJoins: Record<string, number[]>
  /** per-board timings, logged as each is marked done in Cutting mode */
  cutLog: CutLogEntry[]
  /** the board Cutting mode is currently timing (null once everything's done
   * or before cutting has started) */
  activeCutSegmentId: string | null
  /** ms accumulated toward activeCutSegmentId while Cutting mode was closed —
   * the live timer adds elapsed time since the page was opened on top of this */
  activeCutAccumulatedMs: number
  updatedAt: Date
}

// nothing over 6m — that's the practical max length you can actually get
// in a single piece of decking timber
export const DEFAULT_STOCK: StockItem[] = [
  { length: 3600, quantity: 20 },
  { length: 4200, quantity: 16 },
  { length: 4800, quantity: 16 },
  { length: 5400, quantity: 14 },
  { length: 6000, quantity: 14 },
]

export function defaultDeckConfig(name = "New deck"): Omit<DeckConfig, "id" | "updatedAt"> {
  return {
    name,
    width: 3000,
    sideA: 6000,
    sideB: 6000,
    sideBLinked: true,
    edgeLabels: { ...DEFAULT_EDGE_LABELS },
    joistSpacing: 400,
    firstBaySpacing: 400,
    boardWidth: 140,
    boardGap: 5,
    stock: DEFAULT_STOCK.map((s) => ({ ...s })),
    joinExclusions: defaultExclusionCells(2, 2),
    minStaggerJoists: 2,
    minSameRowJoinJoists: 2,
    minEdgeJoists: 3,
    boardDirection: "intoRake",
    skeletonInterval: 4,
    lengthBias: 0,
    layoutSeed: Math.floor(Math.random() * 2 ** 31),
    completedSegmentIds: [],
    lockedRows: {},
    manualJoins: {},
    cutLog: [],
    activeCutSegmentId: null,
    activeCutAccumulatedMs: 0,
  }
}

/** Board-run length at a given position across the width (linear interpolation
 * between the square side and the raked side) — used when boards run into the rake. */
export function lengthAt(config: Pick<DeckConfig, "sideA" | "sideB" | "width">, y: number): number {
  const { sideA, sideB, width } = config
  if (width <= 0) return sideA
  return sideA + (sideB - sideA) * (y / width)
}

/** Board-run length available at a given position along the length axis
 * (0..max(sideA,sideB)) — used when boards run along the rake. Full width up
 * to the shorter side, then tapers linearly to zero at the longer side. */
export function widthAt(config: Pick<DeckConfig, "sideA" | "sideB" | "width">, x: number): number {
  const { sideA, sideB, width } = config
  const minLen = Math.min(sideA, sideB)
  const maxLen = Math.max(sideA, sideB)
  if (x <= minLen) return width
  if (x >= maxLen || maxLen === minLen) return 0
  return (width * (maxLen - x)) / (maxLen - minLen)
}

/** Signed: positive when sideB is longer than sideA (the deck splays
 * outward), negative when shorter (it tapers in). Signed rather than a
 * magnitude specifically so it's invertible — see sideBFromRakeAngle. */
export function rakeAngleDeg(config: Pick<DeckConfig, "sideA" | "sideB" | "width">): number {
  const { sideA, sideB, width } = config
  if (width <= 0) return 0
  return (Math.atan2(sideB - sideA, width) * 180) / Math.PI
}

/** Inverse of rakeAngleDeg: the sideB that produces a given angle off of a
 * fixed sideA/width. Clamped well short of ±90° since the tangent blows up
 * near there and would otherwise produce an unusable sideB from a small
 * input change. */
export function sideBFromRakeAngle(sideA: number, width: number, angleDeg: number): number {
  const clamped = Math.max(-89, Math.min(89, angleDeg))
  return Math.max(1, Math.round(sideA + width * Math.tan((clamped * Math.PI) / 180)))
}

/** mm, the diagonal (raked) edge's actual length — not an independent
 * measurement, but fully determined by sideA/sideB/width since the other
 * three edges fix a right trapezoid's shape. */
export function rakeLength(config: Pick<DeckConfig, "sideA" | "sideB" | "width">): number {
  const { sideA, sideB, width } = config
  return Math.sqrt((sideB - sideA) ** 2 + width ** 2)
}

export function formatLength(mm: number): string {
  if (Math.abs(mm) >= 1000) {
    const m = mm / 1000
    return `${m.toFixed(m % 1 === 0 ? 0 : 2)}m`
  }
  return `${Math.round(mm)}mm`
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

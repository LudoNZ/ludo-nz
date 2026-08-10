/**
 * "intoRake" — boards run parallel to the two long edges (sideA/sideB) and are
 *   trimmed by the raked end; every row is a different finished length.
 * "alongRake" — boards run parallel to the square end instead; most rows are a
 *   full board length, and only the rows nearest the raked side taper off,
 *   shrinking to nothing at the corner.
 */
export type BoardDirection = "intoRake" | "alongRake"

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

export interface DeckConfig {
  id: string
  name: string
  /** mm, across the deck — perpendicular to the square end */
  width: number
  /** mm, length along the square end (y = 0) */
  sideA: number
  /** mm, length along the raked end (y = width) */
  sideB: number
  /** mm, joist centres */
  joistSpacing: number
  /** mm, board face width */
  boardWidth: number
  /** mm, gap between boards */
  boardGap: number
  /** board lengths on hand, with quantity of each */
  stock: StockItem[]
  /** mm, minimum distance between a join and the nearest join in the adjacent row */
  minStagger: number
  /** no join may fall within this many joist bays of either end of a row */
  minEdgeJoists: number
  boardDirection: BoardDirection
  /** every Nth row is laid first as a "skeleton" from the longest stock,
   * staggered against the previous skeleton row; the rows in between are
   * filled in afterwards from a randomised mix of what's left */
  skeletonInterval: number
  /** seeds the fill-in randomisation so the pattern is stable across
   * re-renders; change it (e.g. via a "shuffle" action) to get a new mix */
  layoutSeed: number
  /** ids (BoardSegment.id) of boards marked as physically cut & placed */
  completedSegmentIds: string[]
  /** rows with at least one completed board, frozen at the arrangement they
   * had when first marked — see LockedRow */
  lockedRows: Record<string, LockedRow>
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

export const DEFAULT_STOCK: StockItem[] = [
  { length: 3600, quantity: 6 },
  { length: 4200, quantity: 6 },
  { length: 4800, quantity: 6 },
  { length: 5400, quantity: 4 },
  { length: 6000, quantity: 4 },
]

export function defaultDeckConfig(name = "New deck"): Omit<DeckConfig, "id" | "updatedAt"> {
  return {
    name,
    width: 3000,
    sideA: 4200,
    sideB: 4200,
    joistSpacing: 400,
    boardWidth: 140,
    boardGap: 5,
    stock: DEFAULT_STOCK.map((s) => ({ ...s })),
    minStagger: 300,
    minEdgeJoists: 2,
    boardDirection: "intoRake",
    skeletonInterval: 4,
    layoutSeed: Math.floor(Math.random() * 2 ** 31),
    completedSegmentIds: [],
    lockedRows: {},
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

export function rakeAngleDeg(config: Pick<DeckConfig, "sideA" | "sideB" | "width">): number {
  const { sideA, sideB, width } = config
  if (width <= 0) return 0
  return (Math.atan2(Math.abs(sideB - sideA), width) * 180) / Math.PI
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

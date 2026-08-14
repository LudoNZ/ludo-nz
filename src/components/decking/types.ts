/**
 * "intoRake" — boards run parallel to the two long edges (sideA/sideB) and are
 *   trimmed by the raked end; every row is a different finished length.
 * "alongRake" — boards run parallel to the square end instead; most rows are a
 *   full board length, and only the rows nearest the raked side taper off,
 *   shrinking to nothing at the corner.
 */
export type BoardDirection = "intoRake" | "alongRake"

import { defaultExclusionCells, JoinExclusionCell } from "./joinRules"
import { DeckPoint } from "./polygon"

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
  /** mm, ordered polygon corners — undefined/absent means the deck is the
   * classic 4-corner right-trapezoid above (width/sideA/sideB drive
   * everything, exactly as before); once set (≥3 points) it becomes the
   * source of truth for shape instead, and width/sideA/sideB are ignored.
   * Deliberately a separate, optional field rather than replacing
   * width/sideA/sideB outright — every existing deck, and all the
   * trapezoid-specific rendering/editing built around it, keeps working
   * completely unchanged unless a corner is deliberately added. See
   * polygon.ts for the geometry this drives once it's set. */
  points?: DeckPoint[]
  /** Which polygon sides/corners have an explicit length or angle typed
   * in, rather than just following wherever their vertices happen to be
   * — keyed by index as a string, same pattern as manualJoins below.
   * Irrelevant (and always empty) unless points is set. Non-optional with
   * a {} default rather than undefined — an explicitly-undefined optional
   * field breaks a Firestore save (see data.ts/saveDeck's stripUndefined),
   * a plain empty object sidesteps that entirely. See polygon.ts's
   * solvePolygon for how an edit to one of these recalculates the rest. */
  lockedEdgeLengths: Record<string, number>
  /** Interior angle in degrees, same indexing/reasoning as
   * lockedEdgeLengths — index i is the angle at points[i]. */
  lockedVertexAngles: Record<string, number>
  /** Which project (if any) this deck's board stock is pooled with —
   * absent means the deck tracks its own private `stock` above exactly
   * as it always has. A dangling id (the project got deleted) is treated
   * identically to absent wherever the pool is looked up — see
   * projectStock.ts. Optional rather than a default like most fields
   * below, same reasoning as `points`: "not in a project" is genuinely
   * different from any concrete value, not just an empty default. */
  projectId?: string
  /** Claim order among a project's decks — lower claims stock first when
   * more than one deck wants the same length (see projectStock.ts).
   * Meaningless/unused outside a project, but non-optional with a 0
   * default like lockedEdgeLengths above, so it's never an explicit
   * `undefined` a Firestore save would need to strip. */
  projectOrder: number
  /** Extra board rows to run along an edge, on top of the field boards —
   * one covers a plain perimeter/frame board, two or three a dressed/
   * skirted edge; 0 (the default, on every edge) means neither. Keyed by
   * `"sideA"|"sideB"|"width"|"rake"` for a trapezoid deck (matching
   * EdgeLabels' own keys) or by point index as a string for a polygon
   * deck (matching lockedEdgeLengths' indexing) — same dual-keying
   * decking already has for edge-level settings. Only ever read by
   * deckCoverage.ts's order-quantity estimate; computeDeckLayout and the
   * real cut-planner don't know this exists, so an all-empty map (every
   * deck before this field existed) is completely unaffected. */
  edgeExtraBoards: Record<string, number>
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
  /** which end row 1 counts from — false (default) numbers from row.index
   * 0 as usual; true counts from the other end instead. Purely a display
   * flip (see layout.ts's displayRowNumber) — row.index itself, and
   * everything keyed by it (manualJoins, lockedRows, cutLog), is
   * completely unaffected, so this is safe to toggle at any time even on
   * a deck that's already partway cut. */
  rowNumberingReversed: boolean
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
    lockedEdgeLengths: {},
    lockedVertexAngles: {},
    // no `projectId` key at all — matches `points`' "absent" semantics
    projectOrder: 0,
    edgeExtraBoards: {},
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
    rowNumberingReversed: false,
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

/** A shared board stockpile that one or more decks can draw from instead
 * of each tracking its own separate `stock` — see projectStock.ts for how
 * a member deck's actual share gets computed (earlier decks in claim
 * order get first pick of a shared length; a deck only sees what's left
 * once every deck ahead of it in the project has taken its share).
 * Doesn't itself list its member decks — membership is entirely driven
 * by each deck's own `projectId`/`projectOrder`, the same way a deck's
 * location is driven by which collection it lives in rather than a field
 * on the project. */
export interface DeckProject {
  id: string
  name: string
  stock: StockItem[]
  updatedAt: Date
}

export function defaultDeckProject(name = "New project"): Omit<DeckProject, "id" | "updatedAt"> {
  return {
    name,
    stock: DEFAULT_STOCK.map((s) => ({ ...s })),
  }
}

/** One observed "ordered timber, this is the length mix that actually
 * turned up" data point — feeds boardOrderPrediction.ts's blended model,
 * which "Calculate quantity order" (deckForm.tsx) uses to predict a pack
 * mix for a new order. An immutable historical record rather than a
 * living document like a deck/project — it's a snapshot copy of a deck's
 * `stock` at the moment it was added (see data.ts's addStockOrder), never
 * linked back to the deck it came from, so decks stay completely
 * unaware this dataset exists at all. */
export interface StockOrder {
  id: string
  /** free text, e.g. "Unit 7" — defaults to the source deck's name but
   * editable, since this is just a label for humans browsing the list */
  label: string
  /** when the order was placed/received — distinct from createdAt, which
   * is just when this record was added to the dataset */
  orderedAt: Date
  /** total lineal mm actually requested from the supplier — compare
   * against the delivered total (sum of `stock`) to see how the pack
   * compared to what was asked for. Genuinely optional (not a 0
   * default): an order with this unset just means it wasn't recorded,
   * not that nothing was ordered. */
  orderedLinealMm?: number
  stock: StockItem[]
  createdAt: Date
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
    // as few decimal places as the value actually needs (up to 2) — 3m
    // stays 3m, 2.60m trims to 2.6m, 2.65m keeps both decimals. Trimming
    // the string toFixed(2) already produced, rather than testing m*10
    // for integer-ness, sidesteps float noise (2.6*10 isn't exactly 26).
    return `${m.toFixed(2).replace(/\.?0+$/, "")}m`
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

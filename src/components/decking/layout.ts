import { DeckConfig, lengthAt, LockedRow, StockItem, widthAt } from "./types"
import { defaultExclusionCells, exclusionBounds, exclusionSetFromCells, isExcluded } from "./joinRules"

export interface BoardSegment {
  /** stable id (row index + position within the row) for tracking completion,
   * stable as long as the deck's config and layout seed don't change */
  id: string
  /** mm, position along the row from the square end */
  start: number
  end: number
  cutLength: number
  /** stock length this segment was cut from; null if nothing on hand could cover it */
  stockLength: number | null
}

export interface JoinMark {
  position: number
  /** false if the minimum stagger from the adjacent row could not be honoured here */
  staggered: boolean
  /** true if this join had to land within minEdgeJoists joist bays of either
   * end of the row because nothing else was reachable */
  nearEdge: boolean
}

export interface RowPlan {
  index: number
  isSkeleton: boolean
  /** position along the row-stacking axis (width, if boards run into the rake;
   * length, if boards run along the rake) */
  rowStart: number
  rowEnd: number
  /** stock length the row's board(s) must cover before the raked end is trimmed */
  targetLength: number
  boards: BoardSegment[]
  joins: JoinMark[]
}

export interface DeckLayout {
  rows: RowPlan[]
  joistPositions: number[]
  /** inCurrentStock is false for a length that only appears because a locked
   * (already-cut) row is still frozen on it — the length itself has since
   * been edited/removed from the deck's stock list */
  shoppingList: { stockLength: number; used: number; onHand: number; inCurrentStock: boolean }[]
  totalBoards: number
  totalJoins: number
  totalWasteMm: number
  unresolvedSegments: number
  hasNarrowLastRow: boolean
}

// ---- deterministic PRNG (mulberry32) so a saved deck's fill pattern is stable ----
function mulberry32(seed: number) {
  let a = seed | 0
  return function rand() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- board inventory ----
class Inventory {
  private stock = new Map<number, number>()
  private onHand = new Map<number, number>()

  constructor(items: StockItem[]) {
    for (const { length, quantity } of items) {
      if (length <= 0 || quantity <= 0) continue
      this.stock.set(length, (this.stock.get(length) ?? 0) + quantity)
      this.onHand.set(length, (this.onHand.get(length) ?? 0) + quantity)
    }
  }

  available(): number[] {
    return Array.from(this.stock.entries())
      .filter(([, q]) => q > 0)
      .map(([len]) => len)
  }

  take(length: number) {
    const q = this.stock.get(length) ?? 0
    if (q > 0) this.stock.set(length, q - 1)
  }

  smallestAtLeast(need: number): number | null {
    let best: number | null = null
    for (const [len, q] of this.stock.entries()) {
      if (q > 0 && len + 1e-6 >= need && (best === null || len < best)) best = len
    }
    return best
  }

  longest(): number | null {
    let best: number | null = null
    for (const [len, q] of this.stock.entries()) {
      if (q > 0 && (best === null || len > best)) best = len
    }
    return best
  }

  onHandOf(length: number): number {
    return this.onHand.get(length) ?? 0
  }

  originalLengths(): number[] {
    return Array.from(this.onHand.keys())
  }
}

/** History entry for the rows preceding the one currently being planned,
 * `distance` rows back (1 = immediately adjacent), used to check every
 * candidate join against the combined stagger/diagonal exclusion zone. */
type RowHistoryEntry = { distance: number; joins: number[] }

function positionOk(
  candidate: number,
  history: RowHistoryEntry[],
  exclusions: Set<string>,
  joistIndex: Map<number, number>
): boolean {
  const cIdx = joistIndex.get(candidate)
  if (cIdx === undefined) return true
  for (const { distance, joins } of history) {
    for (const pos of joins) {
      const pIdx = joistIndex.get(pos)
      if (pIdx === undefined) continue
      if (isExcluded(distance, cIdx - pIdx, exclusions)) return false
    }
  }
  return true
}

/** Joist positions reachable within a stock length ahead of `p` (or behind
 * it, if `direction` is -1), filtered against the same-row exclusion cells
 * (distance 0) — the toggle grid may forbid a non-contiguous set of bay
 * offsets, so this can't just be a single mm threshold any more. */
function reachableJoists(
  p: number,
  maxReach: number,
  direction: 1 | -1,
  joistPositions: number[],
  joistIndex: Map<number, number>,
  exclusions: Set<string>
): number[] {
  const pIdx = joistIndex.get(p)
  if (pIdx === undefined) return []
  return joistPositions.filter((j) => {
    const withinReach = direction === 1 ? j > p + 1e-6 && j <= p + maxReach + 1e-6 : j < p - 1e-6 && j >= p - maxReach - 1e-6
    if (!withinReach) return false
    const jIdx = joistIndex.get(j)
    return jIdx !== undefined && !isExcluded(0, jIdx - pIdx, exclusions)
  })
}

function isEdgeSafe(position: number, targetLength: number, edgeBuffer: number): boolean {
  return position >= edgeBuffer - 1e-6 && position <= targetLength - edgeBuffer + 1e-6
}

/** Prefer candidates clear of both row ends; fall back to the full set (and
 * flag it) only if nothing reachable clears the edge buffer at all. */
function applyEdgeBuffer(
  candidates: number[],
  targetLength: number,
  edgeBuffer: number
): { candidates: number[]; nearEdge: boolean } {
  const safe = candidates.filter((j) => isEdgeSafe(j, targetLength, edgeBuffer))
  return safe.length ? { candidates: safe, nearEdge: false } : { candidates, nearEdge: true }
}

/** Skeleton rows: try to cover the row in one board first. Where a join is
 * unavoidable, reach as far as the longest board on hand *could* go (to keep
 * joins to a minimum) but then cut that join from the smallest board that
 * actually reaches the chosen position — not the literal longest one, so two
 * shorter boards are fine as long as the join count doesn't grow.
 *
 * `reversed` builds the row from the raked end backward instead of from the
 * square end forward, so the long piece sits at the opposite end of the row —
 * alternating this between skeleton rows spreads their joins across genuinely
 * different positions instead of all landing in the same neighbourhood, which
 * a minimum-stagger check alone doesn't guarantee. */
function planSkeletonRow(
  targetLength: number,
  joistPositions: number[],
  joistIndex: Map<number, number>,
  inv: Inventory,
  history: RowHistoryEntry[],
  exclusions: Set<string>,
  edgeBuffer: number,
  reversed: boolean
): { boards: BoardSegment[]; joins: JoinMark[] } {
  const boards: BoardSegment[] = []
  const joins: JoinMark[] = []
  let safety = 0

  if (!reversed) {
    let p = 0
    while (safety++ < 200) {
      const remaining = targetLength - p
      const finish = inv.smallestAtLeast(remaining)
      if (finish !== null) {
        inv.take(finish)
        boards.push({ id: "", start: p, end: targetLength, cutLength: remaining, stockLength: finish })
        break
      }

      const maxReach = inv.longest()
      if (maxReach === null) {
        boards.push({ id: "", start: p, end: targetLength, cutLength: remaining, stockLength: null })
        break
      }
      const reach = reachableJoists(p, maxReach, 1, joistPositions, joistIndex, exclusions)
      const { candidates, nearEdge } = applyEdgeBuffer(reach, targetLength, edgeBuffer)
      candidates.sort((a, b) => b - a)
      if (!candidates.length) {
        boards.push({ id: "", start: p, end: targetLength, cutLength: remaining, stockLength: null })
        break
      }

      let chosen = candidates.find((j) => positionOk(j, history, exclusions, joistIndex))
      let staggered = true
      if (chosen === undefined) {
        chosen = candidates[0]
        staggered = false
      }

      const cutLength = chosen - p
      const stockLength = inv.smallestAtLeast(cutLength) ?? maxReach
      inv.take(stockLength)
      boards.push({ id: "", start: p, end: chosen, cutLength, stockLength })
      joins.push({ position: chosen, staggered, nearEdge })
      p = chosen
    }
  } else {
    // mirror of the forward walk: p is the far boundary of the not-yet-placed
    // region [0, p]; step backward, keeping joins on real joist positions.
    let p = targetLength
    while (safety++ < 200) {
      const remaining = p
      const finish = inv.smallestAtLeast(remaining)
      if (finish !== null) {
        inv.take(finish)
        boards.push({ id: "", start: 0, end: p, cutLength: remaining, stockLength: finish })
        break
      }

      const maxReach = inv.longest()
      if (maxReach === null) {
        boards.push({ id: "", start: 0, end: p, cutLength: remaining, stockLength: null })
        break
      }
      const reach = reachableJoists(p, maxReach, -1, joistPositions, joistIndex, exclusions)
      const { candidates, nearEdge } = applyEdgeBuffer(reach, targetLength, edgeBuffer)
      candidates.sort((a, b) => a - b)
      if (!candidates.length) {
        boards.push({ id: "", start: 0, end: p, cutLength: remaining, stockLength: null })
        break
      }

      let chosen = candidates.find((j) => positionOk(j, history, exclusions, joistIndex))
      let staggered = true
      if (chosen === undefined) {
        chosen = candidates[0]
        staggered = false
      }

      const cutLength = p - chosen
      const stockLength = inv.smallestAtLeast(cutLength) ?? maxReach
      inv.take(stockLength)
      boards.push({ id: "", start: chosen, end: p, cutLength, stockLength })
      joins.push({ position: chosen, staggered, nearEdge })
      p = chosen
    }
    boards.sort((a, b) => a.start - b.start)
  }

  return { boards, joins }
}

/** Rows that need a join: pick a RANDOM board on hand for each join, so the
 * pattern doesn't repeat, falling back to the longest on hand if the random
 * pick can't even reach the next joist. Used for the fill-in rows. */
function planRowRandomFirst(
  targetLength: number,
  joistPositions: number[],
  joistIndex: Map<number, number>,
  inv: Inventory,
  history: RowHistoryEntry[],
  exclusions: Set<string>,
  edgeBuffer: number,
  rand: () => number
): { boards: BoardSegment[]; joins: JoinMark[] } {
  const boards: BoardSegment[] = []
  const joins: JoinMark[] = []
  let p = 0
  let safety = 0

  while (safety++ < 200) {
    const remaining = targetLength - p
    const finish = inv.smallestAtLeast(remaining)
    if (finish !== null) {
      inv.take(finish)
      boards.push({ id: "", start: p, end: targetLength, cutLength: remaining, stockLength: finish })
      break
    }

    const avail = inv.available()
    if (!avail.length) {
      boards.push({ id: "", start: p, end: targetLength, cutLength: remaining, stockLength: null })
      break
    }

    let chosenLength: number | null = null
    let candidates: number[] = []
    let nearEdge = false
    const tried = new Set<number>()
    // prefer a random pick that has an edge-safe reachable joist; accept a
    // near-edge one only if none of the tried picks offer anything better
    let bestNearEdgeFallback: { chosenLength: number; candidates: number[] } | null = null
    for (let attempt = 0; attempt < 8 && tried.size < avail.length; attempt++) {
      const pick = avail[Math.floor(rand() * avail.length)]
      if (tried.has(pick)) continue
      tried.add(pick)
      const js = reachableJoists(p, pick, 1, joistPositions, joistIndex, exclusions)
      if (!js.length) continue
      const { candidates: safe, nearEdge: fellBack } = applyEdgeBuffer(js, targetLength, edgeBuffer)
      if (!fellBack) {
        chosenLength = pick
        candidates = safe
        nearEdge = false
        break
      }
      if (!bestNearEdgeFallback) bestNearEdgeFallback = { chosenLength: pick, candidates: safe }
    }
    if (chosenLength === null && bestNearEdgeFallback) {
      chosenLength = bestNearEdgeFallback.chosenLength
      candidates = bestNearEdgeFallback.candidates
      nearEdge = true
    }
    if (chosenLength === null) {
      const longest = inv.longest()
      if (longest !== null) {
        const js = reachableJoists(p, longest, 1, joistPositions, joistIndex, exclusions)
        if (js.length) {
          const { candidates: safe, nearEdge: fellBack } = applyEdgeBuffer(js, targetLength, edgeBuffer)
          chosenLength = longest
          candidates = safe
          nearEdge = fellBack
        }
      }
    }
    if (chosenLength === null) {
      boards.push({ id: "", start: p, end: targetLength, cutLength: remaining, stockLength: null })
      break
    }

    // pick a position at random among the valid candidates for this length —
    // always taking the farthest reachable joist made the pattern far more
    // repetitive than it looked, since with only a handful of stock lengths
    // there are only a handful of "farthest" positions to land on. Preferring
    // the stagger-safe subset (still landing on a real joist either way) keeps
    // the safety net while letting the actual position vary properly.
    const staggerSafe = candidates.filter((j) => positionOk(j, history, exclusions, joistIndex))
    const pool = staggerSafe.length ? staggerSafe : candidates
    const chosen = pool[Math.floor(rand() * pool.length)]
    const staggered = staggerSafe.length > 0

    inv.take(chosenLength)
    boards.push({ id: "", start: p, end: chosen, cutLength: chosen - p, stockLength: chosenLength })
    joins.push({ position: chosen, staggered, nearEdge })
    p = chosen
  }

  return { boards, joins }
}

export function computeDeckLayout(config: DeckConfig): DeckLayout {
  const { width, sideA, sideB, joistSpacing, boardWidth, boardGap, stock } = config
  const firstBaySpacing = config.firstBaySpacing || joistSpacing
  const pitch = boardWidth + boardGap
  const intoRake = config.boardDirection !== "alongRake"
  const maxLen = Math.max(sideA, sideB)
  const skeletonInterval = Math.max(1, Math.round(config.skeletonInterval || 4))
  const edgeBuffer = joistSpacing * Math.max(0, config.minEdgeJoists ?? 2)
  const exclusionCells = config.joinExclusions ?? defaultExclusionCells(config.minStaggerJoists ?? 2, config.minSameRowJoinJoists ?? 2)
  const exclusions = exclusionSetFromCells(exclusionCells)
  const rowsAwayLimit = exclusionBounds(exclusionCells).maxD
  const lockedRows = config.lockedRows ?? {}

  const rowAxisExtent = intoRake ? width : maxLen
  const joistAxisMax = intoRake ? maxLen : width
  const rowCount = Math.max(1, Math.ceil(rowAxisExtent / pitch))

  // the first bay (off the ledger/bearer) can differ from the rest of the run
  const joistPositions: number[] = [0]
  if (firstBaySpacing > 0) {
    for (let x = firstBaySpacing; x <= joistAxisMax + 1e-6; x += joistSpacing) {
      joistPositions.push(Math.round(x))
    }
  }
  const joistIndex = new Map<number, number>(joistPositions.map((p, i) => [p, i]))

  const inv = new Inventory(stock)
  const seed = config.layoutSeed || 1
  // Which rows are skeleton rows at all must NOT change once you've started
  // cutting against a pattern — "Shuffle" only re-rolls the fill-in mix.
  // Infer the offset from any already-locked skeleton row (they were all
  // classified under the same offset when locked); only fall back to a
  // fresh random draw when nothing skeleton is locked in yet, so an
  // unstarted deck can still explore different skeleton patterns.
  let skeletonOffset: number | null = null
  for (const key of Object.keys(lockedRows)) {
    if (lockedRows[key].isSkeleton) {
      skeletonOffset = Number(key) % skeletonInterval
      break
    }
  }
  if (skeletonOffset === null) {
    skeletonOffset = Math.floor(mulberry32(seed)() * skeletonInterval)
  }
  // each fill-in row gets its own independent PRNG stream (seed XORed with a
  // per-row constant) rather than sharing one sequential generator — locking
  // a row means it no longer draws from that stream, and with a shared
  // generator that would shift every later row's random picks too

  type Slot = {
    index: number
    rowStart: number
    rowEnd: number
    targetLength: number
    isSkeleton: boolean
    locked?: { boards: BoardSegment[]; joins: JoinMark[] }
  }
  const slots: Slot[] = []
  let hasNarrowLastRow = false

  for (let i = 0; i < rowCount; i++) {
    const rowStart = i * pitch
    const rowEnd = Math.min(rowStart + boardWidth, rowAxisExtent)
    if (rowEnd - rowStart < boardWidth - 1e-6) hasNarrowLastRow = true

    const targetLength = intoRake
      ? Math.max(lengthAt(config, rowStart), lengthAt(config, rowEnd))
      : Math.max(widthAt(config, rowStart), widthAt(config, rowEnd))
    if (targetLength < 1) continue // deck has tapered to nothing here

    const locked = lockedRows[String(slots.length)]
    slots.push({
      index: slots.length,
      rowStart,
      rowEnd,
      targetLength,
      isSkeleton: locked ? locked.isSkeleton : slots.length % skeletonInterval === skeletonOffset,
      locked: locked ? { boards: locked.boards, joins: locked.joins } : undefined,
    })
  }

  const rowJoins = new Map<number, number[]>() // index -> join positions, filled as each row is planned
  const results = new Map<number, { boards: BoardSegment[]; joins: JoinMark[] }>()

  // Reserve every locked (already-cut) row's stock BEFORE any fresh row gets
  // to draw from inventory — not interleaved by row index. A locked row
  // represents board(s) physically already cut; that consumption is real
  // regardless of where the row sits in the sequence, and a freshly-planned
  // row (e.g. one whose skeleton classification shifted after a reshuffle)
  // must never be able to "steal" stock a locked row already accounts for.
  for (const slot of slots) {
    if (!slot.locked) continue
    for (const b of slot.locked.boards) {
      if (b.stockLength !== null) inv.take(b.stockLength)
    }
  }
  const applyLockedRow = (slot: Slot): { boards: BoardSegment[]; joins: JoinMark[] } => slot.locked!

  // Phase 1: skeleton rows, checked against the last few skeleton rows (not
  // just the immediately previous one) so a join can't sneak into the same
  // joist bay two or three skeleton rows apart either — see joinRules.ts.
  // Alternates which end the long piece starts from, so joins land at
  // genuinely different positions rather than clustering on one side.
  // Locked rows (already have a cut board) keep their frozen arrangement.
  let skeletonHistory: number[][] = [] // most-recent-first join positions
  let skeletonSeq = 0
  for (const slot of slots.filter((s) => s.isSkeleton)) {
    const history: RowHistoryEntry[] = skeletonHistory.map((joins, i) => ({ distance: i + 1, joins }))
    const result = slot.locked
      ? applyLockedRow(slot)
      : planSkeletonRow(slot.targetLength, joistPositions, joistIndex, inv, history, exclusions, edgeBuffer, skeletonSeq % 2 === 1)
    results.set(slot.index, result)
    rowJoins.set(slot.index, result.joins.map((j) => j.position))
    skeletonHistory = [result.joins.map((j) => j.position), ...skeletonHistory].slice(0, Math.max(1, rowsAwayLimit))
    skeletonSeq++
  }

  // Phase 2a: before any join-planning walk, claim a single full-length
  // board for whichever fill-in rows it fits — in RANDOM row order, not
  // physical order. Doing this in physical order (as part of phase 2b
  // below) meant the first stretch of rows that happened to fit a given
  // stock length grabbed it greedily until that size ran out, then the
  // next stretch grabbed the next size down, and so on — so both the
  // join-free rows AND the rows that then needed a join clustered into
  // contiguous bands instead of spreading across the whole deck.
  const fillSlots = slots.filter((s) => !s.isSkeleton && !s.locked)
  const shuffleRand = mulberry32((seed ^ 0x2545f491) | 0)
  const shuffled = [...fillSlots]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(shuffleRand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const resolvedFull = new Set<number>()
  for (const slot of shuffled) {
    const finish = inv.smallestAtLeast(slot.targetLength)
    if (finish === null) continue
    inv.take(finish)
    results.set(slot.index, {
      boards: [{ id: "", start: 0, end: slot.targetLength, cutLength: slot.targetLength, stockLength: finish }],
      joins: [],
    })
    rowJoins.set(slot.index, [])
    resolvedFull.add(slot.index)
  }

  // Phase 2b: whatever's left, in physical order, checked against up to
  // rowsAwayLimit rows before them (skeleton or already-placed fill-in) —
  // and, looking the other way, any skeleton row within range that comes
  // AFTER it too. Skeleton rows are all fixed by the end of phase 1, so a
  // fill-in row can (and should) work around one it hasn't reached yet; a
  // later fill-in row can't be checked the same way since it isn't planned
  // until its own turn comes up. Locked rows keep their frozen arrangement.
  for (const slot of slots) {
    if (slot.isSkeleton || resolvedFull.has(slot.index)) continue
    const history: RowHistoryEntry[] = []
    for (let d = 1; d <= rowsAwayLimit; d++) {
      const joins = rowJoins.get(slot.index - d)
      if (joins) history.push({ distance: d, joins })
    }
    for (let d = 1; d <= rowsAwayLimit; d++) {
      const ahead = slots[slot.index + d]
      if (!ahead?.isSkeleton) continue
      const joins = rowJoins.get(ahead.index)
      if (joins) history.push({ distance: d, joins })
    }
    const result = slot.locked
      ? applyLockedRow(slot)
      : planRowRandomFirst(
          slot.targetLength,
          joistPositions,
          joistIndex,
          inv,
          history,
          exclusions,
          edgeBuffer,
          mulberry32((seed ^ Math.imul(slot.index + 1, 0x9e3779b1)) | 0)
        )
    results.set(slot.index, result)
    rowJoins.set(slot.index, result.joins.map((j) => j.position))
  }

  const rows: RowPlan[] = slots.map((slot) => {
    const r = results.get(slot.index)!
    return {
      index: slot.index,
      isSkeleton: slot.isSkeleton,
      rowStart: slot.rowStart,
      rowEnd: slot.rowEnd,
      targetLength: slot.targetLength,
      boards: r.boards.map((b, i) => ({ ...b, id: `${slot.index}-${i}` })),
      joins: r.joins,
    }
  })

  const usedMap = new Map<number, number>()
  let totalWasteMm = 0
  let unresolvedSegments = 0
  let totalJoins = 0
  let totalBoards = 0

  for (const row of rows) {
    totalJoins += row.joins.length
    for (const b of row.boards) {
      totalBoards++
      if (b.stockLength === null) {
        unresolvedSegments++
        continue
      }
      usedMap.set(b.stockLength, (usedMap.get(b.stockLength) ?? 0) + 1)
      totalWasteMm += b.stockLength - b.cutLength
    }
  }

  const currentStockLengths = new Set(stock.map((s) => s.length))
  const allLengths = new Set<number>([...inv.originalLengths(), ...usedMap.keys()])
  const shoppingList = Array.from(allLengths)
    .map((stockLength) => ({
      stockLength,
      used: usedMap.get(stockLength) ?? 0,
      onHand: inv.onHandOf(stockLength),
      inCurrentStock: currentStockLengths.has(stockLength),
    }))
    .sort((a, b) => a.stockLength - b.stockLength)

  return {
    rows,
    joistPositions,
    shoppingList,
    totalBoards,
    totalJoins,
    totalWasteMm,
    unresolvedSegments,
    hasNarrowLastRow,
  }
}

/** Recomputes which rows should be locked given a new set of completed
 * segment ids: any row with at least one completed board gets its current
 * arrangement frozen (or keeps its existing freeze); any row with none gets
 * unlocked again. Call this before persisting completedSegmentIds so a
 * future reshuffle can't touch rows you've already started cutting. */
export function computeLockedRows(
  layout: DeckLayout,
  existingLocked: Record<string, LockedRow>,
  completedSegmentIds: string[]
): Record<string, LockedRow> {
  const completed = new Set(completedSegmentIds)
  const next: Record<string, LockedRow> = { ...existingLocked }
  for (const row of layout.rows) {
    const hasCompleted = row.boards.some((b) => completed.has(b.id))
    if (hasCompleted) {
      next[String(row.index)] = { isSkeleton: row.isSkeleton, boards: row.boards, joins: row.joins }
    } else {
      delete next[String(row.index)]
    }
  }
  return next
}

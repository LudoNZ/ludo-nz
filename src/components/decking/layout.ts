import { DeckConfig, lengthAt, LockedRow, StockItem, widthAt } from "./types"

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
  shoppingList: { stockLength: number; used: number; onHand: number }[]
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

function staggerOk(position: number, prevJoins: number[], minStagger: number): boolean {
  return prevJoins.every((pj) => Math.abs(pj - position) >= minStagger)
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
  inv: Inventory,
  prevJoins: number[],
  minStagger: number,
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
      const reach = joistPositions.filter((j) => j > p + 1e-6 && j <= p + maxReach + 1e-6)
      const { candidates, nearEdge } = applyEdgeBuffer(reach, targetLength, edgeBuffer)
      candidates.sort((a, b) => b - a)
      if (!candidates.length) {
        boards.push({ id: "", start: p, end: targetLength, cutLength: remaining, stockLength: null })
        break
      }

      let chosen = candidates.find((j) => staggerOk(j, prevJoins, minStagger))
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
      const reach = joistPositions.filter((j) => j < p - 1e-6 && j >= p - maxReach - 1e-6)
      const { candidates, nearEdge } = applyEdgeBuffer(reach, targetLength, edgeBuffer)
      candidates.sort((a, b) => a - b)
      if (!candidates.length) {
        boards.push({ id: "", start: 0, end: p, cutLength: remaining, stockLength: null })
        break
      }

      let chosen = candidates.find((j) => staggerOk(j, prevJoins, minStagger))
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
  inv: Inventory,
  prevJoins: number[],
  minStagger: number,
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
      const js = joistPositions.filter((j) => j > p + 1e-6 && j <= p + pick + 1e-6)
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
        const js = joistPositions.filter((j) => j > p + 1e-6 && j <= p + longest + 1e-6)
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
    const staggerSafe = candidates.filter((j) => staggerOk(j, prevJoins, minStagger))
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
  const { width, sideA, sideB, joistSpacing, boardWidth, boardGap, stock, minStagger } = config
  const firstBaySpacing = config.firstBaySpacing || joistSpacing
  const pitch = boardWidth + boardGap
  const intoRake = config.boardDirection !== "alongRake"
  const maxLen = Math.max(sideA, sideB)
  const skeletonInterval = Math.max(1, Math.round(config.skeletonInterval || 4))
  const edgeBuffer = joistSpacing * Math.max(0, config.minEdgeJoists ?? 2)
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

  const inv = new Inventory(stock)
  const seed = config.layoutSeed || 1
  // which rows within each group of `skeletonInterval` are skeleton rows also
  // shuffles with the seed, so "shuffle" changes more than just the fill-in mix
  const skeletonOffset = Math.floor(mulberry32(seed)() * skeletonInterval)
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

  const applyLockedRow = (slot: Slot): { boards: BoardSegment[]; joins: JoinMark[] } => {
    const locked = slot.locked!
    for (const b of locked.boards) {
      if (b.stockLength !== null) inv.take(b.stockLength)
    }
    return locked
  }

  // Phase 1: skeleton rows, staggered against the previous skeleton row only.
  // Alternates which end the long piece starts from, so joins land at
  // genuinely different positions rather than clustering on one side.
  // Locked rows (already have a cut board) keep their frozen arrangement.
  let prevSkeletonJoins: number[] = []
  let skeletonSeq = 0
  for (const slot of slots.filter((s) => s.isSkeleton)) {
    const result = slot.locked
      ? applyLockedRow(slot)
      : planSkeletonRow(
          slot.targetLength,
          joistPositions,
          inv,
          prevSkeletonJoins,
          minStagger,
          edgeBuffer,
          skeletonSeq % 2 === 1
        )
    results.set(slot.index, result)
    rowJoins.set(slot.index, result.joins.map((j) => j.position))
    prevSkeletonJoins = result.joins.map((j) => j.position)
    skeletonSeq++
  }

  // Phase 2: fill-in rows, in physical order, staggered against whichever row
  // (skeleton or already-placed fill-in) sits directly before them. Locked
  // rows keep their frozen arrangement.
  for (const slot of slots) {
    if (slot.isSkeleton) continue
    const prevJoins = rowJoins.get(slot.index - 1) ?? []
    const result = slot.locked
      ? applyLockedRow(slot)
      : planRowRandomFirst(
          slot.targetLength,
          joistPositions,
          inv,
          prevJoins,
          minStagger,
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

  const allLengths = new Set<number>([...inv.originalLengths(), ...usedMap.keys()])
  const shoppingList = Array.from(allLengths)
    .map((stockLength) => ({
      stockLength,
      used: usedMap.get(stockLength) ?? 0,
      onHand: inv.onHandOf(stockLength),
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

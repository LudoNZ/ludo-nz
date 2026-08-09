import { DeckConfig, lengthAt } from "./types"

export interface BoardSegment {
  /** mm, position along the row from the square end */
  start: number
  end: number
  cutLength: number
  /** shortest available stock length this segment can be cut from; null if it
   * exceeds every available stock length */
  stockLength: number | null
}

export interface JoinMark {
  position: number
  /** false if the minimum stagger from the adjacent row could not be honoured here */
  staggered: boolean
}

export interface RowPlan {
  index: number
  yStart: number
  yEnd: number
  /** stock length the row's board(s) must cover before the raked end is trimmed */
  targetLength: number
  boards: BoardSegment[]
  joins: JoinMark[]
}

export interface DeckLayout {
  rows: RowPlan[]
  joistPositions: number[]
  shoppingList: { stockLength: number; count: number }[]
  totalBoards: number
  totalJoins: number
  totalWasteMm: number
  unresolvedSegments: number
  hasNarrowLastRow: boolean
}

function smallestStockAtLeast(need: number, stockLengths: number[]): number | null {
  let best: number | null = null
  for (const s of stockLengths) {
    if (s + 1e-6 >= need && (best === null || s < best)) best = s
  }
  return best
}

function planRow(
  targetLength: number,
  joistPositions: number[],
  stockLengths: number[],
  prevJoins: number[],
  minStagger: number
): { boards: BoardSegment[]; joins: JoinMark[] } {
  const maxStock = stockLengths.length ? Math.max(...stockLengths) : 0
  const boards: BoardSegment[] = []
  const joins: JoinMark[] = []
  let p = 0

  // guard against pathological configs (e.g. maxStock shorter than one joist bay)
  let safety = 0
  while (targetLength - p > maxStock + 1e-6 && safety < 200) {
    safety++
    const candidates = joistPositions.filter((j) => j > p + 1e-6 && j <= p + maxStock + 1e-6)
    if (!candidates.length) break
    candidates.sort((a, b) => b - a)

    let chosen = candidates.find((j) => prevJoins.every((pj) => Math.abs(pj - j) >= minStagger))
    let staggered = true
    if (chosen === undefined) {
      chosen = candidates[0]
      staggered = false
    }

    const cutLength = chosen - p
    boards.push({ start: p, end: chosen, cutLength, stockLength: smallestStockAtLeast(cutLength, stockLengths) })
    joins.push({ position: chosen, staggered })
    p = chosen
  }

  const cutLength = targetLength - p
  boards.push({ start: p, end: targetLength, cutLength, stockLength: smallestStockAtLeast(cutLength, stockLengths) })

  return { boards, joins }
}

export function computeDeckLayout(config: DeckConfig): DeckLayout {
  const { width, sideA, sideB, joistSpacing, boardWidth, boardGap, stockLengths, minStagger } = config
  const pitch = boardWidth + boardGap
  const rowCount = Math.max(1, Math.ceil(width / pitch))
  const maxLen = Math.max(sideA, sideB)

  const joistPositions: number[] = []
  for (let x = 0; x <= maxLen + 1e-6; x += joistSpacing) joistPositions.push(Math.round(x))

  const sortedStock = [...stockLengths].sort((a, b) => a - b)

  const rows: RowPlan[] = []
  let prevJoins: number[] = []
  let hasNarrowLastRow = false

  for (let i = 0; i < rowCount; i++) {
    const yStart = i * pitch
    const yEnd = Math.min(yStart + boardWidth, width)
    if (yEnd - yStart < boardWidth - 1e-6) hasNarrowLastRow = true

    const targetLength = Math.max(lengthAt(config, yStart), lengthAt(config, yEnd))
    const { boards, joins } = planRow(targetLength, joistPositions, sortedStock, prevJoins, minStagger)

    rows.push({ index: i, yStart, yEnd, targetLength, boards, joins })
    prevJoins = joins.map((j) => j.position)
  }

  const shoppingMap = new Map<number, number>()
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
      shoppingMap.set(b.stockLength, (shoppingMap.get(b.stockLength) ?? 0) + 1)
      totalWasteMm += b.stockLength - b.cutLength
    }
  }

  const shoppingList = Array.from(shoppingMap.entries())
    .map(([stockLength, count]) => ({ stockLength, count }))
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

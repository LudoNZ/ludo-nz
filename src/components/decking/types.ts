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
  boardDirection: BoardDirection
  /** every Nth row is laid first as a "skeleton" from the longest stock,
   * staggered against the previous skeleton row; the rows in between are
   * filled in afterwards from a randomised mix of what's left */
  skeletonInterval: number
  /** seeds the fill-in randomisation so the pattern is stable across
   * re-renders; change it (e.g. via a "shuffle" action) to get a new mix */
  layoutSeed: number
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
    boardDirection: "intoRake",
    skeletonInterval: 4,
    layoutSeed: Math.floor(Math.random() * 2 ** 31),
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

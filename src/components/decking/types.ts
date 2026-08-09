export interface DeckConfig {
  id: string
  name: string
  /** mm, across the deck — perpendicular to the board run direction */
  width: number
  /** mm, board-run length along the square end (y = 0) */
  sideA: number
  /** mm, board-run length along the raked end (y = width) */
  sideB: number
  /** mm, joist centres */
  joistSpacing: number
  /** mm, board face width */
  boardWidth: number
  /** mm, gap between boards */
  boardGap: number
  /** mm, available stock lengths, ascending */
  stockLengths: number[]
  /** mm, minimum distance between a join and the nearest join in the adjacent row */
  minStagger: number
  updatedAt: Date
}

export const DEFAULT_STOCK_LENGTHS = [3600, 4200, 4800, 5400, 6000]

export function defaultDeckConfig(name = "New deck"): Omit<DeckConfig, "id" | "updatedAt"> {
  return {
    name,
    width: 3000,
    sideA: 4200,
    sideB: 4200,
    joistSpacing: 400,
    boardWidth: 140,
    boardGap: 5,
    stockLengths: [...DEFAULT_STOCK_LENGTHS],
    minStagger: 300,
  }
}

/** Board-run length at a given position across the width (linear interpolation
 * between the square side and the raked side). */
export function lengthAt(config: Pick<DeckConfig, "sideA" | "sideB" | "width">, y: number): number {
  const { sideA, sideB, width } = config
  if (width <= 0) return sideA
  return sideA + (sideB - sideA) * (y / width)
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

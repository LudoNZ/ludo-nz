/** Cutting-stock optimiser: packs every cut piece from every wall onto
 * the fewest lineal metres of stock boards, choosing between whatever
 * lengths the yard supplies. Pure math, no React.
 *
 * Heuristic, not exact: best-fit-decreasing into bins of each candidate
 * stock length, then every finished board is shrunk to the shortest
 * stock length that still holds its pieces. That's re-run over a batch
 * of lightly shuffled piece orders (seeded, so the answer never jumps
 * between renders) and the cheapest packing wins — least lineal metres,
 * then fewest boards. Best fit drops each short piece into the tightest
 * existing offcut before it ever starts a new board, and a piece that
 * already matches a stock length stays on its own whole board. */

import { FULL_BOARD_TOLERANCE_MM, smallestFit } from "./weatherboardCalc"

export interface Piece {
  length: number
  label: string
}

export interface StockBoard {
  stockLength: number
  pieces: Piece[]
  offcut: number
}

export interface CuttingPlan {
  boards: StockBoard[]
  /** stock length → board count, ascending by length */
  order: { length: number; count: number }[]
  totalStockMm: number
  totalCutMm: number
  /** Boards used whole for a single piece — no cut beyond squaring the ends. */
  fullLengthBoards: number
}

const SHUFFLE_ROUNDS = 150

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const packBestFit = (pieces: Piece[], cap: number, stock: number[]): StockBoard[] => {
  const maxStock = Math.max(...stock)
  const bins: { cap: number; used: number; pieces: Piece[] }[] = []
  for (const p of pieces) {
    let best: (typeof bins)[number] | null = null
    for (const b of bins) {
      const left = b.cap - b.used
      if (left >= p.length && (!best || left < best.cap - best.used)) best = b
    }
    if (!best) {
      best = { cap: p.length <= cap ? cap : (smallestFit(p.length, stock) ?? maxStock), used: 0, pieces: [] }
      bins.push(best)
    }
    best.used += p.length
    best.pieces.push(p)
  }
  return bins.map((b) => {
    const stockLength = smallestFit(b.used, stock) ?? b.cap
    return { stockLength, pieces: b.pieces, offcut: stockLength - b.used }
  })
}

const total = (boards: StockBoard[]) => boards.reduce((sum, b) => sum + b.stockLength, 0)

export const optimiseCutting = (pieces: Piece[], stockLengths: number[]): CuttingPlan => {
  const stock = [...new Set(stockLengths)].filter((s) => s > 0).sort((a, b) => a - b)
  if (pieces.length === 0 || stock.length === 0) return { boards: [], order: [], totalStockMm: 0, totalCutMm: 0, fullLengthBoards: 0 }

  const sorted = [...pieces].sort((a, b) => b.length - a.length)
  const rand = mulberry32(pieces.length * 7919 + Math.round(pieces.reduce((s, p) => s + p.length, 0)))

  let best: StockBoard[] | null = null
  const consider = (boards: StockBoard[]) => {
    if (!best || total(boards) < total(best) || (total(boards) === total(best) && boards.length < best.length)) {
      best = boards
    }
  }

  for (let round = 0; round <= SHUFFLE_ROUNDS; round++) {
    // round 0 is plain decreasing order; later rounds swap neighbours at
    // random, which keeps the order roughly decreasing (what makes best
    // fit work) while exploring different pairings
    const order = [...sorted]
    if (round > 0) {
      for (let i = 0; i < order.length - 1; i++) {
        if (rand() < 0.3) [order[i], order[i + 1]] = [order[i + 1], order[i]]
      }
    }
    for (const cap of stock) consider(packBestFit(order, cap, stock))
  }

  const boards = [...(best as StockBoard[] | null ?? [])].sort(
    (a, b) => b.stockLength - a.stockLength || a.offcut - b.offcut,
  )
  const counts = new Map<number, number>()
  for (const b of boards) counts.set(b.stockLength, (counts.get(b.stockLength) ?? 0) + 1)
  return {
    boards,
    order: [...counts.entries()].map(([length, count]) => ({ length, count })).sort((a, b) => a.length - b.length),
    totalStockMm: total(boards),
    totalCutMm: pieces.reduce((s, p) => s + p.length, 0),
    fullLengthBoards: boards.filter((b) => b.pieces.length === 1 && b.offcut <= FULL_BOARD_TOLERANCE_MM).length,
  }
}

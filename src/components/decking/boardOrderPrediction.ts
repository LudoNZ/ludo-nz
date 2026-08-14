/** Predicts what mix of board lengths a supplier pack will likely
 * contain for a given total order quantity, learned from a small,
 * growing dataset of past "ordered X, this mix turned up" observations
 * (StockOrder — see types.ts, populated via the board-orders page). Pure
 * math, no Firestore/React. */

import { StockItem, StockOrder } from "./types"

/** Blends every historical order's own length-mix proportions into one
 * profile: for each order, each length's share of that order's own total
 * lineal metres; unweighted average of each length's share across every
 * order (a length absent from a given order counts as 0% for it, not
 * excluded from the average — so one order using a length nobody else
 * has ever seen doesn't get treated as if it never happened). With a
 * single observation the blend is just that order's own proportions. */
export function blendHistoricalMix(orders: StockOrder[]): Map<number, number> {
  if (orders.length === 0) return new Map()

  const perOrderShares: Map<number, number>[] = orders.map((order) => {
    const totalMm = order.stock.reduce((sum, s) => sum + s.length * s.quantity, 0)
    const shares = new Map<number, number>()
    if (totalMm <= 0) return shares
    for (const s of order.stock) {
      const mm = s.length * s.quantity
      shares.set(s.length, (shares.get(s.length) ?? 0) + mm / totalMm)
    }
    return shares
  })

  const allLengths = new Set<number>()
  for (const shares of perOrderShares) {
    for (const length of shares.keys()) allLengths.add(length)
  }

  const blend = new Map<number, number>()
  for (const length of allLengths) {
    const sum = perOrderShares.reduce((total, shares) => total + (shares.get(length) ?? 0), 0)
    blend.set(length, sum / orders.length)
  }
  return blend
}

/** Scales the blended mix to a target total lineal mm, rounding each
 * length's share to a whole board count. No wastage margin — this is
 * the predicted mix for exactly the target quantity, not a padded one
 * (see deckCoverage.ts's own doc comment on the same choice). Sorted
 * ascending, matching every other stock list in this app. */
export function predictOrder(targetLinealMm: number, blend: Map<number, number>): StockItem[] {
  if (targetLinealMm <= 0 || blend.size === 0) return []
  const items: StockItem[] = []
  for (const [length, proportion] of blend) {
    if (length <= 0 || proportion <= 0) continue
    const quantity = Math.round((targetLinealMm * proportion) / length)
    if (quantity > 0) items.push({ length, quantity })
  }
  return items.sort((a, b) => a.length - b.length)
}

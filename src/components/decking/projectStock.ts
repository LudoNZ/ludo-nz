/** Pure math for splitting a project's shared board stockpile across its
 * member decks — no React, no Firestore. Deliberately kept separate from
 * layout.ts: this is a project-level concern layered on top of the
 * single-deck layout engine, which itself needs (and gets) zero changes
 * to support it — Inventory (layout.ts) already just takes whatever
 * `stock` arrives in a DeckConfig, so "pooled stock" is simply a
 * different StockItem[] computed here and substituted in before a page
 * calls computeDeckLayout, the same way the polygon-shapes work earlier
 * this session never had to touch layout.ts either. */

import { computeDeckLayout } from "./layout"
import { DeckConfig, StockItem } from "./types"

/** For every deck in a project (ordered by projectOrder, ascending),
 * computes the stock actually available to it: the project's pool, minus
 * whatever every earlier deck in the order already claimed for its own
 * plan. Earlier decks always get first claim on a shared length — a deck
 * only ever sees what's left once everything ahead of it has taken its
 * share. Ties in projectOrder fall back to id so the result is always
 * deterministic regardless of iteration order.
 *
 * Each deck's own actual usage is found by running computeDeckLayout for
 * it (reusing the real engine, not a separate estimate) against whatever
 * pool remains at its turn — so the result reflects the same
 * skeleton-row/fill-in/waste-guard-rail behaviour a deck would get if it
 * had that stock all to itself, not a naive proportional split.
 *
 * Returns a deckId → effective StockItem[] map. Every deck gets an entry,
 * including ones with no stock left at all (an empty array) — that's a
 * legitimate result (their layout will show unresolved segments), not a
 * missing one. */
export function computeProjectStockAllocation(
  poolStock: StockItem[],
  decks: { id: string; config: DeckConfig; projectOrder: number }[]
): Map<string, StockItem[]> {
  const remaining = new Map<number, number>()
  for (const { length, quantity } of poolStock) {
    if (length <= 0 || quantity <= 0) continue
    remaining.set(length, (remaining.get(length) ?? 0) + quantity)
  }

  const ordered = [...decks].sort((a, b) => a.projectOrder - b.projectOrder || a.id.localeCompare(b.id))

  const result = new Map<string, StockItem[]>()
  for (const { id, config } of ordered) {
    const effectiveStock: StockItem[] = Array.from(remaining.entries())
      .filter(([, quantity]) => quantity > 0)
      .map(([length, quantity]) => ({ length, quantity }))
    result.set(id, effectiveStock)

    const layout = computeDeckLayout({ ...config, stock: effectiveStock })
    for (const item of layout.shoppingList) {
      if (item.used > 0) {
        remaining.set(item.stockLength, Math.max(0, (remaining.get(item.stockLength) ?? 0) - item.used))
      }
    }
  }
  return result
}

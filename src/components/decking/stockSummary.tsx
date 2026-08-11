"use client"

import { DeckLayout, previewBoardReach, previewJoinClash } from "./layout"
import { DeckConfig, formatLength } from "./types"
import styles from "./stockSummary.module.scss"

interface SummaryRow {
  key: string
  label: string
  range?: string
  used: number
  onHand: number
  placed: number
  inCurrentStock: boolean
  sortLen: number
  /** the exact mm length to act on if this row is clicked — the stock
   * length itself when ungrouped, or the shortest length in the group when
   * grouped by spans (every member of a span-group reaches the same number
   * of joist bays, so the shortest is the safe, always-achievable choice) */
  repLength: number
}

/** Stock-usage bars: for each length (or, in span mode, each group of
 * lengths that clear the same number of joist spans) shows how much of
 * what's on hand is placed / allocated-but-uncut / spare. Shared between
 * the full cut list and the join editor — on the join editor a length only
 * matters for how many joist bays it can jump, so grouping by that (in
 * joistSpacing increments) is more useful there than an exact-mm list. */
const StockSummary: React.FC<{
  layout: DeckLayout
  completedSegmentIds: string[]
  /** pass the deck's joistSpacing to group rows by joist-span count instead
   * of exact stock length */
  groupBySpans?: number
  note?: string
  /** when provided, each row becomes tappable — reports the length to place
   * on whatever row is currently focused elsewhere on the page */
  onSelectLength?: (lengthMm: number) => void
  /** config + the row currently focused elsewhere on the page — together,
   * lets each entry preview whether placing it would clash with the
   * stagger/edge rules, same proactive hint as the join scroller's */
  config?: DeckConfig
  activeRowIndex?: number | null
}> = ({ layout, completedSegmentIds, groupBySpans, note, onSelectLength, config, activeRowIndex }) => {
  const completedSet = new Set(completedSegmentIds)
  // scale bars off current-stock lengths only, so a length that's only
  // around because a locked row is still frozen on it can't become the
  // longest entry and squash every real bar down to a sliver
  const currentLengths = layout.shoppingList.filter((s) => s.inCurrentStock).map((s) => s.stockLength)
  const maxStockLength = Math.max(1, ...(currentLengths.length ? currentLengths : layout.shoppingList.map((s) => s.stockLength)))

  const placedByLength = new Map<number, number>()
  for (const row of layout.rows) {
    for (const b of row.boards) {
      if (b.stockLength !== null && completedSet.has(b.id)) {
        placedByLength.set(b.stockLength, (placedByLength.get(b.stockLength) ?? 0) + 1)
      }
    }
  }
  const totalPlaced = Array.from(placedByLength.values()).reduce((sum, n) => sum + n, 0)
  const totalUsed = layout.shoppingList.reduce((sum, s) => sum + s.used, 0)
  const totalOnHand = layout.shoppingList.reduce((sum, s) => sum + s.onHand, 0)

  let rows: SummaryRow[]
  if (groupBySpans) {
    const spacing = groupBySpans
    const groups = new Map<number, { lengths: number[]; used: number; onHand: number; placed: number; inCurrentStock: boolean }>()
    for (const item of layout.shoppingList) {
      const spans = Math.floor(item.stockLength / spacing)
      const g = groups.get(spans) ?? { lengths: [], used: 0, onHand: 0, placed: 0, inCurrentStock: false }
      g.lengths.push(item.stockLength)
      g.used += item.used
      g.onHand += item.onHand
      g.placed += placedByLength.get(item.stockLength) ?? 0
      g.inCurrentStock = g.inCurrentStock || item.inCurrentStock
      groups.set(spans, g)
    }
    rows = Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([spans, g]) => {
        const lo = Math.min(...g.lengths)
        const hi = Math.max(...g.lengths)
        return {
          key: String(spans),
          label: `${spans} span${spans === 1 ? "" : "s"}`,
          range: lo === hi ? formatLength(lo) : `${formatLength(lo)}–${formatLength(hi)}`,
          used: g.used,
          onHand: g.onHand,
          placed: g.placed,
          inCurrentStock: g.inCurrentStock,
          sortLen: hi,
          repLength: lo,
        }
      })
  } else {
    rows = layout.shoppingList.map((item) => ({
      key: String(item.stockLength),
      label: formatLength(item.stockLength),
      used: item.used,
      onHand: item.onHand,
      placed: placedByLength.get(item.stockLength) ?? 0,
      inCurrentStock: item.inCurrentStock,
      sortLen: item.stockLength,
      repLength: item.stockLength,
    }))
  }

  // proactive "this would clash" hint per length, mirroring the join
  // scroller's — only meaningful once something's tappable and focused
  const activeRow = config && activeRowIndex != null ? layout.rows.find((r) => r.index === activeRowIndex) : undefined
  const wouldClash = (repLength: number): boolean => {
    if (!config || !activeRow) return false
    const reach = previewBoardReach(layout, activeRow.index, repLength)
    if (reach === null) return false
    const current = activeRow.joins.map((j) => j.position)
    const preview = previewJoinClash(config, activeRow.index, current, reach)
    return preview ? !preview.staggered || preview.nearEdge : false
  }

  return (
    <div className={styles.stockSummary}>
      <div className={styles.stockHeader}>
        <h3>Stock usage</h3>
        <span className={styles.stockTotal}>
          {totalPlaced > 0 && <span className={styles.placedBadge}>✓{totalPlaced} placed ·</span>}{" "}
          {totalUsed}/{totalOnHand} planned
        </span>
      </div>
      {note && <p className={styles.note}>{note}</p>}
      <div className={styles.stockTable}>
        {rows.map((row) => {
          const spare = Math.max(0, row.onHand - row.used)
          const lengthPct = Math.min(100, (row.sortLen / maxStockLength) * 100)
          // the bar's own width is the length comparison across rows; within
          // that, three segments split 100% of what you have on hand (or, if
          // this length isn't in current stock at all — a locked-only length
          // — 100% of what's used, since there's no "on hand" to speak of)
          const denom = row.onHand > 0 ? row.onHand : row.used
          const placedPct = denom > 0 ? Math.min(100, (row.placed / denom) * 100) : 0
          const allocatedPct = denom > 0 ? Math.max(0, Math.min(100 - placedPct, ((row.used - row.placed) / denom) * 100)) : 0
          const sparePct = Math.max(0, 100 - placedPct - allocatedPct)
          const clash = wouldClash(row.repLength)
          const rowContent = (
            <>
              <span className={styles.stockLength}>
                <span>
                  {row.label}
                  {clash && (
                    <span className={styles.clashMark} title="Would clash with the stagger or edge-buffer rule">
                      ×
                    </span>
                  )}
                </span>
                {row.range && <span className={styles.stockRange}>{row.range}</span>}
              </span>
              <div className={styles.stockTrack}>
                <div className={styles.stockFill} style={{ width: `${lengthPct}%` }}>
                  {placedPct > 0 && <div className={styles.segPlaced} style={{ width: `${placedPct}%` }} />}
                  {allocatedPct > 0 && <div className={styles.segAllocated} style={{ width: `${allocatedPct}%` }} />}
                  {sparePct > 0 && <div className={styles.segSpare} style={{ width: `${sparePct}%` }} />}
                </div>
              </div>
              <span className={styles.stockCount}>
                {row.placed > 0 && <span className={styles.placedBadge}>✓{row.placed}</span>}
                {row.used}/{row.onHand}
                {spare > 0 && <span className={styles.spareBadge}>+{spare} spare</span>}
              </span>
            </>
          )
          const rowClass = `${styles.stockRow} ${!row.inCurrentStock ? styles.legacy : ""} ${onSelectLength ? styles.clickable : ""}`
          return onSelectLength ? (
            <button
              key={row.key}
              type="button"
              className={rowClass}
              onClick={() => onSelectLength(row.repLength)}
              aria-label={`Place a ${row.range ? `~${formatLength(row.repLength)}` : row.label} board on the focused row, joined at its reach${clash ? " — would clash with the stagger or edge-buffer rule" : ""}`}
            >
              {rowContent}
            </button>
          ) : (
            <div key={row.key} className={rowClass}>
              {rowContent}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default StockSummary

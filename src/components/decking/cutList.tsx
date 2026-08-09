"use client"

import Button from "@/components/button/button"
import { DeckLayout } from "./layout"
import { formatLength } from "./types"
import styles from "./cutList.module.scss"

const CutList: React.FC<{
  layout: DeckLayout
  completedSegmentIds: string[]
  onToggleSegment: (id: string) => void
  onClearCompleted: () => void
}> = ({ layout, completedSegmentIds, onToggleSegment, onClearCompleted }) => {
  const completedSet = new Set(completedSegmentIds)
  const placedCount = layout.rows.reduce(
    (sum, r) => sum + r.boards.filter((b) => completedSet.has(b.id)).length,
    0
  )
  const unstaggeredCount = layout.rows.reduce(
    (sum, r) => sum + r.joins.filter((j) => !j.staggered).length,
    0
  )
  const nearEdgeCount = layout.rows.reduce((sum, r) => sum + r.joins.filter((j) => j.nearEdge).length, 0)
  const maxStockLength = Math.max(1, ...layout.shoppingList.map((s) => s.stockLength))
  const totalUsed = layout.shoppingList.reduce((sum, s) => sum + s.used, 0)
  const totalOnHand = layout.shoppingList.reduce((sum, s) => sum + s.onHand, 0)

  return (
    <div className={styles.cutList}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <strong>{layout.rows.length}</strong>
          <span>rows</span>
        </div>
        <div className={styles.stat}>
          <strong>{layout.totalBoards}</strong>
          <span>boards</span>
        </div>
        <div className={styles.stat}>
          <strong>{layout.totalJoins}</strong>
          <span>joins</span>
        </div>
        <div className={styles.stat}>
          <strong>{formatLength(layout.totalWasteMm)}</strong>
          <span>total offcut</span>
        </div>
        <div className={styles.stat}>
          <strong>
            {placedCount}/{layout.totalBoards}
          </strong>
          <span>placed</span>
        </div>
      </div>

      {layout.unresolvedSegments > 0 && (
        <div className={styles.warning}>
          ⚠ {layout.unresolvedSegments} segment(s) couldn&apos;t be covered — you&apos;re out of
          suitable stock. Add more of a length (or a longer one) below.
        </div>
      )}
      {unstaggeredCount > 0 && (
        <div className={styles.warning}>
          ⚠ {unstaggeredCount} join(s) couldn&apos;t meet the minimum stagger from the row next
          to them — marked in red on the plan.
        </div>
      )}
      {nearEdgeCount > 0 && (
        <div className={styles.warning}>
          ⚠ {nearEdgeCount} join(s) had to land within the edge buffer of a row — nothing else was
          reachable there.
        </div>
      )}
      {layout.hasNarrowLastRow && (
        <div className={styles.warning}>
          ⚠ The last row needs ripping narrower than a full board to fit the width exactly.
        </div>
      )}

      <div>
        <div className={styles.stockHeader}>
          <h3>Stock usage</h3>
          <span className={styles.stockTotal}>
            {totalUsed}/{totalOnHand} used
          </span>
        </div>
        <div className={styles.stockTable}>
          {layout.shoppingList.map((item) => (
            <div key={item.stockLength} className={styles.stockRow}>
              <span className={styles.stockLength}>{formatLength(item.stockLength)}</span>
              <div className={styles.stockTrack}>
                <div
                  className={styles.stockFill}
                  style={{ width: `${(item.stockLength / maxStockLength) * 100}%` }}
                />
              </div>
              <span className={styles.stockCount}>
                {item.used}/{item.onHand}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <h3>Row-by-row cut plan</h3>
          {placedCount > 0 && (
            <Button size="small" variant="secondary" onClick={onClearCompleted}>
              Clear all marks
            </Button>
          )}
        </div>
        <p className={styles.hint}>Tap a segment once it&apos;s cut &amp; placed — tap again to undo.</p>
        <div className={styles.head}>
          <span>Row</span>
          <span>Segments (cut length from stock length)</span>
        </div>
        {layout.rows.map((row) => (
          <div key={row.index} className={styles.rowItem}>
            <span>
              #{row.index + 1}
              {row.isSkeleton && <span className={styles.skeletonTag}> skeleton</span>}
              <br />
              {formatLength(row.rowStart)}
            </span>
            <span className={styles.segments}>
              {row.boards.map((b) => {
                const placed = completedSet.has(b.id)
                return (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => onToggleSegment(b.id)}
                    className={`${styles.segment} ${b.stockLength === null ? styles.unresolved : ""} ${placed ? styles.placed : ""}`}
                  >
                    {placed && "✓ "}
                    {formatLength(b.cutLength)}
                    {b.stockLength !== null ? ` (from ${formatLength(b.stockLength)})` : " — no stock long enough"}
                  </button>
                )
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CutList

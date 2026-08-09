"use client"

import { DeckLayout } from "./layout"
import { formatLength } from "./types"
import styles from "./cutList.module.scss"

const CutList: React.FC<{ layout: DeckLayout }> = ({ layout }) => {
  const unstaggeredCount = layout.rows.reduce(
    (sum, r) => sum + r.joins.filter((j) => !j.staggered).length,
    0
  )

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
      {layout.hasNarrowLastRow && (
        <div className={styles.warning}>
          ⚠ The last row needs ripping narrower than a full board to fit the width exactly.
        </div>
      )}

      <div>
        <h3>Stock usage</h3>
        <div className={styles.shoppingList}>
          {layout.shoppingList.map((item) => (
            <div key={item.stockLength} className={styles.item}>
              <span>{formatLength(item.stockLength)} boards</span>
              <strong>
                {item.used} used / {item.onHand} on hand
              </strong>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.table}>
        <h3>Row-by-row cut plan</h3>
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
              {row.boards.map((b, i) => (
                <span
                  key={i}
                  className={`${styles.segment} ${b.stockLength === null ? styles.unresolved : ""}`}
                >
                  {formatLength(b.cutLength)}
                  {b.stockLength !== null ? ` (from ${formatLength(b.stockLength)})` : " — no stock long enough"}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CutList

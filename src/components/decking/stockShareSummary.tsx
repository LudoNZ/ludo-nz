"use client"

import { formatLength, StockItem } from "./types"
import styles from "./stockShareSummary.module.scss"

/** Read-only rendering of a StockItem[] — total boards/lineal plus a
 * per-length breakdown, no editing. For wherever a *computed* stock
 * figure needs showing (a project deck's current share of the pool)
 * rather than an editable inventory (see boardStockPanel.tsx for that,
 * used for a deck's own stock or a project's shared pool). */
const StockShareSummary: React.FC<{ stock: StockItem[] }> = ({ stock }) => {
  const totalBoards = stock.reduce((sum, s) => sum + s.quantity, 0)
  const totalLinealMm = stock.reduce((sum, s) => sum + s.length * s.quantity, 0)
  const sorted = [...stock].sort((a, b) => a.length - b.length)

  return (
    <div className={styles.share}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <strong>{totalBoards}</strong>
          <span>boards</span>
        </div>
        <div className={styles.stat}>
          <strong>{formatLength(totalLinealMm)}</strong>
          <span>total lineal</span>
        </div>
      </div>
      {sorted.length > 0 ? (
        <ul className={styles.list}>
          {sorted.map((s) => (
            <li key={s.length}>
              {formatLength(s.length)} × {s.quantity}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>Nothing left of the shared pool for this deck right now.</p>
      )}
    </div>
  )
}

export default StockShareSummary

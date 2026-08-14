"use client"

import { formatLength, StockItem } from "./types"
import styles from "./stockDistributionChart.module.scss"

/** Horizontal bar chart of a StockItem[]'s length mix, by share of total
 * lineal metres — same rounded-track/filled-bar visual language
 * stockSummary.tsx's usage bars already use, just one bar per length
 * instead of a three-way placed/allocated/spare split. Used both for a
 * historical StockOrder's own recorded mix and for a freshly predicted
 * one (board-orders page and deckForm.tsx's "Calculate quantity order"
 * respectively), so it only ever takes the plain StockItem[] shape both
 * have in common. */
const StockDistributionChart: React.FC<{ stock: StockItem[] }> = ({ stock }) => {
  const totalLinealMm = stock.reduce((sum, s) => sum + s.length * s.quantity, 0)
  const sorted = [...stock].sort((a, b) => a.length - b.length)

  if (sorted.length === 0 || totalLinealMm <= 0) {
    return <p className={styles.empty}>No boards to chart.</p>
  }

  return (
    <div className={styles.chart}>
      {sorted.map((s) => {
        const mm = s.length * s.quantity
        const pct = (mm / totalLinealMm) * 100
        return (
          <div key={s.length} className={styles.row}>
            <span className={styles.label}>{formatLength(s.length)}</span>
            <div className={styles.track}>
              <div className={styles.fill} style={{ width: `${pct}%` }} />
            </div>
            <span className={styles.count}>
              ×{s.quantity} <span className={styles.pct}>({pct.toFixed(0)}%)</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default StockDistributionChart

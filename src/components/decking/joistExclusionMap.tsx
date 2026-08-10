"use client"

import { exclusionBounds, isExcluded, JoinExclusionCell } from "./joinRules"
import styles from "./joistExclusionMap.module.scss"

// keeps the grid from growing indefinitely if someone keeps clicking outward
const MAX_REACH = 8

/** Visual editor for the join-exclusion grid: the row axis is how many
 * joist rows away, the column axis is how many joist bays away — every
 * cell (including the diagonals) is independently toggleable, with a
 * complete outer layer of join-friendly "-" cells always visible so
 * there's somewhere to click to grow the grid. */
const JoistExclusionMap: React.FC<{
  cells: JoinExclusionCell[]
  onChange: (cells: JoinExclusionCell[]) => void
}> = ({ cells, onChange }) => {
  const set = new Set(cells.map((c) => `${Math.abs(c.d)}:${Math.abs(c.b)}`))
  const { maxD, maxB } = exclusionBounds(cells)
  const rowSpan = Math.min(MAX_REACH, maxD) + 1
  const colSpan = Math.min(MAX_REACH, maxB) + 1
  const rows = Array.from({ length: 2 * rowSpan + 1 }, (_, i) => i - rowSpan)
  const cols = Array.from({ length: 2 * colSpan + 1 }, (_, i) => i - colSpan)

  const toggle = (d: number, b: number) => {
    if (d === 0 && b === 0) return
    if (d > MAX_REACH || b > MAX_REACH) return
    const exists = cells.some((c) => Math.abs(c.d) === d && Math.abs(c.b) === b)
    onChange(exists ? cells.filter((c) => !(Math.abs(c.d) === d && Math.abs(c.b) === b)) : [...cells, { d, b }])
  }

  return (
    <div className={styles.exclusionMap}>
      <div
        className={styles.matrix}
        style={{ gridTemplateColumns: `repeat(${cols.length}, 1.7rem)`, gridTemplateRows: `repeat(${rows.length}, 1.7rem)` }}
      >
        {rows.map((r) =>
          cols.map((c) => {
            if (r === 0 && c === 0) {
              return (
                <span key="0-0" className={`${styles.cell} ${styles.j}`}>
                  J
                </span>
              )
            }
            const forbidden = isExcluded(r, c, set)
            const d = Math.abs(r)
            const b = Math.abs(c)
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={() => toggle(d, b)}
                className={`${styles.cell} ${forbidden ? styles.x : styles.gap} ${styles.clickable}`}
                aria-label={`${forbidden ? "Allow" : "Forbid"} a join ${d} row(s) and ${b} bay(s) from here`}
              >
                {forbidden ? "×" : ""}
              </button>
            )
          })
        )}
      </div>
      <p className={styles.hint}>
        ↕ rows away · ↔ joist bays away — tap any cell to allow or forbid a join repeating there
      </p>
    </div>
  )
}

export default JoistExclusionMap

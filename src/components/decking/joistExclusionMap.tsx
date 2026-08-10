"use client"

import styles from "./joistExclusionMap.module.scss"

type Role = "j" | "x" | "gap" | "blank"

/** Visual editor for both join-spacing rules at once, as a single matrix:
 * the row axis is the adjacent-row stagger (minStaggerJoists), the column
 * axis is the same-row join spacing (minSameRowJoinJoists). Renders as a
 * cross centred on J — x's extend rowValue bays up/down and colValue bays
 * left/right, with one growable "-" context cell past the x's on every arm;
 * the off-axis corners are blank since the two rules don't interact. */
const JoistExclusionMap: React.FC<{
  rowValue: number
  colValue: number
  onRowChange: (n: number) => void
  onColChange: (n: number) => void
  min?: number
  max?: number
}> = ({ rowValue, colValue, onRowChange, onColChange, min = 0, max = 6 }) => {
  const rowSpan = rowValue + 1 // + 1 growable context cell
  const colSpan = colValue + 1
  const rows = Array.from({ length: 2 * rowSpan + 1 }, (_, i) => i - rowSpan)
  const cols = Array.from({ length: 2 * colSpan + 1 }, (_, i) => i - colSpan)

  const roleOf = (r: number, c: number): Role => {
    if (r === 0 && c === 0) return "j"
    if (r === 0) {
      if (Math.abs(c) <= colValue) return "x"
      if (Math.abs(c) === colSpan) return "gap"
      return "blank"
    }
    if (c === 0) {
      if (Math.abs(r) <= rowValue) return "x"
      if (Math.abs(r) === rowSpan) return "gap"
      return "blank"
    }
    return "blank"
  }

  return (
    <div className={styles.exclusionMap}>
      <div
        className={styles.matrix}
        style={{ gridTemplateColumns: `repeat(${cols.length}, 1.7rem)`, gridTemplateRows: `repeat(${rows.length}, 1.7rem)` }}
      >
        {rows.map((r) =>
          cols.map((c) => {
            const role = roleOf(r, c)
            return (
              <span key={`${r}-${c}`} className={`${styles.cell} ${styles[role]}`}>
                {role === "x" ? "×" : role === "j" ? "J" : ""}
              </span>
            )
          })
        )}
      </div>

      <div className={styles.axisControls}>
        <div className={styles.stepper}>
          <button type="button" onClick={() => onRowChange(Math.max(min, rowValue - 1))} disabled={rowValue <= min} aria-label="Fewer rows">
            −
          </button>
          <span className={styles.stepperValue}>
            ↕ {rowValue} row{rowValue === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={() => onRowChange(Math.min(max, rowValue + 1))} disabled={rowValue >= max} aria-label="More rows">
            +
          </button>
        </div>
        <div className={styles.stepper}>
          <button type="button" onClick={() => onColChange(Math.max(min, colValue - 1))} disabled={colValue <= min} aria-label="Fewer columns">
            −
          </button>
          <span className={styles.stepperValue}>
            ↔ {colValue} board{colValue === 1 ? "" : "s"}
          </span>
          <button type="button" onClick={() => onColChange(Math.min(max, colValue + 1))} disabled={colValue >= max} aria-label="More columns">
            +
          </button>
        </div>
      </div>
    </div>
  )
}

export default JoistExclusionMap

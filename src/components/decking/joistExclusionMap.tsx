"use client"

import { inExclusionZone } from "./joinRules"
import styles from "./joistExclusionMap.module.scss"

type Role = "j" | "x" | "gap"

/** Clicking a cell on an axis sets that axis's value to reach it: clicking
 * just past the current x zone grows it to include that cell; clicking
 * inside the current x zone shrinks it to just short of that cell — so the
 * outermost x always toggles off on a second click, like the name says. */
function targetValue(offset: number, current: number, min: number, max: number): number {
  const dist = Math.abs(offset)
  if (dist === 0) return current
  const next = dist <= current ? dist - 1 : dist
  return Math.min(max, Math.max(min, next))
}

/** Visual editor for both join-spacing rules at once, as a single matrix:
 * the row axis is the adjacent-row stagger (minStaggerJoists), the column
 * axis is the same-row join spacing (minSameRowJoinJoists). Diagonal cells
 * are forbidden too — rows beyond the immediate neighbour get a tapering
 * exclusion (see joinRules.ts) so the danger zone narrows the further out
 * it reaches rather than staying a full-width band. Surrounded by a
 * complete outer layer of join-friendly "-" cells on every side. Cells
 * along either axis are clickable to toggle that axis's value directly. */
const JoistExclusionMap: React.FC<{
  rowValue: number
  colValue: number
  onRowChange: (n: number) => void
  onColChange: (n: number) => void
  min?: number
  max?: number
}> = ({ rowValue, colValue, onRowChange, onColChange, min = 0, max = 6 }) => {
  const rowSpan = rowValue + 1 // + 1 growable outer layer
  const colSpan = colValue + 1
  const rows = Array.from({ length: 2 * rowSpan + 1 }, (_, i) => i - rowSpan)
  const cols = Array.from({ length: 2 * colSpan + 1 }, (_, i) => i - colSpan)

  const roleOf = (r: number, c: number): Role => {
    if (r === 0 && c === 0) return "j"
    return inExclusionZone(r, c, rowValue, colValue) ? "x" : "gap"
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
            const onAxis = r === 0 || c === 0
            const label = role === "x" ? "×" : role === "j" ? "J" : ""
            if (role === "j" || !onAxis) {
              return (
                <span key={`${r}-${c}`} className={`${styles.cell} ${styles[role]}`}>
                  {label}
                </span>
              )
            }
            const onClick =
              r === 0
                ? () => onColChange(targetValue(c, colValue, min, max))
                : () => onRowChange(targetValue(r, rowValue, min, max))
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onClick={onClick}
                className={`${styles.cell} ${styles[role]} ${styles.clickable}`}
                aria-label={`${role === "x" ? "Allow" : "Forbid"} a join ${Math.abs(r === 0 ? c : r)} bay(s) ${r === 0 ? "along the row" : "from the adjacent row"} from here`}
              >
                {label}
              </button>
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

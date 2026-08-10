"use client"

import styles from "./joistExclusionMap.module.scss"

type Cell = "gap" | "x" | "j"

/** Visual editor for a "how many joist bays around a join are off-limits"
 * setting — renders as - x×N J x×N - and always keeps one growable "-" cell
 * of context past the x's on each end, so the strip visibly grows/shrinks as
 * the value is adjusted. */
const JoistExclusionMap: React.FC<{
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}> = ({ value, onChange, min = 0, max = 6 }) => {
  const cells: Cell[] = ["gap", ...Array(value).fill("x"), "j", ...Array(value).fill("x"), "gap"]

  return (
    <div className={styles.exclusionMap}>
      <div className={styles.strip}>
        {cells.map((c, i) => (
          <span
            key={i}
            className={`${styles.cell} ${c === "x" ? styles.x : c === "j" ? styles.j : styles.gap}`}
          >
            {c === "x" ? "×" : c === "j" ? "J" : ""}
          </span>
        ))}
      </div>
      <div className={styles.stepper}>
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label="Fewer joist bays"
        >
          −
        </button>
        <span className={styles.stepperValue}>
          {value} joist bay{value === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label="More joist bays"
        >
          +
        </button>
      </div>
    </div>
  )
}

export default JoistExclusionMap

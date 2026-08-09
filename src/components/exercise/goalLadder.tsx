"use client"

import {
  ASSISTANCE_LEVELS,
  AssistanceLevel,
  GOAL_SETS,
  PullupSession,
  assistanceLabel,
  bestCleanSetsByLevel,
  currentFocusLevel,
} from "./types"
import styles from "./goalLadder.module.scss"

const tierVar: Record<AssistanceLevel, string> = {
  3: "var(--tier-3)",
  2: "var(--tier-2)",
  1: "var(--tier-1)",
  0: "var(--tier-0)",
}

const GoalLadder: React.FC<{ sessions: PullupSession[] }> = ({ sessions }) => {
  const best = bestCleanSetsByLevel(sessions)
  const focus = currentFocusLevel(best)

  return (
    <div className={styles.ladder}>
      {ASSISTANCE_LEVELS.map((level) => {
        const clean = Math.min(best[level], GOAL_SETS)
        const pct = (clean / GOAL_SETS) * 100
        return (
          <div
            key={level}
            className={`${styles.row} ${level === focus ? styles.current : ""}`}
          >
            <div className={styles.label}>
              {level === focus && <span className={styles.tag}>Current focus</span>}
              <span>{assistanceLabel(level)}</span>
            </div>
            <div className={styles.track}>
              <div
                className={styles.fill}
                style={{ width: `${pct}%`, backgroundColor: tierVar[level] }}
              />
            </div>
            <div className={styles.count}>
              {clean}/{GOAL_SETS}
            </div>
          </div>
        )
      })}
      {focus === null && (
        <p className={styles.complete}>
          🎉 Goal complete — 100 unassisted pull-ups at 2min intervals.
        </p>
      )}
    </div>
  )
}

export default GoalLadder

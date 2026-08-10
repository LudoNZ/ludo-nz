"use client"

import { CutLogEntry, formatDuration, formatLength } from "./types"
import styles from "./cutTimeline.module.scss"

const CutTimeline: React.FC<{ cutLog: CutLogEntry[] }> = ({ cutLog }) => {
  if (!cutLog.length) {
    return <p className={styles.empty}>No boards cut yet — start a Cutting mode session to begin timing.</p>
  }

  const totalMs = cutLog.reduce((sum, e) => sum + e.durationMs, 0)
  const avgMs = totalMs / cutLog.length
  const fastest = cutLog.reduce((a, b) => (b.durationMs < a.durationMs ? b : a))
  const slowest = cutLog.reduce((a, b) => (b.durationMs > a.durationMs ? b : a))
  const sorted = [...cutLog].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())

  return (
    <div className={styles.timeline}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <strong>{cutLog.length}</strong>
          <span>boards timed</span>
        </div>
        <div className={styles.stat}>
          <strong>{formatDuration(totalMs)}</strong>
          <span>total time</span>
        </div>
        <div className={styles.stat}>
          <strong>{formatDuration(avgMs)}</strong>
          <span>avg / board</span>
        </div>
        <div className={styles.stat}>
          <strong>{formatDuration(fastest.durationMs)}</strong>
          <span>fastest</span>
        </div>
        <div className={styles.stat}>
          <strong>{formatDuration(slowest.durationMs)}</strong>
          <span>slowest</span>
        </div>
      </div>

      <div className={styles.log}>
        {sorted.map((e, i) => (
          <div key={`${e.segmentId}-${i}`} className={styles.entry}>
            <span className={styles.row}>#{e.rowIndex + 1}</span>
            <span className={styles.length}>{formatLength(e.cutLength)}</span>
            <span className={styles.duration}>{formatDuration(e.durationMs)}</span>
            <span className={styles.when}>
              {e.completedAt.toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CutTimeline

"use client"

import { assistanceLabel, cleanSetsCount, PullupSession } from "./types"
import styles from "./sessionHistory.module.scss"

const SessionHistory: React.FC<{
  sessions: PullupSession[]
  onDelete: (id: string) => void
}> = ({ sessions, onDelete }) => {
  if (!sessions.length) {
    return <p className={styles.empty}>No sessions yet.</p>
  }

  const sorted = [...sessions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <div className={styles.history}>
      {sorted.map((s) => (
        <div key={s.id} className={`${styles.row} ${s.isMaxTest ? styles.maxRow : ""}`}>
          <span className={styles.date}>
            {s.createdAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </span>
          <span className={styles.detail}>
            {s.isMaxTest ? (
              <span className={styles.band}>Max unassisted test</span>
            ) : (
              <>
                <span className={styles.band}>{assistanceLabel(s.assistanceBands)}</span>
                <span className={styles.stat}>
                  {cleanSetsCount(s)}/{s.sets.length} sets @ {s.targetReps}+
                </span>
              </>
            )}
          </span>
          <span className={styles.total}>{s.totalReps} reps</span>
          <button
            className={styles.deleteBtn}
            aria-label="Delete session"
            onClick={() => onDelete(s.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export default SessionHistory

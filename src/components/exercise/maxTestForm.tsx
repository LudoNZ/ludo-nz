"use client"

import { useState } from "react"
import Button from "@/components/button/button"
import styles from "./workoutTimer.module.scss"

const MaxTestForm: React.FC<{
  onSave: (reps: number) => void
  onCancel: () => void
}> = ({ onSave, onCancel }) => {
  const [reps, setReps] = useState(1)

  return (
    <div className={styles.running}>
      <p>Do one unassisted set to failure, then log how many reps you got.</p>

      <div className={styles.stepper}>
        <button type="button" onClick={() => setReps((r) => Math.max(0, r - 1))}>
          −
        </button>
        <span className={styles.repsValue}>{reps}</span>
        <button type="button" onClick={() => setReps((r) => r + 1)}>
          +
        </button>
      </div>
      <div className={styles.repsLabel}>unassisted reps</div>

      <div className={styles.controls}>
        <Button size="large" onClick={() => onSave(reps)} disabled={reps === 0}>
          Save max test
        </Button>
        <Button size="medium" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default MaxTestForm

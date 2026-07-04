"use client"

import React, { useState } from "react"
import styles from "./planPicker.module.scss"
import { DAYS } from "./types"

interface Props {
  mealName: string
  onPick: (day: string, slot: "lunch" | "dinner") => Promise<void>
  onClose: () => void
}

export default function PlanPicker({ mealName, onPick, onClose }: Props) {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ day: string; slot: string } | null>(null)

  async function handlePick(day: string, slot: "lunch" | "dinner") {
    setSaving(true)
    try {
      await onPick(day, slot)
      setDone({ day, slot })
      setTimeout(() => onClose(), 900)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.sheet}>
        <div className={styles.handle} />

        <div className={styles.header}>
          <div className={styles.headerText}>
            <span className={styles.title}>Add to Plan</span>
            <span className={styles.mealName}>{mealName}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {done ? (
          <div className={styles.success}>
            <span className={styles.successIcon}>✓</span>
            <span className={styles.successText}>
              Added to {done.day} {done.slot}
            </span>
          </div>
        ) : (
          <div className={styles.dayList}>
            {DAYS.map((day) => (
              <div key={day} className={styles.dayRow}>
                <span className={styles.dayName}>{day.slice(0, 3)}</span>
                <div className={styles.slotBtns}>
                  <button
                    className={styles.slotBtn}
                    onClick={() => handlePick(day, "lunch")}
                    disabled={saving}
                  >
                    Lunch
                  </button>
                  <button
                    className={`${styles.slotBtn} ${styles.slotBtnDinner}`}
                    onClick={() => handlePick(day, "dinner")}
                    disabled={saving}
                  >
                    Dinner
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

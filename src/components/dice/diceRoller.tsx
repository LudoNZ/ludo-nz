"use client"

import React, { useState } from "react"
import styles from "./diceRoller.module.scss"
import Button from "@/components/button/button"

interface DiceRollerProps {
  playerName: string
  onRoll: (die1: number, die2: number, isRandom: boolean) => void
  disabled?: boolean
}

const DIE_VALUES = [1, 2, 3, 4, 5, 6]

const DiceRoller: React.FC<DiceRollerProps> = ({ playerName, onRoll, disabled }) => {
  const [die1, setDie1] = useState<number | null>(null)
  const [die2, setDie2] = useState<number | null>(null)

  const handleManualRoll = () => {
    if (die1 === null || die2 === null) return
    onRoll(die1, die2, false)
    setDie1(null)
    setDie2(null)
  }

  const handleRandomRoll = () => {
    const d1 = Math.floor(Math.random() * 6) + 1
    const d2 = Math.floor(Math.random() * 6) + 1
    onRoll(d1, d2, true)
  }

  return (
    <div className={styles.roller}>
      <div className={styles.rollerHeader}>
        <span className={styles.playerLabel}>Rolling as <strong>{playerName}</strong></span>
      </div>

      <div className={styles.manualSection}>
        <span className={styles.dieLabel}>Die 1</span>
        <div className={styles.dieRow}>
          {DIE_VALUES.map((v) => (
            <button
              key={`d1-${v}`}
              className={`${styles.dieFace} ${die1 === v ? styles.selected : ""}`}
              onClick={() => setDie1(v)}
              disabled={disabled}
            >
              {v}
            </button>
          ))}
        </div>

        <span className={styles.dieLabel}>Die 2</span>
        <div className={styles.dieRow}>
          {DIE_VALUES.map((v) => (
            <button
              key={`d2-${v}`}
              className={`${styles.dieFace} ${die2 === v ? styles.selected : ""}`}
              onClick={() => setDie2(v)}
              disabled={disabled}
            >
              {v}
            </button>
          ))}
        </div>

        <Button
          onClick={handleManualRoll}
          disabled={disabled || die1 === null || die2 === null}
          size="medium"
        >
          Log Roll ({die1 !== null && die2 !== null ? die1 + die2 : "?"})
        </Button>
      </div>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <Button onClick={handleRandomRoll} disabled={disabled} variant="secondary" size="medium">
        Quick Roll
      </Button>
    </div>
  )
}

export default DiceRoller

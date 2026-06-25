"use client"

import React, { useState } from "react"
import styles from "./diceRoller.module.scss"
import Button from "@/components/button/button"

interface DiceRollerProps {
  currentPlayer: string
  onRoll: (die1: number, die2: number, isRandom: boolean) => void
  disabled?: boolean
}

const DIE_VALUES = [1, 2, 3, 4, 5, 6]

function DieDots({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 100 100" className={styles.dieSvg}>
      {value === 1 && <circle cx="50" cy="50" r="10" />}
      {value === 2 && (
        <>
          <circle cx="30" cy="30" r="9" />
          <circle cx="70" cy="70" r="9" />
        </>
      )}
      {value === 3 && (
        <>
          <circle cx="30" cy="30" r="9" />
          <circle cx="50" cy="50" r="9" />
          <circle cx="70" cy="70" r="9" />
        </>
      )}
      {value === 4 && (
        <>
          <circle cx="30" cy="30" r="9" />
          <circle cx="70" cy="30" r="9" />
          <circle cx="30" cy="70" r="9" />
          <circle cx="70" cy="70" r="9" />
        </>
      )}
      {value === 5 && (
        <>
          <circle cx="30" cy="30" r="8" />
          <circle cx="70" cy="30" r="8" />
          <circle cx="50" cy="50" r="8" />
          <circle cx="30" cy="70" r="8" />
          <circle cx="70" cy="70" r="8" />
        </>
      )}
      {value === 6 && (
        <>
          <circle cx="30" cy="26" r="8" />
          <circle cx="70" cy="26" r="8" />
          <circle cx="30" cy="50" r="8" />
          <circle cx="70" cy="50" r="8" />
          <circle cx="30" cy="74" r="8" />
          <circle cx="70" cy="74" r="8" />
        </>
      )}
    </svg>
  )
}

const DiceRoller: React.FC<DiceRollerProps> = ({ currentPlayer, onRoll, disabled }) => {
  const [die1, setDie1] = useState<number | null>(null)
  const [die2, setDie2] = useState<number | null>(null)
  const [lastDie1, setLastDie1] = useState<number | null>(null)
  const [lastDie2, setLastDie2] = useState<number | null>(null)

  const handleManualRoll = () => {
    if (die1 === null || die2 === null) return
    setLastDie1(die1)
    setLastDie2(die2)
    onRoll(die1, die2, false)
    setDie1(null)
    setDie2(null)
  }

  const handleRandomRoll = () => {
    const d1 = Math.floor(Math.random() * 6) + 1
    const d2 = Math.floor(Math.random() * 6) + 1
    setLastDie1(d1)
    setLastDie2(d2)
    setDie1(null)
    setDie2(null)
    onRoll(d1, d2, true)
  }

  const getDieClass = (dieNum: 1 | 2, v: number) => {
    const current = dieNum === 1 ? die1 : die2
    const last = dieNum === 1 ? lastDie1 : lastDie2
    if (current === v) return styles.selected
    if (current === null && last === v) return styles.lastRoll
    return ""
  }

  return (
    <div className={styles.roller}>
      <div className={styles.rollerHeader}>
        <span className={styles.turnLabel}>{currentPlayer}&apos;s turn</span>
      </div>

      <div className={styles.manualSection}>
        <span className={styles.dieLabel}>Die 1</span>
        <div className={styles.dieRow}>
          {DIE_VALUES.map((v) => (
            <button
              key={`d1-${v}`}
              className={`${styles.dieFace} ${getDieClass(1, v)}`}
              onClick={() => setDie1(v)}
              disabled={disabled}
            >
              <DieDots value={v} />
            </button>
          ))}
        </div>

        <span className={styles.dieLabel}>Die 2</span>
        <div className={styles.dieRow}>
          {DIE_VALUES.map((v) => (
            <button
              key={`d2-${v}`}
              className={`${styles.dieFace} ${getDieClass(2, v)}`}
              onClick={() => setDie2(v)}
              disabled={disabled}
            >
              <DieDots value={v} />
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

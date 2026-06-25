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
  const [rolling, setRolling] = useState(false)

  const handleManualRoll = () => {
    if (die1 === null || die2 === null) return
    onRoll(die1, die2, false)
    setDie1(null)
    setDie2(null)
  }

  const handleRandomRoll = () => {
    if (rolling) return
    const d1 = Math.floor(Math.random() * 6) + 1
    const d2 = Math.floor(Math.random() * 6) + 1
    setDie1(d1)
    setDie2(d2)
    setRolling(true)
    setTimeout(() => {
      onRoll(d1, d2, true)
      setDie1(null)
      setDie2(null)
      setRolling(false)
    }, 1200)
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
              className={`${styles.dieFace} ${die1 === v ? styles.selected : ""}`}
              onClick={() => setDie1(v)}
              disabled={disabled || rolling}
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
              className={`${styles.dieFace} ${die2 === v ? styles.selected : ""}`}
              onClick={() => setDie2(v)}
              disabled={disabled || rolling}
            >
              <DieDots value={v} />
            </button>
          ))}
        </div>

        <Button
          onClick={handleManualRoll}
          disabled={disabled || rolling || die1 === null || die2 === null}
          size="medium"
        >
          Log Roll ({die1 !== null && die2 !== null ? die1 + die2 : "?"})
        </Button>
      </div>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <Button onClick={handleRandomRoll} disabled={disabled || rolling} variant="secondary" size="medium">
        Roll
      </Button>
    </div>
  )
}

export default DiceRoller

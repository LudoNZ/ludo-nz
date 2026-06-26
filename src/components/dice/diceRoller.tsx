"use client"

import React, { useState, useEffect } from "react"
import styles from "./diceRoller.module.scss"
import Button from "@/components/button/button"
import { DiceConfig, DEFAULT_DICE_CONFIG, formatDiceConfig } from "./types"

interface DiceRollerProps {
  currentPlayer: string
  diceConfig?: DiceConfig
  onRoll: (dice: number[], isRandom: boolean) => void
  disabled?: boolean
}

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

const DiceRoller: React.FC<DiceRollerProps> = ({ currentPlayer, diceConfig, onRoll, disabled }) => {
  const config = diceConfig || DEFAULT_DICE_CONFIG
  const diceCount = config.dice.length

  const [selected, setSelected] = useState<(number | null)[]>(Array(diceCount).fill(null))
  const [lastRoll, setLastRoll] = useState<(number | null)[]>(Array(diceCount).fill(null))

  useEffect(() => {
    setSelected(Array(diceCount).fill(null))
    setLastRoll(Array(diceCount).fill(null))
  }, [diceCount])

  const allSelected = selected.every((v) => v !== null)
  const someSelected = selected.some((v) => v !== null)
  const noneSelected = !someSelected

  const computeTotal = (dice: (number | null)[]) =>
    dice.every((v) => v !== null) ? dice.reduce((s, v) => s + (v ?? 0), 0) : null

  const handleSelect = (dieIndex: number, value: number) => {
    setSelected((prev) => {
      const next = [...prev]
      next[dieIndex] = next[dieIndex] === value ? null : value
      return next
    })
  }

  const handleRandomSingle = (dieIndex: number) => {
    const sides = config.dice[dieIndex]
    const value = Math.floor(Math.random() * sides) + 1
    setSelected((prev) => {
      const next = [...prev]
      next[dieIndex] = value
      return next
    })
  }

  const handleLogRoll = () => {
    if (!allSelected) return
    const dice = selected as number[]
    setLastRoll([...dice])
    onRoll(dice, false)
    setSelected(Array(diceCount).fill(null))
  }

  const handleQuickRoll = () => {
    const dice = selected.map((v, i) =>
      v !== null ? v : Math.floor(Math.random() * config.dice[i]) + 1
    )
    setLastRoll(dice as number[])
    setSelected(Array(diceCount).fill(null))
    onRoll(dice as number[], noneSelected)
  }

  const getDieClass = (dieIndex: number, v: number) => {
    if (selected[dieIndex] === v) return styles.selected
    if (selected[dieIndex] === null && lastRoll[dieIndex] === v) return styles.lastRoll
    return ""
  }

  const total = computeTotal(selected)
  const unsetCount = selected.filter((v) => v === null).length

  return (
    <div className={styles.roller}>
      <div className={styles.rollerHeader}>
        <span className={styles.turnLabel}>{currentPlayer}&apos;s turn</span>
        <span className={styles.configLabel}>{formatDiceConfig(config)}</span>
      </div>

      <div className={styles.manualSection}>
        {config.dice.map((sides, dieIndex) => {
          const values = Array.from({ length: sides }, (_, i) => i + 1)
          return (
            <div key={dieIndex}>
              <div className={styles.dieLabelRow}>
                <span className={styles.dieLabel}>Die {dieIndex + 1} (d{sides})</span>
                <button
                  className={styles.rollSingleBtn}
                  onClick={() => handleRandomSingle(dieIndex)}
                  disabled={disabled}
                  title={`Roll d${sides}`}
                >
                  Roll
                </button>
              </div>
              <div className={styles.dieRow}>
                {values.map((v) => (
                  <button
                    key={`d${dieIndex}-${v}`}
                    className={`${styles.dieFace} ${getDieClass(dieIndex, v)} ${sides > 6 ? styles.numberFace : ""}`}
                    onClick={() => handleSelect(dieIndex, v)}
                    disabled={disabled}
                  >
                    {sides <= 6 ? <DieDots value={v} /> : v}
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        <Button
          onClick={handleLogRoll}
          disabled={disabled || !allSelected}
          size="medium"
        >
          Log Roll ({total ?? "?"})
        </Button>
      </div>

      <div className={styles.divider}>
        <span>or</span>
      </div>

      <Button onClick={handleQuickRoll} disabled={disabled} variant="secondary" size="medium">
        {someSelected && !allSelected
          ? `Roll Remaining (${unsetCount})`
          : "Quick Roll"}
      </Button>
    </div>
  )
}

export default DiceRoller

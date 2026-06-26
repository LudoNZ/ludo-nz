"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import styles from "./diceRoller.module.scss"
import Button from "@/components/button/button"
import { DiceConfig, DEFAULT_DICE_CONFIG, formatDiceConfig } from "./types"

import DieDots from "./dieDots"

interface DiceRollerProps {
  currentPlayer: string
  diceConfig?: DiceConfig
  onRoll: (dice: number[], isRandom: boolean) => void
  disabled?: boolean
}

const DiceRoller: React.FC<DiceRollerProps> = ({ currentPlayer, diceConfig, onRoll, disabled }) => {
  const config = diceConfig || DEFAULT_DICE_CONFIG
  const diceCount = config.dice.length

  const [selected, setSelected] = useState<(number | null)[]>(Array(diceCount).fill(null))
  const [lastRoll, setLastRoll] = useState<(number | null)[]>(Array(diceCount).fill(null))
  const [animating, setAnimating] = useState<(number | null)[]>(Array(diceCount).fill(null))
  const [resultsCollapsed, setResultsCollapsed] = useState(false)
  const animTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const animateRoll = useCallback((dieIndex: number, finalValue: number, sides: number) => {
    const steps = 6 + Math.floor(Math.random() * 4)
    let step = 0
    const tick = () => {
      if (step < steps) {
        const randVal = Math.floor(Math.random() * sides) + 1
        setAnimating((prev) => {
          const next = [...prev]
          next[dieIndex] = randVal
          return next
        })
        step++
        const delay = 40 + step * 15
        animTimers.current.push(setTimeout(tick, delay))
      } else {
        setAnimating((prev) => {
          const next = [...prev]
          next[dieIndex] = null
          return next
        })
      }
    }
    tick()
  }, [])

  useEffect(() => {
    setSelected(Array(diceCount).fill(null))
    setLastRoll(Array(diceCount).fill(null))
    setAnimating(Array(diceCount).fill(null))
    return () => { animTimers.current.forEach(clearTimeout) }
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
    animateRoll(dieIndex, value, sides)
  }

  const handleLogRoll = useCallback(() => {
    if (!allSelected) return
    const dice = selected as number[]
    setLastRoll([...dice])
    setResultsCollapsed(false)
    onRoll(dice, false)
    setSelected(Array(diceCount).fill(null))
  }, [selected, allSelected, diceCount, onRoll])

  const handleQuickRoll = useCallback(() => {
    const dice = selected.map((v, i) =>
      v !== null ? v : Math.floor(Math.random() * config.dice[i]) + 1
    )
    setLastRoll(dice as number[])
    setResultsCollapsed(false)
    setSelected(Array(diceCount).fill(null))
    onRoll(dice as number[], noneSelected)
    config.dice.forEach((sides, i) => {
      if (selected[i] === null) {
        animateRoll(i, dice[i] as number, sides)
      }
    })
  }, [selected, config.dice, diceCount, noneSelected, onRoll, animateRoll])

  const getDieClass = (dieIndex: number, v: number) => {
    if (animating[dieIndex] === v) return styles.animating
    if (selected[dieIndex] === v) return styles.selected
    if (selected[dieIndex] === null && animating[dieIndex] === null && lastRoll[dieIndex] === v) return styles.lastRoll
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
                    {sides <= 6 ? <DieDots value={v} className={styles.dieSvg} /> : v}
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

      <div className={styles.mobileBar}>
        {lastRoll.some((v) => v !== null) && (
          <div className={styles.mobileResults}>
            <button
              className={styles.mobileResultsToggle}
              onClick={() => setResultsCollapsed(!resultsCollapsed)}
            >
              {resultsCollapsed ? "Show Results ▲" : "▼"}
            </button>
            {!resultsCollapsed && (
              <div className={styles.mobileResultsDice}>
                {lastRoll.map((v, i) => (
                  <span key={i} className={styles.mobileResultDie}>
                    <span className={styles.mobileResultLabel}>D{i + 1}</span>
                    <span className={styles.mobileResultValue}>{v}</span>
                  </span>
                ))}
                <span className={styles.mobileResultTotal}>
                  = {lastRoll.reduce<number>((s, v) => s + (v ?? 0), 0)}
                </span>
              </div>
            )}
          </div>
        )}
        <Button onClick={handleQuickRoll} disabled={disabled} variant="primary" size="medium">
          {someSelected && !allSelected
            ? `Roll Remaining (${unsetCount})`
            : "Quick Roll"}
        </Button>
      </div>
    </div>
  )
}

export default DiceRoller

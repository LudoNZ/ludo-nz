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

  const animateRoll = useCallback((dieIndex: number, finalValue: number, sides: number, setSelectedOnEnd = false) => {
    const totalSteps = 8
    let step = 0
    setLastRoll((prev) => {
      const next = [...prev]
      next[dieIndex] = null
      return next
    })
    const tick = () => {
      if (step < totalSteps) {
        const randVal = Math.floor(Math.random() * sides) + 1
        setAnimating((prev) => {
          const next = [...prev]
          next[dieIndex] = randVal
          return next
        })
        step++
        const delay = 40 + step * 18
        animTimers.current.push(setTimeout(tick, delay))
      } else {
        setAnimating((prev) => {
          const next = [...prev]
          next[dieIndex] = null
          return next
        })
        if (setSelectedOnEnd) {
          setSelected((prev) => {
            const next = [...prev]
            next[dieIndex] = finalValue
            return next
          })
        } else {
          setLastRoll((prev) => {
            const next = [...prev]
            next[dieIndex] = finalValue
            return next
          })
        }
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

  const [mobilePickerDie, setMobilePickerDie] = useState<number | null>(null)
  const clearedForNewRound = useRef(false)

  const clearIfNewRound = () => {
    if (!clearedForNewRound.current && lastRoll.some((v) => v !== null) && selected.every((v) => v === null)) {
      setLastRoll(Array(diceCount).fill(null))
      clearedForNewRound.current = true
    }
  }

  const handleSelect = (dieIndex: number, value: number) => {
    clearIfNewRound()
    setSelected((prev) => {
      const next = [...prev]
      next[dieIndex] = next[dieIndex] === value ? null : value
      return next
    })
  }

  const handleRandomSingle = (dieIndex: number) => {
    const sides = config.dice[dieIndex]
    const value = Math.floor(Math.random() * sides) + 1
    clearIfNewRound()
    animateRoll(dieIndex, value, sides, true)
  }

  const handleMobileSelect = (dieIndex: number, value: number) => {
    handleSelect(dieIndex, value)
    setMobilePickerDie(null)
  }

  const handleLogRoll = useCallback(() => {
    if (!allSelected) return
    const dice = selected as number[]
    setLastRoll([...dice])
    setResultsCollapsed(false)
    setSelected(Array(diceCount).fill(null))
    clearedForNewRound.current = false
    onRoll(dice, false)
  }, [selected, allSelected, diceCount, onRoll])

  const handleQuickRoll = useCallback(() => {
    const dice = selected.map((v, i) =>
      v !== null ? v : Math.floor(Math.random() * config.dice[i]) + 1
    )
    setResultsCollapsed(false)
    setSelected(Array(diceCount).fill(null))
    clearedForNewRound.current = false
    onRoll(dice as number[], noneSelected)
    config.dice.forEach((sides, i) => {
      if (selected[i] === null) {
        animateRoll(i, dice[i] as number, sides)
      } else {
        setLastRoll((prev) => {
          const next = [...prev]
          next[i] = dice[i] as number
          return next
        })
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
            <div key={dieIndex} className={styles.dieGroup}>
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
                    className={`${styles.dieFace} ${getDieClass(dieIndex, v)} ${sides > 6 ? styles.numberFace : ""} ${styles[`dieSize${sides}`] || ""}`}
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

      </div>

      <div className={styles.actionRow}>
        <Button
          onClick={allSelected ? handleLogRoll : handleQuickRoll}
          disabled={disabled}
          size="medium"
          variant={allSelected ? "primary" : "secondary"}
        >
          {allSelected
            ? `Log ${currentPlayer}'s Roll (${total})`
            : someSelected
              ? `Roll ${currentPlayer}'s Remaining (${unsetCount})`
              : `Quick Roll — ${currentPlayer}`}
        </Button>
      </div>

      <div className={styles.mobileBar}>
        <div className={styles.mobileResults}>
          <button
            className={styles.mobileResultsToggle}
            onClick={() => setResultsCollapsed(!resultsCollapsed)}
          >
            {resultsCollapsed ? "Show Results ▲" : "▼"}
          </button>
          {!resultsCollapsed && (
            <div className={styles.mobileResultsDice}>
              {config.dice.map((sides, i) => {
                const isAnimating = animating[i] !== null
                const activeVal = animating[i] ?? selected[i] ?? lastRoll[i]
                const isEmpty = activeVal === null
                const displayVal = isEmpty ? sides : activeVal
                return (
                  <span key={i} className={styles.mobileResultDie}>
                    <span className={styles.mobileResultLabel}>D{i + 1}</span>
                    <button
                      className={`${styles.mobileResultValue} ${isAnimating ? styles.mobileResultAnimating : ""} ${isEmpty ? styles.mobileResultEmpty : ""}`}
                      onClick={() => !isAnimating && setMobilePickerDie(mobilePickerDie === i ? null : i)}
                      disabled={isAnimating}
                    >
                      {sides <= 6 ? <DieDots value={displayVal} className={styles.mobileResultSvg} /> : displayVal}
                    </button>
                    {mobilePickerDie === i && !isAnimating && (
                      <div className={sides <= 6 ? styles.mobilePickerVertical : styles.mobilePickerGrid}>
                        <button
                          className={styles.mobilePickerRoll}
                          onClick={() => { handleRandomSingle(i); setMobilePickerDie(null) }}
                        >
                          Roll
                        </button>
                        {Array.from({ length: sides }, (_, v) => v + 1).map((v) => (
                          <button
                            key={v}
                            className={`${styles.mobilePickerBtn} ${v === activeVal ? styles.mobilePickerActive : ""}`}
                            onClick={() => handleMobileSelect(i, v)}
                          >
                            {sides <= 6 ? <DieDots value={v} className={styles.mobilePickerSvg} /> : v}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )
              })}
              <span className={styles.mobileResultTotal}>
                = {config.dice.reduce((s, _, i) => s + (animating[i] ?? selected[i] ?? lastRoll[i] ?? 0), 0)}
              </span>
            </div>
          )}
        </div>
        <Button
          onClick={allSelected ? handleLogRoll : handleQuickRoll}
          disabled={disabled}
          variant="primary"
          size="medium"
        >
          {allSelected
            ? `Log ${currentPlayer}'s Roll (${total})`
            : someSelected
              ? `Roll ${currentPlayer}'s Remaining (${unsetCount})`
              : `Quick Roll — ${currentPlayer}`}
        </Button>
      </div>
    </div>
  )
}

export default DiceRoller

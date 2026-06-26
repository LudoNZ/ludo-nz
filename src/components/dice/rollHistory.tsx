"use client"

import React from "react"
import styles from "./rollHistory.module.scss"
import Button from "@/components/button/button"
import { DiceRoll, CustomRule, getRollDice } from "./types"

interface RollHistoryProps {
  rolls: DiceRoll[]
  alerts: RollAlert[]
  currentGame: number
  onNewGame: () => void
  readOnly?: boolean
}

export interface RollAlert {
  rollId: string
  ruleId: string
  message: string
  sound?: string
}

function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 10) return "just now"
  if (diffSecs < 60) return `${diffSecs}s ago`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`
  return `${Math.floor(diffMins / 60)}h ago`
}

export function checkRollTriggers(
  roll: DiceRoll,
  rolls: DiceRoll[],
  rules: CustomRule[]
): RollAlert[] {
  const gameRolls = rolls.filter((r) => r.game === roll.game)
  const allDice = getRollDice(roll)
  const alerts: RollAlert[] = []

  for (const rule of rules) {
    if (!rule.enabled || !rule.trigger) continue
    const { type, value, diceIndices } = rule.trigger

    const indices = diceIndices || allDice.map((_, i) => i)
    const scopedDice = indices.map((i) => allDice[i]).filter((v) => v !== undefined)
    const scopedTotal = scopedDice.reduce((s, v) => s + v, 0)

    function getScopedTotal(r: DiceRoll): number {
      const d = getRollDice(r)
      return indices.map((i) => d[i] || 0).reduce((s, v) => s + v, 0)
    }

    if (type === "rollSum" && scopedTotal === value) {
      alerts.push({ rollId: roll.id, ruleId: rule.id, message: `${rule.action}`, sound: rule.sound })
    }

    if (type === "doubles" && scopedDice.length >= 2 && scopedDice.every((d) => d === scopedDice[0])) {
      const list = rule.trigger.doublesList
      if (!list || list.length === 6 || list.includes(scopedDice[0])) {
        alerts.push({ rollId: roll.id, ruleId: rule.id, message: `${rule.action}`, sound: rule.sound })
      }
    }

    if (type === "drought" && value > 0) {
      const watchNum = rule.trigger.droughtNumber ?? 7
      let countWithout = 0
      for (let i = gameRolls.length - 1; i >= 0; i--) {
        if (getScopedTotal(gameRolls[i]) === watchNum) break
        countWithout++
      }
      if (countWithout >= value && scopedTotal !== watchNum) {
        alerts.push({ rollId: roll.id, ruleId: rule.id, message: `${rule.action}`, sound: rule.sound })
      }
    }

    if (type === "hotNumber" && value > 0) {
      const watchTotals = rule.trigger.hotNumberTotals
      if (!watchTotals || watchTotals.includes(scopedTotal)) {
        let streakCount = 0
        for (let i = gameRolls.length - 1; i >= 0; i--) {
          if (getScopedTotal(gameRolls[i]) === scopedTotal) {
            streakCount++
          } else {
            break
          }
        }
        if (streakCount >= value) {
          alerts.push({ rollId: roll.id, ruleId: rule.id, message: `${rule.action}`, sound: rule.sound })
        }
      }
    }
  }
  return alerts
}

const RollHistory: React.FC<RollHistoryProps> = ({ rolls, alerts, currentGame, onNewGame, readOnly }) => {
  const [confirmNew, setConfirmNew] = React.useState(false)
  const reversed = [...rolls].reverse()
  const alertMap = new Map<string, string[]>()
  for (const a of alerts) {
    const existing = alertMap.get(a.rollId) || []
    existing.push(a.message)
    alertMap.set(a.rollId, existing)
  }

  const totalGames = Math.max(currentGame, ...rolls.map((r) => r.game || 1))
  let lastGameSeen: number | null = null

  return (
    <div className={styles.history}>
      <div className={styles.headerRow}>
        <h3 className={styles.heading}>Roll History</h3>
        <span className={styles.gameLabel}>Game {currentGame}</span>
        {!readOnly && !confirmNew && (
          <Button onClick={() => setConfirmNew(true)} variant="secondary" size="small">
            New Game
          </Button>
        )}
        {!readOnly && confirmNew && (
          <div className={styles.confirmNew}>
            <span className={styles.confirmNewText}>Archive current game?</span>
            <button className={styles.confirmNewYes} onClick={() => { onNewGame(); setConfirmNew(false) }}>
              Yes
            </button>
            <button className={styles.confirmNewNo} onClick={() => setConfirmNew(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      {reversed.length === 0 && (
        <p className={styles.empty}>No rolls yet. Start rolling!</p>
      )}
      <div className={styles.list}>
        {reversed.map((roll) => {
          const rollGame = roll.game || 1
          const rollAlerts = alertMap.get(roll.id)
          let showDivider = false
          if (lastGameSeen !== null && rollGame !== lastGameSeen) {
            showDivider = true
          }
          lastGameSeen = rollGame

          return (
            <React.Fragment key={roll.id}>
              {showDivider && (
                <div className={styles.gameDivider}>
                  <span>Game {rollGame}</span>
                </div>
              )}
              <div className={`${styles.entry} ${rollAlerts ? styles.hasAlert : ""}`}>
                <div className={styles.entryMain}>
                  <span className={styles.player}>{roll.player}</span>
                  <span className={styles.dice}>
                    {getRollDice(roll).map((d, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className={styles.plus}>+</span>}
                        <span className={styles.die}>{d}</span>
                      </React.Fragment>
                    ))}
                    <span className={styles.equals}>=</span>
                    <span className={styles.total}>{roll.total}</span>
                  </span>
                  <span className={styles.meta}>
                    {roll.isRandom && <span className={styles.randomTag}>digital</span>}
                    {totalGames > 1 && <span className={styles.gameTag}>G{rollGame}</span>}
                    <span className={styles.time}>
                      {roll.timestamp?.toDate ? getRelativeTime(roll.timestamp.toDate()) : "..."}
                    </span>
                  </span>
                </div>
                {rollAlerts && (
                  <div className={styles.alertList}>
                    {rollAlerts.map((msg, i) => (
                      <span key={i} className={styles.alert}>{msg}</span>
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default RollHistory

"use client"

import React from "react"
import styles from "./rollHistory.module.scss"
import Button from "@/components/button/button"
import { DiceRoll, CustomRule } from "./types"

interface RollHistoryProps {
  rolls: DiceRoll[]
  alerts: RollAlert[]
  currentGame: number
  onNewGame: () => void
}

export interface RollAlert {
  rollId: string
  ruleId: string
  message: string
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
  const alerts: RollAlert[] = []
  for (const rule of rules) {
    if (!rule.enabled || !rule.trigger) continue
    const { type, value } = rule.trigger

    if (type === "rollSum" && roll.total === value) {
      alerts.push({ rollId: roll.id, ruleId: rule.id, message: `${rule.action}` })
    }

    if (type === "doubles" && roll.die1 === roll.die2) {
      const list = rule.trigger.doublesList
      if (!list || list.length === 6 || list.includes(roll.die1)) {
        alerts.push({ rollId: roll.id, ruleId: rule.id, message: `${rule.action}` })
      }
    }

    if (type === "drought" && value > 0) {
      const watchNum = rule.trigger.droughtNumber ?? 7
      let countWithout = 0
      for (let i = gameRolls.length - 1; i >= 0; i--) {
        if (gameRolls[i].total === watchNum) break
        countWithout++
      }
      if (countWithout >= value && roll.total !== watchNum) {
        alerts.push({ rollId: roll.id, ruleId: rule.id, message: `${rule.action}` })
      }
    }

    if (type === "hotNumber" && value > 0) {
      const watchTotals = rule.trigger.hotNumberTotals
      if (!watchTotals || watchTotals.includes(roll.total)) {
        let streakCount = 0
        for (let i = gameRolls.length - 1; i >= 0; i--) {
          if (gameRolls[i].total === roll.total) {
            streakCount++
          } else {
            break
          }
        }
        if (streakCount >= value) {
          alerts.push({ rollId: roll.id, ruleId: rule.id, message: `${rule.action}` })
        }
      }
    }
  }
  return alerts
}

const RollHistory: React.FC<RollHistoryProps> = ({ rolls, alerts, currentGame, onNewGame }) => {
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
        <Button onClick={onNewGame} variant="secondary" size="small">
          New Game
        </Button>
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
                    <span className={styles.die}>{roll.die1}</span>
                    <span className={styles.plus}>+</span>
                    <span className={styles.die}>{roll.die2}</span>
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

"use client"

import React from "react"
import styles from "./rollHistory.module.scss"
import { DiceRoll, CustomRule } from "./types"

interface RollHistoryProps {
  rolls: DiceRoll[]
  alerts: RollAlert[]
}

export interface RollAlert {
  rollId: string
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
  const alerts: RollAlert[] = []
  for (const rule of rules) {
    if (!rule.enabled || !rule.trigger) continue
    const { type, value } = rule.trigger

    if (type === "rollSum" && roll.total === value) {
      alerts.push({ rollId: roll.id, message: `${rule.action}` })
    }

    if (type === "doubles" && roll.die1 === roll.die2) {
      if (value === 0 || roll.die1 === value) {
        alerts.push({ rollId: roll.id, message: `${rule.action}` })
      }
    }

    if (type === "drought" && value > 0) {
      let countWithout7 = 0
      for (let i = rolls.length - 1; i >= 0; i--) {
        if (rolls[i].total === 7) break
        countWithout7++
      }
      if (countWithout7 >= value && roll.total !== 7) {
        alerts.push({ rollId: roll.id, message: `${rule.action}` })
      }
    }

    if (type === "hotNumber" && value > 0) {
      let streakCount = 0
      for (let i = rolls.length - 1; i >= 0; i--) {
        if (rolls[i].total === roll.total) {
          streakCount++
        } else {
          break
        }
      }
      if (streakCount >= value) {
        alerts.push({ rollId: roll.id, message: `${rule.action}` })
      }
    }
  }
  return alerts
}

const RollHistory: React.FC<RollHistoryProps> = ({ rolls, alerts }) => {
  const reversed = [...rolls].reverse()
  const alertMap = new Map<string, string[]>()
  for (const a of alerts) {
    const existing = alertMap.get(a.rollId) || []
    existing.push(a.message)
    alertMap.set(a.rollId, existing)
  }

  return (
    <div className={styles.history}>
      <h3 className={styles.heading}>Roll History</h3>
      {reversed.length === 0 && (
        <p className={styles.empty}>No rolls yet. Start rolling!</p>
      )}
      <div className={styles.list}>
        {reversed.map((roll) => {
          const rollAlerts = alertMap.get(roll.id)
          return (
            <div key={roll.id} className={`${styles.entry} ${rollAlerts ? styles.hasAlert : ""}`}>
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
          )
        })}
      </div>
    </div>
  )
}

export default RollHistory

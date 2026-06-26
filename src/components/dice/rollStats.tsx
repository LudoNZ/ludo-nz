"use client"

import React, { useState, useMemo } from "react"
import styles from "./rollStats.module.scss"
import { DiceRoll, DiceConfig, DEFAULT_DICE_CONFIG, getRollDice } from "./types"

interface RollStatsProps {
  rolls: DiceRoll[]
  currentGame: number
  diceConfig?: DiceConfig
}

type StatsScope = "current" | "all"

const RollStats: React.FC<RollStatsProps> = ({ rolls, currentGame, diceConfig }) => {
  const config = diceConfig || DEFAULT_DICE_CONFIG
  const [scope, setScope] = useState<StatsScope>("current")
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null)

  const uniqueDieTypes = useMemo(() => Array.from(new Set(config.dice)).sort((a, b) => a - b), [config.dice])
  const [activeDieTypes, setActiveDieTypes] = useState<Set<number>>(new Set(uniqueDieTypes))
  const hasMultipleTypes = uniqueDieTypes.length > 1

  const toggleDieType = (sides: number) => {
    setActiveDieTypes((prev) => {
      const next = new Set(prev)
      if (next.has(sides)) {
        if (next.size > 1) next.delete(sides)
      } else {
        next.add(sides)
      }
      return next
    })
  }

  const totalGames = Math.max(currentGame, ...rolls.map((r) => r.game || 1))
  const hasMultipleGames = totalGames > 1

  const filteredRolls = useMemo(() => {
    if (scope === "all") return rolls
    return rolls.filter((r) => (r.game || 1) === currentGame)
  }, [rolls, scope, currentGame])

  if (filteredRolls.length === 0) {
    return (
      <div className={styles.stats}>
        <div className={styles.headerRow}>
          <h3 className={styles.heading}>Statistics</h3>
          {hasMultipleGames && <ScopeToggle scope={scope} onToggle={setScope} />}
        </div>
        <p className={styles.empty}>
          {scope === "current" ? "No rolls in this game yet" : "Roll some dice to see stats"}
        </p>
      </div>
    )
  }

  const activeDiceIndices = config.dice
    .map((sides, i) => ({ sides, i }))
    .filter(({ sides }) => activeDieTypes.has(sides))
    .map(({ i }) => i)

  const minTotal = activeDiceIndices.length
  const maxTotal = activeDiceIndices.reduce((s, i) => s + config.dice[i], 0)

  const allActive = activeDiceIndices.length === config.dice.length

  function getFilteredTotal(roll: DiceRoll): number | null {
    if (allActive) return roll.total
    const dice = getRollDice(roll)
    const maxIdx = Math.max(...activeDiceIndices)
    if (dice.length <= maxIdx) return null
    return activeDiceIndices.reduce((s, i) => s + (dice[i] || 0), 0)
  }

  const distribution: Record<number, number> = {}
  for (let i = minTotal; i <= maxTotal; i++) distribution[i] = 0
  for (const r of filteredRolls) {
    const t = getFilteredTotal(r)
    if (t !== null) distribution[t] = (distribution[t] || 0) + 1
  }

  const maxCount = Math.max(...Object.values(distribution), 1)

  const playerStats = new Map<string, { count: number; sum: number; totals: number[] }>()
  for (const r of filteredRolls) {
    const t = getFilteredTotal(r)
    if (t === null) continue
    const ps = playerStats.get(r.player) || { count: 0, sum: 0, totals: [] }
    ps.count++
    ps.sum += t
    ps.totals.push(t)
    playerStats.set(r.player, ps)
  }

  let streakWithout7 = 0
  for (let i = filteredRolls.length - 1; i >= 0; i--) {
    const t = getFilteredTotal(filteredRolls[i])
    if (t === null) continue
    if (t === 7) break
    streakWithout7++
  }

  const mostCommonTotal = Object.entries(distribution)
    .sort(([, a], [, b]) => b - a)[0][0]

  const allDieTypes = new Set<number>()
  for (const r of filteredRolls) {
    const types = r.diceTypes || (r.die1 !== undefined ? [6, 6] : config.dice)
    for (const s of types) {
      if (activeDieTypes.has(s)) allDieTypes.add(s)
    }
  }
  for (const s of activeDieTypes) allDieTypes.add(s)

  const faceCountsByType: Record<number, Record<number, number>> = {}
  for (const sides of allDieTypes) {
    const counts: Record<number, number> = {}
    for (let i = 1; i <= sides; i++) counts[i] = 0
    faceCountsByType[sides] = counts
  }
  for (const r of filteredRolls) {
    const dice = getRollDice(r)
    const types = r.diceTypes || (r.die1 !== undefined ? [6, 6] : config.dice)
    for (let i = 0; i < dice.length; i++) {
      const sides = types[i] ?? 6
      if (!activeDieTypes.has(sides)) continue
      const d = dice[i]
      if (d && faceCountsByType[sides]) {
        faceCountsByType[sides][d] = (faceCountsByType[sides][d] || 0) + 1
      }
    }
  }

  return (
    <div className={styles.stats}>
      <div className={styles.headerRow}>
        <h3 className={styles.heading}>Statistics</h3>
        {hasMultipleGames && <ScopeToggle scope={scope} onToggle={setScope} />}
      </div>

      {hasMultipleTypes && (
        <div className={styles.dieFilter}>
          {uniqueDieTypes.map((sides) => (
            <button
              key={sides}
              className={`${styles.filterPill} ${activeDieTypes.has(sides) ? styles.filterActive : ""}`}
              onClick={() => toggleDieType(sides)}
            >
              d{sides}
            </button>
          ))}
        </div>
      )}

      <div className={styles.quickStats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{filteredRolls.length}</span>
          <span className={styles.statLabel}>Total Rolls</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{mostCommonTotal}</span>
          <span className={styles.statLabel}>Most Common</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{streakWithout7}</span>
          <span className={styles.statLabel}>Since Last 7</span>
        </div>
        {hasMultipleGames && scope === "all" && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{totalGames}</span>
            <span className={styles.statLabel}>Games</span>
          </div>
        )}
      </div>

      <div className={styles.chart}>
        <span className={styles.chartLabel}>Sum Distribution</span>
        {Object.entries(distribution).map(([total, count]) => {
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
          return (
            <div key={total} className={styles.bar}>
              <span className={styles.barTotal}>{total}</span>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.barCount}>{count}</span>
            </div>
          )
        })}
      </div>

      {Array.from(allDieTypes).sort((a, b) => a - b).map((sides) => {
        const counts = faceCountsByType[sides]
        const mf = Math.max(...Object.values(counts), 1)
        const dieCount = config.dice.filter((s) => s === sides).length
        return (
          <div key={`face-d${sides}`} className={styles.chart}>
            <span className={styles.chartLabel}>
              d{sides} Face Frequency{dieCount > 1 ? ` (×${dieCount})` : ""}
            </span>
            {Object.entries(counts).map(([face, count]) => {
              const pct = mf > 0 ? (count / mf) * 100 : 0
              return (
                <div key={`face-d${sides}-${face}`} className={styles.bar}>
                  <span className={styles.barTotal}>{face}</span>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={styles.barCount}>{count}</span>
                </div>
              )
            })}
          </div>
        )
      })}

      <div className={styles.playerSection}>
        <span className={styles.chartLabel}>Per Player</span>
        <div className={styles.playerTable}>
          {Array.from(playerStats.entries()).map(([name, ps]) => {
            const avg = (ps.sum / ps.count).toFixed(1)
            const modeCounts: Record<number, number> = {}
            for (const t of ps.totals) modeCounts[t] = (modeCounts[t] || 0) + 1
            const mode = Object.entries(modeCounts).sort(([, a], [, b]) => b - a)[0][0]
            const sevens = ps.totals.filter((t) => t === 7).length
            const isExpanded = expandedPlayer === name

            return (
              <div key={name} className={styles.playerCard}>
                <button
                  className={`${styles.playerRow} ${isExpanded ? styles.playerRowActive : ""}`}
                  onClick={() => setExpandedPlayer(isExpanded ? null : name)}
                >
                  <span className={styles.playerName}>{name}</span>
                  <span className={styles.playerStat}>{ps.count} rolls</span>
                  <span className={styles.playerStat}>avg {avg}</span>
                  <span className={styles.playerStat}>mode {mode}</span>
                  <span className={styles.playerStat}>{sevens} sevens</span>
                  <span className={styles.playerExpand}>{isExpanded ? "−" : "+"}</span>
                </button>
                {isExpanded && (() => {
                  const pRolls = filteredRolls.filter((r) => r.player === name)
                  const pDist: Record<number, number> = {}
                  for (let i = minTotal; i <= maxTotal; i++) pDist[i] = 0
                  for (const r of pRolls) {
                    const t = getFilteredTotal(r)
                    if (t !== null) pDist[t] = (pDist[t] || 0) + 1
                  }
                  const pMax = Math.max(...Object.values(pDist), 1)

                  const pFace: Record<number, number> = {}
                  for (const r of pRolls) {
                    const dice = getRollDice(r)
                    for (const idx of activeDiceIndices) {
                      if (idx >= dice.length) continue
                      const d = dice[idx]
                      if (d) pFace[d] = (pFace[d] || 0) + 1
                    }
                  }
                  const pfMax = Math.max(...Object.values(pFace), 1)
                  const maxFace = Math.max(...activeDiceIndices.map((i) => config.dice[i]), 1)

                  return (
                    <div className={styles.playerDetail}>
                      <div className={styles.chart}>
                        <span className={styles.chartLabel}>Sum Distribution</span>
                        {Object.entries(pDist).map(([total, count]) => {
                          const pct = pMax > 0 ? (count / pMax) * 100 : 0
                          return (
                            <div key={total} className={styles.bar}>
                              <span className={styles.barTotal}>{total}</span>
                              <div className={styles.barTrack}>
                                <div className={styles.barFill} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={styles.barCount}>{count}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div className={styles.chart}>
                        <span className={styles.chartLabel}>Face Frequency</span>
                        {Array.from({ length: maxFace }, (_, i) => i + 1).map((face) => {
                          const count = pFace[face] || 0
                          const pct = pfMax > 0 ? (count / pfMax) * 100 : 0
                          return (
                            <div key={face} className={styles.bar}>
                              <span className={styles.barTotal}>{face}</span>
                              <div className={styles.barTrack}>
                                <div className={styles.barFill} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={styles.barCount}>{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ScopeToggle({ scope, onToggle }: { scope: StatsScope; onToggle: (s: StatsScope) => void }) {
  return (
    <div className={styles.scopeToggle}>
      <button
        className={`${styles.scopeBtn} ${scope === "current" ? styles.scopeActive : ""}`}
        onClick={() => onToggle("current")}
      >
        This Game
      </button>
      <button
        className={`${styles.scopeBtn} ${scope === "all" ? styles.scopeActive : ""}`}
        onClick={() => onToggle("all")}
      >
        All Games
      </button>
    </div>
  )
}

export default RollStats

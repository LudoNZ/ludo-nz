"use client"

import React, { useState, useMemo } from "react"
import styles from "./rollStats.module.scss"
import { DiceRoll, getRollDice } from "./types"

interface RollStatsProps {
  rolls: DiceRoll[]
  currentGame: number
}

const EXPECTED_DISTRIBUTION: Record<number, number> = {
  2: 1/36, 3: 2/36, 4: 3/36, 5: 4/36, 6: 5/36, 7: 6/36,
  8: 5/36, 9: 4/36, 10: 3/36, 11: 2/36, 12: 1/36,
}

type StatsScope = "current" | "all"

const RollStats: React.FC<RollStatsProps> = ({ rolls, currentGame }) => {
  const [scope, setScope] = useState<StatsScope>("current")

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

  const distribution: Record<number, number> = {}
  for (let i = 2; i <= 12; i++) distribution[i] = 0
  for (const r of filteredRolls) distribution[r.total]++

  const maxCount = Math.max(...Object.values(distribution))

  const playerStats = new Map<string, { count: number; sum: number; totals: number[] }>()
  for (const r of filteredRolls) {
    const ps = playerStats.get(r.player) || { count: 0, sum: 0, totals: [] }
    ps.count++
    ps.sum += r.total
    ps.totals.push(r.total)
    playerStats.set(r.player, ps)
  }

  let streakWithout7 = 0
  for (let i = filteredRolls.length - 1; i >= 0; i--) {
    if (filteredRolls[i].total === 7) break
    streakWithout7++
  }

  const mostCommonTotal = Object.entries(distribution)
    .sort(([, a], [, b]) => b - a)[0][0]

  const faceCounts: Record<number, number> = {}
  for (const r of filteredRolls) {
    for (const d of getRollDice(r)) {
      faceCounts[d] = (faceCounts[d] || 0) + 1
    }
  }
  const maxFace = Math.max(...Object.values(faceCounts))

  return (
    <div className={styles.stats}>
      <div className={styles.headerRow}>
        <h3 className={styles.heading}>Statistics</h3>
        {hasMultipleGames && <ScopeToggle scope={scope} onToggle={setScope} />}
      </div>

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
          const expectedPct = EXPECTED_DISTRIBUTION[Number(total)] * 100
          return (
            <div key={total} className={styles.bar}>
              <span className={styles.barTotal}>{total}</span>
              <div className={styles.barTrack}>
                <div className={styles.barExpected} style={{ width: `${expectedPct / EXPECTED_DISTRIBUTION[7] / 100 * 100}%` }} />
                <div className={styles.barFill} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.barCount}>{count}</span>
            </div>
          )
        })}
      </div>

      <div className={styles.chart}>
        <span className={styles.chartLabel}>Die Face Frequency</span>
        {Object.entries(faceCounts).map(([face, count]) => {
          const pct = maxFace > 0 ? (count / maxFace) * 100 : 0
          return (
            <div key={`face-${face}`} className={styles.bar}>
              <span className={styles.barTotal}>{face}</span>
              <div className={styles.barTrack}>
                <div className={styles.barExpected} style={{ width: "100%" }} />
                <div className={styles.barFill} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.barCount}>{count}</span>
            </div>
          )
        })}
      </div>

      <div className={styles.playerSection}>
        <span className={styles.chartLabel}>Per Player</span>
        <div className={styles.playerTable}>
          {Array.from(playerStats.entries()).map(([name, ps]) => {
            const avg = (ps.sum / ps.count).toFixed(1)
            const modeCounts: Record<number, number> = {}
            for (const t of ps.totals) modeCounts[t] = (modeCounts[t] || 0) + 1
            const mode = Object.entries(modeCounts).sort(([, a], [, b]) => b - a)[0][0]
            const sevens = ps.totals.filter((t) => t === 7).length

            return (
              <div key={name} className={styles.playerRow}>
                <span className={styles.playerName}>{name}</span>
                <span className={styles.playerStat}>{ps.count} rolls</span>
                <span className={styles.playerStat}>avg {avg}</span>
                <span className={styles.playerStat}>mode {mode}</span>
                <span className={styles.playerStat}>{sevens} sevens</span>
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

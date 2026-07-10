"use client"

import React, { useMemo, useState } from "react"
import styles from "./familyTree.module.scss"
import { FamilyTreeData, LineageSide, formatYears, genderSymbol } from "./types"

interface TreeSummaryProps {
  data: FamilyTreeData
  gen: Record<string, number>
  sideMap: Record<string, LineageSide>
  onSelectPerson: (id: string) => void
}

const TreeSummary: React.FC<TreeSummaryProps> = ({ data, gen, sideMap, onSelectPerson }) => {
  const [query, setQuery] = useState("")

  const stats = useMemo(() => {
    const total = data.people.length
    const confirmed = data.people.filter((p) => p.confirmed).length
    const sources = data.people.reduce((sum, p) => sum + p.sources.length, 0)
    const generations = total ? Math.max(0, ...Object.values(gen)) + 1 : 0
    return { total, confirmed, unconfirmed: total - confirmed, sources, generations }
  }, [data, gen])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.people
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.label?.toLowerCase().includes(q))
      .sort((a, b) => (gen[a.id] ?? 0) - (gen[b.id] ?? 0) || a.name.localeCompare(b.name))
  }, [data.people, gen, query])

  return (
    <div className={styles.summaryWrap}>
      <div className={styles.statsRow}>
        <div className={styles.statTile}>
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>People</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statValue}>{stats.confirmed}</div>
          <div className={styles.statLabel}>Confirmed</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statValue}>{stats.unconfirmed}</div>
          <div className={styles.statLabel}>Unconfirmed</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statValue}>{stats.sources}</div>
          <div className={styles.statLabel}>Sources</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statValue}>{stats.generations}</div>
          <div className={styles.statLabel}>Generations</div>
        </div>
      </div>

      <input
        className={styles.summarySearch}
        placeholder="Search by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className={styles.personList}>
        {rows.length === 0 && <div className={styles.emptyNote}>No people match &quot;{query}&quot;.</div>}
        {rows.map((p) => (
          <button
            key={p.id}
            className={`${styles.personRow} ${sideMap[p.id] === "root" ? styles.personRowRoot : ""}`}
            onClick={() => onSelectPerson(p.id)}
          >
            <span className={`${styles.dot} ${p.confirmed ? styles.dotConfirmed : styles.dotUnconfirmed}`} />
            <span className={styles.personRowName}>
              {genderSymbol(p.gender) && (
                <span
                  className={`${styles.genderMark} ${p.gender === "female" ? styles.genderFemale : styles.genderMale}`}
                >
                  {genderSymbol(p.gender)}
                </span>
              )}
              {p.name}
            </span>
            {p.label && <span className={styles.personRowLabel}>{p.label}</span>}
            <span className={styles.personRowMeta}>
              {formatYears(p)} · Gen {(gen[p.id] ?? 0) + 1} · {p.sources.length} source
              {p.sources.length !== 1 ? "s" : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default TreeSummary

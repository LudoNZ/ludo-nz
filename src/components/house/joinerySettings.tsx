"use client"

import NumField from "@/components/weatherboards/numField"
import { DEFAULT_HEAD_MM, DEFAULT_JOINERY_TYPES, houseHeadOf, JoineryType, joineryTypesOf } from "./joinery"
import type { HouseProject } from "./houseTypes"
import styles from "./house.module.scss"

/** The house's joinery settings, folded away: the head height windows line
 * up with, and the types to lay from — each one's name and default size,
 * changed, removed or added to. Units already laid keep their sizes. */
const JoinerySettings: React.FC<{ house: HouseProject; setHouse: (u: (h: HouseProject) => HouseProject) => void }> = ({ house, setHouse }) => {
  const types = joineryTypesOf(house)
  const head = houseHeadOf(house)
  const setTypes = (u: (t: JoineryType[]) => JoineryType[]) => setHouse((h) => ({ ...h, joineryTypes: u(joineryTypesOf(h)) }))
  const setType = (id: string, patch: Partial<JoineryType>) => setTypes((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const add = (kind: "door" | "window", where: "inside" | "outside") =>
    setTypes((ts) => [
      ...ts,
      {
        id: `t-${Math.random().toString(36).slice(2, 8)}`,
        name: kind === "window" ? "New window" : where === "inside" ? "New inside door" : "New outside door",
        kind,
        where,
        width: kind === "window" ? 1200 : 860,
        height: kind === "window" ? 1000 : where === "inside" ? 1980 : 2000,
      },
    ])
  const groups: { label: string; kind: "door" | "window"; where: "inside" | "outside" }[] = [
    { label: "Inside doors", kind: "door", where: "inside" },
    { label: "Outside doors", kind: "door", where: "outside" },
    { label: "Windows", kind: "window", where: "outside" },
  ]
  const changed = JSON.stringify(types) !== JSON.stringify(DEFAULT_JOINERY_TYPES)
  return (
    <details className={styles.panel}>
      <summary>
        <strong>Joinery types &amp; head height</strong> <span className={styles.muted}>— {types.length} types, windows&apos; heads at {head} mm</span>
      </summary>
      <div className={styles.fields}>
        <label>
          Head height
          <span className={styles.unit}>
            <NumField value={head} min={1500} max={3000} step={1} onChange={(v) => setHouse((h) => ({ ...h, settings: { ...h.settings, joineryHeadMm: v } }))} /> mm
          </span>
          <span className={styles.muted}>off the floor — windows line their heads up with it, unless their type says</span>
        </label>
      </div>
      {groups.map((g) => (
        <div key={g.label} className={styles.typeGroup}>
          <h4>{g.label}</h4>
          {types
            .filter((t) => t.kind === g.kind && t.where === g.where)
            .map((t) => (
              <div key={t.id} className={styles.typeRow}>
                <input value={t.name} aria-label="Type name" onChange={(e) => setType(t.id, { name: e.target.value })} />
                <span className={styles.unit}>
                  <NumField value={t.width} min={200} step={1} onChange={(v) => setType(t.id, { width: v })} /> ×
                  <NumField value={t.height} min={200} step={1} onChange={(v) => setType(t.id, { height: v })} /> mm
                </span>
                {g.kind === "window" && (
                  <span className={styles.unit}>
                    head{" "}
                    <NumField value={t.headMm ?? head} min={t.height} step={1} onChange={(v) => setType(t.id, { headMm: v === head ? undefined : v })} />
                    {t.headMm === undefined ? <span className={styles.muted}> (the house&apos;s)</span> : ""}
                  </span>
                )}
                <button type="button" className={styles.link} onClick={() => setTypes((ts) => ts.filter((x) => x.id !== t.id))} aria-label={`Remove ${t.name}`}>
                  Remove
                </button>
              </div>
            ))}
          <button type="button" className={styles.link} onClick={() => add(g.kind, g.where)}>
            + Add {g.kind === "window" ? "a window" : g.where === "inside" ? "an inside door" : "an outside door"} type
          </button>
        </div>
      ))}
      {(changed || head !== DEFAULT_HEAD_MM) && (
        <button
          type="button"
          className={styles.pill}
          onClick={() => {
            if (!window.confirm("Put the types and head height back to the usual ones? Windows and doors already laid keep their sizes.")) return
            setHouse((h) => {
              const next = { ...h, settings: { ...h.settings } }
              delete next.joineryTypes
              delete next.settings.joineryHeadMm
              return next
            })
          }}
        >
          Back to the usual types
        </button>
      )}
    </details>
  )
}

export default JoinerySettings

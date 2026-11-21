"use client"

import { useState } from "react"
import NumField from "@/components/weatherboards/numField"
import { useAuth } from "@/context/auth"
import { baseHeadMm, baseJoineryTypes, DEFAULT_HEAD_MM, DEFAULT_JOINERY_TYPES, houseHeadOf, JoineryType, joineryTypesOf } from "./joinery"
import { saveJoineryDefaults, useSharedJoinery } from "./joineryDefaultsStore"
import type { HouseProject } from "./houseTypes"
import styles from "./house.module.scss"

/** The house's joinery settings, folded away: the head height windows line
 * up with, and the types to lay from — each one's name and default size,
 * changed, removed or added to (for this house only). Units already laid
 * keep their sizes. A house that's changed none follows the shared
 * defaults; anyone logged in can make this house's the shared ones. */
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
  const auth = useAuth()
  const uid = auth?.currentUser?.uid
  const shared = useSharedJoinery()
  const [status, setStatus] = useState<string | null>(null)
  // this house's own (it's changed something), or the shared ones
  const own = !!house.joineryTypes?.length || house.settings.joineryHeadMm !== undefined
  const sameAsShared = JSON.stringify(types) === JSON.stringify(baseJoineryTypes()) && head === baseHeadMm()
  const share = async (types: JoineryType[], headMm: number, what: string) => {
    if (!uid) return
    setStatus("Saving the shared defaults…")
    try {
      await saveJoineryDefaults(uid, { types, headMm })
      setStatus(`${what} — every house that hasn't its own starts from them now.`)
    } catch (err) {
      console.error("Saving the shared joinery defaults failed", err)
      setStatus("Couldn't save the shared defaults — try again in a moment.")
    }
  }
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
      <p className={styles.muted}>
        {own
          ? "These are this house's own — changing them changes this house only."
          : `These are the ${shared ? "shared" : "built-in"} defaults — change any and this house keeps its own from then on.`}
      </p>
      <div className={styles.toolbar}>
        {own && !sameAsShared && (
          <button
            type="button"
            className={styles.pill}
            onClick={() => {
              if (!window.confirm(`Go back to the ${shared ? "shared" : "built-in"} defaults for this house? Windows and doors already laid keep their sizes.`)) return
              setHouse((h) => {
                const next = { ...h, settings: { ...h.settings } }
                delete next.joineryTypes
                delete next.settings.joineryHeadMm
                return next
              })
            }}
          >
            Back to the {shared ? "shared" : "built-in"} defaults
          </button>
        )}
        {uid ? (
          <>
            {!sameAsShared && (
              <button
                type="button"
                className={styles.pill}
                onClick={() => {
                  if (!window.confirm("Make this house's types and head height the shared defaults — what every house without its own starts from, for everyone?")) return
                  share(types, head, "These are the shared defaults now")
                }}
              >
                Make these the shared defaults
              </button>
            )}
            {shared && (JSON.stringify(shared.types) !== JSON.stringify(DEFAULT_JOINERY_TYPES) || shared.headMm !== DEFAULT_HEAD_MM) && (
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  if (!window.confirm("Put the shared defaults back to the built-in ones, for everyone?")) return
                  share(DEFAULT_JOINERY_TYPES, DEFAULT_HEAD_MM, "The shared defaults are the built-in ones again")
                }}
              >
                Put the shared defaults back to the built-in ones
              </button>
            )}
          </>
        ) : (
          <span className={styles.muted}>Log in to change the shared defaults every house starts from.</span>
        )}
      </div>
      {status && <p className={styles.muted}>{status}</p>}
    </details>
  )
}

export default JoinerySettings

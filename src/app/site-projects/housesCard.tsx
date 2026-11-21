"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Button from "@/components/button/button"
import { HouseProject } from "@/components/house/houseTypes"
import { houseProjectHref, loadHouseProject, StoredHouseProject, subscribeToHouseProjects, summariseHouse } from "@/components/house/houseProjectStore"
import { SiteHouse } from "@/components/site/siteProject"
import { UnitField } from "../retaining-walls/obstructionsCard"
import { HOUSE_COLOR } from "./siteView"
import styles from "./siteView.module.scss"

// a house's card figures, worked out once per version of it
const summaries = new WeakMap<HouseProject, ReturnType<typeof summariseHouse>>()
const summaryOf = (house: HouseProject) => {
  let s = summaries.get(house)
  if (!s) {
    s = summariseHouse(house)
    summaries.set(house, s)
  }
  return s
}

/** The houses on the site: import a saved House calculator project (a
 * copy), then place it — where its top-left corner goes, how far it's
 * turned and the level of its ground floor — or drag it on the plan.
 * A copy can be updated from the house it came from. */
const HousesCard: React.FC<{
  houses: SiteHouse[]
  uid: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (houses: SiteHouse[]) => void
  onAdd: (house: HouseProject, name: string, from: SiteHouse["from"]) => void
  onRemove: (id: string) => void
}> = ({ houses, uid, selectedId, onSelect, onChange, onAdd, onRemove }) => {
  const [projects, setProjects] = useState<{ public: StoredHouseProject[]; private: StoredHouseProject[] }>({ public: [], private: [] })
  const [pick, setPick] = useState("")
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [note, setNote] = useState<{ id: string; text: string } | null>(null)
  useEffect(() => subscribeToHouseProjects({ kind: "public" }, (data) => setProjects((p) => ({ ...p, public: data }))), [])
  useEffect(() => {
    if (!uid) {
      setProjects((p) => ({ ...p, private: [] }))
      return
    }
    return subscribeToHouseProjects({ kind: "private", uid }, (data) => setProjects((p) => ({ ...p, private: data })))
  }, [uid])

  const update = (id: string, patch: Partial<SiteHouse>) => onChange(houses.map((h) => (h.id === id ? { ...h, ...patch } : h)))
  const chosen = [...projects.private, ...projects.public].find((h) => `${h.location.kind}:${h.id}` === pick)

  /** copy the house in again as it is now in its own project */
  const refresh = async (h: SiteHouse) => {
    if (!h.from) return
    setRefreshing(h.id)
    setNote(null)
    try {
      const loc = h.from.kind === "private" ? { kind: "private" as const, uid: h.from.uid ?? uid ?? "" } : { kind: "public" as const }
      const found = await loadHouseProject(loc, h.from.id)
      if (!found) setNote({ id: h.id, text: "That house project's gone, or it's someone else's private one." })
      else {
        update(h.id, { house: found.house, source: `Copied from the house project "${found.name}"` })
        setNote({ id: h.id, text: "Updated from the house project." })
      }
    } catch {
      setNote({ id: h.id, text: "Couldn't load the house project — are you offline?" })
    } finally {
      setRefreshing(null)
    }
  }

  return (
    <section className={styles.card} id="site-houses">
      <h2>Houses</h2>
      <div className={styles.addRow}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="House project to import">
          <option value="">Pick a house to import…</option>
          {projects.private.length > 0 && (
            <optgroup label="Your houses">
              {projects.private.map((h) => (
                <option key={h.id} value={`private:${h.id}`}>
                  {h.name}
                </option>
              ))}
            </optgroup>
          )}
          {projects.public.length > 0 && (
            <optgroup label="Public houses">
              {projects.public.map((h) => (
                <option key={h.id} value={`public:${h.id}`}>
                  {h.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <Button
          size="small"
          disabled={!chosen}
          onClick={() => {
            if (!chosen) return
            onAdd(chosen.house, chosen.name, { kind: chosen.location.kind, id: chosen.id, ...(chosen.location.kind === "private" ? { uid: chosen.location.uid } : {}) })
            setPick("")
          }}
        >
          Import
        </Button>
      </div>
      <p className={styles.hint}>
        An imported house is a copy, drawn on the plan and in 3D — change it in the House calculator, then Update it here. Drag it on the plan to
        move it, or set where its top-left corner goes, how far it&apos;s turned and its floor level (on the same datum as the walls&apos; levels).
        It isn&apos;t in the estimate.
      </p>

      {houses.map((h) => {
        const picked = h.id === selectedId
        const s = summaryOf(h.house)
        const key = (f: string) => `sh-${h.id}-${f}`
        return (
          <div key={h.id} className={picked ? styles.itemPicked : styles.item} style={picked ? undefined : { borderLeftColor: HOUSE_COLOR }} onClick={() => !picked && onSelect(h.id)}>
            <div className={styles.itemHead}>
              <strong>{h.name}</strong>
              <span className={styles.meta}>
                {s.areaM2} m² · {s.storeys ?? 1} storey{(s.storeys ?? 1) > 1 ? "s" : ""} · {s.roof} roof · floor at RL {h.floorLevelM.toFixed(2)} m
              </span>
              <span className={styles.itemActions}>
                {h.from && (
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={refreshing === h.id}
                    onClick={() => void refresh(h)}
                  >
                    {refreshing === h.id ? "Updating…" : "Update from house"}
                  </Button>
                )}
                <button
                  type="button"
                  className={styles.link}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`Remove ${h.name} from the site?`)) onRemove(h.id)
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
            {h.source && (
              <p className={styles.meta}>
                {h.from ? <Link href={houseProjectHref(h.from.id)}>{h.source}</Link> : h.source}
              </p>
            )}
            {note?.id === h.id && <p className={styles.meta}>{note.text}</p>}
            {picked && (
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label htmlFor={key("name")}>Name</label>
                  <input
                    id={key("name")}
                    key={`${key("name")}-${h.name}`}
                    defaultValue={h.name}
                    maxLength={60}
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== h.name && update(h.id, { name: e.target.value.trim() })}
                  />
                </div>
                <UnitField id={key("x")} label="Top-left corner — across (m)" value={h.xM} scale={1} step={0.05} onCommit={(v) => v !== null && update(h.id, { xM: v })} />
                <UnitField id={key("y")} label="Top-left corner — down (m)" value={h.yM} scale={1} step={0.05} onCommit={(v) => v !== null && update(h.id, { yM: v })} />
                <UnitField id={key("fl")} label="Floor level (RL m)" value={h.floorLevelM} scale={1} step={0.05} onCommit={(v) => v !== null && update(h.id, { floorLevelM: v })} />
                <div className={styles.field}>
                  <label htmlFor={key("rot")}>Turned (° clockwise)</label>
                  <div className={styles.rotate}>
                    <button type="button" onClick={() => update(h.id, { rotationDeg: (((h.rotationDeg - 15) % 360) + 360) % 360 })} aria-label="Turn 15° anticlockwise">
                      ↺
                    </button>
                    <input
                      id={key("rot")}
                      key={`${key("rot")}-${h.rotationDeg}`}
                      type="number"
                      step={1}
                      defaultValue={Math.round(h.rotationDeg * 10) / 10}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (e.target.value !== "" && Number.isFinite(v)) update(h.id, { rotationDeg: ((v % 360) + 360) % 360 })
                      }}
                    />
                    <button type="button" onClick={() => update(h.id, { rotationDeg: (h.rotationDeg + 15) % 360 })} aria-label="Turn 15° clockwise">
                      ↻
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

export default HousesCard

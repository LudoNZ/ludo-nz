"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import NumField from "@/components/weatherboards/numField"
import HouseRenderView from "@/components/weatherboards/houseRenderView"
import type { PlacedHouse } from "@/components/weatherboards/houseRender3d"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import { houseRenderInput } from "@/components/house/houseRenderInput"
import { houseFromJson } from "@/components/house/houseFile"
import { houseFromData } from "@/components/house/houseTypes"
import { summariseHouse } from "@/components/house/houseProjectStore"
import { EMPTY_TERRACE, newUnitId, Terrace, terraceFromData, terraceToJson, TerraceUnit, widthOf } from "@/components/house/terrace"
import Showcase from "@/components/house/showcase"
import { HOUSE_SCRATCH_KEY } from "../houseProjectsPage"
import styles from "@/components/house/house.module.scss"

const TERRACE_KEY = "house.terrace.v1"
const COLOURS = ["#2e7d32", "#1565c0", "#ad1457", "#ef6c00", "#6a1b9a", "#00838f"]

/** A terrace of townhouses (or any houses on one site): each its own
 * house project, set where it stands and at its own floor level — the plan
 * of them all, the lot in 3D, and the showcase building the whole terrace
 * stage by stage. Kept in this browser; save it to a file to keep it. */
export default function TerracePage() {
  const [stored, setStored, loaded] = useStoredState<Terrace>(TERRACE_KEY, EMPTY_TERRACE)
  const terrace = useMemo(() => terraceFromData(stored), [stored])
  const set = (u: (t: Terrace) => Terrace) => setStored((prev) => u(terraceFromData(prev)))
  const setUnit = (id: string, patch: Partial<TerraceUnit>) => set((t) => ({ ...t, units: t.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) }))
  const [msg, setMsg] = useState<string | null>(null)
  const [showing, setShowing] = useState(false)
  const addFile = useRef<HTMLInputElement>(null)
  const openFile = useRef<HTMLInputElement>(null)

  // each house's 3D input, where it stands (world: x east, y north)
  const inputs = useMemo(() => terrace.units.map((u) => houseRenderInput(u.house)), [terrace.units])
  const units: PlacedHouse[] = useMemo(
    () => terrace.units.flatMap((u, i) => (inputs[i] ? [{ input: inputs[i]!, at: [u.x, -u.y, u.z] as [number, number, number] }] : [])),
    [terrace.units, inputs],
  )
  const summaries = useMemo(() => terrace.units.map((u) => summariseHouse(u.house)), [terrace.units])

  /** the next one alongside the last (its corner at the last one's far side) */
  const nextX = (t: Terrace) => (t.units.length ? Math.max(...t.units.map((u) => u.x + widthOf(u.house) + Math.min(0, ...u.house.floor.outline.map((p) => p.x)))) : 0)
  const addHouses = (hs: ReturnType<typeof houseFromData>[]) =>
    set((t) => {
      let next = t
      for (const house of hs) next = { ...next, units: [...next.units, { id: newUnitId(), house, x: nextX(next), y: 0, z: 0 }] }
      return next
    })

  const facts = useMemo(() => {
    const n = terrace.units.length
    const area = summaries.reduce((s, x) => s + x.areaM2, 0)
    const party = terrace.units.reduce((s, u) => s + (u.house.floor.party?.length ?? 0), 0)
    const slab = terrace.units.every((u) => u.house.settings.groundFloor?.kind === "slab")
    const roofs = [...new Set(terrace.units.map((u) => u.house.settings.roof.type))]
    return {
      ground: `${n} home${n === 1 ? "" : "s"} set out on the site${slab ? ", each on its own rib raft slab" : ""}.`,
      walls: party ? "The walls go up — and between the homes, the fire-rated Integra intertenancy walls." : undefined,
      upper: `Upstairs: ${area.toFixed(0)} m² of rooms across the terrace, all told.`,
      roof: (([a, ...b]) => a.charAt(0).toUpperCase() + a.slice(1) + (b.length ? ` and ${b.join(" and ")}` : ""))(roofs.length ? roofs : ["the"]) + " roofs, joined along the party walls.",
      finish: `${terrace.name} — finished.`,
    }
  }, [terrace, summaries])

  // the plan of them all
  const plan = useMemo(() => {
    const outlines = terrace.units.map((u, i) => ({
      u,
      i,
      ground: u.house.floor.outline.map((p) => ({ x: p.x + u.x, y: p.y + u.y })),
      upper: (u.house.upper?.plan.outline ?? []).map((p) => ({ x: p.x + u.x, y: p.y + u.y })),
    }))
    const pts = outlines.flatMap((o) => o.ground)
    if (!pts.length) return null
    const x0 = Math.min(...pts.map((p) => p.x))
    const x1 = Math.max(...pts.map((p) => p.x))
    const y0 = Math.min(...pts.map((p) => p.y))
    const y1 = Math.max(...pts.map((p) => p.y))
    return { outlines, x0, y0, w: x1 - x0, h: y1 - y0 }
  }, [terrace.units])

  const save = () => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([terraceToJson(terrace)], { type: "application/json" }))
    a.download = `${terrace.name.replace(/[^\w\- ]+/g, "").trim() || "terrace"}.terrace.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const scratchHouse = () => {
    try {
      const raw = localStorage.getItem(HOUSE_SCRATCH_KEY)
      return raw ? houseFromData(JSON.parse(raw)) : null
    } catch {
      return null
    }
  }

  if (!loaded) return <p style={{ padding: "3rem 1rem", textAlign: "center", opacity: 0.75 }}>Loading…</p>

  return (
    <div className={styles.page}>
      <Link href="/house" className={styles.link}>
        ← All houses
      </Link>
      <h1>
        <input
          aria-label="Terrace name"
          value={terrace.name}
          onChange={(e) => set((t) => ({ ...t, name: e.target.value }))}
          style={{ font: "inherit", color: "inherit", background: "none", border: "none", borderBottom: "1px solid rgba(127,127,127,0.4)", width: "100%" }}
        />
      </h1>
      <p className={styles.intro}>
        Several houses on one site — townhouses in a terrace — each its own house project, set where it stands and at its own floor level. See the
        lot in 3D, and play the showcase over the whole building. Mark the walls between them as party walls in each house, and they meet as one.
        Kept in this browser: save it to a file to keep it or share it.
      </p>

      <section className={styles.card}>
        <h2>The houses</h2>
        <div className={styles.toolbar}>
          <button type="button" className={styles.pill} onClick={() => addFile.current?.click()}>
            + Add house files…
          </button>
          <button
            type="button"
            className={styles.pill}
            onClick={() => {
              const h = scratchHouse()
              if (h?.floor.outline.length) addHouses([h])
              else setMsg("The scratch house has no plan yet.")
            }}
          >
            + Add the scratch house
          </button>
          <span className={styles.muted}>|</span>
          <button type="button" className={styles.link} onClick={save} disabled={!terrace.units.length}>
            Save the terrace to a file
          </button>
          <button type="button" className={styles.link} onClick={() => openFile.current?.click()}>
            Open a terrace file…
          </button>
          {msg && <span className={styles.muted}>{msg}</span>}
        </div>
        <input
          ref={addFile}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          aria-label="House files to add"
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ""
            const hs = (await Promise.all(files.map(async (f) => houseFromJson(await f.text())))).filter((h): h is NonNullable<typeof h> => !!h)
            addHouses(hs)
            setMsg(`Added ${hs.length} house${hs.length === 1 ? "" : "s"}${hs.length < files.length ? ` (${files.length - hs.length} weren't house files)` : ""}.`)
          }}
        />
        <input
          ref={openFile}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="A terrace file to open"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (!f) return
            try {
              const t = terraceFromData(JSON.parse(await f.text()))
              if (!t.units.length) throw new Error("empty")
              setStored(() => t)
              setMsg(`Opened ${f.name}.`)
            } catch {
              setMsg(`${f.name} isn't a terrace file.`)
            }
          }}
        />

        {terrace.units.length === 0 ? (
          <p className={styles.hint}>
            No houses yet. Draw each townhouse as its own house (marking the walls it shares as party walls), save each to a file, and add them here —
            each goes alongside the last.
          </p>
        ) : (
          <>
            {plan && (
              <svg
                viewBox={`${plan.x0 - 1500} ${plan.y0 - 1500} ${plan.w + 3000} ${plan.h + 3000}`}
                style={{ width: "100%", maxHeight: 320 }}
                role="img"
                aria-label="The terrace on plan: each house's ground floor, and its first floor hatched"
              >
                {plan.outlines.map(({ u, i, ground, upper }) => {
                  const c = COLOURS[i % COLOURS.length]
                  const xs = ground.map((p) => p.x)
                  const ys = ground.map((p) => p.y)
                  return (
                    <g key={u.id}>
                      <polygon points={ground.map((p) => `${p.x},${p.y}`).join(" ")} fill={c} fillOpacity={0.12} stroke={c} strokeWidth={60} />
                      {upper.length > 2 && <polygon points={upper.map((p) => `${p.x},${p.y}`).join(" ")} fill={c} fillOpacity={0.18} stroke={c} strokeWidth={30} strokeDasharray="200 120" />}
                      <text x={(Math.min(...xs) + Math.max(...xs)) / 2} y={Math.max(...ys) + 900} fontSize={650} textAnchor="middle" fill={c}>
                        {u.house.name}
                        {u.z ? ` (${u.z > 0 ? "+" : ""}${u.z})` : ""}
                      </text>
                    </g>
                  )
                })}
              </svg>
            )}
            <div className={styles.tableWrap}>
              <table className={styles.cutList}>
                <thead>
                  <tr>
                    <th>House</th>
                    <th>Across</th>
                    <th>Down</th>
                    <th>Floor level</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {terrace.units.map((u, i) => (
                    <tr key={u.id}>
                      <td>
                        <span className={styles.swatchDot} style={{ background: COLOURS[i % COLOURS.length] }} />
                        {u.house.name}
                        <br />
                        <span className={styles.muted}>
                          {summaries[i].areaM2.toFixed(1)} m² · {summaries[i].storeys ?? 1} storey{(summaries[i].storeys ?? 1) > 1 ? "s" : ""}
                          {u.house.floor.party?.length ? ` · ${u.house.floor.party.length} party wall${u.house.floor.party.length > 1 ? "s" : ""}` : ""}
                        </span>
                      </td>
                      <td>
                        <span className={styles.unit}>
                          <NumField value={u.x} step={10} onChange={(v) => setUnit(u.id, { x: v })} /> mm
                        </span>
                      </td>
                      <td>
                        <span className={styles.unit}>
                          <NumField value={u.y} step={10} onChange={(v) => setUnit(u.id, { y: v })} /> mm
                        </span>
                      </td>
                      <td>
                        <span className={styles.unit}>
                          <NumField value={u.z} step={10} onChange={(v) => setUnit(u.id, { z: v })} /> mm
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.link}
                          disabled={i === 0}
                          onClick={() => set((t) => ({ ...t, units: t.units.map((x, k) => (k === i - 1 ? t.units[i] : k === i ? t.units[i - 1] : x)) }))}
                          aria-label={`Move ${u.house.name} up the list`}
                        >
                          ↑
                        </button>{" "}
                        <button
                          type="button"
                          className={styles.link}
                          onClick={() => {
                            try {
                              localStorage.setItem(HOUSE_SCRATCH_KEY, JSON.stringify(u.house))
                              window.location.assign("/house/scratch")
                            } catch {
                              setMsg("Couldn't open it in the scratch house.")
                            }
                          }}
                          title="Replaces whatever's in the scratch house"
                        >
                          Edit in the scratch house
                        </button>{" "}
                        <button
                          type="button"
                          className={styles.link}
                          onClick={() => {
                            const h = scratchHouse()
                            if (h?.floor.outline.length) setUnit(u.id, { house: h })
                          }}
                          title="Replaces this house with the scratch house as it is now"
                        >
                          Take the scratch house back
                        </button>{" "}
                        <button type="button" className={styles.danger} onClick={() => set((t) => ({ ...t, units: t.units.filter((x) => x.id !== u.id) }))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.hint}>
              Across and down: where each house&apos;s own 0,0 sits on the site, mm. Floor level: its ground floor above (or below) the others&apos;.
            </p>
          </>
        )}
      </section>

      {units.length > 0 && (
        <section className={styles.card}>
          <h2>The terrace in 3D</h2>
          <div className={styles.toolbar}>
            <button type="button" className={`${styles.pill} ${styles.pillOn}`} onClick={() => setShowing(true)}>
              ▶ Showcase
            </button>
            <span className={styles.muted}>Every part of every house falls into place, stage by stage.</span>
          </div>
          <HouseRenderView input={units[0].input} units={units} fileName={terrace.name} />
        </section>
      )}
      {showing && units.length > 0 && <Showcase input={units[0].input} units={units} name={terrace.name} facts={facts} onClose={() => setShowing(false)} />}
    </div>
  )
}

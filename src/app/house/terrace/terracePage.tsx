"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/context/auth"
import { deleteTerrace, newTerraceId, saveTerrace, StoredTerrace, subscribeToTerraces } from "@/components/house/terraceStore"
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
import { LANDSCAPE_DEFAULT_HEIGHT, LANDSCAPE_LABELS, LandscapeItem, LandscapeKind, landscapePieces } from "@/components/house/landscape"
import { houseSlab, slabFacts } from "@/components/house/slab3d"
import { ribRaftFromData } from "@/components/ribRaft/ribRaft"
import { floorGraph } from "@/components/house/floorPlan"
import { houseCladding } from "@/components/house/houseCladding"
import { analyseHouse } from "@/components/house/structure"
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
  const uid = useAuth()?.currentUser?.uid ?? null
  // your saved terraces, and how saving's going
  const [mine, setMine] = useState<StoredTerrace[] | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  useEffect(() => {
    if (!uid) {
      setMine(null)
      return
    }
    return subscribeToTerraces(uid, setMine, () => setMine([]))
  }, [uid])
  // saved to your account: every change saves there too (a moment after the last)
  const savedHere = !!uid && terrace.saved?.uid === uid
  const lastSaved = useRef<string>("")
  useEffect(() => {
    if (!savedHere || !terrace.saved) return
    const body = JSON.stringify(terrace)
    if (body === lastSaved.current) return
    const id = terrace.saved.id
    const timer = setTimeout(() => {
      setSaveState("saving")
      saveTerrace(uid!, id, terrace)
        .then(() => {
          lastSaved.current = body
          setSaveState("saved")
        })
        .catch((err) => {
          console.error("Saving the terrace failed", err)
          setSaveState("error")
        })
    }, 1200)
    return () => clearTimeout(timer)
  }, [terrace, savedHere, uid])
  const saveToAccount = async () => {
    if (!uid) return
    const id = newTerraceId(uid)
    const next = { ...terrace, saved: { uid, id } }
    setSaveState("saving")
    try {
      await saveTerrace(uid, id, next)
      lastSaved.current = JSON.stringify(next)
      setStored(() => next)
      setSaveState("saved")
    } catch (err) {
      console.error("Saving the terrace failed", err)
      setSaveState("error")
    }
  }
  const addFile = useRef<HTMLInputElement>(null)
  const openFile = useRef<HTMLInputElement>(null)

  // each house's 3D input, where it stands (world: x east, y north)
  const inputs = useMemo(() => terrace.units.map((u) => houseRenderInput(u.house)), [terrace.units])
  const units: PlacedHouse[] = useMemo(
    () => terrace.units.flatMap((u, i) => (inputs[i] ? [{ input: inputs[i]!, at: [u.x, -u.y, u.z] as [number, number, number] }] : [])),
    [terrace.units, inputs],
  )
  const summaries = useMemo(() => terrace.units.map((u) => summariseHouse(u.house)), [terrace.units])
  const site = useMemo(() => landscapePieces(terrace.landscape ?? []), [terrace.landscape])
  const setItem = (id: string, patch: Partial<LandscapeItem>) => set((t) => ({ ...t, landscape: (t.landscape ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) }))

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
    const slabs = terrace.units.flatMap((u) => {
      const g = floorGraph(u.house.floor)
      const up = u.house.upper ? floorGraph(u.house.upper.plan) : null
      const c = houseCladding(u.house, g, up)
      const st = analyseHouse(g, up, u.house.settings, c?.roof ?? null, c?.lowerRoofs ?? [])
      const sl = houseSlab(u.house, g, st.ground)
      return sl ? [sl.result] : []
    })
    return {
      ground: `${n} home${n === 1 ? "" : "s"} set out on the site${slab ? ", each on its own rib raft slab" : ""}.`,
      walls: party ? "The walls go up — and between the homes, the fire-rated Integra intertenancy walls." : undefined,
      upper: `Upstairs: ${area.toFixed(0)} m² of rooms across the terrace, all told.`,
      roof: (([a, ...b]) => a.charAt(0).toUpperCase() + a.slice(1) + (b.length ? ` and ${b.join(" and ")}` : ""))(roofs.length ? roofs : ["the"]) + " roofs, joined along the party walls.",
      finish: `${terrace.name} — finished.`,
      ...(() => {
        const ls = terrace.landscape ?? []
        const m2 = (k: LandscapeKind) => ls.filter((l) => l.kind === k).reduce((t, l) => t + Math.abs(l.w * l.h) / 1e6, 0)
        const fence = ls.filter((l) => l.kind === "fence" || l.kind === "picket").reduce((t, l) => t + Math.hypot(l.w, l.h) / 1000, 0)
        const trees = ls.filter((l) => l.kind === "tree").length
        return {
          ...(m2("deck") ? { deck: `${m2("deck").toFixed(1)} m² of hardwood decking: framing, then the boards.` } : {}),
          ...(ls.length
            ? {
                landscape: [
                  m2("pavers") ? `${m2("pavers").toFixed(0)} m² of pavers` : "",
                  m2("concrete") ? `${m2("concrete").toFixed(0)} m² of driveway` : "",
                  m2("planting") ? `${m2("planting").toFixed(0)} m² of planting` : "",
                  trees ? `${trees} tree${trees === 1 ? "" : "s"}` : "",
                  fence ? `${fence.toFixed(0)} m of fencing` : "",
                ]
                  .filter(Boolean)
                  .join(", ")
                  .replace(/^./, (c) => c.toUpperCase())
                  .concat("."),
              }
            : {}),
        }
      })(),
      ...(slabs.length ? slabFacts(slabs, ribRaftFromData(terrace.units[0].house.settings.ribRaft).concreteMpa) : {}),
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
    const pts = [
      ...outlines.flatMap((o) => o.ground),
      ...(terrace.landscape ?? []).flatMap((l) => [
        { x: l.x, y: l.y },
        { x: l.x + l.w, y: l.y + l.h },
      ]),
    ]
    if (!pts.length) return null
    const x0 = Math.min(...pts.map((p) => p.x))
    const x1 = Math.max(...pts.map((p) => p.x))
    const y0 = Math.min(...pts.map((p) => p.y))
    const y1 = Math.max(...pts.map((p) => p.y))
    return { outlines, x0, y0, w: x1 - x0, h: y1 - y0 }
  }, [terrace.units, terrace.landscape])

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
        Kept in this browser — save it to your account to open it anywhere, or to a file to share it.
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
        <div className={styles.toolbar}>
          {!uid ? (
            <span className={styles.muted}>
              <Link href="/login">Log in</Link> to save terraces to your account (private — only you see them) and open them on any device.
            </span>
          ) : savedHere ? (
            <span className={styles.muted}>
              {saveState === "error"
                ? "⚠ Couldn't save to your account — it's still kept in this browser."
                : saveState === "saving"
                  ? "Saving to your account…"
                  : "Saved to your account — changes save as you go."}
            </span>
          ) : (
            <>
              <button type="button" className={`${styles.pill} ${styles.pillOn}`} onClick={saveToAccount} disabled={!terrace.units.length || saveState === "saving"}>
                {saveState === "saving" ? "Saving…" : "Save to my account"}
              </button>
              <span className={styles.muted}>{saveState === "error" ? "⚠ Couldn't save it — try again in a moment." : "Private: only you see it."}</span>
            </>
          )}
        </div>
        {uid && mine && mine.length > 0 && (
          <div className={styles.toolbar}>
            <span className={styles.muted}>Your terraces:</span>
            {mine.map((m) => (
              <span key={m.id}>
                <button
                  type="button"
                  className={`${styles.pill} ${terrace.saved?.id === m.id ? styles.pillOn : ""}`}
                  onClick={() => {
                    if (terrace.saved?.id === m.id) return
                    if (terrace.units.length && !savedHere && !window.confirm(`Open "${m.name}" over the terrace here? This one isn't saved to your account.`)) return
                    lastSaved.current = JSON.stringify({ ...m.terrace, saved: { uid: uid!, id: m.id } })
                    setStored(() => ({ ...m.terrace, saved: { uid: uid!, id: m.id } }))
                    setSaveState("saved")
                  }}
                  title={m.updatedAt ? `Saved ${m.updatedAt.toLocaleString()}` : undefined}
                >
                  {m.name} ({m.terrace.units.length})
                </button>{" "}
                {terrace.saved?.id === m.id && (
                  <button
                    type="button"
                    className={styles.link}
                    onClick={async () => {
                      if (!window.confirm(`Delete "${m.name}" from your account? The copy in this browser stays.`)) return
                      await deleteTerrace(uid!, m.id)
                      set((t) => ({ name: t.name, units: t.units }))
                      setSaveState("idle")
                    }}
                  >
                    Delete from my account
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
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
              // (a file opens as a terrace of its own, not over the one saved to your account)
              delete t.saved
              setSaveState("idle")
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
                {(terrace.landscape ?? []).map((l) =>
                  l.kind === "tree" ? (
                    <circle key={l.id} cx={l.x} cy={l.y} r={Math.max(400, l.w / 2)} fill="#4d7a39" fillOpacity={0.35} />
                  ) : l.kind === "fence" || l.kind === "picket" ? (
                    <line key={l.id} x1={l.x} y1={l.y} x2={l.x + l.w} y2={l.y + l.h} stroke="#8a7f6a" strokeWidth={70} strokeDasharray={l.kind === "picket" ? "160 120" : undefined} />
                  ) : (
                    <rect
                      key={l.id}
                      x={Math.min(l.x, l.x + l.w)}
                      y={Math.min(l.y, l.y + l.h)}
                      width={Math.abs(l.w)}
                      height={Math.abs(l.h)}
                      fill={{ deck: "#9a6a43", pavers: "#c3bcae", concrete: "#aeaaa2", chip: "#d3c8b2", planting: "#6b8f4e" }[l.kind as "deck"]}
                      fillOpacity={0.55}
                    />
                  ),
                )}
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

      {terrace.units.length > 0 && (
        <section className={styles.card}>
          <h2>Site &amp; landscaping</h2>
          <p className={styles.hint}>
            Decks, paving, the driveway, chip, planting, trees and fences, on the same plan as the houses (mm, across and down). An area runs from its corner,
            width × depth; a tree from its middle, its spread; a fence from its start, across or down (one of them 0).
          </p>
          <div className={styles.toolbar}>
            {(Object.keys(LANDSCAPE_LABELS) as LandscapeKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={styles.pill}
                onClick={() =>
                  set((t) => ({
                    ...t,
                    landscape: [
                      ...(t.landscape ?? []),
                      { id: newUnitId(), kind: k, x: 0, y: -3000, w: k === "tree" ? 3000 : 4000, h: k === "fence" || k === "picket" ? 0 : k === "tree" ? 0 : 2000, ...(LANDSCAPE_DEFAULT_HEIGHT[k] ? { height: LANDSCAPE_DEFAULT_HEIGHT[k] } : {}) },
                    ],
                  }))
                }
              >
                + {LANDSCAPE_LABELS[k]}
              </button>
            ))}
          </div>
          {(terrace.landscape ?? []).length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.cutList}>
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Across</th>
                    <th>Down</th>
                    <th>Width</th>
                    <th>Depth</th>
                    <th>Height</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(terrace.landscape ?? []).map((l) => (
                    <tr key={l.id}>
                      <td>
                        <select value={l.kind} onChange={(e) => setItem(l.id, { kind: e.target.value as LandscapeKind })} aria-label="What it is">
                          {(Object.keys(LANDSCAPE_LABELS) as LandscapeKind[]).map((k) => (
                            <option key={k} value={k}>
                              {LANDSCAPE_LABELS[k]}
                            </option>
                          ))}
                        </select>
                      </td>
                      {(["x", "y", "w", "h"] as const).map((k) => (
                        <td key={k}>
                          <NumField value={l[k]} step={10} onChange={(v) => setItem(l.id, { [k]: v })} />
                        </td>
                      ))}
                      <td>{LANDSCAPE_DEFAULT_HEIGHT[l.kind] !== undefined ? <NumField value={l.height ?? LANDSCAPE_DEFAULT_HEIGHT[l.kind]!} min={0} step={10} onChange={(v) => setItem(l.id, { height: v })} /> : <span className={styles.muted}>—</span>}</td>
                      <td>
                        <button type="button" className={styles.danger} onClick={() => set((t) => ({ ...t, landscape: (t.landscape ?? []).filter((x) => x.id !== l.id) }))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {units.length > 0 && (
        <section className={styles.card}>
          <h2>The terrace in 3D</h2>
          <div className={styles.toolbar}>
            <button type="button" className={`${styles.pill} ${styles.pillOn}`} onClick={() => setShowing(true)}>
              ▶ Showcase
            </button>
            <span className={styles.muted}>Every part of every house falls into place, stage by stage.</span>
          </div>
          <HouseRenderView input={units[0].input} units={units} site={site} fileName={terrace.name} />
        </section>
      )}
      {showing && units.length > 0 && <Showcase input={units[0].input} units={units} site={site} name={terrace.name} facts={facts} onClose={() => setShowing(false)} />}
    </div>
  )
}

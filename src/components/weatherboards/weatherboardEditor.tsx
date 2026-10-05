"use client"

import { ReactNode, useDeferredValue, useMemo, useState } from "react"
import SpecCard from "@/components/structures/specCard"
import ElevationDiagram from "./elevationDiagram"
import WallEditor from "./wallEditor"
import NumField from "./numField"
import { TRIM_LABELS } from "./trims"
import { calculateResults, planBoards, planTrims, withDefaults } from "./takeoff"
import { calculateWall } from "./weatherboardCalc"
import QuickAddWall from "./quickAddWall"
import { buildQuickWall, defaultQuickForm, QuickWallForm, relayoutAutoOpenings } from "./quickWall"
import { DEFAULT_PROJECT, ELEVATION_NAMES, STOCK_LENGTHS_MM, newBlankProject, newElevation, newId } from "./data"
import { Elevation, Opening, Wall, WeatherboardProject, WeatherboardSettings } from "./types"
import styles from "./weatherboardEditor.module.scss"

const NEW_WALL_TAB = "__new__"
const DRAFT_WALL_ID = "__draft__"

export const formatM = (mm: number, decimals = 1) => `${(mm / 1000).toFixed(decimals)} m`
const m = formatM

/** Multi-elevation weatherboard take-off: walls with raked tops and
 * bottoms are split into courses at the board cover, long courses are
 * joined on staggered studs, and every piece from every elevation is
 * packed onto the cheapest mix of the supplier's stock lengths. Where the
 * project lives (this browser, or Firestore) is the caller's business —
 * it hands in the project and a functional setter, plus a header. */
const WeatherboardEditor: React.FC<{
  project: WeatherboardProject
  setProject: (update: (prev: WeatherboardProject) => WeatherboardProject) => void
  header: ReactNode
}> = ({ project, setProject, header }) => {
  const [activeElevationId, setActiveElevationId] = useState<string | null>(null)
  // which wall sub-tab each elevation has open: a wall id, or NEW_WALL_TAB
  const [wallTabs, setWallTabs] = useState<Record<string, string>>({})
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null)
  // each elevation's "+ Add wall" form, kept while you hop between tabs
  const [quickForms, setQuickForms] = useState<Record<string, QuickWallForm>>({})

  const { elevations } = project
  const settings = useMemo(() => withDefaults(project.settings), [project.settings])
  const activeElevation = elevations.find((e) => e.id === activeElevationId) ?? elevations[0] ?? null

  const openTab = activeElevation ? wallTabs[activeElevation.id] : undefined
  const activeWall =
    activeElevation && openTab !== NEW_WALL_TAB
      ? (activeElevation.walls.find((w) => w.id === openTab) ?? activeElevation.walls[0] ?? null)
      : null
  const activeWallId = activeWall?.id ?? null
  const quickForm =
    activeElevation && !activeWall
      ? (quickForms[activeElevation.id] ?? defaultQuickForm(`Wall ${activeElevation.walls.length + 1}`))
      : null
  // what the "+ Add wall" form would add, previewed dashed on the elevation
  const draftWall = useMemo(() => (quickForm ? buildQuickWall(quickForm, DRAFT_WALL_ID) : null), [quickForm])

  const selectWall = (elevationId: string, wallId: string) => setWallTabs((t) => ({ ...t, [elevationId]: wallId }))

  const results = useMemo(() => calculateResults(elevations, settings), [elevations, settings])

  // the cutting optimiser is the slow part — let it lag a frame or two
  // behind while an opening is being dragged instead of stalling the drag
  const deferredElevations = useDeferredValue(elevations)
  const deferredResults = useDeferredValue(results)
  const plan = useMemo(
    () => planBoards(deferredElevations, deferredResults, settings),
    [deferredElevations, deferredResults, settings],
  )
  const trims = useMemo(() => planTrims(deferredElevations, settings), [deferredElevations, settings])

  const allResults = [...results.values()].flat()
  const totalArea = allResults.reduce((s, r) => s + r.netAreaM2, 0)
  const wastePct = plan.totalStockMm > 0 ? (1 - plan.totalCutMm / plan.totalStockMm) * 100 : 0
  const longest = settings.stockLengthsMm.length > 0 ? Math.max(...settings.stockLengthsMm) : 0
  const spareBoards = longest > 0 ? Math.ceil((plan.totalStockMm * settings.sparePercent) / 100 / longest) : 0

  // identical boards (same stock length, same pieces) grouped into one line
  const boardGroups = useMemo(() => {
    const groups = new Map<string, { stockLength: number; lengths: number[]; offcut: number; count: number }>()
    for (const b of plan.boards) {
      const lengths = b.pieces.map((p) => p.length).sort((a, c) => c - a)
      const key = `${b.stockLength}:${lengths.join(",")}`
      const g = groups.get(key)
      if (g) g.count++
      else groups.set(key, { stockLength: b.stockLength, lengths, offcut: b.offcut, count: 1 })
    }
    return [...groups.values()]
  }, [plan.boards])

  // --- state updates -------------------------------------------------------

  const setSettings = (patch: Partial<WeatherboardSettings>) =>
    setProject((p) => ({ ...p, settings: { ...p.settings, ...patch } }))

  const updateElevation = (id: string, fn: (e: Elevation) => Elevation) =>
    setProject((p) => ({ ...p, elevations: p.elevations.map((e) => (e.id === id ? fn(e) : e)) }))

  /** A wall whose length or edges change re-spreads its auto-placed
   * windows to suit; pinned ones never move. */
  const updateWall = (elevationId: string, wall: Wall) =>
    updateElevation(elevationId, (e) => ({
      ...e,
      walls: e.walls.map((w) => {
        if (w.id !== wall.id) return w
        const reshaped =
          w.lengthMm !== wall.lengthMm ||
          JSON.stringify([w.top, w.bottom]) !== JSON.stringify([wall.top, wall.bottom])
        return reshaped ? relayoutAutoOpenings(wall) : wall
      }),
    }))

  const addQuickWall = (elevationId: string, form: QuickWallForm) => {
    const wall = buildQuickWall(form, newId())
    updateElevation(elevationId, (e) => ({ ...e, walls: [...e.walls, wall] }))
    // the next "+ Add wall" starts fresh as Wall n+1
    setQuickForms((all) => {
      const rest = { ...all }
      delete rest[elevationId]
      return rest
    })
    selectWall(elevationId, wall.id)
  }

  const removeWall = (elevationId: string, wallId: string) => {
    const e = elevations.find((x) => x.id === elevationId)
    const w = e?.walls.find((x) => x.id === wallId)
    if (!e || !w || !window.confirm(`Remove ${w.name || "this wall"}?`)) return
    const i = e.walls.indexOf(w)
    const next = e.walls[i - 1] ?? e.walls[i + 1]
    updateElevation(elevationId, (el) => ({ ...el, walls: el.walls.filter((x) => x.id !== wallId) }))
    selectWall(elevationId, next ? next.id : NEW_WALL_TAB)
  }

  const duplicateWall = (elevationId: string, w: Wall) => {
    const copy: Wall = {
      ...w,
      id: newId(),
      name: `${w.name} (copy)`,
      top: { ...w.top, breaks: w.top.breaks.map((b) => ({ ...b, id: newId() })) },
      bottom: { ...w.bottom, breaks: w.bottom.breaks.map((b) => ({ ...b, id: newId() })) },
      openings: (w.openings ?? []).map((o) => ({ ...o, id: newId() })),
    }
    updateElevation(elevationId, (e) => {
      const walls = [...e.walls]
      walls.splice(walls.findIndex((x) => x.id === w.id) + 1, 0, copy)
      return { ...e, walls }
    })
    selectWall(elevationId, copy.id)
  }

  const updateOpening = (elevationId: string, wallId: string, opening: Opening) =>
    updateElevation(elevationId, (e) => ({
      ...e,
      walls: e.walls.map((w) =>
        // dragged into place by hand — pinned from now on
        w.id === wallId
          ? { ...w, openings: (w.openings ?? []).map((o) => (o.id === opening.id ? { ...opening, auto: false } : o)) }
          : w,
      ),
    }))

  const addElevation = () => {
    const name = ELEVATION_NAMES.find((n) => !elevations.some((e) => e.name === n)) ?? `Elevation ${elevations.length + 1}`
    const e = newElevation(name)
    setProject((p) => ({ ...p, elevations: [...p.elevations, e] }))
    setActiveElevationId(e.id)
  }

  const removeElevation = (id: string) => {
    const e = elevations.find((x) => x.id === id)
    if (!e || !window.confirm(`Remove the ${e.name} elevation and its ${e.walls.length} wall(s)?`)) return
    setProject((p) => ({ ...p, elevations: p.elevations.filter((x) => x.id !== id) }))
    setActiveElevationId(null)
  }

  const toggleLength = (key: "stockLengthsMm" | "trimLengthsMm", length: number) => {
    const current = settings[key]
    const has = current.includes(length)
    if (has && current.length === 1) return // keep at least one
    setSettings({ [key]: has ? current.filter((l) => l !== length) : [...current, length].sort((a, b) => a - b) })
  }

  const resetProject = () => {
    if (!window.confirm("Replace every elevation and setting with the example project?")) return
    setProject(() => DEFAULT_PROJECT)
    setActiveElevationId(null)
  }

  const clearProject = () => {
    if (!window.confirm("Clear every elevation and start a blank take-off?")) return
    const { elevations: blank } = newBlankProject()
    setProject((p) => ({ settings: p.settings, elevations: blank }))
    setActiveElevationId(blank[0].id)
  }

  const activeResults = activeElevation ? (results.get(activeElevation.id) ?? []) : []

  return (
    <div className={styles.weatherboardsPage}>
      {header}
      <p className={styles.intro}>
        Mark up each elevation as a set of walls — raked tops and bottoms included, even where the rake only starts part
        way along — and get a course-by-course layout with joins on staggered studs, plus the most economical order
        across the board lengths your yard stocks. Heights are in mm above a common datum (FFL or top of slab works
        well).
      </p>

      <section className={styles.card}>
        <h2>Settings</h2>
        <div className={styles.settingsGrid}>
          <label>
            Course spacing (cover)
            <span className={styles.unitInput}>
              <NumField value={settings.coverMm} min={10} onChange={(v) => setSettings({ coverMm: v })} />
              mm
            </span>
            <span className={styles.hint}>Vertical centres — each wall can override it</span>
          </label>
          <label>
            Stud centres
            <span className={styles.unitInput}>
              <NumField value={settings.studSpacingMm} min={100} step={50} onChange={(v) => setSettings({ studSpacingMm: v })} />
              mm
            </span>
            <span className={styles.hint}>Joins land on these, measured from each wall&apos;s left end</span>
          </label>
          <label>
            Cut allowance
            <span className={styles.unitInput}>
              <NumField value={settings.cutAllowanceMm} min={0} onChange={(v) => setSettings({ cutAllowanceMm: v })} />
              mm/piece
            </span>
            <span className={styles.hint}>Extra per piece for trimming ends — 0 if boards come square</span>
          </label>
          <label>
            Spare
            <span className={styles.unitInput}>
              <NumField value={settings.sparePercent} min={0} onChange={(v) => setSettings({ sparePercent: v })} />%
            </span>
            <span className={styles.hint}>Added for splits and miscuts</span>
          </label>
          <label>
            Facing width
            <span className={styles.unitInput}>
              <NumField value={settings.facingWidthMm} min={0} onChange={(v) => setSettings({ facingWidthMm: v })} />
              mm
            </span>
            <span className={styles.hint}>Corner and opening facings — sized for the trim count only</span>
          </label>
          <label>
            Flashing lap
            <span className={styles.unitInput}>
              <NumField value={settings.flashingLapMm} min={0} onChange={(v) => setSettings({ flashingLapMm: v })} />
              mm/side
            </span>
            <span className={styles.hint}>How far head flashings run past the facings</span>
          </label>
        </div>
        {(
          [
            ["stockLengthsMm", "Board lengths available"],
            ["trimLengthsMm", "Facing & scriber lengths"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className={styles.stockRow}>
            <span className={styles.stockLabel}>{label}</span>
            {STOCK_LENGTHS_MM.map((l) => (
              <button
                key={l}
                type="button"
                className={`${styles.chip} ${settings[key].includes(l) ? styles.chipOn : ""}`}
                aria-pressed={settings[key].includes(l)}
                onClick={() => toggleLength(key, l)}
              >
                {(l / 1000).toFixed(1)} m
              </button>
            ))}
          </div>
        ))}
      </section>

      <div className={styles.tabs} role="tablist">
        {elevations.map((e) => (
          <button
            key={e.id}
            type="button"
            role="tab"
            aria-selected={e.id === activeElevation?.id}
            className={`${styles.tab} ${e.id === activeElevation?.id ? styles.tabActive : ""}`}
            onClick={() => setActiveElevationId(e.id)}
          >
            {e.name || "Untitled"}
            <span className={styles.tabCount}>{e.walls.length}</span>
          </button>
        ))}
        <button type="button" className={styles.tabAdd} onClick={addElevation}>
          + Elevation
        </button>
      </div>

      {activeElevation ? (
        <section className={styles.elevation}>
          <div className={styles.elevationHeader}>
            <input
              className={styles.elevationName}
              value={activeElevation.name}
              aria-label="Elevation name"
              onChange={(ev) => updateElevation(activeElevation.id, (e) => ({ ...e, name: ev.target.value }))}
            />
            <button type="button" className={`${styles.linkButton} ${styles.danger}`} onClick={() => removeElevation(activeElevation.id)}>
              Remove elevation
            </button>
          </div>

          <div className={styles.diagramCard}>
            <ElevationDiagram
              results={draftWall ? [...activeResults, calculateWall(draftWall, settings)] : activeResults}
              draftWallId={draftWall ? DRAFT_WALL_ID : null}
              settings={settings}
              activeWallId={activeWallId}
              selectedOpeningId={selectedOpeningId}
              onSelectWall={(wallId) => selectWall(activeElevation.id, wallId)}
              onSelectOpening={(wallId, openingId) => {
                selectWall(activeElevation.id, wallId)
                setSelectedOpeningId(openingId)
              }}
              onOpeningChange={(wallId, o) => updateOpening(activeElevation.id, wallId, o)}
            />
            <p className={styles.legend}>
              <span className={styles.legendJoin} /> board join (on a stud) <span className={styles.legendCourse} /> course
              line <span className={styles.legendFacing} /> facing <span className={styles.legendScriber} /> scriber{" "}
              <span className={styles.legendFlashing} /> head flashing · click a wall to open its tab, click an opening to select it, drag to move, pull a corner to resize
            </p>
          </div>

          <div className={styles.wallTabs} role="tablist" aria-label={`${activeElevation.name} walls`}>
            {activeElevation.walls.map((w) => (
              <button
                key={w.id}
                type="button"
                role="tab"
                aria-selected={w.id === activeWallId}
                className={`${styles.wallTab} ${w.id === activeWallId ? styles.wallTabActive : ""}`}
                onClick={() => selectWall(activeElevation.id, w.id)}
              >
                {w.name || "Untitled wall"}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={!activeWall}
              className={`${styles.wallTab} ${styles.wallTabNew} ${!activeWall ? styles.wallTabActive : ""}`}
              onClick={() => selectWall(activeElevation.id, NEW_WALL_TAB)}
            >
              + Add wall
            </button>
          </div>

          {activeWall ? (
            <WallEditor
              key={activeWall.id}
              wall={activeWall}
              result={activeResults.find((r) => r.wall.id === activeWall.id) ?? calculateWall(activeWall, settings)}
              projectCoverMm={settings.coverMm}
              selectedOpeningId={selectedOpeningId}
              onSelectOpening={setSelectedOpeningId}
              onChange={(wall) => updateWall(activeElevation.id, wall)}
              onRemove={() => removeWall(activeElevation.id, activeWall.id)}
              onDuplicate={() => duplicateWall(activeElevation.id, activeWall)}
            />
          ) : (
            quickForm && (
              <QuickAddWall
                form={quickForm}
                onChange={(f) => setQuickForms((all) => ({ ...all, [activeElevation.id]: f }))}
                onAdd={() => addQuickWall(activeElevation.id, quickForm)}
              />
            )
          )}
        </section>
      ) : (
        <p className={styles.empty}>No elevations yet — add one to start marking up walls.</p>
      )}

      <h2 className={styles.sectionTitle}>Board order — all elevations</h2>
      {plan.boards.length === 0 ? (
        <p className={styles.empty}>Nothing to clad yet.</p>
      ) : (
        <>
          <div className={styles.resultsGrid}>
            <SpecCard
              title="Optimised order"
              rows={[
                ...plan.order.map((o) => ({
                  label: `${(o.length / 1000).toFixed(1)} m boards`,
                  value: `${o.count} (${m(o.length * o.count)})`,
                })),
                { label: "Total", value: `${plan.boards.length} boards · ${m(plan.totalStockMm)}` },
                { label: "Used full length", value: `${plan.fullLengthBoards} boards` },
              ]}
              note="Courses are laid out on whole boards wherever the studs allow, short make-up pieces come out of offcuts, then the order is packed for least lineal metres and fewest boards."
            />
            <SpecCard
              title="With spare"
              rows={[
                ...plan.order.map((o) => ({
                  label: `${(o.length / 1000).toFixed(1)} m boards`,
                  value: String(o.count + (o.length === longest ? spareBoards : 0)),
                })),
                ...(plan.order.some((o) => o.length === longest) || spareBoards === 0
                  ? []
                  : [{ label: `${(longest / 1000).toFixed(1)} m boards`, value: String(spareBoards) }]),
                { label: "Total", value: m(plan.totalStockMm + spareBoards * longest) },
              ]}
              note={`${settings.sparePercent}% spare added as ${spareBoards} × ${(longest / 1000).toFixed(1)} m — the longest board covers any length that splits.`}
            />
            <SpecCard
              title="Take-off"
              rows={[
                { label: "Clad area (net of openings)", value: `${totalArea.toFixed(2)} m²` },
                { label: "Lineal metres cut", value: m(plan.totalCutMm, 2) },
                { label: "Pieces", value: String(plan.boards.reduce((s, b) => s + b.pieces.length, 0)) },
                { label: "Offcut waste", value: `${wastePct.toFixed(1)}%` },
              ]}
            />
          </div>

          <h2 className={styles.sectionTitle}>Trims &amp; flashings</h2>
          <div className={styles.resultsGrid}>
            {(["facing", "scriber"] as const).map((k) => {
              const p = trims[k]
              return (
                <SpecCard
                  key={k}
                  title={TRIM_LABELS[k]}
                  rows={
                    p.boards.length === 0
                      ? [{ label: "None", value: "—" }]
                      : [
                          ...p.order.map((o) => ({
                            label: `${(o.length / 1000).toFixed(1)} m lengths`,
                            value: `${o.count} (${m(o.length * o.count)})`,
                          })),
                          { label: "Pieces", value: `${p.boards.reduce((sum, b) => sum + b.pieces.length, 0)} · ${m(p.totalCutMm, 2)}` },
                        ]
                  }
                  note={
                    k === "facing"
                      ? "One per wall at external corners marked with facings, plus two jambs and a head per opening."
                      : "One per internal corner, plus one against each jamb facing."
                  }
                />
              )
            })}
            <SpecCard
              title={TRIM_LABELS.flashing}
              rows={
                trims.flashings.length === 0
                  ? [{ label: "None", value: "—" }]
                  : [
                      ...trims.flashings.map(([length, count]) => ({ label: `${length} mm`, value: `× ${count}` })),
                      { label: "Total", value: m(trims.flashingTotalMm, 2) },
                    ]
              }
              note="Made to length, one per opening — width plus both facings plus the lap each side."
            />
          </div>

          <details className={styles.details}>
            <summary>Cutting plan — {plan.boards.length} boards</summary>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Qty</th>
                  <th>Board</th>
                  <th>Cut into (mm)</th>
                  <th>Offcut</th>
                </tr>
              </thead>
              <tbody>
                {boardGroups.map((g, i) => (
                  <tr key={i}>
                    <td>{g.count} ×</td>
                    <td>{(g.stockLength / 1000).toFixed(1)} m</td>
                    <td>{g.lengths.join(" + ")}</td>
                    <td>{g.offcut} mm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <details className={styles.details}>
            <summary>Course schedule — every piece, wall by wall</summary>
            {elevations.map((e) => (
              <div key={e.id} className={styles.schedule}>
                <h3>{e.name}</h3>
                {(results.get(e.id) ?? []).map((r) => (
                  <div key={r.wall.id}>
                    <h4>
                      {r.wall.name} — {r.courses.length} courses at {r.coverMm} mm
                    </h4>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Course</th>
                          <th>From</th>
                          <th>Pieces, left to right (mm)</th>
                          <th>Joins at (mm)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...r.courses].reverse().map((c) => (
                          <tr key={c.index}>
                            <td>{c.index}</td>
                            <td>{Math.round(c.bottom)}</td>
                            <td>{c.pieces.map((p) => Math.ceil(p.cutLength - 1e-6)).join(" + ") || "—"}</td>
                            <td>{c.joins.map((j) => Math.round(j)).join(", ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ))}
          </details>
        </>
      )}

      <div className={styles.projectButtons}>
        <button type="button" className={styles.linkButton} onClick={resetProject}>
          Load example project
        </button>
        <button type="button" className={`${styles.linkButton} ${styles.danger}`} onClick={clearProject}>
          Clear all
        </button>
      </div>

      <p className={styles.disclaimer}>
        Pieces run to the long point of every rake cut, and under the corner and jamb facings to the wall end or
        opening edge. Courses an opening only
        partly covers (the head and sill boards) are counted full length and notched around it. Sill trims, soakers,
        box corners and barge or soffit scribers aren&apos;t counted. Joins are kept at
        least one stud bay from a run&apos;s ends and off the joins in the course below. The order is a heuristic
        optimisation, not a guaranteed minimum — check against your profile&apos;s installation guide.
      </p>
    </div>
  )
}

export default WeatherboardEditor

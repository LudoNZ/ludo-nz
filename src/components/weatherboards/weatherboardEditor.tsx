"use client"

import { ReactNode, useDeferredValue, useMemo, useState } from "react"
import SpecCard from "@/components/structures/specCard"
import ElevationDiagram from "./elevationDiagram"
import WallEditor from "./wallEditor"
import NumField from "./numField"
import { TRIM_LABELS } from "./trims"
import { boardId, calculateResults, planBoards, planTrims, stockBoardOf, wallCodes, withDefaults } from "./takeoff"
import { calculateWall } from "./weatherboardCalc"
import { setBoardSkipped, skipTotals } from "./skips"
import JoinerySkipModal from "./joinerySkipModal"
import OpeningFields from "./openingFields"
import QuickAddWall from "./quickAddWall"
import { defaultQuickForm, QuickLinkField, QuickWallForm, relayoutAutoOpenings } from "./quickWall"
import { applyQuickForm, detachQuick, formFromWall } from "./quickEdit"
import DimensionPopover from "./dimensionPopover"
import LinkPicker from "./linkPicker"
import {
  MeasureGroup,
  allMeasures,
  anchorCounts,
  applyLinks,
  defaultLinksFor,
  describe,
  editMeasure,
  linkMap,
  linkMeasure,
  measureKey,
  rootOf,
  syncWallEdit,
  unlinkMeasure,
} from "./measures"
import { DEFAULT_PROJECT, ELEVATION_NAMES, STOCK_LENGTHS_MM, newBlankProject, newElevation, newId } from "./data"
import { Elevation, Opening, Wall, WeatherboardProject, WeatherboardSettings } from "./types"
import styles from "./weatherboardEditor.module.scss"

const NEW_WALL_TAB = "__new__"
const SETTINGS_TAB = "__settings__"

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
  const settingsOpen = activeElevationId === SETTINGS_TAB
  const activeElevation = settingsOpen
    ? null
    : (elevations.find((e) => e.id === activeElevationId) ?? elevations[0] ?? null)

  const openTab = activeElevation ? wallTabs[activeElevation.id] : undefined
  const activeWall =
    activeElevation && openTab !== NEW_WALL_TAB
      ? (activeElevation.walls.find((w) => w.id === openTab) ?? activeElevation.walls[0] ?? null)
      : null
  const activeWallId = activeWall?.id ?? null
  // dimensions and the links between them, project-wide
  const measures = useMemo(() => allMeasures(project), [project])
  const measureByKey = useMemo(() => new Map(measures.map((m) => [m.key, m])), [measures])
  const links = useMemo(() => linkMap(project), [project])
  const anchors = useMemo(() => anchorCounts(links), [links])
  const describeKey = (key: string) => describe(measureByKey.get(key))

  // a dimension clicked on the elevation, and the link picker when open
  const [editing, setEditing] = useState<{ key: string; at: DOMRect } | null>(null)
  const [picking, setPicking] = useState<{
    title: string
    targetKey: string | null
    group: MeasureGroup
    onPick: (anchorKey: string) => void
  } | null>(null)

  // The "+ Add wall" form starts out linked the logical way (width to the
  // opposite elevation's matching wall, heights to the project's first
  // wall), and every linked field shows its anchor's current value.
  const rawQuickForm = useMemo(
    () =>
      activeElevation && !activeWall
        ? (quickForms[activeElevation.id] ?? {
            ...defaultQuickForm(`Wall ${activeElevation.walls.length + 1}`),
            links: Object.fromEntries(
              Object.entries(defaultLinksFor(project, activeElevation.id)).filter(([, v]) => v),
            ) as QuickWallForm["links"],
          })
        : null,
    [activeElevation, activeWall, quickForms, project],
  )
  const quickForm = useMemo(() => {
    if (!rawQuickForm) return null
    const v = (key: string | undefined) => (key ? measureByKey.get(key)?.value : undefined)
    return {
      ...rawQuickForm,
      widthMm: v(rawQuickForm.links.width) ?? rawQuickForm.widthMm,
      heightMm: v(rawQuickForm.links.height) ?? rawQuickForm.heightMm,
      ridgeMm: (rawQuickForm.shape === "gable" ? v(rawQuickForm.links.ridge) : undefined) ?? rawQuickForm.ridgeMm,
    }
  }, [rawQuickForm, measureByKey])
  // the quick form shown: the draft on "+ Add wall", or read back off a
  // wall that's still edited through it
  const slotForm = activeWall ? (activeWall.quick ? formFromWall(activeWall) : null) : quickForm

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
  // board ids ("N1-3a") shared by the drawing, cut list and schedule,
  // and which numbered stock board each one comes off
  const codes = useMemo(() => wallCodes(elevations), [elevations])
  const boardSource = useMemo(() => stockBoardOf(plan), [plan])
  const [showLengths, setShowLengths] = useState(false)
  // "Skip boards" mode: tap boards on the elevation to leave them out
  const [skipMode, setSkipMode] = useState(false)
  const skipped = useMemo(() => skipTotals([...results.values()].flat()), [results])
  const skippedHere = activeElevation ? skipTotals(results.get(activeElevation.id) ?? []) : { boards: 0, mm: 0 }

  /** One board tapped (or painted over) in skip mode. Works off the
   * latest project so a fast drag across many boards never loses one. */
  const skipBoard = (wallId: string, courseIndex: number, pieceIndex: number, skip: boolean) =>
    setProject((p) => ({
      ...p,
      elevations: p.elevations.map((e) => ({
        ...e,
        walls: e.walls.map((w) =>
          w.id === wallId
            ? setBoardSkipped(w, calculateWall(w, withDefaults(p.settings)), courseIndex, pieceIndex, skip)
            : w,
        ),
      })),
    }))

  // a window or door tapped in skip mode, and its trims dialog
  const [joinery, setJoinery] = useState<{ wallId: string; openingId: string } | null>(null)
  const setJoinerySkip = (wallId: string, openingId: string, skipParts: Opening["skipParts"]) =>
    setProject((p) => ({
      ...p,
      elevations: p.elevations.map((e) => ({
        ...e,
        walls: e.walls.map((w) =>
          w.id !== wallId
            ? w
            : {
                ...w,
                openings: (w.openings ?? []).map((o) => {
                  if (o.id !== openingId) return o
                  const { skipParts: _old, ...rest } = o
                  void _old
                  return skipParts ? { ...rest, skipParts } : rest
                }),
              },
        ),
      })),
    }))

  const clearSkips = (elevationId: string) =>
    updateElevation(elevationId, (e) => ({
      ...e,
      walls: e.walls.map((w) => {
        if (!w.skips) return w
        const { skips: _gone, ...rest } = w
        void _gone
        return rest
      }),
    }))

  // --- state updates -------------------------------------------------------

  const setSettings = (patch: Partial<WeatherboardSettings>) =>
    setProject((p) => ({ ...p, settings: { ...p.settings, ...patch } }))

  const updateElevation = (id: string, fn: (e: Elevation) => Elevation) =>
    setProject((p) => ({ ...p, elevations: p.elevations.map((e) => (e.id === id ? fn(e) : e)) }))

  /** A wall whose length or edges change re-spreads its auto-placed
   * windows to suit (pinned ones never move); any of its linked
   * dimensions that changed carry the change to their anchor, and so to
   * everything else linked to it. */
  const updateWall = (elevationId: string, wall: Wall) =>
    setProject((p) => {
      const before = p.elevations.find((e) => e.id === elevationId)?.walls.find((w) => w.id === wall.id)
      if (!before) return p
      const reshaped =
        before.lengthMm !== wall.lengthMm ||
        JSON.stringify([before.top, before.bottom, before.corners]) !== JSON.stringify([wall.top, wall.bottom, wall.corners])
      const after = reshaped ? relayoutAutoOpenings(wall) : wall
      const next = {
        ...p,
        elevations: p.elevations.map((e) =>
          e.id === elevationId ? { ...e, walls: e.walls.map((w) => (w.id === wall.id ? after : w)) } : e,
        ),
      }
      return syncWallEdit(next, before, after)
    })

  /** A quick-form change: the first one on "+ Add wall" creates the wall
   * (its tab takes over, and a fresh "+ Add wall" appears); later ones on
   * the wall's own tab rebuild it in place. */
  const changeQuick = (elevationId: string, form: QuickWallForm, wallId: string | null) => {
    const id = wallId ?? newId()
    setProject((p) => applyQuickForm(p, elevationId, form, id))
    if (!wallId) {
      setQuickForms((all) => {
        const rest = { ...all }
        delete rest[elevationId]
        return rest
      })
      selectWall(elevationId, id)
    }
  }

  /** Removing a wall puts its tab back to a blank "+ Add wall". A
   * quick-form wall goes without asking — it's one change to make again;
   * one that's been through the full editor asks first. */
  const removeWall = (elevationId: string, wallId: string) => {
    const e = elevations.find((x) => x.id === elevationId)
    const w = e?.walls.find((x) => x.id === wallId)
    if (!e || !w) return
    if (!w.quick && !window.confirm(`Remove ${w.name || "this wall"}?`)) return
    // applyLinks hands an anchor's role to one of its dependents if it goes
    setProject((p) =>
      applyLinks({
        ...p,
        elevations: p.elevations.map((el) => (el.id === elevationId ? { ...el, walls: el.walls.filter((x) => x.id !== wallId) } : el)),
      }),
    )
    setQuickForms((all) => {
      const rest = { ...all }
      delete rest[elevationId]
      return rest
    })
    selectWall(elevationId, NEW_WALL_TAB)
  }

  /** The copy keeps the original's links (so it moves with the same
   * anchors), re-keyed onto its own new break point ids. */
  const duplicateWall = (elevationId: string, w: Wall) => {
    const breakIds = new Map(w.top.breaks.map((b) => [b.id, newId()]))
    const copyLinks = Object.fromEntries(
      Object.entries(w.links ?? {}).map(([kind, anchor]) => [
        kind.startsWith("break:") ? `break:${breakIds.get(kind.slice(6)) ?? kind.slice(6)}` : kind,
        anchor,
      ]),
    )
    const copy: Wall = {
      ...w,
      id: newId(),
      name: `${w.name} (copy)`,
      top: { ...w.top, breaks: w.top.breaks.map((b) => ({ ...b, id: breakIds.get(b.id) as string })) },
      bottom: { ...w.bottom, breaks: w.bottom.breaks.map((b) => ({ ...b, id: newId() })) },
      openings: (w.openings ?? []).map((o) => ({ ...o, id: newId() })),
      links: copyLinks,
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
    setProject((p) => applyLinks({ ...p, elevations: p.elevations.filter((x) => x.id !== id) }))
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

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={settingsOpen}
          className={`${styles.tab} ${settingsOpen ? styles.tabActive : ""}`}
          onClick={() => setActiveElevationId(SETTINGS_TAB)}
        >
          Settings
        </button>
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

      {settingsOpen ? (
        <section className={styles.settingsPanel}>
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
      ) : activeElevation ? (
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
            <div className={styles.diagramToolbar}>
              <label className={styles.lengthToggle}>
                <input type="checkbox" checked={showLengths} onChange={(e) => setShowLengths(e.target.checked)} />
                Show board lengths <span className={styles.hint}>— length and the stock board (#) it&apos;s cut from</span>
              </label>
              <button
                type="button"
                aria-pressed={skipMode}
                className={`${styles.skipToggle} ${skipMode ? styles.skipToggleOn : ""}`}
                onClick={() => setSkipMode((v) => !v)}
              >
                {skipMode ? "✓ Done skipping" : "Skip boards…"}
              </button>
            </div>
            {/* the selected window/door's shape and size, right by the drawing */}
            {!skipMode &&
              (() => {
                const wall = activeElevation.walls.find((w) => (w.openings ?? []).some((o) => o.id === selectedOpeningId))
                const i = wall?.openings.findIndex((o) => o.id === selectedOpeningId) ?? -1
                const o = wall && i >= 0 ? wall.openings[i] : null
                if (!wall || !o) return null
                const kind = o.sill <= Math.min(wall.bottom.left, wall.bottom.right) + 100 ? "Door" : "Window"
                return (
                  <div className={styles.openingPanel}>
                    <div className={styles.openingPanelHeader}>
                      <strong>
                        {codes.get(wall.id)} · {wall.name} — {kind} {i + 1}
                      </strong>
                      <button
                        type="button"
                        className={`${styles.linkButton} ${styles.danger}`}
                        onClick={() => {
                          updateElevation(activeElevation.id, (e) => ({
                            ...e,
                            walls: e.walls.map((w) =>
                              w.id === wall.id ? { ...w, openings: w.openings.filter((x) => x.id !== o.id) } : w,
                            ),
                          }))
                          setSelectedOpeningId(null)
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className={styles.openingPanelClose}
                        aria-label="Deselect"
                        onClick={() => setSelectedOpeningId(null)}
                      >
                        ×
                      </button>
                    </div>
                    <OpeningFields opening={o} onChange={(next) => updateOpening(activeElevation.id, wall.id, next)} />
                  </div>
                )
              })()}
            {skipMode && (
              <p className={styles.skipBanner}>
                <strong>Skip boards:</strong> tap a board to leave it out of the order — tap again to count it. Drag across
                to do a whole zone at once. Tap a window or door to skip its facings, scribers or head flashing.
                {skippedHere.boards > 0 && (
                  <>
                    {" "}
                    {skippedHere.boards} skipped on this elevation ·{" "}
                    <button type="button" className={styles.linkButton} onClick={() => clearSkips(activeElevation.id)}>
                      Count them all again
                    </button>
                  </>
                )}
              </p>
            )}
            <ElevationDiagram
              results={activeResults}
              settings={settings}
              activeWallId={activeWallId}
              selectedOpeningId={selectedOpeningId}
              onSelectWall={(wallId) => selectWall(activeElevation.id, wallId)}
              onSelectOpening={(wallId, openingId) => {
                selectWall(activeElevation.id, wallId)
                setSelectedOpeningId(openingId)
              }}
              onOpeningChange={(wallId, o) => updateOpening(activeElevation.id, wallId, o)}
              links={links}
              anchors={anchors}
              onEditMeasure={(key, at) => setEditing({ key, at })}
              wallCodes={codes}
              stockBoardOf={boardSource}
              showLengths={showLengths}
              skipMode={skipMode}
              onSkip={skipBoard}
              onJoineryTap={(wallId, openingId) => setJoinery({ wallId, openingId })}
              onCornerMove={(wallId, cornerId, x) => {
                const w = activeElevation.walls.find((wall) => wall.id === wallId)
                if (w)
                  updateWall(activeElevation.id, {
                    ...w,
                    corners: (w.corners ?? []).map((c) => (c.id === cornerId ? { ...c, x } : c)),
                  })
              }}
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

          {/* One quick form in one fixed spot (same key) whether it's the
              "+ Add wall" draft or the wall it just created, so the field
              being typed in keeps focus as the wall is added. */}
          {slotForm && (
            <QuickAddWall
              key={`quick-${activeElevation.id}`}
              form={slotForm}
              onChange={(f) => changeQuick(activeElevation.id, f, activeWall?.id ?? null)}
              wall={activeWall ?? undefined}
              onCornersChange={activeWall ? (corners) => updateWall(activeElevation.id, { ...activeWall, corners }) : undefined}
              onRemove={activeWall ? () => removeWall(activeElevation.id, activeWall.id) : undefined}
              onMoreOptions={activeWall ? () => updateWall(activeElevation.id, detachQuick(activeWall)) : undefined}
              describeLink={describeKey}
              onPickLink={(field: QuickLinkField) =>
                setPicking({
                  title: `Link ${slotForm.name || "the new wall"}'s ${field} to…`,
                  targetKey: null,
                  group: field === "width" ? "width" : "height",
                  onPick: (anchorKey) =>
                    changeQuick(
                      activeElevation.id,
                      { ...slotForm, links: { ...slotForm.links, [field]: rootOf(anchorKey, links) } },
                      activeWall?.id ?? null,
                    ),
                })
              }
            />
          )}
          {activeWall && !activeWall.quick && (
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
              linkHint={(kind) => {
                const anchor = links.get(measureKey(activeWall.id, kind))
                return anchor ? describeKey(anchor) : null
              }}
            />
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
                ...(skipped.boards
                  ? [{ label: "Skipped (not counted)", value: `${skipped.boards} boards · ${m(skipped.mm, 1)}` }]
                  : []),
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
            <p className={styles.hint}>
              Each stock board, numbered, and the boards cut from it — ids match the labels on the elevations
              (N1-3a = North wall 1, course 3, first board from the left).
            </p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stock</th>
                  <th>Cut into</th>
                  <th>Offcut</th>
                </tr>
              </thead>
              <tbody>
                {plan.boards.map((b, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{(b.stockLength / 1000).toFixed(1)} m</td>
                    <td>
                      {b.pieces.map((p, j) => (
                        <span key={p.label} className={styles.cutPiece}>
                          {j > 0 && " + "}
                          <strong>{p.label}</strong> {p.length}
                        </span>
                      ))}
                    </td>
                    <td>{b.offcut} mm</td>
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
                      {codes.get(r.wall.id)} · {r.wall.name} — {r.courses.length} courses at {r.coverMm} mm
                    </h4>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Course</th>
                          <th>From</th>
                          <th>Boards, left to right (id length #stock)</th>
                          <th>Joins at (mm)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...r.courses].reverse().map((c) => (
                          <tr key={c.index}>
                            <td>{c.index}</td>
                            <td>{Math.round(c.bottom)}</td>
                            <td>
                              {c.pieces.length
                                ? c.pieces
                                    .map((p, i) => {
                                      const id = boardId(codes.get(r.wall.id) ?? "?", c.index, i)
                                      if (p.skipped) return `${id} skipped`
                                      const stock = boardSource.get(id)
                                      return `${id} ${Math.ceil(p.cutLength - 1e-6)}${stock ? ` #${stock}` : ""}`
                                    })
                                    .join(" + ")
                                : "—"}
                            </td>
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

      {editing &&
        measureByKey.get(editing.key) &&
        (() => {
          const m = measureByKey.get(editing.key)!
          const anchorKey = links.get(m.key)
          const root = rootOf(m.key, links)
          // everything else in its linked group: the anchor's dependents,
          // which (for a linked dimension) include this one but not the anchor
          const groupSize = [...links.values()].filter((a) => a === root).length
          return (
            <DimensionPopover
              key={editing.key}
              measure={m}
              anchor={anchorKey ? (measureByKey.get(anchorKey) ?? null) : null}
              dependents={anchors.get(m.key) ?? 0}
              groupSize={groupSize}
              at={editing.at}
              onClose={() => setEditing(null)}
              onCommit={(v) => setProject((p) => editMeasure(p, m.key, v))}
              onUnlink={() => setProject((p) => unlinkMeasure(p, m.key))}
              onLink={() => {
                setEditing(null)
                setPicking({
                  title: `Link ${describe(m)} to…`,
                  targetKey: m.key,
                  group: m.group,
                  onPick: (a) => setProject((p) => linkMeasure(p, m.key, a)),
                })
              }}
            />
          )
        })()}
      {joinery &&
        (() => {
          const wall = elevations.flatMap((e) => e.walls).find((w) => w.id === joinery.wallId)
          const i = wall?.openings?.findIndex((o) => o.id === joinery.openingId) ?? -1
          const opening = wall && i >= 0 ? wall.openings[i] : null
          if (!wall || !opening) return null
          // a unit whose sill sits at the bottom edge is a door, else a window
          const kind = opening.sill <= Math.min(wall.bottom.left, wall.bottom.right) + 100 ? "Door" : "Window"
          return (
            <JoinerySkipModal
              title={`${codes.get(wall.id) ?? ""} · ${wall.name} — ${kind} ${i + 1}`}
              opening={opening}
              settings={settings}
              onChange={(parts) => setJoinerySkip(wall.id, opening.id, parts)}
              onClose={() => setJoinery(null)}
            />
          )
        })()}
      {picking && (
        <LinkPicker
          title={picking.title}
          measures={measures}
          links={links}
          targetKey={picking.targetKey}
          group={picking.group}
          onClose={() => setPicking(null)}
          onPick={(a) => {
            picking.onPick(a)
            setPicking(null)
          }}
        />
      )}

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

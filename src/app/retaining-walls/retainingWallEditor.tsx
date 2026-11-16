"use client"

import { ReactNode, useEffect, useRef, useState } from "react"
import Button from "@/components/button/button"
import SpecCard from "@/components/structures/specCard"
import LaborSummary from "@/components/structures/laborSummary"
import { formatM, formatM3 } from "@/components/structures/format"
import { SettingsIcon } from "@/components/icons/icons"
import WallProfileDiagram from "@/components/retainingWall/wallProfileDiagram"
import WallPlanView from "@/components/retainingWall/wallPlanView"
import NumField from "@/components/weatherboards/numField"
import { buildWallProfile, ControlPoints, RunSpacing, segmentBayCounts } from "@/components/retainingWall/postProfile"
import { overridesForWall, WallProject } from "@/components/retainingWall/wallProject"
import {
  PlanPoint,
  RetainedSide,
  segmentLabel,
  segmentLengths,
  setSegmentLength,
  totalLength,
} from "@/components/retainingWall/wallPlan"
import { CalcSettings, findReferenceRow, POST_SIZE_OPTIONS } from "@/components/retainingWall/calcSettings"
import { ENGINEER_HEIGHT_LIMIT_M, SOIL_LABELS, SoilType } from "@/components/retainingWall/retainingWallCalc"
import { SavedCalcSettings, subscribeToCalcSettingsList } from "@/components/retainingWall/retainingWallData"
import ReferenceTableModal from "./referenceTableModal"
import SettingsPanel from "./settingsPanel"
import styles from "./retainingWallEditor.module.scss"

const SOIL_TYPES = Object.keys(SOIL_LABELS) as SoilType[]
/** common hire/contractor auger diameters, offered as suggestions — any
 * size can still be typed */
const AUGER_SIZES_MM = [200, 250, 300, 350, 400, 450, 500, 600]

/** The retaining wall calculator itself, with no idea where its wall is
 * kept: it starts from `initial` (read once, on mount — the caller mounts
 * it only once the wall has loaded), owns the wall from then on, and
 * reports every change up through `onChange`. The pages around it decide
 * what a change means — autosave to a project, or stash in this browser. */
const RetainingWallEditor: React.FC<{
  initial: WallProject
  onChange: (wall: WallProject) => void
  header: ReactNode
}> = ({ initial, onChange, header }) => {
  // the wall's shape seen from above: an open run of straight walls (A,
  // B, C…) joined at corners. Total wall length is just this unfolded.
  const [planPoints, setPlanPoints] = useState<PlanPoint[]>(initial.planPoints)
  // which side of the wall (walking it from A onward) the ground is held
  // back on — decides which face the elevations are looking at
  const [retainedSide, setRetainedSide] = useState<RetainedSide>(initial.retainedSide)
  // which run's elevation is showing, or the whole wall unfolded flat
  const [elevationView, setElevationView] = useState<number | "all">("all")
  const [retainedHeight, setRetainedHeight] = useState(String(initial.retainedHeightM))
  const [soil, setSoil] = useState<SoilType>(initial.soil)
  const [rlDatum, setRlDatum] = useState(String(initial.rlDatumM))
  // mm, the auger the holes are being drilled with; blank = size each
  // hole off its own post (the calc settings' multiplier) instead
  const [augerDiameter, setAugerDiameter] = useState(initial.augerDiameterMm ? String(initial.augerDiameterMm) : "")
  // one post size / one hole depth for the whole wall, replacing what the
  // reference table would work out post by post; blank = calculated
  const [postSizeOverride, setPostSizeOverride] = useState(initial.postSizeOverride ?? "")
  const [holeDepth, setHoleDepth] = useState(initial.holeDepthOverrideMm ? String(initial.holeDepthOverrideMm) : "")
  // per wall: a hand-set post count or spacing; null = the table's
  const [runSpacing, setRunSpacing] = useState<(RunSpacing | null)[]>(initial.runSpacing)
  const [showReferenceTable, setShowReferenceTable] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [calcSettings, setCalcSettings] = useState<CalcSettings>(initial.calcSettings)
  const [calcSettingsName, setCalcSettingsName] = useState(initial.calcSettingsName)
  const [presets, setPresets] = useState<SavedCalcSettings[]>([])

  // keyed by post index — a post with an entry here is "set by hand"; every
  // other post rakes (linearly interpolates) between whichever of these
  // bracket it. Reset whenever the base inputs (or the active calc
  // settings, which can change post spacing/count) change, since a stale
  // index would silently apply to the wrong physical post otherwise.
  // Reshaping the plan only resets these when it actually changes how
  // many posts a run gets — see handlePlanChange.
  const [controlPoints, setControlPoints] = useState<ControlPoints>(initial.controlPoints)
  // whole-wall option, not per-post — an extra flat board laid over the
  // top board/post tops for a finished look and to protect end grain
  const [topCapEnabled, setTopCapEnabled] = useState(initial.topCapEnabled)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const groundInputRef = useRef<HTMLInputElement>(null)
  const topInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsubscribe = subscribeToCalcSettingsList(setPresets, () => {})
    return () => unsubscribe()
  }, [])


  const wallLengthM = totalLength(planPoints)
  const segmentLengthsM = segmentLengths(planPoints)
  const retainedHeightM = parseFloat(retainedHeight)
  const rlDatumM = parseFloat(rlDatum) || 0
  const augerDiameterParsed = parseFloat(augerDiameter)
  const augerDiameterMm = augerDiameterParsed > 0 ? augerDiameterParsed : null
  const holeDepthParsed = parseFloat(holeDepth)
  const holeDepthOverrideMm = holeDepthParsed > 0 ? holeDepthParsed : null
  const overrides = overridesForWall({ augerDiameterMm, postSizeOverride: postSizeOverride || null, holeDepthOverrideMm, runSpacing })

  // report the wall upward whenever anything saveable actually changes.
  // The first pass only records what the wall looked like on mount
  // (nothing has changed yet — reporting would mark a freshly opened
  // project as edited); it's also skipped while the height box is
  // mid-edit and unparseable, so a half-typed number never gets saved.
  const lastReported = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    if (!(retainedHeightM > 0)) return
    const wall: WallProject = {
      planPoints,
      retainedSide,
      retainedHeightM,
      soil,
      rlDatumM,
      augerDiameterMm,
      postSizeOverride: postSizeOverride || null,
      holeDepthOverrideMm,
      runSpacing,
      controlPoints,
      topCapEnabled,
      calcSettings,
      calcSettingsName,
    }
    const json = JSON.stringify(wall)
    const previous = lastReported.current
    lastReported.current = json
    if (previous === null || previous === json) return
    onChangeRef.current(wall)
  }, [planPoints, retainedSide, retainedHeightM, soil, rlDatumM, augerDiameterMm, postSizeOverride, holeDepthOverrideMm, runSpacing, controlPoints, topCapEnabled, calcSettings, calcSettingsName])

  const resetProfile = () => {
    setControlPoints({})
    setSelectedIndex(null)
  }

  const profile = !isNaN(retainedHeightM)
    ? buildWallProfile(segmentLengthsM, retainedHeightM, soil, controlPoints, topCapEnabled, rlDatumM, calcSettings, overrides)
    : null

  // a run that no longer exists (corner removed, design swapped) falls
  // back to the whole-wall view rather than pointing at nothing
  const shownSegment = elevationView !== "all" && profile && elevationView < profile.segments.length ? elevationView : null
  // looking at the wall's face from the low side: with the ground held
  // back on the left of travel, A's start is on the viewer's left;
  // retained on the right, the viewer is round the other side and the
  // whole thing reads right-to-left
  const mirrored = retainedSide === "right"
  // the materials cards follow the elevation: the whole wall under "All",
  // or just the one run being looked at
  const totals = profile ? (shownSegment !== null ? profile.segmentTotals[shownSegment] : profile) : null
  const forWall = shownSegment !== null ? ` — Wall ${segmentLabel(shownSegment)}` : ""
  const postList = (indices: number[]) => indices.map((i) => `#${i + 1}`).join(", ")
  const mmRange = (minM: number, maxM: number) => {
    const lo = Math.round(minM * 1000)
    const hi = Math.round(maxM * 1000)
    return lo === hi ? `${lo}mm` : `${lo}–${hi}mm`
  }

  const handlePlanChange = (next: PlanPoint[]) => {
    // keep each wall's hand-set spacing with its own wall when a corner
    // is added (the wall it splits goes back to the table) or removed
    // (the two walls it joined merge into one on the table's spacing)
    let nextSpacing = runSpacing
    if (next.length !== planPoints.length && runSpacing.some(Boolean)) {
      const changed = next.findIndex((p, i) => !planPoints[i] || p.xM !== planPoints[i].xM || p.yM !== planPoints[i].yM)
      const at = changed === -1 ? next.length : changed
      const seg = Math.max(0, at - 1)
      nextSpacing =
        next.length > planPoints.length
          ? [...runSpacing.slice(0, seg), null, null, ...runSpacing.slice(seg + 1)]
          : at === 0
            ? runSpacing.slice(1)
            : [...runSpacing.slice(0, seg), null, ...runSpacing.slice(seg + 2)]
      nextSpacing = nextSpacing.slice(0, next.length - 1)
      setRunSpacing(nextSpacing)
    }
    const before = segmentBayCounts(segmentLengthsM, retainedHeightM, soil, calcSettings, runSpacing)
    const after = segmentBayCounts(segmentLengths(next), retainedHeightM, soil, calcSettings, nextSpacing)
    // hand-set levels are keyed by post index, so they only survive a
    // reshape that leaves every run with the same number of posts
    if (before.join(",") !== after.join(",")) resetProfile()
    setPlanPoints(next)
  }

  /** Sets (or, with null, clears) one wall's hand-set spacing. Hand-set
   * levels are keyed by post index, so the ones before this wall stay
   * put, the ones after it shift along with their posts, and the ones
   * on posts inside this wall — which all move — are dropped. */
  const applyRunSpacing = (segmentIndex: number, spacing: RunSpacing | null) => {
    if (!profile) return
    const seg = profile.segments[segmentIndex]
    const nextSpacing = Array.from({ length: profile.segments.length }, (_, i) => (i === segmentIndex ? spacing : (runSpacing[i] ?? null)))
    const oldBays = seg.endPostIndex - seg.startPostIndex
    const newBays = segmentBayCounts(segmentLengthsM, retainedHeightM, soil, calcSettings, nextSpacing)[segmentIndex]
    setRunSpacing(nextSpacing)
    if (newBays === oldBays) return
    setControlPoints((cp) => {
      const next: ControlPoints = {}
      for (const [key, value] of Object.entries(cp)) {
        const i = Number(key)
        if (i <= seg.startPostIndex) next[i] = value
        else if (i >= seg.endPostIndex) next[i + newBays - oldBays] = value
      }
      return next
    })
    setSelectedIndex(null)
  }

  const selectedPost = profile && selectedIndex !== null ? profile.posts[selectedIndex] : null
  const allBlocked = profile ? profile.posts.length === profile.engineerPostIndices.length : false
  const someBlocked = profile ? profile.engineerPostIndices.length > 0 : false

  const referenceRow = profile
    ? findReferenceRow(calcSettings, Math.min(Math.max(...profile.posts.map((p) => p.retainedHeightM)), ENGINEER_HEIGHT_LIMIT_M), soil)
    : null

  const handleSaveControlPoint = () => {
    if (selectedIndex === null || !groundInputRef.current || !topInputRef.current) return
    const groundAbs = parseFloat(groundInputRef.current.value)
    const topAbs = parseFloat(topInputRef.current.value)
    if (isNaN(groundAbs) || isNaN(topAbs)) return
    setControlPoints((cp) => ({ ...cp, [selectedIndex]: { groundLevelM: groundAbs - rlDatumM, topLevelM: topAbs - rlDatumM } }))
  }

  const handleClearControlPoint = () => {
    if (selectedIndex === null) return
    setControlPoints((cp) => {
      const next = { ...cp }
      delete next[selectedIndex]
      return next
    })
  }

  const handleApplySettings = (settings: CalcSettings, name: string) => {
    setCalcSettings(settings)
    setCalcSettingsName(name)
    resetProfile()
  }

  return (
    <div className={styles.retainingWallsPage}>
      {header}
      <div className={styles.headerRow}>
        <div>
          <p className={styles.intro}>
            A rough DIY materials and labour estimate for a straightforward timber post-and-board
            retaining wall. Enter your wall length, retained height, and ground conditions to start,
            shape the wall in the plan — add corners and drag them into place — then tap any post in
            an elevation to set its own ground level and top level by hand; posts in between rake
            (slope evenly) between whichever posts you&apos;ve set.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button size="icon" variant="secondary" onClick={() => setShowSettings(true)} ariaLabel="Calculation settings">
            <SettingsIcon />
          </Button>
        </div>
      </div>

      <p className={styles.settingsHint}>
        Using &quot;{calcSettingsName}&quot; calculation settings.{" "}
        <button type="button" className={styles.inlineLink} onClick={() => setShowSettings(true)}>
          Change
        </button>
      </p>

      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label htmlFor="wallLength">{planPoints.length > 2 ? "Total wall length (m)" : "Wall length (m)"}</label>
          {planPoints.length > 2 ? (
            // with corners, each wall's own length is set in the plan
            <input id="wallLength" type="text" readOnly value={wallLengthM.toFixed(2)} title="Set each wall's length in the plan below" />
          ) : (
            <NumField
              id="wallLength"
              min={0.1}
              step={0.1}
              value={Number(wallLengthM.toFixed(3))}
              onChange={(v) => handlePlanChange(setSegmentLength(planPoints, 0, v))}
            />
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="retainedHeight">Retained height (m)</label>
          <input
            id="retainedHeight"
            type="number"
            min={0.1}
            step={0.1}
            inputMode="decimal"
            value={retainedHeight}
            onChange={(e) => {
              setRetainedHeight(e.target.value)
              resetProfile()
            }}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="soil">Soil type</label>
          <select
            id="soil"
            value={soil}
            onChange={(e) => {
              setSoil(e.target.value as SoilType)
              resetProfile()
            }}
          >
            {SOIL_TYPES.map((s) => (
              <option key={s} value={s}>
                {SOIL_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="rlDatum">RL datum (0 = relative)</label>
          <input
            id="rlDatum"
            type="number"
            step={0.001}
            inputMode="decimal"
            value={rlDatum}
            onChange={(e) => setRlDatum(e.target.value)}
          />
        </div>
      </form>

      <h3 className={styles.overridesHeading}>Posts and holes</h3>
      <p className={styles.overridesHint}>
        Leave a box on Auto to have it worked out post by post from the reference table and each post&apos;s own
        height, or set it to use the same value for every post on the wall.
      </p>
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label htmlFor="postSize">Post size</label>
          <select id="postSize" value={postSizeOverride} onChange={(e) => setPostSizeOverride(e.target.value)}>
            <option value="">Auto — from the table</option>
            {POST_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                All {size}
              </option>
            ))}
            {postSizeOverride && !POST_SIZE_OPTIONS.includes(postSizeOverride) && (
              <option value={postSizeOverride}>All {postSizeOverride}</option>
            )}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="holeDepth">Hole depth (mm)</label>
          <input
            id="holeDepth"
            type="number"
            min={100}
            step={50}
            inputMode="numeric"
            placeholder="Auto — by post height"
            value={holeDepth}
            onChange={(e) => setHoleDepth(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="augerDiameter">Auger size (mm)</label>
          <input
            id="augerDiameter"
            type="number"
            min={50}
            step={25}
            inputMode="numeric"
            list="augerSizes"
            placeholder={`Auto — ${calcSettings.holeDiameterMultiplier} × post`}
            value={augerDiameter}
            onChange={(e) => setAugerDiameter(e.target.value)}
          />
          <datalist id="augerSizes">
            {AUGER_SIZES_MM.map((mm) => (
              <option key={mm} value={mm} />
            ))}
          </datalist>
        </div>
      </form>

      <button type="button" className={styles.referenceLink} onClick={() => setShowReferenceTable(true)}>
        View the reference table this calculator uses →
      </button>

      <ReferenceTableModal
        isOpen={showReferenceTable}
        onClose={() => setShowReferenceTable(false)}
        referenceTable={calcSettings.referenceTable}
        activeRow={referenceRow}
      />
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        activeSettings={calcSettings}
        activeName={calcSettingsName}
        presets={presets}
        onApply={handleApplySettings}
      />

      <div className={styles.diagramCard}>
        <div className={styles.diagramCardHeader}>
          <h3>Plan</h3>
        </div>
        <WallPlanView
          points={planPoints}
          retainedSide={retainedSide}
          profile={profile}
          selectedSegment={shownSegment}
          selectedPostIndex={selectedIndex}
          onChange={handlePlanChange}
          onRetainedSideChange={setRetainedSide}
          onSelectSegment={setElevationView}
        />
      </div>

      {!profile ? (
        <p className={styles.hint}>Enter a wall length and retained height to see a materials estimate.</p>
      ) : (
        <>
          {someBlocked && (
            <div className={styles.engineerWarning}>
              <h2>⚠ {allBlocked ? "This needs a chartered engineer" : "Part of this wall needs a chartered engineer"}</h2>
              <p>
                {allBlocked
                  ? `Every post here retains more than ${ENGINEER_HEIGHT_LIMIT_M.toFixed(1)}m of ground.`
                  : `Post${profile.engineerPostIndices.length > 1 ? "s" : ""} ${profile.engineerPostIndices.map((i) => `#${i + 1}`).join(", ")} ${profile.engineerPostIndices.length > 1 ? "retain" : "retains"} more than ${ENGINEER_HEIGHT_LIMIT_M.toFixed(1)}m.`}{" "}
                Under the New Zealand Building Code, a wall retaining more than {ENGINEER_HEIGHT_LIMIT_M.toFixed(1)}m of
                ground needs specific design by a chartered professional engineer, and almost always a building consent.
                {allBlocked ? " This tool won't generate a materials spec for that height." : " Those posts (shown in red) are excluded from the materials list below — everything else is unaffected."}
              </p>
            </div>
          )}

          <div className={styles.diagramCard}>
            <div className={styles.diagramCardHeader}>
              <h3>
                {shownSegment !== null
                  ? `Elevation — Wall ${segmentLabel(shownSegment)}`
                  : profile.segments.length > 1
                    ? "Elevation — whole wall, unfolded"
                    : "Elevation"}
              </h3>
              <label className={styles.topCapToggle}>
                <input type="checkbox" checked={topCapEnabled} onChange={(e) => setTopCapEnabled(e.target.checked)} />
                <span>Add top cap</span>
              </label>
            </div>
            {profile.segments.length > 1 && (
              <div className={styles.elevationTabs} role="tablist" aria-label="Elevation to view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={shownSegment === null}
                  className={shownSegment === null ? styles.elevationTabActive : styles.elevationTab}
                  onClick={() => setElevationView("all")}
                >
                  All
                </button>
                {profile.segments.map((seg) => (
                  <button
                    key={seg.index}
                    type="button"
                    role="tab"
                    aria-selected={shownSegment === seg.index}
                    className={shownSegment === seg.index ? styles.elevationTabActive : styles.elevationTab}
                    onClick={() => setElevationView(seg.index)}
                  >
                    {segmentLabel(seg.index)} · {seg.lengthM.toFixed(2)} m
                  </button>
                ))}
              </div>
            )}
            <div className={styles.spacingRows}>
              {(shownSegment !== null ? [profile.segments[shownSegment]] : profile.segments).map((seg) => {
                const bays = seg.endPostIndex - seg.startPostIndex
                const tooWide = seg.postSpacingM > seg.tableMaxSpacingM + 1e-6
                const setSpacing = runSpacing[seg.index]?.maxSpacingM
                return (
                  <div key={seg.index} className={styles.spacingRow}>
                    <span className={styles.spacingName}>
                      {profile.segments.length > 1 ? `Wall ${segmentLabel(seg.index)}` : "Posts"}
                    </span>
                    <span className={styles.stepper}>
                      <button
                        type="button"
                        aria-label={`One post fewer${profile.segments.length > 1 ? ` on wall ${segmentLabel(seg.index)}` : ""}`}
                        disabled={bays <= 1}
                        onClick={() => applyRunSpacing(seg.index, { bayCount: bays - 1 })}
                      >
                        −
                      </button>
                      <span>{bays + 1} posts</span>
                      <button
                        type="button"
                        aria-label={`One post more${profile.segments.length > 1 ? ` on wall ${segmentLabel(seg.index)}` : ""}`}
                        onClick={() => applyRunSpacing(seg.index, { bayCount: bays + 1 })}
                      >
                        +
                      </button>
                    </span>
                    <span className={tooWide ? styles.spacingWarn : undefined}>
                      at {Math.round(seg.postSpacingM * 1000)}mm centres
                      {tooWide ? ` ⚠ over the table’s ${Math.round(seg.tableMaxSpacingM * 1000)}mm max` : ""}
                    </span>
                    <label className={styles.spacingField}>
                      Max spacing (mm)
                      <input
                        key={`${seg.index}-${setSpacing ?? "auto"}`}
                        type="number"
                        min={200}
                        step={50}
                        inputMode="numeric"
                        placeholder={`Auto — ${Math.round(seg.tableMaxSpacingM * 1000)}`}
                        defaultValue={setSpacing ? Math.round(setSpacing * 1000) : ""}
                        onBlur={(e) => {
                          const mm = parseFloat(e.target.value)
                          if (mm >= 200) {
                            if (mm / 1000 !== setSpacing) applyRunSpacing(seg.index, { maxSpacingM: mm / 1000 })
                          } else if (setSpacing) applyRunSpacing(seg.index, null)
                          else e.target.value = ""
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur()
                        }}
                      />
                    </label>
                    {seg.spacingOverridden && (
                      <button type="button" className={styles.inlineLink} onClick={() => applyRunSpacing(seg.index, null)}>
                        Clear — back to the table ({seg.tableBayCount + 1} posts)
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <WallProfileDiagram
              profile={profile}
              settings={calcSettings}
              topCapEnabled={topCapEnabled}
              selectedIndex={selectedIndex}
              onSelectPost={setSelectedIndex}
              segmentIndex={shownSegment}
              mirrored={mirrored}
            />
            <p className={styles.viewNote}>
              Seen from the low side, facing the retained ground
              {profile.segments.length > 1 &&
                (shownSegment !== null
                  ? ` — corner to corner along wall ${segmentLabel(shownSegment)}.`
                  : ` — walls ${mirrored ? "run right to left" : "run left to right"} from A, each corner flattened out.`)}
              {profile.segments.length === 1 && "."}
            </p>
          </div>

          {selectedPost && (
            <div className={styles.editPanel} key={selectedPost.index}>
              <h3>Post #{selectedPost.index + 1}</h3>
              <div className={styles.editFields}>
                <div className={styles.field}>
                  <label>Ground level {rlDatumM !== 0 ? "(RL)" : "(m)"}</label>
                  <input
                    ref={groundInputRef}
                    type="number"
                    step={0.001}
                    inputMode="decimal"
                    defaultValue={(rlDatumM + selectedPost.groundLevelM).toFixed(3)}
                  />
                </div>
                <div className={styles.field}>
                  <label>Top of post {rlDatumM !== 0 ? "(RL)" : "(m)"}</label>
                  <input
                    ref={topInputRef}
                    type="number"
                    step={0.001}
                    inputMode="decimal"
                    defaultValue={(rlDatumM + selectedPost.topLevelM).toFixed(3)}
                  />
                </div>
              </div>
              {selectedPost.isCorner && (
                <p className={styles.cornerNote}>
                  Corner post — a facing board can&apos;t run through it, so a joint is forced here. Corners are set
                  in the plan.
                </p>
              )}
              <div className={styles.editActions}>
                <Button size="small" onClick={handleSaveControlPoint}>
                  Save
                </Button>
                {selectedPost.isControlPoint && (
                  <Button size="small" variant="secondary" onClick={handleClearControlPoint}>
                    Reset to raked
                  </Button>
                )}
                <Button size="small" variant="secondary" onClick={() => setSelectedIndex(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {!allBlocked && totals && (
            <>
              {profile.segments.length > 1 && (
                <p className={styles.breakdownNote}>
                  {shownSegment !== null
                    ? `Materials below are for wall ${segmentLabel(shownSegment)} only (posts ${postList(totals.postIndices) || "none"}). A corner post is counted with the wall it finishes, so the walls add up to the whole-wall figures — pick “All” above for those.`
                    : "Materials below are for the whole wall. Pick a wall above (or tap it in the plan) to see just that wall’s share."}
                </p>
              )}
              <div className={styles.resultsGrid}>
                <SpecCard
                  title={`Posts${forWall}`}
                  rows={[
                    ...totals.postsBySize.map((s) => ({ label: s.sizeLabel, value: `${s.count}` })),
                    {
                      label: augerDiameterMm ? "Hole diameter (auger)" : "Hole diameter",
                      value: totals.holeDiametersM.map((d) => `${Math.round(d * 1000)}mm`).join(" / ") || "—",
                    },
                    {
                      label: holeDepthOverrideMm ? "Hole depth (set)" : "Hole depth",
                      value: totals.postIndices.length ? mmRange(totals.minHoleDepthM, totals.maxHoleDepthM) : "—",
                    },
                    { label: "Concrete, net of posts", value: formatM3(totals.totalConcreteVolumeM3) },
                    { label: "Concrete + 10% waste", value: formatM3(totals.totalConcreteVolumeM3 * 1.1) },
                    { label: "Gravel base pads", value: formatM3(totals.totalGravelBaseVolumeM3) },
                    { label: "Total drilled volume", value: formatM3(totals.totalFillVolumeM3) },
                  ]}
                  note={`${totals.augerTooSmall ? "⚠ That auger is too small for at least one post here — the post won't fit down the hole. " : ""}${totals.shallowHolePostIndices.length ? `⚠ The set hole depth is shallower than the reference table gives for post${totals.shallowHolePostIndices.length > 1 ? "s" : ""} ${postList(totals.shallowHolePostIndices)}. ` : ""}${totals.undersizedPostIndices.length ? `⚠ The set post size is smaller than the reference table gives for post${totals.undersizedPostIndices.length > 1 ? "s" : ""} ${postList(totals.undersizedPostIndices)}. ` : ""}Hole depth is from the post's ground level to the bottom of the hole, gravel base pad included. Concrete is each hole above its gravel base pad, less the post’s own volume — the figure to order from, before the 10% allowance for over-dug holes and spillage. Embeds deeper than a simple fence post — it has to resist the retained soil's push over its whole buried length, not just wind load.`}
                />
                <SpecCard
                  title={`Boards${forWall}`}
                  rows={[
                    { label: "Facing boards", value: `${totals.boards.count}` },
                    { label: "Facing — continuous (2-span)", value: `${totals.boards.twoSpanCount}` },
                    { label: "Facing — single-span joint", value: `${totals.boards.oneSpanCount}` },
                    { label: "Top/perimeter board", value: `${totals.topBoard.count}` },
                    { label: "Top board — continuous (2-span)", value: `${totals.topBoard.twoSpanCount}` },
                    { label: "Top board — single-span joint", value: `${totals.topBoard.oneSpanCount}` },
                    ...(totals.topCap
                      ? [
                          { label: "Top cap", value: `${totals.topCap.count}` },
                          { label: "Top cap — continuous (2-span)", value: `${totals.topCap.twoSpanCount}` },
                          { label: "Top cap — single-span joint", value: `${totals.topCap.oneSpanCount}` },
                        ]
                      : []),
                    {
                      label: "Total boards, all layers",
                      value: `${totals.boards.count + totals.topBoard.count + (totals.topCap?.count ?? 0)}`,
                    },
                    {
                      label: "Total length, all layers",
                      value: formatM(totals.boards.totalLengthM + totals.topBoard.totalLengthM + (totals.topCap?.totalLengthM ?? 0)),
                    },
                    { label: "Standard length assumed", value: formatM(calcSettings.standardBoardLengthM, 1) },
                  ]}
                  note="Every layer (facing courses, the top/perimeter board, and the cap if enabled) is planned as real cut pieces: continuous across two post spans wherever it fits, breaking to a single span only where a corner, an excluded bay, or the standard length forces it. Where joints can't be avoided, each row's joints are staggered onto different posts than the row below — see the elevation diagram's join marks."
                />
                <SpecCard
                  title={`Drainage backfill${forWall}`}
                  rows={[{ label: "Volume", value: formatM3(totals.totalBackfillVolumeM3) }]}
                  note={`Compacted free-draining gravel behind the facing boards, ${Math.round(calcSettings.backfillThicknessM * 1000)}mm thick.`}
                />
                <LaborSummary
                  estimate={totals.labor}
                  infillLabel="Backfill placement (drainage gravel)"
                  title={shownSegment !== null ? `Rough labour estimate${forWall}` : undefined}
                  hideSetup={shownSegment !== null}
                />
              </div>
              <p className={styles.disclaimer}>
                Rule-of-thumb estimate for straightforward ground and access — not an engineered design. Ground
                conditions vary a lot in practice; if in doubt, especially near a boundary, driveway, or structure,
                get a professional opinion before you dig.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default RetainingWallEditor

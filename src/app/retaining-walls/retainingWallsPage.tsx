"use client"

import { useEffect, useRef, useState } from "react"
import Button from "@/components/button/button"
import SpecCard from "@/components/structures/specCard"
import LaborSummary from "@/components/structures/laborSummary"
import { formatM, formatM3 } from "@/components/structures/format"
import { SaveIcon, OpenIcon, SettingsIcon } from "@/components/icons/icons"
import WallProfileDiagram from "@/components/retainingWall/wallProfileDiagram"
import WallPlanView from "@/components/retainingWall/wallPlanView"
import NumField from "@/components/weatherboards/numField"
import { buildWallProfile, ControlPoints, CornerPosts, legacyPlan, segmentBayCounts } from "@/components/retainingWall/postProfile"
import {
  PlanPoint,
  RetainedSide,
  segmentLabel,
  segmentLengths,
  setSegmentLength,
  straightPlan,
  totalLength,
} from "@/components/retainingWall/wallPlan"
import { CalcSettings, DEFAULT_CALC_SETTINGS, findReferenceRow } from "@/components/retainingWall/calcSettings"
import { ENGINEER_HEIGHT_LIMIT_M, SOIL_LABELS, SoilType } from "@/components/retainingWall/retainingWallCalc"
import {
  saveDesign,
  SavedCalcSettings,
  SavedWallDesign,
  subscribeToCalcSettingsList,
  subscribeToDesigns,
} from "@/components/retainingWall/retainingWallData"
import ReferenceTableModal from "./referenceTableModal"
import SettingsPanel from "./settingsPanel"
import { OpenDesignModal, SaveDesignModal } from "./designModals"
import styles from "./retainingWallsPage.module.scss"

const SOIL_TYPES = Object.keys(SOIL_LABELS) as SoilType[]
/** common hire/contractor auger diameters, offered as suggestions — any
 * size can still be typed */
const AUGER_SIZES_MM = [200, 250, 300, 350, 400, 450, 500, 600]

const RetainingWallsPage = () => {
  // the wall's shape seen from above: an open run of straight walls (A,
  // B, C…) joined at corners. Total wall length is just this unfolded.
  const [planPoints, setPlanPoints] = useState<PlanPoint[]>(() => straightPlan(5))
  // which side of the wall (walking it from A onward) the ground is held
  // back on — decides which face the elevations are looking at
  const [retainedSide, setRetainedSide] = useState<RetainedSide>("left")
  // which run's elevation is showing, or the whole wall unfolded flat
  const [elevationView, setElevationView] = useState<number | "all">("all")
  const [retainedHeight, setRetainedHeight] = useState("1.0")
  const [soil, setSoil] = useState<SoilType>("firmClay")
  const [rlDatum, setRlDatum] = useState("0")
  // mm, the auger the holes are being drilled with; blank = size each
  // hole off its own post (the calc settings' multiplier) instead
  const [augerDiameter, setAugerDiameter] = useState("")
  const [showReferenceTable, setShowReferenceTable] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [showOpen, setShowOpen] = useState(false)

  const [calcSettings, setCalcSettings] = useState<CalcSettings>(DEFAULT_CALC_SETTINGS)
  const [calcSettingsName, setCalcSettingsName] = useState("Default")
  const [presets, setPresets] = useState<SavedCalcSettings[]>([])
  const [savedDesigns, setSavedDesigns] = useState<SavedWallDesign[]>([])

  // keyed by post index — a post with an entry here is "set by hand"; every
  // other post rakes (linearly interpolates) between whichever of these
  // bracket it. Reset whenever the base inputs (or the active calc
  // settings, which can change post spacing/count) change, since a stale
  // index would silently apply to the wrong physical post otherwise.
  // Reshaping the plan only resets these when it actually changes how
  // many posts a run gets — see handlePlanChange.
  const [controlPoints, setControlPoints] = useState<ControlPoints>({})
  // whole-wall option, not per-post — an extra flat board laid over the
  // top board/post tops for a finished look and to protect end grain
  const [topCapEnabled, setTopCapEnabled] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const groundInputRef = useRef<HTMLInputElement>(null)
  const topInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsubscribe = subscribeToCalcSettingsList(setPresets, () => {})
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToDesigns(setSavedDesigns, () => {})
    return () => unsubscribe()
  }, [])

  const wallLengthM = totalLength(planPoints)
  const segmentLengthsM = segmentLengths(planPoints)
  const retainedHeightM = parseFloat(retainedHeight)
  const rlDatumM = parseFloat(rlDatum) || 0
  const augerDiameterParsed = parseFloat(augerDiameter)
  const augerDiameterMm = augerDiameterParsed > 0 ? augerDiameterParsed : null

  const resetProfile = () => {
    setControlPoints({})
    setSelectedIndex(null)
  }

  const profile = !isNaN(retainedHeightM)
    ? buildWallProfile(segmentLengthsM, retainedHeightM, soil, controlPoints, topCapEnabled, rlDatumM, calcSettings, augerDiameterMm ? augerDiameterMm / 1000 : null)
    : null

  // a run that no longer exists (corner removed, design swapped) falls
  // back to the whole-wall view rather than pointing at nothing
  const shownSegment = elevationView !== "all" && profile && elevationView < profile.segments.length ? elevationView : null
  // looking at the wall's face from the low side: with the ground held
  // back on the left of travel, A's start is on the viewer's left;
  // retained on the right, the viewer is round the other side and the
  // whole thing reads right-to-left
  const mirrored = retainedSide === "right"

  const handlePlanChange = (next: PlanPoint[]) => {
    const before = segmentBayCounts(segmentLengthsM, retainedHeightM, soil, calcSettings)
    const after = segmentBayCounts(segmentLengths(next), retainedHeightM, soil, calcSettings)
    // hand-set levels are keyed by post index, so they only survive a
    // reshape that leaves every run with the same number of posts
    if (before.join(",") !== after.join(",")) resetProfile()
    setPlanPoints(next)
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

  const handleSaveDesignSubmit = async (name: string) => {
    if (!profile) return
    // still written for anything reading designs the pre-plan way; the
    // plan itself is what this page rebuilds corners from
    const cornerPosts: CornerPosts = {}
    for (const p of profile.posts) if (p.isCorner) cornerPosts[p.index] = true
    await saveDesign(name, {
      wallLengthM: Math.round(wallLengthM * 1000) / 1000,
      retainedHeightM,
      soil,
      rlDatumM,
      controlPoints,
      cornerPosts,
      planPoints,
      retainedSide,
      augerDiameterMm,
      topCapEnabled,
      calcSettings,
    })
  }

  const handleOpenDesign = (design: SavedWallDesign) => {
    setPlanPoints(
      design.planPoints ?? legacyPlan(design.wallLengthM, design.retainedHeightM, design.soil, design.cornerPosts, design.calcSettings)
    )
    setRetainedSide(design.retainedSide)
    setAugerDiameter(design.augerDiameterMm ? String(design.augerDiameterMm) : "")
    setElevationView("all")
    setRetainedHeight(String(design.retainedHeightM))
    setSoil(design.soil)
    setRlDatum(String(design.rlDatumM))
    setCalcSettings(design.calcSettings)
    setCalcSettingsName(`From "${design.name}"`)
    setControlPoints(design.controlPoints)
    setTopCapEnabled(design.topCapEnabled)
    setSelectedIndex(null)
  }

  return (
    <div className={styles.retainingWallsPage}>
      <div className={styles.headerRow}>
        <div>
          <h1>Retaining Wall Calculator</h1>
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
          <Button size="icon" variant="secondary" onClick={() => setShowSave(true)} ariaLabel="Save this wall">
            <SaveIcon />
          </Button>
          <Button size="icon" variant="secondary" onClick={() => setShowOpen(true)} ariaLabel="Open a saved wall">
            <OpenIcon />
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
        <div className={styles.field}>
          <label htmlFor="augerDiameter">Auger size (mm)</label>
          <input
            id="augerDiameter"
            type="number"
            min={50}
            step={25}
            inputMode="numeric"
            list="augerSizes"
            placeholder={`Auto — ${calcSettings.holeDiameterMultiplier} × post width`}
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
      <SaveDesignModal isOpen={showSave} onClose={() => setShowSave(false)} onSave={handleSaveDesignSubmit} />
      <OpenDesignModal isOpen={showOpen} onClose={() => setShowOpen(false)} designs={savedDesigns} onOpen={handleOpenDesign} />

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

          {!allBlocked && (
            <>
              <div className={styles.resultsGrid}>
                <SpecCard
                  title="Posts"
                  rows={[
                    ...profile.postsBySize.map((s) => ({ label: s.sizeLabel, value: `${s.count}` })),
                    {
                      label: augerDiameterMm ? "Hole diameter (auger)" : "Hole diameter",
                      value: profile.holeDiametersM.map((d) => `${Math.round(d * 1000)}mm`).join(" / "),
                    },
                    { label: "Concrete, net of posts", value: formatM3(profile.totalConcreteVolumeM3) },
                    { label: "Concrete + 10% waste", value: formatM3(profile.totalConcreteVolumeM3 * 1.1) },
                    { label: "Gravel base pads", value: formatM3(profile.totalGravelBaseVolumeM3) },
                    { label: "Total drilled volume", value: formatM3(profile.totalFillVolumeM3) },
                  ]}
                  note={`${profile.augerTooSmall ? "⚠ That auger is too small for at least one post here — the post won't fit down the hole. " : ""}Concrete is each hole above its gravel base pad, less the post’s own volume — the figure to order from, before the 10% allowance for over-dug holes and spillage. Embeds deeper than a simple fence post — it has to resist the retained soil's push over its whole buried length, not just wind load.`}
                />
                <SpecCard
                  title="Boards"
                  rows={[
                    { label: "Facing boards", value: `${profile.boards.count}` },
                    { label: "Facing — continuous (2-span)", value: `${profile.boards.twoSpanCount}` },
                    { label: "Facing — single-span joint", value: `${profile.boards.oneSpanCount}` },
                    { label: "Top/perimeter board", value: `${profile.topBoard.count}` },
                    { label: "Top board — continuous (2-span)", value: `${profile.topBoard.twoSpanCount}` },
                    { label: "Top board — single-span joint", value: `${profile.topBoard.oneSpanCount}` },
                    ...(profile.topCap
                      ? [
                          { label: "Top cap", value: `${profile.topCap.count}` },
                          { label: "Top cap — continuous (2-span)", value: `${profile.topCap.twoSpanCount}` },
                          { label: "Top cap — single-span joint", value: `${profile.topCap.oneSpanCount}` },
                        ]
                      : []),
                    {
                      label: "Total boards, all layers",
                      value: `${profile.boards.count + profile.topBoard.count + (profile.topCap?.count ?? 0)}`,
                    },
                    {
                      label: "Total length, all layers",
                      value: formatM(profile.boards.totalLengthM + profile.topBoard.totalLengthM + (profile.topCap?.totalLengthM ?? 0)),
                    },
                    { label: "Standard length assumed", value: formatM(calcSettings.standardBoardLengthM, 1) },
                  ]}
                  note="Every layer (facing courses, the top/perimeter board, and the cap if enabled) is planned as real cut pieces: continuous across two post spans wherever it fits, breaking to a single span only where a corner, an excluded bay, or the standard length forces it. Where joints can't be avoided, each row's joints are staggered onto different posts than the row below — see the elevation diagram's join marks."
                />
                <SpecCard
                  title="Drainage backfill"
                  rows={[{ label: "Volume", value: formatM3(profile.totalBackfillVolumeM3) }]}
                  note="Compacted free-draining gravel behind the facing boards, roughly 150mm thick."
                />
                <LaborSummary estimate={profile.labor} infillLabel="Backfill placement (drainage gravel)" />
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

export default RetainingWallsPage

"use client"

import { useEffect, useRef, useState } from "react"
import Button from "@/components/button/button"
import SpecCard from "@/components/structures/specCard"
import LaborSummary from "@/components/structures/laborSummary"
import { formatM, formatM3 } from "@/components/structures/format"
import { SaveIcon, OpenIcon, SettingsIcon } from "@/components/icons/icons"
import WallProfileDiagram from "@/components/retainingWall/wallProfileDiagram"
import { buildWallProfile, ControlPoints, CornerPosts } from "@/components/retainingWall/postProfile"
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

const RetainingWallsPage = () => {
  const [wallLength, setWallLength] = useState("5")
  const [retainedHeight, setRetainedHeight] = useState("1.0")
  const [soil, setSoil] = useState<SoilType>("firmClay")
  const [rlDatum, setRlDatum] = useState("0")
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
  const [controlPoints, setControlPoints] = useState<ControlPoints>({})
  // keyed by post index — presence marks that post as a corner, where a
  // board can't physically run through, forcing a joint there regardless
  // of what the standard-length/2-span piece planning would otherwise do.
  // Reset alongside controlPoints, same staleness reasoning.
  const [cornerPosts, setCornerPosts] = useState<CornerPosts>({})
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

  const wallLengthM = parseFloat(wallLength)
  const retainedHeightM = parseFloat(retainedHeight)
  const rlDatumM = parseFloat(rlDatum) || 0

  const resetProfile = () => {
    setControlPoints({})
    setCornerPosts({})
    setSelectedIndex(null)
  }

  const profile =
    !isNaN(wallLengthM) && !isNaN(retainedHeightM)
      ? buildWallProfile(wallLengthM, retainedHeightM, soil, controlPoints, cornerPosts, rlDatumM, calcSettings)
      : null

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

  const handleToggleCorner = () => {
    if (selectedIndex === null) return
    setCornerPosts((cp) => {
      const next = { ...cp }
      if (next[selectedIndex]) delete next[selectedIndex]
      else next[selectedIndex] = true
      return next
    })
  }

  const handleApplySettings = (settings: CalcSettings, name: string) => {
    setCalcSettings(settings)
    setCalcSettingsName(name)
    resetProfile()
  }

  const handleSaveDesignSubmit = async (name: string) => {
    if (isNaN(wallLengthM) || isNaN(retainedHeightM)) return
    await saveDesign(name, {
      wallLengthM,
      retainedHeightM,
      soil,
      rlDatumM,
      controlPoints,
      cornerPosts,
      calcSettings,
    })
  }

  const handleOpenDesign = (design: SavedWallDesign) => {
    setWallLength(String(design.wallLengthM))
    setRetainedHeight(String(design.retainedHeightM))
    setSoil(design.soil)
    setRlDatum(String(design.rlDatumM))
    setCalcSettings(design.calcSettings)
    setCalcSettingsName(`From "${design.name}"`)
    setControlPoints(design.controlPoints)
    setCornerPosts(design.cornerPosts)
    setSelectedIndex(null)
  }

  return (
    <div className={styles.retainingWallsPage}>
      <div className={styles.headerRow}>
        <div>
          <h1>Retaining Wall Calculator</h1>
          <p className={styles.intro}>
            A rough DIY materials and labour estimate for a straightforward timber post-and-board
            retaining wall. Enter your wall length, retained height, and ground conditions to start
            — then tap any post in the diagram to set its own ground level and top level by hand;
            posts in between rake (slope evenly) between whichever posts you&apos;ve set.
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
          <label htmlFor="wallLength">Wall length (m)</label>
          <input
            id="wallLength"
            type="number"
            min={0.1}
            step={0.1}
            inputMode="decimal"
            value={wallLength}
            onChange={(e) => {
              setWallLength(e.target.value)
              resetProfile()
            }}
          />
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
            <h3>Elevation</h3>
            <WallProfileDiagram
              profile={profile}
              settings={calcSettings}
              selectedIndex={selectedIndex}
              onSelectPost={setSelectedIndex}
            />
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
              <label className={styles.cornerToggle}>
                <input type="checkbox" checked={selectedPost.isCorner} onChange={handleToggleCorner} />
                <span>Corner post — a facing board can&apos;t run through it, so a joint is forced here</span>
              </label>
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
                    { label: "Total fill (concrete/gravel)", value: formatM3(profile.totalFillVolumeM3) },
                  ]}
                  note="Embeds deeper than a simple fence post — it has to resist the retained soil's push over its whole buried length, not just wind load."
                />
                <SpecCard
                  title="Facing boards"
                  rows={[
                    { label: "Boards needed", value: `${profile.totalBoardCount}` },
                    { label: "— continuous over 2 spans", value: `${profile.twoSpanBoardCount}` },
                    { label: "— single-span (joint each side)", value: `${profile.oneSpanBoardCount}` },
                    { label: "Total length", value: formatM(profile.totalBoardLengthM) },
                    { label: "Standard length assumed", value: formatM(calcSettings.standardBoardLengthM, 1) },
                  ]}
                  note="Each course is planned as real cut pieces: a board runs continuously across two post spans wherever it fits and isn't blocked by a corner post, falling back to a single span otherwise — fewer joints, stronger wall."
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

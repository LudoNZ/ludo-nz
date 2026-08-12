"use client"

import { useRef, useState } from "react"
import Button from "@/components/button/button"
import SpecCard from "@/components/structures/specCard"
import LaborSummary from "@/components/structures/laborSummary"
import { formatM, formatM3 } from "@/components/structures/format"
import WallProfileDiagram from "@/components/retainingWall/wallProfileDiagram"
import { buildWallProfile, ControlPoints } from "@/components/retainingWall/postProfile"
import {
  ENGINEER_HEIGHT_LIMIT_M,
  findReferenceRow,
  SOIL_LABELS,
  SoilType,
  STANDARD_BOARD_LENGTH_M,
} from "@/components/retainingWall/retainingWallCalc"
import ReferenceTableModal from "./referenceTableModal"
import styles from "./retainingWallsPage.module.scss"

const SOIL_TYPES = Object.keys(SOIL_LABELS) as SoilType[]

const RetainingWallsPage = () => {
  const [wallLength, setWallLength] = useState("5")
  const [retainedHeight, setRetainedHeight] = useState("1.0")
  const [soil, setSoil] = useState<SoilType>("firmClay")
  const [rlDatum, setRlDatum] = useState("0")
  const [showReferenceTable, setShowReferenceTable] = useState(false)
  // keyed by post index — a post with an entry here is "set by hand"; every
  // other post rakes (linearly interpolates) between whichever of these
  // bracket it. Reset whenever the base inputs change, since a different
  // wall length/height/soil can shift post count/positions entirely, and a
  // stale index would silently apply to the wrong physical post otherwise.
  const [controlPoints, setControlPoints] = useState<ControlPoints>({})
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const groundInputRef = useRef<HTMLInputElement>(null)
  const topInputRef = useRef<HTMLInputElement>(null)

  const wallLengthM = parseFloat(wallLength)
  const retainedHeightM = parseFloat(retainedHeight)
  const rlDatumM = parseFloat(rlDatum) || 0

  const resetProfile = () => {
    setControlPoints({})
    setSelectedIndex(null)
  }

  const profile =
    !isNaN(wallLengthM) && !isNaN(retainedHeightM)
      ? buildWallProfile(wallLengthM, retainedHeightM, soil, controlPoints, rlDatumM)
      : null

  const selectedPost = profile && selectedIndex !== null ? profile.posts[selectedIndex] : null
  const allBlocked = profile ? profile.posts.length === profile.engineerPostIndices.length : false
  const someBlocked = profile ? profile.engineerPostIndices.length > 0 : false

  const referenceRow = profile
    ? findReferenceRow(Math.min(Math.max(...profile.posts.map((p) => p.retainedHeightM)), ENGINEER_HEIGHT_LIMIT_M), soil)
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

  return (
    <div className={styles.retainingWallsPage}>
      <h1>Retaining Wall Calculator</h1>
      <p className={styles.intro}>
        A rough DIY materials and labour estimate for a straightforward timber post-and-board
        retaining wall. Enter your wall length, retained height, and ground conditions to start —
        then tap any post in the diagram to set its own ground level and top level by hand; posts
        in between rake (slope evenly) between whichever posts you&apos;ve set.
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

      <ReferenceTableModal isOpen={showReferenceTable} onClose={() => setShowReferenceTable(false)} activeRow={referenceRow} />

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
            <WallProfileDiagram profile={profile} selectedIndex={selectedIndex} onSelectPost={setSelectedIndex} />
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
                    { label: "Total length", value: formatM(profile.totalBoardLengthM) },
                    { label: "Standard length assumed", value: formatM(STANDARD_BOARD_LENGTH_M, 1) },
                  ]}
                  note="Assumes simple butt joints at whole-board lengths, and each bay's own local height — not an optimised cutting plan."
                />
                <SpecCard
                  title="Drainage backfill"
                  rows={[{ label: "Volume", value: formatM3(profile.totalBackfillVolumeM3) }]}
                  note="Compacted free-draining gravel behind the facing boards, roughly 150mm thick."
                />
                <LaborSummary estimate={profile.labor} />
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

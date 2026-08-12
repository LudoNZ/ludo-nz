"use client"

import { useState } from "react"
import PostsSummary from "@/components/structures/postsSummary"
import RailsSummary from "@/components/structures/railsSummary"
import InfillSummary from "@/components/structures/infillSummary"
import LaborSummary from "@/components/structures/laborSummary"
import PostElevationDiagram from "@/components/structures/postElevationDiagram"
import {
  calcRetainingWall,
  ENGINEER_HEIGHT_LIMIT_M,
  SOIL_LABELS,
  SoilType,
} from "@/components/retainingWall/retainingWallCalc"
import ReferenceTableModal from "./referenceTableModal"
import styles from "./retainingWallsPage.module.scss"

const SOIL_TYPES = Object.keys(SOIL_LABELS) as SoilType[]

const RetainingWallsPage = () => {
  const [wallLength, setWallLength] = useState("5")
  const [retainedHeight, setRetainedHeight] = useState("1.0")
  const [soil, setSoil] = useState<SoilType>("firmClay")
  const [showReferenceTable, setShowReferenceTable] = useState(false)

  const wallLengthM = parseFloat(wallLength)
  const retainedHeightM = parseFloat(retainedHeight)
  const heightEntered = !isNaN(retainedHeightM) && retainedHeightM > 0
  const needsEngineer = heightEntered && retainedHeightM > ENGINEER_HEIGHT_LIMIT_M

  const result =
    !needsEngineer && !isNaN(wallLengthM) && heightEntered ? calcRetainingWall(wallLengthM, retainedHeightM, soil) : null

  return (
    <div className={styles.retainingWallsPage}>
      <h1>Retaining Wall Calculator</h1>
      <p className={styles.intro}>
        A rough DIY materials and labour estimate for a straightforward timber post-and-board
        retaining wall. Enter your wall length, the height of ground you&apos;re retaining, and
        the ground conditions.
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
            onChange={(e) => setWallLength(e.target.value)}
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
            onChange={(e) => setRetainedHeight(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="soil">Soil type</label>
          <select id="soil" value={soil} onChange={(e) => setSoil(e.target.value as SoilType)}>
            {SOIL_TYPES.map((s) => (
              <option key={s} value={s}>
                {SOIL_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </form>

      <button type="button" className={styles.referenceLink} onClick={() => setShowReferenceTable(true)}>
        View the reference table this calculator uses →
      </button>

      <ReferenceTableModal
        isOpen={showReferenceTable}
        onClose={() => setShowReferenceTable(false)}
        activeRow={result?.referenceRow ?? null}
      />

      {needsEngineer ? (
        <div className={styles.engineerWarning}>
          <h2>⚠ This needs a chartered engineer</h2>
          <p>
            A retained height over {ENGINEER_HEIGHT_LIMIT_M.toFixed(1)}m falls outside what this
            calculator (or a standard DIY build) covers. Under the New Zealand Building Code, a
            wall retaining more than {ENGINEER_HEIGHT_LIMIT_M.toFixed(1)}m of ground needs
            specific design by a chartered professional engineer, and almost always a building
            consent. This tool won&apos;t generate a materials spec for that height — the loads
            involved are enough that a rule-of-thumb estimate isn&apos;t a safe basis to build
            from.
          </p>
        </div>
      ) : result ? (
        <>
          <div className={styles.diagramCard}>
            <PostElevationDiagram posts={result.posts} rails={result.rails} />
          </div>
          <div className={styles.resultsGrid}>
            <PostsSummary
              spec={result.posts}
              note="Embeds deeper than a simple fence post — it has to resist the retained soil's push over its whole buried length, not just wind load. See the reference table for other soil/height bands."
            />
            <RailsSummary spec={result.rails} />
            <InfillSummary spec={result.infill} />
            <LaborSummary estimate={result.labor} />
          </div>
          <p className={styles.disclaimer}>
            Rule-of-thumb estimate for straightforward ground and access — not an engineered
            design. Ground conditions vary a lot in practice; if in doubt, especially near a
            boundary, driveway, or structure, get a professional opinion before you dig.
          </p>
        </>
      ) : (
        <p className={styles.hint}>Enter a wall length and retained height to see a materials estimate.</p>
      )}
    </div>
  )
}

export default RetainingWallsPage

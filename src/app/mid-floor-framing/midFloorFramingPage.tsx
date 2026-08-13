"use client"

import { useState } from "react"
import SpecCard from "@/components/structures/specCard"
import { formatM } from "@/components/structures/format"
import FloorPlanDiagram from "@/components/midFloorFraming/floorPlanDiagram"
import { buildFloorSpec } from "@/components/midFloorFraming/floorSpec"
import { DEFAULT_FLOOR_SETTINGS, findJoistRow, SUPPORT_METHOD_LABELS, SupportMethod } from "@/components/midFloorFraming/floorSettings"
import JoistReferenceTableModal from "./joistReferenceTableModal"
import styles from "./midFloorFramingPage.module.scss"

const SPACING_OPTIONS = [400, 450, 600]

const MidFloorFramingPage = () => {
  const [span, setSpan] = useState("3.2")
  const [width, setWidth] = useState("4.0")
  const [spacingMm, setSpacingMm] = useState(450)
  const [supportMethod, setSupportMethod] = useState<SupportMethod>("onTop")
  const [showReferenceTable, setShowReferenceTable] = useState(false)

  const settings = DEFAULT_FLOOR_SETTINGS
  const spanM = parseFloat(span)
  const widthM = parseFloat(width)

  const spec = !isNaN(spanM) && !isNaN(widthM) ? buildFloorSpec(spanM, widthM, spacingMm, supportMethod, settings) : null
  const activeRow = spec ? findJoistRow(settings, spacingMm, spanM) : null

  return (
    <div className={styles.midFloorFramingPage}>
      <h1>Mid-Floor Framing Calculator</h1>
      <p className={styles.intro}>
        A rule-of-thumb DIY materials and labour estimate for a single-span timber mid-floor —
        joist size, spacing, hangers or skew-nail fixings, blocking, and flooring sheets. Enter the
        span between your two support lines (walls or bearers) and the floor&apos;s width.
      </p>

      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <div className={styles.field}>
          <label htmlFor="span">Span (m)</label>
          <span className={styles.hint}>Distance between the two support lines</span>
          <input id="span" type="number" min={0.1} step={0.1} inputMode="decimal" value={span} onChange={(e) => setSpan(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="width">Floor width (m)</label>
          <span className={styles.hint}>Across the support lines, sets the joist count</span>
          <input id="width" type="number" min={0.1} step={0.1} inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor="spacing">Joist spacing</label>
          <select id="spacing" value={spacingMm} onChange={(e) => setSpacingMm(Number(e.target.value))}>
            {SPACING_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}mm centres
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="supportMethod">Support method</label>
          <select id="supportMethod" value={supportMethod} onChange={(e) => setSupportMethod(e.target.value as SupportMethod)}>
            {(Object.keys(SUPPORT_METHOD_LABELS) as SupportMethod[]).map((m) => (
              <option key={m} value={m}>
                {SUPPORT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </form>

      <button type="button" className={styles.referenceLink} onClick={() => setShowReferenceTable(true)}>
        View the reference table this calculator uses →
      </button>
      <JoistReferenceTableModal
        isOpen={showReferenceTable}
        onClose={() => setShowReferenceTable(false)}
        referenceTable={settings.referenceTable}
        activeRow={activeRow}
      />

      {!spec ? (
        <p className={styles.hint}>Enter a span and floor width to see a materials estimate.</p>
      ) : spec.needsEngineer ? (
        <div className={styles.engineerWarning}>
          <h2>⚠ Outside this tool&apos;s reference table</h2>
          <p>
            A {formatM(spec.spanM, 1)} span at {spec.spacingMm}mm centres is beyond every joist size
            in this calculator&apos;s table. That doesn&apos;t mean it can&apos;t be done — a deeper
            joist, engineered timber (LVL), closer spacing, or an intermediate bearer to break the
            span in two could all work — but it&apos;s past what a rule-of-thumb tool like this
            should be specifying. Check the full NZS 3604 span tables or get a design from an
            engineer.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.diagramCard}>
            <h3>Plan</h3>
            <FloorPlanDiagram spec={spec} settings={settings} />
          </div>

          <div className={styles.resultsGrid}>
            <SpecCard
              title="Joists"
              rows={[
                { label: "Size", value: spec.sizeLabel ?? "—" },
                { label: "Count", value: `${spec.joistCount}` },
                { label: "Actual spacing", value: `${Math.round(spec.actualSpacingM * 1000)}mm` },
                { label: "Length each", value: formatM(spec.spanM) },
                { label: "Standard length assumed", value: formatM(settings.standardJoistLengthM, 1) },
              ]}
              note={
                spec.lengthExceedsStock
                  ? "This span is longer than the assumed standard stock length — you'll need a special-order length, not an off-the-shelf one."
                  : "One stock length per joist, cut to span — not spliced from offcuts the way facing boards are."
              }
            />
            <SpecCard
              title={spec.supportMethod === "hangers" ? "Joist hangers" : "Skew-nail fixings"}
              rows={
                spec.supportMethod === "hangers"
                  ? [
                      { label: "Hangers needed", value: `${spec.hangerCount}` },
                      { label: "Fixings (nails)", value: `${spec.hangerFixingCount}` },
                    ]
                  : [{ label: "Fixings (nails)", value: `${spec.skewNailFixingCount}` }]
              }
              note={
                spec.supportMethod === "hangers"
                  ? "One hanger each end of every joist."
                  : "Two nails skew-nailed at each end of every joist, into the top plate or bearer below."
              }
            />
            <SpecCard
              title="Blocking"
              rows={[
                { label: "Rows", value: `${spec.blockingRowCount}` },
                { label: "Pieces", value: `${spec.blockingPieceCount}` },
                { label: "Fixings (nails)", value: `${spec.blockingFixingCount}` },
              ]}
              note="Solid blocking between joists so they can't roll under load — more rows as the span grows."
            />
            <SpecCard
              title="Flooring"
              rows={[
                { label: "Area", value: `${spec.flooringAreaM2.toFixed(1)} m²` },
                { label: "Sheets", value: `${spec.flooringSheetCount}` },
                {
                  label: "Sheet size assumed",
                  value: `${formatM(settings.flooringSheetLengthM, 1)} × ${formatM(settings.flooringSheetWidthM, 1)}`,
                },
                { label: "Fixings (screws)", value: `${spec.flooringFixingCount}` },
              ]}
              note="Includes an allowance for trimming and laps — not a literal sheet-by-sheet cutting plan."
            />
            <SpecCard
              title="Labour"
              rows={[
                { label: "Setup", value: `${spec.labor.setupHours.toFixed(1)} hr` },
                { label: "Joists", value: `${spec.labor.joistHours.toFixed(1)} hr` },
                ...(spec.supportMethod === "hangers" ? [{ label: "Hangers", value: `${spec.labor.hangerHours.toFixed(1)} hr` }] : []),
                { label: "Blocking", value: `${spec.labor.blockingHours.toFixed(1)} hr` },
                { label: "Flooring", value: `${spec.labor.flooringHours.toFixed(1)} hr` },
                { label: "Total", value: `${spec.labor.totalHours.toFixed(1)} hr` },
              ]}
            />
          </div>
          <p className={styles.disclaimer}>
            Rule-of-thumb estimate for a straightforward single-span floor — not an engineered
            design. Actual joist sizing depends on grade, load width, and floor loading; if in
            doubt, check the full NZS 3604 span tables or get a professional opinion before you
            build.
          </p>
        </>
      )}
    </div>
  )
}

export default MidFloorFramingPage

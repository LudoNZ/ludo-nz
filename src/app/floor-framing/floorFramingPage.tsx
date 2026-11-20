"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import DraftNumberInput from "@/app/stairs/draftNumberInput"
import FrameForm from "@/components/floorFraming/frameForm"
import FramePlanView from "@/components/floorFraming/framePlanView"
import FrameSpecCards from "@/components/floorFraming/frameSpecCards"
import FrameRenderView from "@/components/floorFraming/frameRenderView"
import ReferenceTableModal from "@/components/floorFraming/referenceTableModal"
import { rectangleOutline } from "@/components/floorFraming/frame"
import { FloorInput, floorFrame } from "@/components/floorFraming/floorData"
import { frameOrder } from "@/components/floorFraming/frameOrder"
import { combineOrder } from "@/components/stairs/stairMaterials"
import StairOrderCard from "@/components/stairs/stairOrderCard"
import styles from "./floorFramingPage.module.scss"

/** The Floor Framing calculator on one floor: its size and frame, a plan
 * of every member and sheet, the results, a 3D view and a live material
 * order. `value`/`onChange` hold the floor (saved by whoever owns it);
 * `header` replaces the page's own title. */
const FloorFramingPage: React.FC<{ value: FloorInput; onChange: (next: FloorInput) => void; header?: React.ReactNode }> = ({ value, onChange, header }) => {
  const [showTables, setShowTables] = useState(false)
  const frame = useMemo(() => floorFrame(value), [value])
  const outline = useMemo(() => rectangleOutline(value.lengthMm, value.widthMm), [value.lengthMm, value.widthMm])
  const order = useMemo(() => combineOrder(frameOrder(frame).map((line) => ({ line, from: "" }))), [frame])
  const renderInput = useMemo(() => ({ frame }), [frame])
  const walls = value.frame.support === "walls"

  return (
    <div className={styles.floorFramingPage}>
      {header ?? <h1>Floor Framing Calculator</h1>}
      <p className={styles.intro}>
        A rule-of-thumb materials and labour estimate for a timber floor under ply or particleboard: between two walls (a
        mid-floor), or on bearers and piles (a ground floor), or off a ledger on the house. Joist and bearer sizes, piles,
        blocking and nogs, every sheet laid, and the order. Framing a deck? That&apos;s on each deck in the{" "}
        <Link href="/decking">decking calculator</Link>.
      </p>

      <FrameForm value={value.frame} onChange={(frame) => onChange({ ...value, frame })} mode="floor">
        <div className={styles.field}>
          <label htmlFor="floor-length">{walls ? "Span (m)" : "Length along the joists (m)"}</label>
          <span className={styles.hint}>{walls ? "Between the two walls or beams" : "Which way the joists run"}</span>
          <DraftNumberInput id="floor-length" min={0.3} max={30} step={0.1} value={value.lengthMm / 1000} onValue={(v) => onChange({ ...value, lengthMm: Math.round(v * 1000) })} />
        </div>
        <div className={styles.field}>
          <label htmlFor="floor-width">Width (m)</label>
          <span className={styles.hint}>Across the joists, sets how many</span>
          <DraftNumberInput id="floor-width" min={0.3} max={30} step={0.1} value={value.widthMm / 1000} onValue={(v) => onChange({ ...value, widthMm: Math.round(v * 1000) })} />
        </div>
      </FrameForm>

      <button type="button" className={styles.referenceLink} onClick={() => setShowTables(true)}>
        View the reference tables this calculator uses →
      </button>
      <ReferenceTableModal isOpen={showTables} onClose={() => setShowTables(false)} frame={frame} />

      {frame.needsEngineer ? (
        <div className={styles.engineerWarning}>
          <h2>⚠ Outside this tool&apos;s reference tables</h2>
          <p>
            {frame.needsEngineer} That doesn&apos;t mean it can&apos;t be done — a deeper joist, engineered timber (LVL), closer
            spacing, or a bearer to break the span could all work — but it&apos;s past what a rule-of-thumb tool should be
            specifying. Check the full NZS 3604 tables or get a design from an engineer.
          </p>
        </div>
      ) : (
        <>
          {frame.warnings.length > 0 && (
            <ul className={styles.warnings}>
              {frame.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
          <div className={styles.diagramCard}>
            <h3>Plan</h3>
            <FramePlanView frame={frame} outline={outline} />
          </div>

          <div className={styles.resultsGrid}>
            <FrameSpecCards frame={frame} />
          </div>

          <div className={styles.diagramCard}>
            <h3>3D view</h3>
            <FrameRenderView input={renderInput} fileName="floor-frame" />
          </div>

          <StairOrderCard
            lines={order}
            intro="Everything to buy for the frame and flooring. Framing timber is planned from the cut pieces — joists, rims, blocking and nogs share lengths."
            pins={value.frame.orderPins}
            onPinsChange={(orderPins) => onChange({ ...value, frame: { ...value.frame, orderPins } })}
          />

          <p className={styles.disclaimer}>
            Rule-of-thumb estimate — not an engineered design. Actual sizing depends on grade, load and site; if in doubt,
            check the full NZS 3604 tables or get a professional opinion before you build.
          </p>
        </>
      )}
    </div>
  )
}

export default FloorFramingPage

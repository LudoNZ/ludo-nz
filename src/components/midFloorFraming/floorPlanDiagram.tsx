"use client"

import { useMemo } from "react"
import { FloorSpec } from "./floorSpec"
import { FloorSettings } from "./floorSettings"
import styles from "./floorPlanDiagram.module.scss"

const JOIST_THICKNESS_M = 0.045

/** Top-down plan of a single-span mid-floor: joists running the full span,
 * evenly spaced across the width, hanger marks at both ends when hung,
 * blocking rows crossing every joist, and a faint flooring-sheet grid
 * overlay — schematic, not a literal cutting layout the way the decking
 * calculator's diagram is (no attempt to plan actual sheet joins/offsets,
 * just "this is roughly how many sheets and where the lines fall"). */
const FloorPlanDiagram: React.FC<{ spec: FloorSpec; settings: FloorSettings }> = ({ spec, settings }) => {
  const geometry = useMemo(() => {
    const scale = Math.max(spec.spanM, spec.widthM, 1)
    const fontSize = scale * 0.045
    const strokeW = scale * 0.006
    const pad = fontSize * 3
    const vbW = spec.widthM + pad * 2
    const vbH = spec.spanM + pad * 2
    return { fontSize, strokeW, pad, viewBox: `${-pad} ${-pad} ${vbW} ${vbH}` }
  }, [spec.spanM, spec.widthM])

  const { fontSize, strokeW, viewBox } = geometry

  const joistXs = Array.from({ length: spec.joistCount }, (_, i) => i * spec.actualSpacingM)
  const blockingYs = Array.from({ length: spec.blockingRowCount }, (_, i) => (spec.spanM * (i + 1)) / (spec.blockingRowCount + 1))

  const sheetCols = Math.max(1, Math.ceil(spec.widthM / settings.flooringSheetWidthM))
  const sheetRows = Math.max(1, Math.ceil(spec.spanM / settings.flooringSheetLengthM))

  return (
    <div className={styles.diagramRoot}>
      <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Floor framing plan, to scale">
        {/* floor outline */}
        <rect x={0} y={0} width={spec.widthM} height={spec.spanM} className={styles.floorOutline} strokeWidth={strokeW * 0.6} />

        {/* flooring sheet grid — schematic only, not a real cutting layout */}
        {Array.from({ length: sheetCols + 1 }, (_, i) => i * settings.flooringSheetWidthM)
          .filter((x) => x > 0 && x < spec.widthM)
          .map((x) => (
            <line key={`sv-${x}`} x1={x} y1={0} x2={x} y2={spec.spanM} className={styles.sheetLine} strokeWidth={strokeW * 0.25} />
          ))}
        {Array.from({ length: sheetRows + 1 }, (_, i) => i * settings.flooringSheetLengthM)
          .filter((y) => y > 0 && y < spec.spanM)
          .map((y) => (
            <line key={`sh-${y}`} x1={0} y1={y} x2={spec.widthM} y2={y} className={styles.sheetLine} strokeWidth={strokeW * 0.25} />
          ))}

        {/* joists, full span length, evenly spaced across the width */}
        {joistXs.map((x) => (
          <rect
            key={`joist-${x}`}
            x={x - JOIST_THICKNESS_M / 2}
            y={0}
            width={JOIST_THICKNESS_M}
            height={spec.spanM}
            className={styles.joist}
            strokeWidth={strokeW * 0.3}
          />
        ))}

        {/* blocking rows, crossing every joist */}
        {blockingYs.map((y) => (
          <line
            key={`blocking-${y}`}
            x1={0}
            y1={y}
            x2={spec.widthM}
            y2={y}
            className={styles.blockingLine}
            strokeWidth={strokeW * 0.8}
          />
        ))}

        {/* hanger marks at both ends of every joist, only when hung */}
        {spec.supportMethod === "hangers" &&
          joistXs.flatMap((x) => [
            <rect
              key={`hanger-${x}-0`}
              x={x - JOIST_THICKNESS_M * 0.9}
              y={-strokeW * 1.5}
              width={JOIST_THICKNESS_M * 1.8}
              height={strokeW * 1.5}
              className={styles.hangerMark}
            />,
            <rect
              key={`hanger-${x}-1`}
              x={x - JOIST_THICKNESS_M * 0.9}
              y={spec.spanM}
              width={JOIST_THICKNESS_M * 1.8}
              height={strokeW * 1.5}
              className={styles.hangerMark}
            />,
          ])}

        {/* support lines the joists land on */}
        <line x1={0} y1={0} x2={spec.widthM} y2={0} className={styles.supportLine} strokeWidth={strokeW} />
        <line x1={0} y1={spec.spanM} x2={spec.widthM} y2={spec.spanM} className={styles.supportLine} strokeWidth={strokeW} />

        <text x={spec.widthM / 2} y={-fontSize * 0.6} className={styles.dimText} fontSize={fontSize} textAnchor="middle">
          {spec.widthM.toFixed(2)} m wide
        </text>
        <text
          x={-fontSize * 0.6}
          y={spec.spanM / 2}
          className={styles.dimText}
          fontSize={fontSize}
          textAnchor="middle"
          transform={`rotate(-90 ${-fontSize * 0.6} ${spec.spanM / 2})`}
        >
          {spec.spanM.toFixed(2)} m span
        </text>
      </svg>

      <div className={styles.legend}>
        <span>
          <span className={`${styles.swatch} ${styles.joistSwatch}`} /> Joist
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.supportSwatch}`} /> Support line (wall/bearer)
        </span>
        {spec.blockingRowCount > 0 && (
          <span>
            <span className={`${styles.swatch} ${styles.blockingSwatch}`} /> Blocking row
          </span>
        )}
        {spec.supportMethod === "hangers" && (
          <span>
            <span className={`${styles.swatch} ${styles.hangerSwatch}`} /> Joist hanger
          </span>
        )}
        <span>
          <span className={`${styles.swatch} ${styles.sheetSwatch}`} /> Flooring sheet lines (schematic)
        </span>
      </div>
    </div>
  )
}

export default FloorPlanDiagram

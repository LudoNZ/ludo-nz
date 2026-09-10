"use client"

import { useMemo } from "react"
import { FloorSpec } from "./floorSpec"
import { FloorSettings } from "./floorSettings"
import styles from "./floorPlanDiagram.module.scss"

const JOIST_THICKNESS_M = 0.045
// Nogging/blocking pieces sit at the same framing depth as the joists but
// are drawn a touch thinner — enough to still read as a solid timber
// member (same colour family as a joist, not the old thin dashed line),
// while staying visibly narrower than a joist so the joist's own border
// clearly shows crossing through it, rather than the two blurring together.
const BLOCKING_THICKNESS_M = JOIST_THICKNESS_M * 0.65

/** Top-down plan of a single-span mid-floor: joists running the full span,
 * evenly spaced across the width, hanger marks at both ends when hung,
 * full-width blocking rows crossing every joist, and a flooring-sheet
 * overlay — schematic, not a literal cutting layout the way the decking
 * calculator's diagram is (no attempt to plan actual sheet joins/offsets,
 * just "this is roughly how many sheets and where the lines fall").
 * Sheets are drawn with their long edge running across the joists
 * (perpendicular to them, the way flooring is actually laid — each sheet
 * bridging several joists rather than running alongside just one) and
 * covering the full floor area, not just outlined as a grid. */
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
  // Full-width rows (0 to widthM below), not partial — every joist gets
  // crossed by every blocking row.
  const blockingYs = Array.from({ length: spec.blockingRowCount }, (_, i) => (spec.spanM * (i + 1)) / (spec.blockingRowCount + 1))

  // Sheet length (the long edge) runs across the width — perpendicular to
  // the joists, which run the span — so each sheet bridges several joists;
  // sheet width stacks the other way, along the span.
  const sheetCols = Math.max(1, Math.ceil(spec.widthM / settings.flooringSheetLengthM))
  const sheetRows = Math.max(1, Math.ceil(spec.spanM / settings.flooringSheetWidthM))

  return (
    <div className={styles.diagramRoot}>
      <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Floor framing plan, to scale">
        {/* floor outline */}
        <rect x={0} y={0} width={spec.widthM} height={spec.spanM} className={styles.floorOutline} strokeWidth={strokeW * 0.6} />

        {/* blocking rows first, so each joist (drawn next) visibly crosses
            over/through them via its own border — same colour family as a
            joist rather than a contrasting one, "it's timber too" */}
        {blockingYs.map((y) => (
          <rect
            key={`blocking-${y}`}
            x={0}
            y={y - BLOCKING_THICKNESS_M / 2}
            width={spec.widthM}
            height={BLOCKING_THICKNESS_M}
            className={styles.blocking}
            strokeWidth={strokeW * 0.3}
          />
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

        {/* flooring — a translucent sheet covering the entire area (so the
            framing underneath still reads through), with the individual
            sheets' joint lines on top */}
        <rect x={0} y={0} width={spec.widthM} height={spec.spanM} className={styles.flooring} />
        {Array.from({ length: sheetCols + 1 }, (_, i) => i * settings.flooringSheetLengthM)
          .filter((x) => x > 0 && x < spec.widthM)
          .map((x) => (
            <line key={`sv-${x}`} x1={x} y1={0} x2={x} y2={spec.spanM} className={styles.sheetLine} strokeWidth={strokeW * 0.35} />
          ))}
        {Array.from({ length: sheetRows + 1 }, (_, i) => i * settings.flooringSheetWidthM)
          .filter((y) => y > 0 && y < spec.spanM)
          .map((y) => (
            <line key={`sh-${y}`} x1={0} y1={y} x2={spec.widthM} y2={y} className={styles.sheetLine} strokeWidth={strokeW * 0.35} />
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
          <span className={`${styles.swatch} ${styles.flooringSwatch}`} /> Flooring
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.sheetSwatch}`} /> Sheet joint (schematic)
        </span>
      </div>
    </div>
  )
}

export default FloorPlanDiagram

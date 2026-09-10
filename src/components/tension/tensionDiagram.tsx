"use client"

import { useMemo } from "react"
import { TensionResult, WarningLevel } from "./tension"
import styles from "./tensionDiagram.module.scss"

const ARC_STEPS = 16

/** Points along a circular arc of radius r centred on (cx, cy), sweeping
 * from angle 0 up to thetaRad (measured downward from horizontal, SVG
 * y-down convention). mirror flips it to the left instead of the right,
 * for the anchor on the far side of the span. Built as sampled points
 * rather than an SVG arc command + sweep-flag — easier to get right than
 * reasoning out large-arc/sweep flags for a mirrored pair. */
function arcPath(cx: number, cy: number, r: number, thetaRad: number, mirror: boolean): string {
  const pts: string[] = []
  for (let i = 0; i <= ARC_STEPS; i++) {
    const a = (thetaRad * i) / ARC_STEPS
    const x = cx + (mirror ? -1 : 1) * r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    pts.push(`${x.toFixed(4)},${y.toFixed(4)}`)
  }
  return `M ${pts.join(" L ")}`
}

const ropeClass: Record<WarningLevel, string> = {
  none: styles.ropeOk,
  caution: styles.ropeCaution,
  danger: styles.ropeDanger,
}

/** Two anchors, span L apart, with the load sagging distance d below the
 * anchor line at the midpoint — drawn to scale, angle arcs at each anchor,
 * tension labelled along each leg, rope colour tracking how close to
 * "dangerously flat" the current sag is. */
const TensionDiagram: React.FC<{ spanM: number; result: TensionResult }> = ({ spanM, result }) => {
  const { sagM, sagAngleRad, sagAngleDeg, tensionPerLegKgf, warningLevel } = result

  const geometry = useMemo(() => {
    const scale = Math.max(spanM, 1)
    const fontSize = scale * 0.045
    const strokeW = scale * 0.006
    // padding carries the angle arcs, tension labels and load icon — kept
    // generous relative to font size since a shallow sag leaves almost no
    // room of its own (which is the point: a "dangerously flat" line
    // should visually read as nearly a single straight edge)
    const pad = fontSize * 4.5
    const arcR = pad * 0.42
    const vbW = spanM + pad * 2
    const vbH = sagM + pad * 2
    return { fontSize, strokeW, pad, arcR, viewBox: `${-pad} ${-pad} ${vbW} ${vbH}` }
  }, [spanM, sagM])

  const { fontSize, strokeW, arcR, viewBox } = geometry

  const leftAnchor = { x: 0, y: 0 }
  const rightAnchor = { x: spanM, y: 0 }
  const load = { x: spanM / 2, y: sagM }

  const leftArc = arcPath(leftAnchor.x, leftAnchor.y, arcR, sagAngleRad, false)
  const rightArc = arcPath(rightAnchor.x, rightAnchor.y, arcR, sagAngleRad, true)

  const halfTheta = sagAngleRad / 2
  const leftAngleLabel = { x: arcR * 1.5 * Math.cos(halfTheta), y: arcR * 1.5 * Math.sin(halfTheta) }
  const rightAngleLabel = { x: spanM - arcR * 1.5 * Math.cos(halfTheta), y: arcR * 1.5 * Math.sin(halfTheta) }

  const tensionLabelY = sagM / 2 - fontSize * 0.7
  const leftTensionLabel = { x: spanM / 4, y: tensionLabelY }
  const rightTensionLabel = { x: (spanM * 3) / 4, y: tensionLabelY }

  const tensionText = `T = ${Math.round(tensionPerLegKgf)} kgf`
  const rope = ropeClass[warningLevel]

  return (
    <div className={styles.diagramRoot}>
      <svg viewBox={viewBox} className={styles.svg} role="img" aria-label="Tightline tension diagram, to scale">
        {/* anchor line — the horizontal reference the sag angle is measured
            from, so the dip is easy to read against a straight line */}
        <line
          x1={leftAnchor.x}
          y1={leftAnchor.y}
          x2={rightAnchor.x}
          y2={rightAnchor.y}
          className={styles.anchorLine}
          strokeWidth={strokeW * 0.5}
        />

        {/* the two legs of rope/strap/line */}
        <line x1={leftAnchor.x} y1={leftAnchor.y} x2={load.x} y2={load.y} className={rope} strokeWidth={strokeW * 1.8} />
        <line x1={rightAnchor.x} y1={rightAnchor.y} x2={load.x} y2={load.y} className={rope} strokeWidth={strokeW * 1.8} />

        {/* angle arcs at each anchor */}
        <path d={leftArc} className={styles.angleArc} strokeWidth={strokeW * 0.4} />
        <path d={rightArc} className={styles.angleArc} strokeWidth={strokeW * 0.4} />
        <text x={leftAngleLabel.x} y={leftAngleLabel.y} className={styles.angleText} fontSize={fontSize * 0.85} textAnchor="middle">
          {sagAngleDeg.toFixed(1)}°
        </text>
        <text x={rightAngleLabel.x} y={rightAngleLabel.y} className={styles.angleText} fontSize={fontSize * 0.85} textAnchor="middle">
          {sagAngleDeg.toFixed(1)}°
        </text>

        {/* tension labels along each leg */}
        <text x={leftTensionLabel.x} y={leftTensionLabel.y} className={styles.tensionText} fontSize={fontSize} textAnchor="middle">
          {tensionText}
        </text>
        <text x={rightTensionLabel.x} y={rightTensionLabel.y} className={styles.tensionText} fontSize={fontSize} textAnchor="middle">
          {tensionText}
        </text>

        {/* anchor markers */}
        <circle cx={leftAnchor.x} cy={leftAnchor.y} r={fontSize * 0.35} className={styles.anchorDot} />
        <circle cx={rightAnchor.x} cy={rightAnchor.y} r={fontSize * 0.35} className={styles.anchorDot} />

        {/* the load, hanging at the midpoint */}
        <line x1={load.x} y1={load.y} x2={load.x} y2={load.y + fontSize * 0.9} className={styles.loadLine} strokeWidth={strokeW} />
        <circle cx={load.x} cy={load.y + fontSize * 1.3} r={fontSize * 0.55} className={styles.loadDot} />

        {warningLevel === "danger" && (
          <text
            x={load.x}
            y={load.y + fontSize * 2.6}
            className={styles.dangerText}
            fontSize={fontSize * 0.9}
            textAnchor="middle"
          >
            ⚠ approaching infinite tension
          </text>
        )}

        <text x={spanM / 2} y={-fontSize * 1.6} className={styles.dimText} fontSize={fontSize} textAnchor="middle">
          span {spanM.toFixed(2)} m
        </text>
      </svg>

      <div className={styles.legend}>
        <span>
          <span className={`${styles.swatch} ${styles.okSwatch}`} /> Comfortable
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.cautionSwatch}`} /> Caution (&gt;10×)
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.dangerSwatch}`} /> Danger (&gt;20×)
        </span>
      </div>
    </div>
  )
}

export default TensionDiagram

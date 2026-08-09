"use client"

import { useId, useMemo } from "react"
import { DeckLayout } from "./layout"
import { DeckConfig, formatLength, rakeAngleDeg } from "./types"
import styles from "./deckPlanView.module.scss"

const DeckPlanView: React.FC<{ config: DeckConfig; layout: DeckLayout }> = ({ config, layout }) => {
  const clipId = useId()
  const { sideA, sideB, width } = config

  const { viewBox, padLeft, padTop, fontSize, strokeW, maxLen } = useMemo(() => {
    const maxLen = Math.max(sideA, sideB)
    const scale = Math.max(maxLen, width)
    const padLeft = maxLen * 0.09
    const padRight = maxLen * 0.05
    const padTop = width * 0.35
    const padBottom = width * 0.55
    const vbW = maxLen + padLeft + padRight
    const vbH = width + padTop + padBottom
    return {
      viewBox: `${-padLeft} ${-padTop} ${vbW} ${vbH}`,
      padLeft,
      padTop,
      fontSize: scale * 0.035,
      strokeW: scale * 0.0035,
      maxLen,
    }
  }, [sideA, sideB, width])

  const hasWarnings = layout.rows.some((r) => r.joins.some((j) => !j.staggered))

  return (
    <div className={styles.planRoot}>
      <div className={styles.svgWrap}>
        <svg viewBox={viewBox} className={styles.svg} role="img" aria-label={`Plan view of ${config.name}`}>
          <defs>
            <clipPath id={clipId}>
              <path d={`M0,0 L${sideA},0 L${sideB},${width} L0,${width} Z`} />
            </clipPath>
          </defs>

          <path
            d={`M0,0 L${sideA},0 L${sideB},${width} L0,${width} Z`}
            className={styles.outline}
            strokeWidth={strokeW * 1.5}
          />

          {layout.joistPositions.map((x) => (
            <line
              key={x}
              x1={x}
              y1={0}
              x2={x}
              y2={width}
              className={styles.joist}
              strokeWidth={strokeW}
            />
          ))}

          <g clipPath={`url(#${clipId})`}>
            {layout.rows.map((row) => (
              <g key={row.index}>
                <rect
                  x={0}
                  y={row.yStart}
                  width={row.targetLength}
                  height={row.yEnd - row.yStart}
                  className={styles.row}
                />
                {row.joins.map((j) => (
                  <rect
                    key={j.position}
                    x={j.position - strokeW}
                    y={row.yStart}
                    width={strokeW * 2}
                    height={row.yEnd - row.yStart}
                    className={j.staggered ? styles.joinGap : styles.joinWarning}
                  />
                ))}
              </g>
            ))}
          </g>

          {/* dimension labels */}
          <text x={sideA / 2} y={-padTop / 2.2} fontSize={fontSize} className={styles.dimText}>
            {formatLength(sideA)} (square end)
          </text>
          <text x={sideB / 2} y={width + padTop / 2 + fontSize} fontSize={fontSize} className={styles.dimText}>
            {formatLength(sideB)} (raked end)
          </text>
          <text
            x={-padLeft / 1.6}
            y={width / 2}
            fontSize={fontSize}
            className={styles.dimText}
            transform={`rotate(-90 ${-padLeft / 1.6} ${width / 2})`}
          >
            {formatLength(width)}
          </text>
          <text x={maxLen} y={width + padTop / 2 + fontSize * 2.4} fontSize={fontSize} textAnchor="end" className={styles.dimText}>
            Rake: {rakeAngleDeg(config).toFixed(1)}°
          </text>
        </svg>
      </div>

      <div className={styles.legend}>
        <span>
          <span className={styles.dash} /> Joist @ {formatLength(config.joistSpacing)} centres
        </span>
        {hasWarnings && (
          <span>
            <span className={styles.dot} /> Join could not meet {formatLength(config.minStagger)} stagger
          </span>
        )}
      </div>
    </div>
  )
}

export default DeckPlanView

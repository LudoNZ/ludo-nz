"use client"

import { useId, useMemo } from "react"
import { DeckLayout } from "./layout"
import { DeckConfig, formatLength, rakeAngleDeg } from "./types"
import styles from "./deckPlanView.module.scss"

const DeckPlanView: React.FC<{
  config: DeckConfig
  layout: DeckLayout
  completedSegmentIds: string[]
  onToggleSegment?: (id: string) => void
  activeSegmentId?: string | null
  /** highlights a whole row (used by the join editor to show which row its
   * scroller is currently focused on) — separate from activeSegmentId,
   * which highlights one board within cutting mode's "next cut" flow */
  activeRowIndex?: number | null
}> = ({ config, layout, completedSegmentIds, onToggleSegment, activeSegmentId = null, activeRowIndex = null }) => {
  const clipId = useId()
  const completedSet = new Set(completedSegmentIds)
  const { sideA, sideB, width } = config
  const intoRake = config.boardDirection !== "alongRake"

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

  const hasWarnings = layout.rows.some((r) => r.joins.some((j) => !j.staggered || j.nearEdge))

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

          {layout.joistPositions.map((pos) =>
            intoRake ? (
              <line key={pos} x1={pos} y1={0} x2={pos} y2={width} className={styles.joist} strokeWidth={strokeW} />
            ) : (
              <line key={pos} x1={0} y1={pos} x2={maxLen} y2={pos} className={styles.joist} strokeWidth={strokeW} />
            )
          )}

          <g clipPath={`url(#${clipId})`}>
            {activeRowIndex != null &&
              (() => {
                const row = layout.rows.find((r) => r.index === activeRowIndex)
                if (!row) return null
                const rowThickness = row.rowEnd - row.rowStart
                return (
                  <rect
                    x={intoRake ? 0 : row.rowStart}
                    y={intoRake ? row.rowStart : 0}
                    width={intoRake ? row.targetLength : rowThickness}
                    height={intoRake ? rowThickness : row.targetLength}
                    className={styles.rowHighlight}
                  />
                )
              })()}
            {layout.rows.map((row) => {
              const rowThickness = row.rowEnd - row.rowStart
              const overhang = rowThickness * 0.35
              const joinThickness = strokeW * (row.isSkeleton ? 4.5 : 3)
              const labelFontSize = Math.min(rowThickness * 0.65, fontSize * 0.8)
              const labelX = intoRake ? maxLen * 0.015 : row.rowStart + rowThickness / 2
              const labelY = intoRake ? row.rowStart + rowThickness / 2 : labelFontSize * 0.9
              return (
                <g key={row.index}>
                  {row.boards.map((b) => {
                    const placed = completedSet.has(b.id)
                    const active = b.id === activeSegmentId
                    const cx = intoRake ? (b.start + b.end) / 2 : row.rowStart + rowThickness / 2
                    const cy = intoRake ? row.rowStart + rowThickness / 2 : (b.start + b.end) / 2
                    const checkSize = Math.min(rowThickness * 0.55, fontSize)
                    return (
                      <g key={b.id}>
                        <rect
                          x={intoRake ? b.start : row.rowStart}
                          y={intoRake ? row.rowStart : b.start}
                          width={intoRake ? b.end - b.start : rowThickness}
                          height={intoRake ? rowThickness : b.end - b.start}
                          className={`${styles.segment} ${b.stockLength === null ? styles.segmentUnresolved : ""} ${placed ? styles.segmentPlaced : ""} ${active ? styles.segmentActive : ""} ${!onToggleSegment ? styles.segmentStatic : ""}`}
                          tabIndex={onToggleSegment ? 0 : -1}
                          role={onToggleSegment ? "button" : undefined}
                          aria-pressed={onToggleSegment ? placed : undefined}
                          aria-label={`Row ${row.index + 1} board, ${formatLength(b.cutLength)}, ${placed ? "placed" : "not placed"}${active ? ", next cut" : ""}${onToggleSegment ? " — tap to toggle" : ""}`}
                          onClick={onToggleSegment ? () => onToggleSegment(b.id) : undefined}
                          onKeyDown={
                            onToggleSegment
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault()
                                    onToggleSegment(b.id)
                                  }
                                }
                              : undefined
                          }
                        />
                        {placed && (
                          <text
                            x={cx}
                            y={cy}
                            fontSize={checkSize}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className={styles.checkMark}
                          >
                            ✓
                          </text>
                        )}
                      </g>
                    )
                  })}
                  {row.joins.map((j) => {
                    const markClass = !j.staggered || j.nearEdge
                      ? styles.joinWarning
                      : row.isSkeleton
                        ? styles.joinSkeleton
                        : styles.joinFill
                    return intoRake ? (
                      <rect
                        key={j.position}
                        x={j.position - joinThickness / 2}
                        y={row.rowStart - overhang}
                        width={joinThickness}
                        height={rowThickness + overhang * 2}
                        rx={joinThickness / 3}
                        className={markClass}
                      />
                    ) : (
                      <rect
                        key={j.position}
                        x={row.rowStart - overhang}
                        y={j.position - joinThickness / 2}
                        width={rowThickness + overhang * 2}
                        height={joinThickness}
                        rx={joinThickness / 3}
                        className={markClass}
                      />
                    )
                  })}
                  {row.isSkeleton && (
                    <text
                      x={labelX}
                      y={labelY}
                      fontSize={labelFontSize}
                      strokeWidth={labelFontSize * 0.18}
                      textAnchor={intoRake ? "start" : "middle"}
                      className={styles.rowLabel}
                    >
                      {row.index + 1}
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* dimension labels */}
          <text x={sideA / 2} y={-padTop / 2.2} fontSize={fontSize} className={styles.dimText}>
            {formatLength(sideA)} ({config.edgeLabels?.sideA || "top edge"})
          </text>
          <text x={sideB / 2} y={width + padTop / 2 + fontSize} fontSize={fontSize} className={styles.dimText}>
            {formatLength(sideB)} ({config.edgeLabels?.sideB || "bottom edge"})
          </text>
          <text
            x={-padLeft / 1.6}
            y={width / 2}
            fontSize={fontSize}
            className={styles.dimText}
            transform={`rotate(-90 ${-padLeft / 1.6} ${width / 2})`}
          >
            {formatLength(width)} ({config.edgeLabels?.width || "width"})
          </text>
          <text x={maxLen} y={width + padTop / 2 + fontSize * 2.4} fontSize={fontSize} textAnchor="end" className={styles.dimText}>
            {config.edgeLabels?.rake || "Angled edge"}: {rakeAngleDeg(config).toFixed(1)}°
          </text>
        </svg>
      </div>

      <div className={styles.legend}>
        <span>{intoRake ? "↦" : "↧"} Boards run {intoRake ? "into" : "along"} the rake</span>
        <span>
          <span className={styles.dash} /> Joist @ {formatLength(config.joistSpacing)} centres
          {config.firstBaySpacing && config.firstBaySpacing !== config.joistSpacing
            ? ` (first bay ${formatLength(config.firstBaySpacing)})`
            : ""}
        </span>
        <span>
          <span className={`${styles.tick} ${styles.skeleton}`} /> Skeleton row join
        </span>
        <span>
          <span className={`${styles.tick} ${styles.fill}`} /> Fill-in row join
        </span>
        {hasWarnings && (
          <span>
            <span className={styles.dot} /> Join couldn&apos;t meet the stagger or edge-buffer rule
          </span>
        )}
      </div>
    </div>
  )
}

export default DeckPlanView

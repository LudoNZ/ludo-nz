"use client"

import { useId, useMemo } from "react"
import { DeckLayout, displayRowNumber } from "./layout"
import { DeckConfig, formatLength, rakeAngleDeg } from "./types"
import { polygonBounds, polygonOutlinePath } from "./polygon"
import styles from "./deckPlanView.module.scss"

const DeckPlanView: React.FC<{
  config: DeckConfig
  layout: DeckLayout
  completedSegmentIds: string[]
  onToggleSegment?: (id: string) => void
  /** when provided, tapping any board jumps the join scroller to that row
   * instead of toggling it placed — takes priority over onToggleSegment
   * (the two are mutually exclusive; the join editor doesn't also want
   * stray placed-toggles while you're trying to focus a row) */
  onRowClick?: (rowIndex: number) => void
  activeSegmentId?: string | null
  /** highlights a whole row (used by the join editor to show which row its
   * scroller is currently focused on) — separate from activeSegmentId,
   * which highlights one board within cutting mode's "next cut" flow */
  activeRowIndex?: number | null
}> = ({ config, layout, completedSegmentIds, onToggleSegment, onRowClick, activeSegmentId = null, activeRowIndex = null }) => {
  const clipId = useId()
  const completedSet = new Set(completedSegmentIds)
  const { sideA, sideB, width } = config
  const intoRake = config.boardDirection !== "alongRake"
  // A polygon deck (config.points set) replaces the trapezoid entirely as
  // the source of shape — see DeckConfig.points' doc comment. Every
  // trapezoid deck (the overwhelming majority today) renders exactly as
  // before this existed.
  const isPolygon = Array.isArray(config.points) && config.points.length >= 3
  const bounds = isPolygon ? polygonBounds(config.points!) : null

  const { viewBox, padLeft, padTop, fontSize, strokeW, maxLen, spanMinX, spanMaxX, spanMinY, spanMaxY, outlinePath } = useMemo(() => {
    if (bounds) {
      const w = bounds.maxX - bounds.minX
      const h = bounds.maxY - bounds.minY
      const scale = Math.max(w, h)
      const padLeft = w * 0.09
      const padRight = w * 0.05
      const padTop = h * 0.35
      const padBottom = h * 0.55
      const vbW = w + padLeft + padRight
      const vbH = h + padTop + padBottom
      return {
        viewBox: `${bounds.minX - padLeft} ${bounds.minY - padTop} ${vbW} ${vbH}`,
        padLeft,
        padTop,
        fontSize: scale * 0.035,
        strokeW: scale * 0.0035,
        maxLen: w,
        spanMinX: bounds.minX,
        spanMaxX: bounds.maxX,
        spanMinY: bounds.minY,
        spanMaxY: bounds.maxY,
        outlinePath: polygonOutlinePath(config.points!),
      }
    }
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
      spanMinX: 0,
      spanMaxX: maxLen,
      spanMinY: 0,
      spanMaxY: width,
      outlinePath: `M0,0 L${sideA},0 L${sideB},${width} L0,${width} Z`,
    }
  }, [sideA, sideB, width, bounds, config.points])

  const hasWarnings = layout.rows.some((r) => r.joins.some((j) => !j.staggered || j.nearEdge))

  return (
    <div className={styles.planRoot}>
      <div className={styles.svgWrap}>
        <svg viewBox={viewBox} className={styles.svg} role="img" aria-label={`Plan view of ${config.name}`}>
          <defs>
            <clipPath id={clipId}>
              <path d={outlinePath} />
            </clipPath>
          </defs>

          <path d={outlinePath} className={styles.outline} strokeWidth={strokeW * 1.5} />

          <g clipPath={`url(#${clipId})`}>
            {/* joist grid: drawn as full-span lines and left to the clip
                path to trim them exactly to the outline — works for any
                shape (straight-sided or raked trapezoid, or a general
                polygon) without computing per-position lengths here */}
            {layout.joistPositions.map((pos) =>
              intoRake ? (
                <line key={pos} x1={pos} y1={spanMinY} x2={pos} y2={spanMaxY} className={styles.joist} strokeWidth={strokeW} />
              ) : (
                <line key={pos} x1={spanMinX} y1={pos} x2={spanMaxX} y2={pos} className={styles.joist} strokeWidth={strokeW} />
              )
            )}
            {activeRowIndex != null &&
              (() => {
                const row = layout.rows.find((r) => r.index === activeRowIndex)
                if (!row) return null
                const rowThickness = row.rowEnd - row.rowStart
                return (
                  <rect
                    x={intoRake ? row.runStart : row.rowStart}
                    y={intoRake ? row.rowStart : row.runStart}
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
              // Anchored to this row's own start (row.runStart), not the
              // deck's overall bounding box (spanMinX/spanMinY) — a raked
              // or tapered edge means the box's corner isn't necessarily
              // where *this* row actually begins, so a fixed offset from
              // it could land outside the row (and get cropped by the
              // outline's own clip-path). The margin is pushed out to
              // roughly a joist bay's worth (not just a sliver off the
              // edge) so the number always lands solidly inside the row,
              // not right on a corner that might still pinch it.
              const labelMargin = Math.max(maxLen * 0.015, labelFontSize * 0.9, config.joistSpacing * 0.4)
              const labelX = intoRake ? row.runStart + labelMargin : row.rowStart + rowThickness / 2
              const labelY = intoRake ? row.rowStart + rowThickness / 2 : row.runStart + labelMargin
              const rowNumber = displayRowNumber(row.index, layout.rows.length, config.rowNumberingReversed)
              return (
                <g key={row.index}>
                  {row.boards.map((b) => {
                    const placed = completedSet.has(b.id)
                    const active = b.id === activeSegmentId
                    const cx = intoRake ? (b.start + b.end) / 2 : row.rowStart + rowThickness / 2
                    const cy = intoRake ? row.rowStart + rowThickness / 2 : (b.start + b.end) / 2
                    const checkSize = Math.min(rowThickness * 0.55, fontSize)
                    const handleClick = onRowClick
                      ? () => onRowClick(row.index)
                      : onToggleSegment
                        ? () => onToggleSegment(b.id)
                        : undefined
                    const ariaLabel = onRowClick
                      ? `Row ${rowNumber} — tap to focus this row in the join editor`
                      : `Row ${rowNumber} board, ${formatLength(b.cutLength)}, ${placed ? "placed" : "not placed"}${active ? ", next cut" : ""}${onToggleSegment ? " — tap to toggle" : ""}`
                    return (
                      <g key={b.id}>
                        <rect
                          x={intoRake ? b.start : row.rowStart}
                          y={intoRake ? row.rowStart : b.start}
                          width={intoRake ? b.end - b.start : rowThickness}
                          height={intoRake ? rowThickness : b.end - b.start}
                          className={`${styles.segment} ${b.stockLength === null ? styles.segmentUnresolved : ""} ${placed ? styles.segmentPlaced : ""} ${active ? styles.segmentActive : ""} ${!handleClick ? styles.segmentStatic : ""}`}
                          tabIndex={handleClick ? 0 : -1}
                          role={handleClick ? "button" : undefined}
                          aria-pressed={onToggleSegment && !onRowClick ? placed : undefined}
                          aria-label={ariaLabel}
                          onClick={handleClick}
                          onKeyDown={
                            handleClick
                              ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault()
                                    handleClick()
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
                      {rowNumber}
                    </text>
                  )}
                </g>
              )
            })}
          </g>

          {/* dimension labels — trapezoid-specific (named sideA/sideB/width/
              rake edges); a polygon deck's edges have no such fixed
              4-edge vocabulary, so it skips these rather than showing
              stale/wrong values from the ignored sideA/sideB/width fields */}
          {!isPolygon && (
            <>
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
            </>
          )}
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

"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { DeckLayout, previewJoinClash, RowPlan } from "./layout"
import { DeckConfig, LockedRow, formatLength } from "./types"
import planStyles from "./deckPlanView.module.scss"
import styles from "./joinScroller.module.scss"

/** Imperative handle so a click elsewhere on the page (the full plan view)
 * can jump the scroller to a row, the reverse of onActiveRowChange. */
export interface JoinScrollerHandle {
  focusRow: (index: number) => void
}

/** Scroll a row to the centre line to activate it, then tap a joist line
 * to add or remove a join there. Each row's mini-track reuses the plan
 * view's own rect/line classes (segment, joist, join-mark colours) so it
 * reads as a zoomed-in strip of the same drawing rather than a different
 * widget. Reports which row is active so a caller can mirror the
 * highlight into a full plan view elsewhere on the page. */
const JoinScroller = forwardRef<
  JoinScrollerHandle,
  {
    layout: DeckLayout
    /** needed only to preview whether an as-yet-unplaced join would clash —
     * see clashPositions below */
    config: DeckConfig
    /** mm, the shared board-run axis extent every row's mini-track is drawn
     * against (so the joist grid lines up vertically down the page) — the
     * trapezoid's own maxLen, or a polygon deck's bounding-box width/height
     * along that axis */
    maxLen: number
    /** mm, where that shared axis actually starts — always 0 for a
     * trapezoid (its near boundary is always the origin); a polygon deck's
     * own bounding-box minimum otherwise, since its near boundary might not
     * be at 0 */
    axisOrigin: number
    lockedRows: Record<string, LockedRow>
    onToggleJoin: (row: RowPlan, position: number) => void
    onResetRow: (row: RowPlan) => void
    onActiveRowChange?: (index: number | null) => void
  }
>(({ layout, config, maxLen, axisOrigin, lockedRows, onToggleJoin, onResetRow, onActiveRowChange }, ref) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useImperativeHandle(ref, () => ({
    focusRow: (index) => {
      rowRefs.current.get(index)?.scrollIntoView({ behavior: "smooth", block: "center" })
    },
  }))

  // whichever row strip sits nearest the vertical centre of the scroll
  // area becomes "active" — only its joist marks are tappable, so
  // scrolling past a row on the way to another one can't mis-toggle it
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let ticking = false
    const update = () => {
      ticking = false
      const containerRect = container.getBoundingClientRect()
      const centerY = containerRect.top + containerRect.height / 2
      let closest: number | null = null
      let closestDist = Infinity
      rowRefs.current.forEach((el, index) => {
        const rect = el.getBoundingClientRect()
        const dist = Math.abs(rect.top + rect.height / 2 - centerY)
        if (dist < closestDist) {
          closestDist = dist
          closest = index
        }
      })
      setActiveIndex(closest)
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }
    container.addEventListener("scroll", onScroll, { passive: true })
    update()
    return () => container.removeEventListener("scroll", onScroll)
  }, [layout.rows.length])

  useEffect(() => {
    onActiveRowChange?.(activeIndex)
  }, [activeIndex, onActiveRowChange])

  // joist positions on the active row that don't have a join yet, but
  // would clash with the stagger/edge rules if one were added there — a
  // proactive "this would clash" hint, computed only for the row you can
  // actually tap right now (checking every row's every tick this way would
  // mean a full deck recompute per candidate, which adds up fast)
  const clashPositions = useMemo(() => {
    const clashes = new Set<number>()
    if (activeIndex == null) return clashes
    const row = layout.rows.find((r) => r.index === activeIndex)
    if (!row) return clashes
    const current = row.joins.map((j) => j.position)
    const ticks = layout.joistPositions.filter((p) => p > row.runStart + 1e-6 && p < row.runStart + row.targetLength - 1e-6)
    for (const p of ticks) {
      if (current.some((c) => Math.abs(c - p) < 1e-6)) continue
      const preview = previewJoinClash(config, activeIndex, current, p)
      if (preview && (!preview.staggered || preview.nearEdge)) clashes.add(p)
    }
    return clashes
  }, [layout, config, activeIndex])

  // scale used across every row's mini-plan so the joist grid lines up
  // vertically down the page, same as the real plan view — a row's own
  // extent just draws less of it, it doesn't get its own scale
  const strokeW = maxLen * 0.0035

  return (
    <div className={styles.scrollArea} ref={containerRef}>
      <div className={styles.centerLine} aria-hidden="true" />
      {layout.rows.map((row) => {
        const locked = Boolean(lockedRows[String(row.index)])
        const active = !locked && row.index === activeIndex
        const ticks = layout.joistPositions.filter((p) => p > row.runStart + 1e-6 && p < row.runStart + row.targetLength - 1e-6)
        const joinThickness = strokeW * (row.isSkeleton ? 4.5 : 3)
        return (
          <div
            key={row.index}
            ref={(el) => {
              if (locked) return
              if (el) rowRefs.current.set(row.index, el)
              else rowRefs.current.delete(row.index)
            }}
            className={`${styles.rowStrip} ${active ? styles.active : ""} ${locked ? styles.locked : ""}`}
          >
            <div className={styles.rowMeta}>
              <span className={styles.rowLabel}>
                #{row.index + 1}
                {row.isSkeleton && <span className={styles.tag}>skeleton</span>}
                {row.manual && <span className={styles.tagManual}>manual</span>}
                {locked && <span className={styles.tagLocked}>secured</span>}
              </span>
              {active && row.manual && (
                <button type="button" className={styles.resetBtn} onClick={() => onResetRow(row)}>
                  Reset to auto
                </button>
              )}
            </div>
            <div className={styles.track}>
              <svg
                viewBox={`${axisOrigin} 0 ${maxLen} 100`}
                preserveAspectRatio="none"
                className={styles.trackSvg}
                aria-hidden="true"
              >
                <rect x={row.runStart} y={12} width={row.targetLength} height={76} className={styles.rowExtentSvg} />
                {layout.joistPositions
                  .filter((p) => p > axisOrigin + 1e-6 && p < axisOrigin + maxLen - 1e-6)
                  .map((p) => (
                    <line key={p} x1={p} y1={0} x2={p} y2={100} className={styles.joistLine} strokeWidth={strokeW} />
                  ))}
                {row.boards.map((b) => (
                  <rect
                    key={b.id}
                    x={b.start}
                    y={18}
                    width={Math.max(0, b.end - b.start)}
                    height={64}
                    className={`${planStyles.segment} ${b.stockLength === null ? planStyles.segmentUnresolved : ""}`}
                  />
                ))}
                {row.joins.map((j) => {
                  const warn = !j.staggered || j.nearEdge
                  const cls = warn ? planStyles.joinWarning : row.isSkeleton ? planStyles.joinSkeleton : planStyles.joinFill
                  return (
                    <rect
                      key={j.position}
                      x={j.position - joinThickness / 2}
                      y={4}
                      width={joinThickness}
                      height={92}
                      rx={joinThickness / 3}
                      className={cls}
                    />
                  )
                })}
                {active &&
                  ticks
                    .filter((p) => clashPositions.has(p))
                    .map((p) => (
                      <g key={p} className={styles.clashMark}>
                        <line x1={p - joinThickness * 1.3} y1={38} x2={p + joinThickness * 1.3} y2={62} strokeWidth={strokeW * 1.4} />
                        <line x1={p - joinThickness * 1.3} y1={62} x2={p + joinThickness * 1.3} y2={38} strokeWidth={strokeW * 1.4} />
                      </g>
                    ))}
              </svg>
              {active &&
                ticks.map((p) => {
                  const join = row.joins.find((j) => Math.abs(j.position - p) < 1e-6)
                  const clash = !join && clashPositions.has(p)
                  const left = `${((p - axisOrigin) / maxLen) * 100}%`
                  return (
                    <button
                      key={p}
                      type="button"
                      className={styles.overlayBtn}
                      style={{ left }}
                      onClick={() => onToggleJoin(row, p)}
                      aria-label={`${join ? "Remove" : "Add"} a join ${formatLength(p)} into row ${row.index + 1}${clash ? " — would clash with the stagger or edge-buffer rule" : ""}`}
                    />
                  )
                })}
            </div>
          </div>
        )
      })}
    </div>
  )
})

JoinScroller.displayName = "JoinScroller"

export default JoinScroller

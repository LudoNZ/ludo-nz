"use client"

import { useMemo, useState } from "react"
import {
  ASSISTANCE_LEVELS,
  AssistanceLevel,
  PullupSession,
  assistanceLabel,
} from "./types"
import styles from "./pullupChart.module.scss"

type SeriesKey = AssistanceLevel | "max"

type ChartPoint = {
  x: number
  y: number
  series: SeriesKey
  session: PullupSession
}

const TIER_VAR: Record<AssistanceLevel, string> = {
  3: "var(--tier-3)",
  2: "var(--tier-2)",
  1: "var(--tier-1)",
  0: "var(--tier-0)",
}

const W = 680
const H = 320
const PAD_LEFT = 34
const PAD_RIGHT = 14
const PAD_TOP = 14
const PAD_BOTTOM = 30
const INNER_W = W - PAD_LEFT - PAD_RIGHT
const INNER_H = H - PAD_TOP - PAD_BOTTOM

function pickStep(maxVal: number): number {
  if (maxVal <= 10) return 2
  if (maxVal <= 20) return 5
  if (maxVal <= 50) return 10
  return 20
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

function formatFullDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const PullupChart: React.FC<{ sessions: PullupSession[] }> = ({ sessions }) => {
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const { seriesByKey, allPoints, xMin, xMax, yMax, ticks } = useMemo(() => {
    const points: ChartPoint[] = sessions.map((s) => ({
      x: s.createdAt.getTime(),
      y: s.isMaxTest ? s.totalReps : s.totalReps / Math.max(s.sets.length, 1),
      series: s.isMaxTest ? "max" : s.assistanceBands,
      session: s,
    }))

    const grouped = new Map<SeriesKey, ChartPoint[]>()
    for (const p of points) {
      const arr = grouped.get(p.series) ?? []
      arr.push(p)
      grouped.set(p.series, arr)
    }
    for (const arr of grouped.values()) arr.sort((a, b) => a.x - b.x)

    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    let xMin = xs.length ? Math.min(...xs) : Date.now() - 86400000
    let xMax = xs.length ? Math.max(...xs) : Date.now()
    if (xMin === xMax) {
      xMin -= 86400000
      xMax += 86400000
    }
    const rawMax = ys.length ? Math.max(...ys, 10) : 10
    const step = pickStep(rawMax * 1.1)
    const yMax = Math.max(Math.ceil((rawMax * 1.1) / step) * step, step)
    const ticks: number[] = []
    for (let t = 0; t <= yMax; t += step) ticks.push(t)

    return { seriesByKey: grouped, allPoints: points, xMin, xMax, yMax, ticks }
  }, [sessions])

  const xScale = (t: number) => PAD_LEFT + ((t - xMin) / (xMax - xMin)) * INNER_W
  const yScale = (v: number) => PAD_TOP + INNER_H - (v / yMax) * INNER_H

  const activePoint =
    allPoints.find((p) => pointKey(p) === activeKey) ??
    (allPoints.length ? allPoints[allPoints.length - 1] : null)

  const xTickDates = useMemo(() => {
    if (!allPoints.length) return []
    const count = Math.min(5, Math.max(2, allPoints.length))
    const result: number[] = []
    for (let i = 0; i < count; i++) {
      result.push(xMin + ((xMax - xMin) * i) / (count - 1))
    }
    return result
  }, [allPoints.length, xMin, xMax])

  if (!sessions.length) {
    return (
      <div className={styles.chartRoot}>
        <p className={styles.empty}>
          No sessions logged yet — start one below to begin tracking progress.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.chartRoot}>
      <div className={styles.readout}>
        {activePoint ? (
          <>
            {formatFullDate(activePoint.session.createdAt)} —{" "}
            {activePoint.session.isMaxTest ? (
              <>Max unassisted: {activePoint.session.totalReps} reps</>
            ) : (
              <>
                {assistanceLabel(activePoint.session.assistanceBands)}:{" "}
                {activePoint.session.sets.length} sets ·{" "}
                {activePoint.y.toFixed(1)} avg reps/set ·{" "}
                <span className={styles.muted}>
                  {activePoint.session.totalReps} total
                </span>
              </>
            )}
          </>
        ) : (
          <span className={styles.muted}>Tap a point for details</span>
        )}
      </div>

      <div className={styles.svgWrap}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={styles.chart}
          role="img"
          aria-label="Pull-up session progress over time"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_LEFT}
                x2={W - PAD_RIGHT}
                y1={yScale(t)}
                y2={yScale(t)}
                className={t === 0 ? styles.baseline : styles.gridline}
              />
              <text x={PAD_LEFT - 8} y={yScale(t)} dy="0.32em" textAnchor="end" className={styles.tick}>
                {t}
              </text>
            </g>
          ))}

          {xTickDates.map((t, i) => (
            <text
              key={i}
              x={xScale(t)}
              y={H - PAD_BOTTOM + 16}
              textAnchor="middle"
              className={styles.xtick}
            >
              {formatShortDate(new Date(t))}
            </text>
          ))}

          {ASSISTANCE_LEVELS.map((level) => {
            const pts = seriesByKey.get(level)
            if (!pts || !pts.length) return null
            const color = TIER_VAR[level]
            const path = pts.map((p) => `${xScale(p.x)},${yScale(p.y)}`).join(" ")
            return (
              <g key={level}>
                {pts.length > 1 && (
                  <polyline points={path} className={styles.line} style={{ stroke: color }} />
                )}
                {pts.map((p) => {
                  const key = pointKey(p)
                  const active = activeKey === key || (!activeKey && p === activePoint)
                  return (
                    <g key={key}>
                      <circle
                        cx={xScale(p.x)}
                        cy={yScale(p.y)}
                        r={active ? 7 : 5}
                        style={{ fill: color }}
                        className={styles.marker}
                      />
                      <circle
                        cx={xScale(p.x)}
                        cy={yScale(p.y)}
                        r={14}
                        className={styles.hitTarget}
                        tabIndex={0}
                        role="button"
                        aria-label={`${formatFullDate(p.session.createdAt)}, ${assistanceLabel(level)}, ${p.y.toFixed(1)} average reps per set`}
                        onPointerEnter={() => setActiveKey(key)}
                        onFocus={() => setActiveKey(key)}
                        onClick={() => setActiveKey(key)}
                      />
                    </g>
                  )
                })}
              </g>
            )
          })}

          {(() => {
            const pts = seriesByKey.get("max")
            if (!pts || !pts.length) return null
            return (
              <g>
                {pts.map((p) => {
                  const key = pointKey(p)
                  const active = activeKey === key || (!activeKey && p === activePoint)
                  const size = active ? 9 : 7
                  const cx = xScale(p.x)
                  const cy = yScale(p.y)
                  return (
                    <g key={key}>
                      <rect
                        x={cx - size / 2}
                        y={cy - size / 2}
                        width={size}
                        height={size}
                        transform={`rotate(45 ${cx} ${cy})`}
                        style={{ fill: "var(--accent-max)" }}
                        className={styles.marker}
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={14}
                        className={styles.hitTarget}
                        tabIndex={0}
                        role="button"
                        aria-label={`${formatFullDate(p.session.createdAt)}, max unassisted, ${p.session.totalReps} reps`}
                        onPointerEnter={() => setActiveKey(key)}
                        onFocus={() => setActiveKey(key)}
                        onClick={() => setActiveKey(key)}
                      />
                    </g>
                  )
                })}
              </g>
            )
          })()}
        </svg>
      </div>

      <div className={styles.legend}>
        {ASSISTANCE_LEVELS.filter((level) => seriesByKey.get(level)?.length).map((level) => (
          <span key={level} className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ backgroundColor: TIER_VAR[level] }} />
            {assistanceLabel(level)}
          </span>
        ))}
        {!!seriesByKey.get("max")?.length && (
          <span className={styles.legendItem}>
            <span className={styles.legendDiamond} style={{ backgroundColor: "var(--accent-max)" }} />
            Max unassisted
          </span>
        )}
      </div>
    </div>
  )
}

function pointKey(p: ChartPoint): string {
  return `${p.series}-${p.session.id}`
}

export default PullupChart

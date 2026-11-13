"use client"

import { useMemo, useRef, useState } from "react"
import styles from "./finance.module.scss"
import { nzd, nzdShort } from "./finance"

export interface ChartSeries {
  label: string
  color: string
  values: number[]
  /** Fill down to the axis (stacked look when an area sits behind another). */
  area?: boolean
  dashed?: boolean
}

export interface ChartBand {
  label: string
  color: string
  low: number[]
  high: number[]
}

const W = 640
const H = 280
const PAD = { top: 12, right: 12, bottom: 28, left: 56 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= v / 4) ?? 10
  return Math.ceil(v / (step * mag)) * step * mag
}

/** Hand-rolled SVG chart: x = years, y = NZD. Hover/tap for a readout. */
const GrowthChart: React.FC<{
  series: ChartSeries[]
  band?: ChartBand
  xLabel: (i: number) => string
  ariaLabel: string
}> = ({ series, band, xLabel, ariaLabel }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const n = Math.max(...series.map((s) => s.values.length), band?.high.length ?? 0)
  const maxY = useMemo(
    () => niceMax(Math.max(1, ...series.flatMap((s) => s.values), ...(band?.high ?? []))),
    [series, band],
  )

  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * iw)
  const y = (v: number) => PAD.top + ih - (v / maxY) * ih

  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")
  const area = (vals: number[]) =>
    vals.length ? `${line(vals)}L${x(vals.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : ""
  const bandPath = band
    ? `${line(band.high)}${band.low
        .map((v, i) => [i, v] as const)
        .reverse()
        .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .join("")}Z`
    : ""

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)
  const xStep = Math.max(1, Math.ceil((n - 1) / 8))
  const xTicks = Array.from({ length: n }, (_, i) => i).filter((i) => i % xStep === 0 || i === n - 1)
  // drop a tick that would crowd the final one
  const xTicksClean = xTicks.filter((i, k) => i === n - 1 || k === xTicks.length - 1 || n - 1 - i >= xStep * 0.6)

  const onMove = (e: React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg || n < 2) return
    const r = svg.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - PAD.left) / iw) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div className={styles.chartWrap}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={styles.chart}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
            <text x={PAD.left - 6} y={y(t)} className={styles.axisText} textAnchor="end" dominantBaseline="middle">
              {nzdShort(t)}
            </text>
          </g>
        ))}
        {xTicksClean.map((i) => (
          <text key={i} x={x(i)} y={H - 8} className={styles.axisText} textAnchor="middle">
            {xLabel(i)}
          </text>
        ))}

        {band && <path d={bandPath} fill={band.color} opacity={0.15} />}
        {series
          .filter((s) => s.area)
          .map((s) => (
            <path key={`a-${s.label}`} d={area(s.values)} fill={s.color} opacity={0.22} />
          ))}
        {series.map((s) => (
          <path
            key={`l-${s.label}`}
            d={line(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            strokeLinejoin="round"
          />
        ))}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} className={styles.crosshair} />
            {series.map((s) =>
              s.values[hover] !== undefined ? (
                <circle key={s.label} cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} />
              ) : null,
            )}
          </g>
        )}
      </svg>

      <div className={styles.legend}>
        {series.map((s) => (
          <span key={s.label} className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: s.dashed ? "none" : s.color, borderColor: s.color }}
            />
            {s.label}
            {hover !== null && s.values[hover] !== undefined && <strong>{nzd(s.values[hover])}</strong>}
          </span>
        ))}
        {band && (
          <span className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: band.color, opacity: 0.3 }} />
            {band.label}
            {hover !== null && band.low[hover] !== undefined && (
              <strong>
                {nzdShort(band.low[hover])}–{nzdShort(band.high[hover])}
              </strong>
            )}
          </span>
        )}
        {hover !== null && <span className={styles.legendAt}>{xLabel(hover)}</span>}
      </div>
    </div>
  )
}

export default GrowthChart

"use client"

import Link from "next/link"
import Button from "@/components/button/button"
import { segmentLabel } from "@/components/retainingWall/wallPlan"
import { MAIN_PRIVATE, SERVICE } from "@/components/stairs/stairs"
import {
  MAX_STAIR_ANGLE_DEG,
  MIN_STAIR_ANGLE_DEG,
  newSiteStair,
  SiteStair,
  STAIR_ANCHOR_LABELS,
  STAIR_TOP_LABELS,
  StairAnchor,
  StairTop,
  StairPlacement,
  placedStairHours,
} from "@/components/site/siteProject"
import { stairLabourHours } from "@/components/stairs/stairMaterials"
import type { EditorAddOnContext } from "../retaining-walls/retainingWallEditor"
import { UnitField } from "../retaining-walls/obstructionsCard"
import StairsPage from "../stairs/stairsPage"
import styles from "../retaining-walls/obstructionsCard.module.scss"

export const STAIR_COLOR = "#4f6378"

const complianceText = (p: StairPlacement) =>
  p.result.compliance === "main" ? MAIN_PRIVATE.label : p.result.compliance === "service" ? `${SERVICE.label} only` : "⚠ Doesn't meet D1"

/** Stairs coming down off the wall: each one's top tread pinned to a
 * point along it, and the stairs calculator under it, its rise from the
 * wall's height there. Folded to a line each, except the one being
 * edited. */
const StairsCard: React.FC<{
  ctx: EditorAddOnContext
  stairs: SiteStair[]
  placements: Map<string, StairPlacement>
  onChange: (next: SiteStair[]) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** the stairs calculator opened on one of these stairs */
  calculatorHref: (stairId: string) => string
}> = ({ ctx, stairs, placements, onChange, selectedId, onSelect, calculatorHref }) => {
  const { profile, locked, endName } = ctx
  const segments = profile?.segments ?? []
  const update = (id: string, patch: Partial<SiteStair>) => onChange(stairs.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  return (
    <div className={styles.card} id="site-stairs">
      <div className={styles.header}>
        <h3>Stairs</h3>
        <Button
          size="small"
          variant="secondary"
          disabled={locked || segments.length === 0}
          onClick={() => {
            const seg = segments[Math.min(ctx.shownSegment, segments.length - 1)]
            const s = newSiteStair(seg.index, seg.lengthM)
            onChange([...stairs, s])
            onSelect(s.id)
          }}
        >
          Add stairs
        </Button>
      </div>
      {(stairs.length === 0 || stairs.some((s) => s.id === selectedId)) && (
        <p className={styles.hint}>
          Stairs from the top of the wall down to the ground in front of it. Pin the top tread to a point along the wall,
          measured from a corner or wall end. The rise comes off the wall there — from its ground, raised by any fill
          where the stair finishes, up to its top, plus or minus what you set. The wall can be the last riser, or the top
          tread can sit level with the top.
        </p>
      )}

      <fieldset disabled={locked} className={styles.lockable}>
        {stairs.map((st, n) => {
          const p = placements.get(st.id)
          const seg = segments[st.segmentIndex]
          const selected = st.id === selectedId
          const key = (f: string) => `st-${st.id}-${f}`
          const name = st.label || "Stairs"
          return (
            <div
              key={st.id}
              className={selected ? styles.itemSelected : styles.item}
              style={{ borderLeftColor: STAIR_COLOR }}
              onClick={() => !selected && onSelect(st.id)}
            >
              <div className={styles.itemHeader}>
                <strong>
                  {n + 1}. {name}
                </strong>
                <span className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.link}
                    aria-expanded={selected}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(selected ? null : st.id)
                    }}
                  >
                    {selected ? "Done" : "Edit"}
                  </button>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={(e) => {
                      e.stopPropagation()
                      const copy = { ...st, id: Math.random().toString(36).slice(2, 10), distanceM: Math.round((st.distanceM + st.input.width / 1000 + 0.5) * 100) / 100 }
                      onChange([...stairs, copy])
                      onSelect(copy.id)
                    }}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={(e) => {
                      e.stopPropagation()
                      onChange(stairs.filter((x) => x.id !== st.id))
                      if (selected) onSelect(null)
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>

              <p className={styles.summary}>
                {segments.length > 1 ? `Wall ${segmentLabel(st.segmentIndex)} · ` : ""}
                {STAIR_ANCHOR_LABELS[st.anchor].replace("Its ", "")} {st.distanceM.toFixed(2)} m from {endName(st.segmentIndex, st.from)}
                {p
                  ? ` · ${p.result.risers} risers of ${Math.round(p.result.rise)} (${p.input.totalRise} total) · ${Math.round(p.result.going)} going · ${(p.result.totalRun / 1000).toFixed(2)} m out · ${complianceText(p)}`
                  : " · the wall needs a height first"}
              </p>
              {p?.problems.map((msg) => (
                <p key={msg} className={styles.warn}>
                  ⚠ {msg}
                </p>
              ))}

              {selected && (
                <>
                  <div className={styles.grid} style={{ marginTop: "0.75rem" }}>
                    <div className={styles.field}>
                      <label htmlFor={key("label")}>Name (optional)</label>
                      <input
                        id={key("label")}
                        key={`${key("label")}-${st.label}`}
                        type="text"
                        placeholder="e.g. Steps to the lawn"
                        defaultValue={st.label}
                        onBlur={(e) => e.target.value.trim() !== st.label && update(st.id, { label: e.target.value.trim() })}
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={key("wall")}>Comes off wall</label>
                      <select
                        id={key("wall")}
                        value={st.segmentIndex}
                        onChange={(e) => {
                          const i = Number(e.target.value)
                          update(st.id, { segmentIndex: i, distanceM: Math.min(st.distanceM, segments[i]?.lengthM ?? st.distanceM) })
                        }}
                      >
                        {segments.map((s) => (
                          <option key={s.index} value={s.index}>
                            {segments.length > 1 ? `Wall ${segmentLabel(s.index)}` : "The wall"} · {s.lengthM.toFixed(2)} m
                          </option>
                        ))}
                        {!seg && <option value={st.segmentIndex}>A wall that&apos;s gone</option>}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={key("from")}>Measured from</label>
                      <select
                        id={key("from")}
                        value={st.from}
                        onChange={(e) => {
                          const from = e.target.value as "start" | "end"
                          // keep it where it is, measured from the other end
                          const d = seg ? Math.round((seg.lengthM - st.distanceM) * 1000) / 1000 : st.distanceM
                          const anchor: StairAnchor = st.anchor === "near" ? "far" : st.anchor === "far" ? "near" : "centre"
                          update(st.id, { from, distanceM: Math.max(0, d), anchor })
                        }}
                      >
                        <option value="start">{endName(st.segmentIndex, "start")}</option>
                        <option value="end">{endName(st.segmentIndex, "end")}</option>
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor={key("anchor")}>Fixed point is at the top tread&apos;s</label>
                      <select id={key("anchor")} value={st.anchor} onChange={(e) => update(st.id, { anchor: e.target.value as StairAnchor })}>
                        {(Object.keys(STAIR_ANCHOR_LABELS) as StairAnchor[]).map((a) => (
                          <option key={a} value={a}>
                            {STAIR_ANCHOR_LABELS[a].replace("Its ", "")}
                          </option>
                        ))}
                      </select>
                    </div>
                    <UnitField
                      id={key("distance")}
                      label="Distance to the fixed point (m)"
                      value={st.distanceM}
                      scale={1}
                      step={0.01}
                      min={0}
                      max={seg?.lengthM}
                      onCommit={(v) => v !== null && update(st.id, { distanceM: v })}
                    />
                    <UnitField
                      id={key("angle")}
                      label="Angle off the wall (°, 90 = straight out)"
                      value={st.angleDeg}
                      scale={1}
                      step={5}
                      min={MIN_STAIR_ANGLE_DEG}
                      max={MAX_STAIR_ANGLE_DEG}
                      onCommit={(v) => v !== null && update(st.id, { angleDeg: v })}
                    />
                    <UnitField
                      id={key("bottom")}
                      label="Bottom: finished ground above the wall's ground (mm)"
                      value={st.bottomOffsetMm}
                      scale={1}
                      step={10}
                      min={-1000}
                      max={2000}
                      onCommit={(v) => v !== null && update(st.id, { bottomOffsetMm: v })}
                    />
                    <UnitField
                      id={key("topOffset")}
                      label="Top: finishes above the top of the wall (mm, − for below)"
                      value={st.topOffsetMm}
                      scale={1}
                      step={10}
                      min={-2000}
                      max={1000}
                      onCommit={(v) => v !== null && update(st.id, { topOffsetMm: v })}
                    />
                    <div className={styles.field}>
                      <label htmlFor={key("top")}>At the top</label>
                      <select id={key("top")} value={st.top} onChange={(e) => update(st.id, { top: e.target.value as StairTop })}>
                        {(Object.keys(STAIR_TOP_LABELS) as StairTop[]).map((t) => (
                          <option key={t} value={t}>
                            {STAIR_TOP_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {p && (
                    <p className={styles.status}>
                      From the wall there: top RL {p.topLevelM.toFixed(3)}, ground RL {p.groundLevelM.toFixed(3)}. The stair runs from RL{" "}
                      {p.bottomLevelM.toFixed(3)} at the bottom{st.bottomOffsetMm ? ` (${st.bottomOffsetMm > 0 ? "+" : ""}${Math.round(st.bottomOffsetMm)} fill)` : ""} up to RL{" "}
                      {p.stairTopLevelM.toFixed(3)}
                      {st.topOffsetMm ? ` (${st.topOffsetMm > 0 ? "+" : ""}${Math.round(st.topOffsetMm)} on the top of the wall)` : ""} —{" "}
                      {p.input.totalRise} mm of rise.
                      {st.top === "onWall" && " The top tread, level with the top, is in the material order (its own frame and boards)."}
                    </p>
                  )}
                  {p && (
                    <div className={styles.grid}>
                      <UnitField
                        id={key("hours")}
                        label={`Labour for the estimate (hours${st.labourHours === null ? ", rough allowance" : ""})`}
                        value={placedStairHours(p)}
                        scale={1}
                        step={0.5}
                        min={0}
                        max={500}
                        onCommit={(v) => update(st.id, { labourHours: v === null || v === stairLabourHours(p.result, p.layout) ? null : v })}
                      />
                      <div className={styles.field}>
                        <label>The stairs calculator</label>
                        <Link href={calculatorHref(st.id)} target="_blank" onClick={(e) => e.stopPropagation()}>
                          Open this stair in the calculator ↗
                        </Link>
                      </div>
                    </div>
                  )}
                  {p && (
                    // the full stairs calculator, run off this stair's inputs
                    <div onClick={(e) => e.stopPropagation()}>
                      <StairsPage
                        value={p.input}
                        onChange={(input) => update(st.id, { input: { ...input, totalRise: st.input.totalRise } })}
                        riseNote="From the wall: the bottom to the top levels set above"
                        extraTopTread={st.top === "onWall"}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </fieldset>
    </div>
  )
}

export default StairsCard

/** The stairs on the plan: every tread outlined, the top edge where it
 * meets the wall, and the fixed point marked. */
export const StairsPlanOverlay: React.FC<{
  placements: StairPlacement[]
  selectedId: string | null
  onSelect: (id: string) => void
  strokeW: number
  fontSize: number
}> = ({ placements, selectedId, onSelect, strokeW, fontSize }) => (
  <g>
    {placements.map((p) => {
      const picked = p.stair.id === selectedId
      const pts = (poly: { xM: number; yM: number }[]) => poly.map((q) => `${q.xM},${q.yM}`).join(" ")
      const all = p.treads.flat()
      const cx = all.reduce((acc, q) => acc + q.xM, 0) / (all.length || 1)
      const cy = all.reduce((acc, q) => acc + q.yM, 0) / (all.length || 1)
      return (
        <g key={p.stair.id} onClick={() => onSelect(p.stair.id)} style={{ cursor: "pointer" }} role="button" aria-label={`${p.stair.label || "Stairs"} — tap to pick it out`}>
          {p.treads.map((poly, i) => (
            <polygon
              key={i}
              points={pts(poly)}
              fill={STAIR_COLOR}
              fillOpacity={picked ? 0.35 : 0.2}
              stroke={STAIR_COLOR}
              strokeWidth={strokeW * (picked ? 0.45 : 0.3)}
              strokeLinejoin="round"
            />
          ))}
          <line
            x1={p.topEdge[0].xM}
            y1={p.topEdge[0].yM}
            x2={p.topEdge[1].xM}
            y2={p.topEdge[1].yM}
            stroke={STAIR_COLOR}
            strokeWidth={strokeW * 0.8}
            strokeLinecap="round"
          />
          <circle cx={p.fixedPoint.xM} cy={p.fixedPoint.yM} r={strokeW * 1.4} fill="#fff" stroke={STAIR_COLOR} strokeWidth={strokeW * 0.5} />
          <text x={cx} y={cy} fontSize={fontSize * 0.75} textAnchor="middle" dominantBaseline="middle" fill={STAIR_COLOR} fontWeight={600} pointerEvents="none">
            {p.stair.label || "Stairs"} ↓
          </text>
        </g>
      )
    })}
  </g>
)

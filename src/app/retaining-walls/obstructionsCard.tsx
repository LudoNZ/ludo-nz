"use client"

import Button from "@/components/button/button"
import { ProfileObstruction, WallProfile } from "@/components/retainingWall/postProfile"
import {
  DEFAULT_OBSTRUCTION_CLEARANCE_M,
  MAX_ANGLE_DEG,
  MIN_ANGLE_DEG,
  newObstruction,
  Obstruction,
  OBSTRUCTION_TYPE_LIST,
  OBSTRUCTION_TYPES,
  ObstructionType,
} from "@/components/retainingWall/obstructions"
import { segmentLabel } from "@/components/retainingWall/wallPlan"
import styles from "./obstructionsCard.module.scss"

/** A number box that commits when it's left (or Enter is pressed), in
 * display units: `scale` turns the stored value (m) into what's shown. */
export const UnitField: React.FC<{
  id: string
  label: string
  value: number | null
  scale: number
  step: number
  min?: number
  max?: number
  placeholder?: string
  onCommit: (value: number | null) => void
}> = ({ id, label, value, scale, step, min, max, placeholder, onCommit }) => {
  const shown = value === null ? "" : String(Math.round(value * scale * 1000) / 1000)
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        key={`${id}-${shown}`}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        defaultValue={shown}
        onBlur={(e) => {
          const raw = e.target.value.trim()
          if (raw === "") {
            if (placeholder) onCommit(null)
            else e.target.value = shown
            return
          }
          let n = Number(raw)
          if (!Number.isFinite(n)) return void (e.target.value = shown)
          if (min !== undefined) n = Math.max(min, n)
          if (max !== undefined) n = Math.min(max, n)
          if (String(n) !== shown) onCommit(n / scale)
          else e.target.value = shown
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
      />
    </div>
  )
}

/** What an obstruction means for the posts, in a line. */
function statusOf(zone: ProfileObstruction | undefined, profile: WallProfile, maxBoardM: number): { text: string; warn: boolean } {
  if (!zone) return { text: "", warn: false }
  if (!zone.onWall)
    return {
      text: "⚠ It's past the end of its wall — move it, or pick another wall.",
      warn: true,
    }
  const list = (ids: number[]) => ids.map((i) => `#${i + 1}`).join(", ")
  if (zone.clashPostIndices.length)
    return {
      text: `⚠ Hole${zone.clashPostIndices.length > 1 ? "s" : ""} ${list(zone.clashPostIndices)} reach${zone.clashPostIndices.length > 1 ? "" : "es"} into its clearance zone. Move or fix the post${zone.clashPostIndices.length > 1 ? "s" : ""}, or make the hole${zone.clashPostIndices.length > 1 ? "s" : ""} shallower.`,
      warn: true,
    }
  const beside = profile.posts.filter((p) => p.clearOf === zone.obstruction.id).map((p) => p.index)
  const seg = profile.segments[zone.obstruction.segmentIndex]
  const span = zone.spanM
  const notes: string[] = []
  if (beside.length) notes.push(`Posts ${list(beside)} go either side of it`)
  else notes.push(zone.zoneTopDepthM > 0 ? "The holes clear it as laid out" : "The holes clear it")
  if (span !== null) {
    notes.push(`spanned by a ${Math.round(span * 1000)}mm bay`)
    if (seg && span > seg.tableMaxSpacingM + 1e-6)
      return {
        text: `${notes.join(", ")} — ⚠ wider than the table's ${Math.round(seg.tableMaxSpacingM * 1000)}mm. The posts either side carry more: go up a post size on them, or get it checked.${span > maxBoardM ? ` It's also longer than the longest board (${maxBoardM} m).` : ""}`,
        warn: true,
      }
  }
  return { text: `${notes.join(", ")}.`, warn: false }
}

/** The obstructions in the ground along the wall — pipes, cables, roots —
 * each set a distance from a corner or wall end, at an angle and a depth,
 * with a clearance zone the post holes are kept out of. */
const ObstructionsCard: React.FC<{
  obstructions: Obstruction[]
  onChange: (next: Obstruction[]) => void
  profile: WallProfile | null
  /** m, the standard clearance for each type */
  standardClearances: Partial<Record<ObstructionType, number>>
  onStandardClearancesChange: (next: Partial<Record<ObstructionType, number>>) => void
  /** the wall a new one goes on (the one being looked at) */
  defaultSegment: number
  /** what a wall's start or end post is called */
  endName: (segmentIndex: number, which: "start" | "end") => string
  maxBoardM: number
  /** an obstruction picked out on the drawings */
  selectedId: string | null
  onSelect: (id: string | null) => void
  locked: boolean
}> = ({
  obstructions,
  onChange,
  profile,
  standardClearances,
  onStandardClearancesChange,
  defaultSegment,
  endName,
  maxBoardM,
  selectedId,
  onSelect,
  locked,
}) => {
  const segments = profile?.segments ?? []
  const update = (id: string, patch: Partial<Obstruction>) => onChange(obstructions.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  const standardFor = (type: ObstructionType) => standardClearances[type] ?? DEFAULT_OBSTRUCTION_CLEARANCE_M

  return (
    <div className={styles.card} id="rw-obstructions">
      <div className={styles.header}>
        <h3>Obstructions in the ground</h3>
        <Button
          size="small"
          variant="secondary"
          disabled={locked || segments.length === 0}
          onClick={() => {
            const seg = segments[Math.min(defaultSegment, segments.length - 1)]
            const o = newObstruction(seg.index, seg.lengthM)
            onChange([...obstructions, o])
            onSelect(o.id)
          }}
        >
          Add obstruction
        </Button>
      </div>
      {(obstructions.length === 0 || obstructions.some((o) => o.id === selectedId)) && (
        <p className={styles.hint}>
          A pipe, cable or root the wall has to cross. Set where its centre line crosses — measured from a corner or wall end — the angle it crosses at, how
          deep it is and how wide, and the clearance to keep round it. Posts go either side of it so no hole reaches into the clearance zone. Drag it along the
          wall in the plan, or turn it by its round handle.
        </p>
      )}

      <fieldset disabled={locked} className={styles.lockable}>
        {obstructions.map((o, n) => {
          const zone = profile?.obstructions.find((z) => z.obstruction.id === o.id)
          const status = profile ? statusOf(zone, profile, maxBoardM) : { text: "", warn: false }
          const seg = segments[o.segmentIndex]
          const selected = o.id === selectedId
          const key = (f: string) => `ob-${o.id}-${f}`
          return (
            <div
              key={o.id}
              className={selected ? styles.itemSelected : styles.item}
              style={{ borderLeftColor: OBSTRUCTION_TYPES[o.type].color }}
              onFocus={selected ? () => onSelect(o.id) : undefined}
              onClick={() => onSelect(o.id)}
            >
              <div className={styles.itemHeader}>
                <strong>
                  {n + 1}. {o.label || OBSTRUCTION_TYPES[o.type].label}
                </strong>
                <span className={styles.itemActions}>
                  <button
                    type="button"
                    className={styles.link}
                    aria-expanded={selected}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(selected ? null : o.id)
                    }}
                  >
                    {selected ? "Done" : "Edit"}
                  </button>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={(e) => {
                      e.stopPropagation()
                      const copy = {
                        ...o,
                        id: Math.random().toString(36).slice(2, 10),
                        distanceM: Math.round((o.distanceM + 0.5) * 100) / 100,
                      }
                      onChange([...obstructions, copy])
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
                      onChange(obstructions.filter((x) => x.id !== o.id))
                      if (selected) onSelect(null)
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>
              {!selected && (
                <p className={styles.summary}>
                  {segments.length > 1 ? `Wall ${segmentLabel(o.segmentIndex)} · ` : ""}
                  {o.distanceM.toFixed(2)} m from {endName(o.segmentIndex, o.from)} · {Math.round(o.angleDeg)}° · {Math.round(o.depthM * 1000)} deep ·{" "}
                  {Math.round(o.sizeM * 1000)} wide · {Math.round((o.clearanceM ?? standardFor(o.type)) * 1000)} clear
                </p>
              )}
              {selected && (
                <div className={styles.grid}>
                  <div className={styles.field}>
                    <label htmlFor={key("type")}>Type</label>
                    <select
                      id={key("type")}
                      value={o.type}
                      onChange={(e) =>
                        update(o.id, {
                          type: e.target.value as ObstructionType,
                        })
                      }
                    >
                      {OBSTRUCTION_TYPE_LIST.map((t) => (
                        <option key={t} value={t}>
                          {OBSTRUCTION_TYPES[t].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={key("label")}>Name (optional)</label>
                    <input
                      id={key("label")}
                      key={`${key("label")}-${o.label}`}
                      type="text"
                      placeholder="e.g. SW 100 to sump"
                      defaultValue={o.label}
                      onBlur={(e) => e.target.value !== o.label && update(o.id, { label: e.target.value.trim() })}
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={key("wall")}>Crosses wall</label>
                    <select
                      id={key("wall")}
                      value={o.segmentIndex}
                      onChange={(e) => {
                        const i = Number(e.target.value)
                        update(o.id, {
                          segmentIndex: i,
                          distanceM: Math.min(o.distanceM, segments[i]?.lengthM ?? o.distanceM),
                        })
                      }}
                    >
                      {segments.map((s) => (
                        <option key={s.index} value={s.index}>
                          {segments.length > 1 ? `Wall ${segmentLabel(s.index)}` : "The wall"} · {s.lengthM.toFixed(2)} m
                        </option>
                      ))}
                      {!seg && <option value={o.segmentIndex}>A wall that&apos;s gone</option>}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={key("from")}>Measured from</label>
                    <select
                      id={key("from")}
                      value={o.from}
                      onChange={(e) => {
                        const from = e.target.value as "start" | "end"
                        // keep it where it is, measured from the other end
                        const d = seg ? Math.round((seg.lengthM - o.distanceM) * 1000) / 1000 : o.distanceM
                        update(o.id, { from, distanceM: Math.max(0, d) })
                      }}
                    >
                      <option value="start">{endName(o.segmentIndex, "start")}</option>
                      <option value="end">{endName(o.segmentIndex, "end")}</option>
                    </select>
                  </div>
                  <UnitField
                    id={key("distance")}
                    label="Distance to its centre line (m)"
                    value={o.distanceM}
                    scale={1}
                    step={0.01}
                    min={0}
                    max={seg?.lengthM}
                    onCommit={(v) => v !== null && update(o.id, { distanceM: v })}
                  />
                  <UnitField
                    id={key("angle")}
                    label="Angle to the wall (°, 90 = square)"
                    value={o.angleDeg}
                    scale={1}
                    step={5}
                    min={MIN_ANGLE_DEG}
                    max={MAX_ANGLE_DEG}
                    onCommit={(v) => v !== null && update(o.id, { angleDeg: v })}
                  />
                  <UnitField
                    id={key("depth")}
                    label="Depth to its top (mm)"
                    value={o.depthM}
                    scale={1000}
                    step={10}
                    min={0}
                    onCommit={(v) => v !== null && update(o.id, { depthM: v })}
                  />
                  <UnitField
                    id={key("size")}
                    label="Width / diameter (mm)"
                    value={o.sizeM}
                    scale={1000}
                    step={5}
                    min={5}
                    onCommit={(v) => v !== null && update(o.id, { sizeM: v })}
                  />
                  <UnitField
                    id={key("clearance")}
                    label="Clearance all round (mm)"
                    value={o.clearanceM}
                    scale={1000}
                    step={10}
                    min={0}
                    placeholder={`Standard — ${Math.round(standardFor(o.type) * 1000)}`}
                    onCommit={(v) => update(o.id, { clearanceM: v })}
                  />
                </div>
              )}
              {status.text && <p className={status.warn ? styles.warn : styles.status}>{status.text}</p>}
            </div>
          )
        })}

        <details className={styles.standards}>
          <summary>Standard clearances</summary>
          <p className={styles.hint}>
            The clearance each type gets unless it&apos;s set on the obstruction itself — check what the asset owner asks for. These are saved with the
            calculation settings.
          </p>
          <div className={styles.grid}>
            {OBSTRUCTION_TYPE_LIST.map((t) => (
              <UnitField
                key={t}
                id={`std-clearance-${t}`}
                label={`${OBSTRUCTION_TYPES[t].label} (mm)`}
                value={standardClearances[t] ?? null}
                scale={1000}
                step={10}
                min={0}
                placeholder={`${Math.round(DEFAULT_OBSTRUCTION_CLEARANCE_M * 1000)}`}
                onCommit={(v) => {
                  const next = { ...standardClearances }
                  if (v === null) delete next[t]
                  else next[t] = v
                  onStandardClearancesChange(next)
                }}
              />
            ))}
          </div>
        </details>
      </fieldset>
    </div>
  )
}

export default ObstructionsCard

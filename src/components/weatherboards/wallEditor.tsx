"use client"

import { Opening, Wall, WallEdge, WallEnd } from "./types"
import { WallResult, edgePoints } from "./weatherboardCalc"
import { WALL_END_LABELS, WALL_SHAPE_LABELS, WallShape, applyShape, newId, newOpening } from "./data"
import { setWindowCount } from "./quickWall"
import CornersEditor from "./cornersEditor"
import NumField from "./numField"
import styles from "./wallEditor.module.scss"

const heightAt = (edge: WallEdge, lengthMm: number, x: number): number => {
  const pts = edgePoints(edge, lengthMm)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (x <= b.x) return b.x === a.x ? b.y : Math.round(a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x))
  }
  return edge.right
}

/** Left/right heights plus any break points along one edge. A rake that
 * starts part way along is a break point at the same height as the left
 * end, then a different right-hand height. */
const EdgeEditor: React.FC<{
  label: string
  hint: string
  edge: WallEdge
  lengthMm: number
  onChange: (edge: WallEdge) => void
  /** "🔗 North · Living · Left height" for a linked value (top edge only) */
  linkHint?: (kind: string) => string | null
}> = ({ label, hint, edge, lengthMm, onChange, linkHint }) => {
  const linked = (kind: string) => {
    const h = linkHint?.(kind)
    return h ? <span className={styles.linkHint}>🔗 {h}</span> : null
  }
  const sorted = [...edge.breaks].sort((a, b) => a.x - b.x)

  const addBreak = () => {
    // drop the new point midway along the widest gap, on the current line
    const xs = [0, ...sorted.map((b) => b.x), lengthMm]
    let gapAt = 0
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > xs[gapAt + 1] - xs[gapAt]) gapAt = i - 1
    const x = Math.round((xs[gapAt] + xs[gapAt + 1]) / 2)
    onChange({ ...edge, breaks: [...edge.breaks, { id: newId(), x, y: heightAt(edge, lengthMm, x) }] })
  }

  return (
    <fieldset className={styles.edge}>
      <legend>{label}</legend>
      <span className={styles.hint}>{hint}</span>
      <div className={styles.edgeEnds}>
        <label>
          Left end
          <span className={styles.unitInput}>
            <NumField value={edge.left} onChange={(v) => onChange({ ...edge, left: v })} ariaLabel={`${label} left height`} />
            mm
          </span>
          {linked("heightL")}
        </label>
        <label>
          Right end
          <span className={styles.unitInput}>
            <NumField value={edge.right} onChange={(v) => onChange({ ...edge, right: v })} ariaLabel={`${label} right height`} />
            mm
          </span>
          {linked("heightR")}
        </label>
      </div>
      {sorted.length > 0 && (
        <div className={styles.breaks}>
          {sorted.map((b) => (
            <div key={b.id} className={styles.breakRow}>
              <span>at</span>
              <span className={styles.unitInput}>
                <NumField
                  value={b.x}
                  min={0}
                  ariaLabel="Break point distance from left end"
                  onChange={(v) => onChange({ ...edge, breaks: edge.breaks.map((p) => (p.id === b.id ? { ...p, x: v } : p)) })}
                />
                mm
              </span>
              <span>height</span>
              <span className={styles.unitInput}>
                <NumField
                  value={b.y}
                  ariaLabel="Break point height"
                  onChange={(v) => onChange({ ...edge, breaks: edge.breaks.map((p) => (p.id === b.id ? { ...p, y: v } : p)) })}
                />
                mm
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Remove break point"
                onClick={() => onChange({ ...edge, breaks: edge.breaks.filter((p) => p.id !== b.id) })}
              >
                ×
              </button>
              {(b.x <= 0 || b.x >= lengthMm) && <span className={styles.warn}>outside the wall — ignored</span>}
              {linked(`break:${b.id}`)}
            </div>
          ))}
        </div>
      )}
      <button type="button" className={styles.linkButton} onClick={addBreak}>
        + Break point
      </button>
    </fieldset>
  )
}

const OPENING_FIELDS: { key: keyof Omit<Opening, "id" | "auto">; label: string; min?: number }[] = [
  { key: "x", label: "From left" },
  { key: "sill", label: "Sill height" },
  { key: "width", label: "Width", min: 1 },
  { key: "height", label: "Height", min: 1 },
]

/** Windows and doors in one wall — the numbers mirror what dragging on
 * the elevation does, for when the plans give exact positions. */
const OpeningsEditor: React.FC<{
  wall: Wall
  selectedOpeningId: string | null
  onSelect: (id: string) => void
  onChange: (openings: Opening[]) => void
}> = ({ wall, selectedOpeningId, onSelect, onChange }) => {
  const openings = wall.openings ?? []
  return (
    <fieldset className={styles.edge}>
      <legend>Openings</legend>
      <div className={styles.countRow}>
        <span className={styles.countLabel}>Count</span>
        <div className={styles.stepper}>
          <button
            type="button"
            aria-label="One less opening"
            onClick={() => onChange(setWindowCount(wall, Math.max(0, openings.length - 1)).openings)}
          >
            −
          </button>
          <span aria-live="polite">{openings.length}</span>
          <button type="button" aria-label="One more opening" onClick={() => onChange(setWindowCount(wall, openings.length + 1).openings)}>
            +
          </button>
        </div>
        <span className={styles.hint}>
          New windows are spaced evenly and re-spaced with the wall until you drag one or type its numbers — then it&apos;s
          pinned and never auto-moved. Taking one away removes an auto-placed one first.
        </span>
      </div>
      <span className={styles.hint}>
        Courses an opening fully covers stop either side of it; head and sill courses run through and get notched.
      </span>
      {openings.map((o, i) => (
        <div
          key={o.id}
          className={`${styles.openingRow} ${o.id === selectedOpeningId ? styles.openingRowSelected : ""}`}
          onFocusCapture={() => onSelect(o.id)}
          onPointerDown={() => onSelect(o.id)}
        >
          <span className={styles.openingName}>#{i + 1}</span>
          <span className={o.auto ? styles.tagAuto : styles.tagPinned} title={o.auto ? "Auto-placed" : "Pinned where you put it"}>
            {o.auto ? "auto" : "pinned"}
          </span>
          {OPENING_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <span className={styles.unitInput}>
                <NumField
                  value={o[f.key]}
                  min={f.min}
                  step={10}
                  onChange={(v) => onChange(openings.map((p) => (p.id === o.id ? { ...p, [f.key]: v, auto: false } : p)))}
                />
                mm
              </span>
            </label>
          ))}
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Remove opening ${i + 1}`}
            onClick={() => onChange(openings.filter((p) => p.id !== o.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.linkButton}
        onClick={() => {
          const o = newOpening(wall)
          onChange([...openings, o])
          onSelect(o.id)
        }}
      >
        + Opening
      </button>
    </fieldset>
  )
}

const WallEditor: React.FC<{
  wall: Wall
  result: WallResult
  projectCoverMm: number
  selectedOpeningId: string | null
  onSelectOpening: (id: string) => void
  onChange: (wall: Wall) => void
  onRemove: () => void
  onDuplicate: () => void
  /** what a linked dimension of this wall takes its value from */
  linkHint?: (kind: string) => string | null
}> = ({ wall, result, projectCoverMm, selectedOpeningId, onSelectOpening, onChange, onRemove, onDuplicate, linkHint }) => {
  const pieces = result.courses.reduce((s, c) => s + c.pieces.length, 0)
  const joins = result.courses.reduce((s, c) => s + c.joins.length, 0)

  return (
    <div className={styles.wallCard}>
      <div className={styles.header}>
        <input
          className={styles.nameInput}
          value={wall.name}
          aria-label="Wall name"
          placeholder="Wall name"
          onChange={(e) => onChange({ ...wall, name: e.target.value })}
        />
        <div className={styles.headerButtons}>
          <button type="button" className={styles.linkButton} onClick={onDuplicate}>
            Duplicate
          </button>
          <button type="button" className={`${styles.linkButton} ${styles.danger}`} onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <div className={styles.row}>
        <label>
          Length
          <span className={styles.unitInput}>
            <NumField value={wall.lengthMm} min={0} step={100} onChange={(v) => onChange({ ...wall, lengthMm: v })} />
            mm
          </span>
          {linkHint?.("width") && <span className={styles.linkHint}>🔗 {linkHint("width")}</span>}
        </label>
        <label>
          Cover
          <span className={styles.unitInput}>
            <NumField
              value={wall.coverMm ?? projectCoverMm}
              min={10}
              onChange={(v) => onChange({ ...wall, coverMm: v === projectCoverMm ? null : v })}
            />
            mm
          </span>
          <span className={styles.hint}>{wall.coverMm === null ? "project default" : "overridden for this wall"}</span>
        </label>
        {(["leftEnd", "rightEnd"] as const).map((key) => (
          <label key={key}>
            {key === "leftEnd" ? "Left end" : "Right end"}
            <select
              value={wall[key] ?? "externalFacing"}
              onChange={(e) => onChange({ ...wall, [key]: e.target.value as WallEnd })}
            >
              {(Object.keys(WALL_END_LABELS) as WallEnd[]).map((t) => (
                <option key={t} value={t}>
                  {WALL_END_LABELS[t]}
                </option>
              ))}
            </select>
            {wall[key] === "internalScriber" && <span className={styles.hint}>mark it on only one of the two walls</span>}
          </label>
        ))}
      </div>

      <div className={styles.shapes}>
        <span className={styles.hint}>Start from:</span>
        {(Object.keys(WALL_SHAPE_LABELS) as WallShape[]).map((s) => (
          <button key={s} type="button" className={styles.shapeButton} onClick={() => onChange(applyShape(wall, s))}>
            {WALL_SHAPE_LABELS[s]}
          </button>
        ))}
      </div>

      <div className={styles.edges}>
        <EdgeEditor
          label="Top edge"
          hint="Height of the top of the cladding above datum — soffit, rake or gable line"
          edge={wall.top}
          lengthMm={wall.lengthMm}
          onChange={(top) => onChange({ ...wall, top })}
          linkHint={linkHint}
        />
        <EdgeEditor
          label="Bottom edge"
          hint="Bottom of the cladding — drop it below 0 where the ground or foundation falls away"
          edge={wall.bottom}
          lengthMm={wall.lengthMm}
          onChange={(bottom) => onChange({ ...wall, bottom })}
        />
      </div>

      <fieldset className={styles.edge}>
        <legend>Corners</legend>
        <CornersEditor wall={wall} onChange={(corners) => onChange({ ...wall, corners })} />
      </fieldset>

      <OpeningsEditor
        wall={wall}
        selectedOpeningId={selectedOpeningId}
        onSelect={onSelectOpening}
        onChange={(openings) => onChange({ ...wall, openings })}
      />

      <p className={styles.summary}>
        {result.courses.length} courses · {result.netAreaM2.toFixed(2)} m² net of openings · {pieces} pieces ·{" "}
        {joins} joins
      </p>
    </div>
  )
}

export default WallEditor

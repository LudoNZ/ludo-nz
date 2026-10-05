"use client"

import NumField from "./numField"
import { Opening } from "./types"
import styles from "./openingFields.module.scss"

/** How much higher the right jamb starts when a unit is switched to a
 * raking top — just a sensible slope to edit from. */
const DEFAULT_RAKE_RISE_MM = 400

export const isRaking = (o: Opening) => o.heightRight !== undefined

export const withShape = (o: Opening, raking: boolean): Opening => {
  if (raking) return isRaking(o) ? o : { ...o, heightRight: o.height + DEFAULT_RAKE_RISE_MM }
  const { heightRight: _gone, ...rect } = o
  void _gone
  return rect
}

const Field: React.FC<{ label: string; value: number; min?: number; onChange: (v: number) => void }> = ({
  label,
  value,
  min,
  onChange,
}) => (
  <label className={styles.field}>
    <span className={styles.label}>{label}</span>
    <span className={styles.unitInput}>
      <NumField value={value} min={min} step={10} onChange={onChange} ariaLabel={label} />
      mm
    </span>
  </label>
)

/** Shape (rectangle or raking top) and size/position of one window or
 * door — the same controls on the elevation's selected-opening strip and
 * in the wall's openings list. Every change comes back pinned (auto off):
 * the user has placed it by hand. */
const OpeningFields: React.FC<{ opening: Opening; onChange: (o: Opening) => void }> = ({ opening: o, onChange }) => {
  const set = (patch: Partial<Opening>) => onChange({ ...o, ...patch, auto: false })
  const raking = isRaking(o)
  return (
    <div className={styles.fields}>
      <div className={styles.shape} role="radiogroup" aria-label="Opening shape">
        {[false, true].map((r) => (
          <button
            key={String(r)}
            type="button"
            role="radio"
            aria-checked={raking === r}
            className={raking === r ? styles.on : ""}
            onClick={() => onChange({ ...withShape(o, r), auto: false })}
            title={r ? "Raking top" : "Rectangle"}
          >
            <svg viewBox="0 0 24 18" aria-hidden="true">
              <path d={r ? "M3 16 L3 8 L21 2 L21 16 Z" : "M3 16 L3 3 L21 3 L21 16 Z"} />
            </svg>
            {r ? "Raking top" : "Rectangle"}
          </button>
        ))}
      </div>
      <Field label="Width" value={o.width} min={1} onChange={(v) => set({ width: v })} />
      {raking ? (
        <>
          <Field label="Left height" value={o.height} min={1} onChange={(v) => set({ height: v })} />
          <Field label="Right height" value={o.heightRight ?? o.height} min={1} onChange={(v) => set({ heightRight: v })} />
        </>
      ) : (
        <Field label="Height" value={o.height} min={1} onChange={(v) => set({ height: v })} />
      )}
      <Field label="From left" value={o.x} onChange={(v) => set({ x: v })} />
      <Field label="Sill height" value={o.sill} onChange={(v) => set({ sill: v })} />
    </div>
  )
}

export default OpeningFields

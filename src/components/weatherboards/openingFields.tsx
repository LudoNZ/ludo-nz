"use client"

import NumField from "./numField"
import { DEFAULT_PLACE, held, measureX, measureZ, remeasure, sillFrom, xFrom } from "./openingPlace"
import { Opening, OpeningPlace } from "./types"
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
      <NumField value={value} min={min} step={1} onChange={onChange} ariaLabel={label} />
      mm
    </span>
  </label>
)

/** a small padlock: shut, the measurement's held as the wall or the unit changes */
const Lock: React.FC<{ locked: boolean; what: string; onToggle: () => void }> = ({ locked, what, onToggle }) => (
  <button
    type="button"
    className={`${styles.lock} ${locked ? styles.lockOn : ""}`}
    aria-pressed={locked}
    aria-label={`${locked ? "Unlock" : "Lock"} ${what}`}
    title={locked ? `${what} held as the wall or its size changes — tap to free it` : `${what} free — tap to hold it`}
    onClick={onToggle}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" />
      <path d={locked ? "M5 7V5a3 3 0 0 1 6 0v2" : "M5 7V5a3 3 0 0 1 5.6-1.5"} fill="none" />
    </svg>
  </button>
)

/** a measurement's label, as a choice of what it's measured from, with its lock */
const PlaceField = <K extends string>({
  options,
  value,
  onPick,
  locked,
  onLock,
  mm,
  onChange,
}: {
  options: { value: K; label: string }[]
  value: K
  onPick: (v: K) => void
  locked: boolean
  onLock: () => void
  mm: number
  onChange: (v: number) => void
}) => {
  const label = options.find((x) => x.value === value)?.label ?? ""
  return (
    <div className={styles.field}>
      <span className={styles.placeLabel}>
        <select className={styles.placeSelect} value={value} onChange={(e) => onPick(e.target.value as K)} aria-label={`${label}: measured from`}>
          {options.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
        <Lock locked={locked} what={label} onToggle={onLock} />
      </span>
      <span className={styles.unitInput}>
        <NumField value={Math.round(mm)} step={1} onChange={onChange} ariaLabel={label} />
        mm
      </span>
    </div>
  )
}

const ALONG: { value: OpeningPlace["x"]; label: string }[] = [
  { value: "left", label: "From left" },
  { value: "right", label: "From right" },
  { value: "centre", label: "Off centre" },
]
const UP: { value: OpeningPlace["z"]; label: string }[] = [
  { value: "head", label: "Head height" },
  { value: "sill", label: "Sill height" },
]

/** Shape (rectangle or raking top) and size/position of one window or
 * door — the same controls on the elevation's selected-opening strip and
 * in the wall's openings list. Its place along the wall is measured from
 * the left, the right or the middle, and up to its head or its sill, each
 * locked (held as the wall or its size changes) or not. Every change comes
 * back pinned (auto off): the user has placed it by hand. */
const OpeningFields: React.FC<{
  opening: Opening
  onChange: (o: Opening) => void
  /** the wall's length, to measure from its right end or its middle */
  wallLength: number
  /** its type's (where it has one): what it's measured from by default, to set from this one */
  typeDefault?: { name: string; place: Omit<OpeningPlace, "xMm" | "zMm"> | undefined; save: (place: Omit<OpeningPlace, "xMm" | "zMm">) => void }
}> = ({ opening, onChange, wallLength: L, typeDefault }) => {
  // (measured the default way until it's set)
  const o = opening.place ? opening : remeasure(opening, L, typeDefault?.place ?? DEFAULT_PLACE)
  const p = o.place!
  const set = (patch: Partial<Opening>) => onChange({ ...o, ...patch, auto: false })
  // a new size, kept where its locks say
  const resize = (patch: Partial<Opening>) => onChange({ ...held({ ...o, ...patch }, L), auto: false })
  const setPlace = (patch: Partial<OpeningPlace>) => onChange({ ...remeasure({ ...o, place: { ...p, ...patch } }, L), auto: false })
  const raking = isRaking(o)
  const anchors = { x: p.x, z: p.z, lockX: p.lockX, lockZ: p.lockZ }
  const typePlace = typeDefault?.place ?? DEFAULT_PLACE
  const differs = typeDefault && (["x", "z", "lockX", "lockZ"] as const).some((k) => anchors[k] !== typePlace[k])
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
            onClick={() => onChange({ ...held(withShape(o, r), L), auto: false })}
            title={r ? "Raking top" : "Rectangle"}
          >
            <svg viewBox="0 0 24 18" aria-hidden="true">
              <path d={r ? "M3 16 L3 8 L21 2 L21 16 Z" : "M3 16 L3 3 L21 3 L21 16 Z"} />
            </svg>
            {r ? "Raking top" : "Rectangle"}
          </button>
        ))}
      </div>
      <Field label="Width" value={o.width} min={1} onChange={(v) => resize({ width: v })} />
      {raking ? (
        <>
          <Field label="Left height" value={o.height} min={1} onChange={(v) => resize({ height: v })} />
          <Field label="Right height" value={o.heightRight ?? o.height} min={1} onChange={(v) => resize({ heightRight: v })} />
        </>
      ) : (
        <Field label="Height" value={o.height} min={1} onChange={(v) => resize({ height: v })} />
      )}
      <PlaceField
        options={ALONG}
        value={p.x}
        onPick={(x) => setPlace({ x })}
        locked={p.lockX}
        onLock={() => setPlace({ lockX: !p.lockX })}
        mm={measureX(o, L, p.x)}
        onChange={(v) => set(remeasure({ ...o, x: xFrom(o, L, p.x, v) }, L))}
      />
      <PlaceField
        options={UP}
        value={p.z}
        onPick={(z) => setPlace({ z })}
        locked={p.lockZ}
        onLock={() => setPlace({ lockZ: !p.lockZ })}
        mm={measureZ(o, p.z)}
        onChange={(v) => set(remeasure({ ...o, sill: sillFrom(o, p.z, v) }, L))}
      />
      {typeDefault && differs && (
        <button type="button" className={styles.typeDefault} onClick={() => typeDefault.save(anchors)}>
          Make this the {typeDefault.name}&apos;s default
        </button>
      )}
    </div>
  )
}

export default OpeningFields

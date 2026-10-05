"use client"

import NumField from "./numField"
import { QUICK_SHAPE_LABELS, QuickShape, QuickWallForm, shapeDefaults } from "./quickWall"
import styles from "./quickAddWall.module.scss"

/** Little outline of each starting shape for the picker. */
const SHAPE_ICONS: Record<QuickShape, string> = {
  rectangle: "M4 28 L4 10 L44 10 L44 28 Z",
  gable: "M4 28 L4 14 L24 4 L44 14 L44 28 Z",
  skillion: "M4 28 L4 16 L44 6 L44 28 Z",
  partRake: "M4 28 L4 16 L22 16 L44 6 L44 28 Z",
}

const Field: React.FC<{ label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; hint?: string }> = ({
  label,
  value,
  onChange,
  min = 0,
  step = 100,
  hint,
}) => (
  <label className={styles.field}>
    <span className={styles.label}>{label}</span>
    <span className={styles.unitInput}>
      <NumField value={value} min={min} step={step} onChange={onChange} />
      mm
    </span>
    {hint && <span className={styles.hint}>{hint}</span>}
  </label>
)

/** The "+ Add wall" tab: pick a shape, check the pre-filled sizes and
 * window count against the plans, hit Add. The wall previews dashed on
 * the elevation as you go; edges, sloping ground and trims are all
 * editable on the wall's own tab once it's added. */
const QuickAddWall: React.FC<{
  form: QuickWallForm
  onChange: (form: QuickWallForm) => void
  onAdd: () => void
}> = ({ form, onChange, onAdd }) => {
  const set = (patch: Partial<QuickWallForm>) => onChange({ ...form, ...patch })

  return (
    <form
      className={styles.quickAdd}
      // step={100} is only for the arrow keys — a derived 3519 mm ridge
      // must not make the browser silently refuse to submit
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onAdd()
      }}
    >
      <div className={styles.shapes} role="radiogroup" aria-label="Wall shape">
        {(Object.keys(QUICK_SHAPE_LABELS) as QuickShape[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={form.shape === s}
            className={`${styles.shape} ${form.shape === s ? styles.shapeActive : ""}`}
            onClick={() => onChange(shapeDefaults(form, s))}
          >
            <svg viewBox="0 0 48 32" aria-hidden="true">
              <path d={SHAPE_ICONS[s]} />
            </svg>
            {QUICK_SHAPE_LABELS[s]}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input className={styles.nameInput} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <Field label="Width" value={form.widthMm} min={100} onChange={(v) => set({ widthMm: v })} />
        <Field
          label={form.shape === "rectangle" ? "Height" : form.shape === "gable" ? "Eaves height" : "Low end height"}
          value={form.heightMm}
          min={100}
          onChange={(v) => set({ heightMm: v })}
        />
        {form.shape === "gable" && <Field label="Ridge height" value={form.ridgeMm} min={100} onChange={(v) => set({ ridgeMm: v })} />}
        {form.shape === "partRake" && (
          <Field
            label="Rake starts at"
            value={form.rakeStartMm}
            onChange={(v) => set({ rakeStartMm: v })}
            hint="from the left end"
          />
        )}
        {(form.shape === "skillion" || form.shape === "partRake") && (
          <Field label="High end height" value={form.highMm} min={100} onChange={(v) => set({ highMm: v })} />
        )}
      </div>

      <div className={styles.windows}>
        <div className={styles.field}>
          <span className={styles.label}>Windows</span>
          <div className={styles.stepper}>
            <button type="button" aria-label="One less window" onClick={() => set({ windows: Math.max(0, form.windows - 1) })}>
              −
            </button>
            <span aria-live="polite">{form.windows}</span>
            <button type="button" aria-label="One more window" onClick={() => set({ windows: form.windows + 1 })}>
              +
            </button>
          </div>
        </div>
        <Field label="Window width" value={form.windowWidthMm} min={100} onChange={(v) => set({ windowWidthMm: v })} />
        <Field label="Window height" value={form.windowHeightMm} min={100} onChange={(v) => set({ windowHeightMm: v })} />
        <Field label="Head height" value={form.headMm} min={100} onChange={(v) => set({ headMm: v })} hint="above datum" />
      </div>

      <div className={styles.footer}>
        <button type="submit" className={styles.addButton}>
          Add {form.name.trim() || "wall"}
        </button>
        <span className={styles.hint}>
          Windows are spaced evenly until you drag one — sloping ground, break points and corner trims are on the
          wall&apos;s own tab once it&apos;s added.
        </span>
      </div>
    </form>
  )
}

export default QuickAddWall

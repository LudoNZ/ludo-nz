"use client"

import NumField from "./numField"
import { QUICK_SHAPE_LABELS, QuickLinkField, QuickShape, QuickWallForm, shapeDefaults } from "./quickWall"
import CornersEditor from "./cornersEditor"
import { Wall, WallCorner } from "./types"
import styles from "./quickAddWall.module.scss"

/** Little outline of each starting shape for the picker. */
const SHAPE_ICONS: Record<QuickShape, string> = {
  rectangle: "M4 28 L4 10 L44 10 L44 28 Z",
  gable: "M4 28 L4 14 L24 4 L44 14 L44 28 Z",
  skillion: "M4 28 L4 16 L44 6 L44 28 Z",
  partRake: "M4 28 L4 16 L22 16 L44 6 L44 28 Z",
}

interface LinkControl {
  /** "North · Living · Left height" when linked */
  linkedTo: string | null
  onLink: () => void
  onUnlink: () => void
}

const Field: React.FC<{
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  step?: number
  hint?: string
  link?: LinkControl
}> = ({ label, value, onChange, min = 0, step = 100, hint, link }) => (
  <div className={styles.field}>
    <span className={styles.label}>{label}</span>
    <span className={styles.unitInput}>
      {link?.linkedTo ? (
        <input className={styles.linkedValue} value={value} readOnly aria-label={label} />
      ) : (
        <NumField value={value} min={min} step={step} onChange={onChange} ariaLabel={label} />
      )}
      mm
    </span>
    {link &&
      (link.linkedTo ? (
        <span className={styles.linkChip}>
          🔗 {link.linkedTo}
          <button type="button" onClick={link.onUnlink}>
            Unlink
          </button>
        </span>
      ) : (
        <button type="button" className={styles.linkButton} onClick={link.onLink}>
          🔗 Link…
        </button>
      ))}
    {hint && <span className={styles.hint}>{hint}</span>}
  </div>
)

/** The quick wall form. On the "+ Add wall" tab it's pre-filled and
 * previewed dashed on the elevation, and the first change adds the wall
 * (the tab becomes the wall's). On that wall's tab it keeps editing the
 * wall live, with Remove (back to a blank "+ Add wall") and More options
 * (the full editor: edges, sloping ground, corners). */
const QuickAddWall: React.FC<{
  /** shown with every linked field's anchor value already filled in */
  form: QuickWallForm
  onChange: (form: QuickWallForm) => void
  /** the wall the form is editing, once it exists */
  wall?: Wall
  onRemove?: () => void
  onMoreOptions?: () => void
  onCornersChange?: (corners: WallCorner[]) => void
  /** describes a link's anchor for the chip */
  describeLink: (anchorKey: string) => string
  /** open the link picker for one of the form's linkable fields */
  onPickLink: (field: QuickLinkField) => void
}> = ({ form, wall, onChange, onRemove, onMoreOptions, onCornersChange, describeLink, onPickLink }) => {
  const set = (patch: Partial<QuickWallForm>) => onChange({ ...form, ...patch })
  // changing a measurement settles the shape: the picker goes away
  const measure = (patch: Partial<QuickWallForm>) => onChange({ ...form, ...patch, shapeLocked: true })
  const link = (field: QuickLinkField): LinkControl => ({
    linkedTo: form.links[field] ? describeLink(form.links[field] as string) : null,
    onLink: () => onPickLink(field),
    onUnlink: () => {
      const links = { ...form.links }
      delete links[field]
      onChange({ ...form, links })
    },
  })

  return (
    <form
      className={styles.quickAdd}
      noValidate
      onSubmit={(e) => e.preventDefault()}
    >
      {!wall && <p className={styles.lead}>Pick this wall&apos;s shape to start it.</p>}
      {!form.shapeLocked || !wall ? (
        <div className={styles.shapes} role="radiogroup" aria-label="Wall shape">
          {(Object.keys(QUICK_SHAPE_LABELS) as QuickShape[]).map((sh) => (
            <button
              key={sh}
              type="button"
              role="radio"
              aria-checked={!!wall && form.shape === sh}
              className={`${styles.shape} ${wall && form.shape === sh ? styles.shapeActive : ""}`}
              onClick={() => onChange(shapeDefaults(form, sh))}
            >
              <svg viewBox="0 0 48 32" aria-hidden="true">
                <path d={SHAPE_ICONS[sh]} />
              </svg>
              {QUICK_SHAPE_LABELS[sh]}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.shapeChosen}>
          <svg viewBox="0 0 48 32" aria-hidden="true">
            <path d={SHAPE_ICONS[form.shape]} />
          </svg>
          {QUICK_SHAPE_LABELS[form.shape]}
        </p>
      )}

      {wall && (
        <>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input className={styles.nameInput} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <Field label="Width" value={form.widthMm} min={100} onChange={(v) => measure({ widthMm: v })} link={link("width")} />
            <Field
              label={form.shape === "rectangle" ? "Height" : form.shape === "gable" ? "Eaves height" : "Low end height"}
              value={form.heightMm}
              min={100}
              onChange={(v) => measure({ heightMm: v })}
              link={link("height")}
            />
            {form.shape === "gable" && (
              <Field
                label="Ridge height"
                value={form.ridgeMm}
                min={100}
                onChange={(v) => measure({ ridgeMm: v })}
                link={link("ridge")}
              />
            )}
            {form.shape === "partRake" && (
              <Field
                label="Rake starts at"
                value={form.rakeStartMm}
                onChange={(v) => measure({ rakeStartMm: v })}
                hint="from the left end"
              />
            )}
            {(form.shape === "skillion" || form.shape === "partRake") && (
              <Field label="High end height" value={form.highMm} min={100} onChange={(v) => measure({ highMm: v })} />
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

          {onCornersChange && (
            <div className={styles.cornersBlock}>
              <CornersEditor wall={wall} onChange={onCornersChange} />
            </div>
          )}
        </>
      )}

      <div className={styles.footer}>
        {onRemove ? (
          <>
            <button type="button" className={styles.removeButton} onClick={onRemove}>
              Remove wall
            </button>
            {onMoreOptions && (
              <button type="button" className={styles.moreButton} onClick={onMoreOptions}>
                More options — edges, sloping ground, trims →
              </button>
            )}
          </>
        ) : (
          <span className={styles.hint}>
            The wall is added as soon as you pick — sizes, windows and corners come next, and the shape stays
            changeable until you change a measurement.
          </span>
        )}
      </div>
    </form>
  )
}

export default QuickAddWall

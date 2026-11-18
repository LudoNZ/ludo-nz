"use client"

import { useId, useState } from "react"
import styles from "./specCard.module.scss"

/** A titled card of label/value rows — the one presentational shape every
 * structures/ summary (posts, rails, infill) renders itself into, so a
 * future calculator's results read as the same kind of card without
 * rebuilding the layout each time.
 *
 * - `note`: explanatory text under the rows. With `noteToggle` it's tucked
 *   behind a subtle "i" button in the card's top right corner instead.
 * - `alert`: warnings that should always be seen (never tucked away). */
const SpecCard: React.FC<{
  title: string
  rows: { label: string; value: string }[]
  note?: string
  noteToggle?: boolean
  alert?: string
}> = ({ title, rows, note, noteToggle, alert }) => {
  const [open, setOpen] = useState(false)
  const noteId = useId()
  const collapsible = !!note && !!noteToggle
  return (
    <div className={styles.specCard}>
      <div className={styles.specHeader}>
        <h3>{title}</h3>
        {collapsible && (
          <button
            type="button"
            className={`${styles.infoButton} ${open ? styles.infoOpen : ""}`}
            aria-expanded={open}
            aria-controls={noteId}
            aria-label={open ? `Hide notes on ${title}` : `About ${title}`}
            title={open ? "Hide notes" : "How this is worked out"}
            onClick={() => setOpen((o) => !o)}
          >
            i
          </button>
        )}
      </div>
      <dl className={styles.specRows}>
        {rows.map((r) => (
          <div key={r.label} className={styles.specRow}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {alert && <p className={styles.specAlert}>{alert}</p>}
      {note && (!collapsible || open) && (
        <p id={noteId} className={styles.specNote}>
          {note}
        </p>
      )}
    </div>
  )
}

export default SpecCard

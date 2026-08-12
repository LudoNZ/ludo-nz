"use client"

import styles from "./specCard.module.scss"

/** A titled card of label/value rows — the one presentational shape every
 * structures/ summary (posts, rails, infill) renders itself into, so a
 * future calculator's results read as the same kind of card without
 * rebuilding the layout each time. */
const SpecCard: React.FC<{
  title: string
  rows: { label: string; value: string }[]
  note?: string
}> = ({ title, rows, note }) => (
  <div className={styles.specCard}>
    <h3>{title}</h3>
    <dl className={styles.specRows}>
      {rows.map((r) => (
        <div key={r.label} className={styles.specRow}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
    {note && <p className={styles.specNote}>{note}</p>}
  </div>
)

export default SpecCard

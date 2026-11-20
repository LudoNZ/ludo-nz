"use client"

import Link from "next/link"
import { FloorSummary } from "./floorData"
import { SUPPORT_LABELS } from "./frame"
// same card as the other projects pages, so the lists match
import styles from "../weatherboards/projectCard.module.scss"

/** One saved floor on the floors page: its size, then its frame in brief. */
const FloorProjectCard: React.FC<{
  href: string
  name: string
  badge: string
  summary: FloorSummary | null
  updatedAt?: Date | null
}> = ({ href, name, badge, summary, updatedAt }) => (
  <Link href={href} className={styles.card}>
    <div className={styles.titleRow}>
      <h3>{name}</h3>
      <span className={styles.badge}>{badge}</span>
    </div>
    {summary ? (
      <>
        <p className={styles.meta}>
          {(summary.lengthMm / 1000).toFixed(2)} × {(summary.widthMm / 1000).toFixed(2)} m · {SUPPORT_LABELS[summary.support].toLowerCase()}
        </p>
        <p className={styles.order}>
          <strong>{summary.joists} joists</strong> {summary.joistSize.replace("mm", " mm")} · {summary.sheets} sheets
        </p>
        {summary.needsEngineer && <p className={styles.trims}>⚠ Outside this tool&apos;s tables</p>}
      </>
    ) : (
      <p className={styles.meta}>Open to calculate</p>
    )}
    {updatedAt && <p className={styles.updated}>Updated {updatedAt.toLocaleDateString()}</p>}
  </Link>
)

export default FloorProjectCard

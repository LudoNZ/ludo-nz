"use client"

import Link from "next/link"
import { WallSummary } from "./wallProject"
// same card as the weatherboard projects page, so the two lists match
import styles from "../weatherboards/projectCard.module.scss"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** One wall on the projects page: its size, then the order in brief. */
const WallProjectCard: React.FC<{
  href: string
  name: string
  badge: string
  summary: WallSummary | null
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
          {summary.wallLengthM.toFixed(2)} m long
          {summary.walls > 1 && <> · {plural(summary.walls, "wall")}</>} · up to {summary.maxHeightM.toFixed(2)} m high
        </p>
        <p className={styles.order}>
          <strong>{plural(summary.posts, "post")}</strong> · {plural(summary.boards, "board")} · {summary.concreteM3.toFixed(2)} m³
          concrete
        </p>
        {summary.needsEngineer && <p className={styles.trims}>⚠ Part of this wall needs an engineer</p>}
      </>
    ) : (
      <p className={styles.meta}>Open to calculate</p>
    )}
    {updatedAt && <p className={styles.updated}>Updated {updatedAt.toLocaleDateString()}</p>}
  </Link>
)

export default WallProjectCard

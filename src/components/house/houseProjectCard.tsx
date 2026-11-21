"use client"

import Link from "next/link"
import type { HouseSummary } from "./houseProjectStore"
// same card as the other projects pages, so the lists match
import styles from "../weatherboards/projectCard.module.scss"

const ROOF: Record<string, string> = { gable: "gable roof", hip: "hip roof", skillion: "skillion roof", none: "no roof yet", auto: "roof" }

/** One saved house on the houses page: its size and rooms, then its roof in brief. */
const HouseProjectCard: React.FC<{
  href: string
  name: string
  badge: string
  summary: HouseSummary | null
  updatedAt?: Date | null
}> = ({ href, name, badge, summary, updatedAt }) => (
  <Link href={href} className={styles.card}>
    <div className={styles.titleRow}>
      <h3>{name}</h3>
      <span className={styles.badge}>{badge}</span>
    </div>
    {summary && summary.rooms > 0 ? (
      <>
        <p className={styles.meta}>
          {summary.areaM2.toFixed(1)} m² · {summary.rooms} room{summary.rooms === 1 ? "" : "s"}
          {(summary.storeys ?? 1) > 1 ? ` · ${summary.storeys} storeys` : ""}
        </p>
        <p className={styles.order}>
          <strong>{ROOF[summary.roof] ?? "roof"}</strong> on {summary.frame.toLowerCase()} · {summary.loadBearing} load-bearing walls
        </p>
        {summary.warnings > 0 && (
          <p className={styles.trims}>
            ⚠ {summary.warnings} thing{summary.warnings === 1 ? "" : "s"} to check
          </p>
        )}
      </>
    ) : (
      <p className={styles.meta}>Not started yet</p>
    )}
    {updatedAt && <p className={styles.updated}>Updated {updatedAt.toLocaleDateString()}</p>}
  </Link>
)

export default HouseProjectCard

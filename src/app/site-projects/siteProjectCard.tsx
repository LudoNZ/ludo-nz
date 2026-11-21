"use client"

import Link from "next/link"
import type { SiteSummary } from "@/components/site/siteProjectStore"
// same card as the other projects pages, so the lists match
import styles from "@/components/weatherboards/projectCard.module.scss"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** One site project on the list: what's on it, then its walls in brief. */
const SiteProjectCard: React.FC<{
  href: string
  name: string
  badge: string
  summary: SiteSummary | null
  updatedAt?: Date | null
}> = ({ href, name, badge, summary, updatedAt }) => {
  const walls = summary?.wallCount ?? (summary?.wall ? 1 : 0)
  const stairs = summary?.stairs ?? 0
  const decks = summary?.decks ?? 0
  const parts = [walls ? plural(walls, "wall") : "", decks ? plural(decks, "deck") : "", stairs ? plural(stairs, "stair") : ""].filter(Boolean)
  const wall = walls > 0 ? summary?.wall : null
  return (
    <Link href={href} className={styles.card}>
      <div className={styles.titleRow}>
        <h3>{name}</h3>
        <span className={styles.badge}>{badge}</span>
      </div>
      <p className={styles.order}>{parts.length ? <strong>{parts.join(" · ")}</strong> : "Empty — open it to add walls or decks"}</p>
      {wall && (
        <p className={styles.meta}>
          {wall.wallLengthM.toFixed(2)} m of wall, up to {wall.maxHeightM.toFixed(2)} m high · {plural(wall.posts, "post")} · {wall.concreteM3.toFixed(2)} m³ concrete
        </p>
      )}
      {wall?.needsEngineer && <p className={styles.trims}>⚠ Part of a wall needs an engineer</p>}
      {updatedAt && <p className={styles.updated}>Updated {updatedAt.toLocaleDateString()}</p>}
    </Link>
  )
}

export default SiteProjectCard

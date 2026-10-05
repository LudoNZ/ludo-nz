"use client"

import Link from "next/link"
import { ProjectSummary } from "./takeoff"
import styles from "./projectCard.module.scss"

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** One project on the projects page: counts, clad area, and the board
 * order in brief (count × length, longest first) plus a trims line. */
const ProjectCard: React.FC<{
  href: string
  name: string
  badge: string
  summary: ProjectSummary | null
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
          {plural(summary.elevations, "elevation")} · {plural(summary.walls, "wall")} · {plural(summary.openings, "opening")}
          {summary.areaM2 > 0 && <> · {summary.areaM2.toFixed(1)} m²</>}
        </p>
        {summary.boards > 0 ? (
          <>
            <p className={styles.order}>
              <strong>{plural(summary.boards, "board")}</strong> · {(summary.boardsMm / 1000).toFixed(1)} m ·{" "}
              {summary.wastePct.toFixed(1)}% waste
            </p>
            <p className={styles.mix}>{summary.order.map((o) => `${o.count} × ${(o.length / 1000).toFixed(1)}`).join("  ·  ")}</p>
            <p className={styles.trims}>
              {plural(summary.facings, "facing length")} · {plural(summary.scribers, "scriber length")} ·{" "}
              {plural(summary.flashings, "flashing")}
            </p>
          </>
        ) : (
          <p className={styles.meta}>Nothing to clad yet</p>
        )}
      </>
    ) : (
      <p className={styles.meta}>Open to calculate</p>
    )}
    {updatedAt && <p className={styles.updated}>Updated {updatedAt.toLocaleDateString()}</p>}
  </Link>
)

export default ProjectCard

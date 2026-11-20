"use client"

import Link from "next/link"
import { StairSummary } from "./stairData"
// same card as the other projects pages, so the lists match
import styles from "../weatherboards/projectCard.module.scss"

const COMPLIANCE_TEXT: Record<StairSummary["compliance"], string> = {
  main: "Meets main stair limits",
  service: "Service stair only",
  fail: "⚠ Doesn't meet the Building Code",
}

/** One saved stair on the stairs page: its size, then its steps in brief. */
const StairProjectCard: React.FC<{
  href: string
  name: string
  badge: string
  summary: StairSummary | null
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
          {(summary.totalRiseMm / 1000).toFixed(2)} m rise
          {summary.turns === 0 ? ` · ${(summary.totalRunMm / 1000).toFixed(2)} m total run` : ` · ${summary.turns} turn${summary.turns === 1 ? "" : "s"}`} · {summary.widthMm} mm wide
        </p>
        <p className={styles.order}>
          <strong>{summary.risers} risers</strong> of {summary.riseMm} mm · {summary.runMm} mm run
        </p>
        {summary.compliance === "fail" ? <p className={styles.trims}>{COMPLIANCE_TEXT.fail}</p> : <p className={styles.meta}>{COMPLIANCE_TEXT[summary.compliance]}</p>}
      </>
    ) : (
      <p className={styles.meta}>Open to calculate</p>
    )}
    {updatedAt && <p className={styles.updated}>Updated {updatedAt.toLocaleDateString()}</p>}
  </Link>
)

export default StairProjectCard

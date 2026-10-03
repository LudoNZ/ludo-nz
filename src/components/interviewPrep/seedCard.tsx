"use client"

import { useEffect, useRef, useState } from "react"
import styles from "./seedCard.module.scss"

/** Copy / download buttons for the practice database seed, for setting up
 * psql somewhere the repo isn't (e.g. Termux on a tablet). The SQL is
 * fetched as soon as the card mounts so the copy happens straight from the
 * click — some browsers refuse clipboard writes that come too long after
 * the tap. */
const SeedCard: React.FC<{ loadSeedSql: () => Promise<string> }> = ({ loadSeedSql }) => {
  const [sql, setSql] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let cancelled = false
    loadSeedSql().then(
      (s) => !cancelled && setSql(s),
      () => !cancelled && setError(true),
    )
    return () => {
      cancelled = true
      clearTimeout(timer.current)
    }
  }, [loadSeedSql])

  const copy = async () => {
    if (!sql) return
    try {
      await navigator.clipboard.writeText(sql)
      setCopied("ok")
    } catch {
      setCopied("failed")
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 2500)
  }

  const download = () => {
    if (!sql) return
    const url = URL.createObjectURL(new Blob([sql], { type: "application/sql" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "seed.sql"
    a.click()
    URL.revokeObjectURL(url)
  }

  const sizeKb = sql ? Math.round(new Blob([sql]).size / 1024) : null

  return (
    <section className={styles.seedCard} aria-label="Practice database">
      <h2>Practice database</h2>
      <p>
        The seed SQL every exercise runs against{sizeKb ? ` (${sizeKb} KB)` : ""}. Load it into an empty database:
        download it and run <code>psql -d qa_practice -f seed.sql</code>, or copy it and paste into a file (see the
        setup lesson for Termux on a tablet).
      </p>
      <div className={styles.actions}>
        <button type="button" onClick={copy} disabled={!sql}>
          {copied === "ok" ? "Copied" : copied === "failed" ? "Copy failed — try Download" : "Copy seed SQL"}
        </button>
        <button type="button" onClick={download} disabled={!sql}>
          Download seed.sql
        </button>
        {!sql && !error && <span className={styles.muted}>Loading…</span>}
        {error && <span className={styles.error}>Couldn&apos;t load the seed. Refresh to try again.</span>}
      </div>
    </section>
  )
}

export default SeedCard

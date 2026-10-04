"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  const [showSql, setShowSql] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const viewer = useRef<HTMLPreElement>(null)

  const lines = useMemo(() => sql?.split("\n") ?? [], [sql])
  // "Jump to" targets: each table's CREATE TABLE (schema) and INSERT INTO (data)
  const sections = useMemo(
    () =>
      lines.flatMap((line, i) => {
        const m = line.match(/^(CREATE TABLE|INSERT INTO) (\w+)/)
        return m ? [{ line: i, label: `${m[1] === "CREATE TABLE" ? "Schema" : "Data"}: ${m[2]}` }] : []
      }),
    [lines],
  )

  // scroll inside the viewer only, so the page itself doesn't jump
  const jumpTo = (line: number) => {
    const el = viewer.current?.querySelector<HTMLElement>(`[data-line="${line}"]`)
    if (viewer.current && el) viewer.current.scrollTop = el.offsetTop - viewer.current.offsetTop
  }

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
        <button type="button" onClick={() => setShowSql((v) => !v)} disabled={!sql} aria-expanded={showSql}>
          {showSql ? "Hide seed SQL" : "View seed SQL"}
        </button>
        {!sql && !error && <span className={styles.muted}>Loading…</span>}
        {error && <span className={styles.error}>Couldn&apos;t load the seed. Refresh to try again.</span>}
      </div>
      {showSql && sql && (
        <div className={styles.viewer}>
          <label className={styles.jump}>
            Jump to
            <select defaultValue="" onChange={(e) => jumpTo(Number(e.target.value))}>
              <option value="" disabled>
                choose a table…
              </option>
              {sections.map((sec) => (
                <option key={sec.line} value={sec.line}>
                  {sec.label}
                </option>
              ))}
            </select>
          </label>
          <pre ref={viewer} aria-label="Seed SQL" tabIndex={0}>
            {lines.map((line, i) => (
              <span key={i} data-line={i} className={styles.line}>
                <span className={styles.lineNo} aria-hidden>
                  {i + 1}
                </span>
                {line || " "}
              </span>
            ))}
          </pre>
        </div>
      )}
    </section>
  )
}

export default SeedCard

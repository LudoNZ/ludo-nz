"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { seedShellCommand } from "./seedCommand"
import { copyText, downloadText } from "./copyText"
import styles from "./seedCard.module.scss"

/** Copy / download buttons for the practice database seed, for setting up
 * psql somewhere the repo isn't (e.g. Termux on a tablet). The SQL is
 * fetched as soon as the card mounts so the copy happens straight from the
 * click — some browsers refuse clipboard writes that come too long after
 * the tap. */
const SeedCard: React.FC<{ loadSeedSql: () => Promise<string> }> = ({ loadSeedSql }) => {
  const [sql, setSql] = useState<string | null>(null)
  const [error, setError] = useState(false)
  // which copy button last fired, and whether the clipboard took it
  const [copied, setCopied] = useState<{ what: "sql" | "command"; ok: boolean } | null>(null)
  // when the browser won't copy at all: the text in a box to copy by hand
  const [manual, setManual] = useState<{ what: "sql" | "command"; text: string } | null>(null)
  const manualBox = useRef<HTMLTextAreaElement>(null)
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

  const copy = async (what: "sql" | "command") => {
    if (!sql) return
    const text = what === "command" ? seedShellCommand(sql) : sql
    const ok = await copyText(text)
    setCopied({ what, ok })
    setManual(ok ? null : { what, text })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(null), 2500)
  }

  const selectManual = () => {
    const ta = manualBox.current
    if (!ta) return
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
  }

  const download = () => {
    if (sql) downloadText(sql, "seed.sql", "application/sql")
  }

  const sizeKb = sql ? Math.round(new Blob([sql]).size / 1024) : null

  return (
    <section className={styles.seedCard} aria-label="Practice database">
      <h2>Practice database</h2>
      <p>
        The seed SQL every exercise runs against{sizeKb ? ` (${sizeKb} KB)` : ""}. On a tablet,{" "}
        <strong>Copy as Termux command</strong> and paste it at the Termux prompt: it saves the SQL to{" "}
        <code>seed.sql</code> and loads it with <code>psql</code> in one go. Or download it and run{" "}
        <code>psql -d qa_practice -f seed.sql</code>. Don&apos;t paste the plain SQL at the shell prompt — the shell
        isn&apos;t <code>psql</code> and tries to run every line.
      </p>
      <div className={styles.actions}>
        <button type="button" onClick={() => copy("command")} disabled={!sql}>
          {copied?.what === "command"
            ? copied.ok
              ? "Copied — paste at the Termux prompt"
              : "Couldn't copy — see below"
            : "Copy as Termux command"}
        </button>
        <button type="button" onClick={() => copy("sql")} disabled={!sql}>
          {copied?.what === "sql" ? (copied.ok ? "Copied SQL" : "Couldn't copy — see below") : "Copy SQL only"}
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
      {manual && (
        <div className={styles.manual}>
          <p>
            This browser won&apos;t copy for you here. Tap <strong>Select all</strong>, then long-press the box and choose
            Copy{manual.what === "command" ? " — then paste at the Termux prompt" : ""}.
          </p>
          <textarea ref={manualBox} readOnly value={manual.text} rows={6} aria-label="Text to copy" onFocus={selectManual} />
          <div className={styles.actions}>
            <button type="button" onClick={selectManual}>
              Select all
            </button>
            <button type="button" onClick={() => setManual(null)}>
              Close
            </button>
          </div>
        </div>
      )}
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

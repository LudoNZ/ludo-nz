"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import { ActivityEntry, loadWallActivity } from "@/components/retainingWall/wallActivity"
import { projectHref } from "@/components/retainingWall/wallProjectStore"
import styles from "./wallActivitySection.module.scss"

type Range = "7" | "30" | "90" | "all"
const RANGES: { id: Range; label: string }[] = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "all", label: "All time" },
]
/** most entries one load pulls in */
const MAX_ENTRIES = 5000
const FEED_PAGE = 100

const ACTION_LABELS: Record<ActivityEntry["action"], string> = {
  change: "Change",
  undo: "Undo",
  redo: "Redo",
  lock: "Locked",
  unlock: "Unlocked",
}

const projectKey = (e: ActivityEntry) => `${e.projectKind}/${e.projectId}`
const personKey = (e: ActivityEntry) => e.actorUid ?? "anon"
const personLabel = (e: ActivityEntry) => e.actorEmail ?? (e.actorUid ? "Signed in (no email)" : "Signed out")

const formatWhen = (d: Date | null) =>
  d ? d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "pending"

interface Group {
  key: string
  label: string
  sub: string
  changes: number
  undos: number
  others: Set<string>
  last: Date | null
  sample: ActivityEntry
}

function groupBy(entries: ActivityEntry[], keyOf: (e: ActivityEntry) => string, otherOf: (e: ActivityEntry) => string, labelOf: (e: ActivityEntry) => [string, string]) {
  const groups = new Map<string, Group>()
  for (const e of entries) {
    const key = keyOf(e)
    let g = groups.get(key)
    if (!g) {
      const [label, sub] = labelOf(e)
      g = { key, label, sub, changes: 0, undos: 0, others: new Set(), last: null, sample: e }
      groups.set(key, g)
    }
    if (e.action === "change") g.changes++
    if (e.action === "undo") g.undos++
    g.others.add(otherOf(e))
    if (e.at && (!g.last || e.at > g.last)) g.last = e.at
  }
  return [...groups.values()].sort((a, b) => (b.last?.getTime() ?? Infinity) - (a.last?.getTime() ?? Infinity))
}

function toCsv(entries: ActivityEntry[]) {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const rows = [
    ["When", "Project", "Project type", "Project id", "Person", "Action", "What", "Fields"],
    ...entries.map((e) => [
      e.at?.toISOString() ?? "",
      e.projectName,
      e.projectKind,
      e.projectId,
      personLabel(e),
      ACTION_LABELS[e.action],
      e.label,
      e.fields.join(" "),
    ]),
  ]
  return rows.map((r) => r.map(cell).join(",")).join("\n")
}

/** Admin dashboard: activity on every retaining wall — public, private
 * and scratch — from the activity log the editor writes. */
export default function WallActivitySection() {
  const auth = useAuth()
  const myUid = auth?.currentUser?.uid ?? null
  const [range, setRange] = useState<Range>("30")
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [project, setProject] = useState<string | null>(null)
  const [person, setPerson] = useState<string | null>(null)
  const [shown, setShown] = useState(FEED_PAGE)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError("")
    const since = range === "all" ? null : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000)
    loadWallActivity(since, MAX_ENTRIES)
      .then((rows) => !cancelled && setEntries(rows))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load activity"))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [range])

  const filtered = useMemo(
    () => entries.filter((e) => (!project || projectKey(e) === project) && (!person || personKey(e) === person)),
    [entries, project, person],
  )
  const byProject = useMemo(
    () => groupBy(entries.filter((e) => !person || personKey(e) === person), projectKey, personKey, (e) => [e.projectName, e.projectKind]),
    [entries, person],
  )
  const byPerson = useMemo(
    () => groupBy(entries.filter((e) => !project || projectKey(e) === project), personKey, projectKey, (e) => [personLabel(e), ""]),
    [entries, project],
  )

  const totals = {
    changes: filtered.filter((e) => e.action === "change").length,
    undos: filtered.filter((e) => e.action === "undo").length,
    projects: new Set(filtered.map(projectKey)).size,
    people: new Set(filtered.map(personKey)).size,
  }

  const download = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `retaining-wall-activity-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const projectLink = (e: ActivityEntry) =>
    e.projectKind === "public" || (e.projectKind === "private" && e.ownerUid === myUid) ? projectHref(e.projectId) : null

  return (
    <section className={styles.activitySection}>
      <div className={styles.header}>
        <h2>Retaining wall activity</h2>
        <div className={styles.toggle}>
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`${styles.toggleBtn} ${range === r.id ? styles.toggleActive : ""}`}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <p className={styles.muted}>Loading activity...</p>
      ) : entries.length === 0 ? (
        <p className={styles.muted}>No activity in this period.</p>
      ) : (
        <>
          {entries.length >= MAX_ENTRIES && (
            <p className={styles.muted}>Showing the latest {MAX_ENTRIES} entries — pick a shorter period to see all of it.</p>
          )}

          {(project || person) && (
            <div className={styles.filters}>
              Filtered to
              {project && (
                <button type="button" className={styles.chip} onClick={() => setProject(null)}>
                  {byProject.find((g) => g.key === project)?.label ?? "project"} ×
                </button>
              )}
              {person && (
                <button type="button" className={styles.chip} onClick={() => setPerson(null)}>
                  {byPerson.find((g) => g.key === person)?.label ?? "person"} ×
                </button>
              )}
            </div>
          )}

          <div className={styles.stats}>
            <div>
              <strong>{totals.changes}</strong> changes
            </div>
            <div>
              <strong>{totals.undos}</strong> undos
            </div>
            <div>
              <strong>{totals.projects}</strong> walls
            </div>
            <div>
              <strong>{totals.people}</strong> people
            </div>
          </div>

          <div className={styles.columns}>
            <div>
              <h3 className={styles.subheading}>By wall</h3>
              <ul className={styles.list}>
                {byProject.map((g) => (
                  <li key={g.key}>
                    <button
                      type="button"
                      className={`${styles.groupRow} ${project === g.key ? styles.selected : ""}`}
                      onClick={() => {
                        setProject(project === g.key ? null : g.key)
                        setShown(FEED_PAGE)
                      }}
                    >
                      <span className={styles.groupName}>
                        {g.label} <span className={styles.kind}>{g.sub}</span>
                      </span>
                      <span className={styles.groupMeta}>
                        {g.changes} changes · {g.undos} undos · {g.others.size} {g.others.size === 1 ? "person" : "people"} · {formatWhen(g.last)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className={styles.subheading}>By person</h3>
              <ul className={styles.list}>
                {byPerson.map((g) => (
                  <li key={g.key}>
                    <button
                      type="button"
                      className={`${styles.groupRow} ${person === g.key ? styles.selected : ""}`}
                      onClick={() => {
                        setPerson(person === g.key ? null : g.key)
                        setShown(FEED_PAGE)
                      }}
                    >
                      <span className={styles.groupName}>{g.label}</span>
                      <span className={styles.groupMeta}>
                        {g.changes} changes · {g.undos} undos · {g.others.size} {g.others.size === 1 ? "wall" : "walls"} · {formatWhen(g.last)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={styles.feedHeader}>
            <h3 className={styles.subheading}>Activity</h3>
            <button type="button" className={styles.smallBtn} onClick={download}>
              Download CSV ({filtered.length})
            </button>
          </div>
          <ul className={styles.list}>
            {filtered.slice(0, shown).map((e) => {
              const href = projectLink(e)
              return (
                <li key={e.id} className={styles.feedRow}>
                  <span className={styles.when}>{formatWhen(e.at)}</span>
                  <span className={`${styles.action} ${styles[e.action]}`}>{ACTION_LABELS[e.action]}</span>
                  <span className={styles.what}>{e.label}</span>
                  <span className={styles.where}>
                    {href ? <Link href={href}>{e.projectName}</Link> : e.projectName} · {personLabel(e)}
                  </span>
                </li>
              )
            })}
          </ul>
          {filtered.length > shown && (
            <button type="button" className={styles.smallBtn} onClick={() => setShown((n) => n + FEED_PAGE)}>
              Show more ({filtered.length - shown} left)
            </button>
          )}
        </>
      )}
    </section>
  )
}

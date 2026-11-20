"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { adminDeleteProject, AdminProjectRow } from "@/components/projects/adminProjects"
import { withOwner } from "@/components/projects/projectOwner"
import pageStyles from "../weatherboards/weatherboardsPage.module.scss"
import styles from "./adminProjectsSection.module.scss"

const when = (d: Date | null) =>
  d ? d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

/** Admin-only: every project of one kind in the database — public ones
 * and every account's private ones — each opening to view and edit
 * (someone else's private one opens with its owner on the link, which
 * only an admin's account can load or save), with a delete on each, for
 * clearing out duplicates. Sorted by name (then newest first) so copies
 * of the same job sit together; a name used more than once is flagged. */
function AdminProjectsSection<S>({
  myUid,
  title = "All projects in the database (admin)",
  what = "retaining wall project",
  column = "Wall",
  subscribe,
  hrefFor,
  describe,
  onCopy,
}: {
  myUid: string | null
  title?: string
  /** e.g. "stair" — in the hint and the delete confirmation */
  what?: string
  /** the summary column's heading */
  column?: string
  subscribe: (onData: (rows: AdminProjectRow<S>[]) => void, onError: (err: unknown) => void) => () => void
  /** a project's own page */
  hrefFor: (id: string) => string
  describe: (summary: S) => string
  /** a "Copy to mine" on every project that isn't already yours: makes a
   * private copy in your account and resolves to its id */
  onCopy?: (row: AdminProjectRow<S>) => Promise<string>
}) {
  const [rows, setRows] = useState<AdminProjectRow<S>[] | null>(null)
  const [error, setError] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [copying, setCopying] = useState<string | null>(null)
  const [copied, setCopied] = useState<{ key: string; id: string } | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  useEffect(() => subscribe(setRows, () => setError(true)), [subscribe])

  const sorted = useMemo(
    () =>
      [...(rows ?? [])].sort(
        (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
      ),
    [rows],
  )
  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of sorted) counts.set(r.name.trim().toLowerCase(), (counts.get(r.name.trim().toLowerCase()) ?? 0) + 1)
    return counts
  }, [sorted])

  const remove = async (row: AdminProjectRow<S>) => {
    const where = row.ownerUid ? (row.ownerUid === myUid ? `your private ${what}` : `someone's private ${what}`) : `public ${what}`
    if (!window.confirm(`Delete "${row.name}" (${where}, last saved ${when(row.updatedAt)})? This can't be undone.`)) return
    setDeleting(row.key)
    setDeleteError(null)
    try {
      await adminDeleteProject(row.ref)
    } catch (err) {
      console.error(`Admin delete of ${what} failed`, err)
      setDeleteError(`Couldn't delete "${row.name}".`)
    } finally {
      setDeleting(null)
    }
  }

  const copy = async (row: AdminProjectRow<S>) => {
    if (!onCopy) return
    setCopying(row.key)
    setCopyError(null)
    try {
      setCopied({ key: row.key, id: await onCopy(row) })
    } catch (err) {
      console.error(`Admin copy of ${what} failed`, err)
      setCopyError(`Couldn't copy "${row.name}".`)
    } finally {
      setCopying(null)
    }
  }

  return (
    <section className={pageStyles.section}>
      <h2 className={pageStyles.sectionTitle}>{title}</h2>
      <p className={pageStyles.hint}>
        Every {what} — public, and every account&apos;s private ones. Only admins see this. Open any of them to view and
        edit it; changes to someone&apos;s private {what} save to their account. Deleting is permanent.
      </p>
      {error && <p className={pageStyles.error}>Couldn&apos;t load the full list.</p>}
      {deleteError && <p className={pageStyles.error}>{deleteError}</p>}
      {copyError && <p className={pageStyles.error}>{copyError}</p>}
      {!rows ? (
        !error && <p className={pageStyles.hint}>Loading…</p>
      ) : sorted.length === 0 ? (
        <p className={pageStyles.hint}>None.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Where</th>
                <th>{column}</th>
                <th>Last saved</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const duplicate = (nameCounts.get(r.name.trim().toLowerCase()) ?? 0) > 1
                return (
                  <tr key={r.key}>
                    <td>
                      <Link href={withOwner(hrefFor(r.id), r.ownerUid, myUid)}>{r.name}</Link>
                      {duplicate && <span className={styles.duplicate}>same name</span>}
                    </td>
                    <td>{!r.ownerUid ? "Public" : r.ownerUid === myUid ? "Private — yours" : `Private — ${r.ownerUid.slice(0, 6)}…`}</td>
                    <td>{r.summary ? describe(r.summary) : "—"}</td>
                    <td>{when(r.updatedAt)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        {onCopy && myUid && r.ownerUid !== myUid && (
                          <button type="button" className={styles.copy} disabled={copying !== null} onClick={() => copy(r)} title={`Make a private copy of this ${what} in your account`}>
                            {copying === r.key ? "Copying…" : "Copy to mine"}
                          </button>
                        )}
                        {copied?.key === r.key && (
                          <Link href={hrefFor(copied.id)} className={styles.copied}>
                            Open your copy
                          </Link>
                        )}
                        <button type="button" className={styles.delete} disabled={deleting !== null} onClick={() => remove(r)}>
                          {deleting === r.key ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default AdminProjectsSection

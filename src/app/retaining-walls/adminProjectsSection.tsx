"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { adminDeleteProject, AdminProjectRow, projectHref, subscribeToAllProjects } from "@/components/retainingWall/wallProjectStore"
import pageStyles from "../weatherboards/weatherboardsPage.module.scss"
import styles from "./adminProjectsSection.module.scss"

const when = (d: Date | null) =>
  d ? d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

/** Admin-only: every retaining wall project in the database — public
 * ones and every account's private ones — with a delete on each, for
 * clearing out duplicates. Sorted by name (then newest first) so copies
 * of the same job sit together; a name used more than once is flagged. */
const AdminProjectsSection: React.FC<{ myUid: string | null }> = ({ myUid }) => {
  const [rows, setRows] = useState<AdminProjectRow[] | null>(null)
  const [error, setError] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => subscribeToAllProjects(setRows, () => setError(true)), [])

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

  const remove = async (row: AdminProjectRow) => {
    const where = row.ownerUid ? (row.ownerUid === myUid ? "your private project" : "someone's private project") : "public project"
    if (!window.confirm(`Delete "${row.name}" (${where}, last saved ${when(row.updatedAt)})? This can't be undone.`)) return
    setDeleting(row.key)
    setDeleteError(null)
    try {
      await adminDeleteProject(row.ref)
    } catch (err) {
      console.error("Admin delete of retaining wall project failed", err)
      setDeleteError(`Couldn't delete "${row.name}".`)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className={pageStyles.section}>
      <h2 className={pageStyles.sectionTitle}>All projects in the database (admin)</h2>
      <p className={pageStyles.hint}>
        Every retaining wall project — public, and every account&apos;s private ones. Only admins see this. Deleting is
        permanent.
      </p>
      {error && <p className={pageStyles.error}>Couldn&apos;t load the full list.</p>}
      {deleteError && <p className={pageStyles.error}>{deleteError}</p>}
      {!rows ? (
        !error && <p className={pageStyles.hint}>Loading…</p>
      ) : sorted.length === 0 ? (
        <p className={pageStyles.hint}>No projects.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Where</th>
                <th>Wall</th>
                <th>Last saved</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const duplicate = (nameCounts.get(r.name.trim().toLowerCase()) ?? 0) > 1
                // a private project only opens for its owner
                const canOpen = !r.ownerUid || r.ownerUid === myUid
                return (
                  <tr key={r.key}>
                    <td>
                      {canOpen ? <Link href={projectHref(r.id)}>{r.name}</Link> : r.name}
                      {duplicate && <span className={styles.duplicate}>same name</span>}
                    </td>
                    <td>{!r.ownerUid ? "Public" : r.ownerUid === myUid ? "Private — yours" : `Private — ${r.ownerUid.slice(0, 6)}…`}</td>
                    <td>
                      {r.summary
                        ? `${r.summary.wallLengthM} m · ${r.summary.walls} wall${r.summary.walls === 1 ? "" : "s"} · ${r.summary.posts} posts`
                        : "—"}
                    </td>
                    <td>{when(r.updatedAt)}</td>
                    <td>
                      <button type="button" className={styles.delete} disabled={deleting !== null} onClick={() => remove(r)}>
                        {deleting === r.key ? "Deleting…" : "Delete"}
                      </button>
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

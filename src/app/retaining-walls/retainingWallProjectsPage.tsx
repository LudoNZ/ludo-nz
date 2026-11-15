"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import WallProjectCard from "@/components/retainingWall/wallProjectCard"
import { SavedWallDesign, subscribeToDesigns } from "@/components/retainingWall/retainingWallData"
import { DEFAULT_WALL, newBlankWall, SCRATCH_STORAGE_KEY, summariseWall, wallFromData, wallFromDesign, WallProject } from "@/components/retainingWall/wallProject"
import {
  newProjectId,
  projectHref,
  ProjectLocation,
  saveProjectSoon,
  StoredWallProject,
  subscribeToProjects,
} from "@/components/retainingWall/wallProjectStore"
// same layout as the weatherboard projects page, so the two match
import styles from "../weatherboards/weatherboardsPage.module.scss"

/** Landing page for the retaining wall calculator: a scratch wall that
 * lives in this browser, public projects (anyone can open, add or edit
 * one, no login), and your own private ones once signed in. A project
 * autosaves, so opening it on another device picks up where you left
 * off. Walls saved the old way (immutable "designs") are listed at the
 * bottom, each one click from becoming a project. */
const RetainingWallProjectsPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [scratch] = useStoredState<WallProject>(SCRATCH_STORAGE_KEY, DEFAULT_WALL)
  const [publicProjects, setPublicProjects] = useState<StoredWallProject[]>([])
  const [publicLoaded, setPublicLoaded] = useState(false)
  const [privateProjects, setPrivateProjects] = useState<StoredWallProject[]>([])
  const [privateLoaded, setPrivateLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [designs, setDesigns] = useState<SavedWallDesign[]>([])
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const scratchSummary = useMemo(() => summariseWall(wallFromData(scratch)), [scratch])

  useEffect(
    () =>
      subscribeToProjects(
        { kind: "public" },
        (data) => {
          setPublicProjects(data)
          setPublicLoaded(true)
        },
        () => {
          setLoadError(true)
          setPublicLoaded(true)
        },
      ),
    [],
  )

  useEffect(() => {
    if (!auth || auth.authLoading) return // still resolving — wait rather than flash "none"
    if (!auth.currentUser) {
      setPrivateProjects([])
      setPrivateLoaded(true)
      return
    }
    return subscribeToProjects({ kind: "private", uid: auth.currentUser.uid }, (data) => {
      setPrivateProjects(data)
      setPrivateLoaded(true)
    })
  }, [auth, auth?.authLoading, auth?.currentUser])

  useEffect(() => subscribeToDesigns(setDesigns, () => {}), [])

  const signedIn = !!auth?.currentUser

  /** `key` just identifies which button is busy. */
  const create = async (key: string, kind: ProjectLocation["kind"], name: string, wall: WallProject) => {
    const uid = auth?.currentUser?.uid
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    setCreating(key)
    setCreateError(null)
    try {
      const id = newProjectId(location)
      // offline (or on a hopeless connection) the project is created on
      // this device and synced later — don't sit waiting for the server
      await saveProjectSoon(location, id, name, wall)
      if (navigator.onLine) router.push(projectHref(id))
      else window.location.assign(projectHref(id))
    } catch (err) {
      console.error("Creating retaining wall project failed", err)
      setCreateError("Couldn't create the project — try again in a moment.")
      setCreating(null)
    }
  }

  const createBlank = (kind: ProjectLocation["kind"]) => {
    const count = (kind === "private" ? privateProjects : publicProjects).length
    return create(kind, kind, `Wall ${count + 1}`, newBlankWall())
  }

  return (
    <div className={styles.projectsPage}>
      <h1>Retaining Walls</h1>
      <p className={styles.subtitle}>
        A rough DIY materials and labour estimate for a timber post-and-board retaining wall: shape it in plan, set
        post levels on the elevations, and get posts, boards, concrete and backfill. Each wall is its own project,
        saved as you go — open it on any device to carry on. Once you&apos;ve opened this page on a device it also works
        there with no signal: changes are kept on the device and sync when you&apos;re back online.
      </p>

      <div className={styles.actions}>
        <Button size="large" onClick={() => createBlank("public")} disabled={creating !== null}>
          {creating === "public" ? "Creating…" : "+ New public project"}
        </Button>
        {signedIn && (
          <Button size="large" variant="secondary" onClick={() => createBlank("private")} disabled={creating !== null}>
            {creating === "private" ? "Creating…" : "+ New private project"}
          </Button>
        )}
      </div>
      {createError && <p className={styles.error}>{createError}</p>}
      {!signedIn && auth && !auth.authLoading && (
        <p className={styles.loginHint}>
          <Link href="/login">Log in</Link> for private projects only you can see — or start a public one, no login needed.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Scratch wall</h2>
        <p className={styles.hint}>A quick calculation with nothing to set up — it stays in this browser only.</p>
        <div className={styles.grid}>
          <WallProjectCard href="/retaining-walls/scratch" name="Scratch wall" badge="This browser" summary={scratchSummary} />
        </div>
      </section>

      {signedIn && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your projects</h2>
          {!privateLoaded ? (
            <p className={styles.hint}>Loading…</p>
          ) : privateProjects.length === 0 ? (
            <p className={styles.hint}>None yet — private projects are only visible to you.</p>
          ) : (
            <div className={styles.grid}>
              {privateProjects.map((p) => (
                <WallProjectCard
                  key={p.id}
                  href={projectHref(p.id)}
                  name={p.name}
                  badge="Private"
                  summary={p.summary}
                  updatedAt={p.updatedAt}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Public projects</h2>
        <p className={styles.hint}>No login needed — anyone can open and edit these.</p>
        {!publicLoaded ? (
          <p className={styles.hint}>Loading…</p>
        ) : loadError ? (
          <p className={styles.error}>Couldn&apos;t load public projects.</p>
        ) : publicProjects.length === 0 ? (
          <p className={styles.hint}>None yet — start one above.</p>
        ) : (
          <div className={styles.grid}>
            {publicProjects.map((p) => (
              <WallProjectCard
                key={p.id}
                href={projectHref(p.id)}
                name={p.name}
                badge="Public"
                summary={p.summary}
                updatedAt={p.updatedAt}
              />
            ))}
          </div>
        )}
      </section>

      {designs.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Earlier saved walls</h2>
          <p className={styles.hint}>
            Saved before projects existed, so they can&apos;t be edited in place. Copy one into a new{" "}
            {signedIn ? "private" : "public"} project to carry on with it.
          </p>
          <div className={styles.actions}>
            {designs.map((d) => (
              <Button
                key={d.id}
                size="small"
                variant="secondary"
                disabled={creating !== null}
                onClick={() => create(d.id, signedIn ? "private" : "public", d.name, wallFromDesign(d))}
              >
                {creating === d.id ? "Copying…" : `${d.name} · ${d.wallLengthM} m`}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default RetainingWallProjectsPage

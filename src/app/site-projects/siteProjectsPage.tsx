"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import WallProjectCard from "@/components/retainingWall/wallProjectCard"
import { newBlankSite } from "@/components/site/siteProject"
import {
  newSiteProjectId,
  ProjectLocation,
  saveSiteProjectSoon,
  siteProjectHref,
  StoredSiteProject,
  subscribeToSiteProjects,
} from "@/components/site/siteProjectStore"
import styles from "../weatherboards/weatherboardsPage.module.scss"

/** Site projects: retaining walls and the stairs that come off them (more
 * calculators to come), placed together on one site. Public ones anyone
 * can open and edit; private ones once signed in. A new one starts blank;
 * walls are imported into it from there. */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

const SiteProjectsPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [publicProjects, setPublicProjects] = useState<StoredSiteProject[]>([])
  const [privateProjects, setPrivateProjects] = useState<StoredSiteProject[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const uid = auth?.currentUser?.uid ?? null
  const signedIn = !!uid

  useEffect(
    () =>
      subscribeToSiteProjects(
        { kind: "public" },
        (data) => {
          setPublicProjects(data)
          setLoaded(true)
        },
        () => {
          setLoadError(true)
          setLoaded(true)
        },
      ),
    [],
  )
  useEffect(() => {
    if (!uid) {
      setPrivateProjects([])
      return
    }
    return subscribeToSiteProjects({ kind: "private", uid }, setPrivateProjects)
  }, [uid])

  const create = async (kind: ProjectLocation["kind"]) => {
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    const count = (kind === "private" ? privateProjects : publicProjects).length
    const name = `Site ${count + 1}`
    setCreating(kind)
    setCreateError(null)
    try {
      const id = newSiteProjectId(location)
      await saveSiteProjectSoon(location, id, name, newBlankSite())
      router.push(siteProjectHref(id))
    } catch (err) {
      console.error("Creating site project failed", err)
      setCreateError("Couldn't create the project — try again in a moment.")
      setCreating(null)
    }
  }

  const card = (p: StoredSiteProject) => (
    <div key={`${p.location.kind}-${p.id}`}>
      <WallProjectCard
        href={siteProjectHref(p.id)}
        name={p.name}
        badge={`${p.location.kind === "public" ? "Public" : "Private"} · ${plural(p.summary?.wallCount ?? (p.summary?.wall ? 1 : 0), "wall")} · ${plural(p.summary?.stairs ?? 0, "stair")}`}
        summary={(p.summary?.wallCount ?? 1) > 0 ? (p.summary?.wall ?? null) : null}
        updatedAt={p.updatedAt}
      />
    </div>
  )

  return (
    <div className={styles.projectsPage}>
      <h1>Site Projects</h1>
      <p className={styles.subtitle}>
        More than one calculator on one site. A project starts blank: import your retaining walls into it (or add blank
        ones), place them around the site plan, then put stairs on them — pin each stair&apos;s top tread to a point
        along a wall and its rise comes from the wall&apos;s height there. Saved as you go.
      </p>

      <div className={styles.actions}>
        <Button size="large" onClick={() => create("public")} disabled={creating !== null}>
          {creating === "public" ? "Creating…" : "+ New public site project"}
        </Button>
        {signedIn && (
          <Button size="large" variant="secondary" onClick={() => create("private")} disabled={creating !== null}>
            {creating === "private" ? "Creating…" : "+ New private site project"}
          </Button>
        )}
      </div>
      {createError && <p className={styles.error}>{createError}</p>}
      {!signedIn && auth && !auth.authLoading && (
        <p className={styles.loginHint}>
          <Link href="/login">Log in</Link> for private projects only you can see — or start a public one, no login needed.
        </p>
      )}

      {signedIn && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your site projects</h2>
          {privateProjects.length === 0 ? <p className={styles.hint}>None yet.</p> : <div className={styles.grid}>{privateProjects.map(card)}</div>}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Public site projects</h2>
        {!loaded ? (
          <p className={styles.hint}>Loading…</p>
        ) : loadError ? (
          <p className={styles.error}>Couldn&apos;t load public site projects.</p>
        ) : publicProjects.length === 0 ? (
          <p className={styles.hint}>None yet — start one above.</p>
        ) : (
          <div className={styles.grid}>{publicProjects.map(card)}</div>
        )}
      </section>
    </div>
  )
}

export default SiteProjectsPage

"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import WallProjectCard from "@/components/retainingWall/wallProjectCard"
import { newBlankWall, WallProject } from "@/components/retainingWall/wallProject"
import { StoredWallProject, subscribeToProjects } from "@/components/retainingWall/wallProjectStore"
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

/** Site projects: a retaining wall and the stairs that come off it (more
 * calculators to come), in one project. Public ones anyone can open and
 * edit; private ones once signed in. A new one starts from a blank wall or
 * a copy of one of your retaining wall projects. */
const SiteProjectsPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [publicProjects, setPublicProjects] = useState<StoredSiteProject[]>([])
  const [privateProjects, setPrivateProjects] = useState<StoredSiteProject[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [walls, setWalls] = useState<{ public: StoredWallProject[]; private: StoredWallProject[] }>({ public: [], private: [] })
  const [fromWall, setFromWall] = useState("")
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

  // retaining wall projects a new site can start from
  useEffect(() => subscribeToProjects({ kind: "public" }, (data) => setWalls((w) => ({ ...w, public: data }))), [])
  useEffect(() => {
    if (!uid) {
      setWalls((w) => ({ ...w, private: [] }))
      return
    }
    return subscribeToProjects({ kind: "private", uid }, (data) => setWalls((w) => ({ ...w, private: data })))
  }, [uid])

  const create = async (kind: ProjectLocation["kind"]) => {
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    const source = [...walls.private, ...walls.public].find((w) => `${w.location.kind}:${w.id}` === fromWall)
    const wall: WallProject = source ? source.wall : newBlankWall()
    const count = (kind === "private" ? privateProjects : publicProjects).length
    const name = source ? `${source.name} + stairs` : `Site ${count + 1}`
    setCreating(kind)
    setCreateError(null)
    try {
      const id = newSiteProjectId(location)
      await saveSiteProjectSoon(location, id, name, newBlankSite(wall))
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
        badge={`${p.location.kind === "public" ? "Public" : "Private"} · ${p.summary?.stairs ?? 0} stair${p.summary?.stairs === 1 ? "" : "s"}`}
        summary={p.summary?.wall ?? null}
        updatedAt={p.updatedAt}
      />
    </div>
  )

  return (
    <div className={styles.projectsPage}>
      <h1>Site Projects</h1>
      <p className={styles.subtitle}>
        More than one calculator on one site. Start with a retaining wall — a blank one, or a copy of one of your wall
        projects — then put stairs on it: pin each stair&apos;s top tread to a point along the wall and its rise comes
        from the wall&apos;s height there. Saved as you go.
      </p>

      <div className={styles.actions} style={{ alignItems: "center" }}>
        <label htmlFor="site-from-wall">Start from</label>
        <select id="site-from-wall" value={fromWall} onChange={(e) => setFromWall(e.target.value)} style={{ padding: "0.5rem", fontSize: "max(1rem, 16px)" }}>
          <option value="">A blank wall</option>
          {walls.private.length > 0 && (
            <optgroup label="Your wall projects (copied)">
              {walls.private.map((w) => (
                <option key={w.id} value={`private:${w.id}`}>
                  {w.name}
                </option>
              ))}
            </optgroup>
          )}
          {walls.public.length > 0 && (
            <optgroup label="Public wall projects (copied)">
              {walls.public.map((w) => (
                <option key={w.id} value={`public:${w.id}`}>
                  {w.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
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
      <p className={styles.hint}>A wall copied in is a copy: changes in the site project don&apos;t change the wall project it came from.</p>
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

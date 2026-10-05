"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import ProjectCard from "@/components/weatherboards/projectCard"
import { DEFAULT_PROJECT, EXAMPLE_STORAGE_KEY, newBlankProject } from "@/components/weatherboards/data"
import { newProjectId, ProjectLocation, saveProject, StoredProject, subscribeToProjects } from "@/components/weatherboards/projectStore"
import { summarise } from "@/components/weatherboards/takeoff"
import { WeatherboardProject } from "@/components/weatherboards/types"
import styles from "./weatherboardsPage.module.scss"

/** Landing page for the weatherboard calculator: the built-in example,
 * public projects (anyone can open, add or edit one, no login), and your
 * own private ones once signed in — each card with its order in brief. */
const WeatherboardsPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [example] = useStoredState<WeatherboardProject>(EXAMPLE_STORAGE_KEY, DEFAULT_PROJECT)
  const [publicProjects, setPublicProjects] = useState<StoredProject[]>([])
  const [publicLoaded, setPublicLoaded] = useState(false)
  const [privateProjects, setPrivateProjects] = useState<StoredProject[]>([])
  const [privateLoaded, setPrivateLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState<ProjectLocation["kind"] | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const exampleSummary = useMemo(() => summarise(example), [example])

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

  const create = async (kind: ProjectLocation["kind"]) => {
    const uid = auth?.currentUser?.uid
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    setCreating(kind)
    setCreateError(null)
    try {
      const id = newProjectId(location)
      const count = (kind === "private" ? privateProjects : publicProjects).length
      await saveProject(location, id, `Project ${count + 1}`, newBlankProject())
      router.push(`/weatherboards/${id}`)
    } catch (err) {
      console.error("Creating weatherboard project failed", err)
      setCreateError("Couldn't create the project — try again in a moment.")
      setCreating(null)
    }
  }

  const signedIn = !!auth?.currentUser

  return (
    <div className={styles.projectsPage}>
      <h1>Weatherboards</h1>
      <p className={styles.subtitle}>
        Mark up every elevation — raked tops and bottoms, openings you can drag into place — and get a course-by-course
        layout, the leanest board order across 4.2–6.0 m lengths, and the facings, scribers and flashings to go with it.
      </p>

      <div className={styles.actions}>
        <Button size="large" onClick={() => create("public")} disabled={creating !== null}>
          {creating === "public" ? "Creating…" : "+ New public project"}
        </Button>
        {signedIn && (
          <Button size="large" variant="secondary" onClick={() => create("private")} disabled={creating !== null}>
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
        <h2 className={styles.sectionTitle}>Example</h2>
        <div className={styles.grid}>
          <ProjectCard href="/weatherboards/example" name="Example house" badge="Example" summary={exampleSummary} />
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
                <ProjectCard
                  key={p.id}
                  href={`/weatherboards/${p.id}`}
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
              <ProjectCard
                key={p.id}
                href={`/weatherboards/${p.id}`}
                name={p.name}
                badge="Public"
                summary={p.summary}
                updatedAt={p.updatedAt}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default WeatherboardsPage

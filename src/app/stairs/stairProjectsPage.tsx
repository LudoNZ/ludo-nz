"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import { DEFAULT_INPUT, StairInput } from "@/components/stairs/stairs"
import { stairInputFromData, summariseStair } from "@/components/stairs/stairData"
import StairProjectCard from "@/components/stairs/stairProjectCard"
import {
  newStairProjectId,
  ProjectLocation,
  saveStairProjectSoon,
  stairProjectHref,
  StoredStairProject,
  subscribeToStairProjects,
} from "@/components/stairs/stairProjectStore"
import styles from "../weatherboards/weatherboardsPage.module.scss"

/** where the scratch stair is kept, in this browser */
export const STAIR_SCRATCH_KEY = "stairs.scratch.v1"

/** Landing page for the stairs calculator: a scratch stair kept in this
 * browser, and saved stairs — public ones anyone can open and edit,
 * private ones once signed in. */
const StairProjectsPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [scratch] = useStoredState<StairInput>(STAIR_SCRATCH_KEY, DEFAULT_INPUT)
  const [publicProjects, setPublicProjects] = useState<StoredStairProject[]>([])
  const [privateProjects, setPrivateProjects] = useState<StoredStairProject[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const uid = auth?.currentUser?.uid ?? null
  const signedIn = !!uid
  const scratchSummary = useMemo(() => summariseStair(stairInputFromData(scratch)), [scratch])

  useEffect(
    () =>
      subscribeToStairProjects(
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
    return subscribeToStairProjects({ kind: "private", uid }, setPrivateProjects)
  }, [uid])

  const create = async (kind: ProjectLocation["kind"]) => {
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    const count = (kind === "private" ? privateProjects : publicProjects).length
    setCreating(kind)
    setCreateError(null)
    try {
      const id = newStairProjectId(location)
      await saveStairProjectSoon(location, id, `Stair ${count + 1}`, DEFAULT_INPUT)
      router.push(stairProjectHref(id))
    } catch (err) {
      console.error("Creating stair project failed", err)
      setCreateError("Couldn't create the stair — try again in a moment.")
      setCreating(null)
    }
  }

  const card = (p: StoredStairProject) => (
    <div key={`${p.location.kind}-${p.id}`}>
      <StairProjectCard href={stairProjectHref(p.id)} name={p.name} badge={p.location.kind === "public" ? "Public" : "Private"} summary={p.summary} updatedAt={p.updatedAt} />
    </div>
  )

  return (
    <div className={styles.projectsPage}>
      <h1>Stairs Calculator</h1>
      <p className={styles.subtitle}>
        Deck stairs from the ground up: set the height and it works out the fewest steps that meet the Building Code,
        frames them, lays out the decking on every tread and gives you the order. Try the scratch stair, or save stairs
        to come back to — saved as you go.
      </p>

      <div className={styles.actions}>
        <Button size="large" onClick={() => create("public")} disabled={creating !== null}>
          {creating === "public" ? "Creating…" : "+ New public stair"}
        </Button>
        {signedIn && (
          <Button size="large" variant="secondary" onClick={() => create("private")} disabled={creating !== null}>
            {creating === "private" ? "Creating…" : "+ New private stair"}
          </Button>
        )}
      </div>
      {createError && <p className={styles.error}>{createError}</p>}
      {!signedIn && auth && !auth.authLoading && (
        <p className={styles.loginHint}>
          <Link href="/login">Log in</Link> for private stairs only you can see — or start a public one, no login needed.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Scratch stair</h2>
        <div className={styles.grid}>
          <div>
            <StairProjectCard href="/stairs/scratch" name="Scratch stair" badge="This browser" summary={scratchSummary} />
          </div>
        </div>
      </section>

      {signedIn && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your stairs</h2>
          {privateProjects.length === 0 ? <p className={styles.hint}>None yet.</p> : <div className={styles.grid}>{privateProjects.map(card)}</div>}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Public stairs</h2>
        {!loaded ? (
          <p className={styles.hint}>Loading…</p>
        ) : loadError ? (
          <p className={styles.error}>Couldn&apos;t load public stairs.</p>
        ) : publicProjects.length === 0 ? (
          <p className={styles.hint}>None yet — start one above.</p>
        ) : (
          <div className={styles.grid}>{publicProjects.map(card)}</div>
        )}
      </section>
    </div>
  )
}

export default StairProjectsPage

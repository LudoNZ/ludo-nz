"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import { DEFAULT_FLOOR, FloorInput } from "@/components/floorFraming/floorData"
import { floorInputFromData, summariseFloor } from "@/components/floorFraming/floorData"
import FloorProjectCard from "@/components/floorFraming/floorProjectCard"
import {
  copyFloorToMine,
  newFloorProjectId,
  ProjectLocation,
  saveFloorProjectSoon,
  floorProjectHref,
  StoredFloorProject,
  subscribeToAllFloorProjects,
  subscribeToFloorProjects,
} from "@/components/floorFraming/floorProjectStore"
import type { FloorSummary } from "@/components/floorFraming/floorData"
import AdminProjectsSection from "../retaining-walls/adminProjectsSection"
import styles from "../weatherboards/weatherboardsPage.module.scss"

/** where the scratch floor is kept, in this browser */
export const FLOOR_SCRATCH_KEY = "floorFraming.scratch.v1"

/** Landing page for the floor framing calculator: a scratch floor kept in
 * this browser, and saved floors — public ones anyone can open and edit,
 * private ones once signed in. */
const FloorProjectsPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [scratch] = useStoredState<FloorInput>(FLOOR_SCRATCH_KEY, DEFAULT_FLOOR)
  const [publicProjects, setPublicProjects] = useState<StoredFloorProject[]>([])
  const [privateProjects, setPrivateProjects] = useState<StoredFloorProject[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const uid = auth?.currentUser?.uid ?? null
  const signedIn = !!uid
  const scratchSummary = useMemo(() => summariseFloor(floorInputFromData(scratch)), [scratch])

  useEffect(
    () =>
      subscribeToFloorProjects(
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
    return subscribeToFloorProjects({ kind: "private", uid }, setPrivateProjects)
  }, [uid])

  const create = async (kind: ProjectLocation["kind"]) => {
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    const count = (kind === "private" ? privateProjects : publicProjects).length
    setCreating(kind)
    setCreateError(null)
    try {
      const id = newFloorProjectId(location)
      await saveFloorProjectSoon(location, id, `Floor ${count + 1}`, DEFAULT_FLOOR)
      router.push(floorProjectHref(id))
    } catch (err) {
      console.error("Creating floor project failed", err)
      setCreateError("Couldn't create the floor — try again in a moment.")
      setCreating(null)
    }
  }

  const card = (p: StoredFloorProject) => (
    <div key={`${p.location.kind}-${p.id}`}>
      <FloorProjectCard href={floorProjectHref(p.id)} name={p.name} badge={p.location.kind === "public" ? "Public" : "Private"} summary={p.summary} updatedAt={p.updatedAt} />
    </div>
  )

  return (
    <div className={styles.projectsPage}>
      <h1>Floor Framing Calculator</h1>
      <p className={styles.subtitle}>
        A timber floor under ply or particleboard — between two walls, on bearers and piles, or off a ledger on the
        house: joist and bearer sizes, piles, blocking and nogs, every sheet laid, a 3D view and the order. Try the scratch
        floor, or save floors to come back to — saved as you go.
      </p>

      <div className={styles.actions}>
        <Button size="large" onClick={() => create("public")} disabled={creating !== null}>
          {creating === "public" ? "Creating…" : "+ New public floor"}
        </Button>
        {signedIn && (
          <Button size="large" variant="secondary" onClick={() => create("private")} disabled={creating !== null}>
            {creating === "private" ? "Creating…" : "+ New private floor"}
          </Button>
        )}
      </div>
      {createError && <p className={styles.error}>{createError}</p>}
      {!signedIn && auth && !auth.authLoading && (
        <p className={styles.loginHint}>
          <Link href="/login">Log in</Link> for private floors only you can see — or start a public one, no login needed.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Scratch floor</h2>
        <div className={styles.grid}>
          <div>
            <FloorProjectCard href="/floor-framing/scratch" name="Scratch floor" badge="This browser" summary={scratchSummary} />
          </div>
        </div>
      </section>

      {signedIn && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your floors</h2>
          {privateProjects.length === 0 ? <p className={styles.hint}>None yet.</p> : <div className={styles.grid}>{privateProjects.map(card)}</div>}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Public floors</h2>
        {!loaded ? (
          <p className={styles.hint}>Loading…</p>
        ) : loadError ? (
          <p className={styles.error}>Couldn&apos;t load public floors.</p>
        ) : publicProjects.length === 0 ? (
          <p className={styles.hint}>None yet — start one above.</p>
        ) : (
          <div className={styles.grid}>{publicProjects.map(card)}</div>
        )}
      </section>

      {!!auth?.customClaims?.admin && (
        <AdminProjectsSection
          myUid={uid}
          title="All floors in the database (admin)"
          what="floor"
          column="Floor"
          subscribe={subscribeToAllFloorProjects}
          hrefFor={floorProjectHref}
          onCopy={(row) => copyFloorToMine(row.ref, uid as string, row.name)}
          describe={(s: FloorSummary) => `${(s.lengthMm / 1000).toFixed(2)} × ${(s.widthMm / 1000).toFixed(2)} m · ${s.joists} joists`}
        />
      )}
    </div>
  )
}

export default FloorProjectsPage

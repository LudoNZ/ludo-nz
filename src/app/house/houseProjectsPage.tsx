"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { useStoredState } from "@/components/interviewPrep/useStoredState"
import { DEFAULT_HOUSE, houseFromData, HouseProject } from "@/components/house/houseTypes"
import HouseProjectCard from "@/components/house/houseProjectCard"
import {
  copyHouseToMine,
  houseProjectHref,
  HouseSummary,
  newHouseProjectId,
  ProjectLocation,
  saveHouseProjectSoon,
  StoredHouseProject,
  subscribeToAllHouseProjects,
  subscribeToHouseProjects,
  summariseHouse,
} from "@/components/house/houseProjectStore"
import AdminProjectsSection from "../retaining-walls/adminProjectsSection"
import styles from "../weatherboards/weatherboardsPage.module.scss"

/** where the scratch house is kept, in this browser */
export const HOUSE_SCRATCH_KEY = "house.scratch.v1"

/** Landing page for the House calculator: a scratch house kept in this
 * browser, and saved houses — public ones anyone can open and edit,
 * private ones once signed in. */
const HouseProjectsPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [scratch] = useStoredState<HouseProject>(HOUSE_SCRATCH_KEY, DEFAULT_HOUSE)
  const [publicProjects, setPublicProjects] = useState<StoredHouseProject[]>([])
  const [privateProjects, setPrivateProjects] = useState<StoredHouseProject[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const uid = auth?.currentUser?.uid ?? null
  const signedIn = !!uid
  const scratchSummary = useMemo(() => summariseHouse(houseFromData(scratch)), [scratch])

  useEffect(
    () =>
      subscribeToHouseProjects(
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
    return subscribeToHouseProjects({ kind: "private", uid }, setPrivateProjects)
  }, [uid])

  const create = async (kind: ProjectLocation["kind"]) => {
    if (kind === "private" && !uid) return
    const location: ProjectLocation = kind === "private" ? { kind, uid: uid as string } : { kind }
    const count = (kind === "private" ? privateProjects : publicProjects).length
    setCreating(kind)
    setCreateError(null)
    try {
      const id = newHouseProjectId(location)
      const name = `House ${count + 1}`
      await saveHouseProjectSoon(location, id, name, { ...DEFAULT_HOUSE, name })
      router.push(houseProjectHref(id))
    } catch (err) {
      console.error("Creating house project failed", err)
      setCreateError("Couldn't create the house — try again in a moment.")
      setCreating(null)
    }
  }

  const card = (p: StoredHouseProject) => (
    <div key={`${p.location.kind}-${p.id}`}>
      <HouseProjectCard href={houseProjectHref(p.id)} name={p.name} badge={p.location.kind === "public" ? "Public" : "Private"} summary={p.summary} updatedAt={p.updatedAt} />
    </div>
  )

  return (
    <div className={styles.projectsPage}>
      <h1>House Calculator</h1>
      <p className={styles.subtitle}>
        A one-storey house from the ground floor plan up: draw the outline and walls or lay out the rooms, see which walls
        hold the roof up and where a span&apos;s too long, walk round it in 3D, and send its outside walls to Weatherboards.
        Try the scratch house, or save houses to come back to — saved as you go.
      </p>

      <div className={styles.actions}>
        <Button size="large" onClick={() => create("public")} disabled={creating !== null}>
          {creating === "public" ? "Creating…" : "+ New public house"}
        </Button>
        {signedIn && (
          <Button size="large" variant="secondary" onClick={() => create("private")} disabled={creating !== null}>
            {creating === "private" ? "Creating…" : "+ New private house"}
          </Button>
        )}
      </div>
      {createError && <p className={styles.error}>{createError}</p>}
      {!signedIn && auth && !auth.authLoading && (
        <p className={styles.loginHint}>
          <Link href="/login">Log in</Link> for private houses only you can see — or start a public one, no login needed.
        </p>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Scratch house</h2>
        <div className={styles.grid}>
          <div>
            <HouseProjectCard href="/house/scratch" name={houseFromData(scratch).name} badge="This browser" summary={scratchSummary} />
          </div>
        </div>
      </section>

      {signedIn && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your houses</h2>
          {privateProjects.length === 0 ? <p className={styles.hint}>None yet.</p> : <div className={styles.grid}>{privateProjects.map(card)}</div>}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Public houses</h2>
        {!loaded ? (
          <p className={styles.hint}>Loading…</p>
        ) : loadError ? (
          <p className={styles.error}>Couldn&apos;t load public houses.</p>
        ) : publicProjects.length === 0 ? (
          <p className={styles.hint}>None yet — start one above.</p>
        ) : (
          <div className={styles.grid}>{publicProjects.map(card)}</div>
        )}
      </section>

      {!!auth?.customClaims?.admin && (
        <AdminProjectsSection
          myUid={uid}
          title="All houses in the database (admin)"
          what="house"
          column="House"
          subscribe={subscribeToAllHouseProjects}
          hrefFor={houseProjectHref}
          onCopy={(row) => copyHouseToMine(row.ref, uid as string, row.name)}
          describe={(s: HouseSummary) => `${s.areaM2.toFixed(1)} m² · ${s.rooms} rooms · ${s.roof}`}
        />
      )}
    </div>
  )
}

export default HouseProjectsPage

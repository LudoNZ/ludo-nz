/** Saved site projects in Firestore, split the same way as retaining wall
 * projects (see retainingWall/wallProjectStore.ts): a private one under
 * your account (users/{uid}/siteProjects), a public one
 * (publicSiteProjects) anyone with the link can open and edit. */

import { collection, deleteDoc, doc, getDoc, getDocFromCache, onSnapshot, orderBy, query, setDoc, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { summariseWall, WallSummary } from "../retainingWall/wallProject"
import { siteFromData, SiteProject } from "./siteProject"
import type { ProjectLocation } from "../retainingWall/wallProjectStore"
import { AdminProjectRow, subscribeToAllOf } from "../projects/adminProjects"

export type { ProjectLocation }

export interface SiteSummary {
  /** every wall added up */
  wall: WallSummary
  /** how many retaining walls (site walls, not runs) */
  wallCount: number
  stairs: number
  /** decks and floors (missing on projects saved before they existed) */
  decks?: number
}

export interface StoredSiteProject {
  id: string
  name: string
  location: ProjectLocation
  site: SiteProject
  summary: SiteSummary | null
  updatedAt: Date | null
}

const PUBLIC = "publicSiteProjects"
const PRIVATE = "siteProjects"

const collectionRef = (location: ProjectLocation) =>
  location.kind === "private" ? collection(firestore, "users", location.uid, PRIVATE) : collection(firestore, PUBLIC)

const docRef = (location: ProjectLocation, id: string) =>
  location.kind === "private" ? doc(firestore, "users", location.uid, PRIVATE, id) : doc(firestore, PUBLIC, id)

export const newSiteProjectId = (location: ProjectLocation) => doc(collectionRef(location)).id

const fromData = (id: string, location: ProjectLocation, data: Record<string, unknown>): StoredSiteProject => ({
  id,
  location,
  name: typeof data.name === "string" ? data.name : "Untitled",
  site: siteFromData(data.site),
  summary: (data.summary as SiteSummary | undefined) ?? null,
  updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
})

export const subscribeToSiteProjects = (location: ProjectLocation, onData: (projects: StoredSiteProject[]) => void, onError?: (err: unknown) => void) =>
  onSnapshot(
    query(collectionRef(location), orderBy("updatedAt", "desc")),
    (snap) => onData(snap.docs.map((d) => fromData(d.id, location, d.data()))),
    (err) => {
      console.error("Site projects subscription failed", err)
      onError?.(err)
    },
  )

/** One-off load: the editor owns the project once it's open. */
export const loadSiteProject = async (location: ProjectLocation, id: string): Promise<StoredSiteProject | null> => {
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  const snap = offline ? await getDocFromCache(docRef(location, id)) : await getDoc(docRef(location, id))
  return snap.exists() ? fromData(snap.id, location, snap.data()) : null
}

/** Firestore refuses `undefined` anywhere in a document */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const summariseSite = (site: SiteProject): SiteSummary => {
  const each = site.walls.map((w) => summariseWall(w.wall))
  const sum = (f: (w: WallSummary) => number, dp = 2) => Math.round(each.reduce((a, w) => a + f(w), 0) * 10 ** dp) / 10 ** dp
  return {
    wall: {
      wallLengthM: sum((w) => w.wallLengthM),
      walls: sum((w) => w.walls, 0),
      maxHeightM: Math.max(0, ...each.map((w) => w.maxHeightM)),
      posts: sum((w) => w.posts, 0),
      boards: sum((w) => w.boards, 0),
      concreteM3: sum((w) => w.concreteM3),
      needsEngineer: each.some((w) => w.needsEngineer),
    },
    wallCount: site.walls.length,
    stairs: site.stairs.length,
    decks: site.decks.length,
  }
}

export const saveSiteProject = async (location: ProjectLocation, id: string, name: string, site: SiteProject) => {
  await setDoc(docRef(location, id), {
    name: (name.trim() || "Untitled").slice(0, 100),
    site: plain(site),
    summary: plain(summariseSite(site)),
    updatedAt: Timestamp.now(),
  })
}

/** Saves, and resolves once it's on the device ("local") or the server
 * ("synced") — whichever is first worth waiting for. */
export const saveSiteProjectSoon = async (location: ProjectLocation, id: string, name: string, site: SiteProject, withinMs = 2500): Promise<"synced" | "local"> => {
  const save = saveSiteProject(location, id, name, site)
  save.catch((err) => console.error("Site project save was refused", err))
  await getDocFromCache(docRef(location, id))
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  return Promise.race([save.then(() => "synced" as const), new Promise<"local">((resolve) => setTimeout(() => resolve("local"), offline ? 0 : withinMs))])
}

export const siteProjectHref = (id: string) => `/site-projects/project?id=${encodeURIComponent(id)}`

/** No-op for a public project — the rules refuse it anyway. */
export const deleteSiteProject = async (location: ProjectLocation, id: string) => {
  if (location.kind === "public") return
  await deleteDoc(docRef(location, id))
}

/** Every site project there is, public and every account's private ones.
 * Admins only (see projects/adminProjects.ts). */
export const subscribeToAllSiteProjects = (onData: (rows: AdminProjectRow<SiteSummary>[]) => void, onError?: (err: unknown) => void) =>
  subscribeToAllOf<SiteSummary>(PUBLIC, PRIVATE, onData, onError)

/** Moves a private site into the public ones, keeping its id (so its link
 * carries on, now for anyone): the public one is written first, the
 * private one removed only once that's on the server. Needs a connection. */
export const moveSiteToPublic = async (uid: string, id: string, name: string, site: SiteProject) => {
  await saveSiteProject({ kind: "public" }, id, name, site)
  await deleteDoc(docRef({ kind: "private", uid }, id))
}

/** A public copy of a site, as it is now; the private one's left alone.
 * Resolves to the copy's link. */
export const copySiteToPublic = async (name: string, site: SiteProject) => {
  const id = newSiteProjectId({ kind: "public" })
  await saveSiteProject({ kind: "public" }, id, name, site)
  return siteProjectHref(id)
}

/** Saved retaining wall projects in Firestore. Same private/public split
 * as the weatherboard and decking projects (see
 * weatherboards/projectStore.ts): a private project lives under your
 * account (users/{uid}/retainingWallProjects) and only you see it; a
 * public one (publicRetainingWallProjects) has no owner — anyone can
 * view, create or edit it, no login needed, but nobody can delete it.
 * Every loaded project carries the location it came from so saves go
 * back to the same place. */

import { collection, deleteDoc, doc, getDoc, getDocFromCache, onSnapshot, orderBy, query, setDoc, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { summariseWall, wallFromData, WallProject, WallSummary } from "./wallProject"

export type ProjectLocation = { kind: "private"; uid: string } | { kind: "public" }

export interface StoredWallProject {
  id: string
  name: string
  location: ProjectLocation
  wall: WallProject
  summary: WallSummary | null
  updatedAt: Date | null
}

const PUBLIC = "publicRetainingWallProjects"
const PRIVATE = "retainingWallProjects"

const collectionRef = (location: ProjectLocation) =>
  location.kind === "private" ? collection(firestore, "users", location.uid, PRIVATE) : collection(firestore, PUBLIC)

const docRef = (location: ProjectLocation, id: string) =>
  location.kind === "private" ? doc(firestore, "users", location.uid, PRIVATE, id) : doc(firestore, PUBLIC, id)

export const newProjectId = (location: ProjectLocation) => doc(collectionRef(location)).id

const fromData = (id: string, location: ProjectLocation, data: Record<string, unknown>): StoredWallProject => ({
  id,
  location,
  name: typeof data.name === "string" ? data.name : "Untitled",
  wall: wallFromData(data.wall),
  summary: (data.summary as WallSummary | undefined) ?? null,
  updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
})

export const subscribeToProjects = (
  location: ProjectLocation,
  onData: (projects: StoredWallProject[]) => void,
  onError?: (err: unknown) => void,
) =>
  onSnapshot(
    query(collectionRef(location), orderBy("updatedAt", "desc")),
    (snap) => onData(snap.docs.map((d) => fromData(d.id, location, d.data()))),
    (err) => {
      console.error("Retaining wall projects subscription failed", err)
      onError?.(err)
    },
  )

/** One-off load — the editor owns the wall once it's open, so it doesn't
 * take live updates that would clobber edits in progress. Online, this
 * is always the server's latest (what another device last saved). */
export const loadProject = async (location: ProjectLocation, id: string): Promise<StoredWallProject | null> => {
  // with no connection, go straight to the on-device cache instead of
  // waiting for Firestore to give up on the server first. Throws if this
  // device has never seen the project — which isn't the same as it not
  // existing, so the caller can say so.
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  const snap = offline ? await getDocFromCache(docRef(location, id)) : await getDoc(docRef(location, id))
  return snap.exists() ? fromData(snap.id, location, snap.data()) : null
}

/** Firestore refuses `undefined` anywhere in a document — a JSON round
 * trip drops those keys (a wall is plain JSON-shaped data anyway). */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** Resolves once the *server* has the write. Offline that's not until the
 * connection is back — but the write is already in Firestore's on-device
 * cache the moment this is called (so the project can be opened and
 * listed straight away), and it's sent on its own later, even after a
 * reload. Don't block the UI on this; see settleSoon. */
export const saveProject = async (location: ProjectLocation, id: string, name: string, wall: WallProject) => {
  await setDoc(docRef(location, id), {
    name: (name.trim() || "Untitled").slice(0, 100),
    wall: plain(wall),
    summary: plain(summariseWall(wall)),
    updatedAt: Timestamp.now(),
  })
}

/** Saves a project and resolves as soon as it's safe to move on:
 * "synced" if the server took it, or "local" if it's still outstanding
 * after `withinMs` (offline, or a connection too weak to be worth waiting
 * on). Either way the write is committed to the on-device cache first —
 * reading it back from there is what proves that — so the very next page
 * load can open the project even with no connection. Rejects only if the
 * server actually refused it. */
export const saveProjectSoon = async (
  location: ProjectLocation,
  id: string,
  name: string,
  wall: WallProject,
  withinMs = 2500,
): Promise<"synced" | "local"> => {
  const save = saveProject(location, id, name, wall)
  // don't let a rejection that lands after we've stopped waiting go unhandled
  save.catch((err) => console.error("Retaining wall project save was refused", err))
  await getDocFromCache(docRef(location, id))
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  return Promise.race([
    save.then(() => "synced" as const),
    new Promise<"local">((resolve) => setTimeout(() => resolve("local"), offline ? 0 : withinMs)),
  ])
}

/** Opens a project page. Online that's an ordinary in-app navigation;
 * offline it's a full page load, which the service worker can answer
 * from its saved copy (an in-app navigation needs the server). */
export const projectHref = (id: string) => `/retaining-walls/project?id=${encodeURIComponent(id)}`

/** No-op for a public project — the rules refuse it anyway. */
export const deleteProject = async (location: ProjectLocation, id: string) => {
  if (location.kind === "public") return
  await deleteDoc(docRef(location, id))
}

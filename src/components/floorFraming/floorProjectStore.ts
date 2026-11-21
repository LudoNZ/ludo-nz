/** Saved floors in Firestore, split the same way as retaining wall
 * projects (see retainingWall/wallProjectStore.ts): a private one under
 * your account (users/{uid}/floorProjects) only you see, a public one
 * (publicFloorProjects) anyone with the link can open and edit, no login
 * needed — only an admin can delete a public one. */

import { collection, deleteDoc, doc, DocumentReference, getDoc, getDocFromCache, onSnapshot, orderBy, query, setDoc, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import type { ProjectLocation } from "../retainingWall/wallProjectStore"
import { FloorInput, floorInputFromData, FloorSummary, summariseFloor } from "./floorData"
import { AdminProjectRow, subscribeToAllOf } from "../projects/adminProjects"

export type { ProjectLocation }

export interface StoredFloorProject {
  id: string
  name: string
  location: ProjectLocation
  floor: FloorInput
  summary: FloorSummary | null
  updatedAt: Date | null
}

const PUBLIC = "publicFloorProjects"
const PRIVATE = "floorProjects"

const collectionRef = (location: ProjectLocation) =>
  location.kind === "private" ? collection(firestore, "users", location.uid, PRIVATE) : collection(firestore, PUBLIC)

const docRef = (location: ProjectLocation, id: string) =>
  location.kind === "private" ? doc(firestore, "users", location.uid, PRIVATE, id) : doc(firestore, PUBLIC, id)

export const newFloorProjectId = (location: ProjectLocation) => doc(collectionRef(location)).id

const fromData = (id: string, location: ProjectLocation, data: Record<string, unknown>): StoredFloorProject => ({
  id,
  location,
  name: typeof data.name === "string" ? data.name : "Untitled",
  floor: floorInputFromData(data.floor),
  summary: (data.summary as FloorSummary | undefined) ?? null,
  updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
})

export const subscribeToFloorProjects = (location: ProjectLocation, onData: (projects: StoredFloorProject[]) => void, onError?: (err: unknown) => void) =>
  onSnapshot(
    query(collectionRef(location), orderBy("updatedAt", "desc")),
    (snap) => onData(snap.docs.map((d) => fromData(d.id, location, d.data()))),
    (err) => {
      console.error("Floor projects subscription failed", err)
      onError?.(err)
    },
  )

/** One-off load: the editor owns the floor once it's open. Offline, from
 * the on-device cache (throws if this device has never seen it). */
export const loadFloorProject = async (location: ProjectLocation, id: string): Promise<StoredFloorProject | null> => {
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  const snap = offline ? await getDocFromCache(docRef(location, id)) : await getDoc(docRef(location, id))
  return snap.exists() ? fromData(snap.id, location, snap.data()) : null
}

/** Firestore refuses `undefined` anywhere in a document */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const saveFloorProject = async (location: ProjectLocation, id: string, name: string, floor: FloorInput) => {
  await setDoc(docRef(location, id), {
    name: (name.trim() || "Untitled").slice(0, 100),
    floor: plain(floor),
    summary: plain(summariseFloor(floor)),
    updatedAt: Timestamp.now(),
  })
}

/** Saves, and resolves once it's on the device ("local") or the server
 * ("synced") — whichever is first worth waiting for. Rejects only if the
 * server refused it. */
export const saveFloorProjectSoon = async (location: ProjectLocation, id: string, name: string, floor: FloorInput, withinMs = 2500): Promise<"synced" | "local"> => {
  const save = saveFloorProject(location, id, name, floor)
  save.catch((err) => console.error("Floor project save was refused", err))
  await getDocFromCache(docRef(location, id))
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  return Promise.race([save.then(() => "synced" as const), new Promise<"local">((resolve) => setTimeout(() => resolve("local"), offline ? 0 : withinMs))])
}

export const floorProjectHref = (id: string) => `/floor-framing/project?id=${encodeURIComponent(id)}`

/** Admin: a private copy, in your own account, of any floor (someone
 * else's private one included — the rules let an admin read it). Resolves
 * to the copy's id. */
export const copyFloorToMine = async (from: DocumentReference, uid: string, name: string) => {
  const snap = await getDoc(from)
  if (!snap.exists()) throw new Error("That floor's gone")
  const location: ProjectLocation = { kind: "private", uid }
  const id = newFloorProjectId(location)
  await saveFloorProject(location, id, `${name} (copy)`.slice(0, 100), floorInputFromData(snap.data().floor))
  return id
}

/** No-op for a public project — the rules refuse it anyway. */
export const deleteFloorProject = async (location: ProjectLocation, id: string) => {
  if (location.kind === "public") return
  await deleteDoc(docRef(location, id))
}

/** Every saved floor there is, public and every account's private ones.
 * Admins only (see projects/adminProjects.ts). */
export const subscribeToAllFloorProjects = (onData: (rows: AdminProjectRow<FloorSummary>[]) => void, onError?: (err: unknown) => void) =>
  subscribeToAllOf<FloorSummary>(PUBLIC, PRIVATE, onData, onError)

/** Moves a private floor into the public ones, keeping its id (so its link
 * carries on, now for anyone): the public one is written first, the
 * private one removed only once that's on the server. Needs a connection. */
export const moveFloorToPublic = async (uid: string, id: string, name: string, floor: FloorInput) => {
  await saveFloorProject({ kind: "public" }, id, name, floor)
  await deleteDoc(docRef({ kind: "private", uid }, id))
}

/** A public copy of a floor, as it is now; the private one's left alone.
 * Resolves to the copy's link. */
export const copyFloorToPublic = async (name: string, floor: FloorInput) => {
  const id = newFloorProjectId({ kind: "public" })
  await saveFloorProject({ kind: "public" }, id, name, floor)
  return floorProjectHref(id)
}

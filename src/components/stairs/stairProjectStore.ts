/** Saved stairs in Firestore, split the same way as retaining wall
 * projects (see retainingWall/wallProjectStore.ts): a private one under
 * your account (users/{uid}/stairProjects) only you see, a public one
 * (publicStairProjects) anyone with the link can open and edit, no login
 * needed — only an admin can delete a public one. */

import { collection, deleteDoc, doc, DocumentReference, getDoc, getDocFromCache, onSnapshot, orderBy, query, setDoc, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import type { ProjectLocation } from "../retainingWall/wallProjectStore"
import { StairInput } from "./stairs"
import { stairInputFromData, StairSummary, summariseStair } from "./stairData"
import { AdminProjectRow, subscribeToAllOf } from "../projects/adminProjects"

export type { ProjectLocation }

export interface StoredStairProject {
  id: string
  name: string
  location: ProjectLocation
  stair: StairInput
  summary: StairSummary | null
  updatedAt: Date | null
}

const PUBLIC = "publicStairProjects"
const PRIVATE = "stairProjects"

const collectionRef = (location: ProjectLocation) =>
  location.kind === "private" ? collection(firestore, "users", location.uid, PRIVATE) : collection(firestore, PUBLIC)

const docRef = (location: ProjectLocation, id: string) =>
  location.kind === "private" ? doc(firestore, "users", location.uid, PRIVATE, id) : doc(firestore, PUBLIC, id)

export const newStairProjectId = (location: ProjectLocation) => doc(collectionRef(location)).id

const fromData = (id: string, location: ProjectLocation, data: Record<string, unknown>): StoredStairProject => ({
  id,
  location,
  name: typeof data.name === "string" ? data.name : "Untitled",
  stair: stairInputFromData(data.stair),
  summary: (data.summary as StairSummary | undefined) ?? null,
  updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
})

export const subscribeToStairProjects = (location: ProjectLocation, onData: (projects: StoredStairProject[]) => void, onError?: (err: unknown) => void) =>
  onSnapshot(
    query(collectionRef(location), orderBy("updatedAt", "desc")),
    (snap) => onData(snap.docs.map((d) => fromData(d.id, location, d.data()))),
    (err) => {
      console.error("Stair projects subscription failed", err)
      onError?.(err)
    },
  )

/** One-off load: the editor owns the stair once it's open. Offline, from
 * the on-device cache (throws if this device has never seen it). */
export const loadStairProject = async (location: ProjectLocation, id: string): Promise<StoredStairProject | null> => {
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  const snap = offline ? await getDocFromCache(docRef(location, id)) : await getDoc(docRef(location, id))
  return snap.exists() ? fromData(snap.id, location, snap.data()) : null
}

/** Firestore refuses `undefined` anywhere in a document */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const saveStairProject = async (location: ProjectLocation, id: string, name: string, stair: StairInput) => {
  await setDoc(docRef(location, id), {
    name: (name.trim() || "Untitled").slice(0, 100),
    stair: plain(stair),
    summary: plain(summariseStair(stair)),
    updatedAt: Timestamp.now(),
  })
}

/** Saves, and resolves once it's on the device ("local") or the server
 * ("synced") — whichever is first worth waiting for. Rejects only if the
 * server refused it. */
export const saveStairProjectSoon = async (location: ProjectLocation, id: string, name: string, stair: StairInput, withinMs = 2500): Promise<"synced" | "local"> => {
  const save = saveStairProject(location, id, name, stair)
  save.catch((err) => console.error("Stair project save was refused", err))
  await getDocFromCache(docRef(location, id))
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  return Promise.race([save.then(() => "synced" as const), new Promise<"local">((resolve) => setTimeout(() => resolve("local"), offline ? 0 : withinMs))])
}

export const stairProjectHref = (id: string) => `/stairs/project?id=${encodeURIComponent(id)}`

/** Admin: a private copy, in your own account, of any stair (someone
 * else's private one included — the rules let an admin read it). Resolves
 * to the copy's id. */
export const copyStairToMine = async (from: DocumentReference, uid: string, name: string) => {
  const snap = await getDoc(from)
  if (!snap.exists()) throw new Error("That stair's gone")
  const location: ProjectLocation = { kind: "private", uid }
  const id = newStairProjectId(location)
  await saveStairProject(location, id, `${name} (copy)`.slice(0, 100), stairInputFromData(snap.data().stair))
  return id
}

/** No-op for a public project — the rules refuse it anyway. */
export const deleteStairProject = async (location: ProjectLocation, id: string) => {
  if (location.kind === "public") return
  await deleteDoc(docRef(location, id))
}

/** Every saved stair there is, public and every account's private ones.
 * Admins only (see projects/adminProjects.ts). */
export const subscribeToAllStairProjects = (onData: (rows: AdminProjectRow<StairSummary>[]) => void, onError?: (err: unknown) => void) =>
  subscribeToAllOf<StairSummary>(PUBLIC, PRIVATE, onData, onError)

/** Saved houses in Firestore, split the same way as the other calculators'
 * projects (see floorFraming/floorProjectStore.ts): a private one under
 * your account (users/{uid}/houseProjects) only you see, a public one
 * (publicHouseProjects) anyone with the link can open and edit, no login
 * needed — only an admin can delete a public one. */

import { collection, deleteDoc, doc, DocumentReference, getDoc, getDocFromCache, onSnapshot, orderBy, query, setDoc, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import type { ProjectLocation } from "../retainingWall/wallProjectStore"
import { AdminProjectRow, subscribeToAllOf } from "../projects/adminProjects"
import { floorGraph } from "./floorPlan"
import { houseCladding } from "./houseCladding"
import { houseFromData, HouseProject, ROOF_FRAME_LABELS } from "./houseTypes"
import { analyseHouse, Structure } from "./structure"

export type { ProjectLocation }

/** the brief figures a house's card shows */
export interface HouseSummary {
  areaM2: number
  rooms: number
  /** absent on houses saved before storeys */
  storeys?: number
  roof: string
  frame: string
  loadBearing: number
  warnings: number
}

export const summariseHouse = (house: HouseProject): HouseSummary => {
  const graph = floorGraph(house.floor)
  const upperGraph = house.upper ? floorGraph(house.upper.plan) : null
  const cladding = houseCladding(house, graph, upperGraph)
  const st = analyseHouse(graph, upperGraph, house.settings, cladding?.roof ?? null, cladding?.lowerRoofs ?? [])
  const lb = (s: Structure | null) => (s ? s.outside.filter((v) => v.loadBearing).length + [...s.inside.values()].filter((v) => v.loadBearing).length : 0)
  const graphs = upperGraph ? [graph, upperGraph] : [graph]
  return {
    areaM2: Math.round(graphs.flatMap((g) => g.rooms).reduce((s, r) => s + r.areaM2, 0) * 10) / 10,
    rooms: graphs.reduce((s, g) => s + g.rooms.length, 0),
    storeys: graphs.length,
    roof: house.settings.roof.type,
    frame: ROOF_FRAME_LABELS[house.settings.roofFrame],
    loadBearing: lb(st.ground) + lb(st.upper),
    warnings: st.ground.warnings.length + (st.upper?.warnings.length ?? 0) + graphs.reduce((s, g) => s + g.warnings.length, 0),
  }
}

export interface StoredHouseProject {
  id: string
  name: string
  location: ProjectLocation
  house: HouseProject
  summary: HouseSummary | null
  updatedAt: Date | null
}

const PUBLIC = "publicHouseProjects"
const PRIVATE = "houseProjects"

const collectionRef = (location: ProjectLocation) =>
  location.kind === "private" ? collection(firestore, "users", location.uid, PRIVATE) : collection(firestore, PUBLIC)

const docRef = (location: ProjectLocation, id: string) =>
  location.kind === "private" ? doc(firestore, "users", location.uid, PRIVATE, id) : doc(firestore, PUBLIC, id)

export const newHouseProjectId = (location: ProjectLocation) => doc(collectionRef(location)).id

const fromData = (id: string, location: ProjectLocation, data: Record<string, unknown>): StoredHouseProject => {
  const name = typeof data.name === "string" ? data.name : "Untitled"
  return {
    id,
    location,
    name,
    // the name lives on the document; the house carries it too
    house: { ...houseFromData(data.house), name },
    summary: (data.summary as HouseSummary | undefined) ?? null,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
  }
}

export const subscribeToHouseProjects = (location: ProjectLocation, onData: (projects: StoredHouseProject[]) => void, onError?: (err: unknown) => void) =>
  onSnapshot(
    query(collectionRef(location), orderBy("updatedAt", "desc")),
    (snap) => onData(snap.docs.map((d) => fromData(d.id, location, d.data()))),
    (err) => {
      console.error("House projects subscription failed", err)
      onError?.(err)
    },
  )

/** One-off load: the editor owns the house once it's open. Offline, from
 * the on-device cache (throws if this device has never seen it). */
export const loadHouseProject = async (location: ProjectLocation, id: string): Promise<StoredHouseProject | null> => {
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  const snap = offline ? await getDocFromCache(docRef(location, id)) : await getDoc(docRef(location, id))
  return snap.exists() ? fromData(snap.id, location, snap.data()) : null
}

/** Firestore refuses `undefined` anywhere in a document */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const saveHouseProject = async (location: ProjectLocation, id: string, name: string, house: HouseProject) => {
  const n = (name.trim() || "Untitled").slice(0, 100)
  await setDoc(docRef(location, id), {
    name: n,
    house: plain({ ...house, name: n }),
    summary: plain(summariseHouse(house)),
    updatedAt: Timestamp.now(),
  })
}

/** Saves, and resolves once it's on the device ("local") or the server
 * ("synced") — whichever is first worth waiting for. Rejects only if the
 * server refused it. */
export const saveHouseProjectSoon = async (location: ProjectLocation, id: string, name: string, house: HouseProject, withinMs = 2500): Promise<"synced" | "local"> => {
  const save = saveHouseProject(location, id, name, house)
  save.catch((err) => console.error("House project save was refused", err))
  await getDocFromCache(docRef(location, id))
  const offline = typeof navigator !== "undefined" && !navigator.onLine
  return Promise.race([save.then(() => "synced" as const), new Promise<"local">((resolve) => setTimeout(() => resolve("local"), offline ? 0 : withinMs))])
}

export const houseProjectHref = (id: string) => `/house/project?id=${encodeURIComponent(id)}`

/** Admin: a private copy, in your own account, of any house. Resolves to the copy's id. */
export const copyHouseToMine = async (from: DocumentReference, uid: string, name: string) => {
  const snap = await getDoc(from)
  if (!snap.exists()) throw new Error("That house's gone")
  const location: ProjectLocation = { kind: "private", uid }
  const id = newHouseProjectId(location)
  // (a copy gets its own cladding: it's not linked to the original's)
  await saveHouseProject(location, id, `${name} (copy)`.slice(0, 100), { ...houseFromData(snap.data().house), link: null })
  return id
}

/** No-op for a public project — the rules refuse it anyway. */
export const deleteHouseProject = async (location: ProjectLocation, id: string) => {
  if (location.kind === "public") return
  await deleteDoc(docRef(location, id))
}

/** Every saved house there is, public and every account's private ones.
 * Admins only (see projects/adminProjects.ts). */
export const subscribeToAllHouseProjects = (onData: (rows: AdminProjectRow<HouseSummary>[]) => void, onError?: (err: unknown) => void) =>
  subscribeToAllOf<HouseSummary>(PUBLIC, PRIVATE, onData, onError)

/** Moves a private house into the public ones, keeping its id (so its link
 * carries on, now for anyone). Needs a connection. */
export const moveHouseToPublic = async (uid: string, id: string, name: string, house: HouseProject) => {
  await saveHouseProject({ kind: "public" }, id, name, house)
  await deleteDoc(docRef({ kind: "private", uid }, id))
}

/** A public copy of a house, as it is now (not linked to its cladding);
 * the private one's left alone. Resolves to the copy's link. */
export const copyHouseToPublic = async (name: string, house: HouseProject) => {
  const id = newHouseProjectId({ kind: "public" })
  await saveHouseProject({ kind: "public" }, id, name, { ...house, link: null })
  return houseProjectHref(id)
}

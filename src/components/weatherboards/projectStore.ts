/** Saved weatherboard projects in Firestore. Same private/public split
 * as decking (see decking/data.ts): a private project lives under your
 * account (users/{uid}/weatherboardProjects) and only you see it; a
 * public one (publicWeatherboardProjects) has no owner — anyone can
 * view, create or edit it, no login needed, but nobody can delete it.
 * Every loaded project carries the location it came from so saves go
 * back to the same place. */

import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { ProjectSummary, summarise } from "./takeoff"
import { WeatherboardProject } from "./types"

export type ProjectLocation = { kind: "private"; uid: string } | { kind: "public" }

export interface StoredProject extends WeatherboardProject {
  id: string
  name: string
  location: ProjectLocation
  summary: ProjectSummary | null
  updatedAt: Date | null
}

const PUBLIC = "publicWeatherboardProjects"

const collectionRef = (location: ProjectLocation) =>
  location.kind === "private"
    ? collection(firestore, "users", location.uid, "weatherboardProjects")
    : collection(firestore, PUBLIC)

const docRef = (location: ProjectLocation, id: string) =>
  location.kind === "private"
    ? doc(firestore, "users", location.uid, "weatherboardProjects", id)
    : doc(firestore, PUBLIC, id)

export const newProjectId = (location: ProjectLocation) => doc(collectionRef(location)).id

const fromData = (id: string, location: ProjectLocation, data: Record<string, unknown>): StoredProject => ({
  id,
  location,
  name: typeof data.name === "string" ? data.name : "Untitled",
  settings: (data.settings ?? {}) as WeatherboardProject["settings"],
  elevations: Array.isArray(data.elevations) ? (data.elevations as WeatherboardProject["elevations"]) : [],
  summary: (data.summary as ProjectSummary | undefined) ?? null,
  updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
})

export const subscribeToProjects = (
  location: ProjectLocation,
  onData: (projects: StoredProject[]) => void,
  onError?: (err: unknown) => void,
) =>
  onSnapshot(
    query(collectionRef(location), orderBy("updatedAt", "desc")),
    (snap) => onData(snap.docs.map((d) => fromData(d.id, location, d.data()))),
    (err) => {
      console.error("Weatherboard projects subscription failed", err)
      onError?.(err)
    },
  )

/** One-off load — the editor owns the project once it's open, so it
 * doesn't take live updates that would clobber edits in progress. */
export const loadProject = async (location: ProjectLocation, id: string): Promise<StoredProject | null> => {
  const snap = await getDoc(docRef(location, id))
  return snap.exists() ? fromData(snap.id, location, snap.data()) : null
}

/** Firestore refuses `undefined` anywhere in a document — a JSON round
 * trip drops those keys (projects are plain JSON-shaped data anyway). */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const saveProject = async (location: ProjectLocation, id: string, name: string, project: WeatherboardProject) => {
  await setDoc(docRef(location, id), {
    name: (name.trim() || "Untitled").slice(0, 100),
    settings: plain(project.settings),
    elevations: plain(project.elevations),
    summary: plain(summarise(project)),
    updatedAt: Timestamp.now(),
  })
}

/** No-op for a public project — the rules refuse it anyway. */
export const deleteProject = async (location: ProjectLocation, id: string) => {
  if (location.kind === "public") return
  await deleteDoc(docRef(location, id))
}

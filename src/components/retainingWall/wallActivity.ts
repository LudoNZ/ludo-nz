/** The retaining wall activity log: one Firestore doc per finished change,
 * undo, redo, lock or unlock, on any wall — public, private or a scratch
 * wall — for the admin dashboard's reporting.
 *
 * Anyone editing a wall can add an entry (the editor works signed out);
 * entries can never be changed or deleted from the client, and only an
 * admin can read them (see firestore.rules: retainingWallActivity).
 *
 * Written through the Firestore client rather than a server action so an
 * edit made on site with no signal is still logged: the write waits on
 * the device and goes when the connection comes back, like the project
 * save does. Logging never gets in the way of editing: a failed write is
 * only reported to the console. */

import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, Timestamp, where } from "firebase/firestore"
import type { User } from "firebase/auth"
import { firestore } from "../../../firebase/client"
import type { WallActivity } from "./wallHistory"
import type { ProjectLocation } from "./wallProjectStore"

const ACTIVITY = "retainingWallActivity"
const BROWSER_ID_KEY = "retainingWalls.browserId"

export type ActivityProjectKind = "public" | "private" | "scratch"

/** which wall an entry belongs to */
export interface ActivityProject {
  kind: ActivityProjectKind
  /** the project id; for a scratch wall, an id for this browser */
  id: string
  name: string
  /** a private project's owner; null otherwise */
  ownerUid: string | null
}

export interface ActivityEntry extends WallActivity {
  id: string
  projectKind: ActivityProjectKind
  projectId: string
  projectName: string
  ownerUid: string | null
  actorUid: string | null
  actorEmail: string | null
  at: Date | null
}

/** A stable id for this browser's scratch wall, so its activity groups
 * together in the reports. Falls back to a throwaway one when storage is
 * blocked. */
export function scratchBrowserId(): string {
  try {
    let id = localStorage.getItem(BROWSER_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(BROWSER_ID_KEY, id)
    }
    return id
  } catch {
    return "unknown-browser"
  }
}

export function activityProject(location: ProjectLocation, id: string, name: string): ActivityProject {
  return { kind: location.kind, id, name, ownerUid: location.kind === "private" ? location.uid : null }
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s)

export function logWallActivity(project: ActivityProject, activity: WallActivity, user: User | null) {
  void addDoc(collection(firestore, ACTIVITY), {
    projectKind: project.kind,
    projectId: project.id,
    projectName: clip(project.name || "Untitled", 100),
    ownerUid: project.ownerUid,
    action: activity.action,
    label: clip(activity.label, 300),
    fields: activity.fields.slice(0, 40),
    actorUid: user?.uid ?? null,
    actorEmail: user?.email ?? null,
    at: serverTimestamp(),
  }).catch((err) => console.warn("Logging retaining wall activity failed", err))
}

const fromData = (id: string, d: Record<string, unknown>): ActivityEntry => ({
  id,
  projectKind: d.projectKind as ActivityProjectKind,
  projectId: String(d.projectId ?? ""),
  projectName: String(d.projectName ?? "Untitled"),
  ownerUid: (d.ownerUid as string | null) ?? null,
  action: d.action as WallActivity["action"],
  label: String(d.label ?? ""),
  fields: Array.isArray(d.fields) ? (d.fields as string[]) : [],
  actorUid: (d.actorUid as string | null) ?? null,
  actorEmail: (d.actorEmail as string | null) ?? null,
  at: d.at instanceof Timestamp ? d.at.toDate() : null,
})

/** Admin only: the newest entries since `since` (all time when null),
 * newest first, up to `max`. */
export async function loadWallActivity(since: Date | null, max: number): Promise<ActivityEntry[]> {
  const col = collection(firestore, ACTIVITY)
  const q = since
    ? query(col, where("at", ">=", Timestamp.fromDate(since)), orderBy("at", "desc"), limit(max))
    : query(col, orderBy("at", "desc"), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromData(d.id, d.data()))
}

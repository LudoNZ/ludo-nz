"use server"

import { FieldValue } from "firebase-admin/firestore"
import { getAuthAdmin, getFirestoreAdmin } from "../../../firebase/server"

/** Milestones in the retaining wall activity log (`retainingWallActivity`):
 * a project created, a proposal printed. Written here with the Admin SDK
 * rather than from the browser, so the log's Firestore rules (which only
 * allow the editor's own change/undo/redo/lock entries) don't need
 * changing. Who did it comes from their verified ID token, never from
 * what the browser says. Never throws: logging mustn't get in the way. */
export type MilestoneAction = "create" | "proposal"

export interface MilestoneInput {
  action: MilestoneAction
  projectKind: "public" | "private" | "scratch"
  projectId: string
  projectName: string
  label: string
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s)

export async function logMilestone(idToken: string | null, input: MilestoneInput): Promise<void> {
  try {
    if (input.action !== "create" && input.action !== "proposal") return
    if (!["public", "private", "scratch"].includes(input.projectKind)) return
    if (typeof input.projectId !== "string" || !input.projectId || input.projectId.length > 128) return
    let actorUid: string | null = null
    let actorEmail: string | null = null
    if (idToken) {
      const token = await getAuthAdmin().verifyIdToken(idToken)
      actorUid = token.uid
      actorEmail = token.email ?? null
    }
    // a private project only ever belongs to whoever's signed in
    if (input.projectKind === "private" && !actorUid) return
    await getFirestoreAdmin()
      .collection("retainingWallActivity")
      .add({
        projectKind: input.projectKind,
        projectId: input.projectId,
        projectName: clip(String(input.projectName || "Untitled"), 100),
        ownerUid: input.projectKind === "private" ? actorUid : null,
        action: input.action,
        label: clip(String(input.label ?? ""), 300),
        fields: [],
        actorUid,
        actorEmail,
        at: FieldValue.serverTimestamp(),
      })
  } catch (e) {
    console.error("logMilestone failed:", e)
  }
}

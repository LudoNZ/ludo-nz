// Server-only: imports the Admin SDK. Never import this from a client component.
import { randomBytes } from "node:crypto"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import type { DecodedIdToken } from "firebase-admin/auth"
import { getAuthAdmin, getFirestoreAdmin } from "../../firebase/server"
import { FeatureId, normaliseFeatures } from "./features"

/** `members/{inviteId}`: one doc per invited person. The doc id is the
 * secret in their invite link (/register?invite=<id>). Only the Admin SDK
 * touches this collection; Firestore rules deny all client access to it
 * (the catch-all deny at the bottom of firestore.rules).
 *
 * - invited: link sent, not used yet (`uid` is null)
 * - active: bound to a Firebase Auth account (`uid`)
 * - revoked: access withdrawn; signing in is refused */
export type MemberStatus = "invited" | "active" | "revoked"

export interface MemberDoc {
  /** lowercased. The invited address until accepted, then the address of
   * the account that accepted it (a Google account may differ). */
  email: string
  name: string | null
  features: FeatureId[]
  status: MemberStatus
  uid: string | null
  invitedAt: Timestamp
  acceptedAt: Timestamp | null
}

export const MEMBERS = "members"

export function membersCol() {
  return getFirestoreAdmin().collection(MEMBERS)
}

export function newInviteId() {
  return randomBytes(18).toString("base64url")
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase()
}

/** The site owner: an existing admin claim, or a verified sign-in with
 * ADMIN_EMAIL. The address has to be verified, or anyone could create an
 * unverified email/password account with it straight against the Firebase
 * API and be made admin. */
export function isAdminToken(token: { admin?: unknown; email?: string; email_verified?: boolean }) {
  if (token.admin === true) return true
  const adminEmail = process.env.ADMIN_EMAIL
  return !!adminEmail && !!token.email && token.email_verified === true && normaliseEmail(token.email) === normaliseEmail(adminEmail)
}

/** Find the member record for a signed-in account, binding a pending
 * invite to it on first sign-in. Matches, in order: the account's uid; a
 * pending invite for its (verified) email; the invite id it arrived with
 * from an invite link (so an invite can be accepted with a Google account
 * whose address differs from the one invited). */
export async function findMemberForToken(
  token: DecodedIdToken,
  inviteId?: string | null,
): Promise<{ id: string; data: MemberDoc } | null> {
  const col = membersCol()

  const byUid = await col.where("uid", "==", token.uid).limit(1).get()
  if (!byUid.empty) return { id: byUid.docs[0].id, data: byUid.docs[0].data() as MemberDoc }

  let pending: { id: string; data: MemberDoc } | null = null
  if (token.email && token.email_verified) {
    const byEmail = await col.where("email", "==", normaliseEmail(token.email)).where("status", "==", "invited").limit(1).get()
    if (!byEmail.empty) pending = { id: byEmail.docs[0].id, data: byEmail.docs[0].data() as MemberDoc }
  }
  if (!pending && inviteId) {
    const doc = await col.doc(inviteId).get()
    const data = doc.data() as MemberDoc | undefined
    if (data && data.status === "invited" && !data.uid) pending = { id: doc.id, data }
  }
  if (!pending) return null

  const update = {
    uid: token.uid,
    status: "active" as const,
    email: token.email ? normaliseEmail(token.email) : pending.data.email,
    name: pending.data.name ?? (token.name as string | undefined) ?? null,
    acceptedAt: FieldValue.serverTimestamp(),
  }
  await col.doc(pending.id).update(update)
  return { id: pending.id, data: { ...pending.data, ...update, acceptedAt: Timestamp.now() } }
}

/** The custom claims an account should carry. Features go in the ID token
 * so pages still know what to show offline, and so server actions (and
 * Firestore rules, if wanted later) can check them without a lookup. */
export function claimsFor(isAdmin: boolean, member: MemberDoc | null): Record<string, unknown> {
  if (isAdmin) return { admin: true }
  if (member?.status === "active") return { features: normaliseFeatures(member.features) }
  return {}
}

export function claimsMatch(token: DecodedIdToken, wanted: Record<string, unknown>) {
  const tokenFeatures = normaliseFeatures(token.features as unknown[] | undefined)
  const wantedFeatures = normaliseFeatures(wanted.features as unknown[] | undefined)
  return (token.admin === true) === (wanted.admin === true) && tokenFeatures.join() === wantedFeatures.join()
}

/** Push a member's current grants onto their Auth account straight away.
 * Their open tabs pick it up on the next page load (setToken compares the
 * token's claims with these and has the client refresh its token). */
export async function syncMemberClaims(member: MemberDoc) {
  if (!member.uid) return
  await getAuthAdmin().setCustomUserClaims(member.uid, claimsFor(false, member))
}

/** Server-side feature check for server actions: verifies a fresh ID token
 * (from `user.getIdToken()`) and that it carries the feature. */
export async function requireFeature(idToken: string, feature: FeatureId): Promise<DecodedIdToken> {
  const token = await getAuthAdmin().verifyIdToken(idToken)
  if (isAdminToken(token)) return token
  if (!normaliseFeatures(token.features as unknown[] | undefined).includes(feature)) {
    throw new Error(`No access to ${feature}`)
  }
  return token
}

export async function requireAdmin(idToken: string): Promise<DecodedIdToken> {
  const token = await getAuthAdmin().verifyIdToken(idToken)
  if (!isAdminToken(token)) throw new Error("Admins only")
  return token
}

"use server"

import type { UserRecord } from "firebase-admin/auth"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { getAuthAdmin } from "../../../firebase/server"
import { FeatureId, normaliseFeatures } from "@/lib/features"
import {
  DEFAULT_INVITE_DAYS,
  isAdminToken,
  MemberDoc,
  MemberStatus,
  membersCol,
  newInviteId,
  normaliseEmail,
  requireAdmin,
  syncMemberClaims,
} from "@/lib/members.server"

// Every action takes a fresh ID token (`user.getIdToken()`) and checks it's
// an admin's before doing anything.

export interface MemberRow {
  id: string
  email: string
  name: string | null
  features: FeatureId[]
  status: MemberStatus
  uid: string | null
  invitedAt: string | null
  acceptedAt: string | null
  /** when an unused invite's link stops working; null = never */
  expiresAt: string | null
  lastSignInAt: string | null
  providers: string[]
}

/** A Firebase Auth account with no member record: someone who signed in
 * before logins went invite only, or tried Google sign-in uninvited. They
 * can't get in until granted access. */
export interface AccountRow {
  uid: string
  email: string | null
  name: string | null
  createdAt: string | null
  lastSignInAt: string | null
  providers: string[]
}

const iso = (t: Timestamp | null | undefined) => (t?.toDate ? t.toDate().toISOString() : null)
const isoStr = (s: string | undefined) => (s ? new Date(s).toISOString() : null)
const providersOf = (u: UserRecord | undefined) => (u ? u.providerData.map((p) => p.providerId) : [])

async function allUsers(): Promise<UserRecord[]> {
  const users: UserRecord[] = []
  let pageToken: string | undefined
  do {
    const page = await getAuthAdmin().listUsers(1000, pageToken)
    users.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)
  return users
}

export async function listMembers(idToken: string): Promise<{ members: MemberRow[]; accounts: AccountRow[] }> {
  await requireAdmin(idToken)
  const [snap, users] = await Promise.all([membersCol().get(), allUsers()])
  const usersByUid = new Map(users.map((u) => [u.uid, u]))

  const members: MemberRow[] = snap.docs.map((doc) => {
    const d = doc.data() as MemberDoc
    const user = d.uid ? usersByUid.get(d.uid) : undefined
    return {
      id: doc.id,
      email: d.email,
      name: d.name ?? user?.displayName ?? null,
      features: normaliseFeatures(d.features),
      status: d.status,
      uid: d.uid,
      invitedAt: iso(d.invitedAt),
      acceptedAt: iso(d.acceptedAt),
      expiresAt: iso(d.expiresAt),
      lastSignInAt: isoStr(user?.metadata.lastSignInTime),
      providers: providersOf(user),
    }
  })
  members.sort((a, b) => (b.invitedAt ?? "").localeCompare(a.invitedAt ?? ""))

  const memberUids = new Set(members.map((m) => m.uid).filter(Boolean))
  const accounts: AccountRow[] = users
    .filter((u) => !memberUids.has(u.uid))
    // leave the admin's own account out of this list
    .filter((u) => !isAdminToken({ admin: u.customClaims?.admin, email: u.email, email_verified: u.emailVerified }))
    .map((u) => ({
      uid: u.uid,
      email: u.email ?? null,
      name: u.displayName ?? null,
      createdAt: isoStr(u.metadata.creationTime),
      lastSignInAt: isoStr(u.metadata.lastSignInTime),
      providers: providersOf(u),
    }))
    .sort((a, b) => (b.lastSignInAt ?? "").localeCompare(a.lastSignInAt ?? ""))

  return { members, accounts }
}

export async function createInvite(
  idToken: string,
  /** email blank: an open invite, where they enter their own name and email */
  input: { email: string; name: string; features: string[]; expiresInDays?: number },
): Promise<{ ok: true; id: string; expiresAt: string } | { ok: false; error: string }> {
  await requireAdmin(idToken)
  const email = normaliseEmail(input.email)
  if (email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "That doesn't look like an email address." }
    const existing = await membersCol().where("email", "==", email).get()
    const live = existing.docs.find((d) => (d.data() as MemberDoc).status !== "revoked")
    if (live) {
      return { ok: false, error: `${email} already has ${live.data().status === "invited" ? "an invite" : "access"}.` }
    }
  }
  const days = Math.min(30, Math.max(1, Math.round(input.expiresInDays ?? DEFAULT_INVITE_DAYS)))
  const expiresAt = Timestamp.fromMillis(Date.now() + days * 86_400_000)

  const id = newInviteId()
  await membersCol()
    .doc(id)
    .set({
      email,
      name: input.name.trim() || null,
      features: normaliseFeatures(input.features),
      status: "invited",
      uid: null,
      invitedAt: FieldValue.serverTimestamp(),
      acceptedAt: null,
      expiresAt,
    })
  return { ok: true, id, expiresAt: expiresAt.toDate().toISOString() }
}

/** Change what a member can use. Takes effect on their next page load. */
export async function setMemberFeatures(idToken: string, id: string, features: string[]): Promise<void> {
  await requireAdmin(idToken)
  const ref = membersCol().doc(id)
  const normalised = normaliseFeatures(features)
  await ref.update({ features: normalised })
  const doc = (await ref.get()).data() as MemberDoc
  await syncMemberClaims(doc)
}

/** Revoke (signs them out everywhere, and further sign-ins are refused) or
 * restore a member's access. Their account and data are left alone. */
export async function setMemberRevoked(idToken: string, id: string, revoked: boolean): Promise<void> {
  await requireAdmin(idToken)
  const ref = membersCol().doc(id)
  const data = (await ref.get()).data() as MemberDoc | undefined
  if (!data) throw new Error("No such member")
  const status: MemberStatus = revoked ? "revoked" : data.uid ? "active" : "invited"
  await ref.update({ status })
  if (data.uid) {
    await syncMemberClaims({ ...data, status })
    if (revoked) await getAuthAdmin().revokeRefreshTokens(data.uid)
  }
}

/** Remove an invite or member record. For a member who'd accepted, this is
 * the same as revoking (their Auth account and data stay), minus the
 * record, so they'd need a fresh invite to come back. */
export async function deleteMember(idToken: string, id: string): Promise<void> {
  await requireAdmin(idToken)
  const ref = membersCol().doc(id)
  const data = (await ref.get()).data() as MemberDoc | undefined
  await ref.delete()
  if (data?.uid) {
    await getAuthAdmin().setCustomUserClaims(data.uid, {})
    await getAuthAdmin().revokeRefreshTokens(data.uid)
  }
}

/** Let an existing account in (one listed under "accounts without
 * access") without sending an invite. */
export async function grantAccount(idToken: string, uid: string, features: string[]): Promise<void> {
  await requireAdmin(idToken)
  const user = await getAuthAdmin().getUser(uid)
  const already = await membersCol().where("uid", "==", uid).limit(1).get()
  if (!already.empty) throw new Error("That account already has a member record")
  const member: MemberDoc = {
    email: normaliseEmail(user.email ?? ""),
    name: user.displayName ?? null,
    features: normaliseFeatures(features),
    status: "active",
    uid,
    invitedAt: Timestamp.now(),
    acceptedAt: Timestamp.now(),
  }
  await membersCol().doc(newInviteId()).set(member)
  await syncMemberClaims(member)
}

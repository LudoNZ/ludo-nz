"use server"

import { cookies } from "next/headers"
import { getAuthAdmin, getFirestoreAdmin } from "../../firebase/server"
import { FeatureId, normaliseFeatures } from "@/lib/features"
import {
  claimsFor,
  claimsMatch,
  findMemberForToken,
  isAdminToken,
  isOpenInvite,
  MemberDoc,
  membersCol,
  normaliseEmail,
} from "@/lib/members.server"

export const removeToken = async () => {
  const cookieStore = await cookies()
  cookieStore.delete("firebaseAuthToken")
  cookieStore.delete("firebaseAuthRefreshToken")
}

/** What a signed-in account may do:
 * - admin: everything
 * - member: an accepted invite; `features` is what they've been granted
 * - denied: no invite (or it was revoked); the client signs them out
 * - unknown: the check itself failed (server misconfigured, etc.); the
 *   client falls back to the claims already in its token rather than
 *   signing anyone out over a server hiccup */
export type Access = "admin" | "member" | "denied" | "unknown"

export type SetTokenResult = {
  claimsUpdated: boolean
  access: Access
  features: FeatureId[]
}

export const setToken = async ({
  token,
  refreshToken,
  inviteId,
}: {
  token: string
  refreshToken: string
  /** from an invite link, when signing in from /register?invite=… */
  inviteId?: string | null
}): Promise<SetTokenResult> => {
  let decoded
  try {
    decoded = await getAuthAdmin().verifyIdToken(token)
  } catch (e) {
    console.log("Token verification failed:", e)
    return { claimsUpdated: false, access: "unknown", features: [] }
  }

  let access: Access
  let features: FeatureId[] = []
  let wantedClaims: Record<string, unknown>
  try {
    const isAdmin = isAdminToken(decoded)
    const member = isAdmin ? null : await findMemberForToken(decoded, inviteId)
    wantedClaims = claimsFor(isAdmin, member?.data ?? null)
    if (isAdmin) access = "admin"
    else if (member?.data.status === "active") {
      access = "member"
      features = normaliseFeatures(member.data.features)
    } else access = "denied"
  } catch (e) {
    console.log("Member lookup failed:", e)
    return { claimsUpdated: false, access: "unknown", features: [] }
  }

  if (access === "denied") {
    await removeToken()
  } else {
    const cookieStore = await cookies()
    const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/" }
    cookieStore.set("firebaseAuthToken", token, opts)
    cookieStore.set("firebaseAuthRefreshToken", refreshToken, opts)
  }

  // compared against the *token's* claims, not the stored user record: an
  // admin may have already updated the record, and it's this token that
  // needs replacing
  let claimsUpdated = false
  if (!claimsMatch(decoded, wantedClaims)) {
    try {
      await getAuthAdmin().setCustomUserClaims(decoded.uid, wantedClaims)
      claimsUpdated = access !== "denied"
    } catch (e) {
      console.log("Setting claims failed:", e)
    }
  }

  return { claimsUpdated, access, features }
}

/** The public face of an invite, for the /register page. `email` is blank
 * on an open invite: they enter their own. */
export const getInvite = async (
  inviteId: string,
): Promise<{ email: string; name: string | null; expiresAt: string | null } | null> => {
  if (!inviteId || inviteId.length > 64) return null
  try {
    const doc = await membersCol().doc(inviteId).get()
    const data = doc.data() as MemberDoc | undefined
    if (!isOpenInvite(data)) return null
    return { email: data.email, name: data.name, expiresAt: data.expiresAt ? data.expiresAt.toDate().toISOString() : null }
  } catch (e) {
    console.log("Invite lookup failed:", e)
    return null
  }
}

/** Accept an invite by choosing a password. The account is created here
 * with the Admin SDK, so it's only ever made through a valid invite: for
 * the invited address, or on an open invite the address they enter. The
 * client then signs in with the same email and password, and setToken
 * finds the member record by uid. */
export const acceptInviteWithPassword = async ({
  inviteId,
  name,
  email: enteredEmail,
  password,
}: {
  inviteId: string
  name: string
  /** used on an open invite only */
  email?: string
  password: string
}): Promise<{ ok: true; email: string } | { ok: false; error: string }> => {
  const used = { ok: false as const, error: "This invite link has already been used, has expired, or is no longer valid." }
  const ref = membersCol().doc(inviteId)
  const doc = await ref.get()
  const data = doc.data() as MemberDoc | undefined
  if (!isOpenInvite(data)) return used
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." }

  const open = !data.email
  const email = normaliseEmail(open ? (enteredEmail ?? "") : data.email)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email address." }
  const displayName = name.trim() || data.name || undefined
  if (open && !displayName) return { ok: false, error: "Enter your name." }
  if (open) {
    const taken = await membersCol().where("email", "==", email).get()
    if (taken.docs.some((d) => (d.data() as MemberDoc).status !== "revoked")) {
      return { ok: false, error: "That email is already a member. Log in instead." }
    }
  }
  let uid: string
  try {
    const user = await getAuthAdmin().createUser({ email, password, displayName })
    uid = user.uid
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === "auth/email-already-exists") {
      return {
        ok: false,
        error: "There's already an account for this email. Sign in with Google below, or use \"Forgot password\" on the login page.",
      }
    }
    if (code === "auth/invalid-password") return { ok: false, error: "That password isn't strong enough." }
    console.log("Creating invited user failed:", e)
    return { ok: false, error: "Couldn't create the account. Try again in a moment." }
  }

  const member: MemberDoc = { ...data, uid, status: "active", name: displayName ?? null, email }
  // claimed in a transaction, so a link used twice at once only lets one in
  const claimed = await getFirestoreAdmin().runTransaction(async (tx) => {
    const fresh = await tx.get(ref)
    if (!isOpenInvite(fresh.data() as MemberDoc | undefined)) return false
    tx.update(ref, { uid, status: "active", name: member.name, email, acceptedAt: new Date() })
    return true
  })
  if (!claimed) {
    await getAuthAdmin().deleteUser(uid)
    return used
  }
  await getAuthAdmin().setCustomUserClaims(uid, claimsFor(false, member))
  return { ok: true, email }
}

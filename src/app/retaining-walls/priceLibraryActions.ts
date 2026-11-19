"use server"

import { FieldValue } from "firebase-admin/firestore"
import { getAuthAdmin, getFirestoreAdmin } from "../../../firebase/server"
import { CompanyDetails, libraryFromData, PriceItem } from "@/components/retainingWall/pricing"

/** The prices are shared: one list, `retainingWallPriceLibrary/shared`,
 * that every estimate uses. Anyone can read it; anyone signed in can
 * change it (who changed it last is kept as updatedBy).
 *
 * Company details (the proposal letterhead, logo included) are each
 * person's own: `users/{uid}/retainingWall/company`.
 *
 * Read and written only through these actions (Admin SDK), so Firestore's
 * rules keep denying clients both paths (the catch-all deny in
 * firestore.rules) and no rules change is needed. Seed the prices with
 * `npm run seed:prices`.
 *
 * Errors come back as messages rather than thrown: production hides a
 * thrown error's message. */
const db = () => getFirestoreAdmin()
const sharedRef = () => db().collection("retainingWallPriceLibrary").doc("shared")
const companyRef = (uid: string) => db().collection("users").doc(uid).collection("retainingWall").doc("company")

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
const fail = (what: string, e: unknown): { ok: false; error: string } => {
  console.error(`${what} failed:`, e)
  return { ok: false, error: e instanceof Error ? e.message : String(e) }
}

/** The shared prices, or the starter list if they've never been saved. */
export async function loadPrices(): Promise<Result<PriceItem[]>> {
  try {
    return { ok: true, value: libraryFromData((await sharedRef().get()).data()).items }
  } catch (e) {
    return fail("loadPrices", e)
  }
}

/** Anyone signed in. */
export async function savePrices(idToken: string, items: PriceItem[]): Promise<Result<PriceItem[]>> {
  try {
    const token = await getAuthAdmin().verifyIdToken(idToken)
    const clean = libraryFromData({ items }).items
    if (clean.length > 500) return { ok: false, error: "Too many items in the price library" }
    await sharedRef().set({ items: clean, updatedAt: FieldValue.serverTimestamp(), updatedBy: token.uid }, { merge: true })
    return { ok: true, value: clean }
  } catch (e) {
    return fail("savePrices", e)
  }
}

export async function loadCompany(idToken: string): Promise<Result<CompanyDetails>> {
  try {
    const { uid } = await getAuthAdmin().verifyIdToken(idToken)
    return { ok: true, value: libraryFromData({ items: [], company: (await companyRef(uid).get()).data() }).company }
  } catch (e) {
    return fail("loadCompany", e)
  }
}

export async function saveCompany(idToken: string, company: CompanyDetails): Promise<Result<CompanyDetails>> {
  try {
    const { uid } = await getAuthAdmin().verifyIdToken(idToken)
    const clean = libraryFromData({ items: [], company }).company
    if (company.logo && !clean.logo) return { ok: false, error: "That logo is too big or not a PNG/JPEG image." }
    await companyRef(uid).set({ ...clean, updatedAt: FieldValue.serverTimestamp() })
    return { ok: true, value: clean }
  } catch (e) {
    return fail("saveCompany", e)
  }
}

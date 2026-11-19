"use server"

import { FieldValue } from "firebase-admin/firestore"
import { getAuthAdmin, getFirestoreAdmin } from "../../../firebase/server"
import { BLANK_COMPANY, CompanyDetails, libraryFromData, PriceItem } from "@/components/retainingWall/pricing"

/** The price library is shared: one set of prices, in
 * `retainingWallPriceLibrary/shared`, that every estimate uses. Anyone can
 * read it; only an admin can change it. Each person's company details
 * (their proposal letterhead) stay their own, in
 * `users/{uid}/retainingWallPriceLibrary/main`.
 *
 * Read and written only through these actions (Admin SDK), so Firestore's
 * rules keep denying clients both paths (the catch-all deny in
 * firestore.rules) and no rules change is needed. */
const db = () => getFirestoreAdmin()
const sharedRef = () => db().collection("retainingWallPriceLibrary").doc("shared")
const companyRef = (uid: string) => db().collection("users").doc(uid).collection("retainingWallPriceLibrary").doc("main")

export interface SharedPrices {
  items: PriceItem[]
  /** ISO date-time of the last change; null before anyone has saved */
  updatedAt: string | null
}

/** The shared prices, or the starter list if they've never been saved. */
export async function loadSharedPrices(): Promise<SharedPrices> {
  const snap = await sharedRef().get()
  const data = snap.data()
  return {
    items: libraryFromData(data).items,
    updatedAt: data?.updatedAt?.toDate?.().toISOString?.() ?? null,
  }
}

/** Admins only. */
export async function saveSharedPrices(idToken: string, items: PriceItem[]): Promise<PriceItem[]> {
  const token = await getAuthAdmin().verifyIdToken(idToken)
  if (!token.admin) throw new Error("Only an admin can change the shared prices")
  const clean = libraryFromData({ items }).items
  if (clean.length > 500) throw new Error("Too many items in the price library")
  await sharedRef().set({ items: clean, updatedAt: FieldValue.serverTimestamp(), updatedBy: token.uid })
  return clean
}

export async function loadCompanyDetails(idToken: string): Promise<CompanyDetails> {
  const { uid } = await getAuthAdmin().verifyIdToken(idToken)
  const snap = await companyRef(uid).get()
  return libraryFromData({ items: [], company: snap.data()?.company }).company
}

export async function saveCompanyDetails(idToken: string, company: CompanyDetails): Promise<CompanyDetails> {
  const { uid } = await getAuthAdmin().verifyIdToken(idToken)
  const clean = libraryFromData({ items: [], company: { ...BLANK_COMPANY, ...company } }).company
  // merge: older docs also hold a personal price list from before prices were shared; it's left alone
  await companyRef(uid).set({ company: clean, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  return clean
}

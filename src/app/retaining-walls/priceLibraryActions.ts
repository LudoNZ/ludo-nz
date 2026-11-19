"use server"

import { FieldValue } from "firebase-admin/firestore"
import { getAuthAdmin, getFirestoreAdmin } from "../../../firebase/server"
import { libraryFromData, PriceLibrary } from "@/components/retainingWall/pricing"

/** There's one price library, `retainingWallPriceLibrary/shared`: the
 * prices every estimate uses and the company details printed on every
 * proposal. Anyone can read it; anyone signed in can change it (who
 * changed it last is kept as updatedBy).
 *
 * Read and written only through these actions (Admin SDK), so Firestore's
 * rules keep denying clients the path (the catch-all deny in
 * firestore.rules) and no rules change is needed. Seed it with
 * `npm run seed:prices`. */
const sharedRef = () => getFirestoreAdmin().collection("retainingWallPriceLibrary").doc("shared")

/** The library, or the starter one if it's never been saved. */
export async function loadPriceLibrary(): Promise<PriceLibrary> {
  return libraryFromData((await sharedRef().get()).data())
}

/** Anyone signed in. */
export async function savePriceLibrary(idToken: string, library: PriceLibrary): Promise<PriceLibrary> {
  const token = await getAuthAdmin().verifyIdToken(idToken)
  const clean = libraryFromData(library)
  if (clean.items.length > 500) throw new Error("Too many items in the price library")
  await sharedRef().set({ ...clean, updatedAt: FieldValue.serverTimestamp(), updatedBy: token.uid })
  return clean
}

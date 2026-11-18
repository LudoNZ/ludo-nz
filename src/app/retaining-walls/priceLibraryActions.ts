"use server"

import { FieldValue } from "firebase-admin/firestore"
import { getAuthAdmin, getFirestoreAdmin } from "../../../firebase/server"
import { libraryFromData, PriceLibrary } from "@/components/retainingWall/pricing"

/** `users/{uid}/retainingWallPriceLibrary/main`: one doc per person, their
 * prices and company details. Read and written only through these actions
 * (Admin SDK), each taking a fresh ID token, so Firestore's rules keep
 * denying clients this path (the catch-all deny in firestore.rules) and
 * no rules change is needed. */
const libraryRef = (uid: string) => getFirestoreAdmin().collection("users").doc(uid).collection("retainingWallPriceLibrary").doc("main")

export async function loadPriceLibrary(idToken: string): Promise<{ library: PriceLibrary; saved: boolean }> {
  const { uid } = await getAuthAdmin().verifyIdToken(idToken)
  const snap = await libraryRef(uid).get()
  return { library: libraryFromData(snap.data()), saved: snap.exists }
}

export async function savePriceLibrary(idToken: string, library: PriceLibrary): Promise<PriceLibrary> {
  const { uid } = await getAuthAdmin().verifyIdToken(idToken)
  const clean = libraryFromData(library)
  if (clean.items.length > 500) throw new Error("Too many items in the price library")
  await libraryRef(uid).set({ ...clean, updatedAt: FieldValue.serverTimestamp() })
  return clean
}

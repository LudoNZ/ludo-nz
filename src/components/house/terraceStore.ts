/** Terraces saved to your account (users/{uid}/terraceProjects): private —
 * only you see them — each the whole terrace, every house in it as it was
 * when added (or last taken back from the scratch house). */

import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { Terrace, terraceFromData } from "./terrace"

export interface StoredTerrace {
  id: string
  name: string
  terrace: Terrace
  updatedAt: Date | null
}

const COLLECTION = "terraceProjects"
const col = (uid: string) => collection(firestore, "users", uid, COLLECTION)
const ref = (uid: string, id: string) => doc(firestore, "users", uid, COLLECTION, id)

export const newTerraceId = (uid: string) => doc(col(uid)).id

/** Firestore refuses `undefined` anywhere in a document */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const saveTerrace = (uid: string, id: string, t: Terrace) => {
  const name = (t.name.trim() || "Untitled terrace").slice(0, 100)
  return setDoc(ref(uid, id), { name, terrace: plain({ ...t, name }), updatedAt: Timestamp.now() })
}

export const deleteTerrace = (uid: string, id: string) => deleteDoc(ref(uid, id))

export const subscribeToTerraces = (uid: string, onData: (ts: StoredTerrace[]) => void, onError?: (err: unknown) => void) =>
  onSnapshot(
    query(col(uid), orderBy("updatedAt", "desc")),
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            name: typeof data.name === "string" ? data.name : "Untitled terrace",
            terrace: terraceFromData(data.terrace),
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
          }
        }),
      ),
    (err) => {
      console.error("Terraces subscription failed", err)
      onError?.(err)
    },
  )

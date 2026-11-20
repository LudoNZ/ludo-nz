/** Every project of one kind there is — the public ones plus every
 * account's private ones — for the admin lists. Admins only: the rules
 * refuse the private half (a collection-group read) to anyone else. */

import { collection, collectionGroup, deleteDoc, DocumentReference, onSnapshot, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"

export interface AdminProjectRow<S = unknown> {
  /** unique across both places — a moved project's id can exist in each */
  key: string
  id: string
  name: string
  /** null for a public project */
  ownerUid: string | null
  summary: S | null
  updatedAt: Date | null
  ref: DocumentReference
}

/** `publicCollection`, and every account's `privateCollection` */
export const subscribeToAllOf = <S>(publicCollection: string, privateCollection: string, onData: (rows: AdminProjectRow<S>[]) => void, onError?: (err: unknown) => void) => {
  let publicRows: AdminProjectRow<S>[] = []
  let privateRows: AdminProjectRow<S>[] = []
  const row = (d: { id: string; ref: DocumentReference; data: () => Record<string, unknown> }, ownerUid: string | null): AdminProjectRow<S> => {
    const data = d.data()
    return {
      key: d.ref.path,
      id: d.id,
      name: typeof data.name === "string" ? data.name : "Untitled",
      ownerUid,
      summary: (data.summary as S | undefined) ?? null,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
      ref: d.ref,
    }
  }
  const emit = () => onData([...publicRows, ...privateRows])
  const fail = (err: unknown) => {
    console.error(`Listing every ${privateCollection} failed`, err)
    onError?.(err)
  }
  const stopPublic = onSnapshot(
    collection(firestore, publicCollection),
    (snap) => {
      publicRows = snap.docs.map((d) => row(d, null))
      emit()
    },
    fail,
  )
  const stopPrivate = onSnapshot(
    collectionGroup(firestore, privateCollection),
    (snap) => {
      privateRows = snap.docs.map((d) => row(d, d.ref.parent.parent?.id ?? "unknown"))
      emit()
    },
    fail,
  )
  return () => {
    stopPublic()
    stopPrivate()
  }
}

/** Admin delete of any project, public or someone's private one. */
export const adminDeleteProject = (ref: DocumentReference) => deleteDoc(ref)

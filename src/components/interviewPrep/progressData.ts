import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import type { ProgressStore } from "./progressStore"

/** One doc per user: users/{uid}/interviewPrep/progress, holding two maps —
 * lesson id → done, module id → confidence (1-5). */
export function firestoreProgressStore(uid: string): ProgressStore {
  const ref = doc(firestore, "users", uid, "interviewPrep", "progress")
  return {
    subscribe: (onData, onError) =>
      onSnapshot(
        ref,
        (snap) => {
          const data = snap.data()
          onData({ done: data?.done ?? {}, confidence: data?.confidence ?? {} })
        },
        onError,
      ),
    // merge writes touch just the one map key, so two tabs ticking different
    // lessons can't overwrite each other's progress
    setLessonDone: (lessonId, done) =>
      setDoc(ref, { done: { [lessonId]: done }, updatedAt: serverTimestamp() }, { merge: true }),
    setModuleConfidence: (moduleId, level) =>
      setDoc(
        ref,
        { confidence: { [moduleId]: level === null ? deleteField() : level }, updatedAt: serverTimestamp() },
        { merge: true },
      ),
  }
}

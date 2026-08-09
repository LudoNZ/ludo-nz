import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { PullupSession } from "./types"

const sessionsRef = (uid: string) =>
  collection(firestore, "users", uid, "pullupSessions")

export const subscribeToPullupSessions = (
  uid: string,
  onData: (sessions: PullupSession[]) => void,
  onError?: (err: unknown) => void
) => {
  const q = query(sessionsRef(uid), orderBy("createdAt", "asc"))
  return onSnapshot(
    q,
    (snap) => {
      const sessions: PullupSession[] = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          assistanceBands: data.assistanceBands,
          isMaxTest: !!data.isMaxTest,
          targetReps: data.targetReps,
          intervalSeconds: data.intervalSeconds,
          sets: data.sets ?? [],
          totalReps: data.totalReps,
          notes: data.notes,
        }
      })
      onData(sessions)
    },
    onError
  )
}

export const savePullupSession = async (
  uid: string,
  session: Omit<PullupSession, "id" | "createdAt">
) => {
  await addDoc(sessionsRef(uid), {
    ...session,
    createdAt: Timestamp.now(),
  })
}

export const deletePullupSession = async (uid: string, sessionId: string) => {
  await deleteDoc(doc(firestore, "users", uid, "pullupSessions", sessionId))
}

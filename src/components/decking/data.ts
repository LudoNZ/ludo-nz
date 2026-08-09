import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { DeckConfig } from "./types"

const decksRef = (uid: string) => collection(firestore, "users", uid, "decks")

export const newDeckId = (uid: string) => doc(decksRef(uid)).id

export const subscribeToDecks = (
  uid: string,
  onData: (decks: DeckConfig[]) => void,
  onError?: (err: unknown) => void
) => {
  const q = query(decksRef(uid), orderBy("updatedAt", "desc"))
  return onSnapshot(
    q,
    (snap) => {
      const decks: DeckConfig[] = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          name: data.name,
          width: data.width,
          sideA: data.sideA,
          sideB: data.sideB,
          joistSpacing: data.joistSpacing,
          boardWidth: data.boardWidth,
          boardGap: data.boardGap,
          stockLengths: data.stockLengths ?? [],
          minStagger: data.minStagger,
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
        }
      })
      onData(decks)
    },
    onError
  )
}

export const saveDeck = async (uid: string, deck: Omit<DeckConfig, "updatedAt">) => {
  const { id, ...rest } = deck
  await setDoc(doc(firestore, "users", uid, "decks", id), {
    ...rest,
    updatedAt: Timestamp.now(),
  })
}

export const deleteDeck = async (uid: string, deckId: string) => {
  await deleteDoc(doc(firestore, "users", uid, "decks", deckId))
}

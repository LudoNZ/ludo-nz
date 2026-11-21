/** The joinery defaults every house starts from, shared: the types (sizes,
 * heads, what they're measured from) and the head height. Anyone can read
 * them; anyone logged in can change them. A house that hasn't changed its
 * own types follows them; one that has keeps its own. Without them (not
 * there yet, or offline) the built-in ones stand. */

import { useEffect, useState } from "react"
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { setSharedJoinery, type JoineryType } from "./joinery"

export interface JoineryDefaults {
  types: JoineryType[]
  headMm: number
}

const ref = () => doc(firestore, "houseDefaults", "joinery")

/** Firestore refuses `undefined` anywhere in a document */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const subscribeToJoineryDefaults = (onChange: (d: JoineryDefaults | null) => void) =>
  onSnapshot(
    ref(),
    (snap) => {
      const d = snap.data()
      onChange(d && Array.isArray(d.types) && d.types.length && typeof d.headMm === "number" ? { types: d.types as JoineryType[], headMm: d.headMm } : null)
    },
    // (no rule yet, or offline: the built-in ones)
    () => onChange(null),
  )

export const saveJoineryDefaults = (uid: string, d: JoineryDefaults) => setDoc(ref(), { types: plain(d.types), headMm: d.headMm, updatedAt: Timestamp.now(), updatedBy: uid })

/** the shared defaults, kept up to date (and handed to joinery.ts, so every house without its own follows them) */
export function useSharedJoinery(): JoineryDefaults | null {
  const [d, setD] = useState<JoineryDefaults | null>(null)
  useEffect(
    () =>
      subscribeToJoineryDefaults((next) => {
        setSharedJoinery(next)
        setD(next)
      }),
    [],
  )
  return d
}

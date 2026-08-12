import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore"
import { firestore } from "../../../firebase/client"
import { defaultExclusionCells, JoinExclusionCell } from "./joinRules"
import { CutLogEntry, DeckConfig, DEFAULT_EDGE_LABELS, LockedRow, StockItem } from "./types"

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
        // migrate pre-inventory decks: an unlimited stockLengths list becomes a
        // generous quantity so an old deck doesn't suddenly run "out of stock"
        const stock: StockItem[] = Array.isArray(data.stock)
          ? data.stock
          : (data.stockLengths ?? []).map((length: number) => ({ length, quantity: 99 }))
        return {
          id: d.id,
          name: data.name,
          width: data.width,
          sideA: data.sideA,
          sideB: data.sideB,
          // legacy decks (saved before this existed) default to unlinked, so
          // loading one never silently starts auto-syncing a shape someone
          // already deliberately set — only new decks start linked
          sideBLinked: data.sideBLinked ?? false,
          edgeLabels: { ...DEFAULT_EDGE_LABELS, ...(data.edgeLabels ?? {}) },
          joistSpacing: data.joistSpacing,
          firstBaySpacing: data.firstBaySpacing || data.joistSpacing,
          boardWidth: data.boardWidth,
          boardGap: data.boardGap,
          stock,
          // migrate pre-joist-count decks: derive a rough bay count from the
          // old mm-based minStagger so they don't silently lose the setting
          minStaggerJoists:
            data.minStaggerJoists ??
            Math.max(1, Math.round((data.minStagger || 800) / (data.joistSpacing || 400))),
          minSameRowJoinJoists: data.minSameRowJoinJoists ?? 2,
          // migrate decks saved before per-cell toggling existed: expand
          // whatever the two thresholds worked out to into explicit cells
          joinExclusions: Array.isArray(data.joinExclusions)
            ? (data.joinExclusions as JoinExclusionCell[])
            : defaultExclusionCells(
                data.minStaggerJoists ?? Math.max(1, Math.round((data.minStagger || 800) / (data.joistSpacing || 400))),
                data.minSameRowJoinJoists ?? 2
              ),
          minEdgeJoists: data.minEdgeJoists ?? 3,
          boardDirection: data.boardDirection === "alongRake" ? "alongRake" : "intoRake",
          skeletonInterval: data.skeletonInterval || 4,
          lengthBias: data.lengthBias ?? 0,
          layoutSeed: data.layoutSeed ?? 1,
          completedSegmentIds: Array.isArray(data.completedSegmentIds) ? data.completedSegmentIds : [],
          lockedRows: (data.lockedRows ?? {}) as Record<string, LockedRow>,
          manualJoins: (data.manualJoins ?? {}) as Record<string, number[]>,
          cutLog: Array.isArray(data.cutLog)
            ? data.cutLog.map((e: CutLogEntry & { completedAt: { toDate?: () => Date } }) => ({
                ...e,
                completedAt: e.completedAt?.toDate?.() ?? new Date(),
              }))
            : [],
          activeCutSegmentId: data.activeCutSegmentId ?? null,
          activeCutAccumulatedMs: data.activeCutAccumulatedMs ?? 0,
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

export const setCompletedSegments = async (
  uid: string,
  deckId: string,
  completedSegmentIds: string[],
  lockedRows: Record<string, LockedRow>
) => {
  await updateDoc(doc(firestore, "users", uid, "decks", deckId), {
    completedSegmentIds,
    lockedRows,
    updatedAt: Timestamp.now(),
  })
}

/** Used by Cutting mode: same as setCompletedSegments, plus whatever cut-log
 * entries changed as a result (a finished board logged, or an undone one
 * removed). Doesn't touch activeCutSegmentId/activeCutAccumulatedMs — that's
 * reconciled separately via setActiveCut once the new "next" step is known. */
export const setCompletedSegmentsWithLog = async (
  uid: string,
  deckId: string,
  completedSegmentIds: string[],
  lockedRows: Record<string, LockedRow>,
  cutLog: CutLogEntry[]
) => {
  await updateDoc(doc(firestore, "users", uid, "decks", deckId), {
    completedSegmentIds,
    lockedRows,
    cutLog,
    updatedAt: Timestamp.now(),
  })
}

/** Sets (or clears) one row's manual join-position override. Uses a dotted
 * field path so it only ever touches that single row's entry — safe to
 * call rapidly as someone taps through the join editor without racing
 * against anything else being saved at the same time. */
export const setManualJoins = async (uid: string, deckId: string, rowIndex: number, positions: number[]) => {
  await updateDoc(doc(firestore, "users", uid, "decks", deckId), {
    [`manualJoins.${rowIndex}`]: positions,
    updatedAt: Timestamp.now(),
  })
}

/** Reverts one row back to the auto-computed layout. */
export const clearManualJoins = async (uid: string, deckId: string, rowIndex: number) => {
  await updateDoc(doc(firestore, "users", uid, "decks", deckId), {
    [`manualJoins.${rowIndex}`]: deleteField(),
    updatedAt: Timestamp.now(),
  })
}

/** Points the running timer at a (possibly new) board. Called with
 * accumulatedMs 0 whenever the "next" step changes, and with the paused
 * elapsed total when Cutting mode is closed. */
export const setActiveCut = async (
  uid: string,
  deckId: string,
  activeCutSegmentId: string | null,
  activeCutAccumulatedMs: number
) => {
  await updateDoc(doc(firestore, "users", uid, "decks", deckId), {
    activeCutSegmentId,
    activeCutAccumulatedMs,
    updatedAt: Timestamp.now(),
  })
}

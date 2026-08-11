"use client"

import { useEffect, useMemo, useState } from "react"
import { clearManualJoins, setManualJoins } from "./data"
import { computeDeckLayout, previewBoardReach, RowPlan } from "./layout"
import { DeckConfig } from "./types"

const arraysEqual = (a: number[] | undefined, b: number[] | undefined) => {
  if (!a || !b) return a === b
  if (a.length !== b.length) return false
  return a.every((v, i) => Math.abs(v - b[i]) < 1e-6)
}

/** Manual join editing with instant on-screen feedback: a tap applies to
 * the layout straight away via a local echo, while the Firestore write
 * happens in the background — reconciled (dropped) once a snapshot
 * confirms the same value, reverted if the write fails. Every consumer of
 * `layout` (plan view, cut list, join scroller) sees the edit immediately
 * since they all read the one layout this returns. */
export function useManualJoins(deck: DeckConfig | undefined, uid: string | undefined) {
  const [pendingJoins, setPendingJoins] = useState<Record<number, number[] | null>>({})

  useEffect(() => {
    if (!deck) return
    setPendingJoins((prev) => {
      let changed = false
      const next: Record<number, number[] | null> = {}
      for (const [key, val] of Object.entries(prev)) {
        const committed = Object.prototype.hasOwnProperty.call(deck.manualJoins, key) ? deck.manualJoins[key] : undefined
        const resolved = val === null ? committed === undefined : arraysEqual(committed, val)
        if (resolved) changed = true
        else next[Number(key)] = val
      }
      return changed ? next : prev
    })
  }, [deck])

  const effectiveDeck = useMemo(() => {
    if (!deck) return null
    if (Object.keys(pendingJoins).length === 0) return deck
    const manualJoins = { ...deck.manualJoins }
    for (const [key, val] of Object.entries(pendingJoins)) {
      if (val === null) delete manualJoins[key]
      else manualJoins[key] = val
    }
    return { ...deck, manualJoins }
  }, [deck, pendingJoins])

  const layout = useMemo(() => (effectiveDeck ? computeDeckLayout(effectiveDeck) : null), [effectiveDeck])

  // applies a new join list to a row: local echo first (see the reconcile
  // effect above for how it's dropped once confirmed), Firestore write in
  // the background, reverted if that write fails
  const commitJoins = (rowIndex: number, positions: number[]) => {
    if (!deck || !uid) return
    setPendingJoins((prev) => ({ ...prev, [rowIndex]: positions }))
    setManualJoins(uid, deck.id, rowIndex, positions).catch(() => {
      setPendingJoins((prev) => {
        const copy = { ...prev }
        delete copy[rowIndex]
        return copy
      })
    })
  }

  const toggleJoin = (row: RowPlan, position: number) => {
    // row.joins already reflects any earlier pending edit on this row, so
    // it's always the current on-screen state, not last-committed state
    const current = row.joins.map((j) => j.position)
    const exists = current.some((p) => Math.abs(p - position) < 1e-6)
    const next = exists ? current.filter((p) => Math.abs(p - position) >= 1e-6) : [...current, position].sort((a, b) => a - b)
    commitJoins(row.index, next)
  }

  const resetRow = (row: RowPlan) => {
    if (!deck || !uid) return
    setPendingJoins((prev) => ({ ...prev, [row.index]: null }))
    clearManualJoins(uid, deck.id, row.index).catch(() => {
      setPendingJoins((prev) => {
        const copy = { ...prev }
        delete copy[row.index]
        return copy
      })
    })
  }

  /** Places a board of about `stockLength` mm as the next segment on
   * `rowIndex`, starting right after whatever's already there (or from the
   * square end if it's still empty), and adds a join at the furthest joist
   * that board can actually reach — "use it as long as possible from
   * here". No-op if the board can't reach the next joist, or if it reaches
   * (or overruns) the end of the row outright, since neither case needs a
   * new join. */
  const placeBoard = (rowIndex: number, stockLength: number) => {
    if (!layout) return
    const position = previewBoardReach(layout, rowIndex, stockLength)
    if (position === null) return
    const row = layout.rows.find((r) => r.index === rowIndex)!
    const current = row.joins.map((j) => j.position)
    commitJoins(rowIndex, [...current, position].sort((a, b) => a - b))
  }

  // exposed so callers can run their own clash previews (previewJoinClash /
  // previewBoardReach) against exactly the same config this hook is
  // working from, pending edits included
  return { layout, effectiveConfig: effectiveDeck, toggleJoin, resetRow, placeBoard }
}

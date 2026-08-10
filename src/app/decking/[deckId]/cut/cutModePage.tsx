"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import DeckPlanView from "@/components/decking/deckPlanView"
import {
  setActiveCut,
  setCompletedSegmentsWithLog,
  subscribeToDecks,
} from "@/components/decking/data"
import { computeDeckLayout, computeLockedRows } from "@/components/decking/layout"
import { getCutOrder, lastCompletedStep, nextCutStep } from "@/components/decking/cuttingOrder"
import { CutLogEntry, DeckConfig, formatDuration, formatLength } from "@/components/decking/types"
import styles from "./cutModePage.module.scss"

const CutModePage = () => {
  const auth = useAuth()
  const router = useRouter()
  const params = useParams<{ deckId: string }>()
  const [decks, setDecks] = useState<DeckConfig[]>([])
  const [loaded, setLoaded] = useState(false)
  const [, forceTick] = useState(0)

  const sessionStartedAtRef = useRef(Date.now())
  const uidRef = useRef<string | undefined>(undefined)
  const deckIdRef = useRef<string | undefined>(undefined)
  const activeIdRef = useRef<string | null>(null)
  const baselineMsRef = useRef(0)

  useEffect(() => {
    if (auth && !auth.authLoading && !auth.currentUser) {
      router.push("/login")
    }
  }, [auth, router])

  useEffect(() => {
    if (!auth?.currentUser) return
    const unsubscribe = subscribeToDecks(auth.currentUser.uid, (data) => {
      setDecks(data)
      setLoaded(true)
    })
    return () => unsubscribe()
  }, [auth?.currentUser])

  const deck = decks.find((d) => d.id === params.deckId)
  const layout = useMemo(() => (deck ? computeDeckLayout(deck) : null), [deck])
  const order = useMemo(() => (layout ? getCutOrder(layout) : []), [layout])
  const next = useMemo(
    () => nextCutStep(order, deck?.completedSegmentIds ?? []),
    [order, deck?.completedSegmentIds]
  )
  const last = useMemo(
    () => lastCompletedStep(order, deck?.completedSegmentIds ?? []),
    [order, deck?.completedSegmentIds]
  )

  // re-render every second so the running timer visibly ticks
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // keep latest values available to the unmount cleanup without re-registering it
  useEffect(() => {
    uidRef.current = auth?.currentUser?.uid
    deckIdRef.current = deck?.id
    activeIdRef.current = deck?.activeCutSegmentId ?? null
    baselineMsRef.current = deck?.activeCutAccumulatedMs ?? 0
  })

  // whenever the board being timed should change (advanced, undone, or first
  // load out of sync), reset the local clock and point Firestore at the new one
  useEffect(() => {
    if (!deck || !auth?.currentUser) return
    const nextId = next?.segment.id ?? null
    if (nextId === deck.activeCutSegmentId) return
    sessionStartedAtRef.current = Date.now()
    setActiveCut(auth.currentUser.uid, deck.id, nextId, 0)
  }, [next?.segment.id, deck?.activeCutSegmentId, deck?.id, auth?.currentUser?.uid])

  // pause the timer (persist elapsed time) when leaving Cutting mode
  useEffect(() => {
    return () => {
      if (uidRef.current && deckIdRef.current && activeIdRef.current) {
        const elapsed = baselineMsRef.current + (Date.now() - sessionStartedAtRef.current)
        setActiveCut(uidRef.current, deckIdRef.current, activeIdRef.current, elapsed)
      }
    }
  }, [])

  if (!auth?.currentUser) {
    return (
      <div className={styles.cutPage}>
        <p className={styles.loading}>Checking access...</p>
      </div>
    )
  }

  if (loaded && !deck) {
    return (
      <div className={styles.cutPage}>
        <p className={styles.loading}>Deck not found.</p>
      </div>
    )
  }

  if (!deck || !layout) {
    return (
      <div className={styles.cutPage}>
        <p className={styles.loading}>Loading…</p>
      </div>
    )
  }

  const toggle = (id: string) => {
    const wasCompleted = deck.completedSegmentIds.includes(id)
    const set = new Set(deck.completedSegmentIds)
    let cutLog = deck.cutLog

    if (wasCompleted) {
      set.delete(id)
      cutLog = cutLog.filter((e) => e.segmentId !== id)
    } else {
      set.add(id)
      if (id === deck.activeCutSegmentId) {
        const step = order.find((s) => s.segment.id === id)
        if (step) {
          const durationMs = deck.activeCutAccumulatedMs + (Date.now() - sessionStartedAtRef.current)
          const entry: CutLogEntry = {
            segmentId: id,
            rowIndex: step.row.index,
            cutLength: step.segment.cutLength,
            durationMs,
            completedAt: new Date(),
          }
          cutLog = [...cutLog, entry]
        }
      }
    }

    const completedSegmentIds = Array.from(set)
    const lockedRows = computeLockedRows(layout, deck.lockedRows, completedSegmentIds)
    setCompletedSegmentsWithLog(auth.currentUser!.uid, deck.id, completedSegmentIds, lockedRows, cutLog)
  }

  const placedCount = order.filter((s) => deck.completedSegmentIds.includes(s.segment.id)).length
  const totalCount = order.length
  const pct = totalCount ? Math.round((placedCount / totalCount) * 100) : 0

  const nextJoin = next?.row.joins.find((j) => j.position === next.segment.end)

  const totalLoggedMs = deck.cutLog.reduce((sum, e) => sum + e.durationMs, 0)
  const avgMs = deck.cutLog.length ? totalLoggedMs / deck.cutLog.length : 0
  const liveMs = deck.activeCutAccumulatedMs + (Date.now() - sessionStartedAtRef.current)
  const totalWithLiveMs = totalLoggedMs + (next ? liveMs : 0)

  return (
    <div className={styles.cutPage}>
      <div className={styles.headerRow}>
        <h1>Cutting mode</h1>
        <Link href={`/decking/${deck.id}`}>Back to {deck.name}</Link>
      </div>

      <div className={styles.progressBlock}>
        <div className={styles.progressLabel}>
          <span>
            {placedCount}/{totalCount} placed
          </span>
          <span>{pct}%</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className={styles.timerBlock}>
        <div className={styles.timerStat}>
          <strong>{next ? formatDuration(liveMs) : "—"}</strong>
          <span>this board</span>
        </div>
        <div className={styles.timerStat}>
          <strong>{formatDuration(totalWithLiveMs)}</strong>
          <span>total time</span>
        </div>
        <div className={styles.timerStat}>
          <strong>{deck.cutLog.length ? formatDuration(avgMs) : "—"}</strong>
          <span>avg / board</span>
        </div>
      </div>

      {next ? (
        <div className={styles.nextCard}>
          <div className={styles.tag}>
            Next cut — row #{next.row.index + 1}
            {next.row.isSkeleton ? " · skeleton" : ""}
          </div>
          <div className={styles.cutLine}>{formatLength(next.segment.cutLength)}</div>
          <div className={styles.subLine}>
            {next.segment.stockLength !== null
              ? `from a ${formatLength(next.segment.stockLength)} board`
              : "⚠ no stock length long enough — source one manually"}
          </div>
          {nextJoin && (
            <div className={`${styles.joinNote} ${nextJoin.staggered && !nextJoin.nearEdge ? "" : styles.warn}`}>
              {nextJoin.staggered
                ? "Join lands on a joist, spacing OK"
                : "⚠ Join couldn't clear the configured join-spacing rule"}
              {nextJoin.nearEdge && (
                <>
                  <br />⚠ Closer than {deck.minEdgeJoists} joist(s) to the row&apos;s edge
                </>
              )}
            </div>
          )}
          <Button size="large" onClick={() => toggle(next.segment.id)}>
            Mark cut &amp; placed
          </Button>
        </div>
      ) : (
        <div className={styles.doneCard}>🎉 All boards cut and placed!</div>
      )}

      <div className={styles.card}>
        <DeckPlanView
          config={deck}
          layout={layout}
          completedSegmentIds={deck.completedSegmentIds}
          onToggleSegment={toggle}
          activeSegmentId={next?.segment.id ?? null}
        />
      </div>

      {last && (
        <div className={styles.undoRow}>
          <Button size="small" variant="secondary" onClick={() => toggle(last.segment.id)}>
            Undo last placed
          </Button>
        </div>
      )}

      {deck.cutLog.length > 0 && (
        <div className={styles.breakdownLink}>
          <Link href={`/decking/${deck.id}#cutting-time`}>Full cutting-time breakdown →</Link>
        </div>
      )}
    </div>
  )
}

export default CutModePage

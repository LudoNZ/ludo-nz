"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import DeckPlanView from "@/components/decking/deckPlanView"
import {
  DeckLocation,
  setActiveCut,
  setCompletedSegmentsWithLog,
  StoredDeck,
  subscribeToDecks,
} from "@/components/decking/data"
import { computeDeckLayout, computeLockedRows } from "@/components/decking/layout"
import { computeProjectStockAllocation } from "@/components/decking/projectStock"
import { useProjectsList } from "@/components/decking/useProjectsList"
import { getCutOrder, lastCompletedStep, nextCutStep } from "@/components/decking/cuttingOrder"
import { CutLogEntry, formatDuration, formatLength } from "@/components/decking/types"
import styles from "./cutModePage.module.scss"

const CutModePage = () => {
  const auth = useAuth()
  const params = useParams<{ deckId: string }>()
  const [publicDecks, setPublicDecks] = useState<StoredDeck[]>([])
  const [publicLoaded, setPublicLoaded] = useState(false)
  const [privateDecks, setPrivateDecks] = useState<StoredDeck[]>([])
  const [privateLoaded, setPrivateLoaded] = useState(false)
  const [, forceTick] = useState(0)

  const sessionStartedAtRef = useRef(Date.now())
  const locationRef = useRef<DeckLocation | undefined>(undefined)
  const deckIdRef = useRef<string | undefined>(undefined)
  const activeIdRef = useRef<string | null>(null)
  const baselineMsRef = useRef(0)

  useEffect(() => {
    const unsubscribe = subscribeToDecks({ kind: "public" }, (data) => {
      setPublicDecks(data)
      setPublicLoaded(true)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!auth || auth.authLoading) return // still resolving — wait rather than flash "not found"
    if (!auth.currentUser) {
      setPrivateDecks([])
      setPrivateLoaded(true)
      return
    }
    const unsubscribe = subscribeToDecks({ kind: "private", uid: auth.currentUser.uid }, (data) => {
      setPrivateDecks(data)
      setPrivateLoaded(true)
    })
    return () => unsubscribe()
  }, [auth, auth?.authLoading, auth?.currentUser])

  const { projects, loaded: projectsLoaded } = useProjectsList()
  const loaded = publicLoaded && privateLoaded && projectsLoaded
  const deck = [...privateDecks, ...publicDecks].find((d) => d.id === params.deckId)

  // If this deck is in a project, it plans against its current share of
  // the shared pool instead of its own (dormant) `stock` — see
  // deckDetailPage.tsx's identical wiring for the full reasoning.
  const project = deck?.projectId ? projects.find((p) => p.id === deck.projectId) : undefined
  const effectiveStockByDeck = useMemo(() => {
    if (!project) return null
    const siblings = [...privateDecks, ...publicDecks].filter((d) => d.projectId === project.id)
    return computeProjectStockAllocation(
      project.stock,
      siblings.map((d) => ({ id: d.id, config: d, projectOrder: d.projectOrder }))
    )
  }, [project, privateDecks, publicDecks])
  const deckForLayout = useMemo(() => {
    if (!deck) return undefined
    if (!project || !effectiveStockByDeck) return deck
    return { ...deck, stock: effectiveStockByDeck.get(deck.id) ?? [] }
  }, [deck, project, effectiveStockByDeck])

  const layout = useMemo(() => (deckForLayout ? computeDeckLayout(deckForLayout) : null), [deckForLayout])
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
    locationRef.current = deck?.location
    deckIdRef.current = deck?.id
    activeIdRef.current = deck?.activeCutSegmentId ?? null
    baselineMsRef.current = deck?.activeCutAccumulatedMs ?? 0
  })

  // whenever the board being timed should change (advanced, undone, or first
  // load out of sync), reset the local clock and point Firestore at the new one
  useEffect(() => {
    if (!deck) return
    const nextId = next?.segment.id ?? null
    if (nextId === deck.activeCutSegmentId) return
    sessionStartedAtRef.current = Date.now()
    setActiveCut(deck.location, deck.id, nextId, 0)
  }, [next?.segment.id, deck?.activeCutSegmentId, deck?.id, deck?.location])

  // pause the timer (persist elapsed time) when leaving Cutting mode
  useEffect(() => {
    return () => {
      if (locationRef.current && deckIdRef.current && activeIdRef.current) {
        const elapsed = baselineMsRef.current + (Date.now() - sessionStartedAtRef.current)
        setActiveCut(locationRef.current, deckIdRef.current, activeIdRef.current, elapsed)
      }
    }
  }, [])

  if (!loaded) {
    return (
      <div className={styles.cutPage}>
        <p className={styles.loading}>Loading…</p>
      </div>
    )
  }

  if (!deck) {
    return (
      <div className={styles.cutPage}>
        <p className={styles.loading}>Deck not found.</p>
      </div>
    )
  }

  if (!layout) {
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
    setCompletedSegmentsWithLog(deck.location, deck.id, completedSegmentIds, lockedRows, cutLog)
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

      {deck.cutLog.length > 0 && (
        <div className={styles.breakdownLink}>
          <Link href={`/decking/${deck.id}#cutting-time`}>Full cutting-time breakdown →</Link>
        </div>
      )}

      {(next || last) && (
        <div className={styles.actionBar}>
          {last && (
            <Button size="small" variant="secondary" onClick={() => toggle(last.segment.id)}>
              Undo
            </Button>
          )}
          {next && (
            <div className={styles.primarySlot}>
              <Button size="large" onClick={() => toggle(next.segment.id)}>
                Mark cut &amp; placed
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CutModePage

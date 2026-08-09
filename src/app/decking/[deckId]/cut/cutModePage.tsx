"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import DeckPlanView from "@/components/decking/deckPlanView"
import { setCompletedSegments, subscribeToDecks } from "@/components/decking/data"
import { computeDeckLayout } from "@/components/decking/layout"
import { getCutOrder, lastCompletedStep, nextCutStep } from "@/components/decking/cuttingOrder"
import { DeckConfig, formatLength } from "@/components/decking/types"
import styles from "./cutModePage.module.scss"

const CutModePage = () => {
  const auth = useAuth()
  const router = useRouter()
  const params = useParams<{ deckId: string }>()
  const [decks, setDecks] = useState<DeckConfig[]>([])
  const [loaded, setLoaded] = useState(false)

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
    const set = new Set(deck.completedSegmentIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    setCompletedSegments(auth.currentUser!.uid, deck.id, Array.from(set))
  }

  const next = nextCutStep(order, deck.completedSegmentIds)
  const last = lastCompletedStep(order, deck.completedSegmentIds)
  const placedCount = order.filter((s) => deck.completedSegmentIds.includes(s.segment.id)).length
  const totalCount = order.length
  const pct = totalCount ? Math.round((placedCount / totalCount) * 100) : 0

  const nextJoin = next?.row.joins.find((j) => j.position === next.segment.end)

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
            <div className={`${styles.joinNote} ${nextJoin.staggered ? "" : styles.warn}`}>
              {nextJoin.staggered
                ? "Join lands on a joist, stagger OK"
                : `⚠ Join couldn't meet the ${formatLength(deck.minStagger)} stagger`}
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
    </div>
  )
}

export default CutModePage

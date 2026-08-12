"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import DeckForm from "@/components/decking/deckForm"
import DeckPlanView from "@/components/decking/deckPlanView"
import CutList from "@/components/decking/cutList"
import CutTimeline from "@/components/decking/cutTimeline"
import StockSummary from "@/components/decking/stockSummary"
import JoinScroller, { JoinScrollerHandle } from "@/components/decking/joinScroller"
import { deleteDeck, saveDeck, setCompletedSegments, subscribeToDecks } from "@/components/decking/data"
import { computeLockedRows, optimizeBoardStockLengths } from "@/components/decking/layout"
import { useManualJoins } from "@/components/decking/useManualJoins"
import { DeckConfig, formatLength, LockedRow } from "@/components/decking/types"
import { CloseIcon, EditIcon, ShuffleIcon, TrashIcon, WandIcon } from "@/components/icons/icons"
import styles from "./deckDetailPage.module.scss"

const DeckDetailPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const params = useParams<{ deckId: string }>()
  const [decks, setDecks] = useState<DeckConfig[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingJoins, setEditingJoins] = useState(false)
  const [activeJoinRow, setActiveJoinRow] = useState<number | null>(null)
  const joinScrollerRef = useRef<JoinScrollerHandle>(null)

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
  const { layout, effectiveConfig, toggleJoin, resetRow, placeBoard } = useManualJoins(deck, auth?.currentUser?.uid)
  const maxLen = deck ? Math.max(deck.sideA, deck.sideB) : 1

  if (!auth?.currentUser) {
    return (
      <div className={styles.detailPage}>
        <p className={styles.loading}>Checking access...</p>
      </div>
    )
  }

  if (loaded && !deck) {
    return (
      <div className={styles.detailPage}>
        <p className={styles.loading}>Deck not found.</p>
      </div>
    )
  }

  if (!deck || !layout || !effectiveConfig) {
    return (
      <div className={styles.detailPage}>
        <p className={styles.loading}>Loading…</p>
      </div>
    )
  }

  const handleSave = async (updated: Omit<DeckConfig, "id" | "updatedAt">) => {
    await saveDeck(auth.currentUser!.uid, { id: deck.id, ...updated })
    setEditing(false)
  }

  const handleDelete = async () => {
    if (confirm(`Delete "${deck.name}"? This can't be undone.`)) {
      await deleteDeck(auth.currentUser!.uid, deck.id)
      router.push("/decking")
    }
  }

  // saveDeck wants every field except updatedAt (it stamps its own) — strip
  // just that one off the live `deck` rather than hand-listing every other
  // field, so a save-with-overrides action can't silently drop a field a
  // future DeckConfig addition needs (bitten twice already this session:
  // the shape editor's sideBLinked, and lengthBias, both needed adding here
  // by hand before this existed)
  const saveDeckWith = (overrides: Partial<Omit<DeckConfig, "id" | "updatedAt">>) => {
    const rest: Partial<DeckConfig> = { ...deck }
    delete rest.updatedAt
    return saveDeck(auth.currentUser!.uid, { ...(rest as Omit<DeckConfig, "updatedAt">), ...overrides })
  }

  const handleShuffle = () => saveDeckWith({ layoutSeed: Math.floor(Math.random() * 2 ** 31) })

  // Re-assigns which stock length each already-*cut* board is recorded as
  // coming from to the smallest one that's still long enough for it,
  // without moving a single join — see optimizeBoardStockLengths. Walks
  // every locked row's boards together, in row order, against the deck's
  // real total stock, so it can't over-claim a length beyond what's
  // actually on hand.
  const handleOptimizeStock = () => {
    const lockedEntries = Object.entries(deck.lockedRows).sort(([a], [b]) => Number(a) - Number(b))
    if (!lockedEntries.length) return
    const optimized = optimizeBoardStockLengths(
      lockedEntries.flatMap(([, row]) => row.boards),
      deck.stock
    )
    let i = 0
    const lockedRows: Record<string, LockedRow> = {}
    for (const [key, row] of lockedEntries) {
      lockedRows[key] = { ...row, boards: row.boards.map(() => optimized[i++]) }
    }
    return saveDeckWith({ lockedRows })
  }

  const handleToggleSegment = (id: string) => {
    const set = new Set(deck.completedSegmentIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    const completedSegmentIds = Array.from(set)
    const lockedRows = computeLockedRows(layout, deck.lockedRows, completedSegmentIds)
    setCompletedSegments(auth.currentUser!.uid, deck.id, completedSegmentIds, lockedRows)
  }

  const handleClearCompleted = () => {
    if (confirm("Clear all placed marks on this deck? This also unlocks every row for reshuffling.")) {
      setCompletedSegments(auth.currentUser!.uid, deck.id, [], {})
    }
  }

  return (
    <div className={styles.detailPage}>
      <div className={styles.headerRow}>
        <h1>{deck.name}</h1>
        <div className={styles.actions}>
          {!editing && (
            <Link href={`/decking/${deck.id}/cut`}>
              <Button size="small" onClick={() => {}}>
                Start cutting
              </Button>
            </Link>
          )}
          {!editing && (
            <Button
              size="small"
              variant="secondary"
              onClick={() =>
                setEditingJoins((s) => {
                  if (s) setActiveJoinRow(null)
                  return !s
                })
              }
            >
              {editingJoins ? "Close joins" : "Edit joins"}
            </Button>
          )}
          {!editing && (
            <Button size="icon" variant="secondary" onClick={handleShuffle} ariaLabel="Shuffle fill pattern">
              <ShuffleIcon />
            </Button>
          )}
          {!editing && Object.keys(deck.lockedRows).length > 0 && (
            <Button
              size="icon"
              variant="secondary"
              onClick={handleOptimizeStock}
              ariaLabel="Optimise stock lengths on already-cut rows"
            >
              <WandIcon />
            </Button>
          )}
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setEditing((e) => !e)}
            ariaLabel={editing ? "Close editing" : "Edit deck"}
          >
            {editing ? <CloseIcon /> : <EditIcon />}
          </Button>
          <Button size="icon" variant="danger" onClick={handleDelete} ariaLabel="Delete deck">
            <TrashIcon />
          </Button>
        </div>
      </div>

      {editing ? (
        <section>
          <DeckForm
            initial={deck}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            saveLabel="Save changes"
          />
        </section>
      ) : (
        <>
          {editingJoins && (
            <section id="join-editor">
              <h2>Edit joins</h2>
              <p className={styles.hint}>
                Scroll a row to the centre line to activate it, then tap a joist line to add or
                remove a join there — the row lights up in the plan below. Secured rows are shown
                for context only.
              </p>
              <div className={styles.joinTopRow}>
                {layout.unresolvedSegments > 0 ? (
                  <div className={styles.warning}>
                    ⚠ {layout.unresolvedSegments} segment(s) can&apos;t be covered with current stock.
                  </div>
                ) : (
                  <div className={styles.ok}>✓ Fits your current stock.</div>
                )}
                <div className={styles.card}>
                  <StockSummary
                    layout={layout}
                    completedSegmentIds={deck.completedSegmentIds}
                    groupBySpans={deck.joistSpacing}
                    note={
                      activeJoinRow != null
                        ? `Tap a length to place it on row #${activeJoinRow + 1}, joined at its reach`
                        : `By joist spans (${formatLength(deck.joistSpacing)} each)`
                    }
                    onSelectLength={activeJoinRow != null ? (len) => placeBoard(activeJoinRow, len) : undefined}
                    config={effectiveConfig}
                    activeRowIndex={activeJoinRow}
                  />
                </div>
              </div>
              <JoinScroller
                ref={joinScrollerRef}
                layout={layout}
                config={effectiveConfig}
                maxLen={maxLen}
                lockedRows={deck.lockedRows}
                onToggleJoin={toggleJoin}
                onResetRow={resetRow}
                onActiveRowChange={setActiveJoinRow}
              />
            </section>
          )}

          <section>
            <h2>Plan</h2>
            {editingJoins && <p className={styles.hint}>Tap a board to jump the scroller above to its row.</p>}
            <div className={styles.card}>
              <DeckPlanView
                config={deck}
                layout={layout}
                completedSegmentIds={deck.completedSegmentIds}
                onToggleSegment={editingJoins ? undefined : handleToggleSegment}
                onRowClick={editingJoins ? (rowIndex) => joinScrollerRef.current?.focusRow(rowIndex) : undefined}
                activeRowIndex={activeJoinRow}
              />
            </div>
          </section>

          <section>
            <h2>Cut list</h2>
            <CutList
              layout={layout}
              completedSegmentIds={deck.completedSegmentIds}
              onToggleSegment={handleToggleSegment}
              onClearCompleted={handleClearCompleted}
            />
          </section>

          <section id="cutting-time">
            <h2>Cutting time</h2>
            <CutTimeline cutLog={deck.cutLog} />
          </section>
        </>
      )}
    </div>
  )
}

export default DeckDetailPage

"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import DeckForm from "@/components/decking/deckForm"
import DeckPlanView from "@/components/decking/deckPlanView"
import CutList from "@/components/decking/cutList"
import { deleteDeck, saveDeck, setCompletedSegments, subscribeToDecks } from "@/components/decking/data"
import { computeDeckLayout } from "@/components/decking/layout"
import { DeckConfig } from "@/components/decking/types"
import styles from "./deckDetailPage.module.scss"

const DeckDetailPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const params = useParams<{ deckId: string }>()
  const [decks, setDecks] = useState<DeckConfig[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (auth && !auth.currentUser) {
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

  if (!deck || !layout) {
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

  const handleShuffle = async () => {
    await saveDeck(auth.currentUser!.uid, {
      id: deck.id,
      name: deck.name,
      width: deck.width,
      sideA: deck.sideA,
      sideB: deck.sideB,
      joistSpacing: deck.joistSpacing,
      boardWidth: deck.boardWidth,
      boardGap: deck.boardGap,
      stock: deck.stock,
      minStagger: deck.minStagger,
      boardDirection: deck.boardDirection,
      skeletonInterval: deck.skeletonInterval,
      layoutSeed: Math.floor(Math.random() * 2 ** 31),
      completedSegmentIds: deck.completedSegmentIds,
    })
  }

  const handleToggleSegment = (id: string) => {
    const set = new Set(deck.completedSegmentIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    setCompletedSegments(auth.currentUser!.uid, deck.id, Array.from(set))
  }

  const handleClearCompleted = () => {
    if (confirm("Clear all placed marks on this deck?")) {
      setCompletedSegments(auth.currentUser!.uid, deck.id, [])
    }
  }

  return (
    <div className={styles.detailPage}>
      <div className={styles.headerRow}>
        <h1>{deck.name}</h1>
        <div className={styles.actions}>
          {!editing && (
            <Button size="medium" variant="secondary" onClick={handleShuffle}>
              Shuffle fill pattern
            </Button>
          )}
          <Button size="medium" variant="secondary" onClick={() => setEditing((e) => !e)}>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button size="medium" variant="danger" onClick={handleDelete}>
            Delete
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
          <section>
            <h2>Plan</h2>
            <div className={styles.card}>
              <DeckPlanView
                config={deck}
                layout={layout}
                completedSegmentIds={deck.completedSegmentIds}
                onToggleSegment={handleToggleSegment}
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
        </>
      )}
    </div>
  )
}

export default DeckDetailPage

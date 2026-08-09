"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import { newDeckId, saveDeck, subscribeToDecks } from "@/components/decking/data"
import { defaultDeckConfig, DeckConfig, formatLength } from "@/components/decking/types"
import styles from "./deckingPage.module.scss"

const DeckingPage = () => {
  const auth = useAuth()
  const router = useRouter()
  const [decks, setDecks] = useState<DeckConfig[]>([])
  const [loaded, setLoaded] = useState(false)
  const [creating, setCreating] = useState(false)

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

  if (!auth?.currentUser) {
    return (
      <div className={styles.deckingPage}>
        <p className={styles.loading}>Checking access...</p>
      </div>
    )
  }

  const handleAddDeck = async () => {
    setCreating(true)
    const uid = auth.currentUser!.uid
    const id = newDeckId(uid)
    await saveDeck(uid, { id, ...defaultDeckConfig(`Deck ${decks.length + 1}`) })
    router.push(`/decking/${id}`)
  }

  return (
    <div className={styles.deckingPage}>
      <h1>Decking</h1>
      <p className={styles.subtitle}>
        Lay out decking boards across a deck with a raked end, with joins landing on joists and
        staggered between rows.
      </p>

      {loaded && (
        <div className={styles.grid}>
          {decks.map((deck) => (
            <Link key={deck.id} href={`/decking/${deck.id}`} className={styles.card}>
              <h3>{deck.name}</h3>
              <div className={styles.meta}>
                {formatLength(deck.width)} wide · {formatLength(deck.sideA)} / {formatLength(deck.sideB)}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Button size="large" onClick={handleAddDeck} disabled={creating}>
        {creating ? "Creating…" : "Add deck"}
      </Button>
    </div>
  )
}

export default DeckingPage

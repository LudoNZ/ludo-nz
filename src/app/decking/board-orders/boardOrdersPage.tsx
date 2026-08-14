"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/context/auth"
import Button from "@/components/button/button"
import StockDistributionChart from "@/components/decking/stockDistributionChart"
import { addStockOrder, deleteStockOrder, StoredDeck, subscribeToDecks, subscribeToStockOrders } from "@/components/decking/data"
import { StockOrder } from "@/components/decking/types"
import { TrashIcon } from "@/components/icons/icons"
import styles from "./boardOrdersPage.module.scss"

const todayIso = () => new Date().toISOString().slice(0, 10)

/** The order-prediction dataset: "ordered timber, this length mix
 * actually turned up" observations, added by copying an existing deck's
 * board stock — a one-way, read-only snapshot that never links back, so
 * decks stay completely unaware this page exists at all. Feeds
 * boardOrderPrediction.ts's blended model, which deckForm.tsx's
 * "Calculate quantity order" uses. Fully public, unscoped by account —
 * see data.ts's stockOrders storage functions for why. */
const BoardOrdersPage = () => {
  const auth = useAuth()
  const [orders, setOrders] = useState<StockOrder[]>([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [privateDecks, setPrivateDecks] = useState<StoredDeck[]>([])
  const [privateLoaded, setPrivateLoaded] = useState(false)
  const [publicDecks, setPublicDecks] = useState<StoredDeck[]>([])
  const [publicLoaded, setPublicLoaded] = useState(false)
  const [pickedDeckId, setPickedDeckId] = useState("")
  const [label, setLabel] = useState("")
  const [orderedAt, setOrderedAt] = useState(todayIso)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToStockOrders((data) => {
      setOrders(data)
      setOrdersLoaded(true)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToDecks({ kind: "public" }, (data) => {
      setPublicDecks(data)
      setPublicLoaded(true)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!auth || auth.authLoading) return
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

  // "any deck" here really means "any deck this session can actually
  // see" — your own private decks plus every public one, same reach
  // every other decking page has; there's no way (or reason) to browse
  // another account's private decks from here.
  const importableDecks = [...privateDecks, ...publicDecks].filter((d) => d.stock.length > 0)
  const loaded = ordersLoaded && privateLoaded && publicLoaded
  const pickedDeck = importableDecks.find((d) => d.id === pickedDeckId)

  const handlePickDeck = (id: string) => {
    setPickedDeckId(id)
    const deck = importableDecks.find((d) => d.id === id)
    if (deck) setLabel(deck.name)
  }

  const handleAdd = async () => {
    if (!pickedDeck || !label.trim()) return
    setAdding(true)
    await addStockOrder({
      label: label.trim(),
      orderedAt: new Date(orderedAt),
      stock: pickedDeck.stock,
    })
    setAdding(false)
    setPickedDeckId("")
    setLabel("")
  }

  const handleDelete = (order: StockOrder) => {
    if (confirm(`Delete "${order.label}"? This can't be undone.`)) {
      deleteStockOrder(order.id)
    }
  }

  return (
    <div className={styles.page}>
      <h1>Board order data</h1>
      <p className={styles.subtitle}>
        Past timber orders — what was ordered and the length mix that actually turned up. Feeds the
        pack-mix prediction &quot;Calculate quantity order&quot; uses when shaping a new deck.
      </p>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Add an observation</h2>
        <p className={styles.hint}>
          Copies a deck&apos;s current board stock as a one-off snapshot — editing the deck afterwards
          won&apos;t change this record, and adding it here doesn&apos;t touch the deck at all.
        </p>
        {loaded && (
          <div className={styles.addForm}>
            <select value={pickedDeckId} onChange={(e) => handlePickDeck(e.target.value)} aria-label="Pick a deck to copy stock from">
              <option value="">Pick a deck…</option>
              {importableDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input type="text" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" />
            <input type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} aria-label="Order date" />
            <Button size="small" onClick={handleAdd} disabled={!pickedDeck || !label.trim() || adding}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Observations ({orders.length})</h2>
        {!ordersLoaded && <p className={styles.loading}>Loading…</p>}
        {ordersLoaded && orders.length === 0 && <p className={styles.hint}>None recorded yet — add one above.</p>}
        <div className={styles.orderList}>
          {orders.map((order) => (
            <div key={order.id} className={styles.orderCard}>
              <div className={styles.orderHeader}>
                <div>
                  <strong>{order.label}</strong>
                  <span className={styles.date}>{order.orderedAt.toLocaleDateString()}</span>
                </div>
                <button type="button" className={styles.deleteBtn} onClick={() => handleDelete(order)} aria-label={`Delete ${order.label}`}>
                  <TrashIcon />
                </button>
              </div>
              <StockDistributionChart stock={order.stock} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default BoardOrdersPage

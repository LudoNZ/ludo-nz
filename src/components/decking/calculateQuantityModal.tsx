"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Modal } from "@/app/elements/Modal/modal"
import Button from "@/components/button/button"
import { subscribeToStockOrders } from "./data"
import { computeEdgeExtraLinealMm, computeFieldCoverageLinealMm } from "./deckCoverage"
import { blendHistoricalMix, predictOrder } from "./boardOrderPrediction"
import StockDistributionChart from "./stockDistributionChart"
import { DeckConfig, formatLength, StockItem, StockOrder } from "./types"
import styles from "./calculateQuantityModal.module.scss"

type CalcConfig = Pick<
  DeckConfig,
  "points" | "sideA" | "sideB" | "width" | "boardWidth" | "boardGap" | "boardDirection" | "edgeLabels" | "edgeExtraBoards"
>

/** "Shape first, then calculate quantity order" — deckForm.tsx's own
 * words for the workflow this exists for. Computes how much decking the
 * current shape needs (deckCoverage.ts) plus whatever perimeter/dressed-
 * edge extras are set here, predicts the pack mix a supplier order of
 * that size would likely contain (boardOrderPrediction.ts, learned from
 * the board-orders page's dataset), and offers to seed the deck's own
 * board stock with the result — you adjust it once you know what you
 * actually received, same as any other stock edit in this app. The
 * edge-extras setting lives on the deck itself (edgeExtraBoards) so it's
 * remembered next time you reopen this to recalculate; the predicted
 * stock is only ever applied when you explicitly ask for it. */
const CalculateQuantityModal: React.FC<{
  config: CalcConfig
  isActive: boolean
  onClose: () => void
  onEdgeExtraBoardsChange: (next: Record<string, number>) => void
  onApplyStock: (stock: StockItem[]) => void
}> = ({ config, isActive, onClose, onEdgeExtraBoardsChange, onApplyStock }) => {
  const [orders, setOrders] = useState<StockOrder[]>([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToStockOrders((data) => {
      setOrders(data)
      setOrdersLoaded(true)
    })
    return () => unsubscribe()
  }, [])

  const isPolygon = Boolean(config.points && config.points.length >= 3)
  const edges: { key: string; label: string }[] = isPolygon
    ? config.points!.map((_, i) => ({ key: String(i), label: `Side ${i + 1}` }))
    : [
        { key: "sideA", label: config.edgeLabels.sideA },
        { key: "sideB", label: config.edgeLabels.sideB },
        { key: "width", label: config.edgeLabels.width },
        { key: "rake", label: config.edgeLabels.rake },
      ]

  const fieldMm = computeFieldCoverageLinealMm(config)
  const edgeExtraMm = computeEdgeExtraLinealMm(config)
  const totalMm = fieldMm + edgeExtraMm
  const blend = blendHistoricalMix(orders)
  const predicted = predictOrder(totalMm, blend)

  const setEdgeExtra = (key: string, count: number) => {
    const next = { ...config.edgeExtraBoards }
    if (count > 0) next[key] = count
    else delete next[key]
    onEdgeExtraBoardsChange(next)
  }

  return (
    <Modal isActive={isActive} closeModal={onClose}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <span>Calculate quantity order</span>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <strong>{formatLength(fieldMm)}</strong>
            <span>field boards</span>
          </div>
          <div className={styles.stat}>
            <strong>{formatLength(edgeExtraMm)}</strong>
            <span>edge extras</span>
          </div>
          <div className={styles.stat}>
            <strong>{formatLength(totalMm)}</strong>
            <span>total needed</span>
          </div>
        </div>

        <h3>Perimeter / dressed edges</h3>
        <p className={styles.hint}>
          Extra board rows along an edge, on top of the field boards — 1 for a plain perimeter
          frame, 2 or 3 for a dressed/skirted edge. 0 for none.
        </p>
        <div className={styles.edgeList}>
          {edges.map((edge) => (
            <label key={edge.key} className={styles.edgeRow}>
              <span>{edge.label}</span>
              <input
                type="number"
                min={0}
                max={10}
                value={config.edgeExtraBoards[edge.key] ?? 0}
                onChange={(e) => setEdgeExtra(edge.key, Math.max(0, Math.round(Number(e.target.value) || 0)))}
              />
            </label>
          ))}
        </div>

        <h3>Predicted pack mix</h3>
        {!ordersLoaded ? (
          <p className={styles.hint}>Loading order data…</p>
        ) : orders.length === 0 ? (
          <p className={styles.hint}>
            No order data yet — <Link href="/decking/board-orders">add an observation</Link> first
            (an already-measured deck works well) so there&apos;s something to predict from.
          </p>
        ) : predicted.length === 0 ? (
          <p className={styles.hint}>Nothing to predict yet — this shape doesn&apos;t need any board.</p>
        ) : (
          <>
            <StockDistributionChart stock={predicted} />
            <Button size="medium" onClick={() => onApplyStock(predicted)}>
              Use this as my board stock
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

export default CalculateQuantityModal

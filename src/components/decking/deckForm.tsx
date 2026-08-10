"use client"

import { useState } from "react"
import Button from "@/components/button/button"
import { BoardDirection, DeckConfig, StockItem } from "./types"
import styles from "./deckForm.module.scss"

type StockRow = { key: number; lengthText: string; quantity: number }

type FormState = Omit<DeckConfig, "id" | "updatedAt" | "stock"> & {
  stockRows: StockRow[]
}

let stockRowKeySeq = 0
const nextKey = () => stockRowKeySeq++

const toStockRows = (stock: StockItem[]): StockRow[] =>
  stock.length
    ? stock.map((s) => ({ key: nextKey(), lengthText: (s.length / 1000).toString(), quantity: s.quantity }))
    : [{ key: nextKey(), lengthText: "", quantity: 1 }]

const toFormState = (deck: Omit<DeckConfig, "id" | "updatedAt">): FormState => ({
  ...deck,
  stockRows: toStockRows(deck.stock),
})

const DeckForm: React.FC<{
  initial: Omit<DeckConfig, "id" | "updatedAt">
  onSave: (deck: Omit<DeckConfig, "id" | "updatedAt">) => void
  onCancel?: () => void
  saveLabel?: string
}> = ({ initial, onSave, onCancel, saveLabel = "Save" }) => {
  const [state, setState] = useState<FormState>(toFormState(initial))

  const num = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setState((s) => ({ ...s, [key]: Number(e.target.value) || 0 }))

  const updateRow = (key: number, patch: Partial<StockRow>) =>
    setState((s) => ({ ...s, stockRows: s.stockRows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))

  const addRow = () => setState((s) => ({ ...s, stockRows: [...s.stockRows, { key: nextKey(), lengthText: "", quantity: 1 }] }))

  const removeRow = (key: number) =>
    setState((s) => ({ ...s, stockRows: s.stockRows.filter((r) => r.key !== key) }))

  const sortRows = () =>
    setState((s) => ({
      ...s,
      stockRows: [...s.stockRows].sort((a, b) => {
        const la = parseFloat(a.lengthText)
        const lb = parseFloat(b.lengthText)
        if (isNaN(la) && isNaN(lb)) return 0
        if (isNaN(la)) return 1 // blanks sort to the end
        if (isNaN(lb)) return -1
        return la - lb
      }),
    }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const stock: StockItem[] = state.stockRows
      .map((r) => ({ length: Math.round(parseFloat(r.lengthText) * 1000), quantity: Math.max(0, Math.round(r.quantity)) }))
      .filter((s) => !isNaN(s.length) && s.length > 0 && s.quantity > 0)
      .sort((a, b) => a.length - b.length)

    onSave({
      name: state.name,
      width: state.width,
      sideA: state.sideA,
      sideB: state.sideB,
      joistSpacing: state.joistSpacing,
      boardWidth: state.boardWidth,
      boardGap: state.boardGap,
      minStagger: state.minStagger,
      minEdgeJoists: state.minEdgeJoists,
      boardDirection: state.boardDirection,
      skeletonInterval: state.skeletonInterval,
      layoutSeed: state.layoutSeed,
      completedSegmentIds: state.completedSegmentIds,
      lockedRows: state.lockedRows,
      cutLog: state.cutLog,
      activeCutSegmentId: state.activeCutSegmentId,
      activeCutAccumulatedMs: state.activeCutAccumulatedMs,
      stock,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="name">Deck name</label>
        <input
          id="name"
          type="text"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="width">Width (mm)</label>
        <span className={styles.hint}>Across the deck — perpendicular to the boards</span>
        <input id="width" type="number" min={100} value={state.width} onChange={num("width")} required />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="sideA">Square-end length (mm)</label>
          <input id="sideA" type="number" min={100} value={state.sideA} onChange={num("sideA")} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="sideB">Raked-end length (mm)</label>
          <input id="sideB" type="number" min={100} value={state.sideB} onChange={num("sideB")} required />
        </div>
      </div>

      <div className={styles.field}>
        <label>Board direction</label>
        <span className={styles.hint}>
          Which way the boards run relative to the raked end
        </span>
        <div className={styles.segmented}>
          <button
            type="button"
            className={state.boardDirection !== "alongRake" ? styles.active : ""}
            onClick={() => setState((s) => ({ ...s, boardDirection: "intoRake" as BoardDirection }))}
          >
            Into the rake
          </button>
          <button
            type="button"
            className={state.boardDirection === "alongRake" ? styles.active : ""}
            onClick={() => setState((s) => ({ ...s, boardDirection: "alongRake" as BoardDirection }))}
          >
            Along the rake
          </button>
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="boardWidth">Board width (mm)</label>
          <input id="boardWidth" type="number" min={10} value={state.boardWidth} onChange={num("boardWidth")} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="boardGap">Board gap (mm)</label>
          <input id="boardGap" type="number" min={0} value={state.boardGap} onChange={num("boardGap")} required />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="joistSpacing">Joist centres (mm)</label>
          <input
            id="joistSpacing"
            type="number"
            min={50}
            value={state.joistSpacing}
            onChange={num("joistSpacing")}
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="minStagger">Min. join stagger (mm)</label>
          <input
            id="minStagger"
            type="number"
            min={0}
            value={state.minStagger}
            onChange={num("minStagger")}
            required
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="minEdgeJoists">Min. joist bays from row edge</label>
        <span className={styles.hint}>No join is allowed within this many joist bays of either end of a row</span>
        <input
          id="minEdgeJoists"
          type="number"
          min={0}
          value={state.minEdgeJoists}
          onChange={num("minEdgeJoists")}
          required
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="skeletonInterval">Skeleton row interval</label>
        <span className={styles.hint}>
          Every Nth row is laid first from your longest stock, staggered against the previous
          skeleton row; the rows in between are filled in afterwards from a randomised mix
        </span>
        <input
          id="skeletonInterval"
          type="number"
          min={2}
          value={state.skeletonInterval}
          onChange={num("skeletonInterval")}
          required
        />
      </div>

      <div className={styles.field}>
        <label>Board stock on hand</label>
        <span className={styles.hint}>Length (m) and how many of that length you have</span>
        <div className={styles.stockList}>
          {state.stockRows.map((row) => (
            <div key={row.key} className={styles.stockRow}>
              <input
                type="number"
                step="0.1"
                min={0}
                placeholder="Length (m)"
                value={row.lengthText}
                onChange={(e) => updateRow(row.key, { lengthText: e.target.value })}
                onBlur={sortRows}
                aria-label="Board length in metres"
              />
              <span className={styles.stockX}>×</span>
              <input
                type="number"
                min={0}
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) || 0 })}
                aria-label="Quantity"
              />
              <button
                type="button"
                className={styles.removeRow}
                onClick={() => removeRow(row.key)}
                aria-label="Remove this length"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className={styles.stockActions}>
          <Button size="small" variant="secondary" onClick={addRow}>
            Add length
          </Button>
          <Button size="small" variant="secondary" onClick={sortRows}>
            Sort by size
          </Button>
        </div>
      </div>

      <div className={styles.actions}>
        <Button type="submit" size="large" onClick={() => {}}>
          {saveLabel}
        </Button>
        {onCancel && (
          <Button size="medium" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

export default DeckForm

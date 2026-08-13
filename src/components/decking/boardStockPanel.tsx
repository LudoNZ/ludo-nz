"use client"

import { useState } from "react"
import Button from "@/components/button/button"
import { StockItem } from "./types"
import styles from "./boardStockPanel.module.scss"

type StockRow = { key: number; lengthText: string; quantity: number }

let stockRowKeySeq = 0
const nextKey = () => stockRowKeySeq++

const toStockRows = (stock: StockItem[]): StockRow[] =>
  stock.length
    ? stock.map((s) => ({ key: nextKey(), lengthText: (s.length / 1000).toString(), quantity: s.quantity }))
    : [{ key: nextKey(), lengthText: "", quantity: 1 }]

const toStockItems = (rows: StockRow[]): StockItem[] =>
  rows
    .map((r) => ({ length: Math.round(parseFloat(r.lengthText) * 1000), quantity: Math.max(0, Math.round(r.quantity)) }))
    .filter((s) => !isNaN(s.length) && s.length > 0 && s.quantity > 0)
    .sort((a, b) => a.length - b.length)

const formatLineal = (mm: number): string => {
  const m = mm / 1000
  return `${m.toFixed(m % 1 === 0 ? 0 : 1)}m`
}

/** Standalone, always-editable inventory of board lengths on hand — split
 * out of the main deck-edit form (deckForm.tsx) so it's adjustable any
 * time you're looking at a deck, not just while also mid-edit on its
 * shape/joist settings/etc. Autosaves each change straight back to the
 * deck: a length/quantity edit commits on blur (so you can freely retype
 * a value without a save firing on every keystroke — same reasoning as
 * DraftNumberInput elsewhere in this app), while add/remove/sort commit
 * immediately, since those are already a single deliberate action. */
const BoardStockPanel: React.FC<{
  stock: StockItem[]
  onChange: (stock: StockItem[]) => void
}> = ({ stock, onChange }) => {
  const [rows, setRows] = useState<StockRow[]>(() => toStockRows(stock))

  const commit = (nextRows: StockRow[]) => {
    setRows(nextRows)
    onChange(toStockItems(nextRows))
  }

  const editRow = (key: number, patch: Partial<StockRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const commitRows = () => commit(rows)

  const addRow = () => commit([...rows, { key: nextKey(), lengthText: "", quantity: 1 }])

  const removeRow = (key: number) => commit(rows.filter((r) => r.key !== key))

  const sortRows = () =>
    commit(
      [...rows].sort((a, b) => {
        const la = parseFloat(a.lengthText)
        const lb = parseFloat(b.lengthText)
        if (isNaN(la) && isNaN(lb)) return 0
        if (isNaN(la)) return 1 // blanks sort to the end
        if (isNaN(lb)) return -1
        return la - lb
      })
    )

  // live totals off whatever's currently in the rows (including an
  // in-progress, not-yet-committed edit) so the summary updates as you type
  const totalBoards = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0)
  const totalLinealMm = rows.reduce((sum, r) => {
    const lengthM = parseFloat(r.lengthText)
    const qty = Number(r.quantity) || 0
    return sum + (isNaN(lengthM) ? 0 : lengthM * 1000 * qty)
  }, 0)

  return (
    <div className={styles.panel}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <strong>{totalBoards}</strong>
          <span>boards on hand</span>
        </div>
        <div className={styles.stat}>
          <strong>{formatLineal(totalLinealMm)}</strong>
          <span>total lineal</span>
        </div>
      </div>

      <div className={styles.stockList}>
        {rows.map((row) => (
          <div key={row.key} className={styles.stockRow}>
            <input
              type="number"
              step="0.1"
              min={0}
              placeholder="Length (m)"
              value={row.lengthText}
              onChange={(e) => editRow(row.key, { lengthText: e.target.value })}
              onBlur={commitRows}
              aria-label="Board length in metres"
            />
            <span className={styles.stockX}>×</span>
            <input
              type="number"
              min={0}
              value={row.quantity}
              onChange={(e) => editRow(row.key, { quantity: Number(e.target.value) || 0 })}
              onBlur={commitRows}
              aria-label="Quantity"
            />
            <button type="button" className={styles.removeRow} onClick={() => removeRow(row.key)} aria-label="Remove this length">
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
  )
}

export default BoardStockPanel
